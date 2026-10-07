import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Redirect,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { AccessRole, MembershipRole } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentActor } from '../auth/decorators/current-actor.decorator';
import { CurrentAuthentication } from '../auth/decorators/current-authentication.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationActor } from '../auth/interfaces/authorization-actor.interface';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { AttendanceEntryService } from './attendance-entry.service';
import { AttendanceService } from './attendance.service';
import { AttendanceHistoryQueryDto } from './dto/attendance-history-query.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { MonthlyAttendanceExportQueryDto } from './dto/monthly-attendance-export-query.dto';
import { MonthlyAttendanceCsvExporterService } from './exports/monthly-attendance-csv-exporter.service';
import { MonthlyAttendanceExportService } from './exports/monthly-attendance-export.service';
import { MonthlyAttendancePdfExporterService } from './exports/monthly-attendance-pdf-exporter.service';
import { SelfCheckInDto } from './dto/self-check-in.dto';
import { SelfCheckOutDto } from './dto/self-check-out.dto';
import { ReconciliationDecisionDto, ReconciliationQueryDto } from './dto/reconciliation.dto';
import { OfflineAttendanceSyncDto } from './dto/offline-attendance-sync.dto';
import { OfflineAttendanceContextService } from './offline-attendance-context.service';

type ResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly attendanceEntryService: AttendanceEntryService,
    private readonly attendanceService: AttendanceService,
    private readonly monthlyAttendanceExportService: MonthlyAttendanceExportService,
    private readonly monthlyAttendanceCsvExporter: MonthlyAttendanceCsvExporterService,
    private readonly monthlyAttendancePdfExporter: MonthlyAttendancePdfExporterService,
    private readonly auditLogService: AuditLogService,
    private readonly offlineContext: OfflineAttendanceContextService,
  ) {}

  @Public()
  @Get('entry')
  @Redirect(undefined, 302)
  getFixedEntryPoint() {
    return {
      url: this.attendanceEntryService.getFixedEntryUrl(),
    };
  }

  @Roles(AccessRole.ADMIN, MembershipRole.ADMIN)
  @Get('summary')
  getTodaySummary(
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.attendanceService.getTodaySummary(new Date(), authentication);
  }

  @Roles(AccessRole.ADMIN, MembershipRole.ADMIN)
  @Get('history')
  getMonthlyHistory(
    @Query() query: AttendanceHistoryQueryDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.attendanceService.getAttendanceHistory(query, authentication);
  }

  @Roles(MembershipRole.ADMIN)
  @Get('offline-reconciliation')
  listOfflineReconciliation(@CurrentAuthentication() authentication: AuthenticationContext, @Query() query: ReconciliationQueryDto) {
    return this.attendanceService.listOfflineReconciliations(authentication, query);
  }

  @Roles(MembershipRole.ADMIN)
  @Get('offline-reconciliation/:id')
  getOfflineReconciliation(@Param('id', ParseUUIDPipe) id: string, @CurrentAuthentication() authentication: AuthenticationContext) {
    return this.attendanceService.getOfflineReconciliation(id, authentication);
  }

  @Roles(MembershipRole.ADMIN)
  @Post('offline-reconciliation/:id/approve')
  approveOfflineReconciliation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReconciliationDecisionDto, @CurrentAuthentication() authentication: AuthenticationContext) {
    return this.attendanceService.decideOfflineReconciliation(id, 'APPROVE', dto.reason, authentication);
  }

  @Roles(MembershipRole.ADMIN)
  @Post('offline-reconciliation/:id/reject')
  rejectOfflineReconciliation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReconciliationDecisionDto, @CurrentAuthentication() authentication: AuthenticationContext) {
    return this.attendanceService.decideOfflineReconciliation(id, 'REJECT', dto.reason, authentication);
  }

  @Roles(MembershipRole.ADMIN)
  @Get('offline-reconciliation/:id/selfie')
  async getOfflineReconciliationSelfie(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Res({ passthrough: true }) response: ResponseWithHeaders,
  ) {
    const photo = await this.attendanceService.getOfflineReconciliationSelfie(id, authentication);
    response.setHeader('Content-Type', photo.contentType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(photo.content);
  }

  @Roles(AccessRole.EMPLOYEE)
  @Get('me/offline-reconciliation/:clientRequestId')
  getMyOfflineReconciliationOutcome(
    @Param('clientRequestId', ParseUUIDPipe) clientRequestId: string,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    if (!authentication.employeeId) throw new NotFoundException('Offline reconciliation outcome not found.');
    return this.attendanceService.getEmployeeOfflineReconciliationOutcome(
      clientRequestId, authentication.employeeId, authentication,
    );
  }

  @Roles(AccessRole.ADMIN, AccessRole.EMPLOYEE)
  @Get('history/:attendanceId/selfie')
  async getVerificationPhoto(
    @Param('attendanceId') attendanceId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Res({ passthrough: true }) response: ResponseWithHeaders,
  ) {
    const photo = await this.attendanceService.getAuthorizedVerificationPhoto(
      attendanceId,
      user,
      authentication,
    );
    response.setHeader('Content-Type', photo.contentType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(photo.content);
  }

  @Roles(AccessRole.ADMIN)
  @Get('exports/monthly')
  async exportMonthlyAttendance(
    @CurrentActor() actor: AuthorizationActor,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Query() query: MonthlyAttendanceExportQueryDto,
    @Res({ passthrough: true }) response: ResponseWithHeaders,
  ) {
    const report = await this.monthlyAttendanceExportService.buildMonthlyReport(
      query,
      authentication,
    );
    const file =
      query.format === 'pdf'
        ? await this.monthlyAttendancePdfExporter.export(report)
        : this.monthlyAttendanceCsvExporter.export(report);

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    response.setHeader('Cache-Control', 'no-store');

    this.auditLogService.logAdminAction({
      actor,
      action: 'attendance.monthly_export',
      resource: 'attendance_export',
      metadata: {
        mode: query.mode ?? 'monthly',
        month: query.month,
        year: query.year,
        startDate: query.startDate,
        endDate: query.endDate,
        format: query.format ?? 'csv',
        employeeId: query.employeeId,
      },
    });

    return file.content instanceof Buffer
      ? new StreamableFile(file.content)
      : file.content;
  }

  @Roles(AccessRole.EMPLOYEE)
  @Get('me/today')
  getMyTodayAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.attendanceService.getEmployeeTodayAttendance(
      user.id,
      new Date(),
      authentication,
    );
  }

  @Roles(AccessRole.EMPLOYEE)
  @Get('me/security-policy')
  getMySecurityPolicy(
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.attendanceService.getCheckInSecurityPolicy(authentication);
  }

  @Roles(AccessRole.EMPLOYEE)
  @Get('me/history')
  getMyMonthlyHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceHistoryQueryDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.attendanceService.getEmployeeAttendanceHistory(
      user.id,
      query,
      authentication,
    );
  }

  @Roles(AccessRole.ADMIN, MembershipRole.ADMIN)
  @Post('check-in')
  async checkIn(
    @CurrentActor() actor: AuthorizationActor,
    @Body() checkInDto: CheckInDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    const attendance = await this.attendanceService.checkIn(
      checkInDto,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor,
      action: 'attendance.admin_check_in',
      resource: 'attendance',
      resourceId: attendance.id,
      metadata: {
        employeeId: checkInDto.employeeId,
        siteId: checkInDto.siteId,
        occurredAt: checkInDto.occurredAt,
      },
    });

    return attendance;
  }

  @Roles(AccessRole.ADMIN, MembershipRole.ADMIN)
  @Post('check-out')
  async checkOut(
    @CurrentActor() actor: AuthorizationActor,
    @Body() checkOutDto: CheckOutDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    const attendance = await this.attendanceService.checkOut(
      checkOutDto,
      authentication,
    );

    this.auditLogService.logAdminAction({
      actor,
      action: 'attendance.admin_check_out',
      resource: 'attendance',
      resourceId: attendance.id,
      metadata: {
        employeeId: checkOutDto.employeeId,
        siteId: checkOutDto.siteId,
        occurredAt: checkOutDto.occurredAt,
      },
    });

    return attendance;
  }

  @Roles(AccessRole.EMPLOYEE)
  @Get('me/offline-context')
  issueMyOfflineAttendanceContext(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Query('siteId') siteId?: string,
  ) {
    return this.offlineContext.issue(user.id, authentication, siteId);
  }

  @Roles(AccessRole.EMPLOYEE)
  @Post('me/sync')
  synchronizeOfflineAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OfflineAttendanceSyncDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.attendanceService.synchronizeOfflineAttendance(
      user.id,
      dto,
      authentication,
    );
  }

  @Roles(AccessRole.EMPLOYEE)
  @Post('me/check-in')
  checkInForCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() selfCheckInDto: SelfCheckInDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.attendanceService.checkInForEmployee(
      user.id,
      selfCheckInDto,
      authentication,
    );
  }

  @Roles(AccessRole.EMPLOYEE)
  @Post('me/check-out')
  checkOutForCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() selfCheckOutDto: SelfCheckOutDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    return this.attendanceService.checkOutForEmployee(
      user.id,
      selfCheckOutDto,
      authentication,
    );
  }
}

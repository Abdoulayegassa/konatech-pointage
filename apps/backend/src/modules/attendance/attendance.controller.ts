import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Redirect,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { AccessRole } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
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
  ) {}

  @Public()
  @Get('entry')
  @Redirect(undefined, 302)
  getFixedEntryPoint() {
    return {
      url: this.attendanceEntryService.getFixedEntryUrl(),
    };
  }

  @Roles(AccessRole.ADMIN)
  @Get('summary')
  getTodaySummary() {
    return this.attendanceService.getTodaySummary();
  }

  @Roles(AccessRole.ADMIN)
  @Get('history')
  getMonthlyHistory(@Query() query: AttendanceHistoryQueryDto) {
    return this.attendanceService.getMonthlyHistory(query.month);
  }

  @Roles(AccessRole.ADMIN)
  @Get('exports/monthly')
  async exportMonthlyAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MonthlyAttendanceExportQueryDto,
    @Res({ passthrough: true }) response: ResponseWithHeaders,
  ) {
    const report =
      await this.monthlyAttendanceExportService.buildMonthlyReport(query);
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
      actor: user,
      action: 'attendance.monthly_export',
      resource: 'attendance_export',
      metadata: {
        month: query.month,
        year: query.year,
        format: query.format ?? 'csv',
        employeeId: query.employeeId,
        fileName: file.fileName,
      },
    });

    return file.content instanceof Buffer
      ? new StreamableFile(file.content)
      : file.content;
  }

  @Roles(AccessRole.EMPLOYEE)
  @Get('me/today')
  getMyTodayAttendance(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getEmployeeTodayAttendance(user.id);
  }

  @Roles(AccessRole.EMPLOYEE)
  @Get('me/security-policy')
  getMySecurityPolicy() {
    return this.attendanceService.getCheckInSecurityPolicy();
  }

  @Roles(AccessRole.EMPLOYEE)
  @Get('me/history')
  getMyMonthlyHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AttendanceHistoryQueryDto,
  ) {
    return this.attendanceService.getEmployeeMonthlyHistory(
      user.id,
      query.month,
    );
  }

  @Roles(AccessRole.ADMIN)
  @Post('check-in')
  async checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Body() checkInDto: CheckInDto,
  ) {
    const attendance = await this.attendanceService.checkIn(checkInDto);

    this.auditLogService.logAdminAction({
      actor: user,
      action: 'attendance.admin_check_in',
      resource: 'attendance',
      resourceId: attendance.id,
      metadata: {
        employeeId: checkInDto.employeeId,
        occurredAt: checkInDto.occurredAt,
      },
    });

    return attendance;
  }

  @Roles(AccessRole.ADMIN)
  @Post('check-out')
  async checkOut(
    @CurrentUser() user: AuthenticatedUser,
    @Body() checkOutDto: CheckOutDto,
  ) {
    const attendance = await this.attendanceService.checkOut(checkOutDto);

    this.auditLogService.logAdminAction({
      actor: user,
      action: 'attendance.admin_check_out',
      resource: 'attendance',
      resourceId: attendance.id,
      metadata: {
        employeeId: checkOutDto.employeeId,
        occurredAt: checkOutDto.occurredAt,
      },
    });

    return attendance;
  }

  @Roles(AccessRole.EMPLOYEE)
  @Post('me/check-in')
  checkInForCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() selfCheckInDto: SelfCheckInDto,
  ) {
    return this.attendanceService.checkInForEmployee(user.id, selfCheckInDto);
  }

  @Roles(AccessRole.EMPLOYEE)
  @Post('me/check-out')
  checkOutForCurrentUser(
    @CurrentUser() user: AuthenticatedUser,
    @Body() selfCheckOutDto: SelfCheckOutDto,
  ) {
    return this.attendanceService.checkOutForEmployee(user.id, selfCheckOutDto);
  }
}

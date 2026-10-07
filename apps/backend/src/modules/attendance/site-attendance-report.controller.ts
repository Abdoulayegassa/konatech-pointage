import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { CurrentActor } from '../auth/decorators/current-actor.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentAuthentication } from '../auth/decorators/current-authentication.decorator';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { AuthorizationActor } from '../auth/interfaces/authorization-actor.interface';
import { AttendanceSitesService } from '../attendance-sites/attendance-sites.service';
import { MonthlyAttendanceExportQueryDto } from './dto/monthly-attendance-export-query.dto';
import { MonthlyAttendanceExportService } from './exports/monthly-attendance-export.service';
import { MonthlyAttendanceCsvExporterService } from './exports/monthly-attendance-csv-exporter.service';
import { MonthlyAttendancePdfExporterService } from './exports/monthly-attendance-pdf-exporter.service';

type ResponseWithHeaders = {
  setHeader: (name: string, value: string) => void;
};

@Roles(MembershipRole.ADMIN)
@Controller('attendance-sites/:siteId/reports')
export class SiteAttendanceReportController {
  constructor(
    private readonly sites: AttendanceSitesService,
    private readonly reports: MonthlyAttendanceExportService,
    private readonly csv: MonthlyAttendanceCsvExporterService,
    private readonly pdf: MonthlyAttendancePdfExporterService,
    private readonly audit: AuditLogService,
  ) {}

  @Get()
  async getReport(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Query() query: MonthlyAttendanceExportQueryDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
  ) {
    const site = await this.sites.resolveAdminSite(siteId, authentication);
    return this.reports.buildMonthlyReport(query, authentication, {
      id: site.id,
      name: site.name,
    });
  }

  @Get('export')
  async exportReport(
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentActor() actor: AuthorizationActor,
    @Query() query: MonthlyAttendanceExportQueryDto,
    @CurrentAuthentication() authentication: AuthenticationContext,
    @Res({ passthrough: true }) response: ResponseWithHeaders,
  ) {
    const site = await this.sites.resolveAdminSite(siteId, authentication);
    const report = await this.reports.buildMonthlyReport(query, authentication, {
      id: site.id,
      name: site.name,
    });
    const file = query.format === 'pdf'
      ? await this.pdf.export(report)
      : this.csv.export(report);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    response.setHeader('Cache-Control', 'no-store');
    this.audit.logAdminAction({
      actor,
      action: 'attendance.site_export',
      resource: 'attendance_export',
      resourceId: site.id,
      metadata: {
        scope: 'SITE',
        siteId: site.id,
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
}

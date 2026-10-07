import { Module } from '@nestjs/common';
import { AppClockService } from '../../common/time/app-clock.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceEntryService } from './attendance-entry.service';
import { AttendanceMonthlyMetricsService } from './attendance-monthly-metrics.service';
import { AttendancePhotoStorageService } from './attendance-photo-storage.service';
import { AttendanceSecurityPolicyService } from './attendance-security-policy.service';
import { AttendanceSecurityService } from './attendance-security.service';
import { SelfieRetentionService } from './selfie-retention.service';
import { AttendanceService } from './attendance.service';
import { MonthlyAttendanceCsvExporterService } from './exports/monthly-attendance-csv-exporter.service';
import { MonthlyAttendanceExportService } from './exports/monthly-attendance-export.service';
import { MonthlyAttendancePuppeteerPdfRendererService } from './exports/monthly-attendance-puppeteer-pdf-renderer.service';
import { MonthlyAttendancePdfExporterService } from './exports/monthly-attendance-pdf-exporter.service';
import { SanctionsModule } from '../sanctions/sanctions.module';
import { CalendarModule } from '../calendar/calendar.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AttendanceSitesModule } from '../attendance-sites/attendance-sites.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { SiteAttendanceReportController } from './site-attendance-report.controller';
import { OfflineAttendanceContextService } from './offline-attendance-context.service';

@Module({
  imports: [
    CalendarModule,
    SanctionsModule,
    OrganizationsModule,
    SubscriptionsModule,
    AttendanceSitesModule,
    SchedulesModule,
  ],
  controllers: [AttendanceController, SiteAttendanceReportController],
  providers: [
    AttendanceEntryService,
    AppClockService,
    AttendancePhotoStorageService,
    AttendanceSecurityPolicyService,
    AttendanceSecurityService,
    SelfieRetentionService,
    AttendanceService,
    OfflineAttendanceContextService,
    AttendanceMonthlyMetricsService,
    MonthlyAttendanceExportService,
    MonthlyAttendanceCsvExporterService,
    MonthlyAttendancePuppeteerPdfRendererService,
    MonthlyAttendancePdfExporterService,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}

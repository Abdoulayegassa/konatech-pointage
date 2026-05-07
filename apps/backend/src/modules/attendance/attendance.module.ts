import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceEntryService } from './attendance-entry.service';
import { AttendanceMonthlyMetricsService } from './attendance-monthly-metrics.service';
import { AttendancePhotoStorageService } from './attendance-photo-storage.service';
import { AttendanceSecurityPolicyService } from './attendance-security-policy.service';
import { AttendanceSecurityService } from './attendance-security.service';
import { AttendanceService } from './attendance.service';
import { MonthlyAttendanceCsvExporterService } from './exports/monthly-attendance-csv-exporter.service';
import { MonthlyAttendanceExportService } from './exports/monthly-attendance-export.service';
import { MonthlyAttendancePuppeteerPdfRendererService } from './exports/monthly-attendance-puppeteer-pdf-renderer.service';
import { MonthlyAttendancePdfExporterService } from './exports/monthly-attendance-pdf-exporter.service';

@Module({
  controllers: [AttendanceController],
  providers: [
    AttendanceEntryService,
    AttendancePhotoStorageService,
    AttendanceSecurityPolicyService,
    AttendanceSecurityService,
    AttendanceService,
    AttendanceMonthlyMetricsService,
    MonthlyAttendanceExportService,
    MonthlyAttendanceCsvExporterService,
    MonthlyAttendancePuppeteerPdfRendererService,
    MonthlyAttendancePdfExporterService,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}

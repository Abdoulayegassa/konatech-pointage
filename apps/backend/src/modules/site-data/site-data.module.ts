import { Module } from '@nestjs/common';
import { AttendanceSitesModule } from '../attendance-sites/attendance-sites.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { SiteDataController } from './site-data.controller';
import { SiteDataService } from './site-data.service';
import { CalendarModule } from '../calendar/calendar.module';
import { SanctionsModule } from '../sanctions/sanctions.module';

@Module({
  imports: [AttendanceSitesModule, AttendanceModule, SchedulesModule, CalendarModule, SanctionsModule],
  controllers: [SiteDataController],
  providers: [SiteDataService],
})
export class SiteDataModule {}

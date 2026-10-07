import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
  imports: [CalendarModule, SchedulesModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

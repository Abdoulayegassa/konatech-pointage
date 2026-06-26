import { Module } from '@nestjs/common';
import { CalendarModule } from '../calendar/calendar.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [CalendarModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

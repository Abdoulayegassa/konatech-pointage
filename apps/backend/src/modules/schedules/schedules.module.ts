import { Module } from '@nestjs/common';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { EffectiveScheduleResolver } from './effective-schedule.resolver';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [OrganizationsModule],
  controllers: [SchedulesController],
  providers: [SchedulesService, EffectiveScheduleResolver],
  exports: [EffectiveScheduleResolver, SchedulesService],
})
export class SchedulesModule {}

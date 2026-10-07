import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
  imports: [SubscriptionsModule, SchedulesModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
})
export class EmployeesModule {}

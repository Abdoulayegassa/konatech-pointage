import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AuditLogModule } from '../../common/audit/audit-log.module';
import { AttendanceSitesController } from './attendance-sites.controller';
import { AttendanceSitesService } from './attendance-sites.service';
@Module({
  imports: [SubscriptionsModule, AuditLogModule],
  controllers: [AttendanceSitesController],
  providers: [AttendanceSitesService],
  exports: [AttendanceSitesService],
})
export class AttendanceSitesModule {}

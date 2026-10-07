import { Module } from '@nestjs/common';
import { AuditLogModule } from '../../common/audit/audit-log.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { AttendanceSettingsService } from '../attendance/attendance-settings.service';
import { AttendanceSecurityPolicyService } from '../attendance/attendance-security-policy.service';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [AuditLogModule, SubscriptionsModule],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    AttendanceSettingsService,
    AttendanceSecurityPolicyService,
  ],
  exports: [OrganizationsService, AttendanceSettingsService],
})
export class OrganizationsModule {}

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditLogModule } from '../../common/audit/audit-log.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { EntitlementsService } from './entitlements.service';
import { SubscriptionAccessGuard } from './subscription-access.guard';

@Module({
  imports: [AuditLogModule],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    EntitlementsService,
    { provide: APP_GUARD, useClass: SubscriptionAccessGuard },
  ],
  exports: [EntitlementsService, SubscriptionsService],
})
export class SubscriptionsModule {}

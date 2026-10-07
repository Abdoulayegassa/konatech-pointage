import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { MembershipRole } from '@prisma/client';
import { CurrentAuthentication } from '../auth/decorators/current-authentication.decorator';
import { CurrentPlatformAdmin } from '../auth/decorators/current-platform-admin.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { requireOrganizationContext } from '../auth/interfaces/organization-context.helpers';
import { ActivateSubscriptionDto } from './dto/activate-subscription.dto';
import { PlatformOrganizationsQueryDto } from './dto/platform-organizations-query.dto';
import { ScheduleDowngradeDto } from './dto/schedule-downgrade.dto';
import { SuspendSubscriptionDto } from './dto/suspend-subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller()
export class SubscriptionsController {
  constructor(
    private readonly subscriptions: SubscriptionsService,
    private readonly audit: AuditLogService,
  ) {}

  @Get('organizations/current/subscription')
  @Roles(MembershipRole.ADMIN)
  getCurrent(@CurrentAuthentication() authentication: AuthenticationContext) {
    return this.subscriptions.getTenantSubscription(
      requireOrganizationContext(authentication).organizationId,
    );
  }

  @UseGuards(PlatformAdminGuard)
  @Get('platform/plan-entitlements')
  getPlatformPlanEntitlements() {
    return this.subscriptions.getPlatformPlanDefinitions();
  }

  @UseGuards(PlatformAdminGuard)
  @Get('platform/organizations')
  listPlatformOrganizations(@Query() query: PlatformOrganizationsQueryDto) {
    return this.subscriptions.listPlatformOrganizations(query);
  }

  @UseGuards(PlatformAdminGuard)
  @Get('platform/dashboard')
  getPlatformDashboard() {
    return this.subscriptions.getPlatformDashboard();
  }

  @UseGuards(PlatformAdminGuard)
  @Get('platform/subscriptions/:organizationId')
  getPlatform(@Param('organizationId', ParseUUIDPipe) organizationId: string) {
    return this.subscriptions.getPlatformSubscription(organizationId);
  }

  @UseGuards(PlatformAdminGuard)
  @Post('platform/subscriptions/:organizationId/activate')
  async activate(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: ActivateSubscriptionDto,
    @CurrentPlatformAdmin() actorUserId: string,
  ) {
    const subscription = await this.subscriptions.activate({
      organizationId,
      plan: dto.plan,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: new Date(dto.endsAt),
      actorUserId,
      operationId: dto.operationId,
      externalPaymentReference: dto.externalPaymentReference,
      internalNote: dto.internalNote,
      platformAudit: { actorUserId },
    });
    this.audit.logAdminAction({
      actor: {
        actorType: 'USER',
        actorId: actorUserId,
        organizationId: null,
        role: 'PLATFORM_ADMIN',
        employeeId: null,
      } as never,
      action: 'subscription.activate',
      resource: 'organization_subscription',
      resourceId: organizationId,
      metadata: { plan: dto.plan },
    });
    return subscription;
  }

  @UseGuards(PlatformAdminGuard)
  @Post('platform/subscriptions/:organizationId/suspend')
  async suspend(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: SuspendSubscriptionDto,
    @CurrentPlatformAdmin() actorUserId: string,
  ) {
    const subscription = await this.subscriptions.suspend(
      organizationId,
      actorUserId,
      dto?.operationId,
      { actorUserId },
    );
    this.audit.logAdminAction({
      actor: {
        actorType: 'USER',
        actorId: actorUserId,
        organizationId: null,
        role: 'PLATFORM_ADMIN',
        employeeId: null,
      } as never,
      action: 'subscription.suspend',
      resource: 'organization_subscription',
      resourceId: organizationId,
    });
    return subscription;
  }

  @UseGuards(PlatformAdminGuard)
  @Patch('platform/subscriptions/:organizationId/downgrade')
  async downgrade(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: ScheduleDowngradeDto,
    @CurrentPlatformAdmin() actorUserId: string,
  ) {
    const subscription = await this.subscriptions.scheduleDowngrade({
      organizationId,
      plan: dto.plan,
      actorUserId,
      operationId: dto.operationId,
      platformAudit: { actorUserId },
    });
    this.audit.logAdminAction({
      actor: {
        actorType: 'USER',
        actorId: actorUserId,
        organizationId: null,
        role: 'PLATFORM_ADMIN',
        employeeId: null,
      } as never,
      action: 'subscription.downgrade.schedule',
      resource: 'organization_subscription',
      resourceId: organizationId,
      metadata: { plan: dto.plan },
    });
    return subscription;
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SubscriptionEventType,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { sanitizeAuditMetadata } from '../../common/security/sensitive-data.util';
import { EntitlementsService } from './entitlements.service';
import {
  operationMetadata,
  subscriptionEventId,
} from './subscription-operation.util';
import { PlatformOrganizationsQueryDto } from './dto/platform-organizations-query.dto';

const PLAN_RANK: Record<SubscriptionPlan, number> = {
  STARTER: 0,
  PRO: 1,
  BUSINESS: 2,
};

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  getTenantSubscription(organizationId: string) {
    return this.entitlements.getForOrganization(organizationId);
  }

  getPlatformPlanDefinitions() {
    return this.entitlements.getPlanDefinitions();
  }

  async getPlatformSubscription(organizationId: string) {
    await this.assertOrganization(organizationId);
    const current = await this.entitlements.getForOrganization(organizationId);
    const events = await this.prisma.subscriptionEvent.findMany({
      where: { subscriptionId: organizationId },
      orderBy: { occurredAt: 'desc' },
    });
    return { ...current, events };
  }

  async listPlatformOrganizations(query: PlatformOrganizationsQueryDto = {}) {
    const search = query.search?.trim();
    const organizations = await this.prisma.organization.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { slug: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
      },
    });
    const results = await Promise.all(
      organizations.map(async (organization) => ({
        organization,
        ...(await this.entitlements.getForOrganization(organization.id)),
        events: await this.prisma.subscriptionEvent.findMany({
          where: { subscriptionId: organization.id },
          orderBy: { occurredAt: 'desc' },
          take: 20,
          select: {
            type: true,
            occurredAt: true,
            previousPlan: true,
            nextPlan: true,
            previousStatus: true,
            nextStatus: true,
          },
        }),
      })),
    );
    return results.filter(
      (item) =>
        (!query.plan || item.subscription.plan === query.plan) &&
        (!query.status || item.subscription.status === query.status),
    );
  }

  async getPlatformDashboard() {
    const organizations = await this.listPlatformOrganizations();
    const byStatus = Object.fromEntries(
      Object.values(SubscriptionStatus).map((status) => [status, 0]),
    ) as Record<SubscriptionStatus, number>;
    const byPlan = Object.fromEntries(
      Object.values(SubscriptionPlan).map((plan) => [plan, 0]),
    ) as Record<SubscriptionPlan, number>;
    let activeEmployees = 0;
    let activeAttendanceSites = 0;

    for (const organization of organizations) {
      byStatus[organization.subscription.status] += 1;
      byPlan[organization.subscription.plan] += 1;
      activeEmployees += organization.usage.activeEmployees;
      activeAttendanceSites += organization.usage.activeAttendanceSites;
    }

    return {
      statistics: {
        totalOrganizations: organizations.length,
        byStatus,
        byPlan,
        usage: { activeEmployees, activeAttendanceSites },
      },
      organizations,
    };
  }

  async activate(input: {
    organizationId: string;
    plan: SubscriptionPlan;
    startsAt?: Date;
    endsAt: Date;
    actorUserId: string;
    operationId?: string;
    externalPaymentReference?: string;
    internalNote?: string;
    platformAudit?: { actorUserId: string };
  }) {
    await this.assertOrganization(input.organizationId);
    const now = new Date();
    if (input.startsAt && Number.isNaN(input.startsAt.getTime()))
      throw new BadRequestException('startsAt must be a valid date.');
    if (Number.isNaN(input.endsAt.getTime()))
      throw new BadRequestException('endsAt must be a valid date.');
    if (input.startsAt && input.startsAt > now)
      throw new BadRequestException('startsAt cannot be in the future.');
    if (input.startsAt && input.startsAt >= input.endsAt)
      throw new BadRequestException('startsAt must be before endsAt.');
    if (input.endsAt <= now)
      throw new BadRequestException('endsAt must be in the future.');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.organizationId}, 1))::text AS lock_result`,
      );
      const current = await tx.organizationSubscription.findUniqueOrThrow({
        where: { organizationId: input.organizationId },
      });
      const requestedEndsAt = input.endsAt.toISOString();
      const requestedStartsAt = input.startsAt?.toISOString();
      const operationId =
        input.operationId?.trim() ||
        `activate:${input.plan}:${requestedEndsAt}`;
      const eventType =
        current.status === SubscriptionStatus.SUSPENDED ||
        current.status === SubscriptionStatus.EXPIRED ||
        current.status === SubscriptionStatus.PENDING_DOWNGRADE
          ? SubscriptionEventType.REACTIVATED
          : SubscriptionEventType.ACTIVATED;
      const eventId = subscriptionEventId(
        input.organizationId,
        SubscriptionEventType.ACTIVATED,
        operationId,
      );
      const existing = await tx.subscriptionEvent.findFirst({
        where: {
          id: {
            in: [
              eventId,
              ...(input.operationId
                ? [`${input.organizationId}:activate:${input.operationId}`]
                : []),
            ],
          },
        },
      });
      if (existing) {
        const metadata = existing.metadata as Record<string, unknown> | null;
        if (
          (metadata?.requestedPlan !== undefined &&
            metadata.requestedPlan !== input.plan) ||
          (metadata?.requestedEndsAt !== undefined &&
            metadata.requestedEndsAt !== requestedEndsAt) ||
          (metadata?.requestedStartsAt !== undefined &&
            metadata.requestedStartsAt !== requestedStartsAt)
        )
          throw new ConflictException(
            'operationId was already used for a different activation.',
          );
        return current;
      }
      const updated = await tx.organizationSubscription.update({
        where: { organizationId: input.organizationId },
        data: {
          plan: input.plan,
          status: SubscriptionStatus.ACTIVE,
          startsAt:
            current.status === SubscriptionStatus.ACTIVE
              ? current.startsAt
              : (input.startsAt ?? now),
          endsAt: input.endsAt,
          graceEndsAt: new Date(input.endsAt.getTime() + 7 * 86_400_000),
          pendingPlan: null,
          pendingPlanAt: null,
        },
      });
      await tx.subscriptionEvent.create({
        data: {
          id: eventId,
          subscriptionId: input.organizationId,
          type: eventType,
          previousPlan: current.plan,
          nextPlan: input.plan,
          previousStatus: current.status,
          nextStatus: updated.status,
          actorUserId: input.actorUserId,
          metadata: operationMetadata(operationId, {
            requestedPlan: input.plan,
            requestedEndsAt,
            ...(requestedStartsAt ? { requestedStartsAt } : {}),
            ...(input.externalPaymentReference
              ? { externalPaymentReference: input.externalPaymentReference }
              : {}),
            ...(input.internalNote ? { internalNote: input.internalNote } : {}),
          }),
        },
      });
      await this.createPlatformAuditEvent(tx, {
        organizationId: input.organizationId,
        actorUserId: input.platformAudit?.actorUserId,
        action: 'subscription.activate',
        metadata: { plan: input.plan },
      });
      return updated;
    });
  }

  async suspend(
    organizationId: string,
    actorUserId: string,
    requestedOperationId?: string,
    platformAudit?: { actorUserId: string },
  ) {
    await this.assertOrganization(organizationId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 1))::text AS lock_result`,
      );
      const current = await tx.organizationSubscription.findUniqueOrThrow({
        where: { organizationId },
      });
      if (current.status === SubscriptionStatus.SUSPENDED) return current;
      const operationId =
        requestedOperationId?.trim() ||
        `suspend:${current.status}:${current.updatedAt.toISOString()}`;
      const eventId = subscriptionEventId(
        organizationId,
        SubscriptionEventType.SUSPENDED,
        operationId,
      );
      const existing = await tx.subscriptionEvent.findUnique({
        where: { id: eventId },
      });
      if (existing) return current;
      const updated = await tx.organizationSubscription.update({
        where: { organizationId },
        data: { status: SubscriptionStatus.SUSPENDED },
      });
      await tx.subscriptionEvent.create({
        data: {
          id: eventId,
          subscriptionId: organizationId,
          type: 'SUSPENDED',
          previousPlan: current.plan,
          nextPlan: current.plan,
          previousStatus: current.status,
          nextStatus: updated.status,
          actorUserId,
          metadata: operationMetadata(operationId),
        },
      });
      await this.createPlatformAuditEvent(tx, {
        organizationId,
        actorUserId: platformAudit?.actorUserId,
        action: 'subscription.suspend',
      });
      return updated;
    });
  }

  async scheduleDowngrade(input: {
    organizationId: string;
    plan: SubscriptionPlan;
    actorUserId: string;
    operationId?: string;
    platformAudit?: { actorUserId: string };
  }) {
    await this.assertOrganization(input.organizationId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.organizationId}, 1))::text AS lock_result`,
      );
      const current = await tx.organizationSubscription.findUniqueOrThrow({
        where: { organizationId: input.organizationId },
      });
      if (current.status !== SubscriptionStatus.ACTIVE)
        throw new BadRequestException(
          'Only an active subscription can be downgraded.',
        );
      if (current.plan === input.plan)
        throw new BadRequestException('The requested plan is already active.');
      if (PLAN_RANK[input.plan] >= PLAN_RANK[current.plan])
        throw new BadRequestException('The requested plan is not a downgrade.');
      if (
        current.pendingPlan === input.plan &&
        current.pendingPlanAt?.getTime() === current.endsAt.getTime()
      )
        return current;
      const operationId =
        input.operationId?.trim() ||
        `schedule-downgrade:${current.plan}:${input.plan}:${current.endsAt.toISOString()}`;
      const eventId = subscriptionEventId(
        input.organizationId,
        SubscriptionEventType.DOWNGRADE_SCHEDULED,
        operationId,
      );
      const existing = await tx.subscriptionEvent.findUnique({
        where: { id: eventId },
      });
      if (existing) {
        const metadata = existing.metadata as Record<string, unknown> | null;
        if (
          existing.nextPlan !== input.plan ||
          (metadata?.effectiveAt !== undefined &&
            metadata.effectiveAt !== current.endsAt.toISOString())
        )
          throw new ConflictException(
            'operationId was already used for a different downgrade.',
          );
        return current;
      }
      const updated = await tx.organizationSubscription.update({
        where: { organizationId: input.organizationId },
        data: { pendingPlan: input.plan, pendingPlanAt: current.endsAt },
      });
      await tx.subscriptionEvent.create({
        data: {
          id: eventId,
          subscriptionId: input.organizationId,
          type: 'DOWNGRADE_SCHEDULED',
          previousPlan: current.plan,
          nextPlan: input.plan,
          previousStatus: current.status,
          nextStatus: current.status,
          actorUserId: input.actorUserId,
          metadata: operationMetadata(operationId, {
            requestedPlan: input.plan,
            effectiveAt: current.endsAt.toISOString(),
          }),
        },
      });
      await this.createPlatformAuditEvent(tx, {
        organizationId: input.organizationId,
        actorUserId: input.platformAudit?.actorUserId,
        action: 'subscription.downgrade.schedule',
        metadata: { plan: input.plan },
      });
      return updated;
    });
  }

  private async assertOrganization(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!organization) throw new NotFoundException('Organization not found.');
  }

  private async createPlatformAuditEvent(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      actorUserId?: string;
      action: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    if (!input.actorUserId) return;
    await tx.platformAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        action: input.action,
        resource: 'organization_subscription',
        resourceId: input.organizationId,
        metadata: sanitizeAuditMetadata(input.metadata) as Prisma.InputJsonValue,
      },
    });
  }
}

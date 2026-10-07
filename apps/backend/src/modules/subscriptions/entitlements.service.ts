import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrganizationSubscription,
  Prisma,
  SubscriptionEventType,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { employeeOperationalWhere } from '../../common/prisma/operational-scope';
import {
  operationMetadata,
  subscriptionEventId,
} from './subscription-operation.util';

export type PlanEntitlements = {
  activeEmployees: number;
  activeAdministrators: number;
  activeAttendanceSites: number;
  customExport: boolean;
};

export type SubscriptionAccessPolicy = {
  status: SubscriptionStatus;
  mode: 'NORMAL' | 'READ_ONLY' | 'BLOCKED';
  readsAllowed: boolean;
  operationalWritesAllowed: boolean;
  attendanceActionsAllowed: boolean;
  exportsAllowed: boolean;
};

const PLAN_ENTITLEMENTS: Record<SubscriptionPlan, PlanEntitlements> = {
  STARTER: {
    activeEmployees: 10,
    activeAdministrators: 1,
    activeAttendanceSites: 1,
    customExport: true,
  },
  PRO: {
    activeEmployees: 50,
    activeAdministrators: 3,
    activeAttendanceSites: 3,
    customExport: true,
  },
  BUSINESS: {
    activeEmployees: 200,
    activeAdministrators: 10,
    activeAttendanceSites: 10,
    customExport: true,
  },
};
const ACTIVE_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.TRIALING,
  SubscriptionStatus.ACTIVE,
];

@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async getForOrganization(organizationId: string) {
    const subscription = await this.refreshLifecycle(organizationId);
    const usage = await this.getUsage(organizationId);
    const events = await this.prisma.subscriptionEvent.findMany({
      where: { subscriptionId: organizationId },
      orderBy: { occurredAt: 'desc' },
      take: 20,
      select: { id: true, type: true, occurredAt: true },
    });
    return {
      subscription,
      entitlements: PLAN_ENTITLEMENTS[subscription.plan],
      usage,
      notifications: events.map((event) => ({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt,
        message: this.notificationMessage(event.type),
      })),
    };
  }

  getPlanEntitlements(plan: SubscriptionPlan) {
    return PLAN_ENTITLEMENTS[plan];
  }

  getPlanDefinitions() {
    return Object.fromEntries(
      Object.values(SubscriptionPlan).map((plan) => [
        plan,
        this.getPlanEntitlements(plan),
      ]),
    ) as Record<SubscriptionPlan, PlanEntitlements>;
  }

  async getAccessPolicy(
    organizationId: string,
  ): Promise<SubscriptionAccessPolicy> {
    const subscription = await this.refreshLifecycle(organizationId);
    return this.policyFor(subscription, new Date());
  }

  async assertOperationalWriteAllowed(
    organizationId: string | undefined,
    transaction?: Prisma.TransactionClient,
  ) {
    if (!organizationId) return;
    if (transaction)
      await transaction.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 1))::text AS lock_result`,
      );
    const subscription = transaction
      ? await transaction.organizationSubscription.findUnique({
          where: { organizationId },
        })
      : await this.refreshLifecycle(organizationId);
    if (!subscription)
      throw new ForbiddenException(
        'The organization subscription is unavailable.',
      );
    if (!this.policyFor(subscription, new Date()).operationalWritesAllowed)
      throw new ForbiddenException(
        'The organization subscription is read-only or suspended.',
      );
  }

  async assertMayIncrease(
    organizationId: string | undefined,
    resource:
      | 'activeEmployees'
      | 'activeAdministrators'
      | 'activeAttendanceSites',
    transaction: Prisma.TransactionClient,
    excludeInvitationId?: string,
  ) {
    if (!organizationId) return;
    await transaction.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 1))::text AS lock_result`,
    );
    const subscription = await transaction.organizationSubscription.findUnique({
      where: { organizationId },
    });
    if (!subscription)
      throw new ForbiddenException(
        'The organization subscription is unavailable.',
      );
    if (!this.policyFor(subscription, new Date()).operationalWritesAllowed)
      throw new ForbiddenException(
        'The organization subscription does not permit new resources.',
      );
    const entitlements = PLAN_ENTITLEMENTS[subscription.plan];
    const used =
      resource === 'activeEmployees'
        ? await transaction.employee.count({
            where: {
              ...employeeOperationalWhere(organizationId),
              isActive: true,
            },
          })
        : resource === 'activeAdministrators'
          ? (await transaction.membership.count({
              where: { organizationId, status: 'ACTIVE', role: 'ADMIN' },
            })) +
            (await transaction.invitation.count({
              where: {
                organizationId,
                role: 'ADMIN',
                acceptedAt: null,
                revokedAt: null,
                expiresAt: { gt: new Date() },
                ...(excludeInvitationId
                  ? { id: { not: excludeInvitationId } }
                  : {}),
              },
            }))
          : await transaction.attendanceSite.count({
              where: { organizationId, isActive: true },
            });
    if (used >= entitlements[resource])
      throw new ConflictException(`Plan quota reached for ${resource}.`);
  }

  async assertHistoryAllowed(
    organizationId: string | undefined,
    _startDate: Date,
  ) {
    if (!organizationId) return;
    const { subscription } = await this.getForOrganization(organizationId);
    const policy = this.policyFor(subscription, new Date());
    if (!policy.exportsAllowed)
      throw new ForbiddenException(
        'The organization subscription is not active.',
      );
    // Historical availability is independent of plan. Date, tenant, site and
    // reporting validation remain enforced by the calling report service.
  }

  async getUsage(organizationId: string) {
    const [
      activeEmployees,
      activeAdministrators,
      pendingAdministratorInvitations,
      activeAttendanceSites,
    ] = await Promise.all([
        this.prisma.employee.count({
          where: {
            ...employeeOperationalWhere(organizationId),
            isActive: true,
          },
        }),
        this.prisma.membership.count({
          where: {
            organizationId,
            status: 'ACTIVE',
            role: 'ADMIN',
          },
        }),
        this.prisma.invitation.count({
          where: {
            organizationId,
            role: 'ADMIN',
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        }),
        this.prisma.attendanceSite.count({
          where: { organizationId, isActive: true },
        }),
      ]);
    return {
      activeEmployees,
      activeAdministrators,
      pendingAdministratorInvitations,
      administratorCapacityUsed:
        activeAdministrators + pendingAdministratorInvitations,
      activeAttendanceSites,
    };
  }

  async refreshLifecycle(organizationId: string, now = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 1))::text AS lock_result`,
      );
      const current = await tx.organizationSubscription.findUnique({
        where: { organizationId },
      });
      if (!current) throw new NotFoundException('Subscription not found.');

      const periodEnded = now >= current.endsAt;
      const graceEndsAt = new Date(current.endsAt.getTime() + 7 * 86_400_000);

      if (
        current.status !== SubscriptionStatus.CANCELLED &&
        current.pendingPlan &&
        current.pendingPlanAt &&
        now >= current.pendingPlanAt
      ) {
        const usage = await this.getUsageWithClient(tx, organizationId);
        const target = PLAN_ENTITLEMENTS[current.pendingPlan];
        const withinQuota =
          usage.activeEmployees <= target.activeEmployees &&
          usage.administratorCapacityUsed <= target.activeAdministrators &&
          usage.activeAttendanceSites <= target.activeAttendanceSites;

        if (withinQuota) {
          const operationId = `lifecycle:downgrade:${current.pendingPlan}:${current.pendingPlanAt.toISOString()}`;
          const eventId = subscriptionEventId(
            organizationId,
            SubscriptionEventType.DOWNGRADE_APPLIED,
            operationId,
          );
          const existing = await tx.subscriptionEvent.findUnique({
            where: { id: eventId },
          });
          if (existing) return current;
          const nextStatus = !periodEnded
            ? current.status
            : now >= graceEndsAt
              ? SubscriptionStatus.SUSPENDED
              : SubscriptionStatus.EXPIRED;
          const updated = await tx.organizationSubscription.update({
            where: { organizationId },
            data: {
              plan: current.pendingPlan,
              pendingPlan: null,
              pendingPlanAt: null,
              status: nextStatus,
              ...(periodEnded ? { graceEndsAt } : {}),
            },
          });
          await tx.subscriptionEvent.create({
            data: {
              id: eventId,
              subscriptionId: organizationId,
              type: SubscriptionEventType.DOWNGRADE_APPLIED,
              previousPlan: current.plan,
              nextPlan: updated.plan,
              previousStatus: current.status,
              nextStatus: updated.status,
              metadata: operationMetadata(operationId, {
                activeEmployees: usage.activeEmployees,
                activeAdministrators: usage.activeAdministrators,
                pendingAdministratorInvitations: usage.pendingAdministratorInvitations,
                administratorCapacityUsed: usage.administratorCapacityUsed,
                activeAttendanceSites: usage.activeAttendanceSites,
              }),
            },
          });
          return updated;
        }

        if (periodEnded) {
          const nextStatus =
            now >= graceEndsAt
              ? SubscriptionStatus.SUSPENDED
              : SubscriptionStatus.PENDING_DOWNGRADE;
          if (current.status === nextStatus) {
            if (current.graceEndsAt.getTime() === graceEndsAt.getTime())
              return current;
            return tx.organizationSubscription.update({
              where: { organizationId },
              data: { graceEndsAt },
            });
          }
          const eventType =
            nextStatus === SubscriptionStatus.SUSPENDED
              ? SubscriptionEventType.SUSPENDED
              : SubscriptionEventType.DOWNGRADE_SCHEDULED;
          const operationId = `lifecycle:downgrade-blocked:${current.pendingPlan}:${current.pendingPlanAt.toISOString()}:${nextStatus}`;
          return this.transitionInTransaction(tx, current, {
            status: nextStatus,
            eventType,
            operationId,
            graceEndsAt,
            metadata: {
              reason: 'TARGET_PLAN_QUOTA_EXCEEDED',
              activeEmployees: usage.activeEmployees,
              activeAdministrators: usage.activeAdministrators,
              pendingAdministratorInvitations: usage.pendingAdministratorInvitations,
              administratorCapacityUsed: usage.administratorCapacityUsed,
              activeAttendanceSites: usage.activeAttendanceSites,
            },
          });
        }
      }

      if (
        (current.status === SubscriptionStatus.TRIALING ||
          current.status === SubscriptionStatus.ACTIVE) &&
        periodEnded
      ) {
        return this.transitionInTransaction(tx, current, {
          status: SubscriptionStatus.EXPIRED,
          eventType: SubscriptionEventType.EXPIRED,
          operationId: `lifecycle:expire:${current.endsAt.toISOString()}`,
          graceEndsAt,
        });
      }
      if (
        (current.status === SubscriptionStatus.EXPIRED ||
          current.status === SubscriptionStatus.PENDING_DOWNGRADE) &&
        now >= current.graceEndsAt
      ) {
        return this.transitionInTransaction(tx, current, {
          status: SubscriptionStatus.SUSPENDED,
          eventType: SubscriptionEventType.SUSPENDED,
          operationId: `lifecycle:suspend:${current.graceEndsAt.toISOString()}`,
        });
      }
      return current;
    });
  }

  private async transitionInTransaction(
    tx: Prisma.TransactionClient,
    current: OrganizationSubscription,
    transition: {
      status: SubscriptionStatus;
      eventType: SubscriptionEventType;
      operationId: string;
      graceEndsAt?: Date;
      metadata?: Record<string, string | number | boolean | null>;
    },
  ) {
    const eventId = subscriptionEventId(
      current.organizationId,
      transition.eventType,
      transition.operationId,
    );
    const existing = await tx.subscriptionEvent.findUnique({
      where: { id: eventId },
    });
    if (existing || current.status === transition.status) return current;
    const updated = await tx.organizationSubscription.update({
      where: { organizationId: current.organizationId },
      data: {
        status: transition.status,
        ...(transition.graceEndsAt
          ? { graceEndsAt: transition.graceEndsAt }
          : {}),
      },
    });
    await tx.subscriptionEvent.create({
      data: {
        id: eventId,
        subscriptionId: current.organizationId,
        type: transition.eventType,
        previousPlan: current.plan,
        nextPlan: updated.plan,
        previousStatus: current.status,
        nextStatus: transition.status,
        metadata: operationMetadata(
          transition.operationId,
          transition.metadata,
        ),
      },
    });
    return updated;
  }

  private async getUsageWithClient(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ) {
    const [
      activeEmployees,
      activeAdministrators,
      pendingAdministratorInvitations,
      activeAttendanceSites,
    ] = await Promise.all([
        tx.employee.count({
          where: {
            ...employeeOperationalWhere(organizationId),
            isActive: true,
          },
        }),
        tx.membership.count({
          where: {
            organizationId,
            status: 'ACTIVE',
            role: 'ADMIN',
          },
        }),
        tx.invitation.count({
          where: {
            organizationId,
            role: 'ADMIN',
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
        }),
        tx.attendanceSite.count({
          where: { organizationId, isActive: true },
        }),
      ]);
    return {
      activeEmployees,
      activeAdministrators,
      pendingAdministratorInvitations,
      administratorCapacityUsed:
        activeAdministrators + pendingAdministratorInvitations,
      activeAttendanceSites,
    };
  }

  private policyFor(
    subscription: {
      status: SubscriptionStatus;
      endsAt: Date;
      graceEndsAt: Date;
    },
    now: Date,
  ): SubscriptionAccessPolicy {
    const normalAccess =
      ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status) &&
      now < subscription.endsAt;
    const inGrace =
      (subscription.status === SubscriptionStatus.EXPIRED ||
        subscription.status === SubscriptionStatus.PENDING_DOWNGRADE) &&
      now < subscription.graceEndsAt;
    return {
      status: subscription.status,
      mode: normalAccess ? 'NORMAL' : inGrace ? 'READ_ONLY' : 'BLOCKED',
      readsAllowed: true,
      operationalWritesAllowed: normalAccess,
      attendanceActionsAllowed: normalAccess,
      exportsAllowed: normalAccess,
    };
  }

  private notificationMessage(type: string) {
    switch (type) {
      case 'TRIAL_STARTED':
        return 'Votre essai Pro de 14 jours est actif.';
      case 'EXPIRED':
        return 'Votre abonnement a expiré. Une période de grâce de 7 jours est en cours.';
      case 'SUSPENDED':
        return 'Votre abonnement est suspendu.';
      case 'DOWNGRADE_SCHEDULED':
        return 'Un changement de plan est programmé à la fin de la période.';
      case 'DOWNGRADE_APPLIED':
        return 'Le changement de plan a été appliqué.';
      default:
        return 'Mise à jour de votre abonnement.';
    }
  }
}

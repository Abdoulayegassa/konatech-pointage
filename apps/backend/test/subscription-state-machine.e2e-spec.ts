import { INestApplication } from '@nestjs/common';
import {
  PrismaClient,
  SubscriptionEventType,
  SubscriptionPlan,
  SubscriptionStatus,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { EntitlementsService } from '../src/modules/subscriptions/entitlements.service';
import { SubscriptionsService } from '../src/modules/subscriptions/subscriptions.service';
import { prepareTestDatabase } from './test-database';

const DAY = 86_400_000;
const ACTOR_ID = 'phase-10-6-1-platform-admin';

describe('Subscription state machine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let entitlements: EntitlementsService;
  let subscriptions: SubscriptionsService;
  let sequence = 0;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    entitlements = app.get(EntitlementsService);
    subscriptions = app.get(SubscriptionsService);
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function createOrganization(label: string) {
    sequence += 1;
    return prisma.organization.create({
      data: {
        name: `${label} ${sequence}`,
        slug: `subscription-state-${label.toLowerCase()}-${sequence}`,
        timezone: 'Etc/UTC',
      },
    });
  }

  it('transitions ACTIVE -> EXPIRED -> SUSPENDED once and preserves audit history', async () => {
    const organization = await createOrganization('Lifecycle');
    const endsAt = new Date(Date.now() + DAY);
    await subscriptions.activate({
      organizationId: organization.id,
      plan: SubscriptionPlan.PRO,
      endsAt,
      actorUserId: ACTOR_ID,
      operationId: 'lifecycle-activation',
    });

    const expired = await entitlements.refreshLifecycle(
      organization.id,
      new Date(endsAt.getTime() + DAY),
    );
    expect(expired.status).toBe(SubscriptionStatus.EXPIRED);
    const repeatedExpiration = await entitlements.refreshLifecycle(
      organization.id,
      new Date(endsAt.getTime() + 2 * DAY),
    );
    expect(repeatedExpiration.status).toBe(SubscriptionStatus.EXPIRED);
    const suspended = await entitlements.refreshLifecycle(
      organization.id,
      new Date(endsAt.getTime() + 8 * DAY),
    );
    expect(suspended.status).toBe(SubscriptionStatus.SUSPENDED);
    await expect(
      entitlements.refreshLifecycle(
        organization.id,
        new Date(endsAt.getTime() + 9 * DAY),
      ),
    ).resolves.toMatchObject({ status: SubscriptionStatus.SUSPENDED });

    const events = await prisma.subscriptionEvent.findMany({
      where: {
        subscriptionId: organization.id,
        type: {
          in: [SubscriptionEventType.EXPIRED, SubscriptionEventType.SUSPENDED],
        },
      },
    });
    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.id)).size).toBe(2);
    expect(
      events.every(
        (event) =>
          typeof (event.metadata as { operationId?: string })?.operationId ===
          'string',
      ),
    ).toBe(true);
  });

  it('renews before and after expiration without allowing operation replay to reactivate', async () => {
    const organization = await createOrganization('Renewal');
    const firstEnd = new Date(Date.now() + DAY);
    const first = await subscriptions.activate({
      organizationId: organization.id,
      plan: SubscriptionPlan.PRO,
      endsAt: firstEnd,
      actorUserId: ACTOR_ID,
      operationId: 'renewal-initial',
    });
    const beforeExpirationEnd = new Date(Date.now() + 10 * DAY);
    const renewedBefore = await subscriptions.activate({
      organizationId: organization.id,
      plan: SubscriptionPlan.PRO,
      endsAt: beforeExpirationEnd,
      actorUserId: ACTOR_ID,
      operationId: 'renewal-before-expiration',
    });
    expect(renewedBefore).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      plan: SubscriptionPlan.PRO,
      startsAt: first.startsAt,
    });

    await entitlements.refreshLifecycle(
      organization.id,
      new Date(beforeExpirationEnd.getTime() + DAY),
    );
    const afterExpirationEnd = new Date(Date.now() + 20 * DAY);
    const renewedAfter = await subscriptions.activate({
      organizationId: organization.id,
      plan: SubscriptionPlan.PRO,
      endsAt: afterExpirationEnd,
      actorUserId: ACTOR_ID,
      operationId: 'renewal-after-expiration',
    });
    expect(renewedAfter).toMatchObject({
      status: SubscriptionStatus.ACTIVE,
      plan: SubscriptionPlan.PRO,
    });
    expect(renewedAfter.startsAt.getTime()).toBeGreaterThan(
      first.startsAt.getTime(),
    );

    await entitlements.refreshLifecycle(
      organization.id,
      new Date(afterExpirationEnd.getTime() + DAY),
    );
    const replayed = await subscriptions.activate({
      organizationId: organization.id,
      plan: SubscriptionPlan.PRO,
      endsAt: afterExpirationEnd,
      actorUserId: ACTOR_ID,
      operationId: 'renewal-after-expiration',
    });
    expect(replayed.status).toBe(SubscriptionStatus.EXPIRED);
    expect(
      await prisma.subscriptionEvent.count({
        where: {
          subscriptionId: organization.id,
          type: SubscriptionEventType.REACTIVATED,
        },
      }),
    ).toBe(1);
  });

  it('applies a pending downgrade within quota at period end without free reactivation', async () => {
    const organization = await createOrganization('DowngradeWithin');
    const endsAt = new Date(Date.now() + DAY);
    await subscriptions.activate({
      organizationId: organization.id,
      plan: SubscriptionPlan.PRO,
      endsAt,
      actorUserId: ACTOR_ID,
      operationId: 'within-activate',
    });
    await subscriptions.scheduleDowngrade({
      organizationId: organization.id,
      plan: SubscriptionPlan.STARTER,
      actorUserId: ACTOR_ID,
      operationId: 'within-downgrade',
    });
    await subscriptions.scheduleDowngrade({
      organizationId: organization.id,
      plan: SubscriptionPlan.STARTER,
      actorUserId: ACTOR_ID,
      operationId: 'within-downgrade',
    });
    expect(
      await prisma.subscriptionEvent.count({
        where: {
          subscriptionId: organization.id,
          type: SubscriptionEventType.DOWNGRADE_SCHEDULED,
        },
      }),
    ).toBe(1);

    const applied = await entitlements.refreshLifecycle(
      organization.id,
      new Date(endsAt.getTime() + DAY),
    );
    expect(applied).toMatchObject({
      plan: SubscriptionPlan.STARTER,
      status: SubscriptionStatus.EXPIRED,
      pendingPlan: null,
      pendingPlanAt: null,
    });
    expect(
      await prisma.subscriptionEvent.count({
        where: {
          subscriptionId: organization.id,
          type: SubscriptionEventType.DOWNGRADE_APPLIED,
        },
      }),
    ).toBe(1);
  });

  it('keeps resources and the current plan when a pending downgrade exceeds quota', async () => {
    const organization = await createOrganization('DowngradeQuota');
    const endsAt = new Date(Date.now() + DAY);
    await subscriptions.activate({
      organizationId: organization.id,
      plan: SubscriptionPlan.PRO,
      endsAt,
      actorUserId: ACTOR_ID,
      operationId: 'quota-activate',
    });
    await prisma.organizationSubscription.update({
      where: { organizationId: organization.id },
      data: { plan: SubscriptionPlan.BUSINESS },
    });
    await prisma.employee.createMany({
      data: Array.from({ length: 11 }, (_, index) => ({
        organizationId: organization.id,
        employeeIdentifier: `quota-${organization.id}-${index}`,
        firstName: 'Quota',
        lastName: String(index),
        email: `quota-${organization.id}-${index}@konatech.test`,
        role: 'EMPLOYEE',
        passwordHash: 'not-used-by-this-test',
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      })),
    });
    await subscriptions.scheduleDowngrade({
      organizationId: organization.id,
      plan: SubscriptionPlan.STARTER,
      actorUserId: ACTOR_ID,
      operationId: 'quota-downgrade',
    });

    const blocked = await entitlements.refreshLifecycle(
      organization.id,
      new Date(endsAt.getTime() + DAY),
    );
    expect(blocked).toMatchObject({
      plan: SubscriptionPlan.BUSINESS,
      status: SubscriptionStatus.PENDING_DOWNGRADE,
      pendingPlan: SubscriptionPlan.STARTER,
    });
    expect(
      await prisma.employee.count({
        where: { organizationId: organization.id },
      }),
    ).toBe(11);

    const employee = await prisma.employee.findFirstOrThrow({
      where: { organizationId: organization.id },
    });
    await prisma.employee.update({
      where: { id: employee.id },
      data: { isActive: false },
    });
    const applied = await entitlements.refreshLifecycle(
      organization.id,
      new Date(endsAt.getTime() + 2 * DAY),
    );
    expect(applied).toMatchObject({
      plan: SubscriptionPlan.STARTER,
      status: SubscriptionStatus.EXPIRED,
      pendingPlan: null,
    });
    expect(
      await prisma.employee.count({
        where: { organizationId: organization.id },
      }),
    ).toBe(11);
  });

  it('isolates tenants and preserves the legacy no-organization compatibility path', async () => {
    const tenantA = await createOrganization('TenantA');
    const tenantB = await createOrganization('TenantB');
    const endsAt = new Date(Date.now() + DAY);
    await subscriptions.activate({
      organizationId: tenantA.id,
      plan: SubscriptionPlan.PRO,
      endsAt,
      actorUserId: ACTOR_ID,
      operationId: 'tenant-a-only',
    });
    await entitlements.refreshLifecycle(
      tenantA.id,
      new Date(endsAt.getTime() + DAY),
    );

    await expect(
      prisma.organizationSubscription.findUniqueOrThrow({
        where: { organizationId: tenantB.id },
      }),
    ).resolves.toMatchObject({
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.TRIALING,
    });
    expect(
      await prisma.subscriptionEvent.count({
        where: {
          subscriptionId: tenantB.id,
          type: SubscriptionEventType.EXPIRED,
        },
      }),
    ).toBe(0);
    await expect(
      prisma.$transaction((tx) =>
        entitlements.assertMayIncrease(undefined, 'activeEmployees', tx),
      ),
    ).resolves.toBeUndefined();

    await expect(
      subscriptions.activate({
        organizationId: tenantB.id,
        plan: SubscriptionPlan.BUSINESS,
        endsAt: new Date(Date.now() + 30 * DAY),
        actorUserId: ACTOR_ID,
        operationId: 'business-current-contract',
      }),
    ).resolves.toMatchObject({
      plan: SubscriptionPlan.BUSINESS,
      status: SubscriptionStatus.ACTIVE,
    });
    await expect(
      prisma.organizationSubscription.findUniqueOrThrow({
        where: { organizationId: tenantB.id },
      }),
    ).resolves.toMatchObject({
      plan: SubscriptionPlan.BUSINESS,
      status: SubscriptionStatus.ACTIVE,
    });
  });

  it('serializes concurrent transitions and makes repeated explicit operations idempotent', async () => {
    const organization = await createOrganization('Concurrent');
    const endsAt = new Date(Date.now() + 30 * DAY);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        subscriptions.activate({
          organizationId: organization.id,
          plan: SubscriptionPlan.PRO,
          endsAt,
          actorUserId: ACTOR_ID,
          operationId: 'concurrent-activation',
        }),
      ),
    );
    expect(
      results.every(
        (result) =>
          result.status === SubscriptionStatus.ACTIVE &&
          result.plan === SubscriptionPlan.PRO,
      ),
    ).toBe(true);
    expect(
      await prisma.subscriptionEvent.count({
        where: {
          subscriptionId: organization.id,
          type: SubscriptionEventType.ACTIVATED,
        },
      }),
    ).toBe(1);

    await Promise.all(
      Array.from({ length: 8 }, () =>
        subscriptions.suspend(
          organization.id,
          ACTOR_ID,
          'concurrent-suspension',
        ),
      ),
    );
    expect(
      await prisma.subscriptionEvent.count({
        where: {
          subscriptionId: organization.id,
          type: SubscriptionEventType.SUSPENDED,
        },
      }),
    ).toBe(1);
  });
});

import {
  PrismaClient,
  SubscriptionPlan,
  SubscriptionStatus,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { EntitlementsService } from '../src/modules/subscriptions/entitlements.service';
import { SubscriptionsService } from '../src/modules/subscriptions/subscriptions.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(60_000);

describe('SaaS entitlement matrix (e2e)', () => {
  let prisma: PrismaClient;
  let entitlements: EntitlementsService;
  let subscriptions: SubscriptionsService;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    entitlements = new EntitlementsService(prisma as never);
    subscriptions = new SubscriptionsService(prisma as never, entitlements);
  });

  afterAll(async () => prisma?.$disconnect());

  async function organization(plan: SubscriptionPlan) {
    const created = await prisma.organization.create({
      data: {
        name: `Entitlement ${plan}`,
        slug: `entitlement-${plan.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timezone: 'Etc/UTC',
      },
    });
    await prisma.organizationSubscription.update({
      where: { organizationId: created.id },
      data: {
        plan,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 86_400_000),
        graceEndsAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    return created.id;
  }

  async function addEmployees(organizationId: string, count: number) {
    await prisma.employee.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        organizationId,
        employeeIdentifier: `${organizationId}-employee-${index}`,
        firstName: 'Entitlement',
        lastName: `Employee ${index}`,
        email: `${organizationId}-${index}@entitlement.test`,
        role: 'Employee',
        passwordHash: 'test-password-hash',
        isActive: true,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      })),
    });
  }

  async function addSites(organizationId: string, count: number) {
    await prisma.attendanceSite.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        organizationId,
        name: `Site ${index}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        latitude: 12 + index / 100,
        longitude: -1 - index / 100,
        allowedRadiusMeters: 100,
        isActive: true,
      })),
    });
  }

  it.each([
    [SubscriptionPlan.STARTER, 10, 1, 1],
    [SubscriptionPlan.PRO, 50, 3, 3],
    [SubscriptionPlan.BUSINESS, 200, 10, 10],
  ] as const)(
    'enforces V1 %s quantitative limits while keeping product features available',
    async (plan, employees, admins, sites) => {
      const organizationId = await organization(plan);
      await addEmployees(organizationId, employees);
      await addSites(organizationId, sites);
      const users = await prisma.user.createManyAndReturn({
        data: Array.from({ length: admins }, (_value, index) => ({
          normalizedEmail: `${organizationId}-admin-${index}@entitlement.test`,
          passwordHash: 'test-password-hash',
        })),
        select: { id: true },
      });
      await prisma.membership.createMany({
        data: users.map((user, _index) => ({
          organizationId,
          userId: user.id,
          role: 'ADMIN' as const,
        })),
      });
      const result = await entitlements.getForOrganization(organizationId);
      expect(result.entitlements).toMatchObject({
        activeEmployees: employees === 10 ? 10 : employees,
        activeAdministrators: admins,
        activeAttendanceSites: sites,
        customExport: true,
      });
      expect(result.usage.administratorCapacityUsed).toBe(admins);
      await expect(
        entitlements.assertMayIncrease(
          organizationId,
          'activeEmployees',
          prisma,
        ),
      ).rejects.toThrow('quota');
      await expect(
        entitlements.assertMayIncrease(
          organizationId,
          'activeAdministrators',
          prisma,
        ),
      ).rejects.toThrow('quota');
      await expect(
        entitlements.assertMayIncrease(
          organizationId,
          'activeAttendanceSites',
          prisma,
        ),
      ).rejects.toThrow('quota');
      await expect(
        entitlements.assertHistoryAllowed(organizationId, new Date()),
      ).resolves.toBeUndefined();
      await expect(
        entitlements.assertHistoryAllowed(
          organizationId,
          new Date('2020-01-01T00:00:00Z'),
        ),
      ).resolves.toBeUndefined();
    },
  );

  it('counts only valid pending ADMIN invitations toward administrator capacity', async () => {
    const organizationId = await organization(SubscriptionPlan.STARTER);
    const inviter = await prisma.user.create({
      data: { normalizedEmail: `${organizationId}-inviter@test`, passwordHash: 'test-password-hash' },
    });
    const activeAdmin = await prisma.user.create({
      data: { normalizedEmail: `${organizationId}-active@test`, passwordHash: 'test-password-hash' },
    });
    await prisma.membership.create({
      data: { organizationId, userId: activeAdmin.id, role: 'ADMIN' },
    });
    const invitationBase = {
      organizationId,
      invitedByUserId: inviter.id,
      role: 'ADMIN' as const,
      expiresAt: new Date(Date.now() + 86_400_000),
    };
    const pending = await prisma.invitation.create({
      data: { ...invitationBase, email: `${organizationId}-pending@test`, tokenHash: `${organizationId}-pending` },
    });
    const accepted = await prisma.invitation.create({
      data: { ...invitationBase, email: `${organizationId}-accepted@test`, tokenHash: `${organizationId}-accepted`, acceptedAt: new Date() },
    });
    const revoked = await prisma.invitation.create({
      data: { ...invitationBase, email: `${organizationId}-revoked@test`, tokenHash: `${organizationId}-revoked`, revokedAt: new Date() },
    });
    const expired = await prisma.invitation.create({
      data: { ...invitationBase, email: `${organizationId}-expired@test`, tokenHash: `${organizationId}-expired`, expiresAt: new Date(Date.now() - 1) },
    });

    expect(await entitlements.getUsage(organizationId)).toMatchObject({
      activeAdministrators: 1,
      pendingAdministratorInvitations: 1,
      administratorCapacityUsed: 2,
    });
    await expect(
      entitlements.assertMayIncrease(organizationId, 'activeAdministrators', prisma),
    ).rejects.toThrow('quota');
    await prisma.invitation.update({ where: { id: pending.id }, data: { acceptedAt: new Date() } });
    await prisma.invitation.update({ where: { id: accepted.id }, data: { acceptedAt: new Date() } });
    await prisma.membership.create({
      data: { organizationId, userId: (await prisma.user.create({ data: { normalizedEmail: `${organizationId}-accepted-admin@test`, passwordHash: 'test-password-hash' } })).id, role: 'ADMIN' },
    });
    expect(await entitlements.getUsage(organizationId)).toMatchObject({
      activeAdministrators: 2,
      pendingAdministratorInvitations: 0,
      administratorCapacityUsed: 2,
    });
    await prisma.invitation.deleteMany({ where: { id: { in: [revoked.id, expired.id] } } });
  });

  it('allows reactivation only when the target quota has capacity and preserves resources on downgrade overflow', async () => {
    const organizationId = await organization(SubscriptionPlan.STARTER);
    await addSites(organizationId, 1);
    const site = await prisma.attendanceSite.findFirstOrThrow({
      where: { organizationId },
    });
    await prisma.attendanceSite.update({
      where: { id: site.id },
      data: { isActive: false },
    });
    await expect(
      entitlements.assertMayIncrease(
        organizationId,
        'activeAttendanceSites',
        prisma,
      ),
    ).resolves.toBeUndefined();
    await prisma.attendanceSite.update({
      where: { id: site.id },
      data: { isActive: true },
    });
    const endsAt = new Date(Date.now() + 1_000);
    await subscriptions.activate({
      organizationId,
      plan: SubscriptionPlan.PRO,
      endsAt,
      actorUserId: 'platform',
    });
    await prisma.organizationSubscription.update({
      where: { organizationId },
      data: { plan: SubscriptionPlan.BUSINESS },
    });
    await addSites(organizationId, 10);
    await subscriptions.scheduleDowngrade({
      organizationId,
      plan: SubscriptionPlan.STARTER,
      actorUserId: 'platform',
    });
    await prisma.organizationSubscription.update({
      where: { organizationId },
      data: {
        endsAt: new Date(Date.now() - 1_000),
        pendingPlanAt: new Date(Date.now() - 1_000),
        graceEndsAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    const refreshed = await entitlements.refreshLifecycle(organizationId);
    expect(refreshed.status).toBe(SubscriptionStatus.PENDING_DOWNGRADE);
    expect(
      await prisma.attendanceSite.count({
        where: { organizationId, isActive: true },
      }),
    ).toBe(11);
  });

  it('preserves tenant isolation, Legacy bypass, and rejects expired/suspended writes', async () => {
    const [tenantA, tenantB] = await Promise.all([
      organization(SubscriptionPlan.STARTER),
      organization(SubscriptionPlan.STARTER),
    ]);
    await addEmployees(tenantB, 10);
    await expect(
      entitlements.assertMayIncrease(tenantA, 'activeEmployees', prisma),
    ).resolves.toBeUndefined();
    await expect(
      entitlements.assertMayIncrease(undefined, 'activeEmployees', prisma),
    ).resolves.toBeUndefined();
    await prisma.organizationSubscription.update({
      where: { organizationId: tenantA },
      data: { status: SubscriptionStatus.EXPIRED },
    });
    await expect(
      entitlements.assertMayIncrease(tenantA, 'activeEmployees', prisma),
    ).rejects.toThrow('subscription');
    await prisma.organizationSubscription.update({
      where: { organizationId: tenantA },
      data: { status: SubscriptionStatus.SUSPENDED },
    });
    await expect(
      entitlements.assertHistoryAllowed(tenantA, new Date()),
    ).rejects.toThrow('active');
  });

  it('serializes concurrent quota checks for the same tenant', async () => {
    const organizationId = await organization(SubscriptionPlan.STARTER);
    const attempts = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        prisma.$transaction(
          async (tx) => {
            await entitlements.assertMayIncrease(
              organizationId,
              'activeAttendanceSites',
              tx,
            );
            return tx.attendanceSite.create({
              data: {
                organizationId,
                name: `Concurrent ${Math.random()}`,
                latitude: 12,
                longitude: -1,
                allowedRadiusMeters: 100,
              },
            });
          },
          { isolationLevel: 'Serializable' },
        ),
      ),
    );
    expect(
      attempts.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await prisma.attendanceSite.count({
        where: { organizationId, isActive: true },
      }),
    ).toBe(1);
  });
});

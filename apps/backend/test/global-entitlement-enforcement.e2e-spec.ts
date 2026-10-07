import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  AccessRole,
  MembershipRole,
  PrismaClient,
  SubscriptionPlan,
  SubscriptionStatus,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/security/password.util';
import { prepareTestDatabase } from './test-database';

const DAY = 86_400_000;
const PASSWORD = 'GlobalEntitlement123!';

describe('Global subscription entitlement enforcement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let sequence = 0;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    passwordHash = await hashPassword(PASSWORD);
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function createTenant(
    status: SubscriptionStatus,
    options: { plan?: SubscriptionPlan; withAdmin?: boolean } = {},
  ) {
    sequence += 1;
    const suffix = `${status.toLowerCase()}-${sequence}`;
    const organization = await prisma.organization.create({
      data: {
        name: `Policy ${suffix}`,
        slug: `policy-${suffix}`,
        timezone: 'Etc/UTC',
      },
    });
    const now = Date.now();
    const periodEnded = status === SubscriptionStatus.EXPIRED;
    const endsAt = periodEnded ? new Date(now - DAY) : new Date(now + 30 * DAY);
    const graceEndsAt = periodEnded
      ? new Date(now + 6 * DAY)
      : new Date(endsAt.getTime() + 7 * DAY);
    await prisma.organizationSubscription.update({
      where: { organizationId: organization.id },
      data: {
        plan: options.plan ?? SubscriptionPlan.PRO,
        status,
        startsAt: new Date(now - DAY),
        endsAt,
        graceEndsAt,
      },
    });
    const admin = await prisma.user.create({
      data: {
        normalizedEmail: `admin-${suffix}@policy.test`,
        passwordHash,
      },
    });
    const adminMembership = await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: admin.id,
        role: MembershipRole.ADMIN,
      },
    });
    const users = [{ user: admin, membership: adminMembership }];
    if (options.withAdmin) {
      const admin = await prisma.user.create({
        data: {
          normalizedEmail: `operator-${suffix}@policy.test`,
          passwordHash,
        },
      });
      const membership = await prisma.membership.create({
        data: {
          organizationId: organization.id,
          userId: admin.id,
          role: MembershipRole.ADMIN,
        },
      });
      users.push({ user: admin, membership });
    }
    const site = await prisma.attendanceSite.create({
      data: {
        organizationId: organization.id,
        name: `Site ${suffix}`,
        latitude: 12,
        longitude: -1,
        allowedRadiusMeters: 100,
      },
    });
    const schedule = await prisma.schedule.create({
      data: {
        organizationId: organization.id,
        siteId: site.id,
        name: `Schedule ${suffix}`,
        startTime: '08:00',
        endTime: '17:00',
        workDays: [
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
          'SATURDAY',
          'SUNDAY',
        ],
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    const employee = await prisma.employee.create({
      data: {
        organizationId: organization.id,
        employeeIdentifier: `POLICY-${sequence}`,
        firstName: 'Policy',
        lastName: suffix,
        email: `employee-${suffix}@policy.test`,
        role: 'Employee',
        passwordHash,
        scheduleId: schedule.id,
        primarySiteId: site.id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    const siteAssignment = await prisma.employeeSiteAssignment.create({
      data: {
        organizationId: organization.id,
        employeeId: employee.id,
        siteId: site.id,
        effectiveFrom: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'),
      },
    });
    await prisma.employeeScheduleAssignment.create({
      data: {
        organizationId: organization.id,
        employeeId: employee.id,
        siteId: site.id,
        scheduleId: schedule.id,
        employeeSiteAssignmentId: siteAssignment.id,
        effectiveFrom: siteAssignment.effectiveFrom,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    const tokens = await Promise.all(
      users.map(async ({ user }) => {
        const response = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: user.normalizedEmail, password: PASSWORD })
          .expect(201);
        return response.body.accessToken as string;
      }),
    );
    return { employee, organization, schedule, site, tokens, users };
  }

  it.each([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING])(
    'allows normal server-side writes for a %s tenant',
    async (status) => {
      const fixture = await createTenant(status);
      await request(app.getHttpServer())
        .patch('/api/v1/organizations/current')
        .set('Authorization', `Bearer ${fixture.tokens[0]}`)
        .send({ name: `Allowed ${status}` })
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set('Authorization', `Bearer ${fixture.tokens[0]}`)
        .send({
          name: `Allowed schedule ${status}`,
          startTime: '09:00',
          endTime: '18:00',
          siteId: fixture.site.id,
        })
        .expect(201);
    },
  );

  it('keeps an EXPIRED tenant read-only during grace and blocks exports', async () => {
    const fixture = await createTenant(SubscriptionStatus.EXPIRED);
    await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set('Authorization', `Bearer ${fixture.tokens[0]}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${fixture.tokens[0]}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/current')
      .set('Authorization', `Bearer ${fixture.tokens[0]}`)
      .send({ name: 'Must remain unchanged' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/attendance/exports/monthly')
      .set('Authorization', `Bearer ${fixture.tokens[0]}`)
      .query({
        mode: 'custom',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        format: 'csv',
      })
      .expect(403);
    await expect(
      prisma.organization.findUniqueOrThrow({
        where: { id: fixture.organization.id },
      }),
    ).resolves.toMatchObject({ name: fixture.organization.name });
  });

  it('treats PENDING_DOWNGRADE as read-only and preserves its resources', async () => {
    const fixture = await createTenant(SubscriptionStatus.PENDING_DOWNGRADE, {
      plan: SubscriptionPlan.BUSINESS,
    });
    await prisma.organizationSubscription.update({
      where: { organizationId: fixture.organization.id },
      data: {
        pendingPlan: SubscriptionPlan.STARTER,
        pendingPlanAt: new Date(Date.now() - DAY),
      },
    });
    await prisma.employee.createMany({
      data: Array.from({ length: 10 }, (_, index) => ({
        organizationId: fixture.organization.id,
        employeeIdentifier: `PENDING-${sequence}-${index}`,
        firstName: 'Pending',
        lastName: String(index),
        email: `pending-${sequence}-${index}@policy.test`,
        role: 'Employee',
        passwordHash,
      })),
    });
    await request(app.getHttpServer())
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${fixture.tokens[0]}`)
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/employees/${fixture.employee.id}/department`)
      .set('Authorization', `Bearer ${fixture.tokens[0]}`)
      .send({ department: 'Blocked pending downgrade' })
      .expect(403);
    await expect(
      prisma.employee.findUniqueOrThrow({
        where: { id: fixture.employee.id },
      }),
    ).resolves.toMatchObject({ isActive: true, department: null });
    await expect(
      prisma.organizationSubscription.findUniqueOrThrow({
        where: { organizationId: fixture.organization.id },
      }),
    ).resolves.toMatchObject({
      status: SubscriptionStatus.PENDING_DOWNGRADE,
      plan: SubscriptionPlan.STARTER,
      pendingPlan: null,
    });
  });

  it('moves an EXPIRED tenant past grace to SUSPENDED and continues allowing renewal reads', async () => {
    const fixture = await createTenant(SubscriptionStatus.EXPIRED, {
      withAdmin: true,
    });
    await prisma.organizationSubscription.update({
      where: { organizationId: fixture.organization.id },
      data: { graceEndsAt: new Date(Date.now() - 1_000) },
    });
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/current')
      .set('Authorization', `Bearer ${fixture.tokens[0]}`)
      .send({ name: 'Blocked after grace' })
      .expect(403);
    await expect(
      prisma.organizationSubscription.findUniqueOrThrow({
        where: { organizationId: fixture.organization.id },
      }),
    ).resolves.toMatchObject({ status: SubscriptionStatus.SUSPENDED });
    for (const token of fixture.tokens) {
      await request(app.getHttpServer())
        .get('/api/v1/organizations/current/subscription')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    }
  });

  it('blocks all representative operational writes and attendance for a SUSPENDED tenant', async () => {
    const fixture = await createTenant(SubscriptionStatus.SUSPENDED);
    const authorization = `Bearer ${fixture.tokens[0]}`;
    const attempts = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/attendance/check-in')
        .set('Authorization', authorization)
        .send({ employeeId: fixture.employee.id }),
      request(app.getHttpServer())
        .post('/api/v1/employees')
        .set('Authorization', authorization)
        .send({}),
      request(app.getHttpServer())
        .post('/api/v1/attendance-sites')
        .set('Authorization', authorization)
        .send({}),
      request(app.getHttpServer())
        .patch('/api/v1/organizations/current/attendance-settings')
        .set('Authorization', authorization)
        .send({ gpsRequired: false }),
      request(app.getHttpServer())
        .post('/api/v1/organizations/current/invitations')
        .set('Authorization', authorization)
        .send({ email: 'blocked-invitation@policy.test' }),
    ]);
    expect(attempts.map((response) => response.status)).toEqual([
      403, 403, 403, 403, 403,
    ]);
    expect(
      await prisma.attendance.count({
        where: { organizationId: fixture.organization.id },
      }),
    ).toBe(0);
    await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set('Authorization', authorization)
      .expect(200);

    const invitationToken = `suspended-invitation-${sequence}`;
    const invitation = await prisma.invitation.create({
      data: {
        organizationId: fixture.organization.id,
        invitedByUserId: fixture.users[0].user.id,
        email: `public-accept-${sequence}@policy.test`,
        tokenHash: createHash('sha256').update(invitationToken).digest('hex'),
        expiresAt: new Date(Date.now() + DAY),
      },
    });
    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: invitationToken, password: PASSWORD })
      .expect(403);
    await expect(
      prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } }),
    ).resolves.toMatchObject({ acceptedAt: null });
  });

  it('enforces quotas atomically under concurrent requests and isolates tenants', async () => {
    const limited = await createTenant(SubscriptionStatus.ACTIVE, {
      plan: SubscriptionPlan.STARTER,
    });
    const other = await createTenant(SubscriptionStatus.ACTIVE);
    await prisma.attendanceSite.update({
      where: { id: limited.site.id },
      data: { isActive: false },
    });
    const authorization = `Bearer ${limited.tokens[0]}`;
    const results = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/attendance-sites')
        .set('Authorization', authorization)
        .send({
          name: 'Concurrent site A',
          latitude: 12,
          longitude: -1,
          allowedRadiusMeters: 100,
        }),
      request(app.getHttpServer())
        .post('/api/v1/attendance-sites')
        .set('Authorization', authorization)
        .send({
          name: 'Concurrent site B',
          latitude: 12,
          longitude: -1,
          allowedRadiusMeters: 100,
        }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      await prisma.attendanceSite.count({
        where: { organizationId: limited.organization.id, isActive: true },
      }),
    ).toBe(1);
    expect(
      await prisma.attendanceSite.count({
        where: { organizationId: other.organization.id, isActive: true },
      }),
    ).toBe(1);
  });

  it('preserves Legacy writes and PlatformAdmin-only activation', async () => {
    sequence += 1;
    const legacy = await prisma.employee.create({
      data: {
        employeeIdentifier: `LEGACY-POLICY-${sequence}`,
        firstName: 'Legacy',
        lastName: 'Policy',
        email: `legacy-policy-${sequence}@policy.test`,
        role: 'Administrator',
        accessRole: AccessRole.ADMIN,
        passwordHash,
      },
    });
    const legacyLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: legacy.email, password: PASSWORD })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/employees/${legacy.id}/department`)
      .set('Authorization', `Bearer ${legacyLogin.body.accessToken}`)
      .send({ department: 'Legacy Operations' })
      .expect(200);

    const fixture = await createTenant(SubscriptionStatus.SUSPENDED);
    await request(app.getHttpServer())
      .post(
        `/api/v1/platform/subscriptions/${fixture.organization.id}/activate`,
      )
      .set('Authorization', `Bearer ${fixture.tokens[0]}`)
      .send({
        plan: SubscriptionPlan.PRO,
        endsAt: new Date(Date.now() + 30 * DAY).toISOString(),
        operationId: 'owner-must-not-activate',
      })
      .expect(403);

    const platformUser = await prisma.user.create({
      data: {
        normalizedEmail: `platform-policy-${sequence}@policy.test`,
        passwordHash,
      },
    });
    await prisma.platformAdmin.create({ data: { userId: platformUser.id } });
    const platformLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: platformUser.normalizedEmail, password: PASSWORD })
      .expect(201);
    await request(app.getHttpServer())
      .post(
        `/api/v1/platform/subscriptions/${fixture.organization.id}/activate`,
      )
      .set('Authorization', `Bearer ${platformLogin.body.accessToken}`)
      .send({
        plan: SubscriptionPlan.PRO,
        endsAt: new Date(Date.now() + 30 * DAY).toISOString(),
        operationId: 'platform-valid-renewal',
      })
      .expect(201);
  });
});

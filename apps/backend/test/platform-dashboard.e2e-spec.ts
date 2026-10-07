import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  MembershipRole,
  PrismaClient,
  SubscriptionEventType,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/security/password.util';
import { prepareTestDatabase } from './test-database';

const UNKNOWN_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000099';

describe('Platform dashboard administration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let platformToken: string;
  let adminToken: string;
  let employeeToken: string;
  let platformUserId: string;
  let alphaOrganizationId: string;
  let betaOrganizationId: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
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
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();

    const password = 'PlatformDashboard123!';
    const passwordHash = await hashPassword(password);
    const [alpha, beta, platformUser, admin] = await Promise.all([
      prisma.organization.create({
        data: {
          name: 'Phase 10.10 Alpha',
          slug: 'phase-10-10-alpha',
          timezone: 'Etc/UTC',
        },
      }),
      prisma.organization.create({
        data: {
          name: 'Phase 10.10 Beta',
          slug: 'phase-10-10-beta',
          timezone: 'Etc/UTC',
        },
      }),
      prisma.user.create({
        data: {
          normalizedEmail: 'phase-10-10-platform@konatech.test',
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          normalizedEmail: 'phase-10-10-admin@konatech.test',
          passwordHash,
        },
      }),
    ]);
    alphaOrganizationId = alpha.id;
    betaOrganizationId = beta.id;
    platformUserId = platformUser.id;

    await Promise.all([
      prisma.platformAdmin.create({ data: { userId: platformUser.id } }),
      prisma.membership.create({
        data: {
          organizationId: alpha.id,
          userId: admin.id,
          role: MembershipRole.ADMIN,
        },
      }),
      prisma.employee.create({
        data: {
          organizationId: alpha.id,
          employeeIdentifier: 'phase-10-10-employee',
          firstName: 'Test',
          lastName: 'Employee',
          email: 'phase-10-10-employee@konatech.test',
          role: 'EMPLOYEE',
          passwordHash,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      }),
      prisma.employee.create({
        data: {
          employeeIdentifier: 'phase-10-10-platform-denial-employee',
          firstName: 'Platform',
          lastName: 'Denial',
          email: 'phase-10-10-platform-denial@konatech.test',
          role: 'EMPLOYEE',
          passwordHash,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      }),
      prisma.attendanceSite.create({
        data: {
          organizationId: alpha.id,
          name: 'Phase 10.10 site',
          latitude: 12.37,
          longitude: -1.52,
          allowedRadiusMeters: 100,
        },
      }),
    ]);

    const [platformLogin, adminLogin, employeeLogin] = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: platformUser.normalizedEmail,
        password,
      }),
      request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: admin.normalizedEmail,
        password,
      }),
      request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: 'phase-10-10-platform-denial@konatech.test',
        password,
      }),
    ]);
    expect(platformLogin.status).toBe(201);
    expect(adminLogin.status).toBe(201);
    expect(employeeLogin.status).toBe(201);
    platformToken = platformLogin.body.accessToken as string;
    adminToken = adminLogin.body.accessToken as string;
    employeeToken = employeeLogin.body.accessToken as string;
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('protects every platform view from tenant admins', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/platform/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/platform/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/platform/plan-entitlements')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/api/v1/platform/subscriptions/${betaOrganizationId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${betaOrganizationId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ operationId: 'tenant-must-not-suspend' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/platform/organizations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Unauthorized org',
        slug: `unauthorized-${Date.now()}`,
        timezone: 'Etc/UTC',
        firstAdminEmail: 'unauthorized@example.test',
      })
      .expect(403);
  });

  it('denies legacy EMPLOYEE accounts access to the platform dashboard', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/platform/dashboard')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/platform/plan-entitlements')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
  });

  it('exposes only the approved read-only plan entitlements to Platform Admin', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/platform/plan-entitlements')
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);
    expect(response.body).toEqual({
      STARTER: { activeEmployees: 10, activeAdministrators: 1, activeAttendanceSites: 1, customExport: true },
      PRO: { activeEmployees: 50, activeAdministrators: 3, activeAttendanceSites: 3, customExport: true },
      BUSINESS: { activeEmployees: 200, activeAdministrators: 10, activeAttendanceSites: 10, customExport: true },
    });
  });

  it('provisions an organization with a first ADMIN invitation and enforces admin invite quota', async () => {
    const suffix = Date.now();
    const firstAdminEmail = `provisioned-admin-${suffix}@konatech.test`;
    const provision = await request(app.getHttpServer())
      .post('/api/v1/platform/organizations')
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        name: `Provisioned ${suffix}`,
        slug: `provisioned-${suffix}`,
        timezone: 'Etc/UTC',
        firstAdminEmail,
      })
      .expect(201);

    expect(provision.body.organization).toMatchObject({
      name: `Provisioned ${suffix}`,
      status: 'ACTIVE',
      timezone: 'Etc/UTC',
    });
    expect(provision.body.firstAdminInvitation.invitation).toMatchObject({
      email: firstAdminEmail,
      role: 'ADMIN',
    });
    expect(provision.body.firstAdminInvitation.token).toEqual(
      expect.any(String),
    );
    const organizationId = provision.body.organization.id as string;
    expect(await prisma.membership.count({ where: { organizationId } })).toBe(
      0,
    );

    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({
        token: provision.body.firstAdminInvitation.token,
        password: 'ProvisionedAdmin123!',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body.membership).toMatchObject({
          role: 'ADMIN',
          status: 'ACTIVE',
        });
        expect(body.organization.id).toBe(organizationId);
      });

    const firstAdminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: firstAdminEmail, password: 'ProvisionedAdmin123!' })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/overview')
      .set('Authorization', `Bearer ${firstAdminLogin.body.accessToken}`)
      .expect(200);

    const firstAdminToken = firstAdminLogin.body.accessToken as string;
    await request(app.getHttpServer())
      .post('/api/v1/organizations/current/invitations')
      .set('Authorization', `Bearer ${firstAdminToken}`)
      .send({ email: `second-admin-${suffix}@konatech.test`, role: 'ADMIN' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/organizations/current/invitations')
      .set('Authorization', `Bearer ${firstAdminToken}`)
      .send({ email: `third-admin-${suffix}@konatech.test`, role: 'ADMIN' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/organizations/current/invitations')
      .set('Authorization', `Bearer ${firstAdminToken}`)
      .send({ email: `fourth-admin-${suffix}@konatech.test`, role: 'ADMIN' })
      .expect(409);
  });

  it('lists, searches and filters organizations without leaking tenant context', async () => {
    const list = await request(app.getHttpServer())
      .get(
        '/api/v1/platform/organizations?search=10.10%20Alpha&status=TRIALING&plan=PRO',
      )
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({
      organization: {
        id: alphaOrganizationId,
        name: 'Phase 10.10 Alpha',
        slug: 'phase-10-10-alpha',
      },
      subscription: {
        plan: 'PRO',
        status: 'TRIALING',
        trialUsedAt: expect.any(String),
      },
      usage: { activeEmployees: 1, activeAttendanceSites: 1 },
    });
    expect(list.body[0].organization).not.toHaveProperty('memberships');
    expect(list.body[0].organization).not.toHaveProperty('employees');
  });

  it('returns the same reserved administrator capacity enforced for the tenant', async () => {
    const inviter = await prisma.user.findUniqueOrThrow({
      where: { normalizedEmail: 'phase-10-10-admin@konatech.test' },
    });
    await Promise.all(
      ['reserved-one', 'reserved-two'].map((key) =>
        prisma.invitation.create({
          data: {
            organizationId: alphaOrganizationId,
            invitedByUserId: inviter.id,
            email: `${key}@konatech.test`,
            role: MembershipRole.ADMIN,
            tokenHash: `platform-capacity-${key}`,
            expiresAt: new Date(Date.now() + 86_400_000),
          },
        }),
      ),
    );

    const platformUsage = await request(app.getHttpServer())
      .get(`/api/v1/platform/subscriptions/${alphaOrganizationId}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);
    expect(platformUsage.body.usage).toMatchObject({
      activeAdministrators: 1,
      pendingAdministratorInvitations: 2,
      administratorCapacityUsed: 3,
    });

    await request(app.getHttpServer())
      .post('/api/v1/organizations/current/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'over-capacity@konatech.test', role: 'ADMIN' })
      .expect(409);
  });

  it('returns global lifecycle, plan distribution and usage statistics', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/platform/dashboard')
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);
    expect(response.body.statistics).toMatchObject({
      totalOrganizations: expect.any(Number),
      byStatus: expect.objectContaining({
        ACTIVE: expect.any(Number),
        TRIALING: expect.any(Number),
        EXPIRED: expect.any(Number),
        SUSPENDED: expect.any(Number),
      }),
      byPlan: expect.objectContaining({
        STARTER: expect.any(Number),
        PRO: expect.any(Number),
        BUSINESS: expect.any(Number),
      }),
      usage: expect.objectContaining({
        activeEmployees: expect.any(Number),
        activeAttendanceSites: expect.any(Number),
      }),
    });
    expect(response.body.organizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organization: expect.objectContaining({ id: alphaOrganizationId }),
        }),
        expect.objectContaining({
          organization: expect.objectContaining({ id: betaOrganizationId }),
        }),
      ]),
    );
  });

  it('assigns a V1 plan and dates idempotently while preserving trial history', async () => {
    const startsAt = new Date(Date.now() - 86_400_000).toISOString();
    const endsAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const payload = {
      plan: 'PRO',
      startsAt,
      endsAt,
      operationId: 'phase-10-10-activate-alpha',
    };
    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${alphaOrganizationId}/activate`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send(payload)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${alphaOrganizationId}/activate`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send(payload)
      .expect(201);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/platform/subscriptions/${alphaOrganizationId}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200);
    expect(detail.body.subscription).toMatchObject({
      plan: 'PRO',
      status: 'ACTIVE',
      startsAt,
      endsAt,
      trialUsedAt: expect.any(String),
    });
    expect(
      detail.body.events.filter(
        (event: { type: string }) => event.type === 'ACTIVATED',
      ),
    ).toHaveLength(1);
    expect(detail.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'TRIAL_STARTED' }),
        expect.objectContaining({
          type: 'ACTIVATED',
          actorUserId: platformUserId,
        }),
      ]),
    );
  });

  it('allows platform activation of the BUSINESS commercial plan', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${alphaOrganizationId}/activate`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        plan: 'BUSINESS',
        endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      })
      .expect(201)
      .expect(({ body }) =>
        expect(body).toMatchObject({ plan: 'BUSINESS', status: 'ACTIVE' }),
      );
  });

  it('keeps BUSINESS subscriptions visible and permits a safe downgrade', async () => {
    await prisma.organizationSubscription.update({
      where: { organizationId: betaOrganizationId },
      data: {
        plan: 'BUSINESS',
        status: 'ACTIVE',
        endsAt: new Date(Date.now() + 30 * 86_400_000),
        graceEndsAt: new Date(Date.now() + 37 * 86_400_000),
      },
    });

    await request(app.getHttpServer())
      .get(`/api/v1/platform/subscriptions/${betaOrganizationId}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body.subscription).toMatchObject({
          plan: 'BUSINESS',
          status: 'ACTIVE',
        }),
      );

    await request(app.getHttpServer())
      .patch(`/api/v1/platform/subscriptions/${betaOrganizationId}/downgrade`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ plan: 'PRO', operationId: 'legacy-business-to-pro' })
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          plan: 'BUSINESS',
          pendingPlan: 'PRO',
          status: 'ACTIVE',
        }),
      );
  });

  it('suspends and reactivates through the existing lifecycle idempotently', async () => {
    const suspendPayload = { operationId: 'phase-10-10-suspend-alpha' };
    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${alphaOrganizationId}/suspend`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send(suspendPayload)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('SUSPENDED'));
    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${alphaOrganizationId}/suspend`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send(suspendPayload)
      .expect(201);
    expect(
      await prisma.subscriptionEvent.count({
        where: {
          subscriptionId: alphaOrganizationId,
          type: SubscriptionEventType.SUSPENDED,
          actorUserId: platformUserId,
        },
      }),
    ).toBe(1);

    const endsAt = new Date(Date.now() + 60 * 86_400_000).toISOString();
    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${alphaOrganizationId}/activate`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        plan: 'PRO',
        endsAt,
        operationId: 'phase-10-10-reactivate-alpha',
      })
      .expect(201)
      .expect(({ body }) =>
        expect(body).toMatchObject({ plan: 'PRO', status: 'ACTIVE' }),
      );
    expect(
      await prisma.subscriptionEvent.count({
        where: {
          subscriptionId: alphaOrganizationId,
          type: SubscriptionEventType.REACTIVATED,
        },
      }),
    ).toBe(1);
  });

  it('rejects invalid and unknown organization identifiers', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/platform/subscriptions/not-a-uuid')
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/platform/subscriptions/${UNKNOWN_ORGANIZATION_ID}`)
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(404);
    await request(app.getHttpServer())
      .post(
        `/api/v1/platform/subscriptions/${UNKNOWN_ORGANIZATION_ID}/activate`,
      )
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        plan: 'STARTER',
        endsAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .expect(404);
  });
});

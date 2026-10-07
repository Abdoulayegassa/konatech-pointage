import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  MembershipRole,
  PrismaClient,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/security/password.util';
import { EntitlementsService } from '../src/modules/subscriptions/entitlements.service';
import { prepareTestDatabase } from './test-database';

describe('Subscriptions and platform administration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let entitlements: EntitlementsService;

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
      }),
    );
    await app.init();
    entitlements = app.get(EntitlementsService);
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('creates one automatic fourteen-day PRO trial and isolates ADMIN/SUPER ADMIN subscription access', async () => {
    const password = 'KonatechSubscription123!';
    const passwordHash = await hashPassword(password);
    const organization = await prisma.organization.create({
      data: {
        name: 'Subscription tenant',
        slug: 'subscription-tenant',
        timezone: 'Etc/UTC',
      },
    });
    const otherOrganization = await prisma.organization.create({
      data: {
        name: 'Other subscription tenant',
        slug: 'other-subscription-tenant',
        timezone: 'Etc/UTC',
      },
    });
    const trial = await prisma.organizationSubscription.findUniqueOrThrow({
      where: { organizationId: organization.id },
      include: { events: true },
    });
    expect(trial).toMatchObject({
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.TRIALING,
      trialUsedAt: expect.any(Date),
    });
    expect(
      Math.round(
        (trial.endsAt.getTime() - trial.startsAt.getTime()) / 86_400_000,
      ),
    ).toBe(14);
    expect(trial.events).toHaveLength(1);

    const [admin, employee, otherAdmin, platformUser] = await Promise.all([
      prisma.user.create({
        data: {
          normalizedEmail: 'subscription-admin@konatech.test',
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          normalizedEmail: 'subscription-employee@konatech.test',
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          normalizedEmail: 'subscription-other-admin@konatech.test',
          passwordHash,
        },
      }),
      prisma.user.create({
        data: { normalizedEmail: 'platform-admin@konatech.test', passwordHash },
      }),
    ]);
    await Promise.all([
      prisma.membership.create({
        data: {
          organizationId: organization.id,
          userId: admin.id,
          role: MembershipRole.ADMIN,
        },
      }),
      prisma.membership.create({
        data: {
          organizationId: otherOrganization.id,
          userId: otherAdmin.id,
          role: MembershipRole.ADMIN,
        },
      }),
      prisma.membership.create({
        data: {
          organizationId: organization.id,
          userId: employee.id,
          role: MembershipRole.EMPLOYEE,
        },
      }),
      prisma.platformAdmin.create({ data: { userId: platformUser.id } }),
    ]);

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: admin.normalizedEmail, password })
      .expect(201);
    const platformLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: platformUser.normalizedEmail, password })
      .expect(201);
    const employeeLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: employee.normalizedEmail, password })
      .expect(201);
    const otherAdminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: otherAdmin.normalizedEmail, password })
      .expect(201);
    await request(app.getHttpServer())
      .get('/api/v1/organizations/current/subscription')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.subscription.plan).toBe('PRO'));
    await request(app.getHttpServer())
      .get('/api/v1/organizations/current/subscription')
      .set('Authorization', `Bearer ${employeeLogin.body.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/organizations/current/subscription')
      .set('Authorization', `Bearer ${otherAdminLogin.body.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.subscription.organizationId).toBe(otherOrganization.id);
        expect(body.subscription.organizationId).not.toBe(organization.id);
      });
    await request(app.getHttpServer())
      .get(`/api/v1/platform/subscriptions/${organization.id}`)
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/organizations/current/subscription')
      .set('Authorization', `Bearer ${platformLogin.body.accessToken}`)
      .expect(403);

    const activeEndsAt = new Date(Date.now() + 31 * 86_400_000).toISOString();
    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${organization.id}/activate`)
      .set('Authorization', `Bearer ${platformLogin.body.accessToken}`)
      .send({
        plan: 'PRO',
        endsAt: activeEndsAt,
        operationId: 'initial-activation',
        externalPaymentReference: 'EXT-001',
        internalNote: 'Manual activation',
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${organization.id}/activate`)
      .set('Authorization', `Bearer ${platformLogin.body.accessToken}`)
      .send({
        plan: 'PRO',
        endsAt: activeEndsAt,
        operationId: 'initial-activation',
      })
      .expect(201);
    const platformView = await request(app.getHttpServer())
      .get(`/api/v1/platform/subscriptions/${organization.id}`)
      .set('Authorization', `Bearer ${platformLogin.body.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/platform/organizations')
      .set('Authorization', `Bearer ${platformLogin.body.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              organization: expect.objectContaining({ id: organization.id }),
              subscription: expect.objectContaining({ plan: 'PRO' }),
              events: expect.any(Array),
            }),
          ]),
        );
      });
    expect(platformView.body.subscription).toMatchObject({
      plan: 'PRO',
      status: 'ACTIVE',
    });
    expect(platformView.body.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          metadata: expect.objectContaining({
            externalPaymentReference: 'EXT-001',
          }),
        }),
      ]),
    );

    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${organization.id}/activate`)
      .set('Authorization', `Bearer ${platformLogin.body.accessToken}`)
      .send({ plan: 'STARTER', endsAt: activeEndsAt })
      .expect(201);
    const site = await request(app.getHttpServer())
      .post('/api/v1/attendance-sites')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .send({
        name: 'Starter site',
        latitude: 12.37,
        longitude: -1.52,
        allowedRadiusMeters: 100,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/attendance-sites')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .send({
        name: 'Over quota site',
        latitude: 12.38,
        longitude: -1.53,
        allowedRadiusMeters: 100,
      })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/api/v1/attendance-sites/${site.body.id}/status`)
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .send({ isActive: false })
      .expect(200);

    await prisma.organizationSubscription.update({
      where: { organizationId: organization.id },
      data: {
        status: SubscriptionStatus.TRIALING,
        endsAt: new Date(Date.now() - 8 * 86_400_000),
        graceEndsAt: new Date(Date.now() - 1_000),
      },
    });
    await expect(
      entitlements.getForOrganization(organization.id),
    ).resolves.toMatchObject({
      subscription: { status: SubscriptionStatus.EXPIRED },
    });
    await expect(
      entitlements.getForOrganization(organization.id),
    ).resolves.toMatchObject({
      subscription: { status: SubscriptionStatus.SUSPENDED },
    });
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MembershipRole, PrismaClient } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/security/password.util';
import { prepareTestDatabase } from './test-database';

describe('Platform audit durability (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let platformToken: string;
  let tenantToken: string;
  let organizationId: string;
  let platformUserId: string;

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

    const password = 'PlatformAudit123!';
    const passwordHash = await hashPassword(password);
    const [organization, platformUser, tenantUser] = await Promise.all([
      prisma.organization.create({
        data: {
          name: 'Platform audit tenant',
          slug: 'platform-audit-tenant',
          timezone: 'Etc/UTC',
        },
      }),
      prisma.user.create({
        data: {
          normalizedEmail: 'platform-audit-admin@konatech.test',
          passwordHash,
        },
      }),
      prisma.user.create({
        data: {
          normalizedEmail: 'platform-audit-tenant@konatech.test',
          passwordHash,
        },
      }),
    ]);
    organizationId = organization.id;
    platformUserId = platformUser.id;
    await Promise.all([
      prisma.platformAdmin.create({ data: { userId: platformUser.id } }),
      prisma.membership.create({
        data: {
          organizationId,
          userId: tenantUser.id,
          role: MembershipRole.ADMIN,
        },
      }),
    ]);

    const [platformLogin, tenantLogin] = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: platformUser.normalizedEmail,
        password,
      }),
      request(app.getHttpServer()).post('/api/v1/auth/login').send({
        email: tenantUser.normalizedEmail,
        password,
      }),
    ]);
    expect(platformLogin.status).toBe(201);
    expect(tenantLogin.status).toBe(201);
    platformToken = platformLogin.body.accessToken as string;
    tenantToken = tenantLogin.body.accessToken as string;
  }, 30_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('persists authenticated platform attribution and rejects client-forged attribution', async () => {
    const endsAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${organizationId}/activate`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({
        plan: 'PRO',
        endsAt,
        operationId: 'platform-audit-activate',
        actorUserId: '00000000-0000-4000-8000-000000000001',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${organizationId}/activate`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({ plan: 'PRO', endsAt, operationId: 'tenant-platform-denial' })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${organizationId}/activate`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ plan: 'PRO', endsAt, operationId: 'platform-audit-activate' })
      .expect(201);

    const event = await prisma.platformAuditEvent.findFirstOrThrow({
      where: { organizationId, action: 'subscription.activate' },
    });
    expect(event).toMatchObject({
      actorUserId: platformUserId,
      organizationId,
      resource: 'organization_subscription',
      resourceId: organizationId,
      metadata: { plan: 'PRO' },
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/platform/subscriptions/${organizationId}/downgrade`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ plan: 'STARTER', operationId: 'platform-audit-downgrade' })
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/v1/platform/subscriptions/${organizationId}/suspend`)
      .set('Authorization', `Bearer ${platformToken}`)
      .send({ operationId: 'platform-audit-suspend' })
      .expect(201);

    const lifecycleEvents = await prisma.platformAuditEvent.findMany({
      where: { organizationId },
      orderBy: { occurredAt: 'asc' },
    });
    expect(lifecycleEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'subscription.activate',
          actorUserId: platformUserId,
          metadata: { plan: 'PRO' },
        }),
        expect.objectContaining({
          action: 'subscription.downgrade.schedule',
          actorUserId: platformUserId,
          metadata: { plan: 'STARTER' },
        }),
        expect.objectContaining({
          action: 'subscription.suspend',
          actorUserId: platformUserId,
        }),
      ]),
    );
  });

  it('enforces append-only platform audit records in the database', async () => {
    const event = await prisma.platformAuditEvent.findFirstOrThrow({
      where: { organizationId },
    });
    await expect(
      prisma.platformAuditEvent.update({
        where: { id: event.id },
        data: { action: 'forged-update' },
      }),
    ).rejects.toThrow('append-only');
    await expect(
      prisma.platformAuditEvent.delete({ where: { id: event.id } }),
    ).rejects.toThrow('append-only');
  });
});

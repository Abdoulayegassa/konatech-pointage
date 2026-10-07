import { INestApplication, ValidationPipe } from '@nestjs/common';
import { MembershipRole, PrismaClient, SubscriptionStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/security/password.util';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(60_000);

describe('Platform organization provisioning and first ADMIN (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  const password = 'ProvisionFirstAdmin123!';

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    const user = await prisma.user.create({
      data: {
        normalizedEmail: 'platform-provisioner@example.test',
        passwordHash: await hashPassword(password),
      },
    });
    await prisma.platformAdmin.create({ data: { userId: user.id } });

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
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('provisions the trial, accepts the first ADMIN, logs in, and creates the first site', async () => {
    const platformLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'platform-provisioner@example.test', password })
      .expect(201);

    const provisioned = await request(app.getHttpServer())
      .post('/api/v1/platform/organizations')
      .set('Authorization', `Bearer ${platformLogin.body.accessToken}`)
      .send({
        name: 'First Admin Organization',
        slug: 'first-admin-organization',
        timezone: 'Etc/UTC',
        firstAdminEmail: 'first-admin@example.test',
      })
      .expect(201);

    const organizationId = provisioned.body.organization.id as string;
    const invitationToken = provisioned.body.firstAdminInvitation.token as string;
    expect(provisioned.body.firstAdminInvitation.invitation.role).toBe(
      MembershipRole.ADMIN,
    );
    await expect(
      prisma.organizationSubscription.findUniqueOrThrow({
        where: { organizationId },
      }),
    ).resolves.toMatchObject({
      plan: 'PRO',
      status: SubscriptionStatus.TRIALING,
      trialUsedAt: expect.any(Date),
    });

    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: invitationToken, password: 'FirstAdminPassword123!' })
      .expect(201)
      .expect(({ body }) => {
        expect(body.membership.role).toBe(MembershipRole.ADMIN);
        expect(body.organization.id).toBe(organizationId);
      });

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'first-admin@example.test', password: 'FirstAdminPassword123!' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/attendance-sites')
      .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
      .send({
        name: 'First Site',
        latitude: 5.35,
        longitude: -4.02,
        allowedRadiusMeters: 100,
      })
      .expect(201);

    const existingOrganizationCount = await prisma.organization.count();
    await request(app.getHttpServer())
      .post('/api/v1/platform/organizations')
      .set('Authorization', `Bearer ${platformLogin.body.accessToken}`)
      .send({
        name: 'Duplicate Organization',
        slug: 'first-admin-organization',
        timezone: 'Etc/UTC',
        firstAdminEmail: 'another-admin@example.test',
      })
      // Prisma's unique slug error currently reaches the generic 500 filter.
      .expect(500);
    expect(await prisma.organization.count()).toBe(existingOrganizationCount);
  });

  it('leaves the invitation pending when its subscription is missing', async () => {
    const platformLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'platform-provisioner@example.test', password })
      .expect(201);
    const provisioned = await request(app.getHttpServer())
      .post('/api/v1/platform/organizations')
      .set('Authorization', `Bearer ${platformLogin.body.accessToken}`)
      .send({
        name: 'Missing Subscription Organization',
        slug: 'missing-subscription-organization',
        timezone: 'Etc/UTC',
        firstAdminEmail: 'missing-subscription-admin@example.test',
      })
      .expect(201);

    const organizationId = provisioned.body.organization.id as string;
    const invitationId = provisioned.body.firstAdminInvitation.invitation.id as string;
    const invitationToken = provisioned.body.firstAdminInvitation.token as string;
    await prisma.subscriptionEvent.deleteMany({
      where: { subscriptionId: organizationId },
    });
    await prisma.organizationSubscription.delete({
      where: { organizationId },
    });

    await request(app.getHttpServer())
      .post('/api/v1/invitations/accept')
      .send({ token: invitationToken, password: 'RetryAdminPassword123!' })
      .expect(403);
    expect(
      await prisma.invitation.findUniqueOrThrow({
        where: { id: invitationId },
        select: { acceptedAt: true },
      }),
    ).toEqual({ acceptedAt: null });
    expect(
      await prisma.user.findUnique({
        where: { normalizedEmail: 'missing-subscription-admin@example.test' },
      }),
    ).toBeNull();
  });
});

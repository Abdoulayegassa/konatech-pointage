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
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30_000);

describe('Attendance-site management (e2e)', () => {
  const password = 'AttendanceSites123!';
  let app: INestApplication;
  let prisma: PrismaClient;
  let passwordHash: string;
  let sequence = 0;

  beforeAll(async () => {
    await prepareTestDatabase();
    passwordHash = await hashPassword(password);
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
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function createTenant(
    plan: SubscriptionPlan = SubscriptionPlan.PRO,
    roles: MembershipRole[] = [
      MembershipRole.ADMIN,
      MembershipRole.EMPLOYEE,
    ],
  ) {
    sequence += 1;
    const organization = await prisma.organization.create({
      data: {
        name: `Site management ${sequence}`,
        slug: `site-management-${sequence}`,
        timezone: 'Etc/UTC',
      },
    });
    await prisma.organizationSubscription.update({
      where: { organizationId: organization.id },
      data: {
        plan,
        status: SubscriptionStatus.ACTIVE,
        endsAt: new Date(Date.now() + 30 * 86_400_000),
        graceEndsAt: new Date(Date.now() + 37 * 86_400_000),
      },
    });

    const identities = await Promise.all(
      roles.map(async (role, index) => {
        const user = await prisma.user.create({
          data: {
            normalizedEmail: `site-${sequence}-${index}@example.test`,
            passwordHash,
          },
        });
        await prisma.membership.create({
          data: { organizationId: organization.id, userId: user.id, role },
        });
        const login = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: user.normalizedEmail, password })
          .expect(201);
        return { role, token: login.body.accessToken as string };
      }),
    );

    return {
      organization,
      token(role: MembershipRole) {
        return identities.find((identity) => identity.role === role)!.token;
      },
    };
  }

  const sitePayload = (name: string) => ({
    name,
    latitude: 5.359952,
    longitude: -4.008256,
    allowedRadiusMeters: 120,
  });

  it('returns an explicit empty list for an ADMIN tenant without sites', async () => {
    const tenant = await createTenant();
    const response = await request(app.getHttpServer())
      .get('/api/v1/attendance-sites')
      .set('Authorization', `Bearer ${tenant.token(MembershipRole.ADMIN)}`)
      .expect(200);

    expect(response.body).toEqual([]);
  });

  it('allows ADMIN to create, edit, deactivate and reactivate sites', async () => {
    const tenant = await createTenant();
    const created = await request(app.getHttpServer())
      .post('/api/v1/attendance-sites')
      .set('Authorization', `Bearer ${tenant.token(MembershipRole.ADMIN)}`)
      .send(sitePayload('Siège'))
      .expect(201);

    expect(created.body).toMatchObject({
      name: 'Siège',
      isActive: true,
      publicId: expect.any(String),
    });

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/attendance-sites/${created.body.id}`)
      .set('Authorization', `Bearer ${tenant.token(MembershipRole.ADMIN)}`)
      .send({ name: 'Siège principal', allowedRadiusMeters: 180 })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: 'Siège principal',
      allowedRadiusMeters: 180,
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/attendance-sites/${created.body.id}/status`)
      .set('Authorization', `Bearer ${tenant.token(MembershipRole.ADMIN)}`)
      .send({ isActive: false })
      .expect(200)
      .expect(({ body }) => expect(body.isActive).toBe(false));

    await request(app.getHttpServer())
      .patch(`/api/v1/attendance-sites/${created.body.id}/status`)
      .set('Authorization', `Bearer ${tenant.token(MembershipRole.ADMIN)}`)
      .send({ isActive: true })
      .expect(200)
      .expect(({ body }) => expect(body.isActive).toBe(true));
  });

  it('rejects site-management writes from an EMPLOYEE', async () => {
    const tenant = await createTenant();
    await request(app.getHttpServer())
      .post('/api/v1/attendance-sites')
      .set('Authorization', `Bearer ${tenant.token(MembershipRole.EMPLOYEE)}`)
      .send(sitePayload('Interdit'))
      .expect(403);
  });

  it('keeps update and status mutations inside the authenticated tenant', async () => {
    const first = await createTenant();
    const second = await createTenant();
    const foreignSite = await prisma.attendanceSite.create({
      data: {
        organizationId: second.organization.id,
        ...sitePayload('Site étranger'),
      },
    });
    const authorization = `Bearer ${first.token(MembershipRole.ADMIN)}`;

    await request(app.getHttpServer())
      .patch(`/api/v1/attendance-sites/${foreignSite.id}`)
      .set('Authorization', authorization)
      .send({ name: 'Intrusion' })
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/attendance-sites/${foreignSite.id}/status`)
      .set('Authorization', authorization)
      .send({ isActive: false })
      .expect(404);
    await expect(
      prisma.attendanceSite.findUniqueOrThrow({
        where: { id: foreignSite.id },
      }),
    ).resolves.toMatchObject({ name: 'Site étranger', isActive: true });
  });

  it('enforces the plan quota for creation and reactivation', async () => {
    const tenant = await createTenant(SubscriptionPlan.STARTER);
    const authorization = `Bearer ${tenant.token(MembershipRole.ADMIN)}`;
    const first = await request(app.getHttpServer())
      .post('/api/v1/attendance-sites')
      .set('Authorization', authorization)
      .send(sitePayload('Premier site'))
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/attendance-sites')
      .set('Authorization', authorization)
      .send(sitePayload('Site en trop'))
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/v1/attendance-sites/${first.body.id}/status`)
      .set('Authorization', authorization)
      .send({ isActive: false })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/attendance-sites')
      .set('Authorization', authorization)
      .send(sitePayload('Second site'))
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/attendance-sites/${first.body.id}/status`)
      .set('Authorization', authorization)
      .send({ isActive: true })
      .expect(409);
  });

  it('rejects blank names and invalid GPS values server-side', async () => {
    const tenant = await createTenant();
    const authorization = `Bearer ${tenant.token(MembershipRole.ADMIN)}`;

    await request(app.getHttpServer())
      .post('/api/v1/attendance-sites')
      .set('Authorization', authorization)
      .send(sitePayload('   '))
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/attendance-sites')
      .set('Authorization', authorization)
      .send({ ...sitePayload('GPS invalide'), latitude: 91 })
      .expect(400);
  });
});

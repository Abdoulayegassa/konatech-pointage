import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  PrismaClient,
  UserStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/security/password.util';
import { AuthService } from '../src/modules/auth/auth.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

describe('API rate limiting and abuse protection (e2e)', () => {
  const password = 'RateLimitPassword123!';
  let app: INestApplication;
  let authService: AuthService;
  let passwordHash: string;
  let prisma: PrismaClient;
  let sequence = 0;

  beforeAll(async () => {
    await prepareTestDatabase();
    passwordHash = await hashPassword(password);
    prisma = new PrismaClient();

    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    authService = app.get(AuthService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function createAdmin() {
    sequence += 1;
    const organization = await prisma.organization.create({
      data: {
        name: `Rate limit organization ${sequence}`,
        slug: `rate-limit-organization-${sequence}`,
        timezone: 'Etc/UTC',
      },
    });
    const user = await prisma.user.create({
      data: {
        normalizedEmail: `rate-limit-admin-${sequence}@example.test`,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });
    const membership = await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    });
    const token = authService.createAccountToken({
      userId: user.id,
      membershipId: membership.id,
      organizationId: organization.id,
      userVersion: user.userVersion,
      membershipVersion: membership.membershipVersion,
    });

    return { membership, organization, token, user };
  }

  function authorization(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  function expectGenericRateLimit(response: request.Response) {
    expect(response.status).toBe(429);
    const message = String(response.body.message ?? '').toLowerCase();
    expect(message).not.toContain('account');
    expect(message).not.toContain('organization');
    expect(message).not.toContain('membership');
    expect(message).not.toContain('employee');
  }

  it('blocks repeated password attempts and cannot be reset with forged identity fields', async () => {
    const targetEmail = 'rate-limit-target@example.test';

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: targetEmail,
        password: 'WrongPasswordWithForgedFields!',
        organizationId: 'forged-organization',
        userId: 'forged-user',
        membershipId: 'forged-membership',
        employeeId: 'forged-employee',
      })
      .expect(400);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: targetEmail, password: `WrongPassword${attempt}!` })
        .expect(401);
    }

    const blocked = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: targetEmail, password: 'WrongPassword6!' });
    expectGenericRateLimit(blocked);

    const legitimate = await createAdmin();
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: legitimate.user.normalizedEmail, password })
      .expect(201);
  });

  it('blocks repeated PIN attempts with a generic response', async () => {
    let blocked: request.Response | undefined;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/attendance-entry/login')
        .send({ pinCode: '9999' });
      if (response.status === 429) {
        blocked = response;
        break;
      }
      expect(response.status).toBe(401);
    }

    expect(blocked).toBeDefined();
    expectGenericRateLimit(blocked!);
  });

  it('limits invalid invitation-token reuse without exposing invitation state', async () => {
    let blocked: request.Response | undefined;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/invitations/accept')
        .send({
          token: 'invalid-invitation-token-with-sufficient-length',
          password,
        });
      if (response.status === 429) {
        blocked = response;
        break;
      }
      expect(response.status).toBe(400);
    }

    expect(blocked).toBeDefined();
    expectGenericRateLimit(blocked!);
  });

  it('limits sensitive administrative flooding without blocking unrelated legitimate reads', async () => {
    const admin = await createAdmin();
    let blocked: request.Response | undefined;

    for (let attempt = 0; attempt < 61; attempt += 1) {
      const response = await request(app.getHttpServer())
        .post('/api/v1/schedules')
        .set(authorization(admin.token))
        .send({});
      if (response.status === 429) {
        blocked = response;
        break;
      }
      expect(response.status).toBe(400);
    }

    expect(blocked).toBeDefined();
    expectGenericRateLimit(blocked!);

    await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set(authorization(admin.token))
      .expect(200);
  });

  it('does not reset an account bucket after authentication state changes', async () => {
    const admin = await createAdmin();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: admin.user.normalizedEmail,
          password: `WrongStatePassword${attempt}!`,
        })
        .expect(401);
    }

    await prisma.membership.update({
      where: { id: admin.membership.id },
      data: {
        status: MembershipStatus.SUSPENDED,
        membershipVersion: { increment: 1 },
      },
    });

    const blocked = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: admin.user.normalizedEmail, password });
    expectGenericRateLimit(blocked);
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  AccessRole,
  MembershipRole,
  MembershipStatus,
  Prisma,
  PrismaClient,
  UserStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditLogService } from '../src/common/audit/audit-log.service';
import { hashPassword } from '../src/common/security/password.util';
import { AuthService } from '../src/modules/auth/auth.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

describe('Organization administration and tenant lifecycle (e2e)', () => {
  const password = 'OrganizationAdmin123!';
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  const legacyEmployeeIds: string[] = [];
  let app: INestApplication;
  let auditLogService: AuditLogService;
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
    auditLogService = app.get(AuditLogService);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.employee.deleteMany({
        where: {
          OR: [
            { organizationId: { in: organizationIds } },
            { id: { in: legacyEmployeeIds } },
          ],
        },
      });
      await prisma.membership.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.subscriptionEvent.deleteMany({
        where: { subscriptionId: { in: organizationIds } },
      });
      await prisma.organizationSubscription.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
      await prisma.platformAdmin.deleteMany({
        where: { userId: { in: userIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  async function createAccount(role: MembershipRole) {
    sequence += 1;
    const suffix = String(sequence).padStart(3, '0');
    const organization = await prisma.organization.create({
      data: {
        name: `Organization Profile ${suffix}`,
        slug: `organization-profile-${suffix}`,
        timezone: 'Etc/UTC',
        logoUrl: `https://example.test/logo-${suffix}.png`,
        primaryColor: '#112233',
      },
    });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: {
        normalizedEmail: `organization-user-${suffix}@example.test`,
        passwordHash,
      },
    });
    userIds.push(user.id);
    const membership = await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role,
      },
    });
    const login = await authService.login({
      email: user.normalizedEmail,
      password,
    });
    if ('organizationSelectionRequired' in login) {
      throw new Error('Expected a single-organization account token.');
    }

    return {
      membership,
      organization,
      token: login.accessToken,
      user,
    };
  }

  function authorized(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  it.each([MembershipRole.ADMIN, MembershipRole.EMPLOYEE])(
    'allows %s to read only the current organization profile',
    async (role) => {
      const fixture = await createAccount(role);
      if (role === MembershipRole.EMPLOYEE) {
        await prisma.employee.create({
          data: {
            employeeIdentifier: `ORG-EMPLOYEE-${++sequence}`,
            firstName: 'Organization',
            lastName: 'Employee',
            email: `organization-employee-${sequence}@example.test`,
            role: 'Employee',
            accessRole: AccessRole.EMPLOYEE,
            passwordHash,
            organizationId: fixture.organization.id,
            userId: fixture.user.id,
          },
        });
      }

      const response = await request(app.getHttpServer())
        .get('/api/v1/organizations/current')
        .set(authorized(fixture.token))
        .expect(200);

      expect(response.body).toEqual({
        id: fixture.organization.id,
        name: fixture.organization.name,
        slug: fixture.organization.slug,
        status: fixture.organization.status,
        timezone: fixture.organization.timezone,
        logoUrl: fixture.organization.logoUrl,
        primaryColor: fixture.organization.primaryColor,
        createdAt: fixture.organization.createdAt.toISOString(),
        updatedAt: fixture.organization.updatedAt.toISOString(),
      });
      expect(response.body).not.toHaveProperty('memberships');
      expect(response.body).not.toHaveProperty('invitations');
    },
  );

  it('allows an ADMIN without Employee to update the profile and records a User actor', async () => {
    const fixture = await createAccount(MembershipRole.ADMIN);
    const auditSpy = jest.spyOn(auditLogService, 'logAdminAction');

    const response = await request(app.getHttpServer())
      .patch('/api/v1/organizations/current')
      .set(authorized(fixture.token))
      .send({
        name: 'Admin-managed organization',
        timezone: 'Africa/Abidjan',
        logoUrl: null,
        primaryColor: '#a1b2c3',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      id: fixture.organization.id,
      name: 'Admin-managed organization',
      timezone: 'Africa/Abidjan',
      logoUrl: null,
      primaryColor: '#A1B2C3',
      slug: fixture.organization.slug,
    });
    const reread = await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set(authorized(fixture.token))
      .expect(200);
    expect(reread.body.timezone).toBe('Africa/Abidjan');
    expect(auditSpy).toHaveBeenLastCalledWith({
      actor: {
        actorType: 'USER',
        actorId: fixture.user.id,
        organizationId: fixture.organization.id,
        role: MembershipRole.ADMIN,
        employeeId: null,
      },
      action: 'organization.profile.update',
      resource: 'organization',
      resourceId: fixture.organization.id,
      metadata: {
        changedFields: ['name', 'timezone', 'logoUrl', 'primaryColor'],
      },
    });
    expect(
      await prisma.employee.count({
        where: { organizationId: fixture.organization.id },
      }),
    ).toBe(0);
    auditSpy.mockRestore();
  });

  it('allows an ADMIN without Employee to update operational profile fields', async () => {
    const fixture = await createAccount(MembershipRole.ADMIN);

    await request(app.getHttpServer())
      .patch('/api/v1/organizations/current')
      .set(authorized(fixture.token))
      .send({ name: 'Admin-managed organization' })
      .expect(200);

    expect(
      await prisma.organization.findUnique({
        where: { id: fixture.organization.id },
        select: { name: true, slug: true },
      }),
    ).toEqual({
      name: 'Admin-managed organization',
      slug: fixture.organization.slug,
    });
    expect(
      await prisma.employee.count({
        where: { organizationId: fixture.organization.id },
      }),
    ).toBe(0);
  });

  it('rejects invalid organization profile input without mutation', async () => {
    const fixture = await createAccount(MembershipRole.ADMIN);

    for (const payload of [
      {},
      { name: ' ' },
      { name: 'x'.repeat(121) },
      { timezone: 'Not/A_Timezone' },
    ]) {
      const response = await request(app.getHttpServer())
        .patch('/api/v1/organizations/current')
        .set(authorized(fixture.token))
        .send(payload);
      expect({ payload, status: response.status }).toEqual({
        payload,
        status: 400,
      });
    }

    expect(
      await prisma.organization.findUnique({
        where: { id: fixture.organization.id },
        select: { name: true, timezone: true },
      }),
    ).toEqual({
      name: fixture.organization.name,
      timezone: fixture.organization.timezone,
    });
  });

  it.each([MembershipRole.EMPLOYEE])(
    'denies organization profile updates to %s without mutation',
    async (role) => {
      const fixture = await createAccount(role);

      await request(app.getHttpServer())
        .patch('/api/v1/organizations/current')
        .set(authorized(fixture.token))
        .send({ name: 'Forbidden update' })
        .expect(403);

      expect(
        await prisma.organization.findUnique({
          where: { id: fixture.organization.id },
          select: { name: true },
        }),
      ).toEqual({ name: fixture.organization.name });
    },
  );

  it('does not grant a SUPER ADMIN implicit access to tenant organization APIs', async () => {
    sequence += 1;
    const user = await prisma.user.create({
      data: {
        normalizedEmail: `organization-platform-admin-${sequence}@example.test`,
        passwordHash,
        platformAdmin: { create: {} },
      },
    });
    userIds.push(user.id);
    const login = await authService.login({
      email: user.normalizedEmail,
      password,
    });
    if (
      !('platformAdmin' in login) ||
      login.platformAdmin !== true ||
      !('accessToken' in login)
    ) {
      throw new Error('Expected a SUPER ADMIN platform token.');
    }

    await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set(authorized(login.accessToken))
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/current')
      .set(authorized(login.accessToken))
      .send({ name: 'Forbidden platform organization update' })
      .expect(403);
  });

  it('uses AuthenticationContext for reads and rejects body, URL and resource-ID spoofing', async () => {
    const organizationA = await createAccount(MembershipRole.ADMIN);
    const organizationB = await createAccount(MembershipRole.ADMIN);

    const scopedRead = await request(app.getHttpServer())
      .get(
        `/api/v1/organizations/current?organizationId=${organizationB.organization.id}`,
      )
      .set(authorized(organizationA.token))
      .expect(200);
    expect(scopedRead.body.id).toBe(organizationA.organization.id);

    for (const payload of [
      {
        name: 'Spoofed body organization',
        organizationId: organizationB.organization.id,
      },
      { name: 'Spoofed resource ID', id: organizationB.organization.id },
    ]) {
      await request(app.getHttpServer())
        .patch('/api/v1/organizations/current')
        .set(authorized(organizationA.token))
        .send(payload)
        .expect(400);
    }

    await request(app.getHttpServer())
      .get(`/api/v1/organizations/${organizationB.organization.id}`)
      .set(authorized(organizationA.token))
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/organizations/${organizationB.organization.id}`)
      .set(authorized(organizationA.token))
      .send({ name: 'Forbidden URL update' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/organizations/${organizationB.organization.id}`)
      .set(authorized(organizationA.token))
      .expect(404);

    expect(
      await prisma.organization.findUnique({
        where: { id: organizationB.organization.id },
        select: { name: true },
      }),
    ).toEqual({ name: organizationB.organization.name });
  });

  it('keeps slug, status, IDs and timestamps immutable through the API', async () => {
    const fixture = await createAccount(MembershipRole.ADMIN);
    const foreign = await createAccount(MembershipRole.ADMIN);
    const immutablePayloads = [
      { slug: foreign.organization.slug },
      { status: 'ARCHIVED' },
      { id: foreign.organization.id },
      { createdAt: new Date().toISOString() },
      { updatedAt: new Date().toISOString() },
    ];

    for (const payload of immutablePayloads) {
      await request(app.getHttpServer())
        .patch('/api/v1/organizations/current')
        .set(authorized(fixture.token))
        .send(payload)
        .expect(400);
    }

    const persisted = await prisma.organization.findUniqueOrThrow({
      where: { id: fixture.organization.id },
    });
    expect(persisted.slug).toBe(fixture.organization.slug);
    expect(persisted.status).toBe(fixture.organization.status);
    expect(persisted.name).toBe(fixture.organization.name);

    await expect(
      prisma.organization.create({
        data: {
          name: 'Duplicate slug organization',
          slug: fixture.organization.slug,
          timezone: 'Etc/UTC',
        },
      }),
    ).rejects.toMatchObject({
      code: 'P2002',
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });

  it.each([
    ['revoked Membership', 'membership-revoked'],
    ['suspended Membership', 'membership-suspended'],
    ['stale membershipVersion', 'membership-version'],
    ['disabled User', 'user-disabled'],
  ] as const)('rejects a token after %s', async (_label, mutation) => {
    const fixture = await createAccount(MembershipRole.ADMIN);

    if (mutation === 'membership-revoked') {
      await prisma.membership.update({
        where: { id: fixture.membership.id },
        data: { status: MembershipStatus.REVOKED },
      });
    } else if (mutation === 'membership-suspended') {
      await prisma.membership.update({
        where: { id: fixture.membership.id },
        data: { status: MembershipStatus.SUSPENDED },
      });
    } else if (mutation === 'membership-version') {
      await prisma.membership.update({
        where: { id: fixture.membership.id },
        data: { membershipVersion: { increment: 1 } },
      });
    } else {
      await prisma.user.update({
        where: { id: fixture.user.id },
        data: { status: UserStatus.DISABLED },
      });
    }

    await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set(authorized(fixture.token))
      .expect(401);
  });

  it('keeps Legacy authentication independent and denies SaaS organization administration', async () => {
    sequence += 1;
    const employee = await prisma.employee.create({
      data: {
        employeeIdentifier: `ORG-LEGACY-${sequence}`,
        firstName: 'Legacy',
        lastName: 'Administrator',
        email: `organization-legacy-${sequence}@example.test`,
        role: 'Administrator',
        accessRole: AccessRole.ADMIN,
        passwordHash,
        organizationId: null,
        userId: null,
      },
    });
    legacyEmployeeIds.push(employee.id);
    const login = await authService.login({
      email: employee.email,
      password,
    });
    if ('organizationSelectionRequired' in login) {
      throw new Error('Expected a Legacy token.');
    }

    await request(app.getHttpServer())
      .get('/api/v1/organizations/current')
      .set(authorized(login.accessToken))
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/current')
      .set(authorized(login.accessToken))
      .send({ name: 'Forbidden Legacy organization' })
      .expect(401);

    expect(
      await prisma.employee.findUnique({
        where: { id: employee.id },
        select: { organizationId: true, userId: true },
      }),
    ).toEqual({ organizationId: null, userId: null });
  });
});

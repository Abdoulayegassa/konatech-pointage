import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  AccessRole,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  UserStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  hashPassword,
  hashPinCode,
} from '../src/common/security/password.util';
import { verifyJwtToken } from '../src/common/security/jwt.util';
import { AuthService } from '../src/modules/auth/auth.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

type SaasFixtureOptions = {
  employeeActive?: boolean;
  employeeRole?: AccessRole;
  membershipRole?: MembershipRole;
  membershipStatus?: MembershipStatus;
  organizationStatus?: OrganizationStatus;
  siteCount?: number;
  userStatus?: UserStatus;
  withEmployee?: boolean;
  withSecondMembership?: boolean;
};

describe('SaaS login boundary (e2e)', () => {
  const password = 'SaaSLoginPassword123!';
  let passwordHash: string;
  let app: INestApplication;
  let prisma: PrismaClient;
  let authService: AuthService;
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

  async function createSaasFixture(options: SaasFixtureOptions = {}) {
    sequence += 1;
    const suffix = String(sequence).padStart(3, '0');
    const pinCode = String(6000 + sequence);
    const organization = await prisma.organization.create({
      data: {
        name: `Auth SaaS Organization ${suffix}`,
        slug: `auth-saas-organization-${suffix}`,
        timezone: 'Etc/UTC',
        status: options.organizationStatus ?? OrganizationStatus.ACTIVE,
      },
    });
    const user = await prisma.user.create({
      data: {
        normalizedEmail: `auth-saas-user-${suffix}@example.test`,
        passwordHash,
        status: options.userStatus ?? UserStatus.ACTIVE,
      },
    });
    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: options.membershipRole ?? MembershipRole.ADMIN,
        status: options.membershipStatus ?? MembershipStatus.ACTIVE,
      },
    });
    const employee =
      options.withEmployee === false
        ? null
        : await prisma.employee.create({
            data: {
              employeeIdentifier: `AUTH-SAAS-${suffix}`,
              firstName: 'SaaS',
              lastName: `Employee ${suffix}`,
              email: `auth-saas-employee-${suffix}@example.test`,
              role: 'Employee',
              accessRole: options.employeeRole ?? AccessRole.EMPLOYEE,
              passwordHash,
              pinCodeHash: await hashPinCode(pinCode),
              isActive: options.employeeActive ?? true,
              userId: user.id,
              organizationId: organization.id,
            },
          });
    const sites = [];

    for (let index = 0; index < (options.siteCount ?? 1); index += 1) {
      sites.push(
        await prisma.attendanceSite.create({
          data: {
            organizationId: organization.id,
            name: `Auth site ${suffix}-${index}`,
            latitude: 5.35,
            longitude: -4.01,
            allowedRadiusMeters: 100,
          },
        }),
      );
    }

    let secondOrganizationId: string | null = null;
    if (options.withSecondMembership) {
      const secondOrganization = await prisma.organization.create({
        data: {
          name: `Auth SaaS Second Organization ${suffix}`,
          slug: `auth-saas-second-organization-${suffix}`,
          timezone: 'Etc/UTC',
        },
      });
      secondOrganizationId = secondOrganization.id;
      await prisma.membership.create({
        data: {
          userId: user.id,
          organizationId: secondOrganization.id,
          role: MembershipRole.MEMBER,
        },
      });
    }

    return {
      employee,
      membership,
      organization,
      password,
      pinCode,
      secondOrganizationId,
      sites,
      user,
    };
  }

  async function createLegacyEmployee() {
    sequence += 1;
    const suffix = String(sequence).padStart(3, '0');
    const pinCode = String(7000 + sequence);
    const employee = await prisma.employee.create({
      data: {
        employeeIdentifier: `AUTH-LEGACY-${suffix}`,
        firstName: 'Legacy',
        lastName: `Employee ${suffix}`,
        email: `auth-legacy-${suffix}@example.test`,
        role: 'Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
        pinCodeHash: await hashPinCode(pinCode),
      },
    });

    return { employee, pinCode };
  }

  function decode(token: string) {
    return verifyJwtToken(token, process.env.JWT_SECRET!);
  }

  it('keeps legacy email/password login functional without SaaS identity', async () => {
    const { employee } = await createLegacyEmployee();
    const result = await authService.login({ email: employee.email, password });

    expect(decode(result.accessToken)).toMatchObject({
      sub: employee.id,
      email: employee.email,
    });
    expect(decode(result.accessToken)).not.toHaveProperty('purpose');
  });

  it('issues a SaaS account token to a linked Employee', async () => {
    const fixture = await createSaasFixture();
    const result = await authService.login({
      email: fixture.employee!.email,
      password,
    });

    expect(decode(result.accessToken)).toMatchObject({
      sub: fixture.user.id,
      membershipId: fixture.membership.id,
      organizationId: fixture.organization.id,
      purpose: 'account',
    });
  });

  it('issues a SaaS ADMIN membership token to a linked ADMIN Employee', async () => {
    const fixture = await createSaasFixture({
      employeeRole: AccessRole.ADMIN,
      membershipRole: MembershipRole.ADMIN,
    });
    const result = await authService.login({
      email: fixture.employee!.email,
      password,
    });

    expect(decode(result.accessToken)).toMatchObject({
      membershipId: fixture.membership.id,
      purpose: 'account',
    });
    expect(
      (result as typeof result & { membership: { role: MembershipRole } })
        .membership.role,
    ).toBe(MembershipRole.ADMIN);
  });

  it('issues a SaaS MEMBER token independently of Employee.role', async () => {
    const fixture = await createSaasFixture({
      membershipRole: MembershipRole.MEMBER,
    });
    const result = await authService.login({
      email: fixture.employee!.email,
      password,
    });

    expect(
      (result as typeof result & { membership: { role: MembershipRole } })
        .membership.role,
    ).toBe(MembershipRole.MEMBER);
    expect(decode(result.accessToken)).toMatchObject({ purpose: 'account' });
  });

  it('rejects an inactive Employee', async () => {
    const fixture = await createSaasFixture({ employeeActive: false });
    await expect(
      authService.login({ email: fixture.employee!.email, password }),
    ).rejects.toThrow('Invalid credentials.');
  });

  it('rejects an inactive User', async () => {
    const fixture = await createSaasFixture({
      userStatus: UserStatus.DISABLED,
    });
    await expect(
      authService.login({ email: fixture.employee!.email, password }),
    ).rejects.toThrow('Account is no longer active.');
  });

  it('rejects a suspended Membership', async () => {
    const fixture = await createSaasFixture({
      membershipStatus: MembershipStatus.SUSPENDED,
    });
    await expect(
      authService.login({ email: fixture.employee!.email, password }),
    ).rejects.toThrow('No active organization membership.');
  });

  it('rejects a suspended Organization', async () => {
    const fixture = await createSaasFixture({
      organizationStatus: OrganizationStatus.SUSPENDED,
    });
    await expect(
      authService.login({ email: fixture.employee!.email, password }),
    ).rejects.toThrow('No active organization membership.');
  });

  it('automatically selects one active organization', async () => {
    const fixture = await createSaasFixture();
    const result = await authService.login({
      email: fixture.employee!.email,
      password,
    });
    expect(
      (result as typeof result & { organization: { id: string } }).organization
        .id,
    ).toBe(fixture.organization.id);
  });

  it('requires explicit selection when several organizations are active', async () => {
    const fixture = await createSaasFixture({ withSecondMembership: true });
    await expect(
      authService.login({ email: fixture.employee!.email, password }),
    ).rejects.toThrow('An explicit organization selection is required.');
  });

  it('rejects cross-organization selection', async () => {
    const fixture = await createSaasFixture();
    const foreign = await createSaasFixture();
    await expect(
      authService.selectOrganization(fixture.user.id, foreign.organization.id),
    ).rejects.toThrow('No active organization membership.');
  });

  it('rejects User and Membership substitution', async () => {
    const fixture = await createSaasFixture();
    const foreign = await createSaasFixture();
    const token = authService.createAccountToken({
      userId: fixture.user.id,
      membershipId: foreign.membership.id,
      organizationId: foreign.organization.id,
      userVersion: fixture.user.userVersion,
      membershipVersion: foreign.membership.membershipVersion,
    });
    await expect(authService.getAuthenticationFromToken(token)).rejects.toThrow(
      'Membership is no longer active.',
    );
  });

  it('rejects Organization substitution', async () => {
    const fixture = await createSaasFixture();
    const foreign = await createSaasFixture();
    const token = authService.createAccountToken({
      userId: fixture.user.id,
      membershipId: fixture.membership.id,
      organizationId: foreign.organization.id,
      userVersion: fixture.user.userVersion,
      membershipVersion: fixture.membership.membershipVersion,
    });
    await expect(authService.getAuthenticationFromToken(token)).rejects.toThrow(
      'Membership is no longer active.',
    );
  });

  it('rejects a User version mismatch', async () => {
    const fixture = await createSaasFixture();
    const result = await authService.login({
      email: fixture.employee!.email,
      password,
    });
    await prisma.user.update({
      where: { id: fixture.user.id },
      data: { userVersion: 2 },
    });
    await expect(
      authService.getAuthenticationFromToken(result.accessToken),
    ).rejects.toThrow('Account is no longer active.');
  });

  it('rejects a Membership version mismatch', async () => {
    const fixture = await createSaasFixture();
    const result = await authService.login({
      email: fixture.employee!.email,
      password,
    });
    await prisma.membership.update({
      where: { id: fixture.membership.id },
      data: { membershipVersion: 2 },
    });
    await expect(
      authService.getAuthenticationFromToken(result.accessToken),
    ).rejects.toThrow('Membership is no longer active.');
  });

  it('issues an attendance_entry token for a SaaS-linked PIN', async () => {
    const fixture = await createSaasFixture();
    const result = await authService.loginForAttendanceEntry({
      pinCode: fixture.pinCode,
    });
    expect(decode(result.accessToken)).toMatchObject({
      purpose: 'attendance_entry',
    });
  });

  it('preserves the legacy PIN behavior', async () => {
    const fixture = await createLegacyEmployee();
    const result = await authService.loginForAttendanceEntry({
      pinCode: fixture.pinCode,
    });
    expect(decode(result.accessToken)).not.toHaveProperty('purpose');
  });

  it('puts the Employee organization in the SaaS attendance token', async () => {
    const fixture = await createSaasFixture();
    const result = await authService.loginForAttendanceEntry({
      pinCode: fixture.pinCode,
    });
    expect(decode(result.accessToken)).toMatchObject({
      organizationId: fixture.organization.id,
    });
  });

  it('puts the server-resolved AttendanceSite in the SaaS attendance token', async () => {
    const fixture = await createSaasFixture();
    const result = await authService.loginForAttendanceEntry({
      pinCode: fixture.pinCode,
    });
    expect(decode(result.accessToken)).toMatchObject({
      attendanceSiteId: fixture.sites[0].id,
    });
  });

  it('rejects client organization spoofing on PIN login', async () => {
    const fixture = await createSaasFixture();
    const foreign = await createSaasFixture();
    await request(app.getHttpServer())
      .post('/api/v1/auth/attendance-entry/login')
      .send({
        pinCode: fixture.pinCode,
        organizationId: foreign.organization.id,
      })
      .expect(400);
  });

  it('preserves /auth/me for a legacy token', async () => {
    const fixture = await createLegacyEmployee();
    const login = await authService.login({
      email: fixture.employee.email,
      password,
    });
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200);
    expect(response.body).toMatchObject({
      id: fixture.employee.id,
      email: fixture.employee.email,
    });
  });

  it('returns SaaS account, Membership, Organization and Employee from /auth/me', async () => {
    const fixture = await createSaasFixture();
    const login = await authService.login({
      email: fixture.employee!.email,
      password,
    });
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200);
    expect(response.body).toMatchObject({
      id: fixture.employee!.id,
      employee: { id: fixture.employee!.id },
      account: { id: fixture.user.id },
      membership: { id: fixture.membership.id },
      organization: { id: fixture.organization.id },
    });
  });

  it('supports an OWNER without an Employee through /auth/me', async () => {
    const fixture = await createSaasFixture({
      membershipRole: MembershipRole.OWNER,
      withEmployee: false,
    });
    const login = await authService.selectOrganization(
      fixture.user.id,
      fixture.organization.id,
    );
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200);
    expect(response.body).toMatchObject({
      id: fixture.user.id,
      accessRole: AccessRole.ADMIN,
      employee: null,
      account: { id: fixture.user.id },
      membership: { role: MembershipRole.OWNER },
      organization: { id: fixture.organization.id },
    });
  });

  it('rejects a SaaS PIN when the linked Employee is inactive', async () => {
    const fixture = await createSaasFixture({ employeeActive: false });
    await expect(
      authService.loginForAttendanceEntry({ pinCode: fixture.pinCode }),
    ).rejects.toThrow();
  });

  it('never gives a SaaS-linked account a legacy global token', async () => {
    const fixture = await createSaasFixture();
    const result = await authService.login({
      email: fixture.employee!.email,
      password,
    });
    expect(decode(result.accessToken)).toMatchObject({
      purpose: 'account',
      organizationId: fixture.organization.id,
    });
  });
});

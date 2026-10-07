import { createHmac } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  AccessRole,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  SubscriptionStatus,
  UserStatus,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  hashPassword,
  hashPinCode,
  verifyPinCode,
} from '../src/common/security/password.util';
import { signJwtToken, verifyJwtToken } from '../src/common/security/jwt.util';
import { AuthService } from '../src/modules/auth/auth.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

type SaasFixtureOptions = {
  employeePasswordHash?: string;
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

function offlineSessionBinding(token: string) {
  const payload = verifyJwtToken(token, process.env.JWT_SECRET!);
  if (payload.purpose !== 'attendance_entry') {
    throw new Error('Expected an attendance-entry token.');
  }
  return payload.sessionBinding;
}

describe('SaaS login boundary (e2e)', () => {
  const password = 'SaaSLoginPassword123!';
  const selfie = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2w==';
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
              passwordHash: options.employeePasswordHash ?? passwordHash,
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

    // SaaS attendance fixtures model an operational employee at its effective
    // attendance site. This is the same server-side assignment contract used
    // by QR, online attendance, and offline synchronization.
    if (employee && sites[0]) {
      const effectiveFrom = new Date(
        `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
      );
      await prisma.employee.update({
        where: { id: employee.id },
        data: {
          primarySiteId: sites[0].id,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      });
      await prisma.employeeSiteAssignment.create({
        data: {
          organizationId: organization.id,
          employeeId: employee.id,
          siteId: sites[0].id,
          effectiveFrom,
        },
      });
    }

    let secondOrganizationId: string | null = null;
    let secondMembershipId: string | null = null;
    if (options.withSecondMembership) {
      const secondOrganization = await prisma.organization.create({
        data: {
          name: `Auth SaaS Second Organization ${suffix}`,
          slug: `auth-saas-second-organization-${suffix}`,
          timezone: 'Etc/UTC',
        },
      });
      secondOrganizationId = secondOrganization.id;
      const secondMembership = await prisma.membership.create({
        data: {
          userId: user.id,
          organizationId: secondOrganization.id,
          role: MembershipRole.EMPLOYEE,
        },
      });
      secondMembershipId = secondMembership.id;
    }

    return {
      employee,
      membership,
      organization,
      password,
      pinCode,
      secondMembershipId,
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

  async function issueOfflineContext(token: string) {
    const response = await request(app.getHttpServer())
      .get('/api/v1/attendance/me/offline-context')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return response.body.contextToken as string;
  }

  function decode(token: string) {
    return verifyJwtToken(token, process.env.JWT_SECRET!);
  }

  function expectFinalLogin<
    T extends { accessToken: string } | { organizationSelectionRequired: true },
  >(result: T): asserts result is Extract<T, { accessToken: string }> {
    if ('organizationSelectionRequired' in result) {
      throw new Error('Expected a final authenticated session.');
    }
  }

  it('keeps legacy email/password login functional without SaaS identity', async () => {
    const { employee } = await createLegacyEmployee();
    const result = await authService.login({ email: employee.email, password });
    expectFinalLogin(result);

    expect(decode(result.accessToken)).toMatchObject({
      sub: employee.id,
      email: employee.email,
    });
    expect(decode(result.accessToken)).not.toHaveProperty('purpose');
  });

  it('issues a SaaS account token to a linked Employee', async () => {
    const fixture = await createSaasFixture();
    const result = await authService.login({
      email: fixture.user.normalizedEmail,
      password,
    });
    expectFinalLogin(result);

    expect(decode(result.accessToken)).toMatchObject({
      sub: fixture.user.id,
      membershipId: fixture.membership.id,
      organizationId: fixture.organization.id,
      purpose: 'account',
    });
  });

  it('normalizes the SaaS email and authenticates with User.passwordHash', async () => {
    const employeePasswordHash = await hashPassword('EmployeeOnlyPassword123!');
    const fixture = await createSaasFixture({ employeePasswordHash });
    const result = await authService.login({
      email: `  ${fixture.user.normalizedEmail.toUpperCase()}  `,
      password,
    });

    expectFinalLogin(result);
    expect(decode(result.accessToken)).toMatchObject({
      sub: fixture.user.id,
      membershipId: fixture.membership.id,
      organizationId: fixture.organization.id,
      purpose: 'account',
    });
  });

  it('does not use Employee.email as the SaaS login identity', async () => {
    const fixture = await createSaasFixture();

    await expect(
      authService.login({ email: fixture.employee!.email, password }),
    ).rejects.toThrow('Invalid credentials.');
  });

  it('does not fall back to a Legacy Employee after a SaaS password failure', async () => {
    const fixture = await createSaasFixture({ withEmployee: false });
    const legacyPassword = 'LegacyFallbackPassword123!';
    await prisma.employee.create({
      data: {
        employeeIdentifier: `AUTH-LEGACY-FALLBACK-${sequence}`,
        firstName: 'Legacy',
        lastName: 'Fallback',
        email: fixture.user.normalizedEmail,
        role: 'Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash: await hashPassword(legacyPassword),
      },
    });

    await expect(
      authService.login({
        email: fixture.user.normalizedEmail,
        password: legacyPassword,
      }),
    ).rejects.toThrow('Invalid credentials.');
  });

  it('allows an ADMIN with no Employee to complete a single-organization login', async () => {
    const fixture = await createSaasFixture({
      membershipRole: MembershipRole.ADMIN,
      withEmployee: false,
    });
    const result = await authService.login({
      email: fixture.user.normalizedEmail,
      password,
    });

    expectFinalLogin(result);
    expect(result.user).toMatchObject({
      id: fixture.user.id,
      email: fixture.user.normalizedEmail,
      accessRole: AccessRole.ADMIN,
    });
    expect(decode(result.accessToken)).toMatchObject({
      sub: fixture.user.id,
      membershipId: fixture.membership.id,
      organizationId: fixture.organization.id,
    });
  });

  it('issues a SaaS ADMIN membership token to a linked ADMIN Employee', async () => {
    const fixture = await createSaasFixture({
      employeeRole: AccessRole.ADMIN,
      membershipRole: MembershipRole.ADMIN,
    });
    const result = await authService.login({
      email: fixture.user.normalizedEmail,
      password,
    });
    expectFinalLogin(result);

    expect(decode(result.accessToken)).toMatchObject({
      membershipId: fixture.membership.id,
      purpose: 'account',
    });
    expect(
      (result as typeof result & { membership: { role: MembershipRole } })
        .membership.role,
    ).toBe(MembershipRole.ADMIN);
  });

  it('issues a SaaS EMPLOYEE token independently of Employee.role', async () => {
    const fixture = await createSaasFixture({
      membershipRole: MembershipRole.EMPLOYEE,
    });
    const result = await authService.login({
      email: fixture.user.normalizedEmail,
      password,
    });
    expectFinalLogin(result);

    expect(
      (result as typeof result & { membership: { role: MembershipRole } })
        .membership.role,
    ).toBe(MembershipRole.EMPLOYEE);
    expect(decode(result.accessToken)).toMatchObject({ purpose: 'account' });
  });

  it('authenticates an active User independently of an inactive Employee profile', async () => {
    const fixture = await createSaasFixture({ employeeActive: false });
    const result = await authService.login({
      email: fixture.user.normalizedEmail,
      password,
    });
    expectFinalLogin(result);
    expect(decode(result.accessToken)).toMatchObject({ sub: fixture.user.id });
  });

  it('rejects an inactive User', async () => {
    const fixture = await createSaasFixture({
      userStatus: UserStatus.DISABLED,
    });
    await expect(
      authService.login({ email: fixture.user.normalizedEmail, password }),
    ).rejects.toThrow('Invalid credentials.');
  });

  it('rejects a suspended Membership', async () => {
    const fixture = await createSaasFixture({
      membershipStatus: MembershipStatus.SUSPENDED,
    });
    await expect(
      authService.login({ email: fixture.user.normalizedEmail, password }),
    ).rejects.toThrow('Invalid credentials.');
  });

  it('rejects a suspended Organization', async () => {
    const fixture = await createSaasFixture({
      organizationStatus: OrganizationStatus.SUSPENDED,
    });
    await expect(
      authService.login({ email: fixture.user.normalizedEmail, password }),
    ).rejects.toThrow('Invalid credentials.');
    await expect(
      authService.loginForAttendanceEntry({
        pinCode: fixture.pinCode,
        sitePublicId: fixture.sites[0].publicId,
      }),
    ).rejects.toThrow();
  });

  it('automatically selects one active organization', async () => {
    const fixture = await createSaasFixture();
    const result = await authService.login({
      email: fixture.user.normalizedEmail,
      password,
    });
    expectFinalLogin(result);
    expect(
      (result as typeof result & { organization: { id: string } }).organization
        .id,
    ).toBe(fixture.organization.id);
  });

  it('requires explicit selection when several organizations are active', async () => {
    const fixture = await createSaasFixture({ withSecondMembership: true });
    const result = await authService.login({
      email: fixture.user.normalizedEmail,
      password,
    });
    expect(result).toMatchObject({
      organizationSelectionRequired: true,
      organizationSelectionChallenge: expect.any(String),
      organizations: expect.arrayContaining([
        expect.objectContaining({ id: fixture.organization.id }),
        expect.objectContaining({ id: fixture.secondOrganizationId }),
      ]),
    });
    expect(result).not.toHaveProperty('accessToken');
    if (!('organizationSelectionChallenge' in result)) {
      throw new Error('Expected an organization-selection challenge.');
    }
    expect(decode(result.organizationSelectionChallenge)).toMatchObject({
      sub: fixture.user.id,
      purpose: 'organization_selection',
      userVersion: fixture.user.userVersion,
      candidates: expect.arrayContaining([
        expect.objectContaining({
          organizationId: fixture.organization.id,
          membershipId: fixture.membership.id,
          membershipVersion: fixture.membership.membershipVersion,
        }),
      ]),
    });
  });

  it('completes initial selection and issues the final account JWT', async () => {
    const fixture = await createSaasFixture({ withSecondMembership: true });
    const login = await authService.login({
      email: fixture.user.normalizedEmail,
      password,
    });
    if (!('organizationSelectionChallenge' in login)) {
      throw new Error('Expected an organization-selection challenge.');
    }

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/organization/select-initial')
      .send({
        challenge: login.organizationSelectionChallenge,
        organizationId: fixture.organization.id,
      })
      .expect(201);

    expect(decode(response.body.accessToken)).toMatchObject({
      sub: fixture.user.id,
      membershipId: fixture.membership.id,
      organizationId: fixture.organization.id,
      purpose: 'account',
      userVersion: fixture.user.userVersion,
      membershipVersion: fixture.membership.membershipVersion,
    });
  });

  it('keeps tenant and role authority isolated when the same User switches organizations', async () => {
    const fixture = await createSaasFixture({
      membershipRole: MembershipRole.ADMIN,
      withSecondMembership: true,
    });
    const login = await authService.login({
      email: fixture.user.normalizedEmail,
      password,
    });
    if (!('organizationSelectionChallenge' in login)) {
      throw new Error('Expected an organization-selection challenge.');
    }

    const organizationA = await request(app.getHttpServer())
      .post('/api/v1/auth/organization/select-initial')
      .send({
        challenge: login.organizationSelectionChallenge,
        organizationId: fixture.organization.id,
      })
      .expect(201);
    expect(decode(organizationA.body.accessToken)).toMatchObject({
      membershipId: fixture.membership.id,
      organizationId: fixture.organization.id,
    });

    await request(app.getHttpServer())
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${organizationA.body.accessToken}`)
      .expect(200);

    const organizationB = await request(app.getHttpServer())
      .post('/api/v1/auth/organization/select')
      .set('Authorization', `Bearer ${organizationA.body.accessToken}`)
      .send({ organizationId: fixture.secondOrganizationId })
      .expect(201);
    expect(decode(organizationB.body.accessToken)).toMatchObject({
      membershipId: fixture.secondMembershipId,
      organizationId: fixture.secondOrganizationId,
    });
    expect(organizationB.body.membership.role).toBe(MembershipRole.EMPLOYEE);

    await request(app.getHttpServer())
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${organizationB.body.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/auth/organization/select')
      .set('Authorization', `Bearer ${organizationA.body.accessToken}`)
      .send({
        organizationId: fixture.secondOrganizationId,
        membershipId: fixture.membership.id,
        userId: fixture.user.id,
        employeeId: fixture.employee!.id,
      })
      .expect(400);
  });

  it('does not allow a selection challenge to authenticate protected auth endpoints', async () => {
    const fixture = await createSaasFixture({ withSecondMembership: true });
    const login = await authService.login({
      email: fixture.user.normalizedEmail,
      password,
    });
    if (!('organizationSelectionChallenge' in login)) {
      throw new Error('Expected an organization-selection challenge.');
    }
    const authorization = `Bearer ${login.organizationSelectionChallenge}`;

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', authorization)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/organization/select')
      .set('Authorization', authorization)
      .send({ organizationId: fixture.organization.id })
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/employees')
      .set('Authorization', authorization)
      .expect(401);
  });

  it('rejects an initial organization outside the signed candidates', async () => {
    const fixture = await createSaasFixture({ withSecondMembership: true });
    const foreign = await createSaasFixture();
    const login = await authService.login({
      email: fixture.user.normalizedEmail,
      password,
    });
    if (!('organizationSelectionChallenge' in login)) {
      throw new Error('Expected an organization-selection challenge.');
    }

    await request(app.getHttpServer())
      .post('/api/v1/auth/organization/select-initial')
      .send({
        challenge: login.organizationSelectionChallenge,
        organizationId: foreign.organization.id,
      })
      .expect(401);
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
      email: fixture.user.normalizedEmail,
      password,
    });
    expectFinalLogin(result);
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
      email: fixture.user.normalizedEmail,
      password,
    });
    expectFinalLogin(result);
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
      sitePublicId: fixture.sites[0].publicId,
    });
    expect(decode(result.accessToken)).toMatchObject({
      purpose: 'attendance_entry',
    });

    const storedEmployee = await prisma.employee.findUniqueOrThrow({
      where: { id: fixture.employee!.id },
      select: { pinCode: true, pinCodeHash: true },
    });
    expect(storedEmployee.pinCode).toBeNull();
    expect(storedEmployee.pinCodeHash).not.toBe(fixture.pinCode);
    expect(
      await verifyPinCode(fixture.pinCode, storedEmployee.pinCodeHash!),
    ).toBe(true);
  });

  it('rejects an incorrect PIN in an active SaaS site context', async () => {
    const fixture = await createSaasFixture();

    await request(app.getHttpServer())
      .post('/api/v1/auth/attendance-entry/login')
      .send({
        pinCode: '9876',
        sitePublicId: fixture.sites[0].publicId,
      })
      .expect(401)
      .expect(({ body }) => {
        expect(body.message).toBe('Identifiants invalides.');
      });
  });

  it('rejects a tenant A PIN through a tenant B attendance site', async () => {
    const first = await createSaasFixture();
    const second = await createSaasFixture();

    await request(app.getHttpServer())
      .post('/api/v1/auth/attendance-entry/login')
      .send({
        pinCode: first.pinCode,
        sitePublicId: second.sites[0].publicId,
      })
      .expect(401)
      .expect(({ body }) => {
        expect(body.message).toBe('Identifiants invalides.');
      });
  });

  it('rejects an inactive attendance site before verifying a SaaS PIN', async () => {
    const fixture = await createSaasFixture();
    await prisma.attendanceSite.update({
      where: { id: fixture.sites[0].id },
      data: { isActive: false },
    });

    await request(app.getHttpServer())
      .post('/api/v1/auth/attendance-entry/login')
      .send({
        pinCode: fixture.pinCode,
        sitePublicId: fixture.sites[0].publicId,
      })
      .expect(404)
      .expect(({ body }) => {
        expect(body.message).toBe('Attendance site not found.');
      });
  });

  it('resolves identical PINs safely from the QR site context', async () => {
    const first = await createSaasFixture();
    const second = await createSaasFixture();
    await prisma.employee.update({
      where: { id: second.employee!.id },
      data: { pinCodeHash: await hashPinCode(first.pinCode) },
    });

    const result = await authService.loginForAttendanceEntry({
      pinCode: first.pinCode,
      sitePublicId: first.sites[0].publicId,
    });
    expect(decode(result.accessToken)).toMatchObject({
      organizationId: first.organization.id,
      attendanceSiteId: first.sites[0].id,
    });
  });

  it('uses the server clock for SaaS employee attendance despite forged occurredAt', async () => {
    const fixture = await createSaasFixture();
    const login = await authService.loginForAttendanceEntry({
      pinCode: fixture.pinCode,
      sitePublicId: fixture.sites[0].publicId,
    });
    const before = Date.now();
    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .send({ occurredAt: '2000-01-01T00:00:00.000Z' })
      .expect(201);

    expect(new Date(response.body.clockInAt).getTime()).toBeGreaterThanOrEqual(
      before,
    );
    expect(new Date(response.body.clockInAt).getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
  });

  it('rejects an expired attendance-entry session', async () => {
    const fixture = await createSaasFixture();
    const expiredToken = signJwtToken(
      {
        sub: fixture.employee!.id,
        organizationId: fixture.organization.id,
        attendanceSiteId: fixture.sites[0].id,
        sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
        purpose: 'attendance_entry',
      },
      process.env.JWT_SECRET!,
      '0s',
    );

    await request(app.getHttpServer())
      .get('/api/v1/attendance/me/today')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });

  it('rejects reuse of an attendance-entry session for the same action', async () => {
    const fixture = await createSaasFixture();
    const token = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const first = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const replay = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(first.status).toBe(201);
    expect(replay.status).toBe(409);
  });

  it('rejects reused selfie evidence within a tenant but not across tenants', async () => {
    const previous = {
      enabled: process.env.ATTENDANCE_SECURITY_ENABLED,
      selfie: process.env.ATTENDANCE_SELFIE_REQUIRED,
      gps: process.env.ATTENDANCE_GPS_REQUIRED,
    };
    process.env.ATTENDANCE_SECURITY_ENABLED = 'true';
    process.env.ATTENDANCE_SELFIE_REQUIRED = 'true';
    process.env.ATTENDANCE_GPS_REQUIRED = 'false';

    try {
      const first = await createSaasFixture();
      const secondEmployee = await prisma.employee.create({
        data: {
          employeeIdentifier: `AUTH-SAAS-EVIDENCE-${sequence}`,
          firstName: 'Evidence',
          lastName: 'Replay',
          email: `auth-saas-evidence-${sequence}@example.test`,
          role: 'Employee',
          accessRole: AccessRole.EMPLOYEE,
          passwordHash,
          organizationId: first.organization.id,
          primarySiteId: first.sites[0].id,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      });
      await prisma.employeeSiteAssignment.create({
        data: {
          organizationId: first.organization.id,
          employeeId: secondEmployee.id,
          siteId: first.sites[0].id,
          effectiveFrom: new Date(
            `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
          ),
        },
      });
      const foreign = await createSaasFixture();
      const proof = () => ({
        evidenceCapturedAt: new Date().toISOString(),
        verificationPhotoDataUrl: selfie,
      });
      const firstToken = authService.createAttendanceEntryToken({
        employeeId: first.employee!.id,
        organizationId: first.organization.id,
        attendanceSiteId: first.sites[0].id,
      });
      const secondToken = authService.createAttendanceEntryToken({
        employeeId: secondEmployee.id,
        organizationId: first.organization.id,
        attendanceSiteId: first.sites[0].id,
      });
      const foreignToken = authService.createAttendanceEntryToken({
        employeeId: foreign.employee!.id,
        organizationId: foreign.organization.id,
        attendanceSiteId: foreign.sites[0].id,
      });

      await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set('Authorization', `Bearer ${firstToken}`)
        .send({ security: proof() })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set('Authorization', `Bearer ${secondToken}`)
        .send({ security: proof() })
        .expect(400, {
          statusCode: 400,
          message: 'Cette preuve de pointage a déjà été utilisée.',
          error: 'Bad Request',
        });
      await request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set('Authorization', `Bearer ${foreignToken}`)
        .send({ security: proof() })
        .expect(201);
    } finally {
      for (const [key, value] of [
        ['ATTENDANCE_SECURITY_ENABLED', previous.enabled],
        ['ATTENDANCE_SELFIE_REQUIRED', previous.selfie],
        ['ATTENDANCE_GPS_REQUIRED', previous.gps],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('allows only one concurrent submission for the same attendance action', async () => {
    const fixture = await createSaasFixture();
    const token = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set('Authorization', `Bearer ${token}`)
        .send({}),
      request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set('Authorization', `Bearer ${token}`)
        .send({}),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
  });

  it('synchronizes an offline intent with captured event time and server receivedAt', async () => {
    const fixture = await createSaasFixture();
    const token = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const capturedAt = new Date(Date.now() - 60_000).toISOString();
    const contextToken = await issueOfflineContext(token);
    const before = Date.now();
    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionBinding: offlineSessionBinding(token),
        contextToken,
        clientRequestId: '1eab6e5d-4a9d-4fb1-9c30-93f2a96054cc',
        action: 'check-in',
        capturedAt,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      state: 'accepted',
      idempotent: false,
      capturedAt,
    });
    expect(new Date(response.body.receivedAt).getTime()).toBeGreaterThanOrEqual(
      before,
    );
    expect(response.body.attendance.clockInAt).toBe(capturedAt);
    expect(response.body.attendance.date).toBe(`${capturedAt.slice(0, 10)}T00:00:00.000Z`);
  });

  it('issues an employee and tenant bound signed context that rejects tampering and identity reuse', async () => {
    const fixture = await createSaasFixture();
    const employeeToken = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const issued = await request(app.getHttpServer())
      .get('/api/v1/attendance/me/offline-context')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    const claims = verifyJwtToken(issued.body.contextToken, process.env.JWT_SECRET!);
    expect(claims).toMatchObject({
      purpose: 'offline_attendance_context',
      sub: fixture.employee!.id,
      context: {
        organizationId: fixture.organization.id,
        employeeId: fixture.employee!.id,
        siteId: fixture.sites[0].id,
      },
    });
    const siteContext = (claims as { context: Record<string, unknown> }).context;
    expect(siteContext).toMatchObject({
      issuedAt: expect.any(String),
      validUntil: expect.any(String),
      timeZone: 'Etc/UTC',
      attendancePolicy: expect.any(Object),
    });
    await request(app.getHttpServer())
      .get('/api/v1/attendance/me/today')
      .set('Authorization', `Bearer ${issued.body.contextToken}`)
      .expect(401);

    const tampered = issued.body.contextToken.slice(0, -1) +
      (issued.body.contextToken.endsWith('A') ? 'B' : 'A');
    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        sessionBinding: offlineSessionBinding(employeeToken),
        contextToken: tampered,
        clientRequestId: crypto.randomUUID(),
        action: 'check-in',
        capturedAt: new Date().toISOString(),
      })
      .expect(400);

    const foreign = await createSaasFixture();
    const otherToken = authService.createAttendanceEntryToken({
      employeeId: foreign.employee!.id,
      organizationId: foreign.organization.id,
      attendanceSiteId: foreign.sites[0].id,
    });
    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        sessionBinding: offlineSessionBinding(otherToken),
        contextToken: issued.body.contextToken,
        clientRequestId: crypto.randomUUID(),
        action: 'check-in',
        capturedAt: new Date().toISOString(),
      })
      .expect(400);
  });

  it('allows the same employee to sync a signed queued context with a fresh current session', async () => {
    const fixture = await createSaasFixture();
    const captureSession = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const contextToken = await issueOfflineContext(captureSession);
    const currentSession = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${currentSession}`)
      .send({
        sessionBinding: offlineSessionBinding(currentSession),
        contextToken,
        clientRequestId: crypto.randomUUID(),
        action: 'check-in',
        capturedAt: new Date(Date.now() - 30_000).toISOString(),
        siteId: fixture.sites[0].id,
      })
      .expect(201);
    expect(response.body.state).toBe('accepted');
  });

  it('allows at most two minutes of future skew and expires events older than 24 hours', async () => {
    const fixture = await createSaasFixture();
    const token = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const contextToken = await issueOfflineContext(token);
    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionBinding: offlineSessionBinding(token),
        contextToken,
        clientRequestId: crypto.randomUUID(),
        action: 'check-in',
        capturedAt: new Date(Date.now() + 90_000).toISOString(),
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionBinding: offlineSessionBinding(token),
        contextToken,
        clientRequestId: crypto.randomUUID(),
        action: 'check-in',
        capturedAt: new Date(Date.now() + 121_000).toISOString(),
      })
      .expect(400);
    const capturedAt = new Date(Date.now() - 24 * 60 * 60_000 - 1_000);
    const issuedClaims = verifyJwtToken(contextToken, process.env.JWT_SECRET!);
    if (issuedClaims.purpose !== 'offline_attendance_context') {
      throw new Error('Expected a signed offline context.');
    }
    const issuedAt = new Date(capturedAt.getTime() - 30_000);
    const expiredContextToken = signJwtToken(
      {
        sub: fixture.employee!.id,
        purpose: 'offline_attendance_context',
        context: {
          ...issuedClaims.context,
          issuedAt: issuedAt.toISOString(),
          validUntil: new Date(issuedAt.getTime() + 24 * 60 * 60_000).toISOString(),
        },
      },
      process.env.JWT_SECRET!,
      '48h',
    );
    const expiredRequestId = crypto.randomUUID();
    const expiredPayload = {
      sessionBinding: offlineSessionBinding(token),
      contextToken: expiredContextToken,
      clientRequestId: expiredRequestId,
      action: 'check-in',
      capturedAt: capturedAt.toISOString(),
      siteId: fixture.sites[0].id,
    };
    const expired = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send(expiredPayload)
      .expect(201);
    expect(expired.body).toMatchObject({ state: 'expired', idempotent: false });
    expect(
      await prisma.offlineAttendanceSyncRequest.findUniqueOrThrow({
        where: {
          organizationId_clientRequestId: {
            organizationId: fixture.organization.id,
            clientRequestId: expiredRequestId,
          },
        },
      }),
    ).toMatchObject({ status: 'EXPIRED', capturedAt });
    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send(expiredPayload)
      .expect(201)
      .expect(({ body }) => expect(body).toMatchObject({ state: 'expired', idempotent: true }));
  });

  it('accepts a captured event after context receipt expiry when event age remains valid', async () => {
    const fixture = await createSaasFixture();
    const token = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const issuedContextToken = await issueOfflineContext(token);
    const issuedClaims = verifyJwtToken(issuedContextToken, process.env.JWT_SECRET!);
    if (issuedClaims.purpose !== 'offline_attendance_context') {
      throw new Error('Expected a signed offline context.');
    }
    const receivedReference = Date.now();
    const validUntil = new Date(receivedReference - 60_000);
    const issuedAt = new Date(validUntil.getTime() - 24 * 60 * 60_000);
    const capturedAt = new Date(validUntil.getTime() - 30_000);
    const signedContext = signJwtToken(
      {
        sub: fixture.employee!.id,
        purpose: 'offline_attendance_context',
        context: {
          ...issuedClaims.context,
          issuedAt: issuedAt.toISOString(),
          validUntil: validUntil.toISOString(),
        },
      },
      process.env.JWT_SECRET!,
      '24h',
    );
    const [header] = signedContext.split('.');
    const expiredPayload = JSON.parse(
      Buffer.from(signedContext.split('.')[1], 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expiredPayload.iat = Math.floor(issuedAt.getTime() / 1_000);
    expiredPayload.exp = Math.floor(validUntil.getTime() / 1_000);
    const body = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
    const signingInput = `${header}.${body}`;
    const signature = createHmac('sha256', process.env.JWT_SECRET!)
      .update(signingInput)
      .digest('base64url');
    const delayedContextToken = `${signingInput}.${signature}`;

    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionBinding: offlineSessionBinding(token),
        contextToken: delayedContextToken,
        clientRequestId: crypto.randomUUID(),
        action: 'check-in',
        capturedAt: capturedAt.toISOString(),
        siteId: fixture.sites[0].id,
      })
      .expect(201);

    expect(response.body).toMatchObject({ state: 'accepted', capturedAt: capturedAt.toISOString() });
  });

  it('treats duplicate offline synchronization as idempotently accepted', async () => {
    const fixture = await createSaasFixture();
    const token = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const payload = {
      sessionBinding: offlineSessionBinding(token),
      contextToken: await issueOfflineContext(token),
      clientRequestId: '4ff476aa-a583-453c-a57b-9b97ac9a6077',
      action: 'check-in',
      capturedAt: new Date().toISOString(),
    };

    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);
    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);

    expect(duplicate.body).toMatchObject({
      clientRequestId: payload.clientRequestId,
      state: 'accepted',
      idempotent: true,
    });

    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...payload, action: 'check-out' })
      .expect(409);
  });

  it('rejects an offline item bound to another employee session in the same organization', async () => {
    const fixture = await createSaasFixture();
    const secondEmployee = await prisma.employee.create({
      data: {
        employeeIdentifier: `AUTH-SAAS-OFFLINE-SECOND-${sequence}`,
        firstName: 'Second',
        lastName: 'Employee',
        email: `auth-saas-offline-second-${sequence}@example.test`,
        role: 'Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
        pinCodeHash: await hashPinCode('9998'),
        isActive: true,
        organizationId: fixture.organization.id,
      },
    });
    const employeeAToken = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const employeeBToken = authService.createAttendanceEntryToken({
      employeeId: secondEmployee.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const capturedAt = new Date().toISOString();
    const clientRequestId = '48f2a6a5-10df-4a93-8f33-e0836f7b8af0';

    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${employeeBToken}`)
      .send({
        sessionBinding: offlineSessionBinding(employeeAToken),
        clientRequestId,
        action: 'check-in',
        capturedAt,
      })
      .expect(400);

    expect(
      await prisma.offlineAttendanceSyncRequest.count({
        where: { clientRequestId },
      }),
    ).toBe(0);
  });

  it('scopes offline replay protection to the authenticated tenant', async () => {
    const first = await createSaasFixture();
    const second = await createSaasFixture();
    const clientRequestId = '44316e62-3704-49c6-8213-aee1fbc4e944';
    const capturedAt = new Date().toISOString();

    for (const fixture of [first, second]) {
      const token = authService.createAttendanceEntryToken({
        employeeId: fixture.employee!.id,
        organizationId: fixture.organization.id,
        attendanceSiteId: fixture.sites[0].id,
      });
      const contextToken = await issueOfflineContext(token);
      await request(app.getHttpServer())
        .post('/api/v1/attendance/me/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sessionBinding: offlineSessionBinding(token),
          contextToken,
          clientRequestId,
          action: 'check-in',
          capturedAt,
        })
        .expect(201);
    }

    expect(
      await prisma.offlineAttendanceSyncRequest.count({
        where: { clientRequestId },
      }),
    ).toBe(2);
  });

  it('rejects tenant identifiers supplied by an offline client', async () => {
    const fixture = await createSaasFixture();
    const foreign = await createSaasFixture();
    const token = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });

    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionBinding: offlineSessionBinding(token),
        clientRequestId: '53f4b814-dd11-4204-83c1-969bdcf92849',
        action: 'check-in',
        capturedAt: new Date().toISOString(),
        organizationId: foreign.organization.id,
      })
      .expect(400);
  });

  it('rejects expired or replayed offline evidence even after the action exists', async () => {
    const previous = {
      enabled: process.env.ATTENDANCE_SECURITY_ENABLED,
      selfie: process.env.ATTENDANCE_SELFIE_REQUIRED,
      gps: process.env.ATTENDANCE_GPS_REQUIRED,
    };
    process.env.ATTENDANCE_SECURITY_ENABLED = 'true';
    process.env.ATTENDANCE_SELFIE_REQUIRED = 'true';
    process.env.ATTENDANCE_GPS_REQUIRED = 'false';

    try {
      const fixture = await createSaasFixture();
      const token = authService.createAttendanceEntryToken({
        employeeId: fixture.employee!.id,
        organizationId: fixture.organization.id,
        attendanceSiteId: fixture.sites[0].id,
      });
      const acceptedPayload = {
        sessionBinding: offlineSessionBinding(token),
        contextToken: await issueOfflineContext(token),
        clientRequestId: '9b33d324-230f-4a8c-bfe0-d8d6351dcc95',
        action: 'check-in',
        capturedAt: new Date().toISOString(),
        security: {
          evidenceCapturedAt: new Date().toISOString(),
          verificationPhotoDataUrl: selfie,
        },
      };
      await request(app.getHttpServer())
        .post('/api/v1/attendance/me/sync')
        .set('Authorization', `Bearer ${token}`)
        .send(acceptedPayload)
        .expect(201);

      const exactReplay = await request(app.getHttpServer())
        .post('/api/v1/attendance/me/sync')
        .set('Authorization', `Bearer ${token}`)
        .send(acceptedPayload)
        .expect(201);
      expect(exactReplay.body.idempotent).toBe(true);

      await request(app.getHttpServer())
        .post('/api/v1/attendance/me/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sessionBinding: offlineSessionBinding(token),
          clientRequestId: 'ec27cd52-c48a-4c84-9498-ac92419912c4',
          action: 'check-in',
          capturedAt: new Date(Date.now() - 180_000).toISOString(),
          security: {
            evidenceCapturedAt: new Date(Date.now() - 180_000).toISOString(),
            verificationPhotoDataUrl: selfie,
          },
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/attendance/me/sync')
        .set('Authorization', `Bearer ${token}`)
        .send({
          sessionBinding: offlineSessionBinding(token),
          clientRequestId: '2019fc32-e7b6-4de5-a71e-337cfce4ee97',
          action: 'check-in',
          capturedAt: new Date().toISOString(),
          security: {
            evidenceCapturedAt: new Date().toISOString(),
            verificationPhotoDataUrl: selfie,
          },
        })
        .expect(400);
    } finally {
      for (const [key, value] of [
        ['ATTENDANCE_SECURITY_ENABLED', previous.enabled],
        ['ATTENDANCE_SELFIE_REQUIRED', previous.selfie],
        ['ATTENDANCE_GPS_REQUIRED', previous.gps],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('rejects an offline checkout that cannot be validated by the server', async () => {
    const fixture = await createSaasFixture();
    const token = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });

    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionBinding: offlineSessionBinding(token),
        clientRequestId: '51d6518b-7238-40f1-bec4-8fb3c955669b',
        action: 'check-out',
        capturedAt: new Date().toISOString(),
      })
      .expect(400);
  });

  it('blocks offline synchronization when the tenant subscription is suspended', async () => {
    const fixture = await createSaasFixture();
    const token = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const capturedAt = new Date(Date.now() - 60_000).toISOString();
    const contextToken = await issueOfflineContext(token);
    await prisma.organizationSubscription.update({
      where: { organizationId: fixture.organization.id },
      data: { status: SubscriptionStatus.SUSPENDED },
    });

    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionBinding: offlineSessionBinding(token),
        contextToken,
        clientRequestId: 'b0fbd109-aab4-48af-a0df-b5efc94b4739',
        action: 'check-in',
        capturedAt,
      })
      .expect(403);
    expect(
      await prisma.offlineAttendanceSyncRequest.count({
        where: { organizationId: fixture.organization.id },
      }),
    ).toBe(0);
  });

  it.each([
    'employee deactivation',
    'membership suspension',
    'user disablement',
    'organization suspension',
  ])('rejects a queued offline event at receipt after %s', async (change) => {
    const fixture = await createSaasFixture({
      membershipRole: MembershipRole.EMPLOYEE,
    });
    const token = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const capturedAt = new Date(Date.now() - 60_000).toISOString();
    const contextToken = await issueOfflineContext(token);

    if (change === 'site deactivation') {
      await prisma.attendanceSite.update({
        where: { id: fixture.sites[0].id },
        data: { isActive: false },
      });
    } else if (change === 'employee deactivation') {
      await prisma.employee.update({
        where: { id: fixture.employee!.id },
        data: { isActive: false },
      });
    } else if (change === 'membership suspension') {
      await prisma.membership.update({
        where: { id: fixture.membership.id },
        data: {
          status: MembershipStatus.SUSPENDED,
          membershipVersion: { increment: 1 },
        },
      });
    } else if (change === 'user disablement') {
      await prisma.user.update({
        where: { id: fixture.user.id },
        data: {
          status: UserStatus.DISABLED,
          userVersion: { increment: 1 },
        },
      });
    } else {
      await prisma.organization.update({
        where: { id: fixture.organization.id },
        data: { status: OrganizationStatus.SUSPENDED },
      });
    }

    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionBinding: offlineSessionBinding(token),
        contextToken,
        clientRequestId: crypto.randomUUID(),
        action: 'check-in',
        capturedAt,
      })
      .expect(401);
    expect(
      await prisma.offlineAttendanceSyncRequest.count({
        where: { organizationId: fixture.organization.id },
      }),
    ).toBe(0);
  });

  it('requires reconciliation after the context site is deactivated', async () => {
    const fixture = await createSaasFixture();
    const token = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const capturedAt = new Date(Date.now() - 60_000).toISOString();
    const contextToken = await issueOfflineContext(token);
    await prisma.attendanceSite.update({
      where: { id: fixture.sites[0].id },
      data: { isActive: false, statusChangedAt: new Date() },
    });
    const clientRequestId = crypto.randomUUID();
    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sessionBinding: offlineSessionBinding(token),
        contextToken,
        clientRequestId,
        action: 'check-in',
        capturedAt,
        siteId: fixture.sites[0].id,
      })
      .expect(201);
    expect(response.body).toMatchObject({ state: 'reconciliation_required' });
    expect(await prisma.attendance.count({ where: { employeeId: fixture.employee!.id } })).toBe(0);
    expect(await prisma.offlineAttendanceSyncRequest.findUnique({
      where: {
        organizationId_clientRequestId: {
          organizationId: fixture.organization.id,
          clientRequestId,
        },
      },
      select: { status: true, rejectionReason: true },
    })).toMatchObject({
      status: 'RECONCILIATION_REQUIRED',
      rejectionReason: expect.stringContaining('inactive'),
    });
  });

  it('does not issue an offline context while the organization is already suspended', async () => {
    const fixture = await createSaasFixture();
    const token = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    await prisma.organization.update({
      where: { id: fixture.organization.id },
      data: { status: OrganizationStatus.SUSPENDED },
    });

    await request(app.getHttpServer())
      .get('/api/v1/attendance/me/offline-context')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('keeps an active attendance-entry session scoped to employee self-service after membership role change', async () => {
    const fixture = await createSaasFixture({
      membershipRole: MembershipRole.ADMIN,
    });
    const token = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const capturedAt = new Date(Date.now() - 60_000).toISOString();
    const contextToken = await issueOfflineContext(token);
    await prisma.membership.update({
      where: { id: fixture.membership.id },
      data: {
        role: MembershipRole.EMPLOYEE,
        membershipVersion: { increment: 1 },
      },
    });

    const clientRequestId = crypto.randomUUID();
    const payload = {
      sessionBinding: offlineSessionBinding(token),
      contextToken,
      clientRequestId,
      action: 'check-in',
      capturedAt,
    };
    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);
    const replay = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);
    expect(replay.body.idempotent).toBe(true);
  });

  it('handles concurrent synchronization idempotently', async () => {
    const fixture = await createSaasFixture();
    const token = authService.createAttendanceEntryToken({
      employeeId: fixture.employee!.id,
      organizationId: fixture.organization.id,
      attendanceSiteId: fixture.sites[0].id,
    });
    const payload = {
      sessionBinding: offlineSessionBinding(token),
      contextToken: await issueOfflineContext(token),
      clientRequestId: '46dbb397-6319-4bbb-b3d9-e88a4a83e074',
      action: 'check-in',
      capturedAt: new Date().toISOString(),
    };
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/attendance/me/sync')
        .set('Authorization', `Bearer ${token}`)
        .send(payload),
      request(app.getHttpServer())
        .post('/api/v1/attendance/me/sync')
        .set('Authorization', `Bearer ${token}`)
        .send(payload),
    ]);

    expect(responses.every(({ status }) => status === 201)).toBe(true);
    expect(responses.map(({ body }) => body.idempotent).sort()).toEqual([
      false,
      true,
    ]);
  });

  it.each([MembershipStatus.SUSPENDED, MembershipStatus.REVOKED])(
    'invalidates an existing SaaS attendance_entry token when its Membership becomes %s',
    async (status) => {
      const fixture = await createSaasFixture();
      const login = await authService.loginForAttendanceEntry({
        pinCode: fixture.pinCode,
        sitePublicId: fixture.sites[0].publicId,
      });

      await prisma.membership.update({
        where: { id: fixture.membership.id },
        data: { status, membershipVersion: { increment: 1 } },
      });

      await request(app.getHttpServer())
        .get('/api/v1/attendance/me/today')
        .set('Authorization', `Bearer ${login.accessToken}`)
        .expect(401);
    },
  );

  it.each([
    ['suspended Membership', { membership: MembershipStatus.SUSPENDED }],
    ['revoked Membership', { membership: MembershipStatus.REVOKED }],
    ['disabled User', { user: UserStatus.DISABLED }],
  ] as const)(
    'rejects SaaS attendance-entry login for a linked Employee with a %s',
    async (_label, mutation) => {
      const fixture = await createSaasFixture();

      if ('membership' in mutation) {
        await prisma.membership.update({
          where: { id: fixture.membership.id },
          data: {
            status: mutation.membership,
            membershipVersion: { increment: 1 },
          },
        });
      } else {
        await prisma.user.update({
          where: { id: fixture.user.id },
          data: { status: mutation.user, userVersion: { increment: 1 } },
        });
      }

      await request(app.getHttpServer())
        .post('/api/v1/auth/attendance-entry/login')
        .send({
          pinCode: fixture.pinCode,
          sitePublicId: fixture.sites[0].publicId,
        })
        .expect(401);
    },
  );

  it('keeps SaaS Employees without a User independent from Membership lifecycle', async () => {
    const fixture = await createSaasFixture();
    await prisma.employee.update({
      where: { id: fixture.employee!.id },
      data: { userId: null },
    });
    await prisma.membership.update({
      where: { id: fixture.membership.id },
      data: {
        status: MembershipStatus.SUSPENDED,
        membershipVersion: { increment: 1 },
      },
    });

    const login = await authService.loginForAttendanceEntry({
      pinCode: fixture.pinCode,
      sitePublicId: fixture.sites[0].publicId,
    });
    expect(decode(login.accessToken)).toMatchObject({
      sub: fixture.employee!.id,
      organizationId: fixture.organization.id,
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
      sitePublicId: fixture.sites[0].publicId,
    });
    expect(decode(result.accessToken)).toMatchObject({
      organizationId: fixture.organization.id,
    });
  });

  it('puts the server-resolved AttendanceSite in the SaaS attendance token', async () => {
    const fixture = await createSaasFixture();
    const result = await authService.loginForAttendanceEntry({
      pinCode: fixture.pinCode,
      sitePublicId: fixture.sites[0].publicId,
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
        sitePublicId: fixture.sites[0].publicId,
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
    expectFinalLogin(login);
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.accessToken}`)
      .expect(200);
    expect(response.body).toMatchObject({
      id: fixture.employee.id,
      email: fixture.employee.email,
    });
  });

  it('rejects a stale Legacy token after the Employee joins a SaaS organization', async () => {
    const fixture = await createLegacyEmployee();
    const login = await authService.login({
      email: fixture.employee.email,
      password,
    });
    expectFinalLogin(login);
    const organization = await prisma.organization.create({
      data: {
        name: `Converted Employee Organization ${++sequence}`,
        slug: `converted-employee-organization-${sequence}`,
        timezone: 'Etc/UTC',
      },
    });

    await prisma.employee.update({
      where: { id: fixture.employee.id },
      data: { organizationId: organization.id },
    });

    await expect(
      authService.getAuthenticationFromToken(login.accessToken),
    ).rejects.toThrow('User is no longer active.');
  });

  it('returns SaaS account, Membership, Organization and Employee from /auth/me', async () => {
    const fixture = await createSaasFixture();
    const login = await authService.login({
      email: fixture.user.normalizedEmail,
      password,
    });
    expectFinalLogin(login);
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

  it('supports an ADMIN without an Employee through /auth/me', async () => {
    const fixture = await createSaasFixture({
      membershipRole: MembershipRole.ADMIN,
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
      membership: { role: MembershipRole.ADMIN },
      organization: { id: fixture.organization.id },
    });
  });

  it('rejects a SaaS PIN when the linked Employee is inactive', async () => {
    const fixture = await createSaasFixture({ employeeActive: false });
    await expect(
      authService.loginForAttendanceEntry({
        pinCode: fixture.pinCode,
        sitePublicId: fixture.sites[0].publicId,
      }),
    ).rejects.toThrow();
  });

  it('never gives a SaaS-linked account a legacy global token', async () => {
    const fixture = await createSaasFixture();
    const result = await authService.login({
      email: fixture.user.normalizedEmail,
      password,
    });
    expectFinalLogin(result);
    expect(decode(result.accessToken)).toMatchObject({
      purpose: 'account',
      organizationId: fixture.organization.id,
    });
  });
});

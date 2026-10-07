import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  AccessRole,
  MembershipRole,
  MembershipStatus,
  PrismaClient,
  UserStatus,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuditLogService } from '../src/common/audit/audit-log.service';
import { hashPassword } from '../src/common/security/password.util';
import { AuthService } from '../src/modules/auth/auth.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

type AccountFixtureOptions = {
  role: MembershipRole;
  withEmployee?: boolean;
  employeeActive?: boolean;
};

describe('Authorization actor and Membership role semantics (e2e)', () => {
  const password = 'AuthorizationActor123!';
  let app: INestApplication;
  let authService: AuthService;
  let auditLogService: AuditLogService;
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
    await app?.close();
    await prisma?.$disconnect();
  });

  async function createAccount(options: AccountFixtureOptions) {
    sequence += 1;
    const suffix = String(sequence).padStart(3, '0');
    const organization = await prisma.organization.create({
      data: {
        name: `Authorization Organization ${suffix}`,
        slug: `authorization-organization-${suffix}`,
        timezone: 'Etc/UTC',
      },
    });
    const user = await prisma.user.create({
      data: {
        normalizedEmail: `authorization-user-${suffix}@example.test`,
        passwordHash,
        status: UserStatus.ACTIVE,
      },
    });
    const membership = await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        role: options.role,
        status: MembershipStatus.ACTIVE,
      },
    });
    const site = await prisma.attendanceSite.create({
      data: {
        organizationId: organization.id,
        name: `Authorization site ${suffix}`,
        latitude: 5.35,
        longitude: -4.01,
        allowedRadiusMeters: 100,
      },
    });
    const employee =
      options.withEmployee === false
        ? null
        : await prisma.employee.create({
            data: {
              employeeIdentifier: `AUTHZ-${suffix}`,
              firstName: 'Authorization',
              lastName: suffix,
              email: `authorization-employee-${suffix}@example.test`,
              role: 'Operations',
              accessRole: AccessRole.EMPLOYEE,
              passwordHash,
              isActive: options.employeeActive ?? true,
              organizationId: organization.id,
              userId: user.id,
              primarySiteId: site.id,
              v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
            },
          });
    if (employee) {
      await prisma.employeeSiteAssignment.create({
        data: {
          organizationId: organization.id,
          employeeId: employee.id,
          siteId: site.id,
          effectiveFrom: new Date(
            `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
          ),
        },
      });
    }

    const login = await authService.login({
      email: user.normalizedEmail,
      password,
    });
    if ('organizationSelectionRequired' in login) {
      throw new Error('Expected a single-organization account token.');
    }

    return {
      employee,
      membership,
      organization,
      site,
      token: login.accessToken,
      user,
    };
  }

  function authorized(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  function schedulePayload(name: string, siteId?: string) {
    return {
      name,
      startTime: '08:00',
      endTime: '17:00',
      workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      ...(siteId ? { siteId } : {}),
    };
  }

  function holidayPayload(name: string) {
    return {
      name,
      date: '2026-09-14T00:00:00.000Z',
      description: 'Authorization test holiday.',
      type: 'COMPANY_HOLIDAY',
    };
  }

  function sanctionRulePayload(code: string) {
    return {
      type: 'MINOR_LATENESS',
      code,
      name: 'Authorization test sanction rule',
      active: false,
      latenessMinMinutes: 1,
      latenessMaxMinutes: 5,
      monthlyTolerance: 0,
      amountFcfa: 100,
      priority: 500,
      appliedReason: 'Authorization test sanction.',
    };
  }

  it('allows an ADMIN without Employee to read and mutate as a User audit actor', async () => {
    const fixture = await createAccount({
      role: MembershipRole.ADMIN,
      withEmployee: false,
    });
    const auditSpy = jest.spyOn(auditLogService, 'logAdminAction');

    await request(app.getHttpServer())
      .get('/api/v1/employees')
      .set(authorized(fixture.token))
      .expect(200);

    const response = await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set(authorized(fixture.token))
      .send(schedulePayload(`Admin schedule ${sequence}`, fixture.site.id))
      .expect(201);

    expect(response.body).toMatchObject({
      name: `Admin schedule ${sequence}`,
    });
    expect(auditSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actor: {
          actorType: 'USER',
          actorId: fixture.user.id,
          organizationId: fixture.organization.id,
          role: MembershipRole.ADMIN,
          employeeId: null,
        },
        action: 'schedule.create',
      }),
    );
    expect(
      await prisma.employee.count({
        where: { organizationId: fixture.organization.id },
      }),
    ).toBe(0);
    auditSpy.mockRestore();
  });

  it('allows an ADMIN without Employee to mutate without an audit failure', async () => {
    const fixture = await createAccount({
      role: MembershipRole.ADMIN,
      withEmployee: false,
    });

    await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set(authorized(fixture.token))
      .send(schedulePayload(`Admin schedule ${sequence}`, fixture.site.id))
      .expect(201);

    expect(
      await prisma.employee.count({
        where: { organizationId: fixture.organization.id },
      }),
    ).toBe(0);
  });

  it.each([MembershipRole.ADMIN])(
    'allows an %s to create, update, and delete same-tenant holidays',
    async (role) => {
      const fixture = await createAccount({ role, withEmployee: false });
      const created = await request(app.getHttpServer())
        .post('/api/v1/calendar/holidays')
        .set(authorized(fixture.token))
        .send(holidayPayload(`${role} holiday ${sequence}`))
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/calendar/holidays/${created.body.id}`)
        .set(authorized(fixture.token))
        .send({ name: `${role} holiday updated` })
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/api/v1/calendar/holidays/${created.body.id}`)
        .set(authorized(fixture.token))
        .expect(200);
    },
  );

  it.each([MembershipRole.ADMIN])(
    'allows an %s to create and update same-tenant sanction rules with an audit actor',
    async (role) => {
      const fixture = await createAccount({ role, withEmployee: false });
      const auditSpy = jest.spyOn(auditLogService, 'logAdminAction');
      const created = await request(app.getHttpServer())
        .post('/api/v1/sanctions/rules')
        .set(authorized(fixture.token))
        .send(sanctionRulePayload(`AUTH_${role}_${sequence}`))
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/api/v1/sanctions/rules/${created.body.id}`)
        .set(authorized(fixture.token))
        .send({ amountFcfa: 200 })
        .expect(200);

      expect(auditSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          actor: expect.objectContaining({
            actorType: 'USER',
            actorId: fixture.user.id,
            organizationId: fixture.organization.id,
            role,
          }),
          action: 'sanction.rule.update',
          resourceId: created.body.id,
        }),
      );
      auditSpy.mockRestore();
    },
  );

  it('rejects every Employee-personal attendance route for an EMPLOYEE Membership without an Employee profile', async () => {
    const fixture = await createAccount({
      role: MembershipRole.EMPLOYEE,
      withEmployee: false,
    });
    const initialAttendanceCount = await prisma.attendance.count();

    const responses = await Promise.all([
      request(app.getHttpServer())
        .get('/api/v1/attendance/me/today')
        .set(authorized(fixture.token)),
      request(app.getHttpServer())
        .get('/api/v1/attendance/me/history?month=2026-09')
        .set(authorized(fixture.token)),
      request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-in')
        .set(authorized(fixture.token))
        .send({}),
      request(app.getHttpServer())
        .post('/api/v1/attendance/me/check-out')
        .set(authorized(fixture.token))
        .send({}),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body.message).toBe(
        'An active employee profile is required for this resource.',
      );
    }
    expect(await prisma.attendance.count()).toBe(initialAttendanceCount);
    expect(
      await prisma.employee.count({
        where: { organizationId: fixture.organization.id },
      }),
    ).toBe(0);
  });

  it('rejects personal attendance for an EMPLOYEE whose Employee profile is inactive', async () => {
    const fixture = await createAccount({
      role: MembershipRole.EMPLOYEE,
      employeeActive: false,
    });

    await request(app.getHttpServer())
      .get('/api/v1/attendance/me/today')
      .set(authorized(fixture.token))
      .expect(403);
  });

  it('denies administrative operational reads and mutations to an EMPLOYEE', async () => {
    const fixture = await createAccount({
      role: MembershipRole.EMPLOYEE,
      withEmployee: false,
    });

    await request(app.getHttpServer())
      .get('/api/v1/employees')
      .set(authorized(fixture.token))
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/schedules')
      .set(authorized(fixture.token))
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/dashboard/overview')
      .set(authorized(fixture.token))
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/calendar/holidays?month=2026-09')
      .set(authorized(fixture.token))
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/sanctions/rules')
      .set(authorized(fixture.token))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/sanctions/rules')
      .set(authorized(fixture.token))
      .send(sanctionRulePayload(`FORBIDDEN_EMPLOYEE_${sequence}`))
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/v1/sanctions/rules/00000000-0000-4000-8000-000000000001')
      .set(authorized(fixture.token))
      .send({ amountFcfa: 1 })
      .expect(403);

    const scheduleCount = await prisma.schedule.count({
      where: { organizationId: fixture.organization.id },
    });
    await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set(authorized(fixture.token))
      .send(schedulePayload(`Forbidden employee schedule ${sequence}`))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/calendar/holidays')
      .set(authorized(fixture.token))
      .send(holidayPayload(`Forbidden employee holiday ${sequence}`))
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/v1/calendar/holidays/00000000-0000-4000-8000-000000000001')
      .set(authorized(fixture.token))
      .send({ name: 'Forbidden employee update' })
      .expect(403);
    await request(app.getHttpServer())
      .delete('/api/v1/calendar/holidays/00000000-0000-4000-8000-000000000001')
      .set(authorized(fixture.token))
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/v1/employees/00000000-0000-4000-8000-000000000001/role')
      .set(authorized(fixture.token))
      .send({ role: 'Administrator' })
      .expect(403);
    expect(
      await prisma.schedule.count({
        where: { organizationId: fixture.organization.id },
      }),
    ).toBe(scheduleCount);
  });

  it('allows an EMPLOYEE with an Employee profile to record only personal same-tenant attendance', async () => {
    const employeeAccount = await createAccount({
      role: MembershipRole.EMPLOYEE,
    });
    const foreign = await createAccount({
      role: MembershipRole.EMPLOYEE,
    });
    if (!employeeAccount.employee || !foreign.employee) {
      throw new Error('Expected Employee fixtures.');
    }
    const attendanceSite = employeeAccount.site;

    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set(authorized(employeeAccount.token))
      .send({ siteId: attendanceSite.id })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set(authorized(foreign.token))
      .send({ siteId: attendanceSite.id })
      .expect(404);
  });

  it('applies ADMIN and EMPLOYEE roles from the selected organization only', async () => {
    const fixture = await createAccount({
      role: MembershipRole.ADMIN,
      withEmployee: false,
    });
    const organizationB = await prisma.organization.create({
      data: {
        name: `Employee Organization ${++sequence}`,
        slug: `employee-organization-${sequence}`,
        timezone: 'Etc/UTC',
      },
    });
    await prisma.membership.create({
      data: {
        organizationId: organizationB.id,
        userId: fixture.user.id,
        role: MembershipRole.EMPLOYEE,
      },
    });
    const selectionB = await authService.selectOrganization(
      fixture.user.id,
      organizationB.id,
    );

    await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set(authorized(fixture.token))
      .send(schedulePayload(`Admin A ${sequence}`, fixture.site.id))
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set(authorized(selectionB.accessToken))
      .send(schedulePayload(`Employee B forbidden ${sequence}`))
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/schedules')
      .set(authorized(selectionB.accessToken))
      .expect(403);

    expect(
      await prisma.schedule.count({
        where: { organizationId: organizationB.id },
      }),
    ).toBe(0);
  });

  it('keeps EMPLOYEE in organization A distinct from ADMIN in organization B', async () => {
    const fixture = await createAccount({
      role: MembershipRole.EMPLOYEE,
      withEmployee: false,
    });
    const organizationB = await prisma.organization.create({
      data: {
        name: `Admin Organization ${++sequence}`,
        slug: `admin-organization-${sequence}`,
        timezone: 'Etc/UTC',
      },
    });
    await prisma.membership.create({
      data: {
        organizationId: organizationB.id,
        userId: fixture.user.id,
        role: MembershipRole.ADMIN,
      },
    });
    const selectionB = await authService.selectOrganization(
      fixture.user.id,
      organizationB.id,
    );

    await request(app.getHttpServer())
      .get('/api/v1/employees')
      .set(authorized(fixture.token))
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/calendar/holidays?month=2026-09')
      .set(authorized(fixture.token))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/calendar/holidays')
      .set(authorized(fixture.token))
      .send(holidayPayload(`Forbidden employee holiday ${sequence}`))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set(authorized(selectionB.accessToken))
      .send({
        ...schedulePayload(`Admin B ${sequence}`),
        organizationId: fixture.organization.id,
      })
      .expect(400);
    expect(
      await prisma.schedule.count({
        where: { organizationId: fixture.organization.id },
      }),
    ).toBe(0);
  });

  it.each([
    [MembershipRole.ADMIN, MembershipRole.EMPLOYEE],
    [MembershipRole.EMPLOYEE, MembershipRole.ADMIN],
  ])(
    're-resolves %s in organization A and %s in organization B',
    async (roleA, roleB) => {
      const fixture = await createAccount({
        role: roleA,
        withEmployee: false,
      });
      const organizationB = await prisma.organization.create({
        data: {
          name: `Role Matrix Organization ${++sequence}`,
          slug: `role-matrix-organization-${sequence}`,
          timezone: 'Etc/UTC',
        },
      });
      await prisma.membership.create({
        data: {
          organizationId: organizationB.id,
          userId: fixture.user.id,
          role: roleB,
        },
      });
      const [selectionA, selectionB] = await Promise.all([
        authService.selectOrganization(
          fixture.user.id,
          fixture.organization.id,
        ),
        authService.selectOrganization(fixture.user.id, organizationB.id),
      ]);

      const identityA = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authorized(selectionA.accessToken))
        .expect(200);
      const identityB = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set(authorized(selectionB.accessToken))
        .expect(200);

      expect(identityA.body).toMatchObject({
        membership: { role: roleA },
        organization: { id: fixture.organization.id },
      });
      expect(identityB.body).toMatchObject({
        membership: { role: roleB },
        organization: { id: organizationB.id },
      });
    },
  );

  it('does not grant a SUPER ADMIN implicit access to tenant APIs', async () => {
    sequence += 1;
    const user = await prisma.user.create({
      data: {
        normalizedEmail: `platform-admin-${sequence}@example.test`,
        passwordHash,
        platformAdmin: { create: {} },
      },
    });
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
    const platformToken = login.accessToken;

    await request(app.getHttpServer())
      .get('/api/v1/employees')
      .set(authorized(platformToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set(authorized(platformToken))
      .send(schedulePayload(`Forbidden platform schedule ${sequence}`))
      .expect(403);
  });

  it('keeps Legacy administrative mutations audited as Employee actors', async () => {
    sequence += 1;
    const employee = await prisma.employee.create({
      data: {
        employeeIdentifier: `AUTHZ-LEGACY-${sequence}`,
        firstName: 'Legacy',
        lastName: 'Administrator',
        email: `authorization-legacy-${sequence}@example.test`,
        role: 'Administrator',
        accessRole: AccessRole.ADMIN,
        passwordHash,
      },
    });
    const login = await authService.login({
      email: employee.email,
      password,
    });
    if ('organizationSelectionRequired' in login) {
      throw new Error('Expected a Legacy account token.');
    }
    const auditSpy = jest.spyOn(auditLogService, 'logAdminAction');

    await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set(authorized(login.accessToken))
      .send(schedulePayload(`Legacy audited schedule ${sequence}`))
      .expect(201);

    expect(auditSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        actor: {
          actorType: 'EMPLOYEE',
          actorId: employee.id,
          organizationId: null,
          role: AccessRole.ADMIN,
          employeeId: employee.id,
        },
      }),
    );
    auditSpy.mockRestore();
  });
});

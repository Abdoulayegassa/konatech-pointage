import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AccessRole, MembershipRole, PrismaClient, V1OperationalScopeStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/security/password.util';
import { AuthService } from '../src/modules/auth/auth.service';
import { AttendanceSettingsService } from '../src/modules/attendance/attendance-settings.service';
import { AttendanceSecurityService } from '../src/modules/attendance/attendance-security.service';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { OfflineAttendanceContextService } from '../src/modules/attendance/offline-attendance-context.service';
import { OfflineAttendanceAction } from '../src/modules/attendance/dto/offline-attendance-sync.dto';
import { SchedulesService } from '../src/modules/schedules/schedules.service';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(120_000);

describe('tenant attendance settings (e2e)', () => {
  const password = 'AttendanceSettings123!';
  let app: INestApplication;
  let prisma: PrismaClient;
  let auth: AuthService;
  let settings: AttendanceSettingsService;
  let security: AttendanceSecurityService;
  let attendance: AttendanceService;
  let schedules: SchedulesService;

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
    auth = app.get(AuthService);
    settings = app.get(AttendanceSettingsService);
    security = app.get(AttendanceSecurityService);
    attendance = app.get(AttendanceService);
    schedules = app.get(SchedulesService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function account(role: MembershipRole, suffix: string) {
    const passwordHash = await hashPassword(password);
    const organization = await prisma.organization.create({
      data: {
        name: `Settings ${suffix}`,
        slug: `settings-${suffix}`,
        timezone: 'Etc/UTC',
      },
    });
    const user = await prisma.user.create({
      data: {
        normalizedEmail: `settings-${suffix}@example.test`,
        passwordHash,
      },
    });
    await prisma.membership.create({
      data: { organizationId: organization.id, userId: user.id, role },
    });
    const site = await prisma.attendanceSite.create({
      data: { organizationId: organization.id, name: `Settings site ${suffix}`, latitude: 5.35, longitude: -4.01, allowedRadiusMeters: 100 },
    });
    if (role === MembershipRole.EMPLOYEE) {
      await prisma.employee.create({
        data: {
          employeeIdentifier: `SETTINGS-EMPLOYEE-${suffix}`,
          firstName: 'Settings',
          lastName: 'Employee',
          email: `settings-employee-${suffix}@example.test`,
          role: 'Employee',
          accessRole: AccessRole.EMPLOYEE,
          passwordHash,
          organizationId: organization.id,
          userId: user.id,
          primarySiteId: site.id,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      });
      const employee = await prisma.employee.findFirstOrThrow({ where: { organizationId: organization.id, userId: user.id } });
      await prisma.employeeSiteAssignment.create({
        data: { organizationId: organization.id, employeeId: employee.id, siteId: site.id, effectiveFrom: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`) },
      });
    }
    const login = await auth.login({ email: user.normalizedEmail, password });
    if ('organizationSelectionRequired' in login)
      throw new Error('Unexpected organization selection.');
    return { organization, site, token: login.accessToken };
  }

  function context(organizationId: string): AuthenticationContext {
    return {
      generation: 'saas',
      purpose: 'account',
      userId: 'settings-user',
      membershipId: 'settings-membership',
      organizationId,
      membershipRole: MembershipRole.ADMIN,
      employeeId: null,
      attendanceSiteId: null,
      sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
    };
  }

  it('uses AuthenticationContext, enforces roles, and resolves tenant settings before the legacy fallback', async () => {
    const admin = await account(MembershipRole.ADMIN, 'admin');
    const employee = await account(MembershipRole.EMPLOYEE, 'employee');
    const headers = { Authorization: `Bearer ${admin.token}` };
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/current/attendance-settings')
      .set(headers)
      .send({
        gpsRequired: true,
        selfieRequired: false,
        allowedRadiusMeters: 250,
        defaultLatenessMarginMinutes: 12,
        defaultWorkDays: ['MONDAY'],
      })
      .expect(200);
    const response = await request(app.getHttpServer())
      .get('/api/v1/organizations/current/attendance-settings')
      .set(headers)
      .expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        organizationId: admin.organization.id,
        gpsRequired: true,
        allowedRadiusMeters: 250,
      }),
    );
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/current/attendance-settings')
      .set({ Authorization: `Bearer ${employee.token}` })
      .send({ gpsRequired: false })
      .expect(403);
    const policy = await settings.resolveSecurityPolicy({
      generation: 'saas',
      purpose: 'account',
      userId: 'ignored',
      membershipId: 'ignored',
      organizationId: admin.organization.id,
      membershipRole: MembershipRole.ADMIN,
      employeeId: null,
      attendanceSiteId: null,
    });
    expect(policy.gpsRequired).toBe(true);
    expect(policy.selfieRequired).toBe(false);
    expect(policy.allowedRadiusMeters).toBe(250);
  });

  it('allows ADMIN to update, keeps EMPLOYEE read-only, and validates payloads', async () => {
    const admin = await account(MembershipRole.ADMIN, 'admin-settings');
    const employee = await account(MembershipRole.EMPLOYEE, 'employee-settings');

    await request(app.getHttpServer())
      .patch('/api/v1/organizations/current/attendance-settings')
      .set({ Authorization: `Bearer ${admin.token}` })
      .send({ gpsRequired: true, allowedRadiusMeters: 250 })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/organizations/current/attendance-settings')
      .set({ Authorization: `Bearer ${employee.token}` })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/current/attendance-settings')
      .set({ Authorization: `Bearer ${employee.token}` })
      .send({ gpsRequired: true })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/current/attendance-settings')
      .set({ Authorization: `Bearer ${admin.token}` })
      .send({ allowedRadiusMeters: 0 })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/current/attendance-settings')
      .set({ Authorization: `Bearer ${admin.token}` })
      .send({ organizationId: employee.organization.id })
      .expect(400);
  });

  it('applies active-site overrides over organization settings without crossing tenant or role boundaries', async () => {
    const admin = await account(MembershipRole.ADMIN, 'site-override');
    const employee = await account(MembershipRole.EMPLOYEE, 'site-override-employee');
    const otherTenant = await account(MembershipRole.ADMIN, 'site-override-other');
    const adminHeaders = { Authorization: `Bearer ${admin.token}` };

    await request(app.getHttpServer())
      .patch('/api/v1/organizations/current/attendance-settings')
      .set(adminHeaders)
      .send({ gpsRequired: true, selfieRequired: false, defaultLatenessMarginMinutes: 9, defaultWorkDays: ['MONDAY'] })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/attendance-sites/${admin.site.id}/settings`)
      .set(adminHeaders)
      .send({ gpsRequired: false, selfieRequired: true, defaultLatenessMarginMinutes: 17, defaultWorkDays: ['TUESDAY'] })
      .expect(200);

    const configured = await request(app.getHttpServer())
      .get(`/api/v1/attendance-sites/${admin.site.id}/settings`)
      .set(adminHeaders)
      .expect(200);
    expect(configured.body).toEqual(expect.objectContaining({
      organizationId: admin.organization.id,
      siteId: admin.site.id,
      gpsRequired: false,
      selfieRequired: true,
    }));
    const site = { id: admin.site.id, latitude: admin.site.latitude, longitude: admin.site.longitude, allowedRadiusMeters: admin.site.allowedRadiusMeters };
    const overridden = await settings.resolveSecurityPolicy(context(admin.organization.id), site);
    expect(overridden.gpsRequired).toBe(false);
    expect(overridden.selfieRequired).toBe(true);
    expect(await settings.resolveScheduleDefaults(context(admin.organization.id), admin.site.id)).toEqual({ latenessMarginMinutes: 17, workDays: ['TUESDAY'] });
    expect(await settings.resolveScheduleDefaults(context(admin.organization.id))).toEqual({ latenessMarginMinutes: 9, workDays: ['MONDAY'] });

    await request(app.getHttpServer())
      .patch(`/api/v1/attendance-sites/${admin.site.id}/settings`)
      .set({ Authorization: `Bearer ${employee.token}` })
      .send({ gpsRequired: true })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/v1/attendance-sites/${admin.site.id}/settings`)
      .set({ Authorization: `Bearer ${otherTenant.token}` })
      .send({ gpsRequired: true })
      .expect(404);
    await prisma.attendanceSite.update({ where: { id: admin.site.id }, data: { isActive: false } });
    await request(app.getHttpServer())
      .patch(`/api/v1/attendance-sites/${admin.site.id}/settings`)
      .set(adminHeaders)
      .send({ gpsRequired: true })
      .expect(404);
  });

  it('does not grant a SUPER ADMIN implicit access to tenant attendance settings', async () => {
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        normalizedEmail: 'settings-platform-admin@example.test',
        passwordHash,
        platformAdmin: { create: {} },
      },
    });
    const login = await auth.login({ email: user.normalizedEmail, password });
    if (
      !('platformAdmin' in login) ||
      login.platformAdmin !== true ||
      !('accessToken' in login)
    ) {
      throw new Error('Expected a SUPER ADMIN platform token.');
    }

    await request(app.getHttpServer())
      .get('/api/v1/organizations/current/attendance-settings')
      .set({ Authorization: `Bearer ${login.accessToken}` })
      .expect(403);
    await request(app.getHttpServer())
      .patch('/api/v1/organizations/current/attendance-settings')
      .set({ Authorization: `Bearer ${login.accessToken}` })
      .send({ gpsRequired: true })
      .expect(403);
  });

  it('applies GPS and selfie requirements independently for each tenant', async () => {
    const gpsTenant = await account(MembershipRole.ADMIN, 'gps');
    const selfieTenant = await account(MembershipRole.ADMIN, 'selfie');
    await prisma.organizationAttendanceSettings.create({
      data: {
        organizationId: gpsTenant.organization.id,
        gpsRequired: true,
        selfieRequired: false,
      },
    });
    await prisma.organizationAttendanceSettings.create({
      data: {
        organizationId: selfieTenant.organization.id,
        gpsRequired: false,
        selfieRequired: true,
      },
    });

    await expect(
      security.validateEvidence(undefined, {
        enforceSecurity: true,
        authentication: context(gpsTenant.organization.id),
      }),
    ).rejects.toThrow('Géolocalisation requise');
    await expect(
      security.validateEvidence(undefined, {
        enforceSecurity: true,
        authentication: context(selfieTenant.organization.id),
      }),
    ).rejects.toThrow('Selfie requis');
  });

  it('uses tenant settings, then environment settings, then safe defaults', async () => {
    const previous = {
      gps: process.env.ATTENDANCE_GPS_REQUIRED,
      selfie: process.env.ATTENDANCE_SELFIE_REQUIRED,
    };
    process.env.ATTENDANCE_GPS_REQUIRED = 'true';
    process.env.ATTENDANCE_SELFIE_REQUIRED = 'true';
    try {
      const tenant = await account(MembershipRole.ADMIN, 'fallback');
      await prisma.organizationAttendanceSettings.create({
        data: {
          organizationId: tenant.organization.id,
          gpsRequired: false,
          selfieRequired: false,
        },
      });
      await expect(
        settings.resolveSecurityPolicy(context(tenant.organization.id)),
      ).resolves.toMatchObject({ gpsRequired: false, selfieRequired: false });

      const environmentTenant = await account(
        MembershipRole.ADMIN,
        'environment',
      );
      await expect(
        settings.resolveSecurityPolicy(
          context(environmentTenant.organization.id),
        ),
      ).resolves.toMatchObject({ gpsRequired: true, selfieRequired: true });

      delete process.env.ATTENDANCE_GPS_REQUIRED;
      delete process.env.ATTENDANCE_SELFIE_REQUIRED;
      const defaultTenant = await account(MembershipRole.ADMIN, 'default');
      await expect(
        settings.resolveSecurityPolicy(context(defaultTenant.organization.id)),
      ).resolves.toMatchObject({ gpsRequired: false, selfieRequired: false });
    } finally {
      if (previous.gps === undefined)
        delete process.env.ATTENDANCE_GPS_REQUIRED;
      else process.env.ATTENDANCE_GPS_REQUIRED = previous.gps;
      if (previous.selfie === undefined)
        delete process.env.ATTENDANCE_SELFIE_REQUIRED;
      else process.env.ATTENDANCE_SELFIE_REQUIRED = previous.selfie;
    }
  });

  it('keeps explicit Schedule values authoritative over Organization defaults', async () => {
    const admin = await account(MembershipRole.ADMIN, 'schedule-explicit');
    await prisma.organizationAttendanceSettings.create({
      data: {
        organizationId: admin.organization.id,
        defaultLatenessMarginMinutes: 25,
        defaultWorkDays: ['SATURDAY'],
      },
    });
    const schedule = await schedules.create(
      {
        name: 'Explicit schedule',
        siteId: admin.site.id,
        startTime: '08:00',
        endTime: '17:00',
        latenessMarginMinutes: 7,
        workDays: ['MONDAY'],
      },
      context(admin.organization.id),
    );
    expect(schedule).toMatchObject({
      latenessMarginMinutes: 7,
      workDays: ['MONDAY'],
    });
  });

  it('uses Organization defaults for a new Schedule when values are absent', async () => {
    const admin = await account(MembershipRole.ADMIN, 'schedule-default');
    await prisma.organizationAttendanceSettings.create({
      data: {
        organizationId: admin.organization.id,
        defaultLatenessMarginMinutes: 25,
        defaultWorkDays: ['SATURDAY'],
      },
    });
    const schedule = await schedules.create(
      {
        name: 'Default schedule',
        siteId: admin.site.id,
        startTime: '08:00',
        endTime: '17:00',
      } as never,
      context(admin.organization.id),
    );
    expect(schedule).toMatchObject({
      latenessMarginMinutes: 25,
      workDays: ['SATURDAY'],
    });
  });

  it('uses Organization defaults through the Schedule API when values are absent', async () => {
    const admin = await account(MembershipRole.ADMIN, 'schedule-api-default');
    await prisma.organizationAttendanceSettings.create({
      data: {
        organizationId: admin.organization.id,
        defaultLatenessMarginMinutes: 25,
        defaultWorkDays: ['SATURDAY'],
      },
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set({ Authorization: `Bearer ${admin.token}` })
      .send({
        name: 'HTTP default schedule',
        siteId: admin.site.id,
        startTime: '08:00',
        endTime: '17:00',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      latenessMarginMinutes: 25,
      workDays: ['SATURDAY'],
    });
  });

  it('uses safe Schedule defaults when tenant defaults are absent', async () => {
    const admin = await account(MembershipRole.ADMIN, 'schedule-safe-default');
    const response = await request(app.getHttpServer())
      .post('/api/v1/schedules')
      .set({ Authorization: `Bearer ${admin.token}` })
      .send({
        name: 'HTTP safe default schedule',
        siteId: admin.site.id,
        startTime: '08:00',
        endTime: '17:00',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      latenessMarginMinutes: 0,
      workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    });
  });

  it('preserves Legacy Schedule defaults when workDays is omitted', async () => {
    const schedule = await schedules.create({
      name: 'Legacy default schedule',
      startTime: '08:00',
      endTime: '17:00',
    } as never);

    expect(schedule).toMatchObject({
      latenessMarginMinutes: 0,
      workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    });
  });

  it('uses the effective tenant policy when synchronizing offline attendance', async () => {
    const admin = await account(MembershipRole.ADMIN, 'offline');
    await prisma.organizationAttendanceSettings.create({
      data: {
        organizationId: admin.organization.id,
        gpsRequired: false,
        selfieRequired: false,
      },
    });
    const employee = await prisma.employee.create({
      data: {
        employeeIdentifier: 'SETTINGS-OFFLINE',
        firstName: 'Offline',
        lastName: 'Settings',
        email: 'settings-offline@example.test',
        role: 'Employee',
        passwordHash: await hashPassword(password),
        organizationId: admin.organization.id,
        primarySiteId: admin.site.id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    await prisma.employeeSiteAssignment.create({
      data: {
        organizationId: admin.organization.id,
        employeeId: employee.id,
        siteId: admin.site.id,
        effectiveFrom: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`),
      },
    });
    const contextToken = (await app.get(OfflineAttendanceContextService).issue(
      employee.id,
      { ...context(admin.organization.id), employeeId: employee.id, attendanceSiteId: admin.site.id },
    )).contextToken;

    await expect(
      attendance.synchronizeOfflineAttendance(
        employee.id,
        {
          clientRequestId: '8e1d42a8-dc3f-4d74-9877-6c5fdc7d1cb5',
          sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
          contextToken,
          action: OfflineAttendanceAction.CHECK_IN,
          capturedAt: new Date().toISOString(),
          siteId: admin.site.id,
        },
        context(admin.organization.id),
      ),
    ).resolves.toMatchObject({ state: 'accepted', idempotent: false });
  });

  it('does not resolve another tenant settings and preserves Legacy fallback', async () => {
    const first = await account(MembershipRole.ADMIN, 'isolation-a');
    const second = await account(MembershipRole.ADMIN, 'isolation-b');
    await prisma.organizationAttendanceSettings.create({
      data: {
        organizationId: first.organization.id,
        gpsRequired: true,
        selfieRequired: false,
      },
    });
    await prisma.organizationAttendanceSettings.create({
      data: {
        organizationId: second.organization.id,
        gpsRequired: false,
        selfieRequired: true,
      },
    });
    await expect(
      settings.resolveSecurityPolicy(context(first.organization.id)),
    ).resolves.toMatchObject({ gpsRequired: true, selfieRequired: false });
    await expect(
      settings.resolveSecurityPolicy(context(second.organization.id)),
    ).resolves.toMatchObject({ gpsRequired: false, selfieRequired: true });
    await expect(
      settings.resolveSecurityPolicy({
        ...context(first.organization.id),
        generation: 'legacy',
        organizationId: null,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        gpsRequired: expect.any(Boolean),
        selfieRequired: expect.any(Boolean),
      }),
    );
  });
});

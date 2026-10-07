import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  AccessRole,
  MembershipRole,
  PrismaClient,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  hashPassword,
  hashPinCode,
} from '../src/common/security/password.util';
import { AuthService } from '../src/modules/auth/auth.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30_000);

describe('ADMIN first-run onboarding status (e2e)', () => {
  const password = 'OwnerOnboarding123!';
  const organizationIds: string[] = [];
  const userIds: string[] = [];
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
    if (prisma) {
      await prisma.attendance.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.attendanceSite.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.employee.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await prisma.schedule.deleteMany({
        where: { organizationId: { in: organizationIds } },
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
        name: `Onboarding organization ${suffix}`,
        slug: `onboarding-organization-${suffix}`,
        timezone: 'Africa/Abidjan',
      },
    });
    organizationIds.push(organization.id);
    const user = await prisma.user.create({
      data: {
        normalizedEmail: `onboarding-${suffix}@example.test`,
        passwordHash,
      },
    });
    userIds.push(user.id);
    await prisma.membership.create({
      data: { organizationId: organization.id, userId: user.id, role },
    });
    const login = await authService.login({
      email: user.normalizedEmail,
      password,
    });
    if ('organizationSelectionRequired' in login) {
      throw new Error('Expected a tenant-scoped account token.');
    }
    return { organization, token: login.accessToken };
  }

  function authorized(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function createEmployee(organizationId: string, scheduleId?: string) {
    sequence += 1;
    return prisma.employee.create({
      data: {
        organizationId,
        employeeIdentifier: `ONBOARDING-${sequence}`,
        firstName: 'First',
        lastName: 'Employee',
        email: `employee-${sequence}@example.test`,
        role: 'Employee',
        accessRole: AccessRole.EMPLOYEE,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        passwordHash,
        scheduleId,
      },
    });
  }

  it('returns the real empty state for a new ADMIN', async () => {
    const fixture = await createAccount(MembershipRole.ADMIN);

    const response = await request(app.getHttpServer())
      .get('/api/v1/organizations/current/owner-onboarding')
      .set(authorized(fixture.token))
      .expect(200);

    expect(response.body).toMatchObject({
      organizationProfile: {
        configured: true,
        name: fixture.organization.name,
        status: 'ACTIVE',
        timezone: fixture.organization.timezone,
      },
      subscription: {
        activeAdministratorCount: 1,
        pendingAdministratorInvitationCount: 0,
        administratorCapacityUsed: 1,
        administratorLimit: 3,
        plan: 'PRO',
        status: 'TRIALING',
      },
      attendanceSites: { activeCount: 0, limit: 3 },
      employees: { activeCount: 0, limit: 50, pinConfiguredCount: 0 },
      schedules: { activeAssignedCount: 0 },
      attendance: { firstClockInCompleted: false },
      qr: { available: false },
    });
    expect(response.body).not.toHaveProperty('organizationId');

    const dashboardResponse = await request(app.getHttpServer())
      .get('/api/v1/dashboard/overview')
      .set(authorized(fixture.token))
      .expect(200);

    expect(dashboardResponse.body).toMatchObject({
      summary: {
        totalEmployees: 0,
        presentToday: 0,
        lateEmployeesToday: 0,
        absentEmployeesToday: 0,
        overtimeHoursToday: 0,
      },
      recentActivity: [],
    });
  });

  it('reports a partially completed setup without counting inactive sites', async () => {
    const fixture = await createAccount(MembershipRole.ADMIN);
    await createEmployee(fixture.organization.id);
    await prisma.attendanceSite.createMany({
      data: [
        {
          organizationId: fixture.organization.id,
          name: 'Inactive site',
          latitude: 5.32,
          longitude: -4.02,
          allowedRadiusMeters: 100,
          isActive: false,
        },
        {
          organizationId: fixture.organization.id,
          name: 'Active site',
          latitude: 5.33,
          longitude: -4.03,
          allowedRadiusMeters: 100,
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/organizations/current/owner-onboarding')
      .set(authorized(fixture.token))
      .expect(200);

    expect(response.body).toMatchObject({
      attendanceSites: { activeCount: 1 },
      employees: { activeCount: 1, pinConfiguredCount: 0 },
      schedules: { activeAssignedCount: 0 },
      attendance: { firstClockInCompleted: false },
      qr: { available: true },
    });
  });

  it('reports an existing configured organization as completed', async () => {
    const fixture = await createAccount(MembershipRole.ADMIN);
    const schedule = await prisma.schedule.create({
      data: {
        organizationId: fixture.organization.id,
        name: 'Office schedule',
        startTime: '08:00',
        endTime: '17:00',
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      },
    });
    const employee = await createEmployee(fixture.organization.id, schedule.id);
    await prisma.attendanceSite.create({
      data: {
        organizationId: fixture.organization.id,
        name: 'Head office',
        latitude: 5.32,
        longitude: -4.02,
        allowedRadiusMeters: 100,
      },
    });
    await prisma.employee.update({
      where: { id: employee.id },
      data: { pinCodeHash: await hashPinCode('2468') },
    });
    await prisma.attendance.create({
      data: {
        organizationId: fixture.organization.id,
        employeeId: employee.id,
        date: new Date('2026-09-09T00:00:00.000Z'),
        clockInAt: new Date('2026-09-09T08:00:00.000Z'),
      },
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/organizations/current/owner-onboarding')
      .set(authorized(fixture.token))
      .expect(200);

    expect(response.body).toMatchObject({
      organizationProfile: { configured: true },
      attendanceSites: { activeCount: 1 },
      employees: { activeCount: 1, pinConfiguredCount: 1 },
      schedules: { activeAssignedCount: 1 },
      attendance: { firstClockInCompleted: true },
      qr: { available: true },
    });
  });

  it('does not include setup data from another tenant', async () => {
    const emptyTenant = await createAccount(MembershipRole.ADMIN);
    const configuredTenant = await createAccount(MembershipRole.ADMIN);
    await createEmployee(configuredTenant.organization.id);
    await prisma.attendanceSite.create({
      data: {
        organizationId: configuredTenant.organization.id,
        name: 'Foreign site',
        latitude: 5.32,
        longitude: -4.02,
        allowedRadiusMeters: 100,
      },
    });

    const response = await request(app.getHttpServer())
      .get('/api/v1/organizations/current/owner-onboarding')
      .set(authorized(emptyTenant.token))
      .expect(200);

    expect(response.body).toMatchObject({
      attendanceSites: { activeCount: 0 },
      employees: { activeCount: 0, pinConfiguredCount: 0 },
      schedules: { activeAssignedCount: 0 },
      attendance: { firstClockInCompleted: false },
      qr: { available: false },
    });
  });

  it('rejects EMPLOYEE access to ADMIN onboarding data', async () => {
    const fixture = await createAccount(MembershipRole.EMPLOYEE);

    await request(app.getHttpServer())
      .get('/api/v1/organizations/current/owner-onboarding')
      .set(authorized(fixture.token))
      .expect(403);
  });

  it('keeps the operational dashboard available to ADMIN', async () => {
    const fixture = await createAccount(MembershipRole.ADMIN);

    await request(app.getHttpServer())
      .get('/api/v1/dashboard/overview')
      .set(authorized(fixture.token))
      .expect(200);
  });

  it('rejects EMPLOYEE access to organization dashboard data', async () => {
    const fixture = await createAccount(MembershipRole.EMPLOYEE);

    await request(app.getHttpServer())
      .get('/api/v1/dashboard/overview')
      .set(authorized(fixture.token))
      .expect(403);
  });
});

import { BadRequestException } from '@nestjs/common';
import {
  AttendanceStatus,
  AttendanceVerificationLevel,
  MembershipRole,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { DashboardService } from '../src/modules/dashboard/dashboard.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

const accountContext = (
  organizationId: string | null,
): AuthenticationContext => ({
  generation: 'saas',
  purpose: 'account',
  userId: 'dashboard-user',
  membershipId: 'dashboard-membership',
  organizationId,
  membershipRole: MembershipRole.ADMIN,
  employeeId: null,
  attendanceSiteId: null,
});

const legacyContext: AuthenticationContext = {
  generation: 'legacy',
  purpose: 'account',
  userId: null,
  membershipId: null,
  organizationId: null,
  membershipRole: null,
  employeeId: 'legacy-dashboard-admin',
  attendanceSiteId: null,
};

describe('Dashboard tenant isolation (e2e)', () => {
  const referenceDate = new Date('2026-08-03T12:00:00.000Z');
  let prisma: PrismaClient;
  let service: DashboardService;
  let organizationAId: string;
  let organizationBId: string;
  let employeeAId: string;
  let employeeBId: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    const calendarService = new CalendarService(
      prisma as unknown as PrismaService,
    );
    service = new DashboardService(
      prisma as unknown as PrismaService,
      calendarService,
    );

    const [organizationA, organizationB] = await Promise.all([
      prisma.organization.create({
        data: {
          name: 'Dashboard Tenant A',
          slug: 'dashboard-tenant-a',
          timezone: 'Etc/UTC',
        },
      }),
      prisma.organization.create({
        data: {
          name: 'Dashboard Tenant B',
          slug: 'dashboard-tenant-b',
          timezone: 'Etc/UTC',
        },
      }),
    ]);
    organizationAId = organizationA.id;
    organizationBId = organizationB.id;

    const [scheduleA, scheduleB] = await Promise.all([
      prisma.schedule.create({
        data: {
          name: 'Dashboard Tenant A Schedule',
          startTime: '08:00',
          endTime: '17:00',
          workDays: ['MONDAY'],
          organizationId: organizationAId,
        },
      }),
      prisma.schedule.create({
        data: {
          name: 'Dashboard Tenant B Schedule',
          startTime: '08:00',
          endTime: '17:00',
          workDays: ['MONDAY'],
          organizationId: organizationBId,
        },
      }),
    ]);

    const [employeeA, employeeB] = await Promise.all([
      prisma.employee.create({
        data: {
          employeeIdentifier: 'DASHBOARD-TENANT-A-001',
          firstName: 'Alice',
          lastName: 'Tenant A',
          email: 'dashboard-a@tenant.test',
          role: 'Employee',
          passwordHash: 'test-password-hash',
          organizationId: organizationAId,
          scheduleId: scheduleA.id,
        },
      }),
      prisma.employee.create({
        data: {
          employeeIdentifier: 'DASHBOARD-TENANT-B-001',
          firstName: 'Bob',
          lastName: 'Tenant B',
          email: 'dashboard-b@tenant.test',
          role: 'Employee',
          passwordHash: 'test-password-hash',
          organizationId: organizationBId,
          scheduleId: scheduleB.id,
        },
      }),
    ]);
    employeeAId = employeeA.id;
    employeeBId = employeeB.id;

    await Promise.all([
      prisma.employee.create({
        data: {
          employeeIdentifier: 'DASHBOARD-TENANT-B-002',
          firstName: 'Bruno',
          lastName: 'Tenant B',
          email: 'dashboard-b2@tenant.test',
          role: 'Employee',
          passwordHash: 'test-password-hash',
          organizationId: organizationBId,
          scheduleId: scheduleB.id,
        },
      }),
      prisma.employee.create({
        data: {
          employeeIdentifier: 'DASHBOARD-TENANT-B-INACTIVE',
          firstName: 'Inactive',
          lastName: 'Tenant B',
          email: 'dashboard-b-inactive@tenant.test',
          role: 'Employee',
          passwordHash: 'test-password-hash',
          organizationId: organizationBId,
          isActive: false,
        },
      }),
      prisma.attendance.create({
        data: {
          employeeId: employeeA.id,
          organizationId: organizationAId,
          date: new Date('2026-08-03T00:00:00.000Z'),
          status: AttendanceStatus.LATE,
          clockInAt: new Date('2026-08-03T08:20:00.000Z'),
          clockOutAt: new Date('2026-08-03T18:00:00.000Z'),
          minutesLate: 20,
          earlyExit: true,
          earlyExitMinutes: 10,
          overtimeHours: 1,
          overtimeMinutes: 60,
          checkInVerificationLevel: AttendanceVerificationLevel.WARNING,
        },
      }),
      prisma.attendance.create({
        data: {
          employeeId: employeeB.id,
          organizationId: organizationBId,
          date: new Date('2026-08-03T00:00:00.000Z'),
          status: AttendanceStatus.PRESENT,
          clockInAt: new Date('2026-08-03T08:00:00.000Z'),
          clockOutAt: new Date('2026-08-03T20:00:00.000Z'),
          overtimeHours: 3,
          overtimeMinutes: 180,
        },
      }),
      prisma.calendarEntry.create({
        data: {
          name: 'Tenant B company holiday',
          date: new Date('2026-08-03T00:00:00.000Z'),
          type: 'COMPANY_HOLIDAY',
          organizationId: organizationBId,
        },
      }),
    ]);
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('returns only Tenant A dashboard data to Tenant A', async () => {
    const overview = await service.getOverview(
      referenceDate,
      accountContext(organizationAId),
    );

    expect(overview.summary.totalEmployees).toBe(1);
    expect(overview.recentActivity.map((item) => item.employeeId)).toEqual([
      employeeAId,
    ]);
  });

  it('returns only Tenant B dashboard data to Tenant B', async () => {
    const overview = await service.getOverview(
      referenceDate,
      accountContext(organizationBId),
    );

    expect(overview.summary.totalEmployees).toBe(2);
    expect(overview.recentActivity.map((item) => item.employeeId)).toEqual([
      employeeBId,
    ]);
  });

  it('does not expose another tenant Attendance in recent activity', async () => {
    const overview = await service.getOverview(
      referenceDate,
      accountContext(organizationAId),
    );

    expect(
      overview.recentActivity.map((item) => item.employeeId),
    ).not.toContain(employeeBId);
  });

  it('scopes employee counters to the authenticated organization', async () => {
    const [tenantA, tenantB] = await Promise.all([
      service.getOverview(referenceDate, accountContext(organizationAId)),
      service.getOverview(referenceDate, accountContext(organizationBId)),
    ]);

    expect(tenantA.summary.totalEmployees).toBe(1);
    expect(tenantB.summary.totalEmployees).toBe(2);
  });

  it('scopes attendance statistics to the authenticated organization', async () => {
    const [tenantA, tenantB] = await Promise.all([
      service.getOverview(referenceDate, accountContext(organizationAId)),
      service.getOverview(referenceDate, accountContext(organizationBId)),
    ]);

    expect(tenantA.summary.lateEmployeesToday).toBe(1);
    expect(tenantB.summary.lateEmployeesToday).toBe(0);
  });

  it('scopes absence statistics to the authenticated organization', async () => {
    const [tenantA, tenantB] = await Promise.all([
      service.getOverview(referenceDate, accountContext(organizationAId)),
      service.getOverview(referenceDate, accountContext(organizationBId)),
    ]);

    expect(tenantA.analytics.absenceCountThisMonth).toBe(0);
    expect(tenantB.summary.absentEmployeesToday).toBe(0);
  });

  it('scopes overtime statistics to the authenticated organization', async () => {
    const [tenantA, tenantB] = await Promise.all([
      service.getOverview(referenceDate, accountContext(organizationAId)),
      service.getOverview(referenceDate, accountContext(organizationBId)),
    ]);

    expect(tenantA.summary.overtimeHoursToday).toBe(1);
    expect(tenantB.summary.overtimeHoursToday).toBe(3);
  });

  it('scopes lateness metrics used by sanction reporting to the tenant', async () => {
    const [tenantA, tenantB] = await Promise.all([
      service.getOverview(referenceDate, accountContext(organizationAId)),
      service.getOverview(referenceDate, accountContext(organizationBId)),
    ]);

    expect(tenantA.analytics.topLateEmployees).toEqual([
      expect.objectContaining({ employeeId: employeeAId }),
    ]);
    expect(tenantB.analytics.topLateEmployees).toEqual([]);
  });

  it('uses only the tenant Calendar when calculating non-working days', async () => {
    const [tenantA, tenantB] = await Promise.all([
      service.getOverview(referenceDate, accountContext(organizationAId)),
      service.getOverview(referenceDate, accountContext(organizationBId)),
    ]);

    expect(tenantA.summary.scheduledPresentToday).toBe(1);
    expect(tenantB.summary.scheduledPresentToday).toBe(0);
  });

  it('rejects a SaaS request without organization context', async () => {
    await expect(
      service.getOverview(referenceDate, accountContext(null)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not accept a client organizationId as tenant authority', async () => {
    const clientQuery = { organizationId: organizationBId };
    const overview = await service.getOverview(
      referenceDate,
      accountContext(organizationAId),
    );

    expect(clientQuery.organizationId).toBe(organizationBId);
    expect(overview.summary.totalEmployees).toBe(1);
    expect(overview.recentActivity.map((item) => item.employeeId)).toEqual([
      employeeAId,
    ]);
  });

  it('preserves legacy global Dashboard behavior', async () => {
    const overview = await service.getOverview(referenceDate, legacyContext);

    expect(overview.summary.totalEmployees).toBeGreaterThanOrEqual(3);
    expect(overview.recentActivity.map((item) => item.employeeId)).toEqual(
      expect.arrayContaining([employeeAId, employeeBId]),
    );
  });
});

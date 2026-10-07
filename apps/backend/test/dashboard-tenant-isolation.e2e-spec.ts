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
import { EffectiveScheduleResolver } from '../src/modules/schedules/effective-schedule.resolver';
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
  let employeeASiteAssignmentId: string;
  let siteAId: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    const calendarService = new CalendarService(
      prisma as unknown as PrismaService,
    );
    service = new DashboardService(
      prisma as unknown as PrismaService,
      calendarService,
      new EffectiveScheduleResolver(prisma as unknown as PrismaService),
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

    const [siteA, siteB] = await Promise.all([
      prisma.attendanceSite.create({ data: { organizationId: organizationAId, name: 'Dashboard A Site', latitude: 5, longitude: -4, allowedRadiusMeters: 100 } }),
      prisma.attendanceSite.create({ data: { organizationId: organizationBId, name: 'Dashboard B Site', latitude: 5, longitude: -4, allowedRadiusMeters: 100 } }),
    ]);
    siteAId = siteA.id;
    const [scheduleA, scheduleB] = await Promise.all([
      prisma.schedule.create({
        data: {
          name: 'Dashboard Tenant A Schedule',
          startTime: '08:00',
          endTime: '17:00',
          workDays: ['MONDAY'],
          organizationId: organizationAId,
          siteId: siteA.id,
          v1ScopeStatus: 'OPERATIONAL',
        },
      }),
      prisma.schedule.create({
        data: {
          name: 'Dashboard Tenant B Schedule',
          startTime: '08:00',
          endTime: '17:00',
          workDays: ['MONDAY'],
          organizationId: organizationBId,
          siteId: siteB.id,
          v1ScopeStatus: 'OPERATIONAL',
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
          primarySiteId: siteA.id,
          v1ScopeStatus: 'OPERATIONAL',
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
          primarySiteId: siteB.id,
          v1ScopeStatus: 'OPERATIONAL',
        },
      }),
    ]);
    employeeAId = employeeA.id;

    const [assignmentA, assignmentB] = await Promise.all([
      prisma.employeeSiteAssignment.create({ data: { organizationId: organizationAId, employeeId: employeeA.id, siteId: siteA.id, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') } }),
      prisma.employeeSiteAssignment.create({ data: { organizationId: organizationBId, employeeId: employeeB.id, siteId: siteB.id, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') } }),
    ]);
    employeeASiteAssignmentId = assignmentA.id;
    await Promise.all([
      prisma.employeeScheduleAssignment.create({ data: { organizationId: organizationAId, employeeId: employeeA.id, siteId: siteA.id, scheduleId: scheduleA.id, employeeSiteAssignmentId: assignmentA.id, effectiveFrom: assignmentA.effectiveFrom, v1ScopeStatus: 'OPERATIONAL' } }),
      prisma.employeeScheduleAssignment.create({ data: { organizationId: organizationBId, employeeId: employeeB.id, siteId: siteB.id, scheduleId: scheduleB.id, employeeSiteAssignmentId: assignmentB.id, effectiveFrom: assignmentB.effectiveFrom, v1ScopeStatus: 'OPERATIONAL' } }),
    ]);

    const employeeB2 = await prisma.employee.create({
        data: {
          employeeIdentifier: 'DASHBOARD-TENANT-B-002',
          firstName: 'Bruno',
          lastName: 'Tenant B',
          email: 'dashboard-b2@tenant.test',
          role: 'Employee',
          passwordHash: 'test-password-hash',
          organizationId: organizationBId,
          scheduleId: scheduleB.id,
          primarySiteId: siteB.id,
          v1ScopeStatus: 'OPERATIONAL',
        },
      });
    await prisma.employeeSiteAssignment.create({ data: { organizationId: organizationBId, employeeId: employeeB2.id, siteId: siteB.id, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') } });
    await Promise.all([
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
          attendanceSiteId: siteA.id,
          employeeSiteAssignmentId: assignmentA.id,
          v1ScopeStatus: 'OPERATIONAL',
          date: new Date('2026-08-03T00:00:00.000Z'),
          status: AttendanceStatus.LATE,
          clockInAt: new Date('2026-08-03T08:20:00.000Z'),
          clockOutAt: new Date('2026-08-03T18:00:00.000Z'),
          minutesLate: 20,
          earlyExit: true,
          earlyExitMinutes: 10,
          overtimeHours: 1,
          overtimeMinutes: 60,
          notes: 'Sensitive attendance justification',
          checkInDistanceMeters: 250,
          checkInVerificationLevel: AttendanceVerificationLevel.WARNING,
          checkInVerificationPhoto: 'https://evidence.test/check-in.jpg',
          checkInVerificationPhotoPublicId: 'private/check-in-evidence',
          checkOutVerificationPhoto: 'https://evidence.test/check-out.jpg',
          checkOutVerificationPhotoPublicId: 'private/check-out-evidence',
        },
      }),
      prisma.attendance.create({
        data: {
          employeeId: employeeB.id,
          organizationId: organizationBId,
          attendanceSiteId: siteB.id,
          employeeSiteAssignmentId: assignmentB.id,
          v1ScopeStatus: 'OPERATIONAL',
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
          v1ScopeStatus: 'OPERATIONAL',
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
    expect(
      overview.recentActivity.map((item) => item.employeeIdentifier),
    ).toEqual(['DASHBOARD-TENANT-A-001']);
  });

  it('returns only Tenant B dashboard data to Tenant B', async () => {
    const overview = await service.getOverview(
      referenceDate,
      accountContext(organizationBId),
    );

    expect(overview.summary.totalEmployees).toBe(2);
    expect(
      overview.recentActivity.map((item) => item.employeeIdentifier),
    ).toEqual(['DASHBOARD-TENANT-B-001']);
  });

  it('does not expose another tenant Attendance in recent activity', async () => {
    const overview = await service.getOverview(
      referenceDate,
      accountContext(organizationAId),
    );

    expect(
      overview.recentActivity.map((item) => item.employeeIdentifier),
    ).not.toContain('DASHBOARD-TENANT-B-001');
  });

  it('returns only fields required by dashboard activity widgets', async () => {
    const overview = await service.getOverview(
      referenceDate,
      accountContext(organizationAId),
    );

    expect(overview.recentActivity[0]).toEqual({
      employeeIdentifier: 'DASHBOARD-TENANT-A-001',
      employeeName: 'Alice Tenant A',
      department: null,
      status: AttendanceStatus.LATE,
      date: '2026-08-03T00:00:00.000Z',
      clockInAt: '2026-08-03T08:20:00.000Z',
      clockOutAt: '2026-08-03T18:00:00.000Z',
      earlyExit: true,
      earlyExitMinutes: 10,
      overtimeHours: 1,
      overtimeMinutes: 60,
      absenceCount: 0,
      minutesLate: 20,
    });
    expect(overview.recentActivity[0]).not.toHaveProperty(
      'checkInVerificationPhoto',
    );
    expect(overview.recentActivity[0]).not.toHaveProperty(
      'checkOutVerificationPhotoPublicId',
    );
    expect(Object.keys(overview.summary).sort()).toEqual(
      [
        'absentEmployeesToday',
        'earlyExitToday',
        'lateEmployeesToday',
        'overtimeHoursToday',
        'presentToday',
        'scheduledPresentToday',
        'totalEmployees',
      ].sort(),
    );
    expect(Object.keys(overview.analytics).sort()).toEqual(
      [
        'absenceCountThisMonth',
        'earlyExitCount',
        'overtimeHoursThisMonth',
        'topEarlyExitEmployees',
        'topLateEmployees',
        'topOvertimeEmployees',
      ].sort(),
    );

    const persistedAttendance = await prisma.attendance.findUniqueOrThrow({
      where: {
        employeeId_date: {
          employeeId: employeeAId,
          date: new Date('2026-08-03T00:00:00.000Z'),
        },
      },
      select: {
        checkInVerificationPhoto: true,
        checkOutVerificationPhotoPublicId: true,
      },
    });
    expect(persistedAttendance).toEqual({
      checkInVerificationPhoto: 'https://evidence.test/check-in.jpg',
      checkOutVerificationPhotoPublicId: 'private/check-out-evidence',
    });
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

  it('uses the authenticated organization timezone for today KPIs', async () => {
    const localBusinessDate = new Date('2026-08-04T00:00:00.000Z');

    await prisma.organization.update({
      where: { id: organizationAId },
      data: { timezone: 'Pacific/Kiritimati' },
    });

    try {
      await prisma.attendance.create({
        data: {
          employeeId: employeeAId,
          organizationId: organizationAId,
          attendanceSiteId: siteAId,
          employeeSiteAssignmentId: employeeASiteAssignmentId,
          v1ScopeStatus: 'OPERATIONAL',
          date: localBusinessDate,
          status: AttendanceStatus.PRESENT,
          clockInAt: new Date('2026-08-03T18:00:00.000Z'),
        },
      });
      const overview = await service.getOverview(
        new Date('2026-08-03T12:00:00.000Z'),
        accountContext(organizationAId),
      );

      expect(overview.date).toBe(localBusinessDate.toISOString());
      expect(overview.summary.presentToday).toBe(1);
      expect(overview.summary.lateEmployeesToday).toBe(0);
    } finally {
      await prisma.attendance.deleteMany({
        where: {
          organizationId: organizationAId,
          employeeId: employeeAId,
          date: localBusinessDate,
        },
      });
      await prisma.organization.update({
        where: { id: organizationAId },
        data: { timezone: 'Etc/UTC' },
      });
    }
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
      expect.objectContaining({ employeeName: 'Alice Tenant A' }),
    ]);
    expect(tenantB.analytics.topLateEmployees).toEqual([]);
    expect(tenantA.analytics.topLateEmployees[0]).not.toHaveProperty(
      'employeeId',
    );
    for (const ranking of [
      ...tenantA.analytics.topOvertimeEmployees,
      ...tenantA.analytics.topEarlyExitEmployees,
    ]) {
      expect(ranking).not.toHaveProperty('employeeId');
    }
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
    expect(
      overview.recentActivity.map((item) => item.employeeIdentifier),
    ).toEqual(['DASHBOARD-TENANT-A-001']);
  });

  it('keeps the Legacy Dashboard scoped to the Legacy namespace', async () => {
    const legacySchedule = await prisma.schedule.create({
      data: {
        name: 'Legacy Dashboard Schedule',
        startTime: '08:00',
        endTime: '17:00',
        workDays: ['MONDAY'],
      },
    });
    const legacyEmployee = await prisma.employee.create({
      data: {
        employeeIdentifier: 'DASHBOARD-LEGACY-001',
        firstName: 'Legacy',
        lastName: 'Only',
        email: 'dashboard-legacy@tenant.test',
        role: 'Employee',
        passwordHash: 'test-password-hash',
        scheduleId: legacySchedule.id,
      },
    });
    await prisma.attendance.create({
      data: {
        employeeId: legacyEmployee.id,
        date: new Date('2026-08-03T00:00:00.000Z'),
        status: AttendanceStatus.PRESENT,
        clockInAt: new Date('2026-08-03T08:00:00.000Z'),
      },
    });

    const expectedLegacyEmployees = await prisma.employee.count({
      where: { organizationId: null, userId: null, isActive: true },
    });
    const overview = await service.getOverview(referenceDate, legacyContext);

    expect(overview.summary.totalEmployees).toBe(expectedLegacyEmployees);
    expect(
      overview.recentActivity.map((item) => item.employeeIdentifier),
    ).toContain('DASHBOARD-LEGACY-001');
    expect(
      overview.recentActivity.map((item) => item.employeeIdentifier),
    ).not.toContain('DASHBOARD-TENANT-A-001');
    expect(
      overview.recentActivity.map((item) => item.employeeIdentifier),
    ).not.toContain('DASHBOARD-TENANT-B-001');
  });
});

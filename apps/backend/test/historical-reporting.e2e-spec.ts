import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AttendanceStatus,
  MembershipRole,
  PrismaClient,
  SubscriptionPlan,
  SubscriptionStatus,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { MonthlyAttendanceExportService } from '../src/modules/attendance/exports/monthly-attendance-export.service';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { SanctionsService } from '../src/modules/sanctions/sanctions.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(60_000);

describe('Phase 10.6.5 historical reporting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let attendance: AttendanceService;
  let calendar: CalendarService;
  let exportsService: MonthlyAttendanceExportService;
  let sanctions: SanctionsService;
  let sequence = 0;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    attendance = app.get(AttendanceService);
    calendar = app.get(CalendarService);
    exportsService = app.get(MonthlyAttendanceExportService);
    sanctions = app.get(SanctionsService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  function context(organizationId: string): AuthenticationContext {
    return {
      generation: 'saas',
      purpose: 'account',
      userId: 'historical-user',
      membershipId: 'historical-membership',
      organizationId,
      membershipRole: MembershipRole.ADMIN,
      employeeId: null,
      attendanceSiteId: null,
    };
  }

  async function createOrganization(
    plan: SubscriptionPlan = SubscriptionPlan.BUSINESS,
    timezone = 'America/New_York',
  ) {
    sequence += 1;
    const suffix = `${sequence}-${Math.random().toString(36).slice(2)}`;
    const organization = await prisma.organization.create({
      data: {
        name: `Historical ${suffix}`,
        slug: `historical-${suffix}`,
        timezone,
      },
    });
    await prisma.organizationSubscription.update({
      where: { organizationId: organization.id },
      data: {
        plan,
        status: SubscriptionStatus.ACTIVE,
        endsAt: new Date('2027-12-31T00:00:00.000Z'),
        graceEndsAt: new Date('2028-01-07T00:00:00.000Z'),
      },
    });
    return { organization, context: context(organization.id), suffix };
  }

  async function checkInAndOut(input: {
    employeeId: string;
    siteId: string;
    clockInAt: string;
    clockOutAt: string;
    authentication: AuthenticationContext;
  }) {
    await attendance.checkIn(
      {
        employeeId: input.employeeId,
        siteId: input.siteId,
        occurredAt: input.clockInAt,
      },
      input.authentication,
    );
    return attendance.checkOut(
      {
        employeeId: input.employeeId,
        siteId: input.siteId,
        occurredAt: input.clockOutAt,
      },
      input.authentication,
    );
  }

  it('reports persisted attendance for an inactive employee and deactivated sites', async () => {
    const data = await createOrganization();
    const [siteA, siteB] = await Promise.all(
      ['Archive A', 'Archive B'].map((name, index) =>
        prisma.attendanceSite.create({
          data: {
            organizationId: data.organization.id,
            name: `${name} ${data.suffix}`,
            latitude: 12 + index,
            longitude: -1 - index,
            allowedRadiusMeters: 100,
          },
        }),
      ),
    );
    const oldSchedule = await prisma.schedule.create({
      data: {
        organizationId: data.organization.id,
        siteId: siteA.id,
        name: `Old schedule ${data.suffix}`,
        startTime: '08:00',
        endTime: '17:00',
        latenessMarginMinutes: 0,
        workDays: [
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
          'SATURDAY',
          'SUNDAY',
        ],
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    const newSchedule = await prisma.schedule.create({
      data: {
        organizationId: data.organization.id,
        siteId: siteB.id,
        name: `New schedule ${data.suffix}`,
        startTime: '09:00',
        endTime: '18:00',
        latenessMarginMinutes: 0,
        workDays: [
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
          'SATURDAY',
          'SUNDAY',
        ],
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    const employee = await prisma.employee.create({
      data: {
        organizationId: data.organization.id,
        employeeIdentifier: `HIST-${data.suffix}`,
        firstName: 'Historical',
        lastName: 'Employee',
        email: `historical-${data.suffix}@example.test`,
        role: 'Employee',
        passwordHash: 'test-password-hash',
        scheduleId: newSchedule.id,
        primarySiteId: siteB.id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    const [siteAssignmentA, siteAssignmentB] = await Promise.all([
      prisma.employeeSiteAssignment.create({ data: { organizationId: data.organization.id, employeeId: employee.id, siteId: siteA.id, effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), effectiveTo: new Date('2026-07-01T00:00:00.000Z') } }),
      prisma.employeeSiteAssignment.create({ data: { organizationId: data.organization.id, employeeId: employee.id, siteId: siteB.id, effectiveFrom: new Date('2026-07-01T00:00:00.000Z') } }),
    ]);
    await prisma.employeeScheduleAssignment.createMany({
      data: [
        { organizationId: data.organization.id, employeeId: employee.id, siteId: siteA.id, scheduleId: oldSchedule.id, employeeSiteAssignmentId: siteAssignmentA.id, effectiveFrom: new Date('2026-01-01T00:00:00.000Z'), effectiveTo: new Date('2026-07-01T00:00:00.000Z'), v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL },
        { organizationId: data.organization.id, employeeId: employee.id, siteId: siteB.id, scheduleId: newSchedule.id, employeeSiteAssignmentId: siteAssignmentB.id, effectiveFrom: new Date('2026-07-01T00:00:00.000Z'), v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL },
      ],
    });
    const holiday = await calendar.create(
      {
        name: 'Historical holiday',
        date: '2026-06-15',
        type: 'PUBLIC_HOLIDAY',
      },
      data.context,
    );
    await prisma.sanctionRule.create({
      data: {
        organizationId: data.organization.id,
        type: 'MINOR_LATENESS',
        code: `HIST_MINOR_${data.suffix}`,
        name: 'Historical minor lateness',
        latenessMinMinutes: 1,
        latenessMaxMinutes: 15,
        monthlyTolerance: 1,
        amountFcfa: 2000,
        priority: 1,
        appliedReason: 'Applied',
        toleratedReason: 'Tolerated',
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });

    const holidayAttendance = await checkInAndOut({
      employeeId: employee.id,
      siteId: siteA.id,
      clockInAt: '2026-06-15T13:00:00.000Z',
      clockOutAt: '2026-06-15T21:00:00.000Z',
      authentication: data.context,
    });
    await checkInAndOut({
      employeeId: employee.id,
      siteId: siteA.id,
      clockInAt: '2026-06-30T12:10:00.000Z',
      clockOutAt: '2026-06-30T21:00:00.000Z',
      authentication: data.context,
    });
    await checkInAndOut({
      employeeId: employee.id,
      siteId: siteB.id,
      clockInAt: '2026-07-01T13:10:00.000Z',
      clockOutAt: '2026-07-01T22:00:00.000Z',
      authentication: data.context,
    });
    await checkInAndOut({
      employeeId: employee.id,
      siteId: siteB.id,
      clockInAt: '2026-07-15T13:00:00.000Z',
      clockOutAt: '2026-07-15T23:00:00.000Z',
      authentication: data.context,
    });
    await prisma.calendarEntry.update({
      where: { id: holiday.id },
      data: { isActive: false },
    });
    await prisma.attendanceSite.update({
      where: { id: siteA.id },
      data: { isActive: false },
    });
    await prisma.employee.update({
      where: { id: employee.id },
      data: { isActive: false },
    });

    expect(holidayAttendance.status).toBe(
      AttendanceStatus.NON_WORKING_DAY_WORK,
    );
    expect(holidayAttendance.overtimeMinutes).toBe(480);

    const teamReport = await exportsService.buildMonthlyReport(
      {
        mode: 'custom',
        startDate: '2026-06-15',
        endDate: '2026-07-15',
      },
      data.context,
    );
    expect(teamReport.rows).toEqual([
      expect.objectContaining({
        employeeIdentifier: employee.employeeIdentifier,
        entryCount: 4,
      }),
    ]);

    const report = await exportsService.buildMonthlyReport(
      {
        mode: 'custom',
        startDate: '2026-06-15',
        endDate: '2026-07-15',
        employeeId: employee.id,
      },
      data.context,
    );
    expect(report.rows).toHaveLength(1);
    expect(report.organizationTimezone).toBe('America/New_York');
    expect(report.employeeReport?.entryCount).toBe(4);
    expect(report.employeeReport?.assignedScheduleLabel).toContain(
      'Planning variable',
    );
    expect(report.employeeReport?.dailyRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: '15/06/2026',
          attendanceSiteId: siteA.id,
          siteLabel: siteA.name,
          statusLabel: 'Travail jour non ouvré',
        }),
        expect.objectContaining({
          date: '15/07/2026',
          attendanceSiteId: siteB.id,
          siteLabel: siteB.name,
        }),
      ]),
    );

    const history = (await attendance.getAttendanceHistory(
      { startDate: '2026-06-15', endDate: '2026-07-15' },
      data.context,
    )) as Array<{
      employee: { isActive: boolean };
      attendanceSite: { id: string } | null;
    }>;
    expect(history).toHaveLength(4);
    expect(history.every((item) => item.employee.isActive === false)).toBe(
      true,
    );
    expect(history.some((item) => item.attendanceSite?.id === siteA.id)).toBe(
      true,
    );

    const periodSanctions = await sanctions.getSanctionsForDateRange(
      new Date('2026-06-15T00:00:00.000Z'),
      new Date('2026-07-16T00:00:00.000Z'),
      employee.id,
      data.context,
    );
    const lateSanctions = periodSanctions.filter(
      (item) => item.ruleType === 'MINOR_LATENESS',
    );
    expect(lateSanctions).toHaveLength(2);
    expect(lateSanctions.every((item) => item.status === 'TOLERATED')).toBe(
      true,
    );
  });

  it('enforces tenant scope and handles old or empty periods', async () => {
    const owner = await createOrganization();
    const foreign = await createOrganization();
    const foreignEmployee = await prisma.employee.create({
      data: {
        organizationId: foreign.organization.id,
        employeeIdentifier: `FOREIGN-${foreign.suffix}`,
        firstName: 'Foreign',
        lastName: 'Employee',
        email: `foreign-${foreign.suffix}@example.test`,
        role: 'Employee',
        passwordHash: 'test-password-hash',
      },
    });
    await expect(
      exportsService.buildMonthlyReport(
        {
          mode: 'monthly',
          month: 6,
          year: 2026,
          employeeId: foreignEmployee.id,
        },
        owner.context,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    const empty = await exportsService.buildMonthlyReport(
      { mode: 'monthly', month: 6, year: 2026 },
      owner.context,
    );
    expect(empty.rows).toEqual([]);

    const starter = await createOrganization(SubscriptionPlan.STARTER);
    await expect(
      attendance.getAttendanceHistory({ month: '2020-01' }, starter.context),
    ).resolves.toBeDefined();
  });

  it('keeps both inclusive endpoints across a year boundary', async () => {
    const data = await createOrganization();
    const site = await prisma.attendanceSite.create({
      data: {
        organizationId: data.organization.id,
        name: `Year site ${data.suffix}`,
        latitude: 12,
        longitude: -1,
        allowedRadiusMeters: 100,
      },
    });
    const schedule = await prisma.schedule.create({
      data: {
        organizationId: data.organization.id,
        siteId: site.id,
        name: `Year boundary ${data.suffix}`,
        startTime: '08:00',
        endTime: '17:00',
        workDays: [
          'MONDAY',
          'TUESDAY',
          'WEDNESDAY',
          'THURSDAY',
          'FRIDAY',
          'SATURDAY',
          'SUNDAY',
        ],
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    const employee = await prisma.employee.create({
      data: {
        organizationId: data.organization.id,
        employeeIdentifier: `YEAR-${data.suffix}`,
        firstName: 'Year',
        lastName: 'Boundary',
        email: `year-${data.suffix}@example.test`,
        role: 'Employee',
        passwordHash: 'test-password-hash',
        scheduleId: schedule.id,
        primarySiteId: site.id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    const siteAssignment = await prisma.employeeSiteAssignment.create({
      data: { organizationId: data.organization.id, employeeId: employee.id, siteId: site.id, effectiveFrom: new Date('2025-01-01T00:00:00.000Z') },
    });
    await prisma.employeeScheduleAssignment.create({
      data: { organizationId: data.organization.id, employeeId: employee.id, siteId: site.id, scheduleId: schedule.id, employeeSiteAssignmentId: siteAssignment.id, effectiveFrom: new Date('2025-01-01T00:00:00.000Z'), v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL },
    });
    for (const date of ['2025-12-15', '2026-01-15']) {
      await checkInAndOut({
        employeeId: employee.id,
        siteId: site.id,
        clockInAt: `${date}T13:00:00.000Z`,
        clockOutAt: `${date}T22:00:00.000Z`,
        authentication: data.context,
      });
    }
    await prisma.employee.update({
      where: { id: employee.id },
      data: { isActive: false },
    });

    const report = await exportsService.buildMonthlyReport(
      {
        mode: 'custom',
        startDate: '2025-12-15',
        endDate: '2026-01-15',
        employeeId: employee.id,
      },
      data.context,
    );
    expect(report.employeeReport?.entryCount).toBe(2);
    expect(report.employeeReport?.dailyRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ date: '15/12/2025' }),
        expect.objectContaining({ date: '15/01/2026' }),
      ]),
    );
  });

  it('keeps the Legacy inactive-employee export behavior unchanged', async () => {
    sequence += 1;
    const employee = await prisma.employee.create({
      data: {
        employeeIdentifier: `LEGACY-HIST-${sequence}`,
        firstName: 'Legacy',
        lastName: 'Inactive',
        email: `legacy-historical-${sequence}@example.test`,
        role: 'Employee',
        passwordHash: 'test-password-hash',
        isActive: false,
      },
    });
    await prisma.attendance.create({
      data: {
        employeeId: employee.id,
        date: new Date('2026-06-15T00:00:00.000Z'),
        clockInAt: new Date('2026-06-15T08:00:00.000Z'),
        clockOutAt: new Date('2026-06-15T17:00:00.000Z'),
        status: AttendanceStatus.PRESENT,
      },
    });

    const report = await exportsService.buildMonthlyReport({
      mode: 'monthly',
      month: 6,
      year: 2026,
      employeeId: employee.id,
    });
    expect(report.rows).toEqual([]);
    expect(report.employeeReport).toBeNull();
  });
});

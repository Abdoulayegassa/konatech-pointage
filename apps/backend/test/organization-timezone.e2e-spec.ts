import { INestApplication, ValidationPipe } from '@nestjs/common';
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
import { CheckInDto } from '../src/modules/attendance/dto/check-in.dto';
import { MonthlyAttendanceExportService } from '../src/modules/attendance/exports/monthly-attendance-export.service';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { SanctionsService } from '../src/modules/sanctions/sanctions.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(60_000);

describe('Phase 10.6.4 organization timezone (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let attendance: AttendanceService;
  let calendar: CalendarService;
  let sanctions: SanctionsService;
  let exports: MonthlyAttendanceExportService;
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
    sanctions = app.get(SanctionsService);
    exports = app.get(MonthlyAttendanceExportService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  function context(organizationId: string): AuthenticationContext {
    return {
      generation: 'saas',
      purpose: 'account',
      userId: 'timezone-user',
      membershipId: 'timezone-membership',
      organizationId,
      membershipRole: MembershipRole.ADMIN,
      employeeId: null,
      attendanceSiteId: null,
    };
  }

  async function fixture(
    timezone: string,
    schedule = { startTime: '08:00', endTime: '17:00' },
  ) {
    sequence += 1;
    const suffix = `${sequence}-${Math.random().toString(36).slice(2)}`;
    const organization = await prisma.organization.create({
      data: {
        name: `Timezone ${suffix}`,
        slug: `timezone-${suffix}`,
        timezone,
      },
    });
    await prisma.organizationSubscription.update({
      where: { organizationId: organization.id },
      data: {
        plan: SubscriptionPlan.BUSINESS,
        status: SubscriptionStatus.ACTIVE,
        endsAt: new Date('2027-12-31T00:00:00.000Z'),
        graceEndsAt: new Date('2028-01-07T00:00:00.000Z'),
      },
    });
    const site = await prisma.attendanceSite.create({
      data: {
        organizationId: organization.id,
        name: `Site ${suffix}`,
        latitude: 12,
        longitude: -1,
        allowedRadiusMeters: 100,
      },
    });
    const workSchedule = await prisma.schedule.create({
      data: {
        organizationId: organization.id,
        siteId: site.id,
        name: `Schedule ${suffix}`,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        latenessMarginMinutes: 5,
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
        organizationId: organization.id,
        primarySiteId: site.id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        employeeIdentifier: `TZ-${suffix}`,
        firstName: 'Timezone',
        lastName: suffix,
        email: `timezone-${suffix}@example.test`,
        role: 'Employee',
        passwordHash: 'test-password-hash',
        scheduleId: workSchedule.id,
      },
    });
    const siteAssignment = await prisma.employeeSiteAssignment.create({
      data: {
        organizationId: organization.id,
        employeeId: employee.id,
        siteId: site.id,
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
      },
    });
    await prisma.employeeScheduleAssignment.create({
      data: {
        organizationId: organization.id,
        employeeId: employee.id,
        siteId: site.id,
        scheduleId: workSchedule.id,
        employeeSiteAssignmentId: siteAssignment.id,
        effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    return {
      organization,
      employee,
      site,
      context: context(organization.id),
    };
  }

  it('derives normal and midnight business days from each tenant timezone', async () => {
    const losAngeles = await fixture('America/Los_Angeles');
    const tokyo = await fixture('Asia/Tokyo');
    const instant = '2026-06-15T00:30:00.000Z';
    const west = await attendance.checkIn(
      {
        employeeId: losAngeles.employee.id,
        siteId: losAngeles.site.id,
        occurredAt: instant,
      },
      losAngeles.context,
    );
    const east = await attendance.checkIn(
      {
        employeeId: tokyo.employee.id,
        siteId: tokyo.site.id,
        occurredAt: instant,
      },
      tokyo.context,
    );
    expect(west.clockInAt?.toISOString()).toBe(instant);
    expect(west.date.toISOString()).toBe('2026-06-14T00:00:00.000Z');
    expect(east.date.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('calculates lateness against the organization-local schedule', async () => {
    const data = await fixture('Asia/Tokyo');
    const result = await attendance.checkIn(
      {
        employeeId: data.employee.id,
        siteId: data.site.id,
        occurredAt: '2026-06-15T23:16:00.000Z',
      },
      data.context,
    );
    expect(result.date.toISOString()).toBe('2026-06-16T00:00:00.000Z');
    expect(result.minutesLate).toBe(11);
    expect(result.status).toBe(AttendanceStatus.LATE);
  });

  it('supports an overnight schedule without moving the attendance day', async () => {
    const data = await fixture('Africa/Abidjan', {
      startTime: '22:00',
      endTime: '06:00',
    });
    const checkIn = await attendance.checkIn(
      {
        employeeId: data.employee.id,
        siteId: data.site.id,
        occurredAt: '2026-06-15T22:00:00.000Z',
      },
      data.context,
    );
    await calendar.create(
      {
        name: 'Holiday after overnight shift',
        date: '2026-06-16',
        type: 'PUBLIC_HOLIDAY',
      },
      data.context,
    );
    await prisma.organization.update({
      where: { id: data.organization.id },
      data: { timezone: 'Asia/Tokyo' },
    });
    const checkOut = await attendance.checkOut(
      {
        employeeId: data.employee.id,
        siteId: data.site.id,
        occurredAt: '2026-06-16T06:00:00.000Z',
      },
      data.context,
    );
    expect(checkIn.scheduledExitTime?.toISOString()).toBe(
      '2026-06-16T06:00:00.000Z',
    );
    expect(checkOut.date.toISOString()).toBe('2026-06-15T00:00:00.000Z');
    expect(checkOut.status).toBe(AttendanceStatus.PRESENT);
    expect(checkOut.scheduledExitTime?.toISOString()).toBe(
      '2026-06-16T06:00:00.000Z',
    );
    expect(checkOut.overtimeMinutes).toBe(0);
  });

  it('handles month and year boundaries independently for opposite timezones', async () => {
    const newYork = await fixture('America/New_York');
    const auckland = await fixture('Pacific/Auckland');
    const instant = '2026-01-01T00:30:00.000Z';
    const west = await attendance.checkIn(
      {
        employeeId: newYork.employee.id,
        siteId: newYork.site.id,
        occurredAt: instant,
      },
      newYork.context,
    );
    const east = await attendance.checkIn(
      {
        employeeId: auckland.employee.id,
        siteId: auckland.site.id,
        occurredAt: instant,
      },
      auckland.context,
    );
    expect(west.date.toISOString()).toBe('2025-12-31T00:00:00.000Z');
    expect(east.date.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps custom 15/06 through 15/07 periods inclusive and historical times local', async () => {
    const data = await fixture('America/New_York');
    for (const occurredAt of [
      '2026-06-15T12:00:00.000Z',
      '2026-07-15T12:00:00.000Z',
      '2026-07-16T12:00:00.000Z',
    ]) {
      const employee =
        occurredAt === '2026-06-15T12:00:00.000Z'
          ? data.employee
          : await prisma.employee.create({
              data: {
                organizationId: data.organization.id,
                primarySiteId: data.site.id,
                v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
                employeeIdentifier: `TZ-PERIOD-${occurredAt.slice(5, 10)}`,
                firstName: 'Period',
                lastName: occurredAt,
                email: `period-${occurredAt.slice(5, 10)}-${sequence}@example.test`,
                role: 'Employee',
                passwordHash: 'test-password-hash',
                scheduleId: data.employee.scheduleId,
              },
            });
      if (employee.id !== data.employee.id) {
        const siteAssignment = await prisma.employeeSiteAssignment.create({
          data: {
            organizationId: data.organization.id,
            employeeId: employee.id,
            siteId: data.site.id,
            effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
          },
        });
        await prisma.employeeScheduleAssignment.create({
          data: {
            organizationId: data.organization.id,
            employeeId: employee.id,
            siteId: data.site.id,
            scheduleId: data.employee.scheduleId!,
            employeeSiteAssignmentId: siteAssignment.id,
            effectiveFrom: new Date('2020-01-01T00:00:00.000Z'),
            v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
          },
        });
      }
      await attendance.checkIn(
        {
          employeeId: employee.id,
          siteId: data.site.id,
          occurredAt,
        },
        data.context,
      );
    }
    const report = await exports.buildMonthlyReport(
      {
        mode: 'custom',
        startDate: '2026-06-15',
        endDate: '2026-07-15',
      },
      data.context,
    );
    expect(report.organizationTimezone).toBe('America/New_York');
    expect(report.periodLabel).toContain('15 juin 2026');
    expect(report.periodLabel).toContain('15 juillet 2026');
    expect(report.rows.reduce((sum, row) => sum + row.entryCount, 0)).toBe(2);
    const historical = await exports.buildMonthlyReport(
      {
        mode: 'custom',
        startDate: '2026-06-15',
        endDate: '2026-07-15',
        employeeId: data.employee.id,
      },
      data.context,
    );
    expect(historical.employeeReport?.dailyRows[0].clockInTime).toBe('08:00');
  });

  it('resets monthly sanction tolerance at the local calendar-month boundary', async () => {
    const data = await fixture('Pacific/Auckland');
    await prisma.sanctionRule.create({
      data: {
        organizationId: data.organization.id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        type: 'MINOR_LATENESS',
        code: `TZ_MINOR_${sequence}`,
        name: 'Timezone minor lateness',
        latenessMinMinutes: 1,
        latenessMaxMinutes: 15,
        monthlyTolerance: 1,
        amountFcfa: 2000,
        priority: 1,
        appliedReason: 'Applied',
        toleratedReason: 'Tolerated',
      },
    });
    for (const occurredAt of [
      '2026-06-29T20:10:00.000Z',
      '2026-06-30T20:10:00.000Z',
    ]) {
      await attendance.checkIn(
        {
          employeeId: data.employee.id,
          siteId: data.site.id,
          occurredAt,
        },
        data.context,
      );
    }
    const result = await sanctions.getSanctionsForDateRange(
      new Date('2026-06-30T00:00:00.000Z'),
      new Date('2026-07-02T00:00:00.000Z'),
      data.employee.id,
      data.context,
    );
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.status === 'TOLERATED')).toBe(true);
  });

  it('applies holidays using the local attendance date and preserves multi-site context', async () => {
    const data = await fixture('Asia/Tokyo');
    await calendar.create(
      {
        name: 'Local holiday',
        date: '2026-06-16',
        type: 'PUBLIC_HOLIDAY',
      },
      data.context,
    );
    const result = await attendance.checkIn(
      {
        employeeId: data.employee.id,
        siteId: data.site.id,
        occurredAt: '2026-06-15T23:30:00.000Z',
      },
      data.context,
    );
    expect(result.status).toBe(AttendanceStatus.NON_WORKING_DAY_WORK);
    expect(result.attendanceSiteId).toBe(data.site.id);
  });

  it('preserves tenant isolation while allowing another site in the same organization', async () => {
    const tenant = await fixture('America/New_York');
    const otherTenant = await fixture('Asia/Tokyo');
    const secondarySite = await prisma.attendanceSite.create({
      data: {
        organizationId: tenant.organization.id,
        name: `Secondary site ${sequence}`,
        latitude: 12.1,
        longitude: -1.1,
        allowedRadiusMeters: 100,
      },
    });
    const secondarySchedule = await prisma.schedule.create({
      data: {
        organizationId: tenant.organization.id,
        siteId: secondarySite.id,
        name: `Secondary schedule ${sequence}`,
        startTime: '08:00',
        endTime: '17:00',
        latenessMarginMinutes: 5,
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
    const effectiveFrom = new Date('2026-06-15T00:00:00.000Z');
    const originalSiteAssignment = await prisma.employeeSiteAssignment.findFirstOrThrow({
      where: {
        organizationId: tenant.organization.id,
        employeeId: tenant.employee.id,
        siteId: tenant.site.id,
        effectiveTo: null,
      },
    });
    await prisma.employeeSiteAssignment.update({
      where: { id: originalSiteAssignment.id },
      data: { effectiveTo: effectiveFrom },
    });
    await prisma.employeeScheduleAssignment.updateMany({
      where: {
        organizationId: tenant.organization.id,
        employeeId: tenant.employee.id,
        siteId: tenant.site.id,
        effectiveTo: null,
      },
      data: { effectiveTo: effectiveFrom },
    });
    const secondarySiteAssignment = await prisma.employeeSiteAssignment.create({
      data: {
        organizationId: tenant.organization.id,
        employeeId: tenant.employee.id,
        siteId: secondarySite.id,
        effectiveFrom,
      },
    });
    await prisma.employeeScheduleAssignment.create({
      data: {
        organizationId: tenant.organization.id,
        employeeId: tenant.employee.id,
        siteId: secondarySite.id,
        scheduleId: secondarySchedule.id,
        employeeSiteAssignmentId: secondarySiteAssignment.id,
        effectiveFrom,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });

    await expect(
      attendance.checkIn(
        {
          employeeId: otherTenant.employee.id,
          siteId: secondarySite.id,
          occurredAt: '2026-06-15T13:00:00.000Z',
        },
        tenant.context,
      ),
    ).rejects.toMatchObject({ status: 404 });

    const result = await attendance.checkIn(
      {
        employeeId: tenant.employee.id,
        siteId: secondarySite.id,
        occurredAt: '2026-06-15T13:00:00.000Z',
      },
      tenant.context,
    );

    expect(result.attendanceSiteId).toBe(secondarySite.id);
    expect(result.date.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('never derives the business date from a client timezone', async () => {
    const data = await fixture('America/Los_Angeles');
    const payload = {
      employeeId: data.employee.id,
      siteId: data.site.id,
      occurredAt: '2026-06-15T00:30:00.000Z',
      timezone: 'Asia/Tokyo',
    };
    const validation = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    await expect(
      validation.transform(payload, { type: 'body', metatype: CheckInDto }),
    ).rejects.toMatchObject({ status: 400 });

    const result = await attendance.checkIn(
      payload as CheckInDto,
      data.context,
    );
    expect(result.date.toISOString()).toBe('2026-06-14T00:00:00.000Z');
  });
});

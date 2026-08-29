import {
  BadRequestException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessRole, MembershipRole, PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/security/password.util';
import { FULL_WORK_WEEK } from '../src/common/utils/attendance-date.util';
import { AttendanceMonthlyMetricsService } from '../src/modules/attendance/attendance-monthly-metrics.service';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { CheckInDto } from '../src/modules/attendance/dto/check-in.dto';
import { MonthlyAttendanceExportService } from '../src/modules/attendance/exports/monthly-attendance-export.service';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

describe('Cross-cutting Employee Schedule tenant isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let attendanceService: AttendanceService;
  let metricsService: AttendanceMonthlyMetricsService;
  let exportService: MonthlyAttendanceExportService;
  let passwordHash: string;
  let sequence = 0;

  beforeAll(async () => {
    await prepareTestDatabase();
    passwordHash = await hashPassword('ScheduleTenantBoundary123!');
    prisma = new PrismaClient();
    await prisma.employee.updateMany({ data: { isActive: false } });

    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    await app.init();
    attendanceService = app.get(AttendanceService);
    metricsService = app.get(AttendanceMonthlyMetricsService);
    exportService = app.get(MonthlyAttendanceExportService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  const context = (organizationId: string): AuthenticationContext => ({
    generation: 'saas',
    purpose: 'account',
    userId: 'cross-cutting-user',
    membershipId: 'cross-cutting-membership',
    organizationId,
    membershipRole: MembershipRole.ADMIN,
    employeeId: null,
    attendanceSiteId: null,
  });

  async function createInconsistentFixture() {
    sequence += 1;
    const suffix = String(sequence).padStart(3, '0');
    const organizationA = await prisma.organization.create({
      data: {
        name: `Schedule Boundary A ${suffix}`,
        slug: `schedule-boundary-a-${suffix}`,
        timezone: 'Etc/UTC',
      },
    });
    const organizationB = await prisma.organization.create({
      data: {
        name: `Schedule Boundary B ${suffix}`,
        slug: `schedule-boundary-b-${suffix}`,
        timezone: 'Etc/UTC',
      },
    });
    const scheduleA = await prisma.schedule.create({
      data: {
        name: `Schedule Boundary A ${suffix}`,
        startTime: '08:00',
        endTime: '17:00',
        workDays: [...FULL_WORK_WEEK],
        organizationId: organizationA.id,
      },
    });
    const scheduleB = await prisma.schedule.create({
      data: {
        name: `Foreign Schedule B ${suffix}`,
        startTime: '02:00',
        endTime: '23:00',
        workDays: [...FULL_WORK_WEEK],
        organizationId: organizationB.id,
      },
    });
    const employeeA = await prisma.employee.create({
      data: {
        employeeIdentifier: `SCHEDULE-A-${suffix}`,
        firstName: 'Employee',
        lastName: `A ${suffix}`,
        email: `schedule-a-${suffix}@example.test`,
        role: 'Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
        isActive: true,
        organizationId: organizationA.id,
        scheduleId: scheduleB.id,
      },
    });
    const employeeB = await prisma.employee.create({
      data: {
        employeeIdentifier: `SCHEDULE-B-${suffix}`,
        firstName: 'Employee',
        lastName: `B ${suffix}`,
        email: `schedule-b-${suffix}@example.test`,
        role: 'Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
        isActive: true,
        organizationId: organizationB.id,
        scheduleId: scheduleB.id,
      },
    });

    return {
      organizationA,
      organizationB,
      scheduleA,
      scheduleB,
      employeeA,
      employeeB,
    };
  }

  it('does not use a foreign Schedule in SaaS Attendance', async () => {
    const fixture = await createInconsistentFixture();
    await expect(
      attendanceService.getEmployeeTodayAttendance(
        fixture.employeeA.id,
        new Date('2026-03-02T12:00:00.000Z'),
        context(fixture.organizationA.id),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not use a foreign Schedule during SaaS check-in or check-out', async () => {
    const fixture = await createInconsistentFixture();
    const authentication = context(fixture.organizationA.id);
    await expect(
      attendanceService.checkIn(
        {
          employeeId: fixture.employeeA.id,
          occurredAt: '2026-03-03T08:00:00.000Z',
        },
        authentication,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    await prisma.attendance.create({
      data: {
        employeeId: fixture.employeeA.id,
        organizationId: fixture.organizationA.id,
        date: new Date('2026-03-03T00:00:00.000Z'),
        clockInAt: new Date('2026-03-03T08:00:00.000Z'),
      },
    });
    await expect(
      attendanceService.checkOut(
        {
          employeeId: fixture.employeeA.id,
          occurredAt: '2026-03-03T17:00:00.000Z',
        },
        authentication,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('excludes a foreign Schedule from SaaS daily calculations', async () => {
    const fixture = await createInconsistentFixture();
    await expect(
      attendanceService.getTodaySummary(
        new Date('2026-03-04T12:00:00.000Z'),
        context(fixture.organizationA.id),
      ),
    ).resolves.toEqual(expect.objectContaining({ expected: 0, absences: 0 }));
  });

  it('does not expose a foreign Schedule in a SaaS monthly export', async () => {
    const fixture = await createInconsistentFixture();
    const report = await exportService.buildMonthlyReport(
      { month: 3, year: 2026, employeeId: fixture.employeeA.id },
      context(fixture.organizationA.id),
    );
    expect(report.rows[0].assignedSchedule).toBe('No schedule assigned');
    expect(JSON.stringify(report)).not.toContain(fixture.scheduleB.name);
  });

  it('does not expose a foreign Schedule in a SaaS custom-period export', async () => {
    const fixture = await createInconsistentFixture();
    const report = await exportService.buildMonthlyReport(
      {
        mode: 'custom',
        startDate: '2026-03-02',
        endDate: '2026-03-06',
        employeeId: fixture.employeeA.id,
      },
      context(fixture.organizationA.id),
    );
    expect(report.rows[0].assignedSchedule).toBe('No schedule assigned');
    expect(JSON.stringify(report)).not.toContain(fixture.scheduleB.name);
  });

  it('does not generate tenant Attendance from a foreign Schedule', async () => {
    const fixture = await createInconsistentFixture();
    await metricsService.recalculateMonth(2026, 3, fixture.employeeA.id);
    await expect(
      prisma.attendance.count({ where: { employeeId: fixture.employeeA.id } }),
    ).resolves.toBe(0);
  });

  it('continues to use a valid same-tenant Schedule', async () => {
    const fixture = await createInconsistentFixture();
    await prisma.employee.update({
      where: { id: fixture.employeeA.id },
      data: { scheduleId: fixture.scheduleA.id },
    });
    const result = await attendanceService.checkIn(
      {
        employeeId: fixture.employeeA.id,
        occurredAt: '2026-03-09T08:00:00.000Z',
      },
      context(fixture.organizationA.id),
    );
    expect(result.scheduleNameSnapshot).toBe(fixture.scheduleA.name);
  });

  it('preserves explicit legacy Schedule behavior', async () => {
    const fixture = await createInconsistentFixture();
    const legacyEmployee = await prisma.employee.create({
      data: {
        employeeIdentifier: `LEGACY-SCHEDULE-${sequence}`,
        firstName: 'Legacy',
        lastName: `Schedule ${sequence}`,
        email: `legacy-schedule-${sequence}@example.test`,
        role: 'Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
        isActive: true,
        scheduleId: fixture.scheduleB.id,
      },
    });
    const result = await attendanceService.checkIn({
      employeeId: legacyEmployee.id,
      occurredAt: '2026-03-10T08:00:00.000Z',
    });
    expect(result.scheduleNameSnapshot).toBe(fixture.scheduleB.name);
  });

  it('keeps tenant B Employee and Schedule data inaccessible to tenant A', async () => {
    const fixture = await createInconsistentFixture();
    const report = await exportService.buildMonthlyReport(
      { month: 3, year: 2026, employeeId: fixture.employeeB.id },
      context(fixture.organizationA.id),
    );
    expect(report.rows).toEqual([]);
    expect(report.employeeReport).toBeNull();
  });

  it('ignores a client organizationId and keeps AuthenticationContext authoritative', async () => {
    const fixture = await createInconsistentFixture();
    await prisma.employee.update({
      where: { id: fixture.employeeA.id },
      data: { scheduleId: fixture.scheduleA.id },
    });
    const result = await attendanceService.checkIn(
      {
        employeeId: fixture.employeeA.id,
        occurredAt: '2026-03-11T08:00:00.000Z',
        organizationId: fixture.organizationB.id,
      } as CheckInDto & { organizationId: string },
      context(fixture.organizationA.id),
    );
    const stored = await prisma.attendance.findUniqueOrThrow({
      where: { id: result.id },
      select: { organizationId: true },
    });
    expect(stored.organizationId).toBe(fixture.organizationA.id);
  });
});

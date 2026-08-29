import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AccessRole,
  AttendanceStatus,
  MembershipRole,
  PrismaClient,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/security/password.util';
import { FULL_WORK_WEEK } from '../src/common/utils/attendance-date.util';
import { AttendanceMonthlyMetricsService } from '../src/modules/attendance/attendance-monthly-metrics.service';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { MonthlyAttendanceExportService } from '../src/modules/attendance/exports/monthly-attendance-export.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(30000);

describe('Attendance Calendar tenant boundary (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let attendance: AttendanceService;
  let metrics: AttendanceMonthlyMetricsService;
  let exports: MonthlyAttendanceExportService;
  let calendar: CalendarService;
  let auth: AuthService;
  let sequence = 0;
  let passwordHash: string;

  const accountContext = (
    organizationId: string | null,
  ): AuthenticationContext => ({
    generation: 'saas',
    purpose: 'account',
    userId: 'test-user',
    membershipId: 'test-membership',
    organizationId,
    membershipRole: MembershipRole.ADMIN,
    employeeId: null,
    attendanceSiteId: null,
  });

  beforeAll(async () => {
    await prepareTestDatabase();
    passwordHash = await hashPassword('AttendanceCalendar123!');
    prisma = new PrismaClient();
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    attendance = app.get(AttendanceService);
    metrics = app.get(AttendanceMonthlyMetricsService);
    exports = app.get(MonthlyAttendanceExportService);
    calendar = app.get(CalendarService);
    auth = app.get(AuthService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function createTenant(label: string) {
    sequence += 1;
    const suffix = `${label.toLowerCase()}-${sequence}`;
    const organization = await prisma.organization.create({
      data: {
        name: `Tenant ${suffix}`,
        slug: `tenant-${suffix}`,
        timezone: 'Etc/UTC',
      },
    });
    const schedule = await prisma.schedule.create({
      data: {
        name: `Schedule ${suffix}`,
        startTime: '08:00',
        endTime: '17:00',
        workDays: [...FULL_WORK_WEEK],
        organizationId: organization.id,
      },
    });
    const user = await prisma.user.create({
      data: { normalizedEmail: `user-${suffix}@example.test`, passwordHash },
    });
    const membership = await prisma.membership.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        role: MembershipRole.MEMBER,
      },
    });
    const employee = await prisma.employee.create({
      data: {
        employeeIdentifier: `EMP-${suffix}`,
        firstName: 'Tenant',
        lastName: label,
        email: `employee-${suffix}@example.test`,
        role: 'Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
        isActive: true,
        userId: user.id,
        organizationId: organization.id,
        scheduleId: schedule.id,
      },
    });
    const site = await prisma.attendanceSite.create({
      data: {
        organizationId: organization.id,
        name: `Site ${suffix}`,
        latitude: 0,
        longitude: 0,
        allowedRadiusMeters: 100,
      },
    });
    const token = auth.createAttendanceEntryToken({
      employeeId: employee.id,
      organizationId: organization.id,
      attendanceSiteId: site.id,
    });
    return { organization, schedule, user, membership, employee, site, token };
  }

  async function addHoliday(
    organizationId: string | null,
    date: string,
    name: string,
  ) {
    return prisma.calendarEntry.create({
      data: {
        organizationId,
        date: new Date(`${date}T00:00:00.000Z`),
        name,
        type: 'PUBLIC_HOLIDAY',
      },
    });
  }

  it('applies an Organization A holiday to A attendance', async () => {
    const a = await createTenant('A');
    await addHoliday(a.organization.id, '2026-08-03', 'A holiday');
    const result = await attendance.checkIn(
      { employeeId: a.employee.id, occurredAt: '2026-08-03T08:00:00.000Z' },
      accountContext(a.organization.id),
    );
    expect(result.status).toBe(AttendanceStatus.NON_WORKING_DAY_WORK);
  });

  it('applies an Organization B holiday to B attendance', async () => {
    const b = await createTenant('B');
    await addHoliday(b.organization.id, '2026-08-04', 'B holiday');
    const result = await attendance.checkIn(
      { employeeId: b.employee.id, occurredAt: '2026-08-04T08:00:00.000Z' },
      accountContext(b.organization.id),
    );
    expect(result.status).toBe(AttendanceStatus.NON_WORKING_DAY_WORK);
  });

  it('does not apply an Organization B holiday to A', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    await addHoliday(b.organization.id, '2026-08-05', 'Only B');
    const result = await attendance.checkIn(
      { employeeId: a.employee.id, occurredAt: '2026-08-05T08:00:00.000Z' },
      accountContext(a.organization.id),
    );
    expect(result.status).not.toBe(AttendanceStatus.NON_WORKING_DAY_WORK);
  });

  it('cannot read a B CalendarEntry through A Attendance', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    await addHoliday(b.organization.id, '2026-08-06', 'Private B');
    await expect(
      attendance.getTodaySummary(
        new Date('2026-08-06T12:00:00.000Z'),
        accountContext(a.organization.id),
      ),
    ).resolves.toEqual(expect.objectContaining({ expected: 1 }));
  });

  it('rejects SaaS Attendance without organization context', async () => {
    await expect(
      attendance.getTodaySummary(new Date(), accountContext(null)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not fall back to the global Calendar for invalid SaaS context', async () => {
    await addHoliday(null, '2026-08-07', 'Legacy global');
    await expect(
      attendance.getTodaySummary(
        new Date('2026-08-07T12:00:00.000Z'),
        accountContext(null),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires the attendance-entry Employee to belong to the token organization', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const token = auth.createAttendanceEntryToken({
      employeeId: b.employee.id,
      organizationId: a.organization.id,
      attendanceSiteId: a.site.id,
    });
    await request(app.getHttpServer())
      .get('/api/v1/attendance/me/today')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('requires the AttendanceSite to belong to the token organization', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const token = auth.createAttendanceEntryToken({
      employeeId: a.employee.id,
      organizationId: a.organization.id,
      attendanceSiteId: b.site.id,
    });
    await request(app.getHttpServer())
      .get('/api/v1/attendance/me/today')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects cross-tenant AttendanceSite access', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const token = auth.createAttendanceEntryToken({
      employeeId: b.employee.id,
      organizationId: b.organization.id,
      attendanceSiteId: a.site.id,
    });
    await request(app.getHttpServer())
      .get('/api/v1/attendance/me/today')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects an inactive AttendanceSite', async () => {
    const a = await createTenant('A');
    await prisma.attendanceSite.update({
      where: { id: a.site.id },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .get('/api/v1/attendance/me/today')
      .set('Authorization', `Bearer ${a.token}`)
      .expect(401);
  });

  it('rejects an inactive Employee', async () => {
    const a = await createTenant('A');
    await prisma.employee.update({
      where: { id: a.employee.id },
      data: { isActive: false },
    });
    await request(app.getHttpServer())
      .get('/api/v1/attendance/me/today')
      .set('Authorization', `Bearer ${a.token}`)
      .expect(401);
  });

  it('prevents a token from A from operating on a B Employee', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const token = auth.createAttendanceEntryToken({
      employeeId: b.employee.id,
      organizationId: a.organization.id,
      attendanceSiteId: a.site.id,
    });
    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set('Authorization', `Bearer ${token}`)
      .send({ occurredAt: '2026-08-10T08:00:00.000Z' })
      .expect(401);
  });

  it('prevents a token from A from operating with a B site', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const token = auth.createAttendanceEntryToken({
      employeeId: a.employee.id,
      organizationId: a.organization.id,
      attendanceSiteId: b.site.id,
    });
    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set('Authorization', `Bearer ${token}`)
      .send({ occurredAt: '2026-08-11T08:00:00.000Z' })
      .expect(401);
  });

  it('rejects client organizationId spoofing', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/check-in')
      .set('Authorization', `Bearer ${a.token}`)
      .send({
        occurredAt: '2026-08-12T08:00:00.000Z',
        organizationId: b.organization.id,
      })
      .expect(400);
  });

  it('allows a valid attendance_entry token on employee attendance routes', async () => {
    const a = await createTenant('A');
    await request(app.getHttpServer())
      .get('/api/v1/attendance/me/today')
      .set('Authorization', `Bearer ${a.token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.employee.id).toBe(a.employee.id);
      });
  });

  it('rejects an attendance_entry token after Organization suspension', async () => {
    const a = await createTenant('A');
    await prisma.organization.update({
      where: { id: a.organization.id },
      data: { status: 'SUSPENDED' },
    });
    await request(app.getHttpServer())
      .get('/api/v1/attendance/me/today')
      .set('Authorization', `Bearer ${a.token}`)
      .expect(401);
  });

  it('does not let attendance_entry become an account/admin context', async () => {
    const a = await createTenant('A');
    await request(app.getHttpServer())
      .get('/api/v1/attendance/summary')
      .set('Authorization', `Bearer ${a.token}`)
      .expect(403);
  });

  it('preserves historical legacy Attendance behavior', async () => {
    const legacy = await prisma.employee.create({
      data: {
        employeeIdentifier: `LEGACY-${++sequence}`,
        firstName: 'Legacy',
        lastName: 'Employee',
        email: `legacy-${sequence}@example.test`,
        role: 'Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
        isActive: true,
      },
    });
    await expect(
      attendance.getEmployeeTodayAttendance(
        legacy.id,
        new Date('2026-08-13T12:00:00.000Z'),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        employee: expect.objectContaining({ id: legacy.id }),
      }),
    );
  });

  it('preserves historical global Calendar behavior for legacy calls', async () => {
    await addHoliday(null, '2026-08-14', 'Legacy holiday');
    await expect(
      calendar.isNonWorkingDay(new Date('2026-08-14T00:00:00.000Z')),
    ).resolves.toBe(true);
  });

  it("uses each organization's Calendar during monthly absence generation", async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    await addHoliday(a.organization.id, '2026-08-17', 'Only A');
    await metrics.recalculateMonth(2026, 8);
    const [aAbsence, bAbsence] = await Promise.all([
      prisma.attendance.findFirst({
        where: {
          employeeId: a.employee.id,
          date: new Date('2026-08-17T00:00:00.000Z'),
        },
      }),
      prisma.attendance.findFirst({
        where: {
          employeeId: b.employee.id,
          date: new Date('2026-08-17T00:00:00.000Z'),
        },
      }),
    ]);
    expect(aAbsence).toBeNull();
    expect(bAbsence?.status).toBe(AttendanceStatus.ABSENT);
  });

  it('uses the organization Calendar for custom-period calculations', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    await addHoliday(b.organization.id, '2026-08-18', 'B custom holiday');
    const report = await exports.buildMonthlyReport(
      {
        mode: 'custom',
        startDate: '2026-08-18',
        endDate: '2026-08-18',
        employeeId: a.employee.id,
      },
      accountContext(a.organization.id),
    );
    expect(report.employeeReport?.absenceCount).toBe(1);
  });

  it('keeps dashboard/non-working-day calculations tenant-scoped at the shared boundary', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    await addHoliday(b.organization.id, '2026-08-19', 'B dashboard holiday');
    await expect(
      calendar.isNonWorkingDay(
        new Date('2026-08-19T00:00:00.000Z'),
        accountContext(a.organization.id),
      ),
    ).resolves.toBe(false);
  });

  it('does not mix Calendar data in report generation', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    await addHoliday(a.organization.id, '2026-08-20', 'A report holiday');
    const report = await exports.buildMonthlyReport(
      {
        mode: 'custom',
        startDate: '2026-08-20',
        endDate: '2026-08-20',
        employeeId: b.employee.id,
      },
      accountContext(b.organization.id),
    );
    expect(report.employeeReport?.absenceCount).toBe(1);
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].employeeIdentifier).toBe(
      b.employee.employeeIdentifier,
    );
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AccessRole, MembershipRole, PrismaClient, SubscriptionPlan, SubscriptionStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MonthlyAttendancePuppeteerPdfRendererService } from '../src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service';
import { hashPassword } from '../src/common/security/password.util';
import { prepareTestDatabase } from './test-database';

describe('Site data contracts (HTTP tenant isolation)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let sequence = 0;
  const password = 'SiteContracts123!';

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 120_000);
  afterAll(async () => { await app?.close(); await prisma?.$disconnect(); });

  async function fixture() {
    sequence += 1;
    const organization = await prisma.organization.create({ data: { name: `Site Contract ${sequence}`, slug: `site-contract-${sequence}`, timezone: 'UTC' } });
    await prisma.organizationSubscription.update({ where: { organizationId: organization.id }, data: {
      plan: SubscriptionPlan.PRO, status: SubscriptionStatus.ACTIVE,
      endsAt: new Date(Date.now() + 86_400_000), graceEndsAt: new Date(Date.now() + 86_400_000),
    } });
    const passwordHash = await hashPassword(password);
    const tokens: Record<string, string> = {};
    for (const role of [MembershipRole.ADMIN, MembershipRole.EMPLOYEE]) {
      const user = await prisma.user.create({ data: { normalizedEmail: `site-contract-${sequence}-${role.toLowerCase()}@test.local`, passwordHash } });
      await prisma.membership.create({ data: { organizationId: organization.id, userId: user.id, role } });
      const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: user.normalizedEmail, password }).expect(201);
      tokens[role] = login.body.accessToken as string;
    }
    const [siteA, siteB] = await Promise.all(['A', 'B'].map((name) => prisma.attendanceSite.create({ data: { organizationId: organization.id, name, latitude: 5, longitude: -4, allowedRadiusMeters: 100 } })));
    const [scheduleA, scheduleB] = await Promise.all([siteA, siteB].map((site) => prisma.schedule.create({ data: {
      organizationId: organization.id, siteId: site.id, name: `Schedule ${site.name} ${sequence}`, startTime: '08:00', endTime: '17:00', workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'], v1ScopeStatus: 'OPERATIONAL',
    } })));
    const employee = await prisma.employee.create({ data: {
      employeeIdentifier: `SC-${sequence}`, firstName: 'Site', lastName: 'Employee', email: `site-profile-${sequence}@test.local`, role: 'Employee',
      accessRole: AccessRole.EMPLOYEE, passwordHash, organizationId: organization.id, primarySiteId: siteB.id, v1ScopeStatus: 'OPERATIONAL',
    } });
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const siteAssignment = await prisma.employeeSiteAssignment.create({ data: { organizationId: organization.id, employeeId: employee.id, siteId: siteA.id, effectiveFrom: monthStart } });
    await prisma.employeeScheduleAssignment.create({ data: { organizationId: organization.id, employeeId: employee.id, siteId: siteA.id, scheduleId: scheduleA.id, employeeSiteAssignmentId: siteAssignment.id, effectiveFrom: monthStart, v1ScopeStatus: 'OPERATIONAL' } });
    const attendance = await prisma.attendance.create({ data: { organizationId: organization.id, employeeId: employee.id, attendanceSiteId: siteA.id, employeeSiteAssignmentId: siteAssignment.id, date: today, clockInAt: new Date(), status: 'PRESENT', v1ScopeStatus: 'OPERATIONAL' } });
    return { organization, tokens, siteA, siteB, scheduleA, scheduleB, employee, attendance, today, monthStart };
  }

  const path = (siteId: string, part = '') => `/api/v1/attendance-sites/${siteId}${part ? `/${part}` : ''}`;
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('uses effective assignments, not stale primarySiteId, and stored attendance lineage', async () => {
    const data = await fixture();
    const admin = auth(data.tokens.ADMIN);
    await request(app.getHttpServer()).get(path(data.siteA.id)).set(admin).expect(200);
    const employeesA = await request(app.getHttpServer()).get(path(data.siteA.id, 'employees')).set(admin).expect(200);
    expect(employeesA.body.items).toEqual([expect.objectContaining({ id: data.employee.id, currentSchedule: expect.objectContaining({ id: data.scheduleA.id }) })]);
    const employeesB = await request(app.getHttpServer()).get(path(data.siteB.id, 'employees')).set(admin).expect(200);
    expect(employeesB.body.items).toEqual([]);
    const schedulesA = await request(app.getHttpServer()).get(path(data.siteA.id, 'schedules')).set(admin).expect(200);
    expect(schedulesA.body.items.map((item: { id: string }) => item.id)).toContain(data.scheduleA.id);
    expect(schedulesA.body.items.map((item: { id: string }) => item.id)).not.toContain(data.scheduleB.id);
    const historyA = await request(app.getHttpServer()).get(path(data.siteA.id, 'history')).set(admin).expect(200);
    expect(historyA.body.items.map((item: { id: string }) => item.id)).toContain(data.attendance.id);
    const historyB = await request(app.getHttpServer()).get(path(data.siteB.id, 'history')).set(admin).expect(200);
    expect(historyB.body.items).toEqual([]);
    const todayA = await request(app.getHttpServer()).get(path(data.siteA.id, 'attendance')).set(admin).expect(200);
    expect(todayA.body.items.map((item: { id: string }) => item.id)).toContain(data.attendance.id);
    const dashboardA = await request(app.getHttpServer()).get(path(data.siteA.id, 'dashboard')).set(admin).expect(200);
    expect(dashboardA.body).toMatchObject({ activeEmployees: 1, presentToday: 1, site: { id: data.siteA.id } });
    const dashboardB = await request(app.getHttpServer()).get(path(data.siteB.id, 'dashboard')).set(admin).expect(200);
    expect(dashboardB.body).toMatchObject({ activeEmployees: 0, presentToday: 0, site: { id: data.siteB.id } });
  });

  it('fails closed for foreign, unknown, employee and spoofed requests', async () => {
    const one = await fixture();
    const two = await fixture();
    const admin = auth(one.tokens.ADMIN);
    for (const part of ['', 'dashboard', 'employees', 'schedules', 'attendance', 'history']) {
      await request(app.getHttpServer()).get(path(two.siteA.id, part)).set(admin).expect(404);
    }
    await request(app.getHttpServer()).get(path('00000000-0000-4000-8000-000000000001')).set(admin).expect(404);
    await request(app.getHttpServer()).get(path(one.siteA.id, 'employees')).set(auth(one.tokens.EMPLOYEE)).expect(403);
    await request(app.getHttpServer()).get(`${path(one.siteA.id, 'employees')}?organizationId=${two.organization.id}`).set(admin).expect(400);
    const crossTenantEmployee = await request(app.getHttpServer()).get(`${path(one.siteA.id, 'history')}?employeeId=${two.employee.id}`).set(admin).expect(404);
    expect(crossTenantEmployee.body.items).toBeUndefined();
    await request(app.getHttpServer()).get(`${path(one.siteA.id, 'employees')}?pageSize=101`).set(admin).expect(400);
  });

  it('preserves inactive-site history but blocks active operations and unreviewed attendance', async () => {
    const data = await fixture();
    const admin = auth(data.tokens.ADMIN);
    await prisma.attendanceSite.update({ where: { id: data.siteA.id }, data: { isActive: false } });
    await request(app.getHttpServer()).get(path(data.siteA.id)).set(admin).expect(200);
    await request(app.getHttpServer()).get(path(data.siteA.id, 'history')).set(admin).expect(200);
    await request(app.getHttpServer()).get(path(data.siteA.id, 'schedules')).set(admin).expect(200);
    await request(app.getHttpServer()).get(path(data.siteA.id, 'reports')).query({ month: data.today.getUTCMonth() + 1, year: data.today.getUTCFullYear() }).set(admin).expect(200);
    for (const part of ['dashboard', 'employees', 'attendance']) {
      await request(app.getHttpServer()).get(path(data.siteA.id, part)).set(admin).expect(404);
    }
    await prisma.attendanceSite.update({ where: { id: data.siteA.id }, data: { isActive: true } });
    await prisma.attendance.update({ where: { id: data.attendance.id }, data: { v1ScopeStatus: 'REVIEW_REQUIRED' } });
    const history = await request(app.getHttpServer()).get(path(data.siteA.id, 'history')).set(admin).expect(200);
    expect(history.body.items).toEqual([]);
    const report = await request(app.getHttpServer()).get(path(data.siteA.id, 'reports')).query({ month: data.today.getUTCMonth() + 1, year: data.today.getUTCFullYear() }).set(admin).expect(200);
    expect(report.body.rows[0].totalWorkedDays).toBe(0);
  });

  it('serves inherited and local site calendar entries with tenant and role isolation', async () => {
    const one = await fixture();
    const two = await fixture();
    const admin = auth(one.tokens.ADMIN);
    const global = await request(app.getHttpServer())
      .post('/api/v1/calendar/holidays')
      .set(admin)
      .send({ name: 'Organization-wide closure', date: '2026-11-12', type: 'COMPANY_HOLIDAY' })
      .expect(201);
    const local = await request(app.getHttpServer())
      .post(path(one.siteA.id, 'calendar/holidays'))
      .set(admin)
      .send({ name: 'Local closure', date: '2026-11-13', type: 'COMPANY_HOLIDAY' })
      .expect(201);
    expect(local.body).toMatchObject({ siteId: one.siteA.id, scope: 'SITE', inherited: false });

    const siteA = await request(app.getHttpServer())
      .get(`${path(one.siteA.id, 'calendar')}?month=2026-11`)
      .set(admin)
      .expect(200);
    expect(siteA.body.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: global.body.id, scope: 'ORGANIZATION', inherited: true }),
      expect.objectContaining({ id: local.body.id, scope: 'SITE', inherited: false }),
    ]));

    const siteB = await request(app.getHttpServer())
      .get(`${path(one.siteB.id, 'calendar')}?month=2026-11`)
      .set(admin)
      .expect(200);
    expect(siteB.body.entries.map((entry: { id: string }) => entry.id)).toContain(global.body.id);
    expect(siteB.body.entries.map((entry: { id: string }) => entry.id)).not.toContain(local.body.id);
    await request(app.getHttpServer()).get(path(two.siteA.id, 'calendar')).set(admin).expect(404);
    await request(app.getHttpServer()).patch(path(one.siteB.id, `calendar/holidays/${local.body.id}`)).set(admin).send({ name: 'Cross-site' }).expect(404);
    await request(app.getHttpServer()).get(path(one.siteA.id, 'calendar')).set(auth(one.tokens.EMPLOYEE)).expect(403);
    await request(app.getHttpServer()).post('/api/v1/calendar/holidays').set(admin).send({ name: 'Spoofed scope', date: '2026-11-14', type: 'COMPANY_HOLIDAY', siteId: one.siteA.id, organizationId: two.organization.id }).expect(400);

    await prisma.attendanceSite.update({ where: { id: one.siteA.id }, data: { isActive: false } });
    await request(app.getHttpServer()).post(path(one.siteA.id, 'calendar/holidays')).set(admin).send({ name: 'Inactive site', date: '2026-11-15', type: 'COMPANY_HOLIDAY' }).expect(404);
  });

  it('builds and exports the same site-scoped report with authoritative site metadata', async () => {
    const data = await fixture();
    const admin = auth(data.tokens.ADMIN);
    const reportDate = new Date(data.today);
    reportDate.setUTCDate(reportDate.getUTCDate() - 1);
    await prisma.attendance.update({ where: { id: data.attendance.id }, data: {
      date: reportDate, clockInAt: new Date(reportDate.getTime() + 8 * 60 * 60 * 1000),
    } });
    const siteBEmployee = await prisma.employee.create({ data: {
      employeeIdentifier: `SC-B-${sequence}`, firstName: 'Other', lastName: 'Site', email: `other-site-${sequence}@test.local`,
      role: 'Employee', accessRole: AccessRole.EMPLOYEE, passwordHash: await hashPassword(password), organizationId: data.organization.id,
      primarySiteId: data.siteB.id, v1ScopeStatus: 'OPERATIONAL',
    } });
    const siteBAssignment = await prisma.employeeSiteAssignment.create({ data: { organizationId: data.organization.id, employeeId: siteBEmployee.id, siteId: data.siteB.id, effectiveFrom: data.monthStart } });
    await prisma.employeeScheduleAssignment.create({ data: { organizationId: data.organization.id, employeeId: siteBEmployee.id, siteId: data.siteB.id, scheduleId: data.scheduleB.id, employeeSiteAssignmentId: siteBAssignment.id, effectiveFrom: data.monthStart, v1ScopeStatus: 'OPERATIONAL' } });
    await prisma.attendance.create({ data: { organizationId: data.organization.id, employeeId: siteBEmployee.id, attendanceSiteId: data.siteB.id, employeeSiteAssignmentId: siteBAssignment.id, date: reportDate, clockInAt: new Date(reportDate.getTime() + 8 * 60 * 60 * 1000), status: 'LATE', minutesLate: 25, v1ScopeStatus: 'OPERATIONAL' } });
    const month = data.today.getUTCMonth() + 1;
    const year = data.today.getUTCFullYear();
    const query = `?month=${month}&year=${year}`;

    const report = await request(app.getHttpServer())
      .get(path(data.siteA.id, 'reports') + query)
      .set(admin)
      .expect((response) => { if (response.status !== 200) throw new Error(JSON.stringify(response.body)); })
      .expect(200);
    expect(report.body).toMatchObject({
      scope: 'SITE', siteId: data.siteA.id, siteName: data.siteA.name,
      period: expect.objectContaining({ startDate: expect.any(String), endDate: expect.any(String) }),
    });
    expect(report.body.rows.map((row: { fullName: string }) => row.fullName)).toContain('Site Employee');
    expect(report.body.rows[0].assignedSchedule).toContain(`Schedule A ${sequence}`);
    expect(report.body.rows[0].assignedSchedule).not.toContain(`Schedule B ${sequence}`);

    const otherSiteReport = await request(app.getHttpServer())
      .get(path(data.siteB.id, 'reports') + query)
      .set(admin)
      .expect(200);
    expect(otherSiteReport.body.rows).toHaveLength(1);
    expect(otherSiteReport.body.rows[0].fullName).toBe('Other Site');

    const csv = await request(app.getHttpServer())
      .get(path(data.siteA.id, 'reports/export') + `${query}&format=csv`)
      .set(admin)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain(data.siteA.name.toLowerCase());
    expect(csv.text).toContain(`Site: ${data.siteA.name}`);
    expect(csv.text).toContain(`Organization: ${data.organization.name}`);
    expect(csv.text).toContain(`Period: ${report.body.period.startDate} → ${report.body.period.endDate}`);
    expect(csv.text).toContain('Site Employee');
    expect(csv.text).not.toContain('Other Site');
    const row = report.body.rows[0];
    const csvCell = (value: string | number) => {
      const normalized = String(value).replace(/"/g, '""');
      return /[",\r\n]/.test(normalized) ? `"${normalized}"` : normalized;
    };
    expect(csv.text.split('\r\n')).toContain([
      row.fullName, row.employeeIdentifier, row.department, row.assignedSchedule,
      row.workingDays, row.presenceDays, row.totalWorkedDays, row.outsideScheduleWorkDays,
      row.entryCount, row.exitCount, row.lateDays, row.absentDays, row.absenceCount,
      row.incompleteAttendanceDays, row.totalWorkedHours, row.earlyExitDays,
      row.earlyExitMinutes, row.scheduledOvertimeHours, row.outsideScheduleOvertimeHours,
      row.overtimeHours,
    ].map(csvCell).join(','));

    const renderer = app.get(MonthlyAttendancePuppeteerPdfRendererService);
    const renderSpy = jest.spyOn(renderer, 'render').mockResolvedValue(Buffer.from('%PDF-site-report'));
    const pdf = await request(app.getHttpServer())
      .get(path(data.siteA.id, 'reports/export') + `${query}&format=pdf`)
      .set(admin)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(pdf.headers['content-disposition']).toContain(data.siteA.name.toLowerCase());
    expect(renderSpy).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'SITE', siteId: data.siteA.id, siteName: data.siteA.name,
      period: report.body.period, rows: report.body.rows,
    }));
    renderSpy.mockRestore();
  });

  it('allows Starter custom periods while denying cross-tenant reports and employee access', async () => {
    const one = await fixture();
    const two = await fixture();
    const url = path(two.siteA.id, 'reports');
    await request(app.getHttpServer()).get(url).set(auth(one.tokens.ADMIN)).query({ month: 9, year: 2026 }).expect(404);
    await request(app.getHttpServer()).get(`${path(two.siteA.id, 'reports/export')}?month=9&year=2026&format=csv`).set(auth(one.tokens.ADMIN)).expect(404);
    await request(app.getHttpServer()).get(path(one.siteA.id, 'reports')).set(auth(one.tokens.EMPLOYEE)).query({ month: 9, year: 2026 }).expect(403);
    await request(app.getHttpServer()).get(`${path(one.siteA.id, 'reports/export')}?month=9&year=2026&format=csv`).set(auth(one.tokens.EMPLOYEE)).expect(403);
    await request(app.getHttpServer()).get(`${path(one.siteA.id, 'reports')}?organizationId=${two.organization.id}&month=9&year=2026`).set(auth(one.tokens.ADMIN)).expect(400);

    await prisma.organizationSubscription.update({ where: { organizationId: one.organization.id }, data: { plan: SubscriptionPlan.STARTER } });
    await request(app.getHttpServer())
      .get(`${path(one.siteA.id, 'reports')}?mode=custom&startDate=${one.today.toISOString().slice(0, 10)}&endDate=${one.today.toISOString().slice(0, 10)}`)
      .set(auth(one.tokens.ADMIN))
      .expect(200);
  });

  it('limits partial-period absences to the dates effectively assigned to each site', async () => {
    const data = await fixture();
    const admin = auth(data.tokens.ADMIN);
    const tomorrow = new Date(data.today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    while (tomorrow.getUTCDay() === 0 || tomorrow.getUTCDay() === 6) {
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    }
    const originalAssignment = await prisma.employeeSiteAssignment.findFirstOrThrow({ where: { employeeId: data.employee.id, siteId: data.siteA.id } });
    await prisma.employeeSiteAssignment.update({ where: { id: originalAssignment.id }, data: { effectiveTo: tomorrow } });
    await prisma.employeeScheduleAssignment.updateMany({ where: { employeeId: data.employee.id, employeeSiteAssignmentId: originalAssignment.id }, data: { effectiveTo: tomorrow } });
    const nextAssignment = await prisma.employeeSiteAssignment.create({ data: { organizationId: data.organization.id, employeeId: data.employee.id, siteId: data.siteB.id, effectiveFrom: tomorrow } });
    await prisma.employeeScheduleAssignment.create({ data: { organizationId: data.organization.id, employeeId: data.employee.id, siteId: data.siteB.id, scheduleId: data.scheduleB.id, employeeSiteAssignmentId: nextAssignment.id, effectiveFrom: tomorrow, v1ScopeStatus: 'OPERATIONAL' } });
    const start = data.today.toISOString().slice(0, 10);
    const end = tomorrow.toISOString().slice(0, 10);
    const params = `?mode=custom&startDate=${start}&endDate=${end}`;

    const [siteA, siteB] = await Promise.all([
      request(app.getHttpServer()).get(path(data.siteA.id, 'reports') + params).set(admin).expect(200),
      request(app.getHttpServer()).get(path(data.siteB.id, 'reports') + params).set(admin).expect(200),
    ]);
    expect(siteA.body.rows[0]).toMatchObject({ fullName: 'Site Employee', absenceCount: 0, totalWorkedDays: 1 });
    expect(siteB.body.rows[0]).toMatchObject({ fullName: 'Site Employee', absenceCount: 1, totalWorkedDays: 0 });
    expect(siteA.body.period).toEqual({ startDate: start, endDate: end });
    expect(siteB.body.period).toEqual(siteA.body.period);
  });

  it('uses organization-wide monthly tolerance and returns only historical events for the requested site', async () => {
    const data = await fixture();
    const admin = auth(data.tokens.ADMIN);
    const employeeToken = auth(data.tokens.EMPLOYEE);
    const month = '2027-01';
    const dates = Array.from({ length: 5 }, (_, index) => new Date(Date.UTC(2027, 0, 4 + index)));
    const rule = await prisma.sanctionRule.create({ data: {
      organizationId: data.organization.id,
      code: `SITE_MONTHLY_${sequence}`,
      type: 'MINOR_LATENESS',
      name: 'Organization monthly minor lateness',
      active: true,
      latenessMinMinutes: 1,
      latenessMinInclusive: true,
      latenessMaxMinutes: 15,
      latenessMaxInclusive: false,
      monthlyTolerance: 2,
      amountFcfa: 2500,
      priority: 1,
      appliedReason: 'Organization-wide tolerance threshold reached.',
      v1ScopeStatus: 'OPERATIONAL',
    } });
    expect(rule.siteId).toBeNull();

    const originalAssignment = await prisma.employeeSiteAssignment.findFirstOrThrow({ where: { employeeId: data.employee.id, siteId: data.siteA.id } });
    await prisma.employeeSiteAssignment.update({ where: { id: originalAssignment.id }, data: { effectiveTo: dates[4] } });
    await prisma.employeeScheduleAssignment.updateMany({ where: { employeeId: data.employee.id, employeeSiteAssignmentId: originalAssignment.id }, data: { effectiveTo: dates[4] } });
    const transferAssignment = await prisma.employeeSiteAssignment.create({ data: {
      organizationId: data.organization.id,
      employeeId: data.employee.id,
      siteId: data.siteB.id,
      effectiveFrom: dates[4],
    } });

    const siteBEmployee = await prisma.employee.create({ data: {
      employeeIdentifier: `SANCTION-B-${sequence}`,
      firstName: 'Transferred',
      lastName: 'Colleague',
      email: `sanction-b-${sequence}@test.local`,
      role: 'Employee',
      accessRole: AccessRole.EMPLOYEE,
      passwordHash: await hashPassword(password),
      organizationId: data.organization.id,
      primarySiteId: data.siteB.id,
      v1ScopeStatus: 'OPERATIONAL',
    } });
    const siteBEmployeeAssignment = await prisma.employeeSiteAssignment.create({ data: {
      organizationId: data.organization.id,
      employeeId: siteBEmployee.id,
      siteId: data.siteB.id,
      effectiveFrom: data.monthStart,
    } });

    const localClosure = await request(app.getHttpServer())
      .post(path(data.siteA.id, 'calendar/holidays'))
      .set(admin)
      .send({ name: 'Site A maintenance closure', date: dates[0].toISOString().slice(0, 10), type: 'COMPANY_HOLIDAY' })
      .expect(201);
    const globalHoliday = await request(app.getHttpServer())
      .post('/api/v1/calendar/holidays')
      .set(admin)
      .send({ name: 'Organization holiday', date: dates[1].toISOString().slice(0, 10), type: 'COMPANY_HOLIDAY' })
      .expect(201);

    const makeAttendance = (employeeId: string, attendanceSiteId: string, employeeSiteAssignmentId: string, date: Date) => prisma.attendance.create({ data: {
      organizationId: data.organization.id,
      employeeId,
      attendanceSiteId,
      employeeSiteAssignmentId,
      date,
      minutesLate: 10,
      status: 'LATE',
      v1ScopeStatus: 'OPERATIONAL',
    } });
    const [siteAClosureAttendance, siteBLocalDateAttendance, siteAGlobalHolidayAttendance, siteBGlobalHolidayAttendance, siteALate1, siteALate2, transferredSiteBLate] = await Promise.all([
      makeAttendance(data.employee.id, data.siteA.id, originalAssignment.id, dates[0]),
      makeAttendance(siteBEmployee.id, data.siteB.id, siteBEmployeeAssignment.id, dates[0]),
      makeAttendance(data.employee.id, data.siteA.id, originalAssignment.id, dates[1]),
      makeAttendance(siteBEmployee.id, data.siteB.id, siteBEmployeeAssignment.id, dates[1]),
      makeAttendance(data.employee.id, data.siteA.id, originalAssignment.id, dates[2]),
      makeAttendance(data.employee.id, data.siteA.id, originalAssignment.id, dates[3]),
      makeAttendance(data.employee.id, data.siteB.id, transferAssignment.id, dates[4]),
    ]);

    const [siteAResults, siteBResults, organizationResults] = await Promise.all([
      request(app.getHttpServer()).get(`${path(data.siteA.id, 'sanctions')}?month=${month}`).set(admin).expect(200),
      request(app.getHttpServer()).get(`${path(data.siteB.id, 'sanctions')}?month=${month}`).set(admin).expect(200),
      request(app.getHttpServer()).get(`/api/v1/sanctions/monthly?month=${month}`).set(admin).expect(200),
    ]);
    const resultFor = (response: { body: Array<{ attendanceId: string; status: string }> }, attendanceId: string) => response.body.find((item) => item.attendanceId === attendanceId);

    expect(resultFor(siteAResults, siteAClosureAttendance.id)?.status).toBe('NOT_APPLICABLE');
    expect(resultFor(siteBResults, siteBLocalDateAttendance.id)?.status).toBe('TOLERATED');
    expect(resultFor(siteAResults, siteALate1.id)?.status).toBe('TOLERATED');
    expect(resultFor(siteAResults, siteALate2.id)?.status).toBe('TOLERATED');
    expect(resultFor(siteBResults, transferredSiteBLate.id)).toMatchObject({ status: 'APPLIED', amount: 2500 });
    expect(resultFor(siteAResults, transferredSiteBLate.id)).toBeUndefined();
    expect(resultFor(siteBResults, siteALate1.id)).toBeUndefined();
    for (const attendance of [siteAClosureAttendance, siteALate1, siteALate2, transferredSiteBLate]) {
      expect(resultFor(organizationResults, attendance.id)).toBeDefined();
    }
    expect(resultFor(organizationResults, siteBLocalDateAttendance.id)).toBeDefined();
    expect(resultFor(organizationResults, transferredSiteBLate.id)?.status).toBe('APPLIED');
    expect(resultFor(siteAResults, siteAGlobalHolidayAttendance.id)?.status).toBe('NOT_APPLICABLE');
    expect(resultFor(siteBResults, siteBGlobalHolidayAttendance.id)?.status).toBe('NOT_APPLICABLE');
    expect(localClosure.body.siteId).toBe(data.siteA.id);
    expect(globalHoliday.body.siteId).toBeNull();

    const [siteAReport, siteBReport] = await Promise.all([
      request(app.getHttpServer()).get(`${path(data.siteA.id, 'reports')}?mode=custom&startDate=2027-01-01&endDate=2027-01-31&employeeId=${data.employee.id}`).set(admin).expect(200),
      request(app.getHttpServer()).get(`${path(data.siteB.id, 'reports')}?mode=custom&startDate=2027-01-01&endDate=2027-01-31&employeeId=${data.employee.id}`).set(admin).expect(200),
    ]);
    expect(siteAReport.body.employeeReport.sanctionSummary).toMatchObject({ appliedCount: 0, toleratedCount: 2, totalAmount: 0 });
    expect(siteBReport.body.employeeReport.sanctionSummary).toMatchObject({ appliedCount: 1, toleratedCount: 0, totalAmount: 2500 });

    await request(app.getHttpServer()).get(`${path(data.siteA.id, 'sanctions')}?month=${month}&organizationId=${data.organization.id}`).set(admin).expect(400);
    await request(app.getHttpServer()).get(`${path(data.siteA.id, 'sanctions')}?month=${month}`).set(employeeToken).expect(403);
    await request(app.getHttpServer()).get(`${path('00000000-0000-4000-8000-000000000001', 'sanctions')}?month=${month}`).set(admin).expect(404);
    await request(app.getHttpServer()).get(`${path(data.siteA.id, 'sanctions')}?month=${month}`).set(auth((await fixture()).tokens.ADMIN)).expect(404);
    await request(app.getHttpServer()).post(path(data.siteA.id, 'sanctions/rules')).set(admin).send({ name: 'No site rules' }).expect(404);
    await request(app.getHttpServer()).patch(path(data.siteA.id, `sanctions/rules/${rule.id}`)).set(admin).send({ active: false }).expect(404);
    await prisma.attendanceSite.update({ where: { id: data.siteA.id }, data: { isActive: false } });
    await request(app.getHttpServer()).get(`${path(data.siteA.id, 'sanctions')}?month=${month}`).set(admin).expect(200);
  });
});

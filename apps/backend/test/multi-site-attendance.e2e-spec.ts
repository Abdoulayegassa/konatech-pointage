import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  AccessRole,
  AttendanceStatus,
  CalendarEntryType,
  MembershipRole,
  PrismaClient,
  SubscriptionPlan,
  SubscriptionStatus,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import {
  hashPassword,
  hashPinCode,
} from '../src/common/security/password.util';
import { AttendanceSitesService } from '../src/modules/attendance-sites/attendance-sites.service';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { AttendanceMonthlyMetricsService } from '../src/modules/attendance/attendance-monthly-metrics.service';
import { MonthlyAttendanceExportService } from '../src/modules/attendance/exports/monthly-attendance-export.service';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { SanctionsService } from '../src/modules/sanctions/sanctions.service';
import { OfflineAttendanceAction } from '../src/modules/attendance/dto/offline-attendance-sync.dto';
import { AuthService } from '../src/modules/auth/auth.service';
import { OfflineAttendanceContextService } from '../src/modules/attendance/offline-attendance-context.service';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(60_000);

describe('Phase 10.6.3 multi-site attendance (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let attendance: AttendanceService;
  let monthlyMetrics: AttendanceMonthlyMetricsService;
  let monthlyExports: MonthlyAttendanceExportService;
  let calendar: CalendarService;
  let sitesService: AttendanceSitesService;
  let auth: AuthService;
  let sanctions: SanctionsService;
  let passwordHash: string;
  let sequence = 0;

  beforeAll(async () => {
    await prepareTestDatabase();
    passwordHash = await hashPassword('MultiSite123!');
    prisma = new PrismaClient();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    attendance = app.get(AttendanceService);
    monthlyMetrics = app.get(AttendanceMonthlyMetricsService);
    monthlyExports = app.get(MonthlyAttendanceExportService);
    calendar = app.get(CalendarService);
    sitesService = app.get(AttendanceSitesService);
    auth = app.get(AuthService);
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
      userId: 'test-user',
      membershipId: 'test-membership',
      organizationId,
      membershipRole: MembershipRole.ADMIN,
      employeeId: null,
      attendanceSiteId: null,
      sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
    };
  }

  function offlineAuthentication(data: Awaited<ReturnType<typeof fixture>>): AuthenticationContext {
    return {
      ...context(data.organization.id),
      purpose: 'attendance_entry',
      employeeId: data.employee.id,
      attendanceSiteId: data.sites[0].id,
    };
  }

  async function issueOfflineContext(data: Awaited<ReturnType<typeof fixture>>) {
    return app.get(OfflineAttendanceContextService)
      .issue(data.employee.id, offlineAuthentication(data));
  }

  async function fixture(
    siteCount = 2,
    plan: SubscriptionPlan = SubscriptionPlan.BUSINESS,
  ) {
    sequence += 1;
    const suffix = `${sequence}-${Math.random().toString(36).slice(2)}`;
    const organization = await prisma.organization.create({
      data: {
        name: `Multi-site ${suffix}`,
        slug: `multi-site-${suffix}`,
        timezone: 'Etc/UTC',
      },
    });
    await prisma.organizationSubscription.update({
      where: { organizationId: organization.id },
      data: {
        plan,
        status: SubscriptionStatus.ACTIVE,
        endsAt: new Date(Date.now() + 30 * 86_400_000),
        graceEndsAt: new Date(Date.now() + 37 * 86_400_000),
      },
    });
    const sites = await Promise.all(
      Array.from({ length: siteCount }, (_, index) =>
        prisma.attendanceSite.create({
          data: {
            organizationId: organization.id,
            name: `Site ${index + 1} ${suffix}`,
            latitude: 12 + index,
            longitude: -1 - index,
            allowedRadiusMeters: 100 + index,
          },
        }),
      ),
    );
    const businessDate = new Date(
      `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
    );
    const schedule = await prisma.schedule.create({
      data: {
        organizationId: organization.id,
        siteId: sites[0]?.id,
        name: `Schedule ${suffix}`,
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
    const pinCode = String(8000 + sequence).slice(-4);
    const employee = await prisma.employee.create({
      data: {
        organizationId: organization.id,
        employeeIdentifier: `MS-${suffix}`,
        firstName: 'Multi',
        lastName: 'Site',
        email: `multi-${suffix}@example.test`,
        role: 'Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
        pinCodeHash: await hashPinCode(pinCode),
        scheduleId: schedule.id,
      },
    });
    await prisma.employee.update({
      where: { id: employee.id },
      data: {
        primarySiteId: sites[0]?.id ?? null,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    if (sites[0]) {
      const siteAssignment = await prisma.employeeSiteAssignment.create({
        data: {
          organizationId: organization.id,
          employeeId: employee.id,
          siteId: sites[0].id,
          effectiveFrom: businessDate,
        },
      });
      await prisma.employeeScheduleAssignment.create({
        data: {
          organizationId: organization.id,
          employeeId: employee.id,
          siteId: sites[0].id,
          scheduleId: schedule.id,
          employeeSiteAssignmentId: siteAssignment.id,
          effectiveFrom: businessDate,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        },
      });
    }
    return { organization, employee, pinCode, sites };
  }

  it.each([
    [SubscriptionPlan.STARTER, 1],
    [SubscriptionPlan.PRO, 3],
    [SubscriptionPlan.BUSINESS, 10],
  ] as const)('keeps the %s active-site quota at %i', async (plan, limit) => {
    const data = await fixture(0, plan);
    for (let index = 0; index < limit; index += 1) {
      await sitesService.create(
        {
          name: `Quota ${index}`,
          latitude: 10 + index / 100,
          longitude: -1,
          allowedRadiusMeters: 100,
        },
        context(data.organization.id),
      );
    }
    await expect(
      sitesService.create(
        {
          name: 'Over quota',
          latitude: 20,
          longitude: -2,
          allowedRadiusMeters: 100,
        },
        context(data.organization.id),
      ),
    ).rejects.toThrow('quota');
  });

  it('binds QR/PIN sessions independently to site A and site B', async () => {
    const data = await fixture();
    const siteBPinCode = String(9000 + sequence).slice(-4);
    const siteBEmployee = await prisma.employee.create({
      data: {
        organizationId: data.organization.id,
        employeeIdentifier: `MS-SITE-B-${sequence}`,
        firstName: 'Multi',
        lastName: 'Site B',
        email: `multi-site-b-${sequence}@example.test`,
        role: 'Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
        pinCodeHash: await hashPinCode(siteBPinCode),
        primarySiteId: data.sites[1].id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    await prisma.employeeSiteAssignment.create({
      data: {
        organizationId: data.organization.id,
        employeeId: siteBEmployee.id,
        siteId: data.sites[1].id,
        effectiveFrom: new Date(
          `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
        ),
      },
    });

    const siteALogin = await auth.loginForAttendanceEntry({
      pinCode: data.pinCode,
      sitePublicId: data.sites[0].publicId,
    });
    const siteBLogin = await auth.loginForAttendanceEntry({
      pinCode: siteBPinCode,
      sitePublicId: data.sites[1].publicId,
    });
    await expect(
      auth.getAuthenticationFromToken(siteALogin.accessToken),
    ).resolves.toMatchObject({
      context: { attendanceSiteId: data.sites[0].id },
    });
    await expect(
      auth.getAuthenticationFromToken(siteBLogin.accessToken),
    ).resolves.toMatchObject({
      context: { attendanceSiteId: data.sites[1].id },
    });
    await expect(
      auth.loginForAttendanceEntry({
        pinCode: data.pinCode,
        sitePublicId: data.sites[1].publicId,
      }),
    ).rejects.toThrow('Identifiants invalides.');
    await expect(
      auth.loginForAttendanceEntry({
        pinCode: siteBPinCode,
        sitePublicId: data.sites[0].publicId,
      }),
    ).rejects.toThrow('Identifiants invalides.');
    await expect(
      auth.loginForAttendanceEntry({ pinCode: data.pinCode }),
    ).rejects.toThrow('Identifiants invalides.');

    const siteAAuthentication = await auth.getAuthenticationFromToken(
      siteALogin.accessToken,
    );
    await expect(
      attendance.checkInForEmployee(
        data.employee.id,
        { siteId: data.sites[1].id },
        siteAAuthentication.context,
      ),
    ).rejects.toThrow('Attendance site does not match session.');
  });

  it('uses the selected site for GPS and persists it in history', async () => {
    const data = await fixture();
    await prisma.organizationAttendanceSettings.create({
      data: {
        organizationId: data.organization.id,
        gpsRequired: true,
        selfieRequired: false,
      },
    });
    const proof = {
      evidenceCapturedAt: new Date().toISOString(),
      latitude: data.sites[0].latitude,
      longitude: data.sites[0].longitude,
      accuracyMeters: 5,
    };
    await expect(
      attendance.checkInForEmployee(
        data.employee.id,
        { siteId: data.sites[1].id, security: proof },
        context(data.organization.id),
      ),
    ).rejects.toThrow('not assigned');
    const recorded = await attendance.checkInForEmployee(
      data.employee.id,
      { siteId: data.sites[0].id, security: proof },
      context(data.organization.id),
    );
    expect(recorded).toMatchObject({
      attendanceSiteId: data.sites[0].id,
      attendanceSite: { id: data.sites[0].id, name: data.sites[0].name },
      checkInDistanceMeters: 0,
    });
    await prisma.attendanceSite.update({
      where: { id: data.sites[0].id },
      data: { isActive: false },
    });
    const history = (await attendance.getAttendanceHistory(
      { month: new Date().toISOString().slice(0, 7) },
      context(data.organization.id),
    )) as Array<{ attendanceSiteId: string | null; attendanceSite: unknown }>;
    expect(history[0]).toMatchObject({
      attendanceSiteId: data.sites[0].id,
      attendanceSite: { id: data.sites[0].id },
    });
  });

  it('applies a local calendar closure to Site A attendance only', async () => {
    const data = await fixture();
    const occurredAt = new Date(Date.now() - 60_000);
    const dateKey = occurredAt.toISOString().slice(0, 10);
    await calendar.createForSite(
      data.sites[0].id,
      { name: 'Site A closure', date: dateKey, type: 'COMPANY_HOLIDAY' },
      context(data.organization.id),
    );
    const siteBSchedule = await prisma.schedule.create({
      data: {
        organizationId: data.organization.id,
        siteId: data.sites[1].id,
        name: `Site B schedule ${sequence}`,
        startTime: '08:00', endTime: '17:00',
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    const siteBEmployee = await prisma.employee.create({
      data: {
        organizationId: data.organization.id,
        employeeIdentifier: `MS-CALENDAR-B-${sequence}`,
        firstName: 'Site', lastName: 'B Employee',
        email: `multi-calendar-b-${sequence}@example.test`, role: 'Employee',
        accessRole: AccessRole.EMPLOYEE, passwordHash,
        pinCodeHash: await hashPinCode('9123'),
        primarySiteId: data.sites[1].id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    const siteBAssignment = await prisma.employeeSiteAssignment.create({
      data: { organizationId: data.organization.id, employeeId: siteBEmployee.id, siteId: data.sites[1].id, effectiveFrom: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`) },
    });
    await prisma.employeeScheduleAssignment.create({
      data: { organizationId: data.organization.id, employeeId: siteBEmployee.id, siteId: data.sites[1].id, scheduleId: siteBSchedule.id, employeeSiteAssignmentId: siteBAssignment.id, effectiveFrom: siteBAssignment.effectiveFrom, v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL },
    });

    const [siteAAttendance, siteBAttendance] = await Promise.all([
      attendance.checkIn({ employeeId: data.employee.id, siteId: data.sites[0].id, occurredAt: occurredAt.toISOString() }, context(data.organization.id)),
      attendance.checkIn({ employeeId: siteBEmployee.id, siteId: data.sites[1].id, occurredAt: occurredAt.toISOString() }, context(data.organization.id)),
    ]);
    expect(siteAAttendance.status).toBe(AttendanceStatus.NON_WORKING_DAY_WORK);
    expect(siteBAttendance.status).not.toBe(AttendanceStatus.NON_WORKING_DAY_WORK);
  });

  it('rejects inactive and cross-tenant sites without trusting client tenancy', async () => {
    const owner = await fixture();
    const foreign = await fixture();
    const contextToken = (await issueOfflineContext(owner)).contextToken;
    await prisma.attendanceSite.update({
      where: { id: owner.sites[0].id },
      data: { isActive: false },
    });
    await expect(
      attendance.checkIn(
        { employeeId: owner.employee.id, siteId: owner.sites[0].id },
        context(owner.organization.id),
      ),
    ).rejects.toThrow('not found or inactive');
    await expect(
      attendance.checkIn(
        { employeeId: owner.employee.id, siteId: foreign.sites[0].id },
        context(owner.organization.id),
      ),
    ).rejects.toThrow('not found or inactive');
    await expect(
      attendance.synchronizeOfflineAttendance(
        owner.employee.id,
        {
          clientRequestId: crypto.randomUUID(),
          sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
          contextToken,
          action: OfflineAttendanceAction.CHECK_IN,
          capturedAt: new Date(Date.now() - 60_000).toISOString(),
          siteId: foreign.sites[0].id,
        },
        offlineAuthentication(owner),
      ),
    ).rejects.toThrow();
    expect(
      await prisma.attendance.count({
        where: { organizationId: owner.organization.id, employeeId: owner.employee.id },
      }),
    ).toBe(0);
  });

  it('requires reconciliation when the context site is inactive at receipt', async () => {
    const data = await fixture();
    const capturedAt = new Date(Date.now() - 30_000);
    capturedAt.setUTCSeconds(0, 0);
    const contextToken = (await issueOfflineContext(data)).contextToken;
    await prisma.attendanceSite.update({
      where: { id: data.sites[0].id },
      data: { isActive: false, statusChangedAt: new Date() },
    });

    const clientRequestId = crypto.randomUUID();
    await expect(
      attendance.synchronizeOfflineAttendance(
        data.employee.id,
        {
          clientRequestId,
          sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
          contextToken,
          action: OfflineAttendanceAction.CHECK_IN,
          capturedAt: capturedAt.toISOString(),
          siteId: data.sites[0].id,
        },
        offlineAuthentication(data),
      ),
    ).resolves.toMatchObject({ state: 'reconciliation_required' });
    expect(await prisma.attendance.count({ where: { employeeId: data.employee.id } })).toBe(0);
    expect(await prisma.offlineAttendanceSyncRequest.findUniqueOrThrow({
      where: { organizationId_clientRequestId: { organizationId: data.organization.id, clientRequestId } },
    })).toMatchObject({ status: 'RECONCILIATION_REQUIRED', capturedAt });
    expect(await prisma.offlineAttendanceReconciliation.findMany({
      where: { organizationId: data.organization.id },
      include: { syncRequest: true },
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reasonCode: 'SITE_INACTIVE', status: 'PENDING_REVIEW',
        syncRequest: expect.objectContaining({ clientRequestId, status: 'RECONCILIATION_REQUIRED' }),
      }),
    ]));
    await expect(attendance.synchronizeOfflineAttendance(
      data.employee.id,
      {
        clientRequestId, sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
        contextToken, action: OfflineAttendanceAction.CHECK_IN,
        capturedAt: capturedAt.toISOString(), siteId: data.sites[0].id,
      },
      offlineAuthentication(data),
    )).resolves.toMatchObject({ state: 'reconciliation_required', idempotent: true });
    expect(await prisma.offlineAttendanceReconciliation.count({ where: { organizationId: data.organization.id } })).toBe(1);

    await prisma.attendanceSite.update({
      where: { id: data.sites[0].id },
      data: { isActive: true, statusChangedAt: new Date() },
    });
    await expect(
      attendance.synchronizeOfflineAttendance(
        data.employee.id,
        {
          clientRequestId: crypto.randomUUID(),
          sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
          contextToken,
          action: OfflineAttendanceAction.CHECK_IN,
          capturedAt: capturedAt.toISOString(),
          siteId: data.sites[0].id,
        },
        offlineAuthentication(data),
      ),
    ).resolves.toMatchObject({ state: 'reconciliation_required' });
    expect(await prisma.attendance.count({ where: { employeeId: data.employee.id } })).toBe(0);
  });

  it('keeps an active-site context valid after non-status site metadata edits', async () => {
    const data = await fixture();
    const capturedAt = new Date(Date.now() - 30_000);
    capturedAt.setUTCSeconds(0, 0);
    const contextToken = (await issueOfflineContext(data)).contextToken;
    await prisma.attendanceSite.update({
      where: { id: data.sites[0].id },
      data: { name: `${data.sites[0].name} renamed` },
    });

    const result = await attendance.synchronizeOfflineAttendance(
      data.employee.id,
      {
        clientRequestId: crypto.randomUUID(),
        sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
        contextToken,
        action: OfflineAttendanceAction.CHECK_IN,
        capturedAt: capturedAt.toISOString(),
        siteId: data.sites[0].id,
      },
      offlineAuthentication(data),
    );
    expect(result.state).toBe('accepted');
  });

  it('rolls back a punch if ledger finalization fails and replays exactly once', async () => {
    const data = await fixture();
    const capturedAt = new Date(Date.now() - 30_000);
    const contextToken = (await issueOfflineContext(data)).contextToken;
    const clientRequestId = crypto.randomUUID();
    const requestPayload = {
      clientRequestId,
      sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
      contextToken,
      action: OfflineAttendanceAction.CHECK_IN,
      capturedAt: capturedAt.toISOString(),
      siteId: data.sites[0].id,
    };
    const functionName = 'blf01d2_fail_offline_acceptance';
    const triggerName = 'blf01d2_fail_offline_acceptance_trigger';

    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "OfflineAttendanceSyncRequest"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION "${functionName}"() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."status" = 'ACCEPTED' THEN
          RAISE EXCEPTION 'simulated interruption during offline ledger finalization';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "${triggerName}"
      BEFORE UPDATE ON "OfflineAttendanceSyncRequest"
      FOR EACH ROW EXECUTE FUNCTION "${functionName}"()
    `);

    try {
      await expect(
        attendance.synchronizeOfflineAttendance(
          data.employee.id,
          requestPayload,
          offlineAuthentication(data),
        ),
      ).rejects.toThrow();
      expect(await prisma.attendance.count({
        where: { organizationId: data.organization.id, employeeId: data.employee.id },
      })).toBe(0);
      expect(await prisma.offlineAttendanceSyncRequest.findUnique({
        where: {
          organizationId_clientRequestId: {
            organizationId: data.organization.id,
            clientRequestId,
          },
        },
      })).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "OfflineAttendanceSyncRequest"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    }

    const applied = await attendance.synchronizeOfflineAttendance(
      data.employee.id,
      requestPayload,
      offlineAuthentication(data),
    );
    expect(applied.state).toBe('accepted');
    const replay = await attendance.synchronizeOfflineAttendance(
      data.employee.id,
      requestPayload,
      offlineAuthentication(data),
    );
    expect(replay).toMatchObject({ state: 'accepted', idempotent: true });
    expect(await prisma.attendance.count({
      where: { organizationId: data.organization.id, employeeId: data.employee.id },
    })).toBe(1);
  });

  it('keeps the issued schedule snapshot after an in-place edit', async () => {
    const data = await fixture();
    const capturedAt = new Date(Date.now() - 30_000);
    const assignment = await prisma.employeeScheduleAssignment.findFirstOrThrow({
      where: { organizationId: data.organization.id, employeeId: data.employee.id },
    });
    const startMinutes = (capturedAt.getUTCHours() * 60 + capturedAt.getUTCMinutes() - 5 + 1440) % 1440;
    const originalStartTime = `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`;
    await prisma.schedule.update({
      where: { id: assignment.scheduleId },
      data: { startTime: originalStartTime },
    });
    const contextToken = (await issueOfflineContext(data)).contextToken;
    await prisma.schedule.update({
      where: { id: assignment.scheduleId },
      data: { startTime: '23:50', endTime: '23:59' },
    });

    const result = await attendance.synchronizeOfflineAttendance(
      data.employee.id,
      {
        clientRequestId: crypto.randomUUID(),
        sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
        contextToken,
        action: OfflineAttendanceAction.CHECK_IN,
        capturedAt: capturedAt.toISOString(),
        siteId: data.sites[0].id,
      },
      offlineAuthentication(data),
    );

    if (result.state !== 'accepted') throw new Error('Expected accepted offline attendance.');
    expect(result.attendance).toMatchObject({
      clockInAt: capturedAt,
      status: AttendanceStatus.LATE,
      scheduleStartTimeSnapshot: originalStartTime,
      scheduleEndTimeSnapshot: '17:00',
    });
    expect(result.attendance.minutesLate).toBeGreaterThanOrEqual(5);
    expect(result.attendance.minutesLate).toBeLessThanOrEqual(6);
  });

  it('keeps the issued schedule semantics after the schedule is deactivated', async () => {
    const data = await fixture();
    const capturedAt = new Date(Date.now() - 30_000);
    capturedAt.setUTCSeconds(0, 0);
    const assignment = await prisma.employeeScheduleAssignment.findFirstOrThrow({
      where: { organizationId: data.organization.id, employeeId: data.employee.id },
    });
    const startMinutes = (capturedAt.getUTCHours() * 60 + capturedAt.getUTCMinutes() - 5 + 1440) % 1440;
    const originalStartTime = `${String(Math.floor(startMinutes / 60)).padStart(2, '0')}:${String(startMinutes % 60).padStart(2, '0')}`;
    await prisma.schedule.update({
      where: { id: assignment.scheduleId },
      data: { startTime: originalStartTime },
    });
    const contextToken = (await issueOfflineContext(data)).contextToken;
    await prisma.schedule.update({
      where: { id: assignment.scheduleId },
      data: { isActive: false },
    });

    const result = await attendance.synchronizeOfflineAttendance(
      data.employee.id,
      {
        clientRequestId: crypto.randomUUID(),
        sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
        contextToken,
        action: OfflineAttendanceAction.CHECK_IN,
        capturedAt: capturedAt.toISOString(),
        siteId: data.sites[0].id,
      },
      offlineAuthentication(data),
    );

    if (result.state !== 'accepted') throw new Error('Expected accepted offline attendance.');
    expect(result.attendance).toMatchObject({
      clockInAt: capturedAt,
      scheduleIdSnapshot: assignment.scheduleId,
      scheduleStartTimeSnapshot: originalStartTime,
      minutesLate: 5,
      status: AttendanceStatus.LATE,
    });
  });

  it('preserves working-day interpretation after a holiday is added', async () => {
    const data = await fixture();
    const capturedAt = new Date(Date.now() - 30_000);
    const contextToken = (await issueOfflineContext(data)).contextToken;
    const today = new Date(`${capturedAt.toISOString().slice(0, 10)}T00:00:00.000Z`);
    await prisma.calendarEntry.create({
      data: {
        name: 'Added after offline capture',
        date: today,
        type: CalendarEntryType.COMPANY_HOLIDAY,
        organizationId: data.organization.id,
        siteId: data.sites[0].id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });

    const result = await attendance.synchronizeOfflineAttendance(
      data.employee.id,
      {
        clientRequestId: crypto.randomUUID(),
        sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
        contextToken,
        action: OfflineAttendanceAction.CHECK_IN,
        capturedAt: capturedAt.toISOString(),
        siteId: data.sites[0].id,
      },
      offlineAuthentication(data),
    );

    if (result.state !== 'accepted') throw new Error('Expected accepted offline attendance.');
    expect(result.attendance).toMatchObject({
      clockInAt: capturedAt,
      date: today,
      calendarNonWorkingDaySnapshot: false,
    });
    await monthlyMetrics.recalculateMonth(today.getUTCFullYear(), today.getUTCMonth() + 1, data.employee.id);
    const recalculated = await prisma.attendance.findUniqueOrThrow({
      where: { id: result.attendance.id },
      select: { status: true, minutesLate: true, calendarNonWorkingDaySnapshot: true },
    });
    expect(recalculated.calendarNonWorkingDaySnapshot).toBe(false);
    expect(recalculated.status).not.toBe(AttendanceStatus.NON_WORKING_DAY_WORK);
    const report = await monthlyExports.buildMonthlyReport({
      mode: 'custom',
      startDate: today.toISOString().slice(0, 10),
      endDate: today.toISOString().slice(0, 10),
      employeeId: data.employee.id,
    }, context(data.organization.id));
    expect(report.rows[0].outsideScheduleWorkDays).toBe(0);
    expect(report.employeeReport?.dailyRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ clockInTime: capturedAt.toISOString().slice(11, 16) }),
    ]));
  });

  it('preserves non-working-day interpretation after a holiday is removed', async () => {
    const data = await fixture();
    const capturedAt = new Date(Date.now() - 30_000);
    const today = new Date(`${capturedAt.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const holiday = await prisma.calendarEntry.create({
      data: {
        name: 'Holiday captured before attendance',
        date: today,
        type: CalendarEntryType.COMPANY_HOLIDAY,
        organizationId: data.organization.id,
        siteId: data.sites[0].id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    const contextToken = (await issueOfflineContext(data)).contextToken;
    const result = await attendance.synchronizeOfflineAttendance(
      data.employee.id,
      {
        clientRequestId: crypto.randomUUID(),
        sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
        contextToken,
        action: OfflineAttendanceAction.CHECK_IN,
        capturedAt: capturedAt.toISOString(),
        siteId: data.sites[0].id,
      },
      offlineAuthentication(data),
    );
    if (result.state !== 'accepted') throw new Error('Expected accepted offline attendance.');
    expect(result.attendance).toMatchObject({
      calendarNonWorkingDaySnapshot: true,
      status: AttendanceStatus.NON_WORKING_DAY_WORK,
    });
    await prisma.calendarEntry.delete({ where: { id: holiday.id } });
    await monthlyMetrics.recalculateMonth(today.getUTCFullYear(), today.getUTCMonth() + 1, data.employee.id);
    const recalculated = await prisma.attendance.findUniqueOrThrow({
      where: { id: result.attendance.id },
      select: { status: true, calendarNonWorkingDaySnapshot: true },
    });
    expect(recalculated).toEqual({
      status: AttendanceStatus.NON_WORKING_DAY_WORK,
      calendarNonWorkingDaySnapshot: true,
    });
    const report = await monthlyExports.buildMonthlyReport({
      mode: 'custom',
      startDate: today.toISOString().slice(0, 10),
      endDate: today.toISOString().slice(0, 10),
      employeeId: data.employee.id,
    }, context(data.organization.id));
    expect(report.rows[0].outsideScheduleWorkDays).toBe(1);
  });

  it('preserves a materialized absence after the calendar later adds a holiday', async () => {
    const data = await fixture();
    const absentDate = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const year = absentDate.getUTCFullYear();
    const month = absentDate.getUTCMonth() + 1;

    await monthlyMetrics.recalculateMonth(year, month, data.employee.id);
    const beforeEdit = await prisma.attendance.findFirstOrThrow({
      where: {
        employeeId: data.employee.id,
        date: absentDate,
        clockInAt: null,
      },
      select: { status: true, calendarNonWorkingDaySnapshot: true },
    });
    expect(beforeEdit).toEqual({
      status: AttendanceStatus.ABSENT,
      calendarNonWorkingDaySnapshot: false,
    });

    await prisma.calendarEntry.create({
      data: {
        name: 'Added after absence was recorded',
        date: absentDate,
        type: CalendarEntryType.COMPANY_HOLIDAY,
        organizationId: data.organization.id,
        siteId: data.sites[0].id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    await monthlyMetrics.recalculateMonth(year, month, data.employee.id);

    const afterEdit = await prisma.attendance.findFirstOrThrow({
      where: {
        employeeId: data.employee.id,
        date: absentDate,
        clockInAt: null,
      },
      select: { status: true, calendarNonWorkingDaySnapshot: true },
    });
    expect(afterEdit).toEqual(beforeEdit);
  });

  it('currently rejects queued attendance after employee deactivation', async () => {
    const data = await fixture();
    const capturedAt = new Date(Date.now() - 30_000);
    const contextToken = (await issueOfflineContext(data)).contextToken;
    await prisma.employee.update({
      where: { id: data.employee.id },
      data: { isActive: false },
    });

    await expect(
      attendance.synchronizeOfflineAttendance(
        data.employee.id,
        {
          clientRequestId: crypto.randomUUID(),
          sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
          contextToken,
          action: OfflineAttendanceAction.CHECK_IN,
          capturedAt: capturedAt.toISOString(),
          siteId: data.sites[0].id,
        },
        offlineAuthentication(data),
      ),
    ).rejects.toThrow('Employee not found');
    expect(
      await prisma.attendance.count({ where: { employeeId: data.employee.id } }),
    ).toBe(0);
  });

  it('preserves site context through check-out and offline synchronization', async () => {
    const direct = await fixture();
    await attendance.checkIn(
      { employeeId: direct.employee.id, siteId: direct.sites[0].id },
      context(direct.organization.id),
    );
    await expect(
      attendance.checkOut(
        { employeeId: direct.employee.id, siteId: direct.sites[1].id },
        context(direct.organization.id),
      ),
    ).rejects.toThrow('original attendance site');

    const offline = await fixture();
    const capturedAt = new Date(Date.now() - 30_000);
    const contextToken = (await issueOfflineContext(offline)).contextToken;
    const result = await attendance.synchronizeOfflineAttendance(
      offline.employee.id,
      {
          clientRequestId: crypto.randomUUID(),
          sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
          contextToken,
          action: OfflineAttendanceAction.CHECK_IN,
          capturedAt: capturedAt.toISOString(),
        siteId: offline.sites[0].id,
      },
      offlineAuthentication(offline),
    );
    if (result.state !== 'accepted') throw new Error('Expected accepted offline attendance.');
    expect(result.attendance.attendanceSiteId).toBe(offline.sites[0].id);
  });

  it('uses the site and schedule assignment effective at offline event time after a transfer is recorded', async () => {
    const data = await fixture();
    const currentDate = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    const transferDate = new Date(currentDate);
    transferDate.setUTCDate(transferDate.getUTCDate() + 1);
    const capturedAt = new Date(Date.now() - 30_000);
    const originalStartMinute =
      Math.round(
        capturedAt.getUTCHours() * 60 +
          capturedAt.getUTCMinutes() +
          capturedAt.getUTCSeconds() / 60,
      ) - 3;
    const normalizedStartMinute = (originalStartMinute + 1440) % 1440;
    const originalStartTime = `${String(Math.floor(normalizedStartMinute / 60)).padStart(2, '0')}:${String(normalizedStartMinute % 60).padStart(2, '0')}`;
    const originalAssignment = await prisma.employeeScheduleAssignment.findFirstOrThrow({
      where: { organizationId: data.organization.id, employeeId: data.employee.id },
    });
    await prisma.schedule.update({
      where: { id: originalAssignment.scheduleId },
      data: { startTime: originalStartTime },
    });
    const contextToken = (await issueOfflineContext(data)).contextToken;
    const oldSiteAssignment = await prisma.employeeSiteAssignment.findFirstOrThrow({
      where: { organizationId: data.organization.id, employeeId: data.employee.id, siteId: data.sites[0].id },
    });
    await prisma.employeeSiteAssignment.update({
      where: { id: oldSiteAssignment.id }, data: { effectiveTo: transferDate },
    });
    await prisma.employeeScheduleAssignment.updateMany({
      where: { employeeId: data.employee.id, employeeSiteAssignmentId: oldSiteAssignment.id },
      data: { effectiveTo: transferDate },
    });
    const newSiteAssignment = await prisma.employeeSiteAssignment.create({
      data: {
        organizationId: data.organization.id,
        employeeId: data.employee.id,
        siteId: data.sites[1].id,
        effectiveFrom: transferDate,
      },
    });
    const newSchedule = await prisma.schedule.create({
      data: {
        organizationId: data.organization.id,
        siteId: data.sites[1].id,
        name: 'Current schedule after transfer',
        startTime: '09:00',
        endTime: '18:00',
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    await prisma.employeeScheduleAssignment.create({
      data: {
        organizationId: data.organization.id,
        employeeId: data.employee.id,
        siteId: data.sites[1].id,
        scheduleId: newSchedule.id,
        employeeSiteAssignmentId: newSiteAssignment.id,
        effectiveFrom: transferDate,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    await prisma.employee.update({
      where: { id: data.employee.id }, data: { primarySiteId: data.sites[1].id },
    });

    const result = await attendance.synchronizeOfflineAttendance(
      data.employee.id,
      {
        clientRequestId: crypto.randomUUID(),
        sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
        contextToken,
        action: OfflineAttendanceAction.CHECK_IN,
        capturedAt: capturedAt.toISOString(),
        siteId: data.sites[0].id,
      },
      offlineAuthentication(data),
    );
    if (result.state !== 'accepted') throw new Error('Expected accepted offline attendance.');

    expect(result.attendance).toMatchObject({
      clockInAt: capturedAt,
      date: currentDate,
      attendanceSiteId: data.sites[0].id,
      minutesLate: expect.any(Number),
      scheduleIdSnapshot: expect.any(String),
    });
    expect(result.attendance.scheduleIdSnapshot).not.toBe(newSchedule.id);
    const stored = await prisma.attendance.findUniqueOrThrow({
      where: { id: result.attendance.id },
      select: { employeeSiteAssignmentId: true, scheduleIdSnapshot: true },
    });
    expect(stored).toEqual({
      employeeSiteAssignmentId: oldSiteAssignment.id,
      scheduleIdSnapshot: result.attendance.scheduleIdSnapshot,
    });
    expect(
      (await prisma.employee.findUniqueOrThrow({
        where: { id: data.employee.id },
        select: { primarySiteId: true },
      })).primarySiteId,
    ).toBe(data.sites[1].id);

    const year = currentDate.getUTCFullYear();
    const month = currentDate.getUTCMonth() + 1;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const history = await attendance.getEmployeeMonthlyHistory(
      data.employee.id,
      monthKey,
      context(data.organization.id),
    );
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: result.attendance.id,
        date: currentDate,
        clockInAt: capturedAt,
      }),
    ]));

    await monthlyMetrics.recalculateMonth(year, month, data.employee.id);
    const afterMetrics = await prisma.attendance.findUniqueOrThrow({
      where: { id: result.attendance.id },
      select: { date: true, clockInAt: true, minutesLate: true },
    });
    expect(afterMetrics.date).toEqual(currentDate);
    expect(afterMetrics.clockInAt).toEqual(capturedAt);
    expect(afterMetrics.minutesLate).toBe(3);

    await sanctions.createRule(
      {
        type: 'MINOR_LATENESS',
        code: `BLF_TEST_MINOR_${sequence}`,
        name: 'BLF event-time lateness',
        latenessMinMinutes: 0,
        latenessMinInclusive: false,
        latenessMaxMinutes: 15,
        latenessMaxInclusive: false,
        monthlyTolerance: 1,
        amountFcfa: 2_000,
        priority: 10,
        appliedReason: 'Monthly tolerance already used.',
        toleratedReason: 'First minor lateness of the month.',
      },
      context(data.organization.id),
    );
    const sanction = await sanctions.getAttendanceSanction(
      result.attendance.id,
      context(data.organization.id),
    );
    expect(sanction).toMatchObject({
      attendanceId: result.attendance.id,
      date: currentDate,
      status: 'TOLERATED',
      amount: 0,
    });

    const customReport = await monthlyExports.buildMonthlyReport(
      {
        mode: 'custom',
        startDate: currentDate.toISOString().slice(0, 10),
        endDate: currentDate.toISOString().slice(0, 10),
        employeeId: data.employee.id,
      },
      context(data.organization.id),
    );
    expect(customReport.employeeReport?.dailyRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        date: `${String(currentDate.getUTCDate()).padStart(2, '0')}/${String(currentDate.getUTCMonth() + 1).padStart(2, '0')}/${currentDate.getUTCFullYear()}`,
        clockInTime: capturedAt.toISOString().slice(11, 16),
      }),
    ]));
  });

  it('keeps concurrent attendance atomic for one employee/site/day', async () => {
    const data = await fixture();
    const results = await Promise.allSettled([
      attendance.checkIn(
        { employeeId: data.employee.id, siteId: data.sites[0].id },
        context(data.organization.id),
      ),
      attendance.checkIn(
        { employeeId: data.employee.id, siteId: data.sites[0].id },
        context(data.organization.id),
      ),
    ]);
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    const rejected = results.find(({ status }) => status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: expect.any(ConflictException),
    });
    expect(
      await prisma.attendance.count({
        where: {
          organizationId: data.organization.id,
          employeeId: data.employee.id,
          attendanceSiteId: data.sites[0].id,
        },
      }),
    ).toBe(1);
  });

  it('preserves Legacy PIN and attendance without requiring a site', async () => {
    const employee = await prisma.employee.create({
      data: {
        employeeIdentifier: `LEGACY-${Date.now()}`,
        firstName: 'Legacy',
        lastName: 'Employee',
        email: `legacy-${Date.now()}@example.test`,
        role: 'Employee',
        accessRole: AccessRole.EMPLOYEE,
        passwordHash,
        pinCodeHash: await hashPinCode('7999'),
      },
    });
    await expect(
      auth.loginForAttendanceEntry({ pinCode: '7999' }),
    ).resolves.toHaveProperty('accessToken');
    const legacyContext: AuthenticationContext = {
      generation: 'legacy',
      purpose: 'account',
      userId: null,
      membershipId: null,
      organizationId: null,
      membershipRole: null,
      employeeId: employee.id,
      attendanceSiteId: null,
    };
    const result = await attendance.checkIn(
      { employeeId: employee.id },
      legacyContext,
    );
    expect(result.attendanceSiteId).toBeNull();
  });
});

import { ConfigService } from '@nestjs/config';
import { signJwtToken } from '../src/common/security/jwt.util';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MembershipRole, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/common/security/password.util';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { AttendancePhotoStorageService } from '../src/modules/attendance/attendance-photo-storage.service';
import { OfflineAttendanceContextService } from '../src/modules/attendance/offline-attendance-context.service';
import { OfflineAttendanceAction } from '../src/modules/attendance/dto/offline-attendance-sync.dto';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';
import { SelfieRetentionService } from '../src/modules/attendance/selfie-retention.service';
import { prepareTestDatabase } from './test-database';

jest.setTimeout(60000);

describe('BLF-01E2B reconciliation decisions', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let service: AttendanceService;
  let passwordHash: string;
  const password = 'Reconciliation123!';
  const path = (id: string, action = '') =>
    `/api/v1/attendance/offline-reconciliation/${id}${action ? '/' + action : ''}`;

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    passwordHash = await hashPassword(password);
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    service = app.get(AttendanceService);
  });
  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  async function fixture() {
    const suffix = randomUUID();
    const organization = await prisma.organization.create({
      data: { name: suffix, slug: suffix, timezone: 'Etc/UTC' },
    });
    await prisma.organizationSubscription.update({
      where: { organizationId: organization.id },
      data: {
        status: 'ACTIVE',
        plan: 'BUSINESS',
        endsAt: new Date(Date.now() + 86400000 * 30),
      },
    });
    const site = await prisma.attendanceSite.create({
      data: {
        organizationId: organization.id,
        name: 'Historical site',
        latitude: 12,
        longitude: -1,
        allowedRadiusMeters: 100,
      },
    });
    const schedule = await prisma.schedule.create({
      data: {
        organizationId: organization.id,
        siteId: site.id,
        name: 'Original',
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
        v1ScopeStatus: 'OPERATIONAL',
      },
    });
    const user = await prisma.user.create({
      data: { normalizedEmail: `${suffix}@test.example`, passwordHash },
    });
    const membership = await prisma.membership.create({
      data: { organizationId: organization.id, userId: user.id, role: 'ADMIN' },
    });
    const employeeUser = await prisma.user.create({
      data: {
        normalizedEmail: `employee-${suffix}@test.example`,
        passwordHash,
      },
    });
    await prisma.membership.create({
      data: {
        organizationId: organization.id,
        userId: employeeUser.id,
        role: 'EMPLOYEE',
      },
    });
    const employee = await prisma.employee.create({
      data: {
        organizationId: organization.id,
        userId: employeeUser.id,
        employeeIdentifier: suffix,
        firstName: 'Review',
        lastName: 'Employee',
        email: employeeUser.normalizedEmail,
        role: 'Employee',
        accessRole: 'EMPLOYEE',
        passwordHash,
        scheduleId: schedule.id,
        primarySiteId: site.id,
        v1ScopeStatus: 'OPERATIONAL',
      },
    });
    const date = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    const assignment = await prisma.employeeSiteAssignment.create({
      data: {
        organizationId: organization.id,
        employeeId: employee.id,
        siteId: site.id,
        effectiveFrom: date,
      },
    });
    await prisma.employeeScheduleAssignment.create({
      data: {
        organizationId: organization.id,
        employeeId: employee.id,
        siteId: site.id,
        scheduleId: schedule.id,
        employeeSiteAssignmentId: assignment.id,
        effectiveFrom: date,
        v1ScopeStatus: 'OPERATIONAL',
      },
    });
    const authentication: AuthenticationContext = {
      generation: 'saas',
      purpose: 'account',
      organizationId: organization.id,
      userId: user.id,
      membershipId: membership.id,
      membershipRole: MembershipRole.ADMIN,
      employeeId: null,
      attendanceSiteId: null,
    };
    const employeeAuthentication: AuthenticationContext = {
      ...authentication,
      purpose: 'attendance_entry',
      employeeId: employee.id,
      attendanceSiteId: site.id,
    };
    const context = await app
      .get(OfflineAttendanceContextService)
      .issue(employee.id, employeeAuthentication);
    const capturedAt = new Date();
    const dto = {
      sessionBinding: randomUUID(),
      clientRequestId: randomUUID(),
      contextToken: context.contextToken,
      action: OfflineAttendanceAction.CHECK_IN,
      capturedAt: capturedAt.toISOString(),
      siteId: site.id,
    };
    await prisma.attendanceSite.update({
      where: { id: site.id },
      data: { isActive: false, statusChangedAt: new Date(Date.now() + 1) },
    });
    expect(
      await service.synchronizeOfflineAttendance(
        employee.id,
        dto,
        employeeAuthentication,
      ),
    ).toMatchObject({
      state: 'reconciliation_required',
      evidenceAcknowledged: true,
    });
    const item = await prisma.offlineAttendanceReconciliation.findFirstOrThrow({
      where: { organizationId: organization.id },
    });
    const login = async (email: string) =>
      (
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email, password })
          .expect(201)
      ).body.accessToken as string;
    return {
      organization,
      site,
      schedule,
      employee,
      user,
      authentication,
      employeeAuthentication,
      item,
      capturedAt,
      dto,
      token: await login(user.normalizedEmail),
      employeeToken: await login(employeeUser.normalizedEmail),
    };
  }
  const decide = (
    data: Awaited<ReturnType<typeof fixture>>,
    action: string,
    reason = 'Reviewed original event',
  ) =>
    request(app.getHttpServer())
      .post(path(data.item.id, action))
      .set('Authorization', `Bearer ${data.token}`)
      .send({ reason });

  it('approves with one correction, original timestamp/site/schedule/calendar, durable actor and employee outcome', async () => {
    const data = await fixture();
    await prisma.schedule.update({
      where: { id: data.schedule.id },
      data: { startTime: '10:00', name: 'Changed' },
    });
    const response = await decide(data, 'approve').expect(201);
    expect(response.body.status).toBe('RESOLVED');
    const attendance = await prisma.attendance.findUniqueOrThrow({
      where: { id: response.body.resultingAttendanceId },
    });
    expect(attendance).toMatchObject({
      clockInAt: data.capturedAt,
      attendanceSiteId: data.site.id,
      scheduleStartTimeSnapshot: '08:00',
      scheduleNameSnapshot: 'Original',
      calendarNonWorkingDaySnapshot: false,
      checkInVerificationReason: 'OFFLINE_RECONCILIATION_ADMIN_CORRECTION',
    });
    const item = await prisma.offlineAttendanceReconciliation.findUniqueOrThrow(
      { where: { id: data.item.id }, include: { decisions: true } },
    );
    expect(item).toMatchObject({
      status: 'RESOLVED',
      decidedByUserId: data.user.id,
      resultingAttendanceId: attendance.id,
      decisionReason: 'Reviewed original event',
      decidedAt: expect.any(Date),
    });
    expect(item.decisions).toHaveLength(1);
    expect(item.decisions[0]).toMatchObject({
      actorUserId: data.user.id,
      decision: 'APPROVE',
      reason: item.decisionReason,
    });
    const outcome = await request(app.getHttpServer())
      .get(
        `/api/v1/attendance/me/offline-reconciliation/${data.dto.clientRequestId}`,
      )
      .set('Authorization', `Bearer ${data.employeeToken}`)
      .expect(200);
    expect(outcome.body).toMatchObject({
      state: 'resolved',
      reviewStatus: 'RESOLVED',
      attendanceId: attendance.id,
    });
    await decide(data, 'approve')
      .expect(201)
      .expect((r) => expect(r.body.idempotent).toBe(true));
    await decide(data, 'reject').expect(409);
    await service.synchronizeOfflineAttendance(
      data.employee.id,
      data.dto,
      data.employeeAuthentication,
    );
    expect(
      await prisma.attendance.count({
        where: { employeeId: data.employee.id },
      }),
    ).toBe(1);
  });

  it('preserves a null schedule snapshot instead of substituting the issuance-day schedule', async () => {
    const data = await fixture();
    const ledger = await prisma.offlineAttendanceSyncRequest.findUniqueOrThrow({
      where: { id: data.item.syncRequestId },
    });
    const context = ledger.contextSnapshot as any;
    context.scheduleSnapshots.find(
      (entry: any) =>
        entry.businessDate === data.capturedAt.toISOString().slice(0, 10),
    ).schedule = null;
    await prisma.offlineAttendanceSyncRequest.update({
      where: { id: ledger.id },
      data: { contextSnapshot: context },
    });
    const result = await decide(data, 'approve').expect(201);
    expect(
      await prisma.attendance.findUnique({
        where: { id: result.body.resultingAttendanceId },
      }),
    ).toMatchObject({
      scheduleIdSnapshot: null,
      scheduleStartTimeSnapshot: null,
      minutesLate: 0,
      status: 'INCOMPLETE',
    });
  });

  it('rejects durably and idempotently without creating attendance and denies subsequent approval', async () => {
    const data = await fixture();
    await decide(data, 'reject', 'Evidence not reliable').expect(201);
    await decide(data, 'reject', 'Evidence not reliable')
      .expect(201)
      .expect((r) => expect(r.body.idempotent).toBe(true));
    await decide(data, 'approve').expect(409);
    expect(
      await prisma.attendance.count({
        where: { employeeId: data.employee.id },
      }),
    ).toBe(0);
    expect(
      await service.getEmployeeOfflineReconciliationOutcome(
        data.dto.clientRequestId,
        data.employee.id,
        data.employeeAuthentication,
      ),
    ).toMatchObject({
      state: 'rejected',
      reviewStatus: 'REJECTED',
      decisionReason: 'Evidence not reliable',
    });
    expect(
      await prisma.offlineAttendanceReconciliationDecision.count({
        where: { reconciliationId: data.item.id },
      }),
    ).toBe(1);
  });

  it('serializes concurrent administrators into one stable attendance and one decision', async () => {
    const data = await fixture();
    const otherUser = await prisma.user.create({
      data: { normalizedEmail: `${randomUUID()}@test.example`, passwordHash },
    });
    const membership = await prisma.membership.create({
      data: {
        organizationId: data.organization.id,
        userId: otherUser.id,
        role: 'ADMIN',
      },
    });
    const other = {
      ...data.authentication,
      userId: otherUser.id,
      membershipId: membership.id,
    };
    const results = await Promise.allSettled([
      service.decideOfflineReconciliation(
        data.item.id,
        'APPROVE',
        'First review reason',
        data.authentication,
      ),
      service.decideOfflineReconciliation(
        data.item.id,
        'APPROVE',
        'Second review reason',
        other,
      ),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(
      await prisma.attendance.count({
        where: { employeeId: data.employee.id },
      }),
    ).toBe(1);
    expect(
      await prisma.offlineAttendanceReconciliationDecision.count({
        where: { reconciliationId: data.item.id },
      }),
    ).toBe(1);
  });

  it('detects existing attendance and leaves the case pending without overwriting', async () => {
    const data = await fixture();
    const existing = await prisma.attendance.create({
      data: {
        employeeId: data.employee.id,
        organizationId: data.organization.id,
        attendanceSiteId: data.site.id,
        date: new Date(
          `${data.capturedAt.toISOString().slice(0, 10)}T00:00:00Z`,
        ),
        clockInAt: new Date(data.capturedAt.getTime() - 1000),
        v1ScopeStatus: 'OPERATIONAL',
      },
    });
    await decide(data, 'approve').expect(409);
    expect(
      await prisma.attendance.findUnique({ where: { id: existing.id } }),
    ).toMatchObject({ clockInAt: existing.clockInAt });
    expect(
      await prisma.offlineAttendanceReconciliation.findUnique({
        where: { id: data.item.id },
      }),
    ).toMatchObject({ status: 'PENDING_REVIEW', resultingAttendanceId: null });
  });

  it('approves a compatible original checkout through the same engine and refuses checkout without a check-in', async () => {
    const data = await fixture();
    await decide(data, 'approve').expect(201);
    const dto = {
      ...data.dto,
      clientRequestId: randomUUID(),
      action: OfflineAttendanceAction.CHECK_OUT,
      capturedAt: new Date().toISOString(),
    };
    await service.synchronizeOfflineAttendance(
      data.employee.id,
      dto,
      data.employeeAuthentication,
    );
    const checkout =
      await prisma.offlineAttendanceReconciliation.findFirstOrThrow({
        where: { syncRequest: { clientRequestId: dto.clientRequestId } },
      });
    const result = await service.decideOfflineReconciliation(
      checkout.id,
      'APPROVE',
      'Original checkout verified',
      data.authentication,
    );
    expect(
      await prisma.attendance.findUnique({
        where: { id: result.resultingAttendanceId! },
      }),
    ).toMatchObject({
      clockOutAt: new Date(dto.capturedAt),
      scheduleStartTimeSnapshot: '08:00',
      calendarNonWorkingDaySnapshot: false,
      checkOutVerificationReason: 'OFFLINE_RECONCILIATION_ADMIN_CORRECTION',
    });
    expect(
      await prisma.attendance.count({
        where: { employeeId: data.employee.id },
      }),
    ).toBe(1);
    const missing = await fixture();
    await prisma.offlineAttendanceSyncRequest.update({
      where: { id: missing.item.syncRequestId },
      data: { action: 'check-out' },
    });
    await decide(missing, 'approve').expect(409);
    expect(
      await prisma.offlineAttendanceReconciliation.findUnique({
        where: { id: missing.item.id },
      }),
    ).toMatchObject({ status: 'PENDING_REVIEW' });
  });

  it('rolls back attendance and transient APPROVED state when decision-history persistence fails', async () => {
    const data = await fixture();
    // A real FK failure inside the final decision insert must roll back the correction.
    const db = app.get(PrismaService);
    const original = db.$transaction.bind(db);
    const spy = jest.spyOn(db, '$transaction').mockImplementationOnce(
      (callback: any, options: any) =>
        original(async (tx) => {
          const create = tx.offlineAttendanceReconciliationDecision.create.bind(
            tx.offlineAttendanceReconciliationDecision,
          );
          tx.offlineAttendanceReconciliationDecision.create = ((args: any) =>
            create({
              ...args,
              data: { ...args.data, actorUserId: randomUUID() },
            })) as typeof create;
          return callback(tx);
        }, options) as any,
    );
    await expect(
      service.decideOfflineReconciliation(
        data.item.id,
        'APPROVE',
        'Commit must be atomic',
        data.authentication,
      ),
    ).rejects.toThrow();
    spy.mockRestore();
    expect(
      await prisma.attendance.count({
        where: { employeeId: data.employee.id },
      }),
    ).toBe(0);
    expect(
      await prisma.offlineAttendanceReconciliation.findUnique({
        where: { id: data.item.id },
      }),
    ).toMatchObject({
      status: 'PENDING_REVIEW',
      decidedAt: null,
      resultingAttendanceId: null,
    });
  });

  it('enforces tenant isolation on list/detail/selfie/decisions, and employee decision denial', async () => {
    const a = await fixture();
    const b = await fixture();
    await prisma.offlineAttendanceReconciliation.update({
      where: { id: b.item.id },
      data: { selfiePublicId: 'private/test', selfieMimeType: 'image/png' },
    });
    const list = await request(app.getHttpServer())
      .get(
        '/api/v1/attendance/offline-reconciliation?pageSize=1&status=PENDING_REVIEW',
      )
      .set('Authorization', `Bearer ${a.token}`)
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].id).toBe(a.item.id);
    for (const suffix of ['', 'selfie'])
      await request(app.getHttpServer())
        .get(path(b.item.id, suffix))
        .set('Authorization', `Bearer ${a.token}`)
        .expect(404);
    for (const action of ['approve', 'reject']) {
      await request(app.getHttpServer())
        .post(path(b.item.id, action))
        .set('Authorization', `Bearer ${a.token}`)
        .send({ reason: 'Tenant boundary check' })
        .expect(404);
      await request(app.getHttpServer())
        .post(path(a.item.id, action))
        .set('Authorization', `Bearer ${a.employeeToken}`)
        .send({ reason: 'Employee check' })
        .expect(403);
      await expect(
        service.decideOfflineReconciliation(
          a.item.id,
          action === 'approve' ? 'APPROVE' : 'REJECT',
          'Platform check',
          { ...a.authentication, purpose: 'platform' },
        ),
      ).rejects.toThrow();
    }
    const platformUser = await prisma.user.create({
      data: {
        normalizedEmail: `platform-${randomUUID()}@test.example`,
        passwordHash,
        platformAdmin: { create: {} },
      },
    });
    const platformToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: platformUser.normalizedEmail, password })
        .expect(201)
    ).body.accessToken;
    for (const action of ['approve', 'reject']) {
      await request(app.getHttpServer())
        .post(path(a.item.id, action))
        .set('Authorization', `Bearer ${platformToken}`)
        .send({ reason: 'Platform API check' })
        .expect(403);
    }
    const detail = await request(app.getHttpServer())
      .get(path(b.item.id))
      .set('Authorization', `Bearer ${b.token}`)
      .expect(200);
    expect(JSON.stringify(detail.body)).not.toContain('private/test');
    const photo = await request(app.getHttpServer())
      .get(path(b.item.id, 'selfie'))
      .set('Authorization', `Bearer ${b.token}`)
      .expect(200);
    expect(photo.headers['cache-control']).toBe('private, no-store');
    expect(photo.headers['content-type']).toContain('image/jpeg');
  });

  it('validates IDs, pagination, reason and current membership/subscription state', async () => {
    const data = await fixture();
    await decide(data, 'approve', '  ').expect(400);
    await request(app.getHttpServer())
      .get(path('invalid'))
      .set('Authorization', `Bearer ${data.token}`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/attendance/offline-reconciliation?pageSize=101')
      .set('Authorization', `Bearer ${data.token}`)
      .expect(400);
    await prisma.membership.update({
      where: { id: data.authentication.membershipId! },
      data: { status: 'SUSPENDED' },
    });
    await expect(
      service.decideOfflineReconciliation(
        data.item.id,
        'APPROVE',
        'Security review',
        data.authentication,
      ),
    ).rejects.toThrow();
    await prisma.membership.update({
      where: { id: data.authentication.membershipId! },
      data: { status: 'ACTIVE' },
    });
    await prisma.organizationSubscription.update({
      where: { organizationId: data.organization.id },
      data: { status: 'SUSPENDED' },
    });
    await decide(data, 'approve').expect(403);
  });

  it('denies expired cases and an invalid over-age intake deterministically', async () => {
    const data = await fixture();
    await prisma.offlineAttendanceReconciliation.update({
      where: { id: data.item.id },
      data: { status: 'EXPIRED' },
    });
    await decide(data, 'approve').expect(409);
    await prisma.offlineAttendanceReconciliation.update({
      where: { id: data.item.id },
      data: { status: 'PENDING_REVIEW' },
    });
    await prisma.offlineAttendanceSyncRequest.update({
      where: { id: data.item.syncRequestId },
      data: { status: 'EXPIRED' },
    });
    await decide(data, 'approve').expect(409);
    await prisma.offlineAttendanceSyncRequest.update({
      where: { id: data.item.syncRequestId },
      data: {
        status: 'RECONCILIATION_REQUIRED',
        capturedAt: new Date(data.capturedAt.getTime() - 86400001),
        receivedAt: new Date(data.capturedAt.getTime() + 86400001),
      },
    });
    const expired = await decide(data, 'approve').expect(201);
    expect(expired.body).toMatchObject({
      status: 'EXPIRED',
      resultingAttendanceId: null,
      idempotent: false,
      decidedAt: expect.any(String),
    });
    expect(await prisma.offlineAttendanceReconciliation.findUniqueOrThrow({
      where: { id: data.item.id },
    })).toMatchObject({
      status: 'EXPIRED',
      decidedByUserId: data.user.id,
      decisionReason: expect.stringContaining('24-hour'),
      resultingAttendanceId: null,
      decidedAt: expect.any(Date),
    });
    expect(await prisma.offlineAttendanceSyncRequest.findUniqueOrThrow({
      where: { id: data.item.syncRequestId },
    })).toMatchObject({ status: 'EXPIRED', attendanceId: null });
    expect(await prisma.offlineAttendanceReconciliationDecision.findMany({
      where: { organizationId: data.organization.id, reconciliationId: data.item.id },
    })).toMatchObject([{
      actorUserId: data.user.id,
      decision: 'EXPIRE',
      decidedAt: expect.any(Date),
    }]);
    await decide(data, 'approve').expect(201).expect((response) => {
      expect(response.body).toMatchObject({ status: 'EXPIRED', idempotent: true });
    });
    const employeeOutcome = await request(app.getHttpServer())
      .get(`/api/v1/attendance/me/offline-reconciliation/${data.dto.clientRequestId}`)
      .set('Authorization', `Bearer ${data.employeeToken}`)
      .expect(200);
    expect(employeeOutcome.body).toMatchObject({
      state: 'expired',
      reviewStatus: 'EXPIRED',
      reason: expect.stringContaining('24 heures'),
      decidedAt: expect.any(String),
      attendanceId: null,
    });
    expect(await prisma.offlineAttendanceReconciliationDecision.count({
      where: { organizationId: data.organization.id, reconciliationId: data.item.id },
    })).toBe(1);
    expect(
      await prisma.attendance.count({
        where: { employeeId: data.employee.id },
      }),
    ).toBe(0);
  });

  it('converges a pending case on the employee outcome read after 24 hours and keeps dependent queue events blocked', async () => {
    const data = await fixture();
    await prisma.offlineAttendanceSyncRequest.update({
      where: { id: data.item.syncRequestId },
      data: { capturedAt: new Date(Date.now() - 86400001), receivedAt: new Date() },
    });

    const endpoint = () => request(app.getHttpServer())
      .get(`/api/v1/attendance/me/offline-reconciliation/${data.dto.clientRequestId}`)
      .set('Authorization', `Bearer ${data.employeeToken}`)
      .expect(200);
    const outcome = await endpoint();
    expect(outcome.body).toMatchObject({
      state: 'expired', reviewStatus: 'EXPIRED',
      reason: expect.stringContaining('24 heures'),
      decidedAt: expect.any(String), attendanceId: null,
    });
    await endpoint();
    expect(await prisma.offlineAttendanceReconciliation.findUniqueOrThrow({ where: { id: data.item.id } }))
      .toMatchObject({ status: 'EXPIRED', resultingAttendanceId: null, decidedAt: expect.any(Date) });
    expect(await prisma.offlineAttendanceReconciliationDecision.count({
      where: { organizationId: data.organization.id, reconciliationId: data.item.id, decision: 'EXPIRE' },
    })).toBe(1);
    expect(await prisma.attendance.count({ where: { employeeId: data.employee.id } })).toBe(0);
    await decide(data, 'approve').expect(201).expect((response) => {
      expect(response.body).toMatchObject({ status: 'EXPIRED', idempotent: true });
    });
  });

  it('keeps a pending case reviewable until it is older than the 24-hour window', async () => {
    const data = await fixture();
    await prisma.offlineAttendanceSyncRequest.update({
      where: { id: data.item.syncRequestId },
      data: { capturedAt: new Date(Date.now() - 86400000 + 5000) },
    });

    const outcome = await request(app.getHttpServer())
      .get(`/api/v1/attendance/me/offline-reconciliation/${data.dto.clientRequestId}`)
      .set('Authorization', `Bearer ${data.employeeToken}`)
      .expect(200);

    expect(outcome.body).toMatchObject({
      state: 'reconciliation_required',
      reviewStatus: 'PENDING_REVIEW',
      attendanceId: null,
    });
    expect(await prisma.offlineAttendanceReconciliation.findUniqueOrThrow({
      where: { id: data.item.id },
    })).toMatchObject({ status: 'PENDING_REVIEW', decidedAt: null });
    expect(await prisma.offlineAttendanceReconciliationDecision.count({
      where: { organizationId: data.organization.id, reconciliationId: data.item.id },
    })).toBe(0);
    expect(await prisma.attendance.count({ where: { employeeId: data.employee.id } })).toBe(0);
  });

  it('requires the retained original GPS/selfie policy before approving a legacy incomplete case', async () => {
    const data = await fixture();
    const ledger = await prisma.offlineAttendanceSyncRequest.findUniqueOrThrow({
      where: { id: data.item.syncRequestId },
    });
    const context = ledger.contextSnapshot as any;
    context.attendancePolicy = {
      ...context.attendancePolicy,
      enabled: true,
      gpsRequired: true,
      selfieRequired: true,
    };
    await prisma.offlineAttendanceSyncRequest.update({
      where: { id: ledger.id },
      data: { contextSnapshot: context },
    });
    await decide(data, 'approve').expect(409);
    expect(
      await service.synchronizeOfflineAttendance(
        data.employee.id,
        data.dto,
        data.employeeAuthentication,
      ),
    ).toMatchObject({ evidenceAcknowledged: false });
    await prisma.offlineAttendanceReconciliation.update({
      where: { id: data.item.id },
      data: { selfiePublicId: 'private/policy-test' },
    });
    await decide(data, 'approve').expect(409);
    expect(
      await prisma.offlineAttendanceReconciliation.findUnique({
        where: { id: data.item.id },
      }),
    ).toMatchObject({ status: 'PENDING_REVIEW' });
  });

  it('expires a retry with an abandoned processing ledger after 24 hours and does not create a review case', async () => {
    const data = await fixture();
    const original =
      await prisma.offlineAttendanceSyncRequest.findUniqueOrThrow({
        where: { id: data.item.syncRequestId },
      });
    const pastContext = {
      ...(original.contextSnapshot as any),
      issuedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      validUntil: new Date(Date.now() - 86400000).toISOString(),
    };
    // Sign a context with an exact 24-hour window that authorized this old capture.
    pastContext.validUntil = new Date(
      Date.parse(pastContext.issuedAt) + 86400000,
    ).toISOString();
    const contextToken = signJwtToken(
      {
        sub: data.employee.id,
        purpose: 'offline_attendance_context',
        context: pastContext,
      },
      app.get(ConfigService).getOrThrow<string>('JWT_SECRET'),
      '24h',
    );
    const dto = {
      ...data.dto,
      contextToken,
      clientRequestId: randomUUID(),
      capturedAt: new Date(
        Date.parse(pastContext.validUntil) - 1,
      ).toISOString(),
    };
    const policy = service as unknown as {
      getOfflineSyncPayloadHash(id: string, dto: typeof data.dto): string;
    };
    await prisma.offlineAttendanceSyncRequest.create({
      data: {
        organizationId: data.organization.id,
        employeeId: data.employee.id,
        siteId: data.site.id,
        clientRequestId: dto.clientRequestId,
        action: dto.action,
        payloadHash: policy.getOfflineSyncPayloadHash(data.employee.id, dto),
        capturedAt: new Date(dto.capturedAt),
        receivedAt: new Date(),
        status: 'PROCESSING',
      },
    });
    expect(
      await service.synchronizeOfflineAttendance(
        data.employee.id,
        dto,
        data.employeeAuthentication,
      ),
    ).toMatchObject({ state: 'expired' });
    expect(
      await prisma.offlineAttendanceReconciliation.count({
        where: { syncRequest: { clientRequestId: dto.clientRequestId } },
      }),
    ).toBe(0);
  });

  it('protects pending evidence, retains resolved evidence for 90 days after decision, retries deletions and retains audit metadata', async () => {
    const data = await fixture();
    const rejected = await fixture();
    const now = new Date();
    await prisma.offlineAttendanceReconciliation.update({
      where: { id: data.item.id },
      data: {
        selfiePublicId: 'pending/evidence',
        createdAt: new Date(now.getTime() - 200 * 86400000),
      },
    });
    await prisma.offlineAttendanceReconciliation.update({
      where: { id: rejected.item.id },
      data: { selfiePublicId: 'resolved/evidence' },
    });
    await decide(rejected, 'reject').expect(201);
    const storage = app.get(AttendancePhotoStorageService);
    const deletion = jest.spyOn(storage, 'deleteVerificationPhoto');
    const retention = app.get(SelfieRetentionService);
    await retention.runDueRetention(new Date(now.getTime() + 89 * 86400000));
    expect(deletion).not.toHaveBeenCalledWith('pending/evidence');
    expect(deletion).not.toHaveBeenCalledWith('resolved/evidence');
    deletion.mockRejectedValueOnce(new Error('provider unavailable'));
    await retention.runDueRetention(new Date(now.getTime() + 91 * 86400000));
    expect(
      await prisma.offlineAttendanceReconciliation.findUnique({
        where: { id: rejected.item.id },
      }),
    ).toMatchObject({
      selfiePublicId: 'resolved/evidence',
      selfieDeletionFailedAt: expect.any(Date),
    });
    await retention.runDueRetention(new Date(now.getTime() + 92 * 86400000));
    expect(
      await prisma.offlineAttendanceReconciliation.findUnique({
        where: { id: rejected.item.id },
      }),
    ).toMatchObject({
      status: 'REJECTED',
      selfiePublicId: null,
      selfieDeletedAt: expect.any(Date),
      decisionReason: 'Reviewed original event',
    });
    expect(deletion).not.toHaveBeenCalledWith('pending/evidence');
    deletion.mockRestore();
  });

  it('accepts the real selfie sync wire DTO and rejects local-only evidence references', async () => {
    const data = await fixture();
    const payload = {
      ...data.dto,
      clientRequestId: randomUUID(),
      security: {
        evidenceCapturedAt: data.dto.capturedAt,
        verificationPhotoDataUrl: 'data:image/jpeg;base64,/9j/2Q==',
        evidenceId: randomUUID(),
      },
    };
    await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${data.employeeToken}`)
      .send(payload)
      .expect(400);
    const { evidenceId: _localId, ...wireSecurity } = payload.security;
    const response = await request(app.getHttpServer())
      .post('/api/v1/attendance/me/sync')
      .set('Authorization', `Bearer ${data.employeeToken}`)
      .send({ ...payload, security: wireSecurity })
      .expect(201);
    expect(response.body).toMatchObject({
      state: 'reconciliation_required',
      evidenceAcknowledged: true,
    });
    const intake =
      await prisma.offlineAttendanceReconciliation.findFirstOrThrow({
        where: { syncRequest: { clientRequestId: payload.clientRequestId } },
      });
    expect(intake.selfiePublicId).toBeTruthy();
    expect(
      await prisma.reconciliationEvidenceUpload.count({
        where: { publicId: intake.selfiePublicId! },
      }),
    ).toBe(0);
  });

  it('rejects exact selfie reuse from reconciliation to attendance and attendance to reconciliation within an organization', async () => {
    const data = await fixture();
    const storage = app.get(AttendancePhotoStorageService);
    const selfie = 'data:image/jpeg;base64,/9j/2Q==';
    const fingerprint = storage.getEvidenceFingerprint(selfie);
    await prisma.offlineAttendanceReconciliation.update({
      where: { id: data.item.id },
      data: { selfieSha256: fingerprint },
    });
    // Exercise the shared policy directly, with real cross-table database reads.
    const policy = service as unknown as {
      assertAttendanceEvidenceNotReused(
        photo: string,
        organizationId: string,
        auth: AuthenticationContext,
      ): Promise<void>;
    };
    await expect(
      policy.assertAttendanceEvidenceNotReused(
        selfie,
        data.organization.id,
        data.authentication,
      ),
    ).rejects.toThrow('déjà été utilisée');
    await prisma.offlineAttendanceReconciliation.update({
      where: { id: data.item.id },
      data: { selfieSha256: null },
    });
    await prisma.attendance.create({
      data: {
        employeeId: data.employee.id,
        organizationId: data.organization.id,
        date: new Date('2026-01-01'),
        checkInVerificationPhotoPublicId: `private/${fingerprint}`,
        checkInSelfieSha256: fingerprint,
      },
    });
    await expect(
      policy.assertAttendanceEvidenceNotReused(
        selfie,
        data.organization.id,
        data.authentication,
      ),
    ).rejects.toThrow('déjà été utilisée');
    await prisma.attendance.updateMany({
      where: { employeeId: data.employee.id },
      data: {
        checkInVerificationPhotoPublicId: null,
        checkInVerificationPhotoDeletedAt: new Date(),
      },
    });
    await expect(
      policy.assertAttendanceEvidenceNotReused(
        selfie,
        data.organization.id,
        data.authentication,
      ),
    ).rejects.toThrow('déjà été utilisée');
    const other = await fixture();
    await expect(
      policy.assertAttendanceEvidenceNotReused(
        selfie,
        other.organization.id,
        other.authentication,
      ),
    ).resolves.toBeUndefined();
  });

  it('writes an upload intent before Cloudinary and preserves it when intake commit and immediate deletion fail', async () => {
    const data = await fixture();
    const db = app.get(PrismaService);
    const storage = app.get(AttendancePhotoStorageService);
    const upload = jest.spyOn(storage, 'uploadVerificationPhoto');
    const deletion = jest
      .spyOn(storage, 'deleteVerificationPhoto')
      .mockRejectedValueOnce(new Error('provider unavailable'));
    const commit = jest
      .spyOn(db, '$transaction')
      .mockRejectedValueOnce(new Error('database commit failed'));
    const dto = {
      ...data.dto,
      clientRequestId: randomUUID(),
      security: {
        verificationPhotoDataUrl: 'data:image/jpeg;base64,/9j/2Q==',
        evidenceCapturedAt: data.dto.capturedAt,
      },
    };
    await expect(
      service.synchronizeOfflineAttendance(
        data.employee.id,
        dto,
        data.employeeAuthentication,
      ),
    ).rejects.toThrow('database commit failed');
    commit.mockRestore();
    expect(upload).toHaveBeenCalledTimes(1);
    const intent = await prisma.reconciliationEvidenceUpload.findFirstOrThrow();
    expect(deletion).toHaveBeenCalledWith(intent.publicId);
    expect(
      await prisma.offlineAttendanceSyncRequest.count({
        where: { clientRequestId: dto.clientRequestId },
      }),
    ).toBe(0);
    await prisma.reconciliationEvidenceUpload.update({
      where: { id: intent.id },
      data: { createdAt: new Date(Date.now() - 2 * 86400000) },
    });
    await app.get(SelfieRetentionService).runDueRetention(new Date());
    expect(
      await prisma.reconciliationEvidenceUpload.count({
        where: { id: intent.id },
      }),
    ).toBe(0);
    upload.mockRestore();
    deletion.mockRestore();
  });

  it('recovers orphan intents after database failure and never deletes referenced evidence', async () => {
    const data = await fixture();
    const storage = app.get(AttendancePhotoStorageService);
    const old = new Date(Date.now() - 2 * 86400000);
    await prisma.reconciliationEvidenceUpload.create({
      data: { publicId: 'orphan/failed-commit', createdAt: old },
    });
    await prisma.reconciliationEvidenceUpload.create({
      data: { publicId: 'protected/winning-commit', createdAt: old },
    });
    await prisma.offlineAttendanceReconciliation.update({
      where: { id: data.item.id },
      data: { selfiePublicId: 'protected/winning-commit' },
    });
    const deletion = jest
      .spyOn(storage, 'deleteVerificationPhoto')
      .mockImplementation(async (id) => {
        if (id === 'orphan/failed-commit') throw new Error('retry needed');
      });
    const retention = app.get(SelfieRetentionService);
    await retention.runDueRetention(new Date());
    expect(
      await prisma.reconciliationEvidenceUpload.count({
        where: { publicId: 'orphan/failed-commit' },
      }),
    ).toBe(1);
    deletion.mockResolvedValue(undefined);
    await retention.runDueRetention(new Date());
    expect(await prisma.reconciliationEvidenceUpload.count()).toBe(0);
    expect(deletion).toHaveBeenCalledWith('orphan/failed-commit');
    expect(deletion).not.toHaveBeenCalledWith('protected/winning-commit');
    deletion.mockRestore();
  });
});

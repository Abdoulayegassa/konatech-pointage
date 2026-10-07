import { INestApplication, ValidationPipe } from '@nestjs/common';
import {
  AccessRole,
  AttendanceStatus,
  MembershipRole,
  PrismaClient,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AttendancePhotoStorageService } from '../src/modules/attendance/attendance-photo-storage.service';
import { AttendanceSecurityService } from '../src/modules/attendance/attendance-security.service';
import {
  SELFIE_RETENTION_DAYS,
  SelfieRetentionService,
} from '../src/modules/attendance/selfie-retention.service';
import { prepareTestDatabase } from './test-database';
import { hashPassword } from '../src/common/security/password.util';

jest.setTimeout(30000);

describe('Selfie evidence security and retention (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let retention: SelfieRetentionService;
  let storage: AttendancePhotoStorageService;
  let security: AttendanceSecurityService;
  let adminToken: string;
  let employeeToken: string;
  let adminId: string;
  let employeeId: string;

  async function login(email: string, password: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    return response.body.accessToken as string;
  }

  async function createEvidence(employeeId: string, date: Date, suffix: string) {
    return prisma.attendance.create({
      data: {
        employeeId,
        date,
        status: AttendanceStatus.PRESENT,
        checkInVerificationMethod: 'PHOTO',
        checkInVerificationReason: 'SELFIE_RECORDED',
        checkInVerificationPhoto: `https://provider.invalid/${suffix}`,
        checkInVerificationPhotoPublicId: `private/${suffix}`,
      },
    });
  }

  async function createSaasAdmin(suffix: string) {
    const password = 'SelfieEvidence123!';
    const passwordHash = await hashPassword(password);
    const organization = await prisma.organization.create({
      data: { name: `Selfie ${suffix}`, slug: `selfie-${suffix}`, timezone: 'Etc/UTC' },
    });
    const user = await prisma.user.create({
      data: { normalizedEmail: `selfie-${suffix}@example.test`, passwordHash },
    });
    await prisma.membership.create({
      data: { organizationId: organization.id, userId: user.id, role: MembershipRole.ADMIN },
    });
    const employee = await prisma.employee.create({
      data: {
        employeeIdentifier: `SELFIE-${suffix}`,
        firstName: 'Selfie',
        lastName: 'Admin',
        email: `selfie-${suffix}@example.test`,
        role: 'Administrator',
        accessRole: AccessRole.ADMIN,
        passwordHash,
        organizationId: organization.id,
        userId: user.id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      },
    });
    return {
      organization,
      employee,
      token: await login(user.normalizedEmail, password),
    };
  }

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    retention = app.get(SelfieRetentionService);
    storage = app.get(AttendancePhotoStorageService);
    security = app.get(AttendanceSecurityService);
    adminToken = await login('awa.traore@konatech.local', 'KonatechAdmin123!');
    employeeToken = await login('fatoumata.konate@konatech.local', 'KonatechEmployee123!');
    adminId = (await prisma.employee.findFirstOrThrow({ where: { email: 'awa.traore@konatech.local' } })).id;
    employeeId = (await prisma.employee.findFirstOrThrow({ where: { email: 'fatoumata.konate@konatech.local' } })).id;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
  });

  it('delivers evidence only through an authenticated no-store endpoint and never through history payloads', async () => {
    const attendance = await createEvidence(employeeId, new Date('2026-04-10T00:00:00.000Z'), 'available');
    const history = await request(app.getHttpServer())
      .get('/api/v1/attendance/history')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(JSON.stringify(history.body)).not.toContain('https://provider.invalid');
    expect(JSON.stringify(history.body)).not.toContain('private/available');

    const response = await request(app.getHttpServer())
      .get(`/api/v1/attendance/history/${attendance.id}/selfie`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['content-type']).toContain('image/jpeg');

    await request(app.getHttpServer())
      .get(`/api/v1/attendance/history/${attendance.id}/selfie`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(200);
    const other = await createEvidence(adminId, new Date('2026-04-11T00:00:00.000Z'), 'forbidden');
    await request(app.getHttpServer())
      .get(`/api/v1/attendance/history/${other.id}/selfie`)
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(404);
  });

  it('keeps evidence before 90 days, deletes eligible provider evidence, and preserves attendance', async () => {
    const now = new Date('2026-07-01T12:00:00.000Z');
    const retained = await createEvidence(employeeId, new Date('2026-04-03T00:00:00.000Z'), 'retained');
    const expired = await createEvidence(employeeId, new Date('2026-04-02T00:00:00.000Z'), 'expired');
    const deletion = jest.spyOn(storage, 'deleteVerificationPhoto').mockResolvedValue();

    await retention.runDueRetention(now);
    expect(deletion).toHaveBeenCalledWith('private/expired');
    expect(deletion).not.toHaveBeenCalledWith('private/retained');
    expect(await prisma.attendance.findUniqueOrThrow({ where: { id: retained.id } })).toMatchObject({
      checkInVerificationPhotoPublicId: 'private/retained',
    });
    expect(await prisma.attendance.findUniqueOrThrow({ where: { id: expired.id } })).toMatchObject({
      id: expired.id,
      checkInVerificationPhoto: null,
      checkInVerificationPhotoPublicId: null,
      checkInVerificationPhotoDeletedAt: expect.any(Date),
    });

    deletion.mockClear();
    await retention.runDueRetention(now);
    expect(deletion).not.toHaveBeenCalledWith('private/expired');
    deletion.mockRestore();
  });

  it('records provider deletion failure without removing evidence for a later retry', async () => {
    const evidence = await createEvidence(employeeId, new Date('2026-01-01T00:00:00.000Z'), 'retry');
    const deletion = jest.spyOn(storage, 'deleteVerificationPhoto').mockRejectedValue(new Error('provider unavailable'));
    await retention.runDueRetention(new Date('2026-07-01T12:00:00.000Z'));
    const persisted = await prisma.attendance.findUniqueOrThrow({ where: { id: evidence.id } });
    expect(persisted).toMatchObject({
      id: evidence.id,
      checkInVerificationPhotoPublicId: 'private/retry',
      checkInVerificationPhotoDeletionFailedAt: expect.any(Date),
    });
    deletion.mockRestore();
    expect(SELFIE_RETENTION_DAYS).toBe(90);
  });

  it('validates delayed offline evidence against event time, while rejecting stale event evidence', async () => {
    const capturedAt = new Date('2026-10-05T08:03:00.000Z');
    const evidence = {
      evidenceCapturedAt: capturedAt.toISOString(),
      latitude: 5.32,
      longitude: -4.01,
      accuracyMeters: 12,
      verificationPhotoDataUrl: 'data:image/jpeg;base64,/9j/2Q==',
    };
    const policy = {
      enabled: true,
      selfieRequired: true,
      gpsRequired: false,
      locationConfigured: false,
      trustedRadiusMeters: null,
      warningRadiusMeters: null,
      allowedRadiusMeters: null,
      maxAccuracyMeters: null,
      companyLatitude: null,
      companyLongitude: null,
    };

    await expect(security.validateEvidence(evidence, {
      enforceSecurity: true,
      requireFreshEvidence: true,
      evidenceReferenceTime: capturedAt,
      policyOverride: policy,
    })).resolves.toBeUndefined();

    await expect(security.evaluateCheckIn(evidence, {
      enforceSecurity: true,
      employeeId,
      occurredAt: capturedAt,
      requireFreshEvidence: true,
      evidenceReferenceTime: capturedAt,
      policyOverride: policy,
    })).resolves.toMatchObject({
      checkInVerificationMethod: 'PHOTO',
    });

    await expect(security.validateEvidence({
      ...evidence,
      evidenceCapturedAt: new Date(capturedAt.getTime() - 2 * 60_000 - 1).toISOString(),
    }, {
      enforceSecurity: true,
      requireFreshEvidence: true,
      evidenceReferenceTime: capturedAt,
      policyOverride: policy,
    })).rejects.toThrow('Preuve de pointage absente ou expirée.');
  });

  it('rejects a different tenant and a SUPER ADMIN from the tenant selfie route', async () => {
    const tenant = await createSaasAdmin('owner');
    const otherTenant = await createSaasAdmin('other');
    const attendance = await prisma.attendance.create({
      data: {
        organizationId: tenant.organization.id,
        employeeId: tenant.employee.id,
        date: new Date('2026-04-12T00:00:00.000Z'),
        status: AttendanceStatus.PRESENT,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        checkInVerificationMethod: 'PHOTO',
        checkInVerificationReason: 'SELFIE_RECORDED',
        checkInVerificationPhoto: 'https://provider.invalid/tenant-only',
        checkInVerificationPhotoPublicId: 'private/tenant-only',
      },
    });
    await request(app.getHttpServer())
      .get(`/api/v1/attendance/history/${attendance.id}/selfie`)
      .set('Authorization', `Bearer ${otherTenant.token}`)
      .expect(404);

    const password = 'SelfieEvidence123!';
    const platformUser = await prisma.user.create({
      data: {
        normalizedEmail: 'selfie-platform-admin@example.test',
        passwordHash: await hashPassword(password),
        platformAdmin: { create: {} },
      },
    });
    const platformToken = await login(platformUser.normalizedEmail, password);
    await request(app.getHttpServer())
      .get(`/api/v1/attendance/history/${attendance.id}/selfie`)
      .set('Authorization', `Bearer ${platformToken}`)
      .expect(403);
  });

  it('lists durable reconciliation cases only to an ADMIN of their own tenant', async () => {
    const tenantA = await createSaasAdmin('recon-a');
    const tenantB = await createSaasAdmin('recon-b');
    const sync = await prisma.offlineAttendanceSyncRequest.create({
      data: {
        organizationId: tenantA.organization.id,
        employeeId: tenantA.employee.id,
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        action: 'check-in', siteId: null, payloadHash: 'a'.repeat(64),
        capturedAt: new Date('2026-10-05T08:00:00.000Z'),
        receivedAt: new Date('2026-10-05T08:10:00.000Z'),
        status: 'RECONCILIATION_REQUIRED', rejectionReason: 'Site inactive',
      },
    });
    const reconciliation = await prisma.offlineAttendanceReconciliation.create({
      data: {
        organizationId: tenantA.organization.id,
        syncRequestId: sync.id,
        employeeId: tenantA.employee.id,
        reasonCode: 'SITE_INACTIVE', reason: 'Site inactive',
        evidenceSnapshot: { evidenceCapturedAt: '2026-10-05T08:00:00.000Z' },
      },
    });

    const own = await request(app.getHttpServer())
      .get('/api/v1/attendance/offline-reconciliation')
      .set('Authorization', `Bearer ${tenantA.token}`)
      .expect(200);
    expect(own.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: reconciliation.id, reasonCode: 'SITE_INACTIVE' })]));
    expect(own.body.items.some((item: { organizationId?: string }) => item.organizationId === tenantB.organization.id)).toBe(false);

    await request(app.getHttpServer())
      .get('/api/v1/attendance/offline-reconciliation')
      .set('Authorization', `Bearer ${tenantB.token}`)
      .expect(200)
      .expect((response) => expect(response.body.items).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: reconciliation.id })])));
    await request(app.getHttpServer())
      .get(`/api/v1/attendance/offline-reconciliation/${reconciliation.id}/selfie`)
      .set('Authorization', `Bearer ${tenantB.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/api/v1/attendance/offline-reconciliation')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(403);
  });
});

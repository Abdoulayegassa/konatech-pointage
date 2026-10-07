import {
  CalendarEntryType,
  PrismaClient,
  SanctionRuleType,
  V1OperationalScopeStatus,
  V1ScopeReasonCode,
} from '@prisma/client';
import { prepareTestDatabase } from './test-database';

const ORG_A = 'f2800000-0000-4000-8000-000000000001';
const ORG_B = 'f2800000-0000-4000-8000-000000000002';

describe('Phase 2D multi-site schema foundation', () => {
  let prisma: PrismaClient;
  let siteA: string;
  let secondSiteA: string;
  let siteB: string;
  let employeeA: string;
  let employeeB: string;
  let assignmentA: string;

  const employeeData = (suffix: string, organizationId: string) => ({
    employeeIdentifier: `MULTISITE-${suffix}`,
    firstName: 'Multi',
    lastName: suffix,
    email: `multisite-${suffix.toLowerCase()}@example.test`,
    role: 'Employee',
    passwordHash: 'test-hash',
    organizationId,
  });

  beforeAll(async () => {
    await prepareTestDatabase();
    prisma = new PrismaClient();
    await prisma.$connect();

    await prisma.organization.createMany({
      data: [
        { id: ORG_A, name: 'Multi-site A', slug: 'multi-site-a', timezone: 'UTC' },
        { id: ORG_B, name: 'Multi-site B', slug: 'multi-site-b', timezone: 'UTC' },
      ],
    });
    [siteA, secondSiteA, siteB] = (
      await Promise.all([
        prisma.attendanceSite.create({
          data: {
            organizationId: ORG_A,
            name: 'A Primary',
            latitude: 5,
            longitude: 5,
            allowedRadiusMeters: 100,
          },
        }),
        prisma.attendanceSite.create({
          data: {
            organizationId: ORG_A,
            name: 'A Secondary',
            latitude: 6,
            longitude: 6,
            allowedRadiusMeters: 100,
          },
        }),
        prisma.attendanceSite.create({
          data: {
            organizationId: ORG_B,
            name: 'B Primary',
            latitude: 7,
            longitude: 7,
            allowedRadiusMeters: 100,
          },
        }),
      ])
    ).map((site) => site.id);

    employeeA = (
      await prisma.employee.create({
        data: { ...employeeData('A', ORG_A), primarySiteId: siteA },
      })
    ).id;
    employeeB = (
      await prisma.employee.create({
        data: { ...employeeData('B', ORG_B), primarySiteId: siteB },
      })
    ).id;
    assignmentA = (
      await prisma.employeeSiteAssignment.create({
        data: {
          organizationId: ORG_A,
          employeeId: employeeA,
          siteId: siteA,
          effectiveFrom: new Date('2100-01-01T00:00:00.000Z'),
        },
      })
    ).id;
  }, 120_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('enforces tenant-safe primary-site and site-scoped resource relationships', async () => {
    await expect(
      prisma.employee.create({
        data: { ...employeeData('FOREIGN-PRIMARY', ORG_A), primarySiteId: siteB },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.schedule.create({
        data: {
          name: 'Foreign site schedule',
          startTime: '08:00',
          endTime: '17:00',
          workDays: [],
          organizationId: ORG_A,
          siteId: siteB,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.calendarEntry.create({
        data: {
          name: 'Foreign site calendar',
          date: new Date('2100-01-02T00:00:00.000Z'),
          type: CalendarEntryType.COMPANY_HOLIDAY,
          organizationId: ORG_A,
          siteId: siteB,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.sanctionRule.create({
        data: {
          name: 'Foreign site sanction',
          code: 'FOREIGN-SITE',
          type: SanctionRuleType.MINOR_LATENESS,
          appliedReason: 'Test',
          organizationId: ORG_A,
          siteId: siteB,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.siteAttendanceSettings.create({
        data: { organizationId: ORG_A, siteId: siteB, gpsRequired: true },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.offlineAttendanceSyncRequest.create({
        data: {
          organizationId: ORG_A,
          employeeId: employeeA,
          siteId: siteB,
          clientRequestId: '00000000-0000-4000-8000-000000000099',
          action: 'CHECK_IN',
          payloadHash: 'test-hash',
          capturedAt: new Date('2100-01-01T00:00:00.000Z'),
          receivedAt: new Date('2100-01-01T00:00:01.000Z'),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('enforces EmployeeSiteAssignment tenant consistency and non-overlapping intervals', async () => {
    await expect(
      prisma.employeeSiteAssignment.create({
        data: {
          organizationId: ORG_A,
          employeeId: employeeB,
          siteId: siteA,
          effectiveFrom: new Date('2101-01-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.employeeSiteAssignment.create({
        data: {
          organizationId: ORG_A,
          employeeId: employeeA,
          siteId: siteB,
          effectiveFrom: new Date('2099-01-01T00:00:00.000Z'),
          effectiveTo: new Date('2100-01-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.employeeSiteAssignment.create({
        data: {
          organizationId: ORG_A,
          employeeId: employeeA,
          siteId: secondSiteA,
          effectiveFrom: new Date('2100-06-01T00:00:00.000Z'),
          effectiveTo: new Date('2101-01-01T00:00:00.000Z'),
        },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.employeeSiteAssignment.create({
        data: {
          organizationId: ORG_A,
          employeeId: employeeA,
          siteId: secondSiteA,
          effectiveFrom: new Date('2099-01-01T00:00:00.000Z'),
          effectiveTo: new Date('2100-01-01T00:00:00.000Z'),
        },
      }),
    ).resolves.toBeDefined();
  });

  it('requires a matching historical assignment and prevents attendance scope rewrites', async () => {
    const attendance = await prisma.attendance.create({
      data: {
        employeeId: employeeA,
        organizationId: ORG_A,
        attendanceSiteId: siteA,
        employeeSiteAssignmentId: assignmentA,
        date: new Date('2100-01-02T00:00:00.000Z'),
      },
    });
    await expect(
      prisma.attendance.create({
        data: {
          employeeId: employeeA,
          organizationId: ORG_A,
          attendanceSiteId: siteA,
          employeeSiteAssignmentId: '00000000-0000-4000-8000-000000000001',
          date: new Date('2100-01-03T00:00:00.000Z'),
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.attendance.update({
        where: { id: attendance.id },
        data: { attendanceSiteId: secondSiteA },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.attendance.update({
        where: { id: attendance.id },
        data: { notes: 'scope remains unchanged' },
      }),
    ).resolves.toMatchObject({ attendanceSiteId: siteA });
  });

  it('keeps legacy scope fail-closed and requires an exclusion reason', async () => {
    const legacyEmployee = await prisma.employee.create({
      data: employeeData('LEGACY', ORG_A),
    });
    expect(legacyEmployee.v1ScopeStatus).toBe(
      V1OperationalScopeStatus.REVIEW_REQUIRED,
    );
    await expect(
      prisma.employee.update({
        where: { id: legacyEmployee.id },
        data: { v1ScopeStatus: V1OperationalScopeStatus.LEGACY_EXCLUDED },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.employee.update({
        where: { id: legacyEmployee.id },
        data: {
          v1ScopeStatus: V1OperationalScopeStatus.LEGACY_EXCLUDED,
          v1ScopeReasonCode: V1ScopeReasonCode.MISSING_ORGANIZATION,
        },
      }),
    ).resolves.toMatchObject({
      v1ScopeStatus: V1OperationalScopeStatus.LEGACY_EXCLUDED,
      v1ScopeReasonCode: V1ScopeReasonCode.MISSING_ORGANIZATION,
    });
  });

  it('stores migration review history as append-only records', async () => {
    const event = await prisma.migrationReviewEvent.create({
      data: {
        resourceType: 'EMPLOYEE',
        resourceId: employeeA,
        organizationId: ORG_A,
        nextScopeStatus: V1OperationalScopeStatus.REVIEW_REQUIRED,
        action: 'CLASSIFIED',
        reasonCode: V1ScopeReasonCode.MIGRATION_PENDING,
      },
    });
    await expect(
      prisma.migrationReviewEvent.update({
        where: { id: event.id },
        data: { manifestVersion: 'must-not-update' },
      }),
    ).rejects.toBeTruthy();
    await expect(
      prisma.migrationReviewEvent.delete({ where: { id: event.id } }),
    ).rejects.toBeTruthy();
  });
});

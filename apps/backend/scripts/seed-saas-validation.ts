import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import {
  AccessRole,
  AttendanceStatus,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  PrismaClient,
  SubscriptionPlan,
  SubscriptionStatus,
  UserStatus,
  V1OperationalScopeStatus,
} from '@prisma/client';
import { hashPassword } from '../src/common/security/password.util';
import { getSafeErrorSummary } from '../src/common/security/sensitive-data.util';

const VALIDATION_DATABASE_HOST = '127.0.0.1';
const VALIDATION_DATABASE_PORT = '5434';
const VALIDATION_DATABASE_NAME = 'konatech_attendance_saas_validation';
const VALIDATION_BOOTSTRAP_CONFIRMATION = 'SAAS_VALIDATION_BOOTSTRAP';
const VALIDATION_ORGANIZATION_SLUG = 'konatech-saas-validation';
const VALIDATION_SECOND_ORGANIZATION_SLUG = 'konatech-saas-validation-b';
const VALIDATION_OWNER_IDENTIFIER = 'SAAS-VALIDATION-OWNER';
const WORK_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
] as const;

const prisma = new PrismaClient();

function assertValidationDatabaseTarget(databaseUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL.');
  }

  const databaseName = parsed.pathname.replace(/^\//, '');
  const isExpectedTarget =
    (parsed.protocol === 'postgres:' || parsed.protocol === 'postgresql:') &&
    parsed.hostname === VALIDATION_DATABASE_HOST &&
    parsed.port === VALIDATION_DATABASE_PORT &&
    databaseName === VALIDATION_DATABASE_NAME;

  if (!isExpectedTarget) {
    throw new Error(
      `Refusing to bootstrap outside ${VALIDATION_DATABASE_HOST}:${VALIDATION_DATABASE_PORT}/${VALIDATION_DATABASE_NAME}.`,
    );
  }
}

function getRequiredEnvironmentVariable(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function assertBootstrapConfirmation() {
  if (process.env[VALIDATION_BOOTSTRAP_CONFIRMATION] !== 'true') {
    throw new Error(
      `${VALIDATION_BOOTSTRAP_CONFIRMATION}=true is required to bootstrap validation accounts.`,
    );
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function validationFixtureId(key: string) {
  const hex = createHash('sha256').update(key).digest('hex').slice(0, 32);

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function validationDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day));
}

async function upsertValidationAssignment(
  transaction: Prisma.TransactionClient,
  input: {
    organizationId: string;
    organizationSlug: string;
    employeeId: string;
    employeeKey: string;
    siteId: string;
    siteKey: string;
    scheduleId: string;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  },
) {
  const assignmentId = validationFixtureId(
    `${input.organizationSlug}:${input.employeeKey}:${input.siteKey}:site-assignment`,
  );
  const scheduleAssignmentId = validationFixtureId(
    `${input.organizationSlug}:${input.employeeKey}:${input.siteKey}:schedule-assignment`,
  );
  const assignment = await transaction.employeeSiteAssignment.upsert({
    where: { id: assignmentId },
    update: {
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      siteId: input.siteId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      transferReason: input.effectiveTo ? 'Validation transfer fixture' : null,
    },
    create: {
      id: assignmentId,
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      siteId: input.siteId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      transferReason: input.effectiveTo ? 'Validation transfer fixture' : null,
    },
  });

  await transaction.employeeScheduleAssignment.upsert({
    where: { id: scheduleAssignmentId },
    update: {
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      siteId: input.siteId,
      scheduleId: input.scheduleId,
      employeeSiteAssignmentId: assignment.id,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      v1ScopeReasonCode: null,
      v1ScopeReviewedAt: new Date(),
    },
    create: {
      id: scheduleAssignmentId,
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      siteId: input.siteId,
      scheduleId: input.scheduleId,
      employeeSiteAssignmentId: assignment.id,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
      v1ScopeReviewedAt: new Date(),
    },
  });

  return assignment;
}

async function upsertValidationAttendance(
  transaction: Prisma.TransactionClient,
  input: {
    organizationId: string;
    employeeId: string;
    attendanceSiteId: string;
    assignmentId: string;
    scheduleId: string;
    scheduleName: string;
    workDays: readonly string[];
    date: Date;
    startTime: string;
    endTime: string;
    status: AttendanceStatus;
    minutesLate: number;
  },
) {
  const [startHour, startMinute] = input.startTime.split(':').map(Number);
  const [endHour, endMinute] = input.endTime.split(':').map(Number);
  const clockInAt = new Date(input.date);
  clockInAt.setUTCHours(startHour, startMinute + input.minutesLate, 0, 0);
  const clockOutAt = new Date(input.date);
  clockOutAt.setUTCHours(endHour, endMinute, 0, 0);
  const attendanceFields = {
    organizationId: input.organizationId,
    employeeId: input.employeeId,
    attendanceSiteId: input.attendanceSiteId,
    employeeSiteAssignmentId: input.assignmentId,
    date: input.date,
    clockInAt,
    clockOutAt,
    status: input.status,
    minutesLate: input.minutesLate,
    scheduleIdSnapshot: input.scheduleId,
    scheduleNameSnapshot: input.scheduleName,
    scheduleStartTimeSnapshot: input.startTime,
    scheduleEndTimeSnapshot: input.endTime,
    scheduleWorkDaysSnapshot: [...input.workDays],
    scheduleCapturedAt: clockInAt,
    v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
    v1ScopeReasonCode: null,
    v1ScopeReviewedAt: new Date(),
  };

  await transaction.attendance.upsert({
    where: {
      organizationId_employeeId_date: {
        organizationId: input.organizationId,
        employeeId: input.employeeId,
        date: input.date,
      },
    },
    update: attendanceFields,
    create: attendanceFields,
  });
}

async function main() {
  const databaseUrl = getRequiredEnvironmentVariable('DATABASE_URL');
  assertValidationDatabaseTarget(databaseUrl);
  assertBootstrapConfirmation();

  const ownerEmail = normalizeEmail(
    getRequiredEnvironmentVariable('SAAS_VALIDATION_OWNER_EMAIL'),
  );
  const ownerPassword = getRequiredEnvironmentVariable(
    'SAAS_VALIDATION_OWNER_PASSWORD',
  );
  const platformAdminEmail = normalizeEmail(
    getRequiredEnvironmentVariable('SAAS_VALIDATION_PLATFORM_ADMIN_EMAIL'),
  );
  const platformAdminPassword = getRequiredEnvironmentVariable(
    'SAAS_VALIDATION_PLATFORM_ADMIN_PASSWORD',
  );
  const adminBEmail = normalizeEmail(
    getRequiredEnvironmentVariable('SAAS_VALIDATION_ADMIN_B_EMAIL'),
  );
  const adminBPassword = getRequiredEnvironmentVariable(
    'SAAS_VALIDATION_ADMIN_B_PASSWORD',
  );
  const employeeAEmail = normalizeEmail(
    getRequiredEnvironmentVariable('SAAS_VALIDATION_EMPLOYEE_A_EMAIL'),
  );
  const employeeAPassword = getRequiredEnvironmentVariable(
    'SAAS_VALIDATION_EMPLOYEE_A_PASSWORD',
  );

  if (
    new Set([ownerEmail, platformAdminEmail, adminBEmail, employeeAEmail]).size !==
    4
  ) {
    throw new Error('Validation account email addresses must be distinct.');
  }

  const [
    ownerPasswordHash,
    platformAdminPasswordHash,
    adminBPasswordHash,
    employeeAPasswordHash,
  ] = await Promise.all([
    hashPassword(ownerPassword),
    hashPassword(platformAdminPassword),
    hashPassword(adminBPassword),
    hashPassword(employeeAPassword),
  ]);
  const now = new Date();
  const trialEndsAt = new Date(now);
  trialEndsAt.setUTCDate(trialEndsAt.getUTCDate() + 14);
  const graceEndsAt = new Date(trialEndsAt);
  graceEndsAt.setUTCDate(graceEndsAt.getUTCDate() + 7);

  const result = await prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.upsert({
      where: { slug: VALIDATION_ORGANIZATION_SLUG },
      update: {
        name: 'Konatech SaaS Validation',
        status: OrganizationStatus.ACTIVE,
        timezone: 'Etc/UTC',
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        v1ScopeReasonCode: null,
        v1ScopeReviewedAt: now,
      },
      create: {
        name: 'Konatech SaaS Validation',
        slug: VALIDATION_ORGANIZATION_SLUG,
        status: OrganizationStatus.ACTIVE,
        timezone: 'Etc/UTC',
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        v1ScopeReviewedAt: now,
      },
    });

    const owner = await transaction.user.upsert({
      where: { normalizedEmail: ownerEmail },
      update: { status: UserStatus.ACTIVE },
      create: {
        normalizedEmail: ownerEmail,
        passwordHash: ownerPasswordHash,
        status: UserStatus.ACTIVE,
      },
    });

    const membership = await transaction.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: owner.id,
        },
      },
      update: {
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
      create: {
        organizationId: organization.id,
        userId: owner.id,
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    });

    const employee = await transaction.employee.upsert({
      where: {
        organizationId_email: {
          organizationId: organization.id,
          email: ownerEmail,
        },
      },
      update: {
        employeeIdentifier: VALIDATION_OWNER_IDENTIFIER,
        firstName: 'SaaS',
        lastName: 'Owner',
        role: 'Organization Owner',
        accessRole: AccessRole.ADMIN,
        passwordHash: ownerPasswordHash,
        department: 'Validation',
        isActive: true,
        userId: owner.id,
      },
      create: {
        employeeIdentifier: VALIDATION_OWNER_IDENTIFIER,
        firstName: 'SaaS',
        lastName: 'Owner',
        email: ownerEmail,
        role: 'Organization Owner',
        accessRole: AccessRole.ADMIN,
        passwordHash: ownerPasswordHash,
        department: 'Validation',
        isActive: true,
        userId: owner.id,
        organizationId: organization.id,
      },
    });

    const subscription = await transaction.organizationSubscription.upsert({
      where: { organizationId: organization.id },
      update: {
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.TRIALING,
        pendingPlan: null,
        pendingPlanAt: null,
      },
      create: {
        organizationId: organization.id,
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.TRIALING,
        startsAt: now,
        endsAt: trialEndsAt,
        graceEndsAt,
        trialUsedAt: now,
      },
    });

    const platformUser = await transaction.user.upsert({
      where: { normalizedEmail: platformAdminEmail },
      update: { status: UserStatus.ACTIVE },
      create: {
        normalizedEmail: platformAdminEmail,
        passwordHash: platformAdminPasswordHash,
        status: UserStatus.ACTIVE,
      },
    });

    const platformAdmin = await transaction.platformAdmin.upsert({
      where: { userId: platformUser.id },
      update: { isActive: true },
      create: {
        userId: platformUser.id,
        isActive: true,
      },
    });

    const organizationB = await transaction.organization.upsert({
      where: { slug: VALIDATION_SECOND_ORGANIZATION_SLUG },
      update: {
        name: 'Konatech SaaS Validation B',
        status: OrganizationStatus.ACTIVE,
        timezone: 'Etc/UTC',
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        v1ScopeReasonCode: null,
        v1ScopeReviewedAt: now,
      },
      create: {
        name: 'Konatech SaaS Validation B',
        slug: VALIDATION_SECOND_ORGANIZATION_SLUG,
        status: OrganizationStatus.ACTIVE,
        timezone: 'Etc/UTC',
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        v1ScopeReviewedAt: now,
      },
    });

    const adminB = await transaction.user.upsert({
      where: { normalizedEmail: adminBEmail },
      update: { status: UserStatus.ACTIVE },
      create: {
        normalizedEmail: adminBEmail,
        passwordHash: adminBPasswordHash,
        status: UserStatus.ACTIVE,
      },
    });
    await transaction.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: organizationB.id,
          userId: adminB.id,
        },
      },
      update: {
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
      create: {
        organizationId: organizationB.id,
        userId: adminB.id,
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    });

    const employeeUser = await transaction.user.upsert({
      where: { normalizedEmail: employeeAEmail },
      update: { status: UserStatus.ACTIVE },
      create: {
        normalizedEmail: employeeAEmail,
        passwordHash: employeeAPasswordHash,
        status: UserStatus.ACTIVE,
      },
    });
    await transaction.membership.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: employeeUser.id,
        },
      },
      update: {
        role: MembershipRole.EMPLOYEE,
        status: MembershipStatus.ACTIVE,
      },
      create: {
        organizationId: organization.id,
        userId: employeeUser.id,
        role: MembershipRole.EMPLOYEE,
        status: MembershipStatus.ACTIVE,
      },
    });

    const siteSpecs = [
      { organization, key: 'site-a', name: 'Bureau 1', isActive: true, latitude: 5.359952, longitude: -4.008256 },
      { organization, key: 'site-b', name: 'Bureau 2', isActive: true, latitude: 5.3605, longitude: -4.009 },
      { organization, key: 'site-c', name: 'Bureau 3', isActive: true, latitude: 5.361, longitude: -4.01 },
      { organization, key: 'site-inactive', name: 'Bureau Archive', isActive: false, latitude: 5.362, longitude: -4.011 },
      { organization: organizationB, key: 'site-x', name: 'Bureau X', isActive: true, latitude: 5.4, longitude: -4.1 },
    ] as const;
    const sites = new Map<string, { id: string; organizationId: string; name: string; isActive: boolean }>();

    for (const spec of siteSpecs) {
      const site = await transaction.attendanceSite.upsert({
        where: {
          organizationId_name: {
            organizationId: spec.organization.id,
            name: spec.name,
          },
        },
        update: {
          latitude: spec.latitude,
          longitude: spec.longitude,
          allowedRadiusMeters: 150,
          isActive: spec.isActive,
        },
        create: {
          organizationId: spec.organization.id,
          name: spec.name,
          latitude: spec.latitude,
          longitude: spec.longitude,
          allowedRadiusMeters: 150,
          isActive: spec.isActive,
        },
      });
      sites.set(spec.key, site);
    }

    const activeOrgBSubscriptionEnd = new Date(now);
    activeOrgBSubscriptionEnd.setUTCFullYear(now.getUTCFullYear() + 1);
    await transaction.organizationSubscription.upsert({
      where: { organizationId: organizationB.id },
      update: {
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        startsAt: now,
        endsAt: activeOrgBSubscriptionEnd,
        graceEndsAt: activeOrgBSubscriptionEnd,
        trialUsedAt: now,
      },
      create: {
        organizationId: organizationB.id,
        plan: SubscriptionPlan.PRO,
        status: SubscriptionStatus.ACTIVE,
        startsAt: now,
        endsAt: activeOrgBSubscriptionEnd,
        graceEndsAt: activeOrgBSubscriptionEnd,
        trialUsedAt: now,
      },
    });

    const scheduleSpecs = [
      { organization, siteKey: 'site-a', key: 'schedule-a', name: 'Planning Bureau 1', startTime: '08:00', endTime: '17:00' },
      { organization, siteKey: 'site-b', key: 'schedule-b', name: 'Planning Bureau 2', startTime: '09:00', endTime: '18:00' },
      { organization, siteKey: 'site-c', key: 'schedule-c', name: 'Planning Bureau 3', startTime: '07:00', endTime: '16:00' },
      { organization: organizationB, siteKey: 'site-x', key: 'schedule-x', name: 'Planning Bureau X', startTime: '10:00', endTime: '19:00' },
    ] as const;
    const schedules = new Map<string, { id: string; name: string; startTime: string; endTime: string; workDays: Prisma.JsonValue }>();

    for (const spec of scheduleSpecs) {
      const site = sites.get(spec.siteKey)!;
      const schedule = await transaction.schedule.upsert({
        where: {
          organizationId_name: {
            organizationId: spec.organization.id,
            name: spec.name,
          },
        },
        update: {
          siteId: site.id,
          startTime: spec.startTime,
          endTime: spec.endTime,
          latenessMarginMinutes: 5,
          isActive: true,
          workDays: [...WORK_DAYS],
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
          v1ScopeReasonCode: null,
          v1ScopeReviewedAt: now,
        },
        create: {
          organizationId: spec.organization.id,
          siteId: site.id,
          name: spec.name,
          startTime: spec.startTime,
          endTime: spec.endTime,
          latenessMarginMinutes: 5,
          isActive: true,
          workDays: [...WORK_DAYS],
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
          v1ScopeReviewedAt: now,
        },
      });
      schedules.set(spec.key, schedule);
    }

    const employeeSpecs = [
      { organization, key: 'employee-a1', identifier: 'SAAS-VALIDATION-A1', email: employeeAEmail, firstName: 'Employee', lastName: 'A1', siteKey: 'site-b', scheduleKey: 'schedule-b', userId: employeeUser.id },
      { organization, key: 'employee-a2', identifier: 'SAAS-VALIDATION-A2', email: 'employee.a2.saas-validation@konatech.local', firstName: 'Employee', lastName: 'A2', siteKey: 'site-a', scheduleKey: 'schedule-a', userId: null },
      { organization, key: 'employee-b1', identifier: 'SAAS-VALIDATION-B1', email: 'employee.b1.saas-validation@konatech.local', firstName: 'Employee', lastName: 'B1', siteKey: 'site-b', scheduleKey: 'schedule-b', userId: null },
      { organization, key: 'employee-c1', identifier: 'SAAS-VALIDATION-C1', email: 'employee.c1.saas-validation@konatech.local', firstName: 'Employee', lastName: 'C1', siteKey: 'site-c', scheduleKey: 'schedule-c', userId: null },
      { organization: organizationB, key: 'employee-x1', identifier: 'SAAS-VALIDATION-X1', email: 'employee.x1.saas-validation@konatech.local', firstName: 'Employee', lastName: 'X1', siteKey: 'site-x', scheduleKey: 'schedule-x', userId: null },
    ] as const;
    const employees = new Map<string, { id: string; organizationId: string; email: string; firstName: string; lastName: string }>();

    for (const spec of employeeSpecs) {
      const site = sites.get(spec.siteKey)!;
      const schedule = schedules.get(spec.scheduleKey)!;
      const profilePasswordHash = spec.userId
        ? employeeAPasswordHash
        : await hashPassword(randomBytes(32).toString('hex'));
      const profile = await transaction.employee.upsert({
        where: {
          organizationId_email: {
            organizationId: spec.organization.id,
            email: spec.email,
          },
        },
        update: {
          employeeIdentifier: spec.identifier,
          firstName: spec.firstName,
          lastName: spec.lastName,
          role: 'Employee',
          accessRole: AccessRole.EMPLOYEE,
          department: 'Validation',
          isActive: true,
          userId: spec.userId,
          primarySiteId: site.id,
          scheduleId: schedule.id,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
          v1ScopeReasonCode: null,
          v1ScopeReviewedAt: now,
        },
        create: {
          employeeIdentifier: spec.identifier,
          firstName: spec.firstName,
          lastName: spec.lastName,
          email: spec.email,
          role: 'Employee',
          accessRole: AccessRole.EMPLOYEE,
          passwordHash: profilePasswordHash,
          department: 'Validation',
          isActive: true,
          userId: spec.userId,
          organizationId: spec.organization.id,
          primarySiteId: site.id,
          scheduleId: schedule.id,
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
          v1ScopeReviewedAt: now,
        },
      });
      employees.set(spec.key, profile);
    }

    const juneFirst = validationDate(2026, 6, 1);
    const septemberSixteenth = validationDate(2026, 9, 16);
    const assignmentSpecs = [
      { organization, organizationSlug: VALIDATION_ORGANIZATION_SLUG, employeeKey: 'employee-a1', siteKey: 'site-a', scheduleKey: 'schedule-a', effectiveFrom: juneFirst, effectiveTo: septemberSixteenth },
      { organization, organizationSlug: VALIDATION_ORGANIZATION_SLUG, employeeKey: 'employee-a1', siteKey: 'site-b', scheduleKey: 'schedule-b', effectiveFrom: septemberSixteenth, effectiveTo: null },
      { organization, organizationSlug: VALIDATION_ORGANIZATION_SLUG, employeeKey: 'employee-a2', siteKey: 'site-a', scheduleKey: 'schedule-a', effectiveFrom: juneFirst, effectiveTo: null },
      { organization, organizationSlug: VALIDATION_ORGANIZATION_SLUG, employeeKey: 'employee-b1', siteKey: 'site-b', scheduleKey: 'schedule-b', effectiveFrom: juneFirst, effectiveTo: null },
      { organization, organizationSlug: VALIDATION_ORGANIZATION_SLUG, employeeKey: 'employee-c1', siteKey: 'site-c', scheduleKey: 'schedule-c', effectiveFrom: juneFirst, effectiveTo: null },
      { organization: organizationB, organizationSlug: VALIDATION_SECOND_ORGANIZATION_SLUG, employeeKey: 'employee-x1', siteKey: 'site-x', scheduleKey: 'schedule-x', effectiveFrom: juneFirst, effectiveTo: null },
    ] as const;
    const assignments = new Map<string, { id: string }>();

    for (const spec of assignmentSpecs) {
      const employee = employees.get(spec.employeeKey)!;
      const site = sites.get(spec.siteKey)!;
      const schedule = schedules.get(spec.scheduleKey)!;
      const assignment = await upsertValidationAssignment(transaction, {
        organizationId: spec.organization.id,
        organizationSlug: spec.organizationSlug,
        employeeId: employee.id,
        employeeKey: spec.employeeKey,
        siteId: site.id,
        siteKey: spec.siteKey,
        scheduleId: schedule.id,
        effectiveFrom: spec.effectiveFrom,
        effectiveTo: spec.effectiveTo,
      });
      assignments.set(`${spec.employeeKey}:${spec.siteKey}`, assignment);
    }

    const attendanceSpecs = [
      { organization, employeeKey: 'employee-a1', siteKey: 'site-a', scheduleKey: 'schedule-a', date: validationDate(2026, 7, 1), status: AttendanceStatus.PRESENT, minutesLate: 0 },
      { organization, employeeKey: 'employee-a1', siteKey: 'site-a', scheduleKey: 'schedule-a', date: validationDate(2026, 7, 10), status: AttendanceStatus.LATE, minutesLate: 18 },
      { organization, employeeKey: 'employee-a2', siteKey: 'site-a', scheduleKey: 'schedule-a', date: validationDate(2026, 7, 1), status: AttendanceStatus.PRESENT, minutesLate: 0 },
      { organization, employeeKey: 'employee-b1', siteKey: 'site-b', scheduleKey: 'schedule-b', date: validationDate(2026, 7, 1), status: AttendanceStatus.LATE, minutesLate: 25 },
      { organization, employeeKey: 'employee-b1', siteKey: 'site-b', scheduleKey: 'schedule-b', date: validationDate(2026, 7, 10), status: AttendanceStatus.PRESENT, minutesLate: 0 },
      { organization, employeeKey: 'employee-c1', siteKey: 'site-c', scheduleKey: 'schedule-c', date: validationDate(2026, 7, 10), status: AttendanceStatus.PRESENT, minutesLate: 0 },
      { organization: organizationB, employeeKey: 'employee-x1', siteKey: 'site-x', scheduleKey: 'schedule-x', date: validationDate(2026, 7, 1), status: AttendanceStatus.PRESENT, minutesLate: 0 },
      { organization: organizationB, employeeKey: 'employee-x1', siteKey: 'site-x', scheduleKey: 'schedule-x', date: validationDate(2026, 7, 10), status: AttendanceStatus.LATE, minutesLate: 12 },
      { organization, employeeKey: 'employee-a1', siteKey: 'site-a', scheduleKey: 'schedule-a', date: validationDate(2026, 9, 10), status: AttendanceStatus.PRESENT, minutesLate: 0 },
      { organization, employeeKey: 'employee-a1', siteKey: 'site-b', scheduleKey: 'schedule-b', date: validationDate(2026, 9, 20), status: AttendanceStatus.LATE, minutesLate: 9 },
    ] as const;

    for (const spec of attendanceSpecs) {
      const employee = employees.get(spec.employeeKey)!;
      const site = sites.get(spec.siteKey)!;
      const schedule = schedules.get(spec.scheduleKey)!;
      const assignment = assignments.get(`${spec.employeeKey}:${spec.siteKey}`)!;
      await upsertValidationAttendance(transaction, {
        organizationId: spec.organization.id,
        employeeId: employee.id,
        attendanceSiteId: site.id,
        assignmentId: assignment.id,
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        workDays: WORK_DAYS,
        date: spec.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        status: spec.status,
        minutesLate: spec.minutesLate,
      });
    }

    return {
      organizationId: organization.id,
      organizationBId: organizationB.id,
      ownerUserId: owner.id,
      ownerEmployeeId: employee.id,
      membershipId: membership.id,
      subscriptionId: subscription.organizationId,
      platformAdminId: platformAdmin.id,
      activeSiteCount: 4,
      inactiveSiteCount: 1,
      operationalEmployeeCount: employeeSpecs.length,
      attendanceCount: attendanceSpecs.length,
    };
  });

  console.log(
    `SaaS validation fixture complete: organizations=${result.organizationId},${result.organizationBId}; activeSites=${result.activeSiteCount}; inactiveSites=${result.inactiveSiteCount}; operationalEmployees=${result.operationalEmployeeCount}; attendanceRecords=${result.attendanceCount}; admin=${result.ownerUserId}; platformAdmin=${result.platformAdminId}.`,
  );
}

main()
  .catch((error) => {
    console.error(
      `SaaS validation bootstrap failed: ${getSafeErrorSummary(error)}.`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

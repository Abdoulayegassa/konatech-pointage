import 'dotenv/config';
import {
  AccessRole,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  PrismaClient,
  SanctionRuleType,
  UserStatus,
} from '@prisma/client';

const HISTORICAL_ORGANIZATION_NAME = 'Konatech Pointage';
const HISTORICAL_ORGANIZATION_SLUG = 'konatech';
const HISTORICAL_ORGANIZATION_TIMEZONE = 'Etc/UTC';

const DEFAULT_SANCTION_RULE_CODES = [
  {
    id: '6cb80c4d-b5d5-4e17-a74d-3f47b65a0001',
    type: SanctionRuleType.MINOR_LATENESS,
    code: 'MINOR_LATENESS_DEFAULT',
  },
  {
    id: '0cf3b2be-fc1d-4b3d-8b8b-3f47b65a0002',
    type: SanctionRuleType.MAJOR_LATENESS,
    code: 'MAJOR_LATENESS_DEFAULT',
  },
] as const;

type BackfillOptions = {
  ownerEmployeeId: string;
  timezone: string;
  forceRollback?: boolean;
};

type ModelCounts = {
  employees: number;
  schedules: number;
  attendances: number;
  calendarEntries: number;
  sanctionRules: number;
};

export async function backfillSaasFoundation(
  prisma: PrismaClient,
  options: BackfillOptions,
) {
  const ownerEmployeeId = options.ownerEmployeeId.trim();
  const timezone = options.timezone.trim();

  if (!ownerEmployeeId) {
    throw new Error('SAAS_OWNER_EMPLOYEE_ID is required.');
  }

  if (!timezone) {
    throw new Error(
      'SAAS_HISTORICAL_ORGANIZATION_TIMEZONE is required and must be an IANA timezone.',
    );
  }

  assertIanaTimezone(timezone);

  if (timezone !== HISTORICAL_ORGANIZATION_TIMEZONE) {
    throw new Error(
      `The historical Organization timezone must be ${HISTORICAL_ORGANIZATION_TIMEZONE}, matching the repository's UTC attendance conventions.`,
    );
  }

  return prisma.$transaction(
    async (transaction) => {
      const beforeCounts = await getModelCounts(transaction);
      const employees = await transaction.employee.findMany({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          email: true,
          passwordHash: true,
          accessRole: true,
          isActive: true,
          organizationId: true,
          userId: true,
        },
      });

      if (employees.length === 0) {
        throw new Error('No legacy employees were found to migrate.');
      }

      const ownerEmployee = employees.find(
        (employee) => employee.id === ownerEmployeeId,
      );

      if (!ownerEmployee) {
        throw new Error(
          `The selected owner employee ${ownerEmployeeId} does not exist.`,
        );
      }

      if (ownerEmployee.accessRole !== AccessRole.ADMIN) {
        throw new Error('The selected owner employee must be an ADMIN.');
      }

      if (!ownerEmployee.isActive) {
        throw new Error('The selected owner employee must be active.');
      }

      const deterministicIdentities = employees.filter(
        hasDeterministicLoginIdentity,
      );
      assertNormalizedEmailsAreUnique(deterministicIdentities);

      if (!hasDeterministicLoginIdentity(ownerEmployee)) {
        throw new Error(
          'The selected owner employee does not have a deterministic login identity.',
        );
      }

      const organization = await resolveHistoricalOrganization(
        transaction,
        timezone,
      );

      await assertNoForeignTenantAssignments(transaction, organization.id);

      await transaction.$executeRaw`
        UPDATE "Schedule"
        SET "organizationId" = ${organization.id}
        WHERE "organizationId" IS NULL
      `;

      const migratedUsers: Array<{
        employeeId: string;
        userId: string;
        normalizedEmail: string;
        membershipRole: MembershipRole;
        membershipStatus: MembershipStatus;
      }> = [];

      for (const employee of employees) {
        if (!hasDeterministicLoginIdentity(employee)) {
          if (employee.userId) {
            throw new Error(
              `Employee ${employee.id} has no deterministic login identity but is already linked to User ${employee.userId}.`,
            );
          }

          await transaction.$executeRaw`
            UPDATE "Employee"
            SET "organizationId" = ${organization.id}
            WHERE id = ${employee.id}
          `;
          continue;
        }

        const normalizedEmail = normalizeEmail(employee.email);
        const expectedUserStatus = employee.isActive
          ? UserStatus.ACTIVE
          : UserStatus.DISABLED;
        const user = await transaction.user.findUnique({
          where: { normalizedEmail },
          select: {
            id: true,
            passwordHash: true,
            status: true,
            userVersion: true,
          },
        });
        if (user && employee.userId !== user.id) {
          throw new Error(
            `User ${normalizedEmail} already exists but is not deterministically linked to Employee ${employee.id}.`,
          );
        }

        if (employee.userId && !user) {
          throw new Error(
            `Employee ${employee.id} references User ${employee.userId}, but no User with normalized email ${normalizedEmail} exists.`,
          );
        }

        const resolvedUser = user
          ? validateExistingUser(
              user,
              employee.passwordHash,
              expectedUserStatus,
              normalizedEmail,
            )
          : await transaction.user.create({
              data: {
                normalizedEmail,
                passwordHash: employee.passwordHash,
                status: expectedUserStatus,
                userVersion: 1,
              },
              select: {
                id: true,
                passwordHash: true,
                status: true,
                userVersion: true,
              },
            });

        if (resolvedUser.passwordHash !== employee.passwordHash) {
          throw new Error(
            `Password hash preservation failed for Employee ${employee.id}.`,
          );
        }

        if (employee.userId && employee.userId !== resolvedUser.id) {
          throw new Error(
            `Employee ${employee.id} is already linked to another User.`,
          );
        }

        await transaction.$executeRaw`
          UPDATE "Employee"
          SET "organizationId" = ${organization.id},
              "userId" = ${resolvedUser.id}
          WHERE id = ${employee.id}
        `;

        const membershipRole = resolveMembershipRole(
          employee.id,
          ownerEmployeeId,
          employee.accessRole,
        );
        const membershipStatus = employee.isActive
          ? MembershipStatus.ACTIVE
          : MembershipStatus.SUSPENDED;
        const membership = await transaction.membership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: organization.id,
              userId: resolvedUser.id,
            },
          },
          select: {
            role: true,
            status: true,
            membershipVersion: true,
          },
        });

        if (membership) {
          if (
            membership.role !== membershipRole ||
            membership.status !== membershipStatus ||
            membership.membershipVersion !== 1
          ) {
            throw new Error(
              `Existing Membership for ${normalizedEmail} does not match the deterministic migration mapping.`,
            );
          }
        } else {
          await transaction.membership.create({
            data: {
              organizationId: organization.id,
              userId: resolvedUser.id,
              role: membershipRole,
              status: membershipStatus,
              membershipVersion: 1,
            },
          });
        }

        migratedUsers.push({
          employeeId: employee.id,
          userId: resolvedUser.id,
          normalizedEmail,
          membershipRole,
          membershipStatus,
        });
      }

      await transaction.$executeRaw`
        UPDATE "Attendance"
        SET "organizationId" = ${organization.id}
        WHERE "organizationId" IS NULL
      `;
      await transaction.$executeRaw`
        UPDATE "CalendarEntry"
        SET "organizationId" = ${organization.id}
        WHERE "organizationId" IS NULL
      `;
      await transaction.$executeRaw`
        UPDATE "SanctionRule"
        SET "organizationId" = ${organization.id}
        WHERE "organizationId" IS NULL
      `;

      await assignStableSanctionRuleCodes(transaction, organization.id);
      await assertTenantConsistency(transaction, organization.id);

      const afterCounts = await getModelCounts(transaction);
      assertCountsUnchanged(beforeCounts, afterCounts);

      const ownerMembershipCount = await transaction.membership.count({
        where: {
          organizationId: organization.id,
          role: MembershipRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });

      if (ownerMembershipCount !== 1) {
        throw new Error(
          `Expected exactly one active OWNER Membership, found ${ownerMembershipCount}.`,
        );
      }

      if (options.forceRollback) {
        throw new Error('Forced rollback requested for migration validation.');
      }

      return {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          timezone: organization.timezone,
        },
        owner: migratedUsers.find(
          (entry) => entry.employeeId === ownerEmployeeId,
        ),
        beforeCounts,
        afterCounts,
        users: migratedUsers.length,
        memberships: migratedUsers.length,
      };
    },
    {
      maxWait: 10_000,
      timeout: 120_000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

async function resolveHistoricalOrganization(
  transaction: Prisma.TransactionClient,
  timezone: string,
) {
  const existing = await transaction.organization.findUnique({
    where: { slug: HISTORICAL_ORGANIZATION_SLUG },
  });

  if (existing) {
    if (
      existing.name !== HISTORICAL_ORGANIZATION_NAME ||
      existing.timezone !== timezone ||
      existing.status !== OrganizationStatus.ACTIVE
    ) {
      throw new Error(
        'The existing konatech Organization does not match the historical migration configuration.',
      );
    }

    return existing;
  }

  return transaction.organization.create({
    data: {
      name: HISTORICAL_ORGANIZATION_NAME,
      slug: HISTORICAL_ORGANIZATION_SLUG,
      status: OrganizationStatus.ACTIVE,
      timezone,
    },
  });
}

async function assertNoForeignTenantAssignments(
  transaction: Prisma.TransactionClient,
  organizationId: string,
) {
  const [employees, schedules, attendances, calendarEntries, sanctionRules] =
    await Promise.all([
      transaction.employee.count({
        where: { organizationId: { not: null, notIn: [organizationId] } },
      }),
      transaction.schedule.count({
        where: { organizationId: { not: null, notIn: [organizationId] } },
      }),
      transaction.attendance.count({
        where: { organizationId: { not: null, notIn: [organizationId] } },
      }),
      transaction.calendarEntry.count({
        where: { organizationId: { not: null, notIn: [organizationId] } },
      }),
      transaction.sanctionRule.count({
        where: { organizationId: { not: null, notIn: [organizationId] } },
      }),
    ]);

  if (employees || schedules || attendances || calendarEntries || sanctionRules) {
    throw new Error(
      'Foreign tenant assignments already exist; refusing a single-tenant historical backfill.',
    );
  }
}

async function assignStableSanctionRuleCodes(
  transaction: Prisma.TransactionClient,
  organizationId: string,
) {
  for (const mapping of DEFAULT_SANCTION_RULE_CODES) {
    const rule = await transaction.sanctionRule.findUnique({
      where: { id: mapping.id },
      select: { id: true, type: true, code: true, organizationId: true },
    });

    if (!rule) {
      continue;
    }

    if (
      rule.type !== mapping.type ||
      rule.organizationId !== organizationId
    ) {
      throw new Error(
        `Default SanctionRule ${mapping.id} does not match its deterministic mapping.`,
      );
    }

    if (rule.code && rule.code !== mapping.code) {
      throw new Error(
        `Default SanctionRule ${mapping.id} already has an unexpected code.`,
      );
    }

    if (!rule.code) {
      await transaction.$executeRaw`
        UPDATE "SanctionRule"
        SET code = ${mapping.code}
        WHERE id = ${rule.id}
      `;
    }
  }
}

async function assertTenantConsistency(
  transaction: Prisma.TransactionClient,
  organizationId: string,
) {
  const [
    employeesWithoutTenant,
    schedulesWithoutTenant,
    attendancesWithoutTenant,
    calendarEntriesWithoutTenant,
    sanctionRulesWithoutTenant,
    attendanceMismatches,
    scheduleMismatches,
    calendarMismatches,
  ] = await Promise.all([
    transaction.employee.count({ where: { organizationId: null } }),
    transaction.schedule.count({ where: { organizationId: null } }),
    transaction.attendance.count({ where: { organizationId: null } }),
    transaction.calendarEntry.count({ where: { organizationId: null } }),
    transaction.sanctionRule.count({ where: { organizationId: null } }),
    transaction.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Attendance" attendance
      JOIN "Employee" employee ON employee.id = attendance."employeeId"
      WHERE attendance."organizationId" IS DISTINCT FROM employee."organizationId"
    `,
    transaction.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "Employee" employee
      JOIN "Schedule" schedule ON schedule.id = employee."scheduleId"
      WHERE employee."organizationId" IS DISTINCT FROM schedule."organizationId"
    `,
    transaction.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "CalendarEntry" entry
      JOIN "Employee" employee ON employee.id = entry."employeeId"
      WHERE entry."organizationId" IS DISTINCT FROM employee."organizationId"
    `,
  ]);

  if (
    employeesWithoutTenant ||
    schedulesWithoutTenant ||
    attendancesWithoutTenant ||
    calendarEntriesWithoutTenant ||
    sanctionRulesWithoutTenant ||
    Number(attendanceMismatches[0]?.count ?? 0n) ||
    Number(scheduleMismatches[0]?.count ?? 0n) ||
    Number(calendarMismatches[0]?.count ?? 0n)
  ) {
    throw new Error('Tenant consistency validation failed.');
  }

  const tenantCounts = await Promise.all([
    transaction.employee.count({ where: { organizationId } }),
    transaction.schedule.count({ where: { organizationId } }),
    transaction.attendance.count({ where: { organizationId } }),
    transaction.calendarEntry.count({ where: { organizationId } }),
    transaction.sanctionRule.count({ where: { organizationId } }),
  ]);
  const allCounts = Object.values(await getModelCounts(transaction));

  if (tenantCounts.some((count, index) => count !== allCounts[index])) {
    throw new Error('Not every legacy record belongs to the historical tenant.');
  }
}

async function getModelCounts(
  transaction: Prisma.TransactionClient,
): Promise<ModelCounts> {
  const [employees, schedules, attendances, calendarEntries, sanctionRules] =
    await Promise.all([
      transaction.employee.count(),
      transaction.schedule.count(),
      transaction.attendance.count(),
      transaction.calendarEntry.count(),
      transaction.sanctionRule.count(),
    ]);

  return {
    employees,
    schedules,
    attendances,
    calendarEntries,
    sanctionRules,
  };
}

function assertCountsUnchanged(before: ModelCounts, after: ModelCounts) {
  for (const key of Object.keys(before) as Array<keyof ModelCounts>) {
    if (before[key] !== after[key]) {
      throw new Error(
        `${key} count changed from ${before[key]} to ${after[key]}.`,
      );
    }
  }
}

function assertNormalizedEmailsAreUnique(
  employees: Array<{ id: string; email: string }>,
) {
  const employeeIdByEmail = new Map<string, string>();

  for (const employee of employees) {
    const normalizedEmail = normalizeEmail(employee.email);
    const existingEmployeeId = employeeIdByEmail.get(normalizedEmail);

    if (existingEmployeeId && existingEmployeeId !== employee.id) {
      throw new Error(
        `Employees ${existingEmployeeId} and ${employee.id} share normalized email ${normalizedEmail}.`,
      );
    }

    employeeIdByEmail.set(normalizedEmail, employee.id);
  }
}

function hasDeterministicLoginIdentity(employee: {
  email: string;
  passwordHash: string;
}) {
  const email = employee.email.trim();

  return Boolean(
    email &&
      email.includes('@') &&
      employee.passwordHash.length > 0,
  );
}

function validateExistingUser(
  user: {
    id: string;
    passwordHash: string;
    status: UserStatus;
    userVersion: number;
  },
  passwordHash: string,
  status: UserStatus,
  normalizedEmail: string,
) {
  if (
    user.passwordHash !== passwordHash ||
    user.status !== status ||
    user.userVersion !== 1
  ) {
    throw new Error(
      `Existing User ${normalizedEmail} does not match the deterministic legacy identity mapping.`,
    );
  }

  return user;
}

function resolveMembershipRole(
  employeeId: string,
  ownerEmployeeId: string,
  accessRole: AccessRole,
) {
  if (employeeId === ownerEmployeeId) {
    return MembershipRole.OWNER;
  }

  return accessRole === AccessRole.ADMIN
    ? MembershipRole.ADMIN
    : MembershipRole.MEMBER;
}

function normalizeEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    throw new Error(`Employee email ${email} cannot be normalized safely.`);
  }

  return normalizedEmail;
}

function assertIanaTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new Error(`${timezone} is not a valid IANA timezone.`);
  }
}

async function main() {
  const prisma = new PrismaClient();

  try {
    const result = await backfillSaasFoundation(prisma, {
      ownerEmployeeId: process.env.SAAS_OWNER_EMPLOYEE_ID ?? '',
      timezone:
        process.env.SAAS_HISTORICAL_ORGANIZATION_TIMEZONE ?? '',
      forceRollback: process.env.SAAS_BACKFILL_FORCE_ROLLBACK === 'true',
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(
      'SaaS foundation backfill failed:',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
  });
}

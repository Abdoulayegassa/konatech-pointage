import { Prisma, V1OperationalScopeStatus } from '@prisma/client';

/**
 * The Phase 2D scope state is a server-side safety boundary.  Tenant data
 * imported before a site relationship is proven must not silently re-enter
 * V1 operational workflows merely because it has an organization id.
 *
 * Legacy (pre-SaaS) requests deliberately keep their existing null-tenant
 * compatibility path.  Every authenticated SaaS organization path uses the
 * OPERATIONAL predicate below.
 */
export const OPERATIONAL_SCOPE = V1OperationalScopeStatus.OPERATIONAL;

export function employeeOperationalWhere(
  organizationId?: string,
): Prisma.EmployeeWhereInput {
  return organizationId
    ? { organizationId, v1ScopeStatus: OPERATIONAL_SCOPE }
    : { organizationId: null, userId: null };
}

export function scheduleOperationalWhere(
  organizationId?: string,
): Prisma.ScheduleWhereInput {
  return organizationId
    ? { organizationId, v1ScopeStatus: OPERATIONAL_SCOPE }
    : { organizationId: null };
}

export function attendanceOperationalWhere(
  organizationId?: string,
): Prisma.AttendanceWhereInput {
  return organizationId
    ? {
        organizationId,
        v1ScopeStatus: OPERATIONAL_SCOPE,
        employee: { is: employeeOperationalWhere(organizationId) },
      }
    : {
        organizationId: null,
        employee: { is: employeeOperationalWhere() },
      };
}

export function calendarOperationalWhere(
  organizationId?: string,
): Prisma.CalendarEntryWhereInput {
  if (!organizationId) {
    return {
      organizationId: null,
      OR: [
        { employeeId: null },
        { employee: { is: employeeOperationalWhere() } },
      ],
    };
  }

  return {
    organizationId,
    v1ScopeStatus: OPERATIONAL_SCOPE,
    OR: [
      { employeeId: null },
      { employee: { is: employeeOperationalWhere(organizationId) } },
    ],
  };
}

export function sanctionRuleOperationalWhere(
  organizationId?: string,
): Prisma.SanctionRuleWhereInput {
  return organizationId
    ? { organizationId, siteId: null, v1ScopeStatus: OPERATIONAL_SCOPE }
    : { organizationId: null, siteId: null };
}

/** Scope written by newly-authorized SaaS operations; never use this for data migration. */
export function operationalScopeCreateData(organizationId?: string) {
  return organizationId ? { v1ScopeStatus: OPERATIONAL_SCOPE } : {};
}

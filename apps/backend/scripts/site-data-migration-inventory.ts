import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

type ReviewItem = {
  category: string;
  id: string;
  reason: string;
  organizationId?: string | null;
  employeeId?: string | null;
};

function assertSafeInventoryTarget(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  const databaseName = parsed.pathname.replace(/^\//, '').split('?')[0];
  const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(
    parsed.hostname,
  );
  const forbiddenName = /(prod|production|staging|stage)/i.test(databaseName);

  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !isLoopback ||
    forbiddenName
  ) {
    throw new Error(
      'Refusing site-data inventory outside a local, non-production PostgreSQL database.',
    );
  }
}

function iso(value: Date) {
  return value.toISOString();
}

function recordIds(items: readonly { id: string }[] | readonly string[]) {
  return items.map((item) => (typeof item === 'string' ? item : item.id));
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  assertSafeInventoryTarget(databaseUrl);

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const [organizations, sites, employees, attendances, schedules, calendars, rules, subscriptions] =
      await Promise.all([
        prisma.organization.findMany({
          select: { id: true, name: true, status: true },
          orderBy: { id: 'asc' },
        }),
        prisma.attendanceSite.findMany({
          select: {
            id: true,
            organizationId: true,
            name: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { id: 'asc' },
        }),
        prisma.employee.findMany({
          select: {
            id: true,
            employeeIdentifier: true,
            organizationId: true,
            userId: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { id: 'asc' },
        }),
        prisma.attendance.findMany({
          select: {
            id: true,
            employeeId: true,
            organizationId: true,
            attendanceSiteId: true,
            date: true,
          },
          orderBy: { id: 'asc' },
        }),
        prisma.schedule.findMany({
          select: { id: true, name: true, organizationId: true, isActive: true },
          orderBy: { id: 'asc' },
        }),
        prisma.calendarEntry.findMany({
          select: {
            id: true,
            organizationId: true,
            employeeId: true,
            date: true,
            type: true,
            name: true,
          },
          orderBy: { id: 'asc' },
        }),
        prisma.sanctionRule.findMany({
          select: {
            id: true,
            name: true,
            code: true,
            type: true,
            active: true,
            organizationId: true,
          },
          orderBy: { id: 'asc' },
        }),
        prisma.organizationSubscription.findMany({
          select: { organizationId: true, plan: true, status: true },
          orderBy: { organizationId: 'asc' },
        }),
      ]);

    const sitesByOrganization = new Map<string, typeof sites>();
    for (const site of sites) {
      const bucket = sitesByOrganization.get(site.organizationId) ?? [];
      bucket.push(site);
      sitesByOrganization.set(site.organizationId, bucket);
    }
    const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
    const sitesById = new Map(sites.map((site) => [site.id, site]));
    const review: ReviewItem[] = [];

    const directAttendanceByEmployee = new Map<string, typeof attendances>();
    const attendanceCandidates = attendances.map((attendance) => {
      const employee = employeesById.get(attendance.employeeId);
      const site = attendance.attendanceSiteId
        ? sitesById.get(attendance.attendanceSiteId)
        : undefined;
      const isDirectlyConsistent = Boolean(
        employee &&
          site &&
          attendance.organizationId &&
          employee.organizationId === attendance.organizationId &&
          site.organizationId === attendance.organizationId,
      );

      if (isDirectlyConsistent) {
        const bucket = directAttendanceByEmployee.get(attendance.employeeId) ?? [];
        bucket.push(attendance);
        directAttendanceByEmployee.set(attendance.employeeId, bucket);
        return {
          attendanceId: attendance.id,
          employeeId: attendance.employeeId,
          date: iso(attendance.date),
          organizationId: attendance.organizationId,
          siteId: attendance.attendanceSiteId,
          decision: 'DIRECT_EXISTING_SITE_REFERENCE',
          siteMappingRequiresWrite: false,
          assignmentMappingRequiresEffectiveDateDecision: true,
        };
      }

      const reason = !employee
        ? 'Attendance references a missing employee.'
        : !attendance.organizationId || !attendance.attendanceSiteId
          ? 'Attendance is missing organizationId or attendanceSiteId; current primary-site state is not historical evidence.'
          : 'Attendance organization, employee and site do not agree.';
      review.push({
        category: 'attendance',
        id: attendance.id,
        organizationId: attendance.organizationId,
        employeeId: attendance.employeeId,
        reason,
      });
      return {
        attendanceId: attendance.id,
        employeeId: attendance.employeeId,
        date: iso(attendance.date),
        organizationId: attendance.organizationId,
        siteId: attendance.attendanceSiteId,
        decision: 'HUMAN_REVIEW',
        reason,
      };
    });

    const employeeSiteCandidates = employees.map((employee) => {
      const activeSites = employee.organizationId
        ? (sitesByOrganization.get(employee.organizationId) ?? []).filter(
            (site) => site.isActive,
          )
        : [];
      if (!employee.organizationId) {
        const reason =
          'Employee has no organizationId; neither a primary site nor an assignment can be resolved safely.';
        review.push({
          category: 'employee',
          id: employee.id,
          employeeId: employee.id,
          reason,
        });
        return {
          employeeId: employee.id,
          organizationId: null,
          candidateSiteId: null,
          decision: 'HUMAN_REVIEW',
          reason,
        };
      }
      if (activeSites.length === 1) {
        return {
          employeeId: employee.id,
          organizationId: employee.organizationId,
          candidateSiteId: activeSites[0].id,
          decision: 'DETERMINISTIC_CURRENT_PRIMARY_SITE_CANDIDATE',
          evidence: 'Exactly one active site exists in the employee organization at inventory time.',
          historicalEvidence: false,
          canCreateCutoverAssignmentOnly: true,
        };
      }
      const reason =
        activeSites.length === 0
          ? 'Organization has no active site.'
          : 'Organization has multiple active sites; current primary site is ambiguous.';
      review.push({
        category: 'employee',
        id: employee.id,
        organizationId: employee.organizationId,
        employeeId: employee.id,
        reason,
      });
      return {
        employeeId: employee.id,
        organizationId: employee.organizationId,
        candidateSiteId: null,
        decision: 'HUMAN_REVIEW',
        reason,
      };
    });

    const assignmentEvidenceCandidates = employees.flatMap((employee) => {
      const rows = directAttendanceByEmployee.get(employee.id) ?? [];
      if (rows.length === 0) return [];
      const siteIds = [...new Set(rows.map((row) => row.attendanceSiteId!))].sort();
      const dates = rows.map((row) => row.date).sort((a, b) => a.getTime() - b.getTime());
      const organizationId = employee.organizationId;
      const siteCreatedBeforeFirstEvidence =
        siteIds.length === 1 &&
        sitesById.get(siteIds[0])!.createdAt.getTime() <= dates[0].getTime();

      return [{
        employeeId: employee.id,
        organizationId,
        observedSiteIds: siteIds,
        firstAttendanceEvidenceAt: iso(dates[0]),
        lastAttendanceEvidenceAt: iso(dates[dates.length - 1]),
        evidenceRowCount: rows.length,
        siteCreatedBeforeFirstEvidence,
        decision:
          siteIds.length === 1 && siteCreatedBeforeFirstEvidence
            ? 'SINGLE_SITE_HISTORY_WITH_DATE_BOUNDS'
            : 'HUMAN_REVIEW',
        effectiveFrom: null,
        reason:
          siteIds.length === 1 && siteCreatedBeforeFirstEvidence
            ? 'Attendance proves this site was used during the displayed range, but does not prove an exact assignment start date. Do not create an historical assignment without an approved effective date.'
            : 'Multiple sites or impossible timestamp ordering requires transfer-history review.',
      }];
    });

    const scheduleCandidates = schedules.map((schedule) => {
      const activeSites = schedule.organizationId
        ? (sitesByOrganization.get(schedule.organizationId) ?? []).filter(
            (site) => site.isActive,
          )
        : [];
      if (!schedule.organizationId || activeSites.length !== 1) {
        const reason = !schedule.organizationId
          ? 'Schedule has no organizationId and no siteId.'
          : activeSites.length === 0
            ? 'Schedule organization has no active site.'
            : 'Schedule organization has multiple active sites; schedule scope is ambiguous.';
        review.push({
          category: 'schedule',
          id: schedule.id,
          organizationId: schedule.organizationId,
          reason,
        });
        return { scheduleId: schedule.id, organizationId: schedule.organizationId, siteId: null, decision: 'HUMAN_REVIEW', reason };
      }
      return {
        scheduleId: schedule.id,
        organizationId: schedule.organizationId,
        siteId: activeSites[0].id,
        decision: 'DETERMINISTIC_SINGLE_ACTIVE_SITE_CANDIDATE',
        reason: 'Candidate only; no cross-site duplication is implied.',
      };
    });

    const calendarCandidates = calendars.map((entry) => {
      if (!entry.organizationId) {
        const reason = 'Calendar entry has no organizationId and cannot be placed in an organization or site.';
        review.push({ category: 'calendar', id: entry.id, employeeId: entry.employeeId, reason });
        return { calendarEntryId: entry.id, organizationId: null, siteId: null, decision: 'HUMAN_REVIEW', reason };
      }
      if (entry.type === 'PUBLIC_HOLIDAY') {
        if (entry.employeeId) {
          const reason = 'Public holiday has an employee reference, which violates the future organization-wide holiday constraint.';
          review.push({ category: 'calendar', id: entry.id, organizationId: entry.organizationId, employeeId: entry.employeeId, reason });
          return { calendarEntryId: entry.id, organizationId: entry.organizationId, siteId: null, decision: 'HUMAN_REVIEW', reason };
        }
        return {
          calendarEntryId: entry.id,
          organizationId: entry.organizationId,
          siteId: null,
          decision: 'DETERMINISTIC_ORGANIZATION_WIDE_PUBLIC_HOLIDAY',
        };
      }
      if (entry.type === 'COMPANY_HOLIDAY' && !entry.employeeId) {
        return {
          calendarEntryId: entry.id,
          organizationId: entry.organizationId,
          siteId: null,
          decision: 'DETERMINISTIC_PRESERVE_ORGANIZATION_WIDE_COMPANY_HOLIDAY',
        };
      }
      const reason = !entry.employeeId
        ? 'Calendar entry type requires an employee/site decision.'
        : 'Leave or external mission requires the employee site effective on the event date; current primary site is not historical evidence.';
      review.push({
        category: 'calendar',
        id: entry.id,
        organizationId: entry.organizationId,
        employeeId: entry.employeeId,
        reason,
      });
      return { calendarEntryId: entry.id, organizationId: entry.organizationId, siteId: null, decision: 'HUMAN_REVIEW', reason };
    });

    const sanctionRuleCandidates = rules.map((rule) => {
      if (!rule.organizationId || !rule.code) {
        const reason = !rule.organizationId
          ? 'Sanction rule has no organizationId and cannot become an organization default or site override.'
          : 'Sanction rule has no stable code; override precedence cannot be determined safely.';
        review.push({ category: 'sanctionRule', id: rule.id, organizationId: rule.organizationId, reason });
        return { sanctionRuleId: rule.id, organizationId: rule.organizationId, siteId: null, scope: null, decision: 'HUMAN_REVIEW', reason };
      }
      return {
        sanctionRuleId: rule.id,
        organizationId: rule.organizationId,
        siteId: null,
        scope: 'ORGANIZATION_DEFAULT',
        decision: 'DETERMINISTIC_PRESERVE_EXISTING_ORGANIZATION_SCOPE',
      };
    });

    const organizationsWithoutSites = organizations.filter(
      (organization) => !sitesByOrganization.has(organization.id),
    );
    organizationsWithoutSites.forEach((organization) =>
      review.push({
        category: 'organization',
        id: organization.id,
        organizationId: organization.id,
        reason: 'Organization has no AttendanceSite; active employees and site-scoped resources cannot be migrated.',
      }),
    );

    const multiSiteEmployees = assignmentEvidenceCandidates
      .filter((candidate) => candidate.observedSiteIds.length > 1)
      .map((candidate) => ({
        employeeId: candidate.employeeId,
        siteIds: candidate.observedSiteIds,
        firstAttendanceEvidenceAt: candidate.firstAttendanceEvidenceAt,
        lastAttendanceEvidenceAt: candidate.lastAttendanceEvidenceAt,
      }));
    multiSiteEmployees.forEach((item) =>
      review.push({
        category: 'employee-attendance',
        id: item.employeeId,
        employeeId: item.employeeId,
        reason: 'Employee attendance references multiple sites; transfer effective dates require human review.',
      }),
    );

    const constraintViolations = {
      employeeOrganizationRequired: employeeSiteCandidates
        .filter((candidate) => !candidate.organizationId)
        .map((candidate) => candidate.employeeId),
      employeePrimarySiteRequired: employeeSiteCandidates
        .filter((candidate) => !candidate.candidateSiteId)
        .map((candidate) => candidate.employeeId),
      attendanceOrganizationAndSiteRequired: attendanceCandidates
        .filter((candidate) => candidate.decision === 'HUMAN_REVIEW')
        .map((candidate) => candidate.attendanceId),
      attendanceHistoricalAssignmentRequired: attendances.map((attendance) => attendance.id),
      scheduleOrganizationAndSiteRequired: scheduleCandidates
        .filter((candidate) => candidate.decision === 'HUMAN_REVIEW')
        .map((candidate) => candidate.scheduleId),
      calendarOrganizationAndTypeScopeRequired: calendarCandidates
        .filter((candidate) => candidate.decision === 'HUMAN_REVIEW')
        .map((candidate) => candidate.calendarEntryId),
      sanctionRuleOrganizationAndCodeRequired: sanctionRuleCandidates
        .filter((candidate) => candidate.decision === 'HUMAN_REVIEW')
        .map((candidate) => candidate.sanctionRuleId),
    };

    const blockers = [
      ...(constraintViolations.employeeOrganizationRequired.length
        ? [{ blocker: 'Employees without organization', recordIds: constraintViolations.employeeOrganizationRequired, resolution: 'Human organization assignment; do not infer from names or attendance.' }]
        : []),
      ...(constraintViolations.attendanceOrganizationAndSiteRequired.length
        ? [{ blocker: 'Attendance without complete tenant/site scope', recordIds: constraintViolations.attendanceOrganizationAndSiteRequired, resolution: 'Human evidence is required; current employee/site state cannot be used as historical proof.' }]
        : []),
      ...(organizationsWithoutSites.length
        ? [{ blocker: 'Organizations without sites', recordIds: recordIds(organizationsWithoutSites), resolution: 'Create and approve a real operational site before mapping active resources.' }]
        : []),
      ...(constraintViolations.scheduleOrganizationAndSiteRequired.length
        ? [{ blocker: 'Schedules without deterministic organization/site scope', recordIds: constraintViolations.scheduleOrganizationAndSiteRequired, resolution: 'Human mapping or explicit retirement is required.' }]
        : []),
      ...(constraintViolations.sanctionRuleOrganizationAndCodeRequired.length
        ? [{ blocker: 'Sanction rules without deterministic organization/default scope', recordIds: constraintViolations.sanctionRuleOrganizationAndCodeRequired, resolution: 'Assign organization and stable code, or retire as legacy data.' }]
        : []),
      ...(assignmentEvidenceCandidates.some((candidate) => candidate.decision !== 'SINGLE_SITE_HISTORY_WITH_DATE_BOUNDS')
        ? [{ blocker: 'Historical assignment evidence is incomplete', recordIds: assignmentEvidenceCandidates.filter((candidate) => candidate.decision !== 'SINGLE_SITE_HISTORY_WITH_DATE_BOUNDS').map((candidate) => candidate.employeeId), resolution: 'Review transfer history and approve explicit effective dates.' }]
        : []),
    ];

    const output = {
      generatedAt: new Date().toISOString(),
      target: new URL(databaseUrl).host + new URL(databaseUrl).pathname,
      readOnly: true,
      counts: {
        organizations: organizations.length,
        activeSites: sites.filter((site) => site.isActive).length,
        inactiveSites: sites.filter((site) => !site.isActive).length,
        organizationsWithoutSites: organizationsWithoutSites.length,
        employees: employees.length,
        employeesWithoutOrganization: employees.filter((employee) => !employee.organizationId).length,
        attendance: attendances.length,
        attendanceWithoutOrganization: attendances.filter((row) => !row.organizationId).length,
        attendanceWithoutSite: attendances.filter((row) => !row.attendanceSiteId).length,
        employeesWithAttendanceAcrossMultipleSites: multiSiteEmployees.length,
        schedulesWithoutOrganizationOrSite: scheduleCandidates.filter((candidate) => candidate.decision === 'HUMAN_REVIEW').length,
        calendarEntriesWithoutOrganizationOrSite: calendarCandidates.filter((candidate) => candidate.decision === 'HUMAN_REVIEW').length,
        sanctionRulesWithoutOrganizationOrSite: sanctionRuleCandidates.filter((candidate) => candidate.decision === 'HUMAN_REVIEW').length,
        legacyBusinessSubscriptions: subscriptions.filter((subscription) => subscription.plan === 'BUSINESS').length,
        unresolvedRelationships: review.length,
        migrationBlockers: blockers.length,
      },
      organizations,
      sites,
      deterministicEmployeeToSiteMappings: employeeSiteCandidates.filter(
        (candidate) => candidate.decision === 'DETERMINISTIC_CURRENT_PRIMARY_SITE_CANDIDATE',
      ),
      employeeSiteCandidates,
      historicalEmployeeSiteAssignmentCandidates: assignmentEvidenceCandidates,
      attendanceSiteAndAssignmentCandidates: attendanceCandidates,
      scheduleSiteCandidates: scheduleCandidates,
      calendarSiteCandidates: calendarCandidates,
      sanctionRuleScopeCandidates: sanctionRuleCandidates,
      employeesWithAttendanceAcrossMultipleSites: multiSiteEmployees,
      organizationsWithoutSites,
      legacyBusinessSubscriptions: subscriptions.filter(
        (subscription) => subscription.plan === 'BUSINESS',
      ),
      futureConstraintViolations: constraintViolations,
      unresolvedRelationships: review,
      migrationBlockers: blockers,
      mappingPolicy: {
        currentPrimarySite: 'A single active organization site is a cutover-only current-primary candidate, never historical attendance evidence.',
        historicalAssignment: 'Direct attendance site references provide date bounds only. An exact historical assignment effective date always requires approval.',
        attendance: 'Only an existing, tenant-consistent organizationId and attendanceSiteId is direct site evidence.',
        schedules: 'Map only when the schedule organization has exactly one active site; never duplicate across sites.',
        calendar: 'Public holidays remain organization-wide; existing company holidays preserve organization-wide scope; leave and missions require dated assignment evidence.',
        sanctions: 'Existing organization-scoped rules with stable codes become organization defaults; no site-specific override is inferred.',
        unresolved: 'Never auto-assign ambiguous employee, attendance, schedule, calendar, or sanction data. Keep it out of normal site dashboards and reports.',
      },
    };

    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();

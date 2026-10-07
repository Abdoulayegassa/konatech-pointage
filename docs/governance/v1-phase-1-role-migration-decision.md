# V1 Phase 1 — Role Migration Decision Record

Date: 2026-09-17

## Approved baseline and safety constraints

- The current dirty worktree is the authoritative working baseline. It must
  not be reset, stashed, discarded, or overwritten.
- Destructive migration and E2E validation may run only against the dedicated
  disposable PostgreSQL target configured for `konatech_attendance_e2e` on
  `127.0.0.1:5433`. Staging and production data are never test targets.
- Phase 1 may change only customer-role semantics, authorization, role-facing
  UI, and the supporting migration compatibility path. It must not introduce
  employee/site data-model or operational site-isolation changes from Phase 2.

## V1 authorization model

- `PlatformAdmin` is the only representation of **SUPER ADMIN**. It is not a
  tenant Membership role.
- Tenant Membership roles in V1 are **ADMIN** and **EMPLOYEE**.
- A customer `EMPLOYEE` account must still be linked to an active Employee
  profile before it can access employee account resources. The later primary
  site requirement is deliberately deferred to Phase 2.

## Current role/permission evidence

The current `MembershipRole` enum is `OWNER`, `ADMIN`, `MANAGER`, and
`MEMBER`. `RolesGuard` treats OWNER and ADMIN as administrative access, and
MEMBER as employee access. Controllers currently grant MANAGER operational
access to attendance, schedules, calendar, and sanctions; frontend navigation
also exposes operational pages to MANAGER. OWNER additionally protects
owner-only membership lifecycle and onboarding behavior.

## Required mapping

- **OWNER → ADMIN:** Convert automatically after verifying the membership is
  active and retain audit evidence. The previous last-owner invariant is
  replaced by the V1 active-admin invariant.
- **ADMIN → ADMIN:** Convert automatically; preserve status and increment
  membership version.
- **MANAGER → unresolved (ADMIN or EMPLOYEE):** **Never automatically
  downgrade.** Produce a per-organization report of active/suspended manager
  memberships and their linked Employee profile. A current ADMIN must
  explicitly choose the V1 role. The enum migration is blocked while any
  MANAGER remains. Current privileged-operation use cannot be attributed from
  the database because audit events are log-only in the baseline.
- **MEMBER → EMPLOYEE:** Convert automatically only when the linked user has an
  active Employee profile in the same organization. Otherwise flag it for
  remediation and block activation until an ADMIN links or creates the profile.

## Migration strategy and gates

1. Deploy compatibility code that can read the legacy roles and V1 role intent
   without granting new permissions. Existing MANAGER privileges remain intact
   until an explicit decision is recorded.
2. Run read-only preflight queries against the target database. Report role and
   status counts by organization, linked active Employee profile status, active
   ADMIN count, and MANAGER operational activity. Save the report outside the
   application database and obtain organization-admin decisions for every
   MANAGER.
3. In a dedicated disposable database, rehearse the role-data migration and
   JWT/session invalidation. The migration must be transactional per
   organization, increment `membershipVersion` for every converted membership,
   preserve memberships and users, and emit audit records.
4. Apply OWNER→ADMIN, ADMIN→ADMIN, eligible MEMBER→EMPLOYEE, and only the
   administrator-approved MANAGER mappings. Reject the migration if an active
   organization would have no active ADMIN or any MANAGER is unresolved.
5. Deploy the strict V1 guard/controller/frontend role matrix, invalidate
   legacy sessions, run authorization E2E tests against the disposable
   database, then remove legacy enum values in a later contract migration.

## No-go conditions

- No dedicated disposable database or migration rehearsal.
- Any unresolved MANAGER membership.
- An active organization with no active V1 ADMIN after mapping.
- An EMPLOYEE membership expected to use employee routes without a linked,
  active same-organization Employee profile.
- Any migration result that changes organization, user, employee, or
  subscription counts unexpectedly.

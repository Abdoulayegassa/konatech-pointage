# Konatech Attendance Current Status

Last updated: 2026-10-01

⚠️ **Note:** Last major update was 2026-05-22. SaaS foundation was added 2026-08-28. This document has been updated to reflect the current architecture.

## Product Contract and Reconciliation Gaps

Current product roles are SUPER ADMIN SAAS, ADMIN ENTREPRISE, and EMPLOYEE. Tenant membership roles in the current Prisma schema are ADMIN and EMPLOYEE; `PlatformAdmin` is separate. Older role names below are removed from current-facing descriptions; dated migration records remain historical.

STARTER, PRO, and BUSINESS expose the same available product functionality, differentiated by approved quantitative limits: 10/1/1, 50/3/3, and 200/10/10 for active employees/administrator capacity/active sites. Custom-period exports are included on all plans. Historical data still retained by the platform is available equally to all plans. See [docs/product/INOUT_V1_PLAN_CONTRACT.md](docs/product/INOUT_V1_PLAN_CONTRACT.md).

Platform organization provisioning is implemented at `POST /platform/organizations` behind `PlatformAdminGuard`. It creates the organization and first ADMIN invitation; the Platform Organizations UI presents the acceptance link, and the ADMIN membership is activated through the invitation-acceptance workflow. The first ADMIN is not created as an active membership before accepting. Provisioning and tenant records remain organization-scoped.

The current Super Admin V1 workspace contains Dashboard, Organizations, Plans, and Subscriptions. Global statistics appear on Dashboard and approved plan entitlement information appears on Plans. Separate Platform Users, global-statistics, feature-management, supervision, and Platform Settings screens are outside this V1 scope.

The organization dashboard is an aggregated company-wide view. Site dashboards are separate operational contexts. The employee PWA covers attendance/clock-in routes; administration is not the employee PWA. Advanced offline synchronization is on standby, even though queue/sync code exists in the repository.

## Implemented

### Repository And Environment

- pnpm monorepo with `apps/frontend` and `apps/backend`.
- Root workspace scripts for development, build, lint, typecheck, tests, Prisma, and validation.
- Docker Compose support for local PostgreSQL.
- Production-oriented Docker files and `.env.production.example`.
- README with local setup, environment variables, and command reference.

### Backend

- NestJS modular API structure.
- Prisma integration with PostgreSQL.
- Global validation and DTO-based API inputs.
- Health module.
- Auth module with login, JWT utilities, guards, roles, and attendance-entry session support.
- Employee module with create, update, status, role, department, and schedule assignment flows.
- Schedule module with create, update, and status flows.
- Dashboard module for admin metrics.
- Attendance module with check-in, check-out, self-service attendance actions, attendance history, schedule snapshots, lateness and absence-related logic, and monthly export services.
- Monthly attendance export support, including PDF rendering with Puppeteer and CSV export service.
- Security-related attendance services for GPS validation policy and attendance security behavior.
- Backend E2E test setup with isolated test database utilities.

### Frontend

- Next.js App Router application.
- Admin dashboard landing page.
- Login page and logout flow.
- Attendance entry page for QR-based access.
- Employee self-attendance page.
- Employee management page.
- Schedule management page.
- API route handlers that proxy frontend requests to the backend.
- Reusable UI primitives and dashboard, attendance, employee, schedule, auth, and layout components.
- Monthly attendance export card and attendance entry QR card.

### Database

- Prisma schema and migrations are present.
- Seed script is present.
- Migrations cover initial data model, authentication, attendance status flow, schedule management, smart attendance security, photo metadata legacy support, checkout outcomes, employee PIN codes, employee identifiers, attendance schedule snapshots, and **SaaS multi-tenant foundation** (as of 2026-08-28).

### SaaS Architecture

#### Organizations and Multi-Tenancy

- Organization model with status (ACTIVE, SUSPENDED, ARCHIVED), timezone, logo, and primary color.
- User model separate from Employee, with authentication and status management.
- Membership model linking Users to Organizations; current tenant roles are ADMIN and EMPLOYEE.
- MembershipStatus tracking (ACTIVE, SUSPENDED, REVOKED).
- Tenant-scoped uniqueness constraints: all shared resources (Employee, Schedule, Attendance, Calendar, Sites) are scoped to organizationId.
- Organization context enforcement via `requireOrganizationContext()` guard in all tenant-aware services.

#### Subscriptions and Entitlements

- OrganizationSubscription model with lifecycle management.
- Plans: STARTER, PRO, BUSINESS.
- Subscription statuses: TRIALING, ACTIVE, EXPIRED, SUSPENDED, PENDING_DOWNGRADE.
- SubscriptionEvent model tracking plan changes and lifecycle events.
- EntitlementsService defines the approved quantitative quotas and shared custom-period export entitlement. Historical access has no plan-specific cutoff. Support tiers are not part of the entitlement contract. Administrator capacity usage includes active ADMIN memberships and valid outstanding ADMIN invitations.
- SubscriptionAccessGuard enforcing quota-based write access (read-only mode for expired subscriptions, blocked for suspended).

#### Team Management

- Membership creation and role assignment for current tenant roles (ADMIN/EMPLOYEE); additional administrator creation is subject to plan limits.
- Invitations system for onboarding team members via email tokens.
- Membership activation upon invitation acceptance.
- Membership suspension/revocation support.
- Role-based route protection: frontend middleware and backend guards enforce role visibility.

#### Attendance Sites

- AttendanceSite model with organizationId ownership.
- Public ID for QR code generation (unique across platform).
- GPS configuration: latitude, longitude, allowedRadiusMeters.
- Site activation/deactivation status (inactive sites reject attendance).
- Multi-site support in Organization (enforced via site quotas).
- Attendance records track attendanceSiteId for audit trail.

#### Organization Settings

- OrganizationAttendanceSettings model for security policies:
  - gpsRequired: boolean flag for mandatory GPS validation.
  - selfieRequired: boolean flag for mandatory photo verification.
  - allowedRadiusMeters: GPS geofence radius.
  - defaultLatenessMarginMinutes: lateness threshold.
  - defaultWorkDays: weekly work schedule configuration.
- Settings fallback to organization-level defaults when not explicitly set.

#### Platform Administration

- PlatformAdmin model for global SaaS operators.
- PlatformAdminGuard for authentication and authorization.
- Platform routes:
  - `GET /platform/dashboard` — global SaaS dashboard.
  - `GET /platform/organizations` — list all organizations.
  - `POST /platform/organizations` — provision an organization and first ADMIN invitation (Platform Admin only).
  - `GET /platform/plan-entitlements` — read-only approved plan limits for Plans (Platform Admin only).
  - `GET /platform/subscriptions/:organizationId` — view subscription details.
  - `POST /platform/subscriptions/:organizationId/activate` — activate/upgrade subscription.
  - `POST /platform/subscriptions/:organizationId/suspend` — suspend organization.
  - `PATCH /platform/subscriptions/:organizationId/downgrade` — schedule plan downgrade.
- Platform audit logging for all global operations.
- Provisioning creates a first ADMIN invitation, not an active membership. The invitee becomes the first organization ADMIN after accepting the invitation and creating account credentials.
- Current Super Admin V1 navigation is Dashboard, Organizations, Plans, and Subscriptions; global statistics belong on Dashboard and approved plan entitlement information belongs on Plans.

#### Organization Admin Experience

- Organization profile management (name, timezone, logo, color).
- Organization readiness endpoint (legacy route name): `GET /organizations/current/owner-onboarding`.
  - Returns organization readiness checklist (profile configured, subscription status, active sites, active employees, active schedules, first attendance).
- Frontend onboarding checklist component tracking progress.
- Subscription information page showing current plan, status, usage vs. quotas, trial/expiration dates.

#### Frontend Organization Structure

- `/organization-settings` — organization profile and attendance policy settings.
- `/subscription` — subscription plan, status, quotas, entitlements.
- `/platform` — global platform admin console (Platform Admin only).
- `/attendance-sites` — multi-site configuration and QR generation.
- `/invitations` — team member invitations.
- Navigation includes organization-wide and site-specific contexts; current-facing tenant roles are ADMIN and EMPLOYEE.
- Membership context available to all authenticated routes for role-based UI.

#### Site Operations

- `/site/[siteId]/dashboard`, employees, schedules, attendance, history, reports, QR, and settings routes provide distinct site contexts.
- URL `siteId` is navigation context only; backend site resolution must authorize against authenticated organization and applicable role/permissions.
- Attendance and employee site-assignment relations preserve historical site lineage.

### Employee PWA and Offline Standby

#### Implemented

- Web manifests and service worker registration are scoped to `/my-attendance` and `/attendance-entry`, the employee attendance journey.
- Service worker (`sw.js`) with public shell caching strategy:
  - Caches public assets (icons, offline.html) on install.
  - Serves cached assets for public routes when offline.
  - Returns offline.html for navigation requests when network fails.
  - Blocks caching of `/api/*` routes (attendance and sensitive data).
- Offline queue/sync model and client library exist. Advanced offline functionality is on standby and is not a current product requirement.

#### PWA Validation / Offline Standby

- PWA install prompt UI (manifest configured but user-facing prompt needs testing).
- Advanced offline attendance synchronization is not a current delivery requirement. Do not prioritize expansion absent a new product decision.

## Validated

- The repository contains validation scripts for formatting, Prisma generation, type checking, linting, backend E2E tests, frontend build, backend build, and frontend proxy validation.
- Backend E2E test files are present.
- A dedicated test environment setup exists under `apps/backend/test`.
- Frontend and backend connection is covered by `pnpm test:proxy`.
- Full validation entry point exists as `pnpm validate`.

## Known Issues And Watch Items

### SaaS Architecture

- Confirm organization timezone handling across all reports and exports (database field exists, but usage in report assembly needs verification).
- Confirm quantitative quota enforcement in critical operations (create employee, add admin, create site).
- Validate plan entitlement and admin-capacity views against Platform and tenant APIs during human validation.
- Confirm Platform Admin operations are correctly audited and logged with PLATFORM_ADMIN role.
- Confirm tenant isolation in all edge cases (test cross-tenant access attempts, IDOR vulnerabilities, schedule/calendar/sanction cross-organization queries).

### Attendance and Security

- Confirm that the current production policy is GPS-only validation and that any legacy photo evidence paths remain optional or historical only.
- Confirm production values for company latitude, longitude, trusted radius, warning radius, and any hard blocking radius.
- Confirm that monthly PDF output matches Konatech business formatting before production use.
- Confirm that all admin workflows are protected by SUPER ADMIN SAAS or ADMIN ENTREPRISE permissions as applicable; EMPLOYEE access remains limited to employee functionality.
- Confirm that QR attendance links use the production frontend origin and never fall back to localhost.
- Confirm that the employee PIN flow stays fast on mobile devices.

### Employee PWA and Offline Standby

- Verify PWA installation prompt on iOS and Android devices.
- Verify the employee attendance PWA behavior on supported devices. Advanced offline synchronization remains on standby.

### General

- Run the full validation suite after any dependency, Prisma, attendance, authentication, or export change.
- Update documentation after each phase or production-readiness change.

## Next Phase

### Immediate Priorities

- Run `pnpm validate` on a clean local environment and record result in `CHANGELOG_DEV.md`.
- Execute SaaS-specific validation:
  - Validate organization readiness workflow (first site → first employee → first schedule → first attendance).
  - Verify approved quantitative quotas (10/1/1, 50/3/3, 200/10/10) and administrator invitations counted toward reserved capacity.
  - Test tenant isolation (attempt to access another organization's employees/sites/schedules → should fail).
  - Verify Platform Admin console subscription management.
  - Test multi-site attendance with different GPS policies per site.
- Manually test the complete QR attendance entry flow on mobile and desktop.
- Verify GPS-only attendance behavior for allowed, denied, unavailable, and permission-rejected location states.
- Validate admin employee management, schedule management, and dashboard workflows with multi-site context.
- Generate and review a monthly PDF report with realistic seeded or staging data.

### Engineering Priorities

- Increase automated coverage around SaaS tenant isolation, subscription quota enforcement, and role-based access.
- Increase automated coverage around attendance security policy, PIN validation, check-in/check-out edge cases, and monthly export generation.
- Review production environment configuration against `.env.production.example`.
- Confirm deployment checklist, database migration process, and backup/restore expectations.
- Verify timezone consistency across all report periods (daily/monthly/custom ranges).
- Keep documentation updated after each development phase or production-readiness change.

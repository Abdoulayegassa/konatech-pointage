# Konatech Attendance Development Changelog

Use this file to track meaningful development changes by date or phase. Keep entries short, factual, and useful for future Codex sessions.

## 2026-05-22 - Project Tracking Documentation

### Added

- Created project management documentation files at the repository root:
  - `PROJECT_PLAN.md`
  - `CURRENT_STATUS.md`
  - `CHANGELOG_DEV.md`
  - `TESTING_CHECKLIST.md`

### Notes

- No application code was changed.
- Documentation reflects the current monorepo structure, scripts, and known product context.

## 2026-08-28 — SaaS Foundation & Multi-Tenant Architecture

### Added

- Organization model with status, timezone, logo, and settings.
- User model separate from Employee with password authentication.
- Membership model linking Users to Organizations with role-based access control.
- MembershipStatus tracking (ACTIVE, SUSPENDED, REVOKED).
- Tenant-scoped uniqueness constraints on all shared resources.
- Organizations backend module with service, controller, and DTOs.
- Memberships backend module for role management.
- Subscriptions backend module with entitlements and access control.
- PlatformAdmin model and PlatformAdminGuard for global operations.
- Organization context helpers enforcing tenant isolation in all tenant-aware services.

### Changed

- Employee, Schedule, Attendance, Calendar, SanctionRule models now include organizationId.
- Authentication context now tracks organizationId, membershipId, membershipRole, platformAdminId.
- Prisma uniqueness shifted from global to tenant-scoped (e.g., `@@unique([organizationId, email])`).
- Foreign key relationships use composite (organizationId, id) for proper tenant scoping.

### Validation

- 20 Prisma migrations created and applied (migrations 20260828–20260905).
- Schema compiles and validates.
- Tenant-scoped uniqueness indexes created.

### Notes

- Legacy data without organizationId is preserved for backward compatibility.
- Database migration path tested (legacy index constraints remain during transition).

## 2026-09-03 — Subscriptions, Entitlements & Platform Admin

### Added

- OrganizationSubscription model with plan lifecycle management.
- Plans: STARTER, PRO, BUSINESS with defined quotas and feature entitlements.
- SubscriptionStatus: TRIALING, ACTIVE, EXPIRED, SUSPENDED, PENDING_DOWNGRADE.
- SubscriptionEvent model tracking plan changes and lifecycle transitions.
- EntitlementsService calculating quotas and usage per organization.
- SubscriptionAccessGuard enforcing quota-based read/write access.
- Platform admin routes for organization and subscription management.
- Subscription activation, suspension, and downgrade scheduling endpoints.
- Audit logging for all platform admin operations.

### Changed

- Subscription access control integrated into request pipeline.
- Backend enforces subscription status for operational writes.

### Validation

- Entitlements defined for all three plans (STARTER, PRO, BUSINESS).
- Platform admin guard verified in subscriptions controller.
- Subscription event persistence confirmed.

### Notes

- Billing/payment integration is NOT implemented (separate concern).
- Quota enforcement in critical operations needs functional testing.

## 2026-09-04 — Attendance Sites & Multi-Site Support

### Added

- AttendanceSite model with organizationId ownership.
- Site public ID for QR code generation (unique across platform).
- GPS configuration: latitude, longitude, allowedRadiusMeters.
- Site activation/deactivation status.
- Backend attendance sites module with service, controller, DTOs.
- Frontend attendance sites management interface.
- Attendance records include attendanceSiteId for audit trail.
- Multi-site quotas enforced via subscription entitlements.

### Validation

- Attendance sites properly scoped to organization.
- Site uniqueness constraints verified.

### Notes

- Inactive sites must reject attendance (needs integration testing).

## 2026-09-05 — Organization Onboarding, Settings & PWA

### Added

- Organization profile management (name, timezone, logo, primary color).
- OrganizationAttendanceSettings for security policies (GPS required, selfie required, etc.).
- Owner onboarding endpoint returning readiness checklist.
- Owner onboarding frontend component with progress tracking.
- Organization settings pages (profile, attendance policy).
- Web manifest (`manifest.ts`) for PWA metadata.
- Service worker (`sw.js`) with public shell caching strategy.
- ServiceWorkerRegistration component for automatic SW registration.
- OfflineAttendanceSyncRequest model for idempotent sync.
- offline-attendance-queue client library with retry logic.
- Subscription information page (plan, status, quotas, trial/expiration).
- Platform admin console with dashboard and subscription management UI.

### Changed

- Frontend middleware now protects organization-scoped routes.
- Navigation distinguishes OWNER, ADMIN, MANAGER, MEMBER roles.

### Validation

- Manifest generation produces valid PWA metadata.
- Service worker registration works on app load.
- Owner onboarding endpoint returns expected structure.

### Notes

- Full offline attendance workflow (capture → queue → sync → evidence upload) needs end-to-end testing.
- PWA install prompt UI needs verification on iOS/Android.
- Service worker caching restrictions (no /api/* caching) needs verification.

## Template For Future Entries

## YYYY-MM-DD — Phase Or Feature Name

### Added

- New functionality, screens, modules, commands, or documentation.

### Changed

- Behavior changes, refactors, environment changes, dependency updates, or UI updates.

### Fixed

- Bugs fixed, regressions corrected, or validation failures resolved.

### Validation

- Commands run and results, for example `pnpm validate`.
- Manual flows tested.

### Notes

- Follow-up risks, decisions, or production reminders.

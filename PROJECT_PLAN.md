# Konatech Pointage — Project Plan

## 1. Product Vision

Konatech Pointage is a production-grade multi-tenant SaaS for employee attendance management. Its PWA experience primarily serves employees during attendance and clock-in; administration is not the employee PWA.

The platform allows companies to manage employees, attendance sites, QR-based attendance, PIN authentication, schedules, attendance history, reports, sanctions and subscription entitlements.

The product must be secure, mobile-first, maintainable and commercially deployable.

The server remains authoritative for identity, tenant isolation, attendance timestamps and security validation.

---

## 2. Target Users

### SUPER ADMIN SAAS

The current V1 Platform workspace has four sections:

- Dashboard, including supported global statistics
- Organizations, including organization provisioning and first ADMIN invitation
- Plans, displaying the approved read-only plan entitlement definitions
- Subscriptions, with the existing activation, suspension, and downgrade workflows

Provisioning is protected by `PlatformAdminGuard`. It creates the organization and a first ADMIN invitation; the Organizations UI presents the invitation-acceptance link. The first ADMIN membership is activated only after the invitee accepts and creates account credentials. Organization and membership data remain organization-scoped.

Separate Platform Users, global-statistics, feature-management, supervision, and Platform Settings screens are not part of the approved V1 Platform scope. Plan entitlements are displayed read-only; runtime plan editing is not implemented.

### ADMIN ENTREPRISE

Manages their company:

- company identity and general organization settings
- employees
- additional administrators subject to plan limits
- invitations
- sites
- schedules
- sanctions
- reports
- subscription information

### EMPLOYEE

Uses employee attendance and account functionality. User, Membership, Employee, and attendance PIN remain distinct domain concepts.

---

## 3. Core Domain Model

The following concepts must remain distinct:

- User
- Membership
- Employee
- Organization
- Attendance Site
- Attendance
- Schedule
- Subscription
- Entitlement
- Invitation
- Attendance PIN

A User account is not automatically an Employee.

An Employee may exist without a SaaS User account.

A Membership represents access to an Organization.

The attendance PIN is a separate attendance credential.

---

## 4. SaaS Architecture

The system is multi-tenant.

Tenant isolation is mandatory.

Organization context must be derived from authenticated server-side context.

Client-provided organization identifiers must never be trusted as authorization boundaries.

Platform Admin operations are separate from tenant operations.

Backend authorization is always authoritative.

The organization is the customer-company scope for identity, general settings, administrators, invitations, sites, subscription, and an aggregated organization overview/dashboard. Each site is an operational context belonging to one organization and has a site-specific dashboard and site-scoped operational modules (Employees, Schedules, Attendance, History, Reports, QR/Access, and Site Settings where available).

A URL or selector `siteId` is navigation context only, never authorization. The backend must independently verify authenticated organization, site ownership and status, role, and permissions. Historical attendance and assignment records retain their original site lineage when an employee's current site changes.

---

## 5. Subscription Model

Commercial plans:

- STARTER
- PRO
- BUSINESS

All plans provide access to the same available product functionality. Approved V1 limits are STARTER: 10 active employees, 1 administrator capacity, 1 active site; PRO: 50, 3, 3; BUSINESS: 200, 10, 10. Custom-period reports/exports are included on all plans where supported. Historical data still retained by the platform is available equally to all plans, subject to normal authentication, authorization, tenant/site scope and reporting rules. There is no plan-specific history cutoff or support tier. The read-only Plans UI obtains the quantitative plan matrix from the Platform-authorized entitlement-definition API. See [docs/product/INOUT_V1_PLAN_CONTRACT.md](docs/product/INOUT_V1_PLAN_CONTRACT.md).

Subscription states may include:

- ACTIVE
- TRIALING
- EXPIRED
- SUSPENDED
- PENDING_DOWNGRADE

Entitlements and quotas are enforced server-side.

Billing and payment are separate concerns and are not considered implemented unless explicitly verified.

---

## 6. Attendance Flow

Default SaaS flow:

QR
→ sitePublicId
→ attendance entry
→ employee PIN
→ attendance session
→ optional GPS/selfie
→ check-in
→ check-out

QR remains the default attendance entry mechanism.

Security requirements such as GPS and selfie remain conditional according to organization policy.

The server determines the authoritative attendance timestamp.

---

## 7. Multi-Site

Organizations may manage multiple attendance sites.

Each site contains:

- organization ownership
- public identifier
- active/inactive status
- GPS coordinates
- GPS radius

Site quotas are controlled by subscription entitlements.

Inactive or cross-tenant sites must never be usable for attendance.

---

## 8. PWA / Offline

The PWA primarily supports the employee attendance/clock-in journey. The administration application is not the employee PWA.

Advanced offline functionality is currently on standby and is not a current product requirement. Existing offline queue/synchronization code is implementation state, not a commitment to expand the feature. Any future offline work must retain server authority and existing security/idempotency protections.

---

# 9. Development Roadmap

## Phase 10 — SaaS Product Hardening

### 10.8 — Attendance Entry

- PIN + site resolution
- SaaS attendance-entry context
- QR → site → PIN → attendance
- tenant isolation
- mobile validation

Status: COMPLETED

### 10.9 — Attendance Sites

- site management UI
- GPS configuration
- activation/deactivation
- QR generation
- quota visibility

Status: COMPLETED

### 10.10 — Team Management

- Employees
- Memberships
- Roles
- Invitations
- PIN management

Status: COMPLETED

### 10.11 — Platform Administration

- Dashboard with supported global SaaS statistics
- Organizations, including provisioning and first ADMIN invitation
- Plans with read-only approved plan entitlement definitions
- Subscriptions with the existing activation, suspension/reactivation, downgrade, and history workflows

Status: IMPLEMENTED for the current V1 Platform scope. Provisioning is Platform Admin guarded; first ADMIN access is invitation-based. Separate Platform Users, global-statistics, feature-management, supervision, and Platform Settings screens are outside this scope.

### 10.12 — Global SaaS Navigation & UX

- role-specific navigation
- SUPER ADMIN SAAS / ADMIN ENTREPRISE / EMPLOYEE visibility
- Platform Admin navigation
- mobile navigation
- redirects

Status: COMPLETED

### 10.13 — Organization Admin Experience

#### 10.13.1 — Organization Settings

- organization profile
- timezone
- settings UX

Status: COMPLETED

#### 10.13.2 — Tenant Subscription Experience

- current plan
- subscription status
- quotas
- entitlements
- expiration/trial information

Status: COMPLETED

#### 10.13.3 — Organization Readiness Onboarding

- first-run experience
- onboarding checklist
- organization readiness
- first site
- first employee
- schedule
- QR
- first attendance

Status: COMPLETED

#### 10.13.4 — Organization Dashboard

- aggregated organization-level attendance and employee metrics across sites
- clear indication that data is organization-wide, not one site's dashboard
- subscription usage and organization-wide quick actions
- separate site dashboards for site-specific operations

Status: Organization dashboard exists; verify aggregate labeling and site dashboard UX in human validation.

---

## Phase 10.14 — Reports & Exports

- attendance history
- monthly periods
- custom periods
- CSV
- PDF
- timezone consistency
- export security

Status: PLANNED

---

## Phase 10.15 — Client Subscription Experience

- plan information
- quotas
- entitlements
- subscription status
- renewal information

Status: PLANNED

---

## Phase 10.16 — SaaS Onboarding

- organization creation
- initial configuration
- first administrator
- first site
- first employee
- schedule
- QR
- first attendance

Status: PARTIALLY IMPLEMENTED / TO CONSOLIDATE

Platform-side organization provisioning and the first ADMIN invitation/acceptance workflow are implemented. The broader tenant onboarding sequence remains partial: the checklist, first site, first employee, schedule, QR setup, and first attendance still require consolidation and/or human validation.

---

## Phase 10.17 — PWA & Mobile Validation

### Android

- installation
- manifest
- camera
- GPS
- attendance flow on installed PWA

### iOS

- installation
- Safari/PWA behavior
- camera
- GPS
- network recovery

Validation must eventually be performed on real devices.

---

## Phase 10.18 — Final Security Audit

Review:

- authentication
- authorization
- RBAC
- tenant isolation
- IDOR
- JWT
- cookies
- PIN security
- brute force
- rate limiting
- CSRF
- XSS
- CORS
- uploads
- exports
- logs
- secrets
- Prisma
- Docker

---

## Phase 10.19 — Production / DevOps Audit

Validate:

LOCAL
→ STAGING
→ RELEASE CANDIDATE
→ PRODUCTION

Including:

- Docker
- Traefik
- HTTPS
- environment configuration
- database migrations
- backups
- restore
- monitoring
- logs
- alerts
- health checks
- rollback

---

## Phase 10.20 — Final Human Validation

Validate the complete SaaS as real users.

### ADMIN ENTREPRISE

Login
→ Organization Overview (aggregated)
→ Organization
→ Sites
→ Site Dashboard
→ Employees
→ PIN
→ QR
→ Attendance
→ History
→ Reports
→ Sanctions
→ Subscription

### EMPLOYEE

QR
→ PIN
→ Security checks
→ Check-in
→ Check-out
→ Attendance history

### PLATFORM ADMIN

Login
→ Platform Dashboard
→ Organizations
→ Subscription
→ Activation
→ Suspension
→ Statistics

---

## Phase 10.21 — Release Candidate

Before release:

- full tests
- security audit
- tenant isolation validation
- production builds
- migration validation
- PWA validation
- human QA
- documentation
- staging validation
- rollback verification

Decision:

GO / NO-GO

---

# 10. Current Project Status

The project is currently in the SaaS product-hardening and human-validation stage.

Completed areas include:

- SaaS authentication
- multi-tenancy
- RBAC foundation
- attendance sites
- QR attendance context
- employee PIN
- team management
- memberships
- invitations
- subscriptions
- entitlements
- Platform Admin console
- organization settings
- tenant subscription view
- organization readiness checklist
- role-based navigation
- employee attendance PWA foundation

Known contract/code reconciliation items:

- **Plans:** the approved InOut V1 entitlement contract is recorded in `docs/product/INOUT_V1_PLAN_CONTRACT.md`; validate the implementation and UI against it during human validation.
- **Offline standby:** queue/synchronization code exists, but advanced offline is not a current product requirement.

The remaining work must prioritize:

1. Validate the aggregated organization dashboard and separate site dashboards
2. Reports and exports UX
3. Subscription UX consolidation
4. Human-validate Platform provisioning and the first ADMIN invitation handoff
5. Employee PWA/mobile validation
6. Final security audit
7. Production readiness
8. Final human validation
9. Release Candidate

---

# 11. Development Policy

Implementation must be incremental.

For each phase:

1. Inspect the relevant existing implementation.
2. Identify the root cause or product gap.
3. Implement the smallest safe change.
4. Preserve existing functionality.
5. Check security and tenant isolation.
6. Run targeted tests.
7. Check regressions.
8. Provide human validation steps.

Do not perform broad repository rewrites.

Do not assume undocumented functionality exists.

Do not modify unrelated features.

Do not create migrations unless required.

Do not declare a phase complete only because the build passes.

A phase is complete only when implementation, tests, security and human UX are sufficiently validated.

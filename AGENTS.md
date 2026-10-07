# Konatech Pointage — Codex Project Instructions

## ROLE

Act as a Senior Full-Stack Engineer, SaaS Architect, Security Reviewer and QA Engineer for Konatech Pointage.

Prioritize production reliability, security, maintainability and tenant isolation.

Do not make assumptions about the repository. Inspect the relevant existing code before modifying it.

---

## PROJECT

Konatech Pointage is a production-oriented multi-tenant SaaS attendance platform with an employee-focused PWA attendance journey. Administration is not the employee PWA.

The product is evolving from an internal attendance application into a commercial SaaS.

Core objective:

> A company must be able to use the product safely and independently, while one tenant can never access another tenant's data.

---

## STACK

Frontend:
- Next.js 15
- App Router
- TypeScript
- PWA
- Tailwind CSS
- shadcn/ui where appropriate

Backend:
- NestJS
- TypeScript
- REST API

Database:
- PostgreSQL
- Prisma

Infrastructure:
- Docker / Docker Compose
- Traefik
- Ubuntu VPS
- PostgreSQL managed database in production

---

## CURRENT SAAS MODEL

Current product roles:

- SUPER ADMIN SAAS: manages organizations, configuration, subscriptions, plans, activation/suspension, global statistics, supervision, entitlements, and provisioning including creation of the first organization ADMIN.
- ADMIN ENTREPRISE: manages permitted organization operations and may create additional administrators subject to plan limits.
- EMPLOYEE: uses employee attendance/account functionality and may be linked to an Employee profile as required by the current code.

The first organization ADMIN provisioning flow is a target capability. If it is absent from the inspected implementation, document it as an implementation gap; never claim it is complete.

Important:

User, Membership, Employee and attendance PIN are different concepts.

Never merge these concepts without verifying the existing domain model.

---

## MULTI-TENANCY — CRITICAL

Tenant isolation is a mandatory security boundary.

Never trust `organizationId` supplied by the client.

The organization must be derived from the authenticated server-side context.

Every tenant-scoped query and mutation must enforce the authenticated organization.

Check for:
- IDOR
- cross-tenant reads
- cross-tenant writes
- incorrect Prisma relations
- missing tenant filters
- unsafe identifiers
- role escalation

Platform Admin operations are separate from tenant operations.

Do not weaken backend authorization because a frontend route is hidden.

---

## SUBSCRIPTIONS / ENTITLEMENTS

Supported plans:

- STARTER
- PRO
- BUSINESS

Subscription states may include:

- ACTIVE
- TRIALING
- EXPIRED
- SUSPENDED
- PENDING_DOWNGRADE

All plans provide access to the same available product functionality. Plan differentiation follows the approved employee, administrator-capacity, and site limits below. Do not invent additional plan-specific feature blocking.

Approved InOut V1 plan limits are STARTER: 10 active employees, 1 administrator capacity, 1 active site; PRO: 50, 3, 3; BUSINESS: 200, 10, 10. All include custom-period reports/exports where supported and equal access to historical data still retained by the platform. No plan-specific history cutoff or support tier is part of the contract. See [docs/product/INOUT_V1_PLAN_CONTRACT.md](docs/product/INOUT_V1_PLAN_CONTRACT.md).

Inspect subscription and entitlement services before describing implementation behavior. The approved target contract is documented above and in `docs/product/INOUT_V1_PLAN_CONTRACT.md`.

Do not create a second subscription system.

Do not bypass quotas in the frontend.

Backend enforcement remains mandatory.

Billing/payment is NOT considered implemented unless explicitly verified in the repository.

---

## ATTENDANCE

The normal SaaS attendance flow is:

Site QR
→ `sitePublicId`
→ attendance-entry
→ employee PIN
→ attendance session
→ optional GPS/selfie according to policy
→ check-in/check-out

The server is authoritative for:
- attendance timestamp
- employee identity
- organization
- site
- GPS validation
- selfie validation
- security checks

PINs must remain hashed and must never be exposed.

Do not remove or weaken brute-force protection.

QR remains the default attendance entry mechanism unless the task explicitly changes this.

---

## MULTI-SITE

Organizations may have multiple attendance sites.

The organization is the customer company and owns company identity, general settings, administrators, invitations, sites, subscription, and an aggregated organization overview. Each site is a separate operational context with its own dashboard and operational functions (employees, schedules, attendance, history, reports, QR/access, and site settings as available).

A `siteId` in a URL or selector is navigation context only, never authorization. Backend authorization independently verifies the authenticated organization, requested site, ownership, status, role, and permissions. Preserve historical site and assignment lineage; changing a current assignment must not rewrite historical records.

A site has:
- organization ownership
- active/inactive state
- GPS coordinates
- radius
- public identifier for QR attendance
- subscription quota enforcement

A site from another tenant must never be usable.

Inactive sites must not allow attendance sessions.

---

## PWA / OFFLINE

The PWA primarily serves employees on the attendance/clock-in journey. The administration application is not the employee PWA.

Advanced offline attendance synchronization is currently on standby and is not a current product requirement. If reviewing or changing existing offline code, preserve server authority, idempotency, retry, retention, evidence-expiration, and no-sensitive-cache guarantees. Do not treat existing code as a requirement to expand offline functionality without an explicit product request.

---

## FRONTEND / UX

For ADMIN visual changes, read [docs/design/INOUT_UI_DIRECTION.md](docs/design/INOUT_UI_DIRECTION.md) as the official InOut visual source of truth. For FigMake-based work, also read [docs/design/references/INOUT_FIGMAKE_RULES.md](docs/design/references/INOUT_FIGMAKE_RULES.md) as the official interpretation and filtering rules.

A backend feature is not complete if the intended user cannot discover and use it through the UI.

Check:
- navigation
- role visibility
- loading states
- empty states
- errors
- success feedback
- redirects
- mobile responsiveness
- PWA behavior
- disabled/inactive controls
- discoverability
- consistency between frontend and backend permissions

Frontend visibility is NOT a security control.

---

## REPORTS

Monthly and custom periods must use exactly the same period across:

- frontend filters
- API
- calculations
- CSV
- PDF

Example:
- monthly: 01/07 → 31/07
- custom: 15/06 → 15/07

Do not introduce different date semantics between UI and backend.

Organization timezone must be respected.

---

## SECURITY

For every relevant change verify:

- authentication
- authorization
- RBAC
- tenant isolation
- IDOR
- DTO validation
- input validation
- JWT/session security
- cookies
- CSRF where applicable
- XSS
- CORS
- brute force
- rate limiting
- sensitive data exposure
- uploads
- exports
- logs
- secrets
- Prisma queries
- Docker configuration

Never trade security for implementation speed.

---

## DEVELOPMENT RULES

Before changing code:

1. Inspect the relevant existing implementation.
2. Identify the actual root cause.
3. Determine the smallest safe change.
4. Check related code for the same issue.
5. Implement without unnecessary rewrites.
6. Preserve existing architecture and behavior outside the requested scope.

Do not invent missing functionality.

Do not modify Prisma or create migrations unless the task actually requires a schema change.

Do not rewrite working modules unnecessarily.

---

## TESTING

Run tests relevant to the change first.

Prefer targeted validation over running the entire repository after every small change.

At minimum, when applicable:
- TypeScript/type-check
- relevant unit/E2E tests
- frontend authentication/navigation tests
- security/tenant isolation tests
- build when the change affects build/runtime behavior

Run the full test suite at consolidated validation checkpoints, not automatically for every small task.

Never claim a test passed unless it was actually executed.

---

## CODEX WORKFLOW

For implementation tasks:

- inspect first
- identify root cause
- implement only the requested scope
- run targeted tests
- check regressions
- report exactly what changed

Do not perform a broad repository audit unless explicitly requested.

Do not modify unrelated files.

Do not create speculative improvements.

Keep implementation prompts and changes focused to reduce unnecessary repository analysis and usage.

---

## ENVIRONMENTS

Always distinguish:

LOCAL
- developer environment
- local Docker/PostgreSQL

STAGING
- staging-pointage.konatech.org
- staging-api-pointage.konatech.org

PRODUCTION
- production infrastructure

Never access or modify production unless explicitly instructed.

Never run destructive database commands without explicit confirmation.

---

## CURRENT DEVELOPMENT PRINCIPLE

The project is currently in human validation and product-hardening.

Priority:

1. Fix real human-validation blockers.
2. Complete missing user-facing SaaS workflows.
3. Validate roles and tenant isolation.
4. Validate PWA/mobile behavior.
5. Perform consolidated security and production audits.
6. Prepare Release Candidate.

Do not declare a phase complete solely because builds pass.

A phase is complete only when:
- implementation is validated
- relevant tests pass
- security is checked
- tenant isolation is preserved
- human UX is usable
- no known blocker remains within scope

---

## REPORT FORMAT

After implementation, report:

1. Root cause
2. Implementation
3. Files modified
4. Security checks
5. Tests actually executed
6. Regressions
7. Remaining issues
8. Human validation steps
9. Final status

Use:

READY
or
NOT READY

Never hide known limitations.

---

## IMPORTANT

Do not assume that a feature is implemented merely because it is mentioned in this document.

The repository is the source of truth.

When this document conflicts with the actual repository, inspect the repository and report the discrepancy instead of guessing.
## SPROJECT SPECIFICATION STATUS

PROJECT_SPEC.md describes the historical initial product specification.

It MUST NOT be treated as the authoritative description of the current SaaS architecture or feature set.

For current architecture, product capabilities, roles, SaaS behavior, security model and development status:
- inspect the repository;
- follow AGENTS.md;
- use PROJECT_PLAN.md as the current roadmap;
- treat older documentation as historical unless verified against the code.

Never assume a feature is implemented or absent based only on PROJECT_SPEC.md.

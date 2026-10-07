# Konatech Attendance

Monorepo for the Konatech attendance application.

- `apps/frontend`: Next.js admin and employee web app
- `apps/backend`: NestJS API with Prisma and PostgreSQL
- `docker`: production-oriented Dockerfiles for backend and frontend

## Stack

- Frontend: Next.js 15, TypeScript, Tailwind CSS, App Router
- Backend: NestJS 11, Prisma, PostgreSQL
- Workspace: pnpm
- Local database runtime: Docker Compose

## Repository Layout

```text
.
|-- apps
|   |-- backend
|   |   |-- prisma
|   |   |-- src
|   |   `-- test
|   `-- frontend
|       |-- app
|       |-- components
|       `-- lib
|-- docker
|-- docker-compose.yml
|-- .env.production.example
|-- package.json
`-- pnpm-workspace.yaml
```

## Prerequisites

- Node.js 20.9+ or 22.11+ (LTS only)
- pnpm 10+
- Docker Desktop or Docker Engine with Compose

Recommended local Node version:

```bash
nvm use
```

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

If PowerShell blocks the `pnpm` shim on your machine, use `pnpm.cmd` instead.

2. Create local environment files:

```bash
cp apps/backend/.env.example apps/backend/.env.local
cp apps/frontend/.env.example apps/frontend/.env.local
```

PowerShell:

```powershell
Copy-Item apps/backend/.env.example apps/backend/.env.local
Copy-Item apps/frontend/.env.example apps/frontend/.env.local
```

Set `LOCAL_SAAS_POSTGRES_PASSWORD` in the ignored backend `.env.local` and use
the same password in its `DATABASE_URL`. Local SaaS bootstrap credentials also
belong only in this ignored file.

3. Start PostgreSQL:

```bash
pnpm db:up
```

4. Generate the Prisma client and deploy the versioned migrations to the local
   SaaS validation database:

```bash
pnpm prisma:generate
pnpm prisma:saas:migrate:deploy
```

`pnpm prisma:saas:bootstrap` is an explicit, guarded validation bootstrap. It
requires `SAAS_VALIDATION_BOOTSTRAP=true` and the validation account variables
documented in `apps/backend/.env.example`; it is not a production seed.

5. Start the full stack:

```bash
pnpm dev
```

6. Open the app:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:4000/api/v1`
- Health check: `http://localhost:4000/api/v1/health`
- Frontend proxy health check: `http://localhost:3000/api/health`

Local Compose note:

- `pnpm db:up` starts only the isolated local SaaS PostgreSQL service on
  `127.0.0.1:5434`
- frontend and backend containers now live behind the Compose profile `app`
- production-style startup uses `docker compose --profile app ...`, not `pnpm db:up`

## Environment Files

Backend local env: `apps/backend/.env.local` (ignored by Git)

- `PORT=4000`
- `FRONTEND_URL=http://localhost:3000` public frontend origin used by backend CORS and `/attendance/entry`
- `JWT_SECRET=...`
- `JWT_EXPIRES_IN=1d`
- `DATABASE_URL=postgresql://postgres:<local-password>@127.0.0.1:5434/konatech_attendance_saas_validation?schema=public`
- `LOCAL_SAAS_POSTGRES_PASSWORD=<same-local-password>`
- `JSON_BODY_LIMIT=10mb` reserved for legacy payloads that may still include verification photos
- `RATE_LIMIT_TTL_MS=60000` and `RATE_LIMIT_MAX=300` for global API throttling
- `LOGIN_RATE_LIMIT_TTL_MS=60000` and `LOGIN_RATE_LIMIT_MAX=20` for the login endpoint
- `TRUST_PROXY_HOPS=0` or the number of trusted proxy hops in production
- `ATTENDANCE_SECURITY_ENABLED=false`
- `COMPANY_LATITUDE=...` and `COMPANY_LONGITUDE=...` when smart geofencing is enabled
- `ATTENDANCE_TRUSTED_RADIUS_METERS=100`
- `ATTENDANCE_WARNING_RADIUS_METERS=300`
- `CLOUDINARY_CLOUD_NAME=...` optional for legacy photo evidence handling
- `CLOUDINARY_API_KEY=...` optional for legacy photo evidence handling
- `CLOUDINARY_API_SECRET=...` optional for legacy photo evidence handling
- `CLOUDINARY_ATTENDANCE_FOLDER=konatech/attendance-verifications`
- `CLOUDINARY_UPLOAD_TIMEOUT_MS=10000`
- `CLOUDINARY_UPLOAD_MAX_RETRIES=2`
- `CLOUDINARY_UPLOAD_RETRY_DELAY_MS=300`
- `ATTENDANCE_PDF_RENDERER=premium` for the premium monthly HR PDF renderer
- `ATTENDANCE_PDF_EXECUTABLE_PATH=...` when Chromium or Chrome is not discoverable automatically
- `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK=false` to fail visibly instead of silently returning the legacy PDF

Monthly HR PDF exports use the premium Puppeteer renderer by default. If
Chromium is missing, the API returns:

```text
Premium PDF renderer unavailable. Install Chromium or configure ATTENDANCE_PDF_EXECUTABLE_PATH.
```

Use `ATTENDANCE_PDF_RENDERER=legacy` only for an explicit rollback. Use
`ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK=true` only when a controlled environment
is allowed to return the legacy low-level PDF if Puppeteer fails.

Frontend local env: `apps/frontend/.env.local`

- `NEXT_PUBLIC_APP_URL=http://localhost:3000` public frontend origin used for QR/public attendance links
- `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`
- `API_BASE_URL=http://localhost:4000/api/v1` optional server-only override for Next.js route handlers and SSR; in production keep it identical to `NEXT_PUBLIC_API_BASE_URL`

Production Docker env: `.env.production`

- start from [`.env.production.example`](.env.production.example)
- never commit `.env.production`
- replace all placeholder secrets before deploy
- `FRONTEND_URL` and `NEXT_PUBLIC_APP_URL` must match exactly
- `NEXT_PUBLIC_API_BASE_URL` must point to the real public backend API URL
- `API_BASE_URL`, when set, must point to the same `/api/v1` backend URL

Required production variables:

- `DATABASE_URL`
- `FRONTEND_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `API_BASE_URL` recommended for server-side frontend calls on hosted platforms
- `FRONTEND_HOST` and `BACKEND_HOST` for the Compose Traefik routes
- `JWT_SECRET`
- `TRUST_PROXY_CIDRS`
- `RATE_LIMIT_REDIS_URL` for multi-instance production deployments

Production-conditional variables:

- `COMPANY_LATITUDE` and `COMPANY_LONGITUDE` when GPS geofencing is enabled
- `ATTENDANCE_ALLOWED_RADIUS_METERS` when you want an explicit hard blocking radius
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` only for legacy historical photo evidence access

Public URL rule:

- `apps/frontend NEXT_PUBLIC_APP_URL` and `apps/backend FRONTEND_URL` must point to the exact same frontend origin
- use `localhost` only for local development
- in production, do not leave either variable empty and do not point them to `localhost`, `127.0.0.1`, or `0.0.0.0`
- `NEXT_PUBLIC_API_BASE_URL` must point to the real backend API origin in production and must not fall back to `localhost`
- if `API_BASE_URL` is set, it must also point to the real backend API origin and end with `/api/v1`

## First Production Admin

Use this only when the production database is empty and one admin account is
needed to enter the app. The script is idempotent: if `ADMIN_EMAIL` already
exists, it logs that the bootstrap was skipped and does not create a duplicate.

Required environment variables:

- `DATABASE_URL`: Render/Neon PostgreSQL connection string
- `ADMIN_EMAIL`: first admin email
- `ADMIN_PASSWORD`: first admin password

Optional environment variables:

- `ADMIN_FIRST_NAME`
- `ADMIN_LAST_NAME`
- `ADMIN_JOB_TITLE`
- `ADMIN_DEPARTMENT`

Render shell, with `DATABASE_URL`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` already
configured as service environment variables:

```bash
pnpm --dir apps/backend run prisma:migrate:deploy
pnpm --dir apps/backend run admin:create
```

Local PowerShell against Neon:

```powershell
$env:DATABASE_URL = '<neon-database-url>'
$env:ADMIN_EMAIL = 'abdoulayeseydoukonate14@gmail.com'
$env:ADMIN_PASSWORD = '<admin-password>'
pnpm --dir apps/backend run prisma:migrate:deploy
pnpm --dir apps/backend run admin:create
```

Backend E2E environment:

- `docker-compose.test-db.yml` defines a separate PostgreSQL service on
  `127.0.0.1:5433`.
- The test harness accepts only the database
  `konatech_attendance_e2e` on that exact host and port.
- `apps/backend/.env.test` and `.env.test.local` are local-only and ignored.
- A clean clone can use the safe default test URL or an ignored local override;
  tests never reuse the local SaaS validation database.

## Workspace Commands

| Command                                    | Purpose                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `pnpm dev`                                 | Start frontend and backend together                                          |
| `pnpm dev:frontend`                        | Start only the Next.js app                                                   |
| `pnpm dev:backend`                         | Start only the NestJS API                                                    |
| `pnpm build`                               | Build both apps                                                              |
| `pnpm build:frontend`                      | Build only the Next.js app                                                   |
| `pnpm build:backend`                       | Build only the NestJS API                                                    |
| `pnpm typecheck`                           | Run TypeScript checks for both apps                                          |
| `pnpm typecheck:frontend`                  | Run TypeScript checks for the frontend only                                  |
| `pnpm typecheck:backend`                   | Run TypeScript checks for the backend only                                   |
| `pnpm lint`                                | Run ESLint across the workspace                                              |
| `pnpm lint:fix`                            | Run ESLint with autofix enabled                                              |
| `pnpm format`                              | Format supported files with Prettier                                         |
| `pnpm format:check`                        | Check Prettier formatting without writing files                              |
| `pnpm check`                               | Run lint, typecheck, and build                                               |
| `pnpm test`                                | Alias for backend e2e tests                                                  |
| `pnpm test:backend`                        | Run backend e2e tests                                                        |
| `pnpm test:proxy`                          | Start backend + frontend on temporary ports and verify Next.js proxy wiring  |
| `pnpm validate:backend`                    | Prisma generate, backend typecheck, backend build, and backend tests         |
| `pnpm validate:frontend`                   | Frontend typecheck, frontend build, and frontend -> backend proxy validation |
| `pnpm validate`                            | Full local validation: format, lint, Prisma generate, builds, tests, proxy   |
| `pnpm clean:windows`                       | Remove common Windows build artifacts safely                                 |
| `pnpm clean:windows:dev`                   | Same cleanup plus stop local frontend/backend dev servers on known ports     |
| `pnpm clean:windows:prisma`                | Same cleanup plus Prisma client regeneration                                 |
| `pnpm db:up`                               | Start PostgreSQL with Docker Compose                                         |
| `pnpm db:status`                           | Show Docker Compose status                                                   |
| `pnpm db:down`                             | Stop PostgreSQL                                                              |
| `pnpm prisma:generate`                     | Generate Prisma client                                                       |
| `pnpm prisma:status`                       | Inspect Prisma migration status without modifying the database               |
| `pnpm prisma:migrate`                      | Apply development migrations                                                 |
| `pnpm prisma:migrate:deploy`               | Apply existing migrations without creating new ones                          |
| `pnpm prisma:seed`                         | Seed demo data                                                               |
| `pnpm --dir apps/backend run admin:create` | Create the first production admin if the email does not already exist        |

## Running Tests

Backend e2e tests are isolated by design:

- the test runner recreates the test database from scratch
- migrations are applied to the test database only
- the Prisma seed runs against the test database only
- the development database is not modified by test runs

Default test flow:

```bash
pnpm db:up
pnpm test:backend
```

Direct backend command:

```bash
pnpm --dir apps/backend test
```

Frontend proxy connectivity check:

```bash
pnpm test:proxy
```

This script starts the backend and frontend on temporary localhost ports,
calls the frontend route `/api/health`, and verifies that it reaches the
backend route `/api/v1/health`. It also verifies that backend `FRONTEND_URL`
and frontend `NEXT_PUBLIC_APP_URL` resolve to the same public attendance URL.

## Docker Compose Audit

The Compose setup now separates local DB usage from production-style app orchestration:

- local PostgreSQL is defined only in the dedicated local/test Compose files
- production `backend` and `frontend` run behind the Compose profile `app`
- production PostgreSQL and Redis are external managed services
- frontend waits for a healthy backend before starting
- Prisma Client generation happens while building the backend image
- schema migrations are an explicit one-off deployment step; application startup never mutates the schema
- both application containers run as the unprivileged `node` user with a read-only root filesystem
- backend sets `ATTENDANCE_PDF_RENDERER=premium` and `ATTENDANCE_PDF_EXECUTABLE_PATH=/usr/bin/chromium` for Puppeteer PDF rendering inside the container

## Production Deployment with Docker Compose

1. Create the production env file:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

2. Replace every placeholder value in `.env.production`, especially:

- `DATABASE_URL`
- `JWT_SECRET`
- `RATE_LIMIT_REDIS_URL`

Also verify the public URL/host variables: `FRONTEND_URL`,
`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL`, `FRONTEND_HOST`, and
`BACKEND_HOST`. `API_BASE_URL` stays on the internal Docker URL shown in the
example unless the deployment topology requires a different server-only URL.

3. Validate the resolved Compose model and build both images:

```bash
docker compose --env-file .env.production --profile app config
docker compose --env-file .env.production --profile app build backend-migrate backend frontend
```

4. Apply versioned migrations as an explicit, one-off deployment operation:

```bash
docker compose --env-file .env.production --profile app run --rm --no-deps backend-migrate
```

This uses the migration image and does not start the application. It exits
non-zero on migration failure. Run it only after validating the target
database and taking any backup required by your managed PostgreSQL provider.

5. Start the application stack:

```bash
docker compose --env-file .env.production --profile app up -d --no-build
```

The `backend-migrate` service is also a completion dependency of `backend`.
If the stack is started directly, Compose must observe a successful migration
service exit before starting the backend. A failed migration prevents the
backend from being promoted by the Compose dependency graph.

6. Inspect container health:

```bash
docker compose --env-file .env.production --profile app ps
```

7. Read application logs when needed:

```bash
docker compose --env-file .env.production --profile app logs backend frontend
```

### Staging rollback expectations

If `backend-migrate` fails, stop the deployment and keep the currently
running application image in place; do not start or promote the new backend.
After a successful migration, an application-image rollback is safe only when
the previous application version is compatible with the resulting schema.
Prisma migrations are forward-only by default: database rollback requires a
separately reviewed recovery or backward-compatible migration plan.

Production notes:

- expose `3000` and `4000` only if your reverse proxy or hosting model requires them
- set `TRUST_PROXY_CIDRS` to the actual trusted reverse-proxy network; keep `TRUST_PROXY_HOPS=0` unless the topology has been explicitly audited
- the public frontend origin must stay identical between `FRONTEND_URL` and `NEXT_PUBLIC_APP_URL`
- the public API origin in `NEXT_PUBLIC_API_BASE_URL` must be reachable from user browsers, not just from the Docker network
- the default Compose `API_BASE_URL` is the internal `http://backend:4000/api/v1` service URL
- `konatech-network` must exist before validation or deployment because Compose declares it as external
- the Compose flow is intended for stable single-host deployment; HA, managed backups, and external monitoring still need infra-level handling

## PostgreSQL Backup and Restore

Production Compose does not contain a PostgreSQL container or volume. Use the
backup, point-in-time recovery, and restore procedures supplied by the managed
PostgreSQL provider referenced by `DATABASE_URL`.

Backup guidance:

- run backups before schema changes, host maintenance, or manual data corrections
- store backups outside the Docker host
- test restore regularly against an isolated non-production database

## Build and Verification Flow

Recommended local verification:

1. `pnpm install`
2. `pnpm db:up`
3. `pnpm prisma:generate`
4. `pnpm prisma:status`
5. `pnpm prisma:migrate`
6. `pnpm prisma:seed`
7. `pnpm check`
8. `pnpm test:backend`
9. `pnpm test:proxy`
10. `pnpm dev`

Before opening or merging a change, run the full validation command:

```bash
pnpm validate
```

For the disposable E2E database, do not start separate database-resetting Jest
commands concurrently. Use `pnpm test:backend:serial` for a deterministic
suite-by-suite run; it stops on the first failure and holds a local runner lock.

`next build` is intentionally not used as a lint gate in this repository
because Next.js build linting is disabled in
[`apps/frontend/next.config.ts`](apps/frontend/next.config.ts). `pnpm lint`
remains a required part of `pnpm validate`.

PowerShell on locked-down Windows machines:

```powershell
pnpm.cmd validate
```

## Local Validation on Windows

Recommended Windows baseline:

- Node.js `22.11.x` from [`.nvmrc`](.nvmrc) when possible
- pnpm `10+`
- Docker Desktop running before database-dependent checks
- PowerShell with `pnpm.cmd` if the `pnpm.ps1` shim is blocked

Typical local validation flow in PowerShell:

```powershell
pnpm.cmd install
Copy-Item apps/backend/.env.example apps/backend/.env -Force
Copy-Item apps/frontend/.env.example apps/frontend/.env.local -Force
pnpm.cmd db:up
pnpm.cmd prisma:generate
pnpm.cmd prisma:status
pnpm.cmd prisma:migrate
pnpm.cmd prisma:seed
pnpm.cmd validate
```

Quick Windows recovery when `.next`, `dist`, Prisma client output, or stuck dev
servers cause EPERM-style issues:

```powershell
pnpm.cmd clean:windows
pnpm.cmd clean:windows:dev
pnpm.cmd clean:windows:prisma
```

Use:

- `clean:windows` to remove `apps/frontend/.next`, `apps/backend/dist`, and local `*.tsbuildinfo`
- `clean:windows:dev` to also stop frontend/backend Node processes listening on common local dev ports
- `clean:windows:prisma` to additionally regenerate the Prisma client after cleanup

The cleanup workflow does not reset the database and does not drop migrations.

## Prisma Commands

Common local Prisma commands:

```bash
pnpm prisma:generate
pnpm prisma:status
pnpm prisma:migrate
pnpm prisma:migrate:deploy
pnpm prisma:seed
```

Recommended usage:

- use `pnpm prisma:generate` after install or after Prisma schema changes
- use `pnpm prisma:status` before demos, validation, or deploy preparation
- use `pnpm prisma:migrate` for local development
- use `pnpm prisma:migrate:deploy` for pre-production or production-like deployment flows
- do not run database reset or drop commands automatically as part of validation

## CI and Pre-Production Readiness

Use this exact order for CI or a manual pre-production gate:

1. `pnpm install`
2. `pnpm prisma:generate`
3. `pnpm typecheck`
4. `pnpm lint`
5. `pnpm build:backend`
6. `pnpm build:frontend`
7. `pnpm test:backend`
8. `pnpm test:proxy`

For local environments that also need database verification before a demo:

1. `pnpm db:up`
2. `pnpm prisma:status`
3. `pnpm prisma:migrate`
4. `pnpm prisma:seed`
5. `pnpm validate`

## Seeded Local Accounts

- Admin: `awa.traore@konatech.local` / `KonatechAdmin123!`
- Admin: `salif.diallo@konatech.local` / `KonatechAdmin123!`
- Employee: `fatoumata.konate@konatech.local` / `KonatechEmployee123!`
- Employee: `ibrahim.coulibaly@konatech.local` / `KonatechEmployee123!`
- Employee: `aminata.keita@konatech.local` / `KonatechEmployee123!`

## Main URLs

- Login: `http://localhost:3000/login`
- Employee attendance: `http://localhost:3000/my-attendance`
- Fixed attendance entry: `http://localhost:3000/attendance-entry`
- Organization dashboard (aggregated): `http://localhost:3000/dashboard`
- Site dashboard: `http://localhost:3000/site/<siteId>/dashboard`
- Employees: `http://localhost:3000/employees`
- Schedules: `http://localhost:3000/schedules`
- Backend redirect entry: `http://localhost:4000/api/v1/attendance/entry`

## Current Domain Scope

- authentication with JWT and role-based access control
- employee check-in and check-out
- attendance history
- lateness and absence tracking
- admin dashboard overview
- employee management
- schedule management
- monthly CSV attendance export
- smart attendance security with GPS-only geofencing for employee self-service
- dashboard analytics now prioritize GPS validations and zone-compliance metrics
- legacy Cloudinary-hosted verification photo evidence remains readable for historical records

## SaaS Product Structure

Current product roles are SUPER ADMIN SAAS, ADMIN ENTREPRISE, and EMPLOYEE. The platform manages organizations and subscriptions. Each organization represents a customer company and has an aggregated organization overview; each site has its own site-scoped operational context and dashboard. A URL `siteId` is navigation context only and does not grant authorization.

STARTER, PRO, and BUSINESS provide the same available product functionality, differentiated by approved employee, administrator-capacity, and site quotas. All include custom-period exports where supported and equal access to historical data still retained by the platform. See [the canonical V1 plan contract](docs/product/INOUT_V1_PLAN_CONTRACT.md).

The V1 Platform workspace has four sections: Dashboard, Organizations, Plans, and Subscriptions. Global statistics appear on Dashboard; approved plan entitlements appear on Plans. Platform Users, separate global-statistics, feature-management, supervision, and Platform Settings screens are not part of the current V1 scope. Platform organization provisioning is implemented behind `PlatformAdminGuard`: the Organizations workflow creates the organization and first ADMIN invitation, then presents an invitation-acceptance link. The first ADMIN becomes an organization member only after accepting that invitation. Tenant data and membership remain organization-scoped.

The PWA is primarily the employee attendance/clock-in experience. Administration is not the employee PWA. Advanced offline synchronization is on standby, even though queue-related code exists.

## Smart Attendance GPS Security

When smart attendance security is enabled for employee self-service attendance:

- GPS is required
- the employee must be inside the allowed site radius
- pointage is blocked outside the allowed zone
- pointage is blocked when GPS is unavailable or denied

The browser requests GPS for a fast employee experience, but the backend
remains the source of truth for the final decision. On employee check-in or
check-out, the backend calculates the distance and accepts the pointage only
when the employee is inside the allowed radius. No photo is requested in the
current employee attendance flow.

Cloudinary backend variables remain optional only for legacy historical photo
evidence paths:

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CLOUDINARY_ATTENDANCE_FOLDER=konatech/attendance-verifications
CLOUDINARY_UPLOAD_TIMEOUT_MS=10000
CLOUDINARY_UPLOAD_MAX_RETRIES=2
CLOUDINARY_UPLOAD_RETRY_DELAY_MS=300
```

Admins can still open hosted proof images from dashboard activity when an older
attendance record already contains photo verification evidence.

Dashboard analytics, history views, and PDF export messaging now present GPS as
the active security model and clearly mark photo evidence as legacy historical
data only.

## Troubleshooting

### PowerShell blocks `pnpm`

On locked-down Windows environments, PowerShell can block the `pnpm.ps1` shim
with an execution-policy error. If that happens, use one of these options:

- run the command through `pnpm.cmd`
- run commands from Command Prompt
- configure PowerShell execution policy for local developer scripts if your environment allows it

Example:

```powershell
pnpm.cmd install
pnpm.cmd dev
```

### Supported Node.js runtime

This repository targets supported LTS runtimes only:

- Node.js 20.9+
- Node.js 22.11+

Node.js 24 is intentionally outside the supported range for this repository.
If you see inconsistent Prisma or Next.js build behavior, switch to the version
declared in [`.nvmrc`](.nvmrc).

### Docker access errors on Windows

If `docker compose` cannot connect to the Docker daemon:

- start Docker Desktop
- ensure your shell has permission to access Docker
- re-run `pnpm db:status`

### EPERM on `node.exe`, Prisma, `.next`, or `dist`

If Windows reports `EPERM`, `Access is denied`, or file locking issues around
Next.js, NestJS, Prisma, `dist`, or `.next`:

- stop running frontend/backend dev servers
- run `pnpm.cmd clean:windows:dev`
- if Prisma client output looks stale, run `pnpm.cmd clean:windows:prisma`
- re-run `pnpm.cmd prisma:generate`
- re-run the failed command after cleanup

The cleanup script is intentionally limited to repository build artifacts and
known frontend/backend dev ports. It does not delete source files or databases.

### Frontend proxy validation fails

If `pnpm test:proxy` fails:

- verify `apps/backend/.env` exists and contains a valid `JWT_SECRET` and `DATABASE_URL`
- verify `apps/frontend/.env.local` exists if your frontend depends on additional local variables
- verify `NEXT_PUBLIC_APP_URL` and `FRONTEND_URL` target the same frontend origin when you test a non-local setup
- verify `API_BASE_URL`, when set, matches `NEXT_PUBLIC_API_BASE_URL` and still ends with `/api/v1`
- ensure no local firewall rule is blocking temporary localhost ports
- run `pnpm.cmd clean:windows:dev` and retry
- if the backend boots but the frontend proxy still fails, inspect the printed logs from the validation script

### Test database safety

Never point `apps/backend/.env.test` or `apps/backend/.env.test.local` to the
same database as local development. The e2e suite recreates the target database
before running.

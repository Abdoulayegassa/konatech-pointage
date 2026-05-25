# Konatech Attendance Project Plan

## Product Vision

Konatech Attendance is a production-grade web attendance system for fast, reliable, and auditable employee time tracking. The product should keep QR-based attendance entry as the default path, support employee PIN verification, and use GPS-only attendance validation where required without adding unnecessary friction for every user.

The system must help Konatech manage daily attendance, lateness, absences, schedules, employee records, and monthly reporting from one maintainable application.

## Target Users

- Employees who check in and check out through a QR attendance entry flow.
- Administrators who manage employees, schedules, attendance history, and reports.
- Managers or operations staff who review lateness, absences, and monthly attendance summaries.
- Technical maintainers who need a clear Next.js, NestJS, Prisma, and PostgreSQL codebase that can be extended safely.

## Main Features

- QR attendance entry as the default access point.
- Employee PIN flow for attendance actions.
- GPS-only attendance validation, kept conditional and configurable.
- Employee check-in and check-out.
- Employee attendance history.
- Admin dashboard with attendance metrics and recent activity.
- Employee management, including status and role assignment.
- Schedule management with expected working windows.
- Lateness and absence tracking.
- Monthly attendance export, including PDF reports.
- Backend health checks and frontend proxy health checks.

## Technical Stack

### Frontend

- Next.js App Router
- TypeScript
- Tailwind CSS
- Reusable UI components, including shadcn/ui-style primitives where relevant
- Server-side and route-handler API proxy integration with the backend

### Backend

- NestJS modular architecture
- Prisma ORM
- PostgreSQL
- DTO validation with global validation
- Environment-based configuration
- Service-layer business logic
- E2E test coverage for critical API behavior

### Workspace And Runtime

- pnpm monorepo
- `apps/frontend` for the Next.js application
- `apps/backend` for the NestJS API
- Docker Compose for local PostgreSQL
- Production-oriented Docker assets under `docker`

## Development Principles

- Preserve the existing QR attendance flow.
- Keep employee attendance actions fast and mobile-friendly.
- Keep security controls conditional and configurable.
- Do not force GPS or other security prompts on users unless the configured policy requires it.
- Keep backend logic inside services and expose behavior through clear controllers and DTOs.
- Keep frontend components reusable, responsive, and aligned with operational admin workflows.
- Prefer small, validated changes with clear test coverage.

## Development Phases

### Phase 1: Foundation

- Establish the pnpm monorepo.
- Scaffold the Next.js frontend and NestJS backend.
- Configure Prisma, PostgreSQL, Docker Compose, linting, formatting, and TypeScript checks.
- Validate frontend-to-backend connectivity.

### Phase 2: Core Attendance Flow

- Implement employee records and activation status.
- Implement QR attendance entry.
- Implement employee PIN flow.
- Implement check-in and check-out APIs.
- Record attendance history with schedule context.

### Phase 3: Administration

- Build admin dashboard views.
- Add employee management screens.
- Add schedule management screens.
- Add attendance history and operational metrics.

### Phase 4: Validation And Reporting

- Add GPS-only attendance validation policy.
- Track lateness, absences, and outside-schedule attendance.
- Add monthly exports and PDF reports.
- Expand automated tests for critical attendance and reporting paths.

### Phase 5: Production Readiness

- Harden environment configuration.
- Validate production Docker setup.
- Review authentication, authorization, rate limiting, and proxy behavior.
- Complete manual QA checklist.
- Prepare deployment and backup procedures.

## Future Enhancement Backlog

- Role-specific dashboard views.
- More detailed attendance analytics.
- CSV/XLS export if business users need spreadsheet workflows.
- Audit trail views for administrative changes.
- Notification workflows for absence or repeated lateness.
- Employee self-service improvements.

# Konatech Attendance Testing Checklist

Use this checklist before merging major changes and before production deployment.

## Automated Validation Commands

Run from the project root unless noted otherwise.

```bash
pnpm format:check
pnpm prisma:generate
pnpm typecheck
pnpm lint
pnpm test:backend
pnpm build:frontend
pnpm build:backend
pnpm test:proxy
```

Full validation command:

```bash
pnpm validate
```

Focused validation commands:

```bash
pnpm validate:backend
pnpm validate:frontend
pnpm check
pnpm prisma:status
```

Local database commands:

```bash
pnpm db:up
pnpm prisma:migrate
pnpm prisma:seed
pnpm db:status
```

## Backend Checklist

- Health endpoint returns a successful response.
- Global validation rejects invalid DTO payloads.
- Authentication login succeeds with valid credentials and rejects invalid credentials.
- Admin-only endpoints reject unauthenticated and unauthorized requests.
- Employee creation, update, status change, role assignment, department assignment, and schedule assignment work.
- Schedule creation, update, and status change work.
- Attendance check-in succeeds for a valid active employee and valid PIN.
- Attendance check-out succeeds for a valid active employee and valid PIN.
- Duplicate check-in/check-out edge cases are handled correctly.
- Lateness and absence calculations match schedule rules.
- Attendance schedule snapshots are stored and used consistently.
- Monthly export endpoints return expected data and files.
- PDF export generation works in the target runtime.
- Prisma migrations apply cleanly to a fresh database.
- Prisma seed creates usable local/demo data.
- Rate limiting and request body limits behave as expected.

## Frontend Checklist

- Login page works and stores the expected session state.
- Logout clears the session and redirects correctly.
- Admin dashboard loads metrics and recent activity without layout shifts.
- QR attendance entry page loads from the expected public route.
- Employee PIN flow is clear, fast, and mobile-friendly.
- Employee check-in and check-out actions show success and error states.
- GPS permission prompt appears only when the configured policy requires it.
- GPS denied, unavailable, outside-radius, and inside-radius states show clear UI feedback.
- Employee management page supports create, edit, status, role, department, and schedule workflows.
- Schedule management page supports create, edit, and status workflows.
- Monthly report export can be triggered from the dashboard.
- Loading and error pages render correctly for dashboard, attendance, employees, and schedules.
- Responsive layout works on mobile, tablet, and desktop widths.
- No text overlaps or unusable controls appear on small screens.

## Frontend And Backend Connection

- `NEXT_PUBLIC_API_BASE_URL` points to the backend `/api/v1` URL.
- `API_BASE_URL`, when set, points to the same backend `/api/v1` URL.
- `NEXT_PUBLIC_APP_URL` and backend `FRONTEND_URL` match the same frontend origin.
- Frontend proxy health check works at `/api/health`.
- Backend health check works at `/api/v1/health`.
- `pnpm test:proxy` passes.

## Attendance Flow Manual Tests

- Scan or open the QR attendance entry URL.
- Start an attendance entry session.
- Enter a valid employee PIN.
- Check in with valid GPS data.
- Attempt check-in with invalid PIN.
- Attempt check-in with missing GPS permission.
- Attempt check-in outside the allowed GPS policy.
- Check out with valid PIN.
- Attempt duplicate checkout.
- Confirm attendance history reflects the expected check-in, checkout, lateness, and status values.

## Admin Manual Tests

- Log in as an administrator.
- Create a new employee.
- Activate and deactivate an employee.
- Assign role, department, and schedule.
- Create and update a schedule.
- Review dashboard metrics after attendance activity.
- Export a monthly PDF report.
- Confirm report totals and employee rows are correct.

## Production Readiness Checklist

- `.env.production` is created from `.env.production.example`.
- No production environment variable points to localhost, `127.0.0.1`, or `0.0.0.0`.
- `JWT_SECRET` and database credentials are strong production values.
- GPS policy variables are confirmed for the Konatech office location.
- Database migrations are reviewed before deploy.
- Database backup and restore process is documented.
- Docker production build succeeds.
- Production frontend and backend origins are configured consistently.
- QR attendance URL opens from a mobile device on the production network.
- Monthly PDF export works in the production runtime.
- Final validation result is recorded in `CHANGELOG_DEV.md`.

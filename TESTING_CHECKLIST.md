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

## SaaS Multi-Tenant Checklist

### Organization & Membership Management

- Organization profile creation and update works.
- Organization timezone is set and persists.
- Owner can invite team members via email.
- Invited member receives email and can accept invitation.
- Membership role (OWNER, ADMIN, MANAGER, MEMBER) is enforced on backend endpoints.
- Member with MEMBER role cannot access admin-only routes.
- ADMIN and OWNER can access all permitted routes.
- Suspended membership is revoked (user can no longer access organization).

### Subscription & Entitlements

- Organization in TRIALING status allows full read/write access.
- Organization in EXPIRED or SUSPENDED status allows reads but blocks operational writes.
- Subscription shows correct plan (STARTER, PRO, BUSINESS).
- Subscription status and dates are displayed correctly.
- Plan quotas are displayed (active employees, admins, sites, history months, custom export, support level).
- Attempting to create 11th employee on STARTER plan fails with quota error.
- Attempting to create 4th active site on STARTER plan fails with quota error.
- Attempting to add 2nd admin on STARTER plan fails with quota error.
- Plan upgrade takes effect immediately for increases.
- Plan downgrade schedules change for next billing cycle (if applicable).

### Owner Onboarding

- Owner onboarding endpoint returns readiness status (organization configured, employees, sites, schedules, first attendance).
- Onboarding checklist updates when first site is created.
- Onboarding checklist updates when first employee is created.
- Onboarding checklist updates when first schedule is created and assigned.
- Onboarding checklist updates when first attendance is recorded.
- Onboarding is marked complete when all items are checked.

### Multi-Site Attendance

- Attendance site is created tied to the organization.
- Attendance site has unique public ID for QR code.
- QR code generated from site public ID resolves to correct attendance-entry URL.
- Site with different GPS policy enforces its own GPS settings.
- Inactive site cannot accept attendance (check-in is rejected).
- Attempting to use another organization's site public ID fails.

### Tenant Isolation

- Employee from Organization A cannot see Employee data from Organization B.
- Attendance from Organization A is not visible in Organization B queries.
- Schedule from Organization A is not visible in Organization B queries.
- Calendar entries from Organization A are not visible in Organization B.
- Dashboard metrics show only Organization A's data when logged in as Org A member.
- Attempting to access `/api/v1/organizations/{other-org-id}/...` with member of different organization returns 403.
- Switching organization context (if applicable) correctly scopes all subsequent queries.

### Platform Admin

- Platform Admin user can list all organizations.
- Platform Admin can view subscription details for any organization.
- Platform Admin can activate a subscription with plan and dates.
- Platform Admin can suspend an organization subscription.
- Platform Admin can schedule a downgrade to a different plan.
- Subscription activation/suspension creates SubscriptionEvent.
- Platform Admin actions are logged with `role = PLATFORM_ADMIN` in audit log.
- Regular user cannot access Platform Admin routes.

### PWA & Offline

- Web manifest is served at `/manifest.webmanifest` with correct metadata.
- Service worker registers successfully in browser console.
- Service worker caches public shell assets (icons, offline.html) on install.
- Service worker returns cached offline.html when network unavailable for navigation routes.
- Service worker does NOT cache `/api/*` routes (sensitive data).
- Offline attendance queue stores pending actions in localStorage.
- Offline queue attempts sync when network is restored.
- Offline queue retries with exponential backoff on sync failure.
- Offline queue abandons sync after 5 failed attempts.

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

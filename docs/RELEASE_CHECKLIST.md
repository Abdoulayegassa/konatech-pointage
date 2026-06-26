# Release Checklist

Run this checklist before staging and before any GitHub push intended for release.

## Packaging

- Run `git status --short`.
- Confirm no production-critical file is untracked.
- Confirm migrations are present and ordered.
- Confirm frontend routes/components for changed features are tracked.
- Confirm backend modules/tests for changed features are tracked.
- Confirm docs that describe changed release behavior are tracked.

## Database and Prisma

- Run `pnpm prisma:generate`.
- Run `pnpm prisma:status`.
- For deployment, run or verify `pnpm prisma:migrate:deploy`.
- Confirm `apps/backend/prisma/schema.prisma` matches migrations.
- Confirm no migration is local-only or missing from packaging.

## Validation Commands

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:backend`
- `pnpm build:frontend`

## PDF Premium Verification

- Confirm `ATTENDANCE_PDF_RENDERER=premium`.
- Confirm `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK=false` outside controlled tests.
- Confirm `ATTENDANCE_PDF_EXECUTABLE_PATH` points to a valid Chromium/Chrome binary, or Puppeteer Chrome is installed.
- Generate a monthly employee PDF and verify:
  - `KONATECH POINTAGE`
  - `Synthèse RH mensuelle`
  - `Analytics mensuels`
  - `Journal quotidien`
  - no visible `KONATECH ATTENDANCE`
- If premium rendering fails, confirm the API returns a clear premium renderer error and does not silently return legacy output.

## Business Feature Smoke Checks

- Dashboard: overview cards, alerts, and analytics load.
- HR History: filters, detail drawer, sanctions labels, GPS/security details.
- Sanctions RH: monthly sanctions list, detail cards, French business copy.
- Calendar RH: month overview, holidays, company holidays, employee events.
- Exports PDF: team and employee PDF exports.
- Employees: list, create/edit, activate/deactivate.
- Schedules: list, create/edit, activate/deactivate.
- Attendance terminal mobile: PIN flow, GPS, selfie where policy requires it, comment workflow.
- Mon pointage: employee check-in/check-out, current-day status, monthly history.

## Deployment

- Confirm production env was copied from `.env.production.example`.
- Confirm `JWT_SECRET`, database credentials, frontend/backend URLs, and proxy origins are production values.
- Confirm Docker/hosting runtime includes Chromium for premium PDF rendering.
- Confirm Cloudinary variables are configured if selfie uploads are enabled.
- Deploy to staging first.
- Check backend logs for PDF renderer mode and any fallback warnings.
- Check frontend route health and backend `/api/v1/health`.


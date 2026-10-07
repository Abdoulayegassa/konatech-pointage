# Konatech Attendance Architecture

This document defines the source-of-truth boundaries for release work and Codex-assisted changes. It is intentionally operational: use it before changing critical flows.

## Project Structure

- `apps/backend`: NestJS API, Prisma access, attendance business logic, sanctions, calendar, dashboard metrics, and exports.
- `apps/frontend`: Next.js App Router UI, admin pages, employee pointage pages, frontend API proxy routes, and browser-side QR poster export.
- `apps/backend/prisma`: Prisma schema, migrations, and seed data.
- `docs`: architecture guardrails, module registry, release checklist, and approved reference artifacts.

Frontend UI calls the Next.js API proxy first. The proxy forwards authenticated requests to the NestJS API under `/api/v1`.

## SaaS Organization and Site Boundaries

The organization is the customer-company scope for identity, general settings, administrators, invitations, sites, subscription, and its global overview. `/dashboard` is the organization dashboard and aggregates organization data across sites; label the scope as organization-wide. It is not a site dashboard.

Each site is an operational context. `/site/[siteId]/*` provides site-specific operational pages, including dashboard, employees, schedules, attendance, history, reports, QR/access, and settings. Current site pages are the user-facing operational context; availability of each workflow must be verified before claiming it is complete.

`siteId` in a URL or selector is navigation context only. It never grants access. The backend independently checks authenticated organization, site ownership and status, role, and permissions. Current frontend site resolution calls authenticated site-list APIs, and backend site services/controllers resolve requested sites against authenticated organization context.

Attendance and effective employee-site assignments retain historical site lineage. A change to an employee's current site must not rewrite historical attendance or assignment records.

The current V1 Super Admin workspace contains Dashboard, Organizations, Plans, and Subscriptions. Global statistics are presented on Dashboard; approved plan entitlement definitions are presented read-only on Plans. Separate Platform Users, global-statistics, feature-management, supervision, and Platform Settings screens are outside this scope.

`POST /platform/organizations` is protected by `PlatformAdminGuard`. It provisions the organization and creates an invitation for the first ADMIN. The Platform Organizations UI presents the invitation-acceptance link; accepting the invitation creates the account and organization ADMIN membership. No active ADMIN membership is created before acceptance. Organization and membership data remain scoped to their organization.

## Product Contract Reconciliation

The current product target is SUPER ADMIN SAAS, ADMIN ENTREPRISE, and EMPLOYEE. Prisma roles are ADMIN and EMPLOYEE for tenant memberships; PlatformAdmin is separate. Dated role-migration records describe historical state and are not current role guidance.

STARTER, PRO, and BUSINESS expose the same available product functionality, with approved quantitative limits of 10/1/1, 50/3/3, and 200/10/10 for active employees/administrator capacity/active sites. Custom-period exports are available to all plans. Historical data still retained by the platform is available equally to all plans. See [the canonical V1 plan contract](product/INOUT_V1_PLAN_CONTRACT.md).

The PWA primarily serves employee attendance/clock-in routes. Administration is not the employee PWA. Advanced offline functionality is on standby; existing queue code does not make expansion a current requirement.

## Source of Truth by Domain

### Attendance Engine

Source of truth: `apps/backend/src/modules/attendance/attendance.service.ts`

This service owns check-in, check-out, late status, early departure, overtime, non-working-day work status, and attendance history assembly. Do not move attendance calculations into frontend components or report renderers.

### GPS and Selfie Security

Source of truth:

- `apps/backend/src/modules/attendance/attendance-security.service.ts`
- `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`
- `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`

GPS and selfie enforcement is backend-side. Frontend capture helpers may collect data, but they must not become the authority for security decisions. Cloudinary upload failures must be visible in logs and handled intentionally; do not silently treat failed evidence as valid proof.

### Calendar Engine

Source of truth: `apps/backend/src/modules/calendar/calendar.service.ts`

Calendar entries define weekends, public holidays, company holidays, and employee-specific events. Calendar-aware absence exclusion for reports must use `CalendarService.getNonWorkingDateKeys`.

### Sanctions Engine

Source of truth:

- `apps/backend/src/modules/sanctions/sanctions.service.ts`
- `apps/backend/src/modules/sanctions/sanction-rules.config.ts`
- `apps/backend/src/modules/sanctions/sanction-engine.types.ts`

Sanction rules and calculations must not be duplicated in frontend badges or PDF templates. Renderers only display already-computed sanction results.

### Dashboard Metrics

Source of truth: `apps/backend/src/modules/dashboard/dashboard.service.ts`

Dashboard metrics may aggregate attendance, calendar, and security data, but should not redefine attendance or sanctions rules.

The organization dashboard at `/dashboard` is organization-wide. Site dashboards at `/site/[siteId]/dashboard` are operationally scoped to one authorized site; keep those scopes distinct in UI copy and any future report/filter design.

### HR History

Source of truth:

- Backend data: `AttendanceService.getMonthlyHistory`
- Frontend workspace: `apps/frontend/components/attendance-history/attendance-history-workspace.tsx`
- Detail drawer: `apps/frontend/components/attendance-history/attendance-detail-panel.tsx`

History UI may filter and format records, but backend attendance records remain authoritative.

### Employee-Facing Mon Pointage

Source of truth:

- Backend: `AttendanceService.getEmployeeTodayAttendance`, `checkInForEmployee`, `checkOutForEmployee`
- Frontend workflow: `apps/frontend/components/attendance/employee-attendance-actions.tsx`

Employee UI must preserve the fast attendance flow. Security steps remain conditional based on backend policy.

### Monthly PDF Report

Source of truth:

- Data assembly: `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`
- Premium renderer: `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`
- Export coordinator: `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`

The premium Puppeteer renderer is the production visual source of truth. The legacy renderer in `MonthlyAttendancePdfExporterService` is fallback only and must not be used silently.

### CSV Export

Source of truth: `apps/backend/src/modules/attendance/exports/monthly-attendance-csv-exporter.service.ts`

CSV output is a separate export format. Do not use the CSV exporter to infer PDF layout rules.

## Attendance Flow

1. Employee or admin submits check-in/check-out.
2. `AttendanceController` routes to `AttendanceService`.
3. `AttendanceSecurityService` evaluates GPS/selfie proof when policy requires it.
4. `AttendanceService` applies schedule, calendar, late, early departure, overtime, and non-working-day logic.
5. Prisma persists the attendance record.
6. Frontend pages display the backend result.

## Sanctions Flow

1. Sanction rules are defined in `sanction-rules.config.ts`.
2. `SanctionsService` evaluates attendance records.
3. Monthly reports consume sanction results from `SanctionsService`.
4. Frontend and PDF views display labels, amounts, and recommendations only.

## Calendar Flow

1. Admin manages calendar entries through calendar routes and UI.
2. `CalendarService` normalizes and stores entries.
3. Attendance and reports query calendar non-working-day keys.
4. Non-working days are excluded from planned working days and absence generation.

## Report Generation Flow

Admin monthly report click:

```text
MonthlyAttendanceExportCard
-> frontend /api/attendance/exports/monthly
-> backend AttendanceController.exportMonthlyAttendance
-> MonthlyAttendanceExportService.buildMonthlyReport
-> MonthlyAttendancePdfExporterService or MonthlyAttendanceCsvExporterService
```

PDF premium flow:

```text
MonthlyAttendancePdfExporterService
-> MonthlyAttendancePuppeteerPdfRendererService.render
-> buildDocument
-> buildStyles
-> buildEmployeeSummaryPage
-> buildEmployeeAnalysisPage
-> buildEmployeeDetailPage
-> page.pdf
```

Legacy PDF flow:

```text
MonthlyAttendancePdfExporterService
-> buildLegacyPdf
-> buildEmployeeReportPages or buildTeamReportPages
-> assemblePdf
```

## PDF Renderer Strategy

The monthly HR PDF uses the premium Puppeteer renderer by default.

Required identifying strings:

- `KONATECH POINTAGE`
- `Synthèse RH mensuelle`
- `Analytics mensuels`
- `Journal quotidien`

Legacy identifying strings:

- `KONATECH ATTENDANCE`
- `Rapport mensuel de présence`

The legacy renderer is not the production source of truth. It is available only when explicitly configured.

## No Silent Fallback Rule

Critical features must not silently fall back to a lower-quality or less-secure implementation:

- PDF report rendering
- Cloudinary selfie upload
- GPS validation
- Calendar-aware absence calculations
- Sanctions calculations

For PDF:

- `ATTENDANCE_PDF_RENDERER=premium` or `puppeteer`: use the premium Puppeteer renderer.
- `ATTENDANCE_PDF_EXECUTABLE_PATH`: optional explicit Chromium/Chrome path.
- `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK=false`: fail visibly when premium rendering is unavailable.
- `ATTENDANCE_PDF_RENDERER=legacy`: explicit rollback to legacy renderer.
- `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK=true`: explicitly allow legacy fallback if Puppeteer fails.

If premium rendering fails without explicit fallback, the API must return:

```text
Premium PDF renderer unavailable. Install Chromium or configure ATTENDANCE_PDF_EXECUTABLE_PATH.
```

## Production vs Local Differences

Production Docker sets:

- `ATTENDANCE_PDF_RENDERER=premium`
- `ATTENDANCE_PDF_EXECUTABLE_PATH=/usr/bin/chromium`
- `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK=false`

Local development must install Puppeteer Chrome or configure `ATTENDANCE_PDF_EXECUTABLE_PATH`. Backend tests may explicitly allow fallback in test env to avoid requiring a browser binary for every test run, but source-of-truth tests still assert premium renderer identity strings.

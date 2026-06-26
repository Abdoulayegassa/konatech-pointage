# Module Registry

Use this registry before changing critical code. The `Source of Truth` column identifies the first file to inspect and the only place where core rules should be changed unless the task explicitly says otherwise.

| Domain | Source of Truth | Secondary Files | Fallbacks | Notes |
| --- | --- | --- | --- | --- |
| Attendance | `apps/backend/src/modules/attendance/attendance.service.ts` | attendance DTOs, `attendance.controller.ts`, attendance date/snapshot utils | None | Owns check-in, check-out, lateness, early departure, overtime, non-working-day work status. |
| Dashboard | `apps/backend/src/modules/dashboard/dashboard.service.ts` | `dashboard.controller.ts`, dashboard frontend components | None | Aggregates metrics only; must not redefine attendance or sanctions rules. |
| History | `AttendanceService.getMonthlyHistory` | `apps/frontend/components/attendance-history/*` | None | Frontend filters/formatting are display-only. |
| Sanctions | `apps/backend/src/modules/sanctions/sanctions.service.ts` | `sanction-rules.config.ts`, `sanction-engine.types.ts`, sanctions UI | None | Backend rules are authoritative; UI and reports display computed results. |
| Calendar | `apps/backend/src/modules/calendar/calendar.service.ts` | calendar DTOs, calendar UI components | None | `getNonWorkingDateKeys` drives report absence exclusion. |
| Reports | `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts` | export types, PDF exporter, CSV exporter | PDF only has explicit legacy fallback | Assembles monthly report data; renderers must not recalculate core rules. |
| PDF Premium Renderer | `apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts` | `monthly-attendance-pdf-exporter.service.ts`, renderer tests | None by default | Production visual source of truth. |
| PDF Legacy Renderer | `MonthlyAttendancePdfExporterService.buildLegacyPdf` | low-level PDF helpers in same file | Explicit only | Not source of truth; use only with `ATTENDANCE_PDF_RENDERER=legacy` or `ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK=true`. |
| CSV Export | `apps/backend/src/modules/attendance/exports/monthly-attendance-csv-exporter.service.ts` | monthly export types | None | Separate flat data export; not a PDF template. |
| QR Poster | `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx` | dashboard quick actions | Browser-only generated PDF | Independent from monthly HR report. |
| Employee Management | `apps/backend/src/modules/employees` | `apps/frontend/components/employees/admin-employees-manager.tsx` | None | Employee records and status changes. |
| Schedules | `apps/backend/src/modules/schedules` | `apps/frontend/components/schedules/admin-schedules-manager.tsx`, schedule snapshot utils | Attendance records retain schedule snapshots | Schedule updates must not rewrite historical attendance meaning. |
| Employee Mon pointage | `apps/backend/src/modules/attendance/attendance.service.ts` | `apps/frontend/components/attendance/employee-attendance-actions.tsx` | None | Keep fast flow; GPS/selfie steps are conditional. |
| GPS/Selfie Security | `apps/backend/src/modules/attendance/attendance-security.service.ts` | security policy service, photo storage service, frontend capture components | No silent security fallback | Backend is authoritative for enforcement. |


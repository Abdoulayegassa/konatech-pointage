# INOUT FigMake Reference Rules

> **FigMake is a composition and UX reference only. It is not a functional, technical, commercial, role, security, or implementation source of truth.**

This document is the official interpretation layer for the supplied FigMake reference. Read it before using that PDF in InOut UI work.

The supplied reference PDF is [`inout-figmake-reference.pdf`](inout-figmake-reference.pdf) in this directory.

## Source priority

Use these sources in this order:

1. **Current repository — functional source of truth.** It defines implemented business behavior, APIs, routes, authentication, authorization, roles, multi-tenancy, data, plans, attendance, reports, and product capabilities. Inspect the relevant implementation before representing a capability as available.
2. **`docs/design/INOUT_UI_DIRECTION.md` — visual source of truth.** It defines the InOut brand, tokens, typography, spacing, hierarchy, components, and responsive visual language.
3. **Approved InOut UI stack — implementation source of truth.** It determines how a screen is implemented: Tailwind CSS v4, shadcn/ui, Base UI, and Lucide React, with Motion, React Hook Form + Zod, and Recharts adopted only where useful and approved by the visual direction.
4. **`docs/design/references/INOUT_FIGMAKE_RULES.md` — interpretation and filtering rules.** It explains which FigMake ideas are useful and which must be ignored or verified.
5. **FigMake PDF — composition reference only.** It may inform approximate page structure and UX organization. It does not override any source above it.

The repository is authoritative when this document or a screenshot suggests functionality that the code does not support.

## What FigMake may inform

Use FigMake to understand:

- page composition and information hierarchy;
- section grouping and approximate density;
- relative importance of data;
- dashboard structure;
- table, filter, and navigation placement;
- workflows and page-level action placement.

FigMake must not define business behavior, backend or API capabilities, roles, permissions, multi-tenancy, plan limits, prices, quotas, retention, security, infrastructure, icon libraries, UI primitives, exact colors, component internals, animation, form architecture, chart libraries, or technical implementation.

## Global brand overrides

The supplied FigMake document uses the legacy **Konatech Pointage** identity and teal-led styling. For all InOut redesign work:

- Ignore the old Konatech Pointage logo, legacy branding, and teal as the primary brand color.
- Use the official InOut logo and the charcoal / graphite / orange identity in `docs/design/INOUT_UI_DIRECTION.md`.
- Do not let FigMake colors override InOut design tokens.

## Screen-by-screen interpretation

### Screen 01 — Login

Use the split-screen concept, brand area, authentication area, and compact focused form as composition guidance. Ignore the displayed `4 sites`, `247 employés`, `99.8% disponibilité`, `ISO 27001`, and any other unsupported trust metric, certification, or marketing statistic. Do not invent replacement statistics. Use only authentication behavior verified in the repository.

### Screen 02 — Platform Dashboard

Use as a possible structural reference for a future Super Admin control tower. KPI values, company and employee counts, MRR, retention, chart values, and alerts are examples only. Alerts do not prove monitoring exists. Show only real data supported by repository/API evidence.

### Screen 04 — Plans & pricing

Ignore all displayed prices, quotas, employee/site/admin counts, support claims, included features, and the “Enterprise” plan name. The product plan names are **Starter**, **Pro**, and **Business**. Prices, retention durations, support guarantees, and entitlements require approved product-contract evidence; use the current [InOut V1 plan contract](../../product/INOUT_V1_PLAN_CONTRACT.md), never values copied from FigMake.

### Platform placeholder screens

Treat **Subscriptions (05), Users (06), Global Statistics (07), Features (08), Supervision (09), and Platform Settings (10)** as FUTURE / PLANNED unless repository evidence proves the specific capability exists. Do not fabricate endpoints, real-time monitoring, feature flags, metrics, system health, subscription automation, or platform settings. If a future UI is designed for an unsupported capability, identify it clearly as planned.

### Screen 11 — Organization Dashboard

This is a strong composition reference for an executive, multi-site view. Keep the analytical concepts: organization KPI summary, active employees, sites, present and late today, site summaries, attendance trend, and consolidated multi-site analysis. Do not copy example values, teal styling, FigMake icons, or fake trends. Use real repository data.

### Screen 13 — Organization Employees

Use the organization-level employee table, site and department context, planning/status information, search, and filters where supported. Departments are a valid product concept, but do not hardcode example employees or departments from FigMake.

### Screen 14 — Members

Ignore **Gestionnaire, Lecteur, Manager, Viewer**, and every other invented role. Official roles are only **SUPER ADMIN, ADMIN, and EMPLOYEE**. Keep organization membership/account access distinct from an employee HR/attendance profile. Do not infer a role hierarchy from the screenshot.

### Screen 15 — Invitations

Use only as a layout and workflow reference. Invitation roles must match repository-supported roles. Do not copy Gestionnaire, Lecteur, or invented invitation permissions. Preserve the implemented invitation flow and tenant isolation.

### Screen 16 — Organization History

Keep the consolidated all-sites history concept, employee/site/date/status visibility, search and filters, and export-action placement. Actual filters, periods, exports, and data follow repository behavior. Monthly and custom date periods must stay identical across frontend, API, calculations, CSV, and PDF.

### Screen 17 — Organization Reports

Keep the analytical report structure, monthly/custom period selection, consolidated site data, KPI summary, per-site comparisons, and CSV/PDF actions only where implemented. Never copy example numbers; use repository calculations.

### Screen 18 — Global Calendar

Keep the organization-wide calendar concept for global non-working days/events and the calendar plus side-information composition. Functional rules come from the repository/product contract. Organization-wide global holidays and closures apply to all sites. Do not invent cancellation or override behavior from FigMake.

### Screen 19 — Sanction Rules

Keep the organization-level rule list, active/inactive state, and threshold/result presentation concept. Sanction rules are organization-wide. Do not add site-level sanction rules; site screens may show site-scoped results only.

### Screen 20 — Organization Subscription

Use the layout only. Do not copy prices, quotas, plan features, payment claims, billing automation, or support claims. The repository and current approved commercial contract are authoritative.

### Screen 21 — Organization Settings

Treat email summary notifications, excessive lateness alerts, weekly reports, absence alerts, and 2FA controls as FUTURE / PLANNED unless repository evidence confirms each setting is implemented. Do not create fake toggles.

### Screen 22 — Site Dashboard

This is a strong composition reference for a daily operational view. Keep present, late, absent, and total-employee summaries; attendance activity; operational alerts; and recent attendance events where real site-scoped data supports them. Keep the Site Dashboard operational and distinct from the executive Organization Dashboard.

### Screen 23 — Site Employees

Keep the site employee list, search/filter, planning/status visibility, and “Assign employee” concept where supported. An ADMIN should be able to assign an existing Organization employee to the current Site. Before implementing, inspect repository assignment and transfer behavior, preserve effective-dated assignment history, and enforce tenant isolation. Do not invent transfer rules.

### Screen 24 — Schedules

Use the site-level schedule management list/cards and assignment actions where supported. Schedule operations are site-scoped. Do not invent scheduling functionality absent from the repository.

### Screen 25 — Attendance

Keep the today-focused operational view: present/late/absent/departure summaries, attendance table, and refresh/status layout where supported. Attendance is today’s operational view; History is for past records. Do not merge these concepts.

### Screen 26 — Site History

Keep a historical attendance table with employee, date, arrival, departure, delay, and status; search and filters; and export-action placement. Use repository-supported period behavior. Monthly/custom periods must match across UI, API, calculations, CSV, and PDF.

### Screen 27 — Site Reports

Keep report KPIs, monthly/custom selection, analytical chart, and ranking/summary concepts only where the data supports them. Show CSV/PDF actions only where implemented. Use the approved InOut chart stack rather than copying FigMake chart styling.

### Screen 28 — Site Calendar

Keep the site calendar, inherited global events, and local site events concept. Organization-wide non-working events apply to all sites; sites may add extra local non-working days; sites cannot cancel global events in V1. Do not invent another inheritance model.

### Screen 29 — Site Sanctions

Keep site-scoped sanction results, KPI summary, and history/list concepts. The Organization defines sanction rules; a Site displays its scoped results. Do not add site-level rule configuration.

### Screen 30 — QR / Access

Verify each QR/access capability in the repository before presenting it as active. QR regeneration, download, direct attendance links, usage statistics, advanced QR analytics, and advanced GPS configuration are FUTURE / PLANNED unless implementation evidence confirms otherwise. Show site-scoped QR/access only where verified.

### Screen 31 — Site Settings

Use the layout as a settings-page reference. Verify support for site identity, GPS, geofencing, address, status, attendance behavior, dangerous-zone controls, and destructive actions before exposing each. Do not copy controls solely because they appear in FigMake. Security and tenant isolation remain authoritative.

### PWA screens 32–37

The PDF table of contents names PWA screens 32–37, but the supplied PDF contains no rendered pages for them. Do not design or implement the Employee PWA from these missing screens. Current redesign priority is Super Admin, Organization Admin, then Site Admin; the Employee attendance/PWA experience has a separate later phase.

## Data and functionality policy

Treat all FigMake example data as mock/reference data unless independently verified against repository fixtures or APIs. Never hardcode example company or employee names, countries, attendance values, KPIs, dates, subscriptions, prices, counts, percentages, or plan usage.

When a screenshot shows functionality that repository evidence does not confirm, classify it as **FUTURE / PLANNED**. Do not simulate success, fake API behavior, persisted state, statistics, or non-functional production controls. A screenshot is not evidence of an implemented backend capability.

## Icon and component policy

Do not reproduce FigMake icons or SVGs. Use **Lucide React** for ADMIN icons, selected by semantic meaning with consistent stroke, size, and alignment. Follow the approved InOut stack: Tailwind CSS v4, shadcn/ui, Base UI, and Lucide React. Use Motion purposefully, React Hook Form + Zod where appropriate, and Recharts for analytical charts. Do not force every library into every screen or copy FigMake component internals.

## Security and multi-tenancy

FigMake never overrides repository security architecture. Preserve authentication, authorization, RBAC, organization isolation, site ownership checks, IDOR protections, plan enforcement, role boundaries, and backend authority. A frontend route, selected site, or URL context is never sufficient authorization by itself.

## Instructions for future FigMake-based tasks

Every future FigMake-based redesign prompt must identify the relevant screen explicitly, for example: **“Use FigMake screen 11 / PDF page 14 — Organization Dashboard — as a composition reference only.”**

Before implementation:

1. Inspect the repository implementation for the relevant screen and behavior.
2. Read `docs/design/INOUT_UI_DIRECTION.md` completely.
3. Read `docs/design/references/INOUT_FIGMAKE_RULES.md` completely.
4. Preserve real repository behavior and use the approved InOut implementation stack.
5. Report unsupported, mock, legacy, or future FigMake elements discovered; do not present them as implemented.

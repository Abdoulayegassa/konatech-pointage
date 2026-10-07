# INOUT UI Direction

Future Codex UI tasks must read this document before making ADMIN visual changes and treat it as the official InOut visual source of truth.

## Source of truth

Use this authority order for InOut UI work:

1. **Current repository — functional source of truth.** It defines business behavior, API contracts, routes, authentication, authorization, roles, multi-tenancy, data, plan behavior, attendance and reporting logic, and existing capabilities. Verify implementation before representing any capability as available.
2. **This document — official visual source of truth.** It defines the InOut brand, colors, typography, spacing, visual hierarchy, sidebar, page shell, tables, forms, buttons, status presentation, and responsive visual language.
3. **Official InOut UI implementation stack — implementation guidance.** Use the target technologies below, while preserving healthy existing architecture and adopting libraries only when they serve actual product needs.
4. **FigMake screenshots — composition references only.** Use them to understand approximate layout, information hierarchy, content grouping, density, workflows, action placement, dashboard composition, and table/filter placement. They do not define implementation details or prove product functionality.

The employee PWA is a separate experience and is outside the current ADMIN redesign direction.

## Official UI implementation stack

The target stack for InOut ADMIN UI work is:

- Tailwind CSS v4 for styling and responsive utilities.
- shadcn/ui as the reusable component layer where appropriate.
- One primary primitive foundation: Base UI or Radix.
- Lucide React for the ADMIN icon family.
- Motion for purposeful interface animation.
- React Hook Form and Zod for complex frontend forms and validation.
- Recharts for analytical charts.

Do not use Base UI and Radix as competing primitive systems without a verified architectural reason. Inspect the repository before choosing or changing the primitive foundation. Preserve a healthy existing Radix foundation unless there is a concrete reason to migrate. If no third-party primitive foundation is established, Base UI may be selected for the InOut foundation. Do not perform a broad migration only to achieve a visual redesign.

### Repository snapshot and adoption

At the time this policy was added, the frontend uses Next.js 15 and Tailwind CSS 3. Its shared UI layer consists of project-owned components such as `Button`, `Card`, form controls, `Table`, and a custom inline-SVG `Icon`; the frontend package does not establish a Radix or Base UI foundation. The frontend package also does not currently declare Lucide React, Motion, React Hook Form, Zod, or Recharts. Treat the technologies above as the target, not as claims about current installation. Do not install packages as part of a visual-only task. Adopt them incrementally when implementation work requires them, and do not rewrite healthy existing components without a concrete UX or architectural benefit.

Tailwind CSS v4 is the target. The current frontend is on Tailwind CSS v3, so a version change is a deliberate migration with its own scope and validation; do not imply it has already happened or bundle a broad migration into page redesign work. Continue to use shared tokens, responsive utilities, state variants, and shared component styles. Avoid large page-specific CSS systems, duplicated arbitrary values, and one-off styling hacks.

## FigMake implementation principle

> FigMake tells us WHAT the screen should communicate and approximately HOW information is organized. The InOut design system and approved UI stack determine HOW the interface is actually implemented.

Never reproduce FigMake icons, component internals, or unsupported functionality merely because they appear in a screenshot.

Use FigMake only as a composition reference. Do not treat its icons, exact colors, primitives, components, typography implementation, animation implementation, form architecture, chart implementation, CSS, component libraries, or apparent backend capabilities as authoritative.

## Icon policy

Lucide React is the target icon family for the InOut ADMIN UI. Select icons by semantic meaning, and keep stroke weight, size, and alignment consistent. Add accessible labels to icon-only controls. Do not copy FigMake icons. Avoid raw characters such as `+`, `→`, or `!`, and arbitrary inline SVGs, as the primary icon system when a suitable Lucide icon exists. Important actions retain visible text labels.

## shadcn/ui and primitive policy

Use shadcn/ui as the reusable UI component layer where appropriate. Add components in response to actual product-screen needs; do not install every available component preemptively. Typical primitives include Button, Input, Textarea, Select, Dialog, Sheet, DropdownMenu, Tooltip, Tabs, Popover, Checkbox, Radio, Switch, Alert, Skeleton, table UI, and form UI.

Keep one primary primitive foundation, either Base UI or Radix, as selected from repository evidence. Avoid duplicate implementations of the same interaction primitive across both systems.

## Motion policy

Use Motion only when animation improves understanding or interaction, such as drawers, dialogs, panel/state transitions, layout changes, or subtle purposeful entrances. Use CSS or Tailwind for hover, focus, simple opacity, and simple color transitions. Do not animate every card, row, KPI, or page. Respect `prefers-reduced-motion`.

## Form policy

React Hook Form and Zod are the target tools for complex InOut forms. Use them where they improve form state, frontend validation, error presentation, dirty state, or submission state. Backend NestJS DTO validation remains authoritative; frontend Zod validation is never a security boundary. Do not rewrite healthy existing forms without a real architectural or UX benefit.

## Chart policy

Recharts is the target for InOut analytical interfaces, including organization and site dashboards, Super Admin analytics, and report visualizations, unless the repository already contains a healthy equivalent that should be preserved. Charts must follow this document's visual direction. Do not copy FigMake chart styling blindly.

## Next.js component policy

Do not make full pages Client Components solely because Motion, React Hook Form, Recharts, dialogs, or dropdowns need client-side behavior. Keep Server Components where practical and isolate interactive behavior in focused Client Components.

The product name is **INOUT**. The previous Konatech Pointage visual identity is being replaced progressively; this document records the direction and does not itself migrate product pages or behavior.

## Brand concept

The concept is **DARK PRECISION + ORANGE PULSE**. InOut should express precision, time, movement, control, reliability, and professional workforce management. The official logo contains a stopwatch/clock concept. Arcs, timing indicators, progress, and controlled movement may inform subtle motifs, but clock graphics should not be repeated decoratively throughout the interface.

Use the official logo asset without redrawing, recoloring, distorting, or approximating it. Prefer `/brand/inout-logo.svg`; the supplied official asset is currently available as `apps/frontend/public/brand/inout-logo.png` and is served at `/brand/inout-logo.png`. If an official SVG is added later, prefer it over the PNG.

## Color direction

| Role | Working reference | Use |
| --- | --- | --- |
| Charcoal / graphite | `#303030` | Structure, navigation, and strong typography |
| Deep sidebar | `#17191D` | Main ADMIN navigation surface |
| InOut orange | approximately `#F35A24` | Brand accent, primary actions, active markers, controlled highlights |
| Light workspace | approximately `#F5F6F8` | Application workspace background |
| Surface | `#FFFFFF` | Content surfaces and form controls |

These are working references, not a license to add arbitrary colors. Teal is no longer the primary InOut brand color. Semantic colors stay independent of orange: green for success, amber for warning, red for danger, blue for information, and gray for neutral or inactive states. Orange must not replace semantic status colors.

## Product feel and visual language

InOut should feel premium, modern, professional, enterprise-ready, structured, trustworthy, precise, and operational. Information can be dense when it remains easy to scan.

Build polish through hierarchy, typography, spacing, alignment, disciplined color use, clear data presentation, and consistent interactions. Avoid generic admin-template styling, excessive card grids, large decorative gradients, glassmorphism, heavy shadows, oversized rounded panels, excessive pills, arbitrary colors, giant whitespace, decorative uppercase labels everywhere, playful startup styling, and inconsistent icon families. Prefer dividers and spacing over nested cards. Use little or no shadow on routine content; reserve stronger elevation for dialogs, dropdowns, popovers, and drawers.

## Typography and layout tokens

Use the repository's deterministic system sans-serif strategy. Do not add a Google Fonts or other network font dependency.

| Element | Target size |
| --- | --- |
| Page title | 28–32px |
| Section title | 18–20px |
| Card title | 15–16px |
| Body | 14–15px |
| Secondary text | 13–14px |
| Labels | 12–13px |
| Primary KPI | 30–36px |

Use tabular numerals where useful for time, percentages, attendance values, and KPI numbers. Avoid oversized headings.

Use a spacing rhythm of 4, 8, 12, 16, 24, and 32px. Controls should generally be 40–44px high with an 8px radius. Cards should be approximately 10–12px radius; large panels should not exceed approximately 14–16px radius.

## ADMIN navigation and page shell

Use one consistent professional outline/stroke icon family. Do not use raw characters such as `+`, arrows, or `!` as the primary icon system. Important actions retain visible text labels.

The desktop sidebar should be dark charcoal/graphite and approximately 240–250px wide. It should contain the official InOut logo, current product context, grouped navigation, account/logout area, and a site selector where applicable. The active item uses a subtle lighter dark background, readable text, a clear icon, and a small InOut orange accent. Do not turn the whole active item into a saturated orange block.

ADMIN pages follow this order where applicable:

1. Context or breadcrumb.
2. Route-specific page title.
3. Short description.
4. Primary action.
5. Optional secondary actions.
6. Main content.

Use one `<main>` and one route-specific `<h1>`. Avoid duplicated Organization/Site context, giant generic hero panels, and inconsistent responsive gutters.

## Interaction patterns

### Buttons

- Primary: InOut orange with white text.
- Secondary: white or neutral surface, subtle border, charcoal text.
- Ghost: minimal emphasis.
- Destructive: semantic danger color.
- Icon-only: secondary actions only, with an accessible label.

Avoid competing primary actions.

### Forms

Use visible labels, compact consistent controls, subtle borders, clear focus indication, helper text, validation, and disabled/loading states. Do not use placeholders as labels.

### Tables

Tables are a core daily-work component. Prefer compact 44–48px rows, clean headers, clear column hierarchy, search/filter toolbars, semantic status, predictable row actions, and pagination. Provide loading, empty, and error states, and handle horizontal overflow predictably on small screens.

### KPI and dashboard language

Avoid one oversized card per metric. Combine primary KPIs, secondary metrics, and compact summaries with clear numerical hierarchy, concise labels, optional icons, and restrained contextual information.

- Organization Dashboard: executive and multi-site overview.
- Site Dashboard: operational and focused on today.
- Super Admin Dashboard: platform control and supervision.

These contexts share the same design system but should not use identical dashboard compositions.

### Status

Statuses may include Active, Inactive, Present, Late, Absent, Pending, Suspended, Trial, Completed, and Warning. Use a soft background, readable text, and an optional dot or icon. Never communicate status by color alone.

## Product contexts and terminology

The shared visual system supports SUPER ADMIN platform supervision, ADMIN organization-wide administration and consolidated views, and site-level daily operations. Do not create unrelated visual systems for Super Admin, Organization, and Site.

Official roles are only **SUPER ADMIN**, **ADMIN**, and **EMPLOYEE**. Do not introduce Manager, Gestionnaire, Reader, Lecteur, Viewer, or other roles in UI or design documentation.

Current plan names are **Starter**, **Pro**, and **Business**. Do not invent prices, billing, retention durations, support guarantees, or entitlements. Use approved quotas and capabilities from [the canonical InOut V1 plan contract](../product/INOUT_V1_PLAN_CONTRACT.md); current repository behavior alone does not approve commercial commitments.

Mockups may show future capabilities such as advanced analytics, daily/weekly reports, email notifications, 2FA, QR regeneration, direct attendance links, QR statistics, advanced platform statistics, or advanced supervision. A visual mockup is not evidence that backend functionality exists; verify the repository before presenting any capability as available.

## Responsive behavior

ADMIN experiences should support 1440px, 1280px, 1024px, 768px, and 390px widths.

- Desktop: full sidebar.
- Tablet: compact or drawer navigation.
- Mobile: single-column responsive ADMIN layout.
- Employee PWA: separate product experience and not part of this ADMIN redesign phase.

## Accessibility

Preserve strong contrast, visible focus, keyboard navigation, semantic headings, one main landmark, one route-specific h1, labeled forms, accessible dialogs and drawers, adequate target sizes, status cues that do not depend on color, and reduced-motion support.

## Scope guardrails

This direction governs visual design. It does not authorize changes to authentication, RBAC, multi-tenancy, routes, attendance behavior, plans, reports, Calendar, Sanctions, QR, PWA behavior, APIs, or backend/data systems. Preserve the repository's functional behavior and validate each feature against implementation evidence.

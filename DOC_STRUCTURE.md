# Documentation Structure Guide

Use this guide to find the right documentation for your task.

## If You Need...

### "How should I approach changes to this codebase?"

→ Read **[AGENTS.md](AGENTS.md)**

Covers: role definition, security priorities, multi-tenancy rules, development workflow, testing requirements.

### "What is the current product contract and roadmap?"

→ Read **[PROJECT_PLAN.md](PROJECT_PLAN.md)**

Covers: current SUPER ADMIN SAAS / ADMIN ENTREPRISE / EMPLOYEE roles; platform, organization, and site hierarchy; organization-wide vs site dashboards; feature-equivalent plans; employee PWA boundary; roadmap and known target/implementation gaps.

### "Which file owns each module's business logic?"

→ Read **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** and **[docs/MODULE_REGISTRY.md](docs/MODULE_REGISTRY.md)**

Covers: attendance, dashboard, history, sanctions, calendar, reports, PDF/CSV exports, employee management, schedules, GPS/selfie security, organizations, memberships, subscriptions, attendance sites.

### "What is currently implemented and what needs testing?"

→ Read **[CURRENT_STATUS.md](CURRENT_STATUS.md)**

Covers: implemented features, SaaS architecture details, PWA/offline state, validated components, known issues, remaining validation items.

### "What changed in development?"

→ Read **[CHANGELOG_DEV.md](CHANGELOG_DEV.md)**

Covers: features added, changes, fixes, and validation results by date.

### "What should I test before merging or deploying?"

→ Read **[TESTING_CHECKLIST.md](TESTING_CHECKLIST.md)**

Covers: automated validation commands, backend tests, frontend tests, connection tests, attendance flow tests, SaaS/multi-tenant tests, manual admin tests, production readiness checks.

### "How do I set up local development?"

→ Read **[README.md](README.md)**

Covers: prerequisites, quick start, environment setup, command reference.

---

## What NOT to Use

### Do NOT use PROJECT_SPEC.md for current guidance.

**Status:** HISTORICAL (2026-05-22)

This describes the initial single-tenant attendance application scaffold. It is no longer the current architecture.

Superseded by: **PROJECT_PLAN.md** (current SaaS architecture).

### Historical records — do not use as current contracts

`PROJECT_STATE.md`, `docs/governance/repository-baseline-audit.md`, `docs/audit-parties-1-a-4-17.md`, and dated phase/decision reports record what was observed or decided at their dates. They may contain old roles and architecture and must not be rewritten to match current product decisions. In particular, `docs/governance/v1-phase-1-role-migration-decision.md` is a dated migration decision, not current enum evidence.

### Do NOT use PROJECT_STATE.md for current status.

**Status:** OUTDATED HISTORICAL BASELINE (2026-07-28)

This is a baseline audit created **before SaaS models were implemented** (2026-08-28). It contradicts the current codebase.

Example: PROJECT_STATE.md claims "no organizational model" but the current schema has full Organization/User/Membership models.

Superseded by: **CURRENT_STATUS.md** (after updates).

### Do NOT use docs/governance/repository-baseline-audit.md for current guidance.

**Status:** OUTDATED HISTORICAL BASELINE (2026-07-28)

Same baseline as PROJECT_STATE.md. Preserved for governance history only.

---

## Timeline

| Date | Event | Current Docs |
|------|-------|--------------|
| 2026-05-22 | Initial project structure documented. | CURRENT_STATUS.md, PROJECT_PLAN.md (v1), TESTING_CHECKLIST.md. |
| 2026-07-28 | Baseline audit: describes pre-SaaS state. | PROJECT_STATE.md, docs/governance/repository-baseline-audit.md (**HISTORICAL**). |
| 2026-08-28 | SaaS foundation added to codebase (Organization, User, Membership, Subscription models). | Current product contract is PROJECT_PLAN.md; implementation status is CURRENT_STATUS.md. |
| 2026-09-05 | Organization readiness, employee PWA, and offline queue code were added. | Advanced offline remains standby; inspect CURRENT_STATUS.md for implementation limits. |
| 2026-09-24 | Organization/site contract alignment. | PROJECT_PLAN.md owns product target; architecture and status docs distinguish target from implementation gaps. |

---

## For Codex Tasks

1. **Before changing code:** Read **AGENTS.md** for agent/security/workflow rules and **PROJECT_PLAN.md** for the current product contract.
2. **Before implementing:** Inspect relevant code in **docs/ARCHITECTURE.md** and **docs/MODULE_REGISTRY.md**.
3. **After changes:** Check module against **CURRENT_STATUS.md** and **TESTING_CHECKLIST.md**.
4. **Record progress:** Add entry to **CHANGELOG_DEV.md** at end of session.

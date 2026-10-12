# RAM Project Timesheet and Handoff

**Last updated:** 2026-10-12 (local time, Asia/Kolkata)
**Purpose:** Record project work, current repository state, verification, and open actions so another developer or coding assistant can continue without relying on chat history.

> This is a work/change log, not an employee-hours timesheet. Exact time spent per task was not tracked and is intentionally not estimated.

## Work log

| Date | Work area | Changes and findings | Verification / status |
|---|---|---|---|
| 2026-10-08 | Local development setup | Started the user-installed PostgreSQL instance without requiring Windows administrator rights; configured the local `ram_user` / `ram_db` setup and ignored `backend/.env`; restored the original PostgreSQL host-authentication rules afterward. | PostgreSQL was accepting connections on port 5432; original backend and frontend health/page checks passed on ports 4000 and 5173. Do not publish or copy local environment secrets. |
| 2026-10-08 | Database initialization | `prisma migrate dev` could not create a shadow database with the local database user's privileges. A migration directory was found without `migration.sql`; Prisma comparison showed it introduced no schema delta, so an empty/no-op migration file was generated and migrations were applied with deploy mode. Seed data was loaded. | Migration deploy and seed succeeded. The no-op migration was later included in the Phase 1 PR commit. |
| 2026-10-08 | Phase 1 workflow test | Created a disposable database (`ram_phase1_test`) and used a separate backend/UI instance to exercise authentication, resource access, allocation capacity checks, allocation/reallocation, bench transitions, termination approval, maternity approval, portfolio authorization, reports/CSV, import flows, notifications, and role restrictions. Loaded the principal UI routes and exercised allocation from the UI. | Prior smoke tests and backend/frontend builds passed. The disposable database and test servers were removed/stopped. Do not assume the disposable database still exists. The normal `ram_db` was kept intact. |
| 2026-10-08 | Phase 1 gap review | Identified that quarantine discard returned success without removing the record; resource profile changes lacked audit history; manager filtering was incorrectly combined with general search; repository UI lacked experience and relocation filters; recommendations had no user-facing UI. | These were treated as Phase 1 fixes. Time tracking remains outside Phase 1 per the project requirements/README. |
| 2026-10-08 | Import quarantine | Changed quarantine discard to delete only records whose status is `QUARANTINED`, and write an audit entry containing the prior record in the same transaction. Non-quarantined records return 409. | Isolated API checks confirmed quarantined row is removed, audit preserves its prior contents, and a `CREATED` record cannot be discarded. |
| 2026-10-08 | Resource profile audit | Extended the shared audit helper to accept a Prisma transaction client. Profile field, skill, certification, and performance-record replacement now run in one transaction and write before/after audit data. | Isolated API checks confirmed saved child/scalar changes and before/after audit details. A deliberately duplicate certification returned a handled 500, rolled back profile and audit changes, and left API health available. |
| 2026-10-08 | Resource search and recommendations | Added independent manager filtering and UI/API filters for designation, country, certification, minimum skill experience, relocation willingness, and minimum/maximum cost (cost queries remain role-gated). Terminated resources are excluded unless a status filter is explicitly supplied. Added skill recommendations from the Resource Repository using the existing endpoint. | Isolated API checks passed for manager + search, skills/experience, certification without skills, relocation, designation/country, and React recommendations. Browser displayed the recommendation results for seeded React-skilled resources. |
| 2026-10-08 | Isolated Phase 1 integration verification | The configured app DB role lacked `CREATE DATABASE`, so no attempt was made to alter `ram_db`. Initialized a separate PostgreSQL cluster under the user profile on port 55432, applied all five migrations, and seeded it. | 26 API checks passed, including missing/non-quarantined quarantine behavior, RMG and Viewer access, cost/PIP redaction, profile audit and rollback, discard audit, filters, and recommendations. Normal `ram_db` was not used. The temporary test API/UI/cluster are stopped and the isolated data directory was removed after checks. |
| 2026-10-08 | Follow-up corrections | Integration testing exposed certification filtering accidentally nested inside the skills filter; moved it so certification-only search works. A failed profile transaction also exposed an unhandled async route rejection; now forwards errors to Express error middleware instead of terminating the API process. | Both issues were included in the passing isolated tests; backend build and diagnostics pass after the fixes. |
| 2026-10-08 | Documentation | Updated README Phase 1 traceability and recorded the isolated test scope and result. | Documentation reviewed. |
| 2026-10-08 | Phase 2 planning | Read the PDF roadmap and mapped Phase 2 Visibility & Matching requirements against current resources, recommendations, bench access, capacity, and reporting surfaces. Created a sequenced, decision-gated Phase 2 plan with scope boundaries, RBAC/PIP constraints, forecast definitions to approve, milestones, risks, and testable acceptance criteria. | Plan saved in `PHASE-2-PLAN.md` and linked from README. No Phase 2 implementation was started. |
| 2026-10-08 | Feature branch and PR | Created and pushed branch `phase-1-completion-phase-2-plan`; committed Phase 1 fixes, verification records, Phase 2 plan, documentation, and no-op migration as `a655f45` (`Complete Phase 1 gaps and plan Phase 2`). Opened PR #1 targeting the default branch `deploy-branch`. | PR is open at https://github.com/taopractice2004-pixel/RAM/pull/1. It contains two commits including the existing repository-safeguards commit in branch ancestry; no CI checks were listed. Pre-existing `backend/package.json` and `backend/package-lock.json` updates were left uncommitted and unstaged. |
| 2026-10-08 | Merge/checkpoint discussion | User asked whether to merge into `main` so deployment could be used as a rollback checkpoint. Remote inspection found `deploy-branch` as default and no remote `main`. Recommended checking whether updates to `deploy-branch` trigger deployment before merging and using a tag/release on the accepted commit as an immutable checkpoint. | No merge, tag, or deployment action has been performed. PR #1 remains open pending user decision; deployment trigger behavior is unverified. |
| 2026-10-08 | Handoff request | User clarified that “timesheet” means a durable, detailed project change log for another chatbot/developer, not an in-app employee time-entry feature. | This file is the requested handoff document. |
| 2026-10-12 | Phase 2 Milestone 0 baseline | Started Phase 2 baseline review. Current recommendation search ranks on matching-skill count and resource status; there is no pipeline-demand model; current-capacity and bench/termination report endpoints exist; no dedicated test files were found by the initial scan. Recorded the verified inventory in `PHASE-2-PLAN.md`. | Milestone 0 is in progress. No Phase 2 application code or database schema has been changed. User approved the documented PIP policy, equal match weights, missing-data treatment, weekly 26-week horizon, and deferring forecast weights pending business approval; demand units/lifecycle and supply calculation still need approval. |
| 2026-10-12 | Phase 2 decisions register | Created `PHASE-2-DECISIONS.md` as a separate management-editable register for approved decisions, pending choices, and change history; linked it from the Phase 2 plan and README. User approved fractional FTE-only demand, the Draft → Pipeline → Committed → Fulfilled lifecycle with cancellation before fulfillment, Admin/RMG edit with Delivery read-only, manual entry plus validated CSV import, the weekly supply calculation, one demand record per role requirement, visible partial skill/certification matches, scoring only specified dimensions, and threshold-based proficiency/experience matching. | Fourteen user-approved decisions are recorded; lifecycle edge transitions, confidence weights, future/partial leave timing, reporting, and detailed score mechanics remain pending. No Phase 2 application code or schema was changed. |
| 2026-10-12 | Phase 2 matching decisions | User approved retaining the existing resource-status tie-break order after the score: AVAILABLE, BENCH_TRUE, BENCH_COMMITTED, ALLOCATED; TERMINATED resources are excluded. | Fifteen approved decisions are recorded; dimension score aggregation remains pending. No matching code was changed. |
| 2026-10-12 | Phase 2 matching score decision | User approved an equal-weight formula across requested dimensions: skill coverage; satisfied proficiency/experience minimums; certification coverage; binary location/relocation; and capped available/requested FTE. Average requested dimensions, explain each component, then apply status tie-break. | Location-equivalence rules and the actual decision impact of PIP-aware matching remain pending. No matching code was changed. |
| 2026-10-12 | Phase 2 location matching decision | User approved exact case-insensitive normalized location or willingness to relocate as a location match. | Location scoring semantics are settled; PIP-aware matching decision impact remains pending. No application code was changed in this decision entry. |
| 2026-10-12 | Phase 2 certification matching decision | User approved counting a requested certification only when valid on the requested start date, or today when no start date is specified; null issue/expiry dates are unbounded. | Certification matching semantics are settled and implemented in the in-progress recommendation work. |
| 2026-10-12 | Phase 2 Milestone 1 matching implementation | Started non-PIP advanced recommendation work. API now validates optional criteria and computes requested-only equal-dimension scores/explanations for skill coverage, minimum proficiency/experience, valid certifications, exact location/relocation, and date-interval FTE availability. UI accepts criteria and displays match score, status, available FTE, and component explanations. | Backend and frontend production builds pass; six focused matching unit tests pass; diagnostics report no errors. No database was used. PIP-aware effects remain unimplemented pending decision P2-D25; isolated API/role integration tests and browser acceptance remain outstanding. |
| 2026-10-12 | Phase 2 implementation started | Following the user's instruction to start Phase 2, resumed Milestone 0/1, recorded the management decisions in `PHASE-2-DECISIONS.md`, and implemented the approved non-PIP recommendation scoring and UI with focused unit tests. | `npx tsx --test src/utils/resourceMatching.test.ts` passed 6/6; backend and frontend builds passed. No database was accessed, no demand schema/forecast/report code was started, and no commit/push was made. PIP scoring, isolated role/API verification, and browser acceptance remain incomplete. |

## Current project snapshot

- **Project:** RAM, a React/TypeScript frontend and Express/TypeScript/Prisma backend using PostgreSQL.
- **Phase:** Phase 1 core lifecycle MVP; Phase 2 Milestone 1 non-PIP recommendation improvements are in progress. Pipeline demand, weighted forecasts, report updates, PIP-aware matching, and Phase 2 acceptance are not complete.
- **Local database:** PostgreSQL user-install was set up under the user's profile; `backend/.env` is local and ignored. Never copy credentials from it into this document, source control, or messages.
- **Last confirmed app endpoints:** original backend `http://localhost:4000`; original frontend `http://localhost:5173`. Browser tabs at ports 5174/5175 were also present during checks; confirm their server/API before relying on them.
- **Development setup constraint:** `prisma migrate dev` requires shadow-database privileges unavailable to the local database user. Use the repo's deploy migration command for already-created migrations unless the database privilege setup changes.
- **Normal database safety:** `ram_db` contains seeded and exercised local app state. Avoid resetting, reseeding, dropping, or using destructive lifecycle tests against it. Use a newly created disposable database for integration tests.
- **Known original behavior:** Role/portfolio access follows the permission-matrix decisions documented in README. Keep those decisions consistent when extending routes and UI.
- **Phase 1 scope:** Employee time tracking is not part of Phase 1. Do not add it unless explicitly requested as a scope change.
- **Git state:** `origin` is `https://github.com/taopractice2004-pixel/RAM.git`. The last remote inspection found `deploy-branch` as default and no `main` branch. PR #1 is open from `phase-1-completion-phase-2-plan` to `deploy-branch`.
- **Merge/deployment caution:** It is not verified whether merging to `deploy-branch` triggers deployment. Confirm repository deployment configuration before merging; a Git tag/release at an accepted commit is a stronger immutable rollback reference than a moving deployment branch.

## Branch and working-tree changes

Committed as `a655f45` on `phase-1-completion-phase-2-plan`, included in open PR #1:

- `backend/src/routes/imports.ts` — transactional quarantine discard.
- `backend/src/routes/resources.ts` — additional filters and transactional resource update audit.
- `backend/src/utils/audit.ts` — transaction-client support for audit creation.
- `frontend/src/pages/Resources.tsx` — filters and skill recommendations UI.
- `frontend/src/types/index.ts` — recommendation response type.
- `README.md` — requirements and verification notes.
- `TIMESHEET.md` — this handoff log.
- `PHASE-2-PLAN.md` — proposed Phase 2 plan; decision gates remain open.
- `backend/prisma/migrations/20261005000000_add_pipeline_demand_forecasting/migration.sql` — required empty/no-op migration file.

Uncommitted, pre-existing dependency changes intentionally excluded from PR #1:

- `backend/package.json`
- `backend/package-lock.json`

Those package changes upgrade the declared `csv-parse` and `node-cron` ranges and update
lockfile dependencies; they have not been separately reviewed or validated for this PR.
Preserve them unless the user asks to review or discard them.

Generated `backend/dist` and `frontend/dist` changes from validation were restored. Check
`git status --short` and the current branch before further edits; do not discard unrelated
working-tree changes.

## Verification record and caveats

- `backend`: `npm run build` passed after the route/audit changes and async error-forwarding fix.
- `frontend`: `npm run build` passed after the repository UI changes. Vite reports a JavaScript bundle larger than 500 kB (warning, not a build failure).
- Editor diagnostics for the edited TypeScript files reported no errors.
- `git diff --check` passed before the final backend build; generated build output is restored after the final build.
- Browser rendered `/resources` and displayed React skill recommendations from isolated seeded data.
- No project test script or dedicated test suite was found in the package manifest during the prior work. Existing broad API smoke-test results are summarized above.
- **Still recommended before production:** complete a manual acceptance pass across all UI screens/roles and the full lifecycle matrix. The new feature gaps and related access checks above were validated against isolated seeded data, but they are not a replacement for user acceptance testing or deployment-specific verification.
- React Router v6 future-flag messages and the Vite chunk-size warning were observed; neither prevented the relevant app/build checks.

## Suggested next actions

1. Read this file and the current README before changing Phase 1 behavior.
2. Inspect `git status --short`, current branch, and PR #1; preserve the uncommitted package changes.
3. Use a disposable PostgreSQL database for all new integration tests; never reset the user's normal `ram_db`.
4. Complete user acceptance and deployment-specific checks before production release.
5. Before merging PR #1, verify whether merging to `deploy-branch` triggers a deployment. Tag/release the accepted commit if an immutable rollback reference is wanted; do not use a moving deployment branch as the only checkpoint.
6. Update this timesheet with dated entries whenever further project changes or tests are made. Record exact work duration only if it is actually measured.

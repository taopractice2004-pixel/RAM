# RAM Project Timesheet and Handoff

**Last updated:** 2026-10-08 (local time, Asia/Kolkata)
**Purpose:** Record project work, current repository state, verification, and open actions so another developer or coding assistant can continue without relying on chat history.

> This is a work/change log, not an employee-hours timesheet. Exact time spent per task was not tracked and is intentionally not estimated.

## Work log

| Date | Work area | Changes and findings | Verification / status |
|---|---|---|---|
| 2026-10-08 | Local development setup | Started the user-installed PostgreSQL instance without requiring Windows administrator rights; configured the local `ram_user` / `ram_db` setup and ignored `backend/.env`; restored the original PostgreSQL host-authentication rules afterward. | PostgreSQL was accepting connections on port 5432; original backend and frontend health/page checks passed on ports 4000 and 5173. Do not publish or copy local environment secrets. |
| 2026-10-08 | Database initialization | `prisma migrate dev` could not create a shadow database with the local database user's privileges. A checked-in migration directory was found without `migration.sql`; Prisma comparison showed it introduced no schema delta, so an empty/no-op migration file was generated and migrations were applied with deploy mode. Seed data was loaded. | Migration deploy and seed succeeded. The no-op migration remains untracked at `backend/prisma/migrations/20261005000000_add_pipeline_demand_forecasting/migration.sql`. |
| 2026-10-08 | Phase 1 workflow test | Created a disposable database (`ram_phase1_test`) and used a separate backend/UI instance to exercise authentication, resource access, allocation capacity checks, allocation/reallocation, bench transitions, termination approval, maternity approval, portfolio authorization, reports/CSV, import flows, notifications, and role restrictions. Loaded the principal UI routes and exercised allocation from the UI. | Prior smoke tests and backend/frontend builds passed. The disposable database and test servers were removed/stopped. Do not assume the disposable database still exists. The normal `ram_db` was kept intact. |
| 2026-10-08 | Phase 1 gap review | Identified that quarantine discard returned success without removing the record; resource profile changes lacked audit history; manager filtering was incorrectly combined with general search; repository UI lacked experience and relocation filters; recommendations had no user-facing UI. | These were treated as Phase 1 fixes. Time tracking remains outside Phase 1 per the project requirements/README. |
| 2026-10-08 | Import quarantine | Changed quarantine discard to delete only records whose status is `QUARANTINED`, and write an audit entry containing the prior record in the same transaction. Non-quarantined records return 409. | Isolated API checks confirmed quarantined row is removed, audit preserves its prior contents, and a `CREATED` record cannot be discarded. |
| 2026-10-08 | Resource profile audit | Extended the shared audit helper to accept a Prisma transaction client. Profile field, skill, certification, and performance-record replacement now run in one transaction and write before/after audit data. | Isolated API checks confirmed saved child/scalar changes and before/after audit details. A deliberately duplicate certification returned a handled 500, rolled back profile and audit changes, and left API health available. |
| 2026-10-08 | Resource search and recommendations | Added independent manager filtering and UI/API filters for designation, country, certification, minimum skill experience, relocation willingness, and minimum/maximum cost (cost queries remain role-gated). Terminated resources are excluded unless a status filter is explicitly supplied. Added skill recommendations from the Resource Repository using the existing endpoint. | Isolated API checks passed for manager + search, skills/experience, certification without skills, relocation, designation/country, and React recommendations. Browser displayed the recommendation results for seeded React-skilled resources. |
| 2026-10-08 | Isolated Phase 1 integration verification | The configured app DB role lacked `CREATE DATABASE`, so no attempt was made to alter `ram_db`. Initialized a separate PostgreSQL cluster under the user profile on port 55432, applied all five migrations, and seeded it. | 26 API checks passed, including missing/non-quarantined quarantine behavior, RMG and Viewer access, cost/PIP redaction, profile audit and rollback, discard audit, filters, and recommendations. Normal `ram_db` was not used. The temporary test API/UI/cluster are stopped and the isolated data directory was removed after checks. |
| 2026-10-08 | Follow-up corrections | Integration testing exposed certification filtering accidentally nested inside the skills filter; moved it so certification-only search works. A failed profile transaction also exposed an unhandled async route rejection; now forwards errors to Express error middleware instead of terminating the API process. | Both issues were included in the passing isolated tests; backend build and diagnostics pass after the fixes. |
| 2026-10-08 | Documentation | Updated README Phase 1 traceability and recorded the isolated test scope and result. | Documentation reviewed. |
| 2026-10-08 | Phase 2 planning | Read the PDF roadmap and mapped Phase 2 Visibility & Matching requirements against current resources, recommendations, bench access, capacity, and reporting surfaces. Created a sequenced, decision-gated Phase 2 plan with scope boundaries, RBAC/PIP constraints, forecast definitions to approve, milestones, risks, and testable acceptance criteria. | Plan saved in `PHASE-2-PLAN.md` and linked from README. No Phase 2 implementation was started. |
| 2026-10-08 | Handoff request | User clarified that “timesheet” means a durable, detailed project change log for another chatbot/developer, not an in-app employee time-entry feature. | This file is the requested handoff document. |

## Current project snapshot

- **Project:** RAM, a React/TypeScript frontend and Express/TypeScript/Prisma backend using PostgreSQL.
- **Phase:** Phase 1 core lifecycle MVP; requirements source is `Resource Allocation and Management.pdf`.
- **Local database:** PostgreSQL user-install was set up under the user's profile; `backend/.env` is local and ignored. Never copy credentials from it into this document, source control, or messages.
- **Last confirmed app endpoints:** original backend `http://localhost:4000`; original frontend `http://localhost:5173`. Browser tabs at ports 5174/5175 were also present during checks; confirm their server/API before relying on them.
- **Development setup constraint:** `prisma migrate dev` requires shadow-database privileges unavailable to the local database user. Use the repo's deploy migration command for already-created migrations unless the database privilege setup changes.
- **Normal database safety:** `ram_db` contains seeded and exercised local app state. Avoid resetting, reseeding, dropping, or using destructive lifecycle tests against it. Use a newly created disposable database for integration tests.
- **Known original behavior:** Role/portfolio access follows the permission-matrix decisions documented in README. Keep those decisions consistent when extending routes and UI.
- **Phase 1 scope:** Employee time tracking is not part of Phase 1. Do not add it unless explicitly requested as a scope change.

## Current working-tree changes

Intentional source/document changes from Phase 1 gap work:

- `backend/src/routes/imports.ts` — transactional quarantine discard.
- `backend/src/routes/resources.ts` — additional filters and transactional resource update audit.
- `backend/src/utils/audit.ts` — transaction-client support for audit creation.
- `frontend/src/pages/Resources.tsx` — filters and skill recommendations UI.
- `frontend/src/types/index.ts` — recommendation response type.
- `README.md` — requirements and verification notes.
- `TIMESHEET.md` — this handoff log.
- `PHASE-2-PLAN.md` — proposed Phase 2 plan; decision gates remain open.

Changes that predated the Phase 1 source edits and must be preserved:

- `backend/package.json`
- `backend/package-lock.json`
- The untracked no-op migration SQL listed above.

Generated `backend/dist` and `frontend/dist` changes from validation were restored. Check `git status --short` before making further edits; do not discard unrelated working-tree changes.

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
2. Inspect `git status --short` and preserve the pre-existing package changes and local no-op migration.
3. Use a disposable PostgreSQL database for all new integration tests; never reset the user's normal `ram_db`.
4. Complete user acceptance and deployment-specific checks before production release.
5. Update this timesheet with dated entries whenever further project changes or tests are made. Record exact work duration only if it is actually measured.

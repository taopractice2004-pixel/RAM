# Resource Allocation & Management (RAM) System — Phase 1 (MVP)

A full-stack implementation of the **Resource Allocation & Management System** requirements
document (`Resource Allocation and Management.pdf`), covering the **Phase 1 — MVP: Core
Lifecycle** roadmap milestone (Section 10): daily HRMIS/import & validation, allocation,
reallocation, bench detection (committed/true), termination/offboarding with active-allocation
checks, portfolio-scoped role-based access, basic filters, core dashboard, and basic reporting.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Vite, React Router, TanStack Query, Tailwind CSS, Recharts |
| Backend | Node.js 22 + TypeScript + Express, Prisma ORM, JWT auth, node-cron |
| Database | PostgreSQL 16, running in Docker |
| Infra | Docker Compose (Postgres, Adminer, backend API, frontend static site via Nginx) |

## Quick start (Docker)

```bash
docker compose up -d --build
# first time only: seed demo data
docker compose exec backend npm run seed
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000/api
- Adminer (DB browser): http://localhost:8081 (System: PostgreSQL, Server: `postgres`, User: `ram_user`, Password: `ram_password`, DB: `ram_db`)

> **Port note:** Postgres is published on host port **5433** (not 5432), because this machine
> already had an unrelated prior project (`T:\RAM System\`) running its own Postgres container
> on 5432. Internal container-to-container traffic (backend → postgres) is unaffected and still
> uses port 5432 on the Docker network.

### Demo logins (password for all: `Password123!`)

| Email | Role | Notes |
|---|---|---|
| admin@ram.com | ADMIN | Full access, all portfolios |
| rmg@ram.com / rmg2@ram.com | RMG | Granted authorization on all 3 seeded portfolios |
| delivery.fin@ram.com | DELIVERY | Authorized only for Financial Services |
| delivery.health@ram.com | DELIVERY | Authorized only for Healthcare |
| hr@ram.com | HR | Org-wide compensation/performance/termination-approval access |
| ta@ram.com | TA | Read-only bench/skill visibility |
| viewer@ram.com | VIEWER | Read-only, authorized for Financial Services only |

## Deploying a shareable link (free)

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for deploying to Render + Neon on the
free tier: a permanent public URL, no installation for whoever you share it with.

## Local development (without Docker)

```bash
# 1. Start just Postgres + Adminer
docker compose up -d postgres adminer

# 2. Backend
cd backend
npm install
npx prisma migrate dev   # applies schema to local Postgres (localhost:5433)
npm run seed
npm run dev               # http://localhost:4000

# 3. Frontend (separate terminal)
cd frontend
npm install
npm run dev               # http://localhost:5173
```

## Architecture

```
backend/
  prisma/schema.prisma     Data model (Users, Portfolios, Resources, Allocations, ...)
  prisma/seed.ts           Demo data: 3 portfolios, 8 users, 12 resources, 4 projects
  src/routes/              One file per capability area (resources, allocations, bench, ...)
  src/services/            Business logic: import validation, bench classification, capacity checks
  src/middleware/          JWT auth + role/portfolio RBAC enforcement
  src/jobs/                node-cron: daily import, allocation transitions, bench aging alerts

frontend/
  src/pages/               One page per capability area
  src/components/          Shared UI: layout, modals, status badges, notifications
  src/context/AuthContext  JWT session state
```

## Requirements traceability (Phase 1 scope)

| Requirement doc section | Implemented as |
|---|---|
| FR-1.1–1.5 (Resource repository & import) | `Resource`/`Skill`/`Certification` models; searchable repository filters; audited profile updates; `POST /imports/run`, `/imports/upload`; quarantine review and audited discard UI (Admin → Import & Quarantine) |
| FR-2.1–2.4 (Allocation) | `POST /allocations`, capacity/conflict check (`services/allocationService.ts`), partial allocation via `allocationPercent` |
| FR-3.1–3.4 (Reallocation) | `POST /allocations/:id/reallocate`, cross-portfolio authorization check on both losing & receiving portfolio, stakeholder notifications, full history via `reallocatedFromId` chain |
| FR-4.1–4.4 (Bench management) | Automatic transition on unassignment/allocation end (`services/benchService.ts`), Committed vs. True classification, RMG/TA aging alerts |
| FR-5.1–5.4 (Termination) | `POST /terminations`, blocks on active allocations (or force-close with audit), mandatory HR approval step, historical data retained |
| FR-6.1 (Availability visibility) | Dashboard + Bench view, scoped by portfolio authorization |
| FR-7.1–7.2 (Performance/PIP) | `PerformanceRecord` model, visibility restricted to HR/RMG/Delivery (see Design Decisions) |
| FR-8.1–8.2 (Skill matching) | Skill recommendations from the Resource Repository; filters on `GET /resources` for skills, skill experience, certifications, cost, location, relocation, manager, designation, country, portfolio, and status |
| FR-10.1, 10.3, 10.4 (Reporting) | `/reports/utilization`, `/reports/capacity`, `/reports/bench-aging`, `/reports/termination-trends` — JSON or CSV export |
| FR-11.1–11.3 (Guardrails/alerts) | Conflict blocking at allocation/reallocation time, bench-aging notifications, incomplete-termination blocking |
| FR-12.1–12.5 (Access control) | `middleware/rbac.ts`, `PortfolioAuthorization` model, blocked-action audit logging, RMG/HR cross-portfolio read bypass for dashboards |
| Section 7.1–7.5 (Workflows) | Implemented as described, including scheduled-future allocations with no unnecessary bench pass-through on direct handoff |

**Explicitly out of Phase 1** (per Section 9.2 / Roadmap Phase 2–4, not implemented here):
demand forecasting, performance/PIP-aware matching *suggestions*, automated guardrail
*resolution suggestions* (conflicts are still detected and blocked — the "suggest a fix"
part is Phase 3), time tracking, profitability (cost vs. revenue) reporting, bidirectional
HR/Payroll & ERP integrations, and public/partner-facing APIs.

The proposed Phase 2 scope, decision gates, milestones, and acceptance criteria are recorded
in [PHASE-2-PLAN.md](PHASE-2-PLAN.md), with management approvals and pending choices tracked
separately in [PHASE-2-DECISIONS.md](PHASE-2-DECISIONS.md). Phase 2 implementation has begun
with non-PIP recommendation matching improvements; the overall phase is not complete. The
timesheet records current implementation and verification status.

## Design decisions & assumptions

The source requirements document has a few internal inconsistencies between its narrative
(Section 5.1, FR-2.x, FR-1.1, FR-12.3, Workflow 7.5) and its summary permissions matrix
(Section 5.3). **The app now follows the Section 5.3 matrix exactly, by explicit instruction**,
even where it conflicts with the narrative text elsewhere in the doc:

- **Delivery cannot allocate, reallocate, or manually reallocate from bench** — despite
  Section 5.1's narrative, FR-2.2, FR-3.1, and Workflow 7.2 step 3 describing Delivery as
  submitting/executing these actions directly. Delivery is read-only: they can search/filter
  resources and view skill-match recommendations (FR-8.1 lists them as a primary consumer of
  that), but RMG (or Admin) must execute the actual allocate/reallocate/terminate action.
- **Cost and performance/PIP visibility follow the matrix's per-role, per-portfolio rule**:
  Admin and HR see both fields on every resource; RMG sees them only for resources in a
  portfolio they hold an explicit `PortfolioAuthorization` grant for (not a blanket bypass);
  Delivery, TA, and Viewer never see either field, on any resource, in any portfolio — even
  within their own authorized portfolio. This overrides FR-1.1/FR-7.1's broader consumer lists.
- **Non-sensitive resource profile fields (name, skills, certifications, location, status,
  allocation history) are visible to every role, across every portfolio, with no authorization
  gate** — matching the matrix's "All" for that row and TA's persona goal of checking bench
  talent org-wide before opening an external requisition. Only the two sensitive fields above
  are gated.
- **RMG cannot manage portfolio authorizations** — despite FR-12.3 explicitly naming "an
  Administrator or RMG lead" as able to grant/modify/revoke them. Admin only, per the matrix.
  RMG retains the ability to configure bench thresholds (the matrix's next row grants this to
  both Admin and RMG).
- **Termination approval**: only the matrix's RMG cell carries a "(with HR approval)" caveat —
  Admin and HR terminate immediately (auto-approved); an RMG-initiated request enters
  `PENDING_HR_APPROVAL` and notifies HR. This supersedes Workflow 7.5 step 3's "HR approval is
  required regardless of who initiates."
- RMG's separate cross-portfolio **read bypass** for dashboards/reports/forecasting (FR-12.5)
  is unaffected by the above — that's a different concept the Section 5.3 matrix doesn't cover,
  since it's about aggregate/forecasting views rather than any of its 9 named actions.

## Verification status

Backend TypeScript compilation and frontend type-check/production build pass. The Resource
Repository route renders in the browser with the added filters and skill recommendations.
The quarantine discard flow, profile audit transaction and rollback, added search filters,
recommendation API, and Viewer cost/performance redaction were exercised against a separately
initialized, seeded PostgreSQL test cluster; 26 isolated API assertions passed. Earlier API
smoke tests exercised the core Phase 1 lifecycle flows. The user's normal `ram_db` was not
used for these integration checks. A full manual acceptance pass across every role and screen
is still recommended before production use.

# Resources & Allocations discovery

## 1. Allocation data model and lifecycle

`backend/prisma/schema.prisma` defines `Allocation` with `projectId`, integer `allocationPercent`, `startDate`, nullable `endDate`, `status`, and optional `roleOnProject` / `projectReportingManagerName`. `Project` also has a nullable `endDate`, but the active assignment's date is `Allocation.endDate`. No separate stored expected-bench-date field exists. Resource has `status` and nullable `benchSince`.

`backend/src/routes/allocations.ts` creates ACTIVE allocations for immediate starts, changes the resource to ALLOCATED and clears `benchSince`; future starts are SCHEDULED. On unassign it closes an active allocation and calls `reclassifyResourceBenchStatus`. Ended active allocations are transitioned by the scheduled job in `backend/src/services/benchService.ts`. Resource transitions to BENCH_COMMITTED or BENCH_TRUE based on committed window; `benchSince` records when bench began. Reallocation can hand off directly without a bench pass-through.

## 2. Ageing and bench start date

`backend/src/utils/resourcePresentation.ts:19` derives `daysOnBench` as non-negative whole elapsed days from `benchSince`. `deriveProjectedBenchStartDate` at line 36 returns the active allocation's `endDate` unless an overlapping scheduled allocation starts before or on that end date; no date is returned without an active end date. This value is the projected date, not a computed Days to bench count. For the proposed screen, expected bench date should be a stored bench date if one exists, otherwise allocation/project end date + 1 day; the field currently has no dedicated storage.

## 3. Portfolio Manager and RMG recipients

A project belongs to a `Portfolio` via `Project.portfolioId`. Portfolio has optional `managerName` text, not a manager user ID/email relation; therefore current data can name a Portfolio Manager but cannot reliably resolve an email recipient. RMG users can be found by `User.role === RMG`; the current schema associates RMG users to portfolios through active `PortfolioAuthorization` grants. No project-specific RMG team mapping exists. `backend/src/services/allocationService.ts` has `notifyPortfolioStakeholders`, which creates in-app notifications for users authorized to the relevant portfolios (plus bypass roles), but this is not an email lookup.

## 4. Roles and permission checks

Existing Prisma enum roles in `backend/prisma/schema.prisma`: ADMIN, RMG, DELIVERY, HR, TA, VIEWER. There are no PMO or Portfolio Manager role values today.

All API routes are authentication-protected in `backend/src/index.ts` using `requireAuth`. Server role and portfolio checks live in `backend/src/middleware/rbac.ts`: `requireRole`, `assertPortfolioAuthorized`, `LIFECYCLE_ACTION_ROLES`, cost and PIP visibility helpers. Allocation create/reallocate/unassign require ADMIN or RMG and authorized portfolio scope (`backend/src/routes/allocations.ts`). Resources UI uses `useAuth` for conditional cost controls (`frontend/src/pages/Resources.tsx`) while backend enforces the actual sensitive-data rules in `backend/src/routes/resources.ts`. Allocation page has no separate role checks (`frontend/src/pages/Allocations.tsx`).

## 5. Mailer and audit log

No mailer, SMTP configuration, or email-sending library was found in backend source/package dependencies. Existing notifications are in-app (`Notification` model, `backend/src/services/allocationService.ts`). Audit logging exists: `AuditLog` model in `backend/prisma/schema.prisma`, helper `writeAudit` in `backend/src/utils/audit.ts`, and route/service calls record allocation lifecycle and resource changes. No generic application event emitter was found.

## 6. Pagination

Resources API (`backend/src/routes/resources.ts`) uses server-side `page` and `pageSize`, defaults to 25 and caps page size at 100; returns `total`, `page`, `pageSize`, `resources`. `frontend/src/pages/Resources.tsx` requests pageSize 100 and fetches remaining pages. Allocations API (`backend/src/routes/allocations.ts`) returns the full filtered list with no pagination.

## 7. Recommend-by-skills

Implementation: `backend/src/routes/resources.ts`, `GET /recommendations/search`. It validates query inputs (skills required; optional certifications, min proficiency/experience, required FTE and date range, portfolio, max cost, location), finds non-terminated resources, scores skills/certifications/location/availability through `backend/src/utils/resourceMatching.ts` (`scoreResourceMatch`, `getAvailableFte`), and ranks matches. Existing UI is in `frontend/src/pages/Resources.tsx`, with skill input and recommendation results; query inputs include skills and optional certification, proficiency, experience, location, availability, portfolio and cost.

## Current screen relationship decision

The Resources screen uses all pages of `/resources` for employee identity, status and server-derived ageing, then only portfolio-readable ACTIVE/SCHEDULED `/allocations` for displayed assignment details. It keeps one employee row and lists all readable projects; when multiple readable allocations exist it does not select an arbitrary end date or edit target. An embedded assignment that is not readable through `/allocations` cannot be shown, and prevents inferring a bench date from the remaining readable assignments. A single active allocation with an end date has an expected bench date one calendar day later unless the server projection is explicitly null (for example a handoff). Multiple concurrent or scheduled allocations have no approved combined expected-bench-date rule; their assignment-specific dates and actions remain available in resource detail. No new API or stored expected-bench-date field was added.

## 8. NEEDS DECISION (recommended answers)

1. **Expected bench date:** use active allocation `endDate + 1 calendar day`; if an explicit bench date is added/stored later, prefer it. Do not use `Project.endDate` when allocation-specific end date exists.
2. **Moving-to-bench window:** 60 days, configurable; default 60. Existing `BenchConfig` configures committed window and true-bench aging threshold, not this display window. Add a dedicated screen setting later rather than repurposing either threshold.
3. **Portfolio Manager email recipient:** current `Portfolio.managerName` is not resolvable to a user/email. Recommended decision: add an explicit user relation or recipient email field before sending email; do not guess by matching names.
4. **RMG Team recipients:** use all active users with role RMG, restricted to relevant portfolio authorization grants for the project. Admin bypass users are not RMG Team members.
5. **New edit roles:** requested PMO and Portfolio Manager roles do not exist in current role enum. Recommended: retain current ADMIN/RMG authorization model until the exact mapping and portfolio-scoped rules are approved; do not add broad UI-only role checks.
6. **Role label:** map `Role` column to resource `designation` (shown as Role in the prompt/mockup); allocation `roleOnProject` is a distinct optional field and should remain available as a separate hidden field.
7. **Status scope:** include Available, Allocated, Bench committed, Bench true and On ML as prompt specifies; exclude TERMINATED by default, matching Resources API behavior.
8. **Project end date meaning:** display/edit the allocation `endDate` for the employee's current assignment; project metadata `Project.endDate` is a separate field. Keep date display in dd/mm/yyyy as in mockup; timezone/date-only persistence needs care because Prisma uses DateTime.

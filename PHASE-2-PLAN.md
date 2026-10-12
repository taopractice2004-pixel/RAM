# RAM Phase 2 Plan — Visibility & Matching

**Status:** Milestone 1 non-PIP matching implementation in progress; demand/forecast/report work has not started
**Requirements baseline:** `Resource Allocation and Management.pdf`, Sections 4.6, 4.8, 4.10, 5, 6, 7.6, 8, 9.2, and 10
**Product baseline:** Phase 1 core lifecycle MVP, with current implementation status recorded in `README.md` and `TIMESHEET.md`
**Audience:** Product owner, RMG, Delivery, TA, HR, engineers, QA, and future coding assistants

## 1. Executive summary

Phase 2 should improve staffing visibility and decision support without taking over the
allocation authority or replacing Phase 1 lifecycle workflows. It should deliver:

1. Better skill-based candidate matching, with transparent match explanations.
2. Permissioned use of performance/PIP data in matching; sensitive data must never leak to
   unauthorized users through fields, filters, ranking, counts, or error messages.
3. Basic, explainable demand-versus-supply forecasting using pipeline and planned-project
   demand.
4. Useful bench-aging and termination-trend reporting, improving and validating the reports
   that already exist.
5. TA access to bench visibility, consistent with the requirements and the repository's
   documented role/visibility decisions.

Phase 2 is complete only when the measurable acceptance criteria in this plan pass on a clean,
isolated database and the product owner accepts the definitions and permission behavior below.
This plan does not declare Phase 2 implemented.

## 2. Source requirements and boundaries

### In scope per the PDF roadmap (Section 10, Phase 2)

- Advanced skill matching.
- Performance/PIP-aware matching, permissioned.
- Basic demand forecasting.
- Bench-aging and termination-trend reporting.
- TA read access to bench data.

### Related requirements to satisfy or reconcile

- **FR-6.2:** Forecast demand based on pipeline/planned projects.
- **FR-6.3:** Detect over- or under-utilization.
- **FR-8.1:** Recommend resources for allocation/reallocation.
- **FR-8.2:** Match/filter by skills, experience, certifications, cost, PIP, and qualifications.
- **FR-10.3:** Capacity planning reports and forward-looking forecasts.
- **FR-10.4:** Bench-aging and termination-trend reports.
- **FR-12.1–12.5:** Role permissions, portfolio scope, blocked-action logging, and permitted
  cross-portfolio read visibility.
- **Section 7.6:** Enter/import pipeline demand; aggregate demand against supply by skill,
  location, and time period; flag forecast gaps; make results available to RMG, TA, and
  leadership.
- **Section 8:** Security, least privilege, auditability, performance, reliability, and usability.

### Explicitly out of Phase 2

Do not include these without a separately approved scope change:

- Bidirectional HR/payroll or ERP/financial integrations.
- Time entry, timesheet approval, or actual-hours utilization reconciliation.
- Profitability reporting based on revenue versus cost.
- Automated conflict-resolution suggestions or proactive alerting programs assigned to Phase 3.
- Predictive/ML forecasting or predictive utilization analytics (Phase 4).
- Public/partner APIs, ATS integration, or self-service leadership report authoring.
- Rework of Phase 1 role decisions unless the product owner approves a change.

## 3. Existing implementation inventory (verify before building)

Do not duplicate features already present. Confirm their behavior with focused tests and
upgrade only the missing parts:

| Capability | Current known state | Phase 2 action |
|---|---|---|
| Skill recommendations | Existing `/resources/recommendations/search` ranks candidates by skill match and resource status; a UI entry point now exists. It does not yet provide an advanced, fully explained match profile or permissioned PIP-aware matching. | Improve scoring/explanations, verify access behavior, and add PIP-aware matching only under the approved permission policy. |
| Resource filters | Skills, skill experience, certifications, cost (role-gated), location, relocation, manager, designation, country, portfolio, and status filters exist. | Test combined filter semantics and make missing Phase 2 qualifications available without exposing sensitive data. |
| Bench view | `GET /bench` and a UI view exist; non-sensitive bench data is currently visible org-wide, including TA. | Verify the role/portfolio matrix against the PDF and README; preserve safe read-only TA access. Do not grant TA lifecycle actions. |
| Bench-aging report | `/reports/bench-aging` and CSV output exist. | Validate threshold semantics, portfolio scoping, filters, totals, and boundary dates; improve UI if needed. |
| Termination-trend report | `/reports/termination-trends` and CSV output exist. | Validate reason/status/date/portfolio scoping and export behavior; add useful period summaries and filters if absent. |
| Capacity report | `/reports/capacity` summarizes current resource-state supply. It is not a forward-looking demand forecast. | Reuse its concepts where appropriate; do not present it as a forecast. |
| Project/pipeline data | Current project records support lifecycle projects; no complete pipeline-demand planning model has been verified. | Add an explicit planned-demand model and controlled workflow after data definitions are approved. |
| Sensitive performance/PIP | Performance records exist and resource detail redacts them for unauthorized roles. | Reuse the field-level permission helper; also secure filters, ranking effects, totals, CSVs, and forecast outputs. |

## 4. Decisions required before implementation

The following decisions materially affect schema, matching, and reporting. Resolve them in a
short product-owner/RMG/HR/TA workshop before Milestone 2. Suggested defaults are proposals,
not silent assumptions.

| Decision | Recommended initial default | Why it must be decided |
|---|---|---|
| Forecast time grain and horizon | Weekly buckets for the next 26 weeks; show the horizon as a user-selectable report filter only if performance remains acceptable. | Defines planned demand dates, supply calculations, chart/table shape, and meaningful forecast limits. |
| Demand confidence | Store a required confidence stage or probability on each demand item; initially use named stages (for example, pipeline / likely / committed) with centrally configured weights. Do not hard-code guessed probabilities into code. | Avoids treating uncertain pipeline as guaranteed demand and makes totals explainable. |
| Demand unit | Required headcount/FTE per role requirement, with start/end date, skill requirements, and work location/portfolio. | Enables meaningful supply-versus-demand comparisons. |
| Supply definition | Follow the approved weekly supply rule in `PHASE-2-DECISIONS.md`. Future/partial leave timing remains pending because the verified schema does not provide a leave date range. | Prevents double-counting people and keeps Phase 1 allocation rules authoritative. |
| Match weights and minimum qualification | Exact skill must be an explicit match; score skill coverage, proficiency, experience, certification, location/relocation, and future availability. Product owner/RMG approve weights and tie-breakers. | Recommendations affect staffing decisions and need predictable, explainable behavior. |
| PIP-aware use | Only an explicitly authorized user may enable/use the PIP criterion. Unauthorized users get the same non-PIP result as if the criterion were not requested, with no PIP-related count, rank, or error signal. | A hidden PIP signal can still disclose sensitive data through ordering or result changes. |
| PIP policy versus current permission matrix | Current README says Admin/HR always see sensitive fields, RMG sees fields only in explicitly granted portfolios, Delivery/TA/Viewer never see them. Preserve this unless HR/legal and product owner explicitly approve a new matrix. | PDF personas and matrix descriptions conflict in places; README records the previously instructed matrix precedence. |
| TA bench scope | Preserve current organization-wide, read-only bench visibility unless product owner chooses portfolio-restricted read access. TA receives no allocation, reallocation, or termination actions. | Requirements call for TA bench visibility; current README says non-sensitive profiles are visible org-wide. |
| Report date basis | Use actual termination completion date and documented termination reason codes; define treatment of reopened/rejected requests. | Prevents trend totals from mixing requests, decisions, and completed offboarding events. |
| Demand create/edit authority | Start with RMG and Admin; allow Delivery read-only forecast view. Decide if Delivery may propose demand for RMG review. | Controls data ownership and prevents unreviewed pipeline data from distorting planning. |
| Historical snapshots | Begin with reproducible as-of calculations plus a recorded generation timestamp; persist snapshots only if users need historical forecast accuracy comparison. | Snapshotting adds storage, migration, retention, and correction behavior. |

**Decision record:** The authoritative, management-editable decisions and approval history are
maintained in [PHASE-2-DECISIONS.md](./PHASE-2-DECISIONS.md). Do not infer approval from the
recommended defaults in this plan. Review the register before beginning schema changes or
changing sensitive-data behavior.

## 5. Roles and data protection requirements

Use existing RBAC and portfolio-scope helpers rather than introducing a parallel security
model.

| Role | Phase 2 experience (subject to current documented matrix) |
|---|---|
| Admin | Cross-portfolio forecast/report visibility and authorized sensitive data access. |
| RMG | Cross-portfolio aggregated capacity/forecast visibility; sensitive resource-level PIP/cost only for explicitly authorized portfolios as documented. |
| Delivery | Read-only matching/forecast views within the existing role policy; no sensitive cost/PIP data and no new lifecycle permissions. |
| TA | Read-only bench visibility and demand/forecast data required for staffing decisions; no cost/PIP, no lifecycle actions. |
| HR | Sensitive performance/PIP and termination trend access consistent with the existing policy. |
| Viewer | No new sensitive-data visibility; read-only resource visibility follows the current documented matrix. |

Security acceptance:

- Enforce both role and portfolio scope on every endpoint, export, and UI data source.
- Do not include PIP status, rating, PIP-specific match reasons, or equivalent derived flags in
  unauthorized API responses.
- If PIP influences matching, do not let it change unauthorized result membership, order,
  match score, totals, pagination, or error messages.
- Log sensitive PIP access and any attempt to access restricted criteria using the project's
  audit conventions.
- Cost/PIP filters must not become a blind oracle for users who cannot view the underlying field.
- Deny invalid/unknown roles and out-of-scope portfolio requests; create no success-shaped fallback.
- Test exports using the same permissions as their corresponding screens/endpoints.

## 6. Delivery plan and exit criteria

Complete milestones in order. Each milestone has an explicit exit gate; do not start forecast
implementation against undefined pipeline assumptions.

### Milestone 0 — Phase 2 baseline and decisions

**Work**

- Trace each Phase 2 roadmap item to current UI/API/schema behavior and focused tests.
- Confirm Section 5 role/matrix precedence with product owner; retain the current documented
  decisions unless approved otherwise.
- Decide forecast horizon/grain, demand lifecycle, stage confidence, input owner, supply
  formula, and match scoring.
- Record decisions in this file and establish sanitized acceptance fixtures.

**Exit criteria**

- Every Phase 2 deliverable is classified as existing-and-verified, existing-needs-change, or
  new.
- No unresolved decision blocks the data model or access-control model.
- RMG, TA, HR, and product owner accept the written definitions and role matrix.

### Milestone 1 — Match quality and permission foundation

**Work**

- Define a deterministic, explainable candidate score and tie-break order.
- Account for required skills, proficiency/experience, certifications, location/relocation,
  availability over the requested date interval, and allocation capacity.
- Keep lifecycle status as a secondary preference; never rank an unavailable or terminated
  resource as allocatable.
- Add authorized-only PIP-aware scoring/filtering without exposing the signal to unauthorized
  callers.
- Return structured, non-sensitive match explanations for each matched dimension.
- Keep recommendation API backward-compatible where practical; version the API if response
  semantics cannot remain compatible.

**Exit criteria**

- Unit tests prove score components, missing/optional criteria, tie-breaking, date overlap,
  partial capacity, and status ordering.
- Integration tests prove same criteria produce deterministic results for equivalent data.
- PIP-aware and PIP-unaware results match the approved policy; unauthorized results reveal no
  PIP influence through data, ordering, count, or errors.
- Existing allocation conflict and capacity checks remain authoritative when a recommendation
  is later acted upon.

### Milestone 2 — Pipeline demand data and maintenance

**Work**

- Add a `DemandRequest` (or equivalent) model only after Milestone 0 confirms field definitions.
  Minimum proposed fields: portfolio, project/client label or safe identifier, role/skills,
  required proficiency/experience, certification requirements, location, FTE/headcount,
  start/end dates, confidence stage, status, owner, created/updated timestamps, and audit
  metadata.
- Define lifecycle states (proposed, pipeline, committed, fulfilled, cancelled/closed) and
  allowed transitions.
- Provide authorized create/edit/list/detail/close actions with validation and audit history.
- Prevent invalid ranges, negative demand, duplicate/ambiguous imports, and silent changes to
  committed records.
- Initially use manual entry and/or CSV template only if product owner approves; do not imply an
  HRMIS/ERP integration.

**Exit criteria**

- Valid/invalid input cases and each state transition are integration-tested.
- Changes record actor, timestamp, before/after values, and reason where required.
- Portfolio authorization is enforced for create, edit, view, export, and close operations.
- Data can be corrected or cancelled without destroying its audit trail.

### Milestone 3 — Basic explainable forecast

**Work**

- Aggregate supply and weighted demand by the approved time grain, portfolio, skill, and
  location.
- Supply accounts for active assignments, overlapping schedule windows, allocation percent,
  upcoming releases, available/bench resources, leave/ON_ML, and termination.
- Demand uses approved confidence-stage weights and required role/FTE/date values.
- Report projected surplus/shortage, periods, skill/location mismatches, and source records.
- Show assumptions, confidence inputs, generation time, and plain-language explanations.
- Label this as a planning estimate, not a commitment or automated staffing decision.
- Keep Phase 3 integrations, alert notifications, and Phase 4 predictive models separate.

**Exit criteria**

- Hand-calculated fixtures match API forecast numbers exactly across bucket boundaries,
  overlaps, partial allocations, date changes, and cancellations.
- Changing confidence, demand dates, project state, or allocation dates updates only affected
  forecast periods and respects permissions.
- No person is counted above 1.0 FTE supply for the same interval across all commitments.
- Results are stable and explainable; no ML or unsupported confidence is implied.
- Load/performance target is agreed and measured against an anonymized dataset sized to the
  expected near-term organization.

### Milestone 4 — Bench and termination trend reporting

**Work**

- Verify existing bench aging calculation against the configured threshold, timezone, null
  `benchSince`, committed versus true bench classification, and exact threshold boundary.
- Add report filters for portfolio, period, classification, and aging band where useful.
- Verify termination trends distinguish completed terminations from pending, rejected, and
  approved-but-not-completed requests.
- Add period summaries (for example, monthly counts by reason/portfolio) only after HR approves
  reason-code semantics and minimum aggregation safeguards.
- Keep row-level sensitive fields appropriately permissioned; test JSON and CSV identically.

**Exit criteria**

- Bench ages at threshold-minus-one, exact-threshold, and threshold-plus-one produce expected
  results.
- Report totals reconcile to source records and behave under portfolio-scope restrictions.
- Termination date/reason definitions and exclusions are documented and accepted by HR.
- JSON and CSV row counts, columns, filters, and redactions agree.

### Milestone 5 — TA bench and forecast access

**Work**

- Validate TA can inspect non-sensitive bench profiles, skills, certifications, status, and
  availability needed for sourcing.
- Give TA read-only access to Phase 2 demand/forecast fields necessary to plan hiring, subject
  to the approved portfolio policy.
- Keep allocation, reallocation, bench-state changes, termination, cost, and PIP actions/data
  denied where the existing matrix denies them.
- Update navigation/help text to distinguish forecast demand from approved project assignments.

**Exit criteria**

- Browser/API tests confirm TA can complete the agreed read workflows and cannot perform
  mutation actions.
- Unauthorized portfolio and sensitive-field tests pass for endpoints and downloads.
- Business users confirm the page explains forecast uncertainty and next steps.

### Milestone 6 — Integrated acceptance and release candidate

**Work**

- Run migration deploy against a clean disposable PostgreSQL database and seed safe test data.
- Run backend/frontend type-check/build and all unit/integration/API tests.
- Perform an end-to-end acceptance matrix for Admin, RMG (authorized and unauthorized
  portfolios), Delivery, TA, HR, and Viewer.
- Check accessibility basics, empty/error/loading states, pagination, CSV export, and moderate
  data volume.
- Update README traceability, this plan's decision record, and `TIMESHEET.md`.

**Exit criteria**

- All Phase 2 criteria pass; no unresolved Severity 1/2 defects.
- Product owner, RMG, HR, and TA sign off the outcomes relevant to their roles.
- Migration/rollback plan is written and verified on disposable data.
- Phase 2 remains staging/pilot-only until separate production-readiness controls are approved.

## 7. Phase 2 acceptance matrix

| ID | Acceptance test | Expected result |
|---|---|---|
| P2-MATCH-01 | Search for a role with multiple required skills and qualifications. | Candidates show matched/missing criteria and are ordered by the approved deterministic score. |
| P2-MATCH-02 | Candidate has some but not all required skills. | Partial match is clearly explained; no false full-match indicator. |
| P2-MATCH-03 | Candidate has enough general availability but not in the requested date interval. | Not shown as available for that interval, or clearly marked unavailable; existing capacity validation still rejects an invalid assignment. |
| P2-MATCH-04 | Compare otherwise equivalent profiles with PIP-aware criterion off/on as an authorized user. | Only approved PIP-aware ranking/filter behavior changes, with an auditable access event. |
| P2-SEC-01 | Delivery, TA, Viewer, or out-of-scope RMG requests PIP-aware matching. | No PIP values, PIP-derived order/count/score, or distinguishable PIP error leak. |
| P2-SEC-02 | User tries to view or export demand in an unauthorized portfolio. | Request denied or safely scoped; blocked attempt is logged per existing policy. |
| P2-FORECAST-01 | Compare a hand-calculated dataset of resources, allocations, demand stages, and dates. | Forecast supply, weighted demand, gap, skill, location, and time buckets equal the documented calculation. |
| P2-FORECAST-02 | Resource has partial, concurrent allocations and future release dates. | Supply uses date overlap and never double-counts above 1.0 FTE. |
| P2-FORECAST-03 | Demand is changed from pipeline to committed, then cancelled. | Forecast changes according to approved stage weights; cancelled demand is excluded and remains auditable. |
| P2-REPORT-01 | Bench age tested immediately before, at, and after threshold. | Threshold flags and classifications match documented boundary semantics. |
| P2-REPORT-02 | Compare termination requests in pending, rejected, approved, and completed states. | Trend report includes exactly the accepted completion population and approved date basis. |
| P2-TA-01 | TA opens bench and forecast screens. | Read-only, usable non-sensitive information is visible; forbidden actions and fields are absent. |
| P2-EXPORT-01 | Export scoped reports as CSV and compare with JSON. | Same filters, scope, totals, and redaction apply; CSV formula injection is safely handled. |
| P2-MIG-01 | Apply migrations to a new disposable database, then verify migration status. | All migrations deploy cleanly; normal development database remains unchanged. |

## 8. Data and API design guidance

These are design constraints, not final schema/API contracts:

- Keep forecast demand separate from `Project` lifecycle records unless product decisions
  establish an unambiguous lifecycle relationship. Pipeline demand is not automatically a
  committed project.
- Prefer explicit demand entities over encoding pipeline state in free-text project status.
- Use database transactions for multi-table writes and audit entries.
- Validate API input with repository-standard Zod schemas and return clear 4xx errors for user
  input. Let unexpected server errors reach standard error middleware.
- Use typed Prisma query inputs where practical; avoid widening `any` surfaces.
- Add indexes for portfolio, lifecycle state, date range, demand status, and any measured
  high-selectivity query.
- Avoid storing a computed score as authoritative data. Store input/decision history as
  necessary; calculate or snapshot only with a documented reason.
- Keep API response fields stable, documented, and permission-filtered before serialization.
- Give CSV output stable columns and safe handling for cells beginning with spreadsheet formula
  characters.
- Do not modify or seed the normal local database while developing Phase 2.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| PIP data leaks via ranking even when the field is hidden. | Treat the PIP criterion as an authorization-sensitive operation; verify output invariance for unauthorized roles. |
| Pipeline demand is mistaken for committed work. | Use explicit stages, approved confidence weights, visible assumptions, and separate committed/project labels. |
| Incorrect availability double-counts partially allocated resources. | Use interval-overlap calculations and hand-checked test fixtures; retain allocation capacity validation as the final authority. |
| Forecasts are not trusted because inputs are stale. | Show source, owner, updated time, stage, and stale-data indicators; define ownership and review cadence. |
| Current report scope is inconsistent. | Reconcile all report queries with shared RBAC/scope helpers and test JSON/CSV under each role. |
| Phase 2 grows to include Phase 3 integrations or time tracking. | Enforce the explicit out-of-scope list and require change approval for added work. |
| Existing roadmap claims exceed verified features. | Maintain a requirements trace table and distinguish built, tested, accepted, and deferred states. |

## 10. Required project records

Before implementation begins:

1. Complete pending items in `PHASE-2-DECISIONS.md` with approver/date/rationale.
2. Add a requirements-to-code/test traceability list for each Phase 2 item.
3. Create focused test cases for forecast math, score determinism, permission boundaries, and
   report reconciliation.
4. Keep milestone completion and measured work in `TIMESHEET.md`; do not invent effort hours.
5. Update README only when implementation status changes; this plan is not evidence that a
   feature already exists.

### Milestone 0 baseline log

| Date | Baseline finding | Status |
|---|---|---|
| 2026-10-12 | Recommendation search currently matches requested skills, filters optional portfolio/location/cost, and ranks by matched-skill count plus resource status. It does not account for requested proficiency/experience, certifications, availability dates, or provide per-dimension explanations. | Existing capability; Milestone 1 needs change. |
| 2026-10-12 | Prisma has no pipeline-demand model. Existing Project and Allocation records describe operational project assignments, not confidence-weighted planned demand. | New capability; demand schema is blocked on approved definitions. |
| 2026-10-12 | Capacity is a current resource-status count. Bench-aging and termination-trend JSON/CSV endpoints exist; no dedicated focused test files were found during the baseline scan. | Existing reports; correctness, scope, and export behavior still need focused verification. |

### Milestone 1 progress log

| Date | Change | Status |
|---|---|---|
| 2026-10-12 | Extended recommendation search to calculate requested-dimension match scores and explanations for skills, minimum proficiency/experience, certifications valid at the requested start date (or today), exact case-insensitive location/relocation, and requested-date FTE availability. Added criteria inputs and score explanations in the Resource Repository. No PIP data is queried or used. | Implementation in progress. Backend/frontend production builds pass; six focused matching unit tests pass. PIP-aware behavior, isolated API/role tests, and manual UI acceptance remain incomplete. |

## 11. Continuation prompt for a future assistant

> Read `PHASE-2-PLAN.md`, `README.md`, and `TIMESHEET.md` before editing. Inspect the current
> working tree and preserve unrelated changes. Do not implement Phase 2 until the decision
> table in Section 4 has been approved. Work milestone-by-milestone, use a disposable
> PostgreSQL database, test permission boundaries including indirect PIP leaks, update the
> plan/timesheet with actual results, and do not touch the normal `ram_db`.

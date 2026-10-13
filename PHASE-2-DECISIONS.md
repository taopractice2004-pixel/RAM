# Phase 2 Management Decision Register

**Status:** Working register; Milestone 1 matching/PIP rules are in place, the Milestone 2 demand model and initial weekly forecast foundation are implemented, and the current focus is Milestone 4 bench/termination reporting validation plus final Phase 2 acceptance work.
**Purpose:** Keep management-approved Phase 2 decisions separate from the technical plan so
they can be reviewed and changed without searching implementation notes.
**Decision owner:** Management / designated product owner. Record the approver and date for
every decision.
**Related plan:** [PHASE-2-PLAN.md](./PHASE-2-PLAN.md)

## How to use this register

- Treat only entries marked **Approved** as settled requirements.
- **Pending** entries are not permission to assume the proposed value.
- To change an approved decision, update its value, approver, date, and rationale, and add a
  concise note to the change history. Review code, tests, and the Phase 2 plan for affected
  behavior before implementation continues.
- Keep security, privacy, and audit requirements intact unless management explicitly approves
  a policy change with the appropriate HR/security review.

## Approved decisions

| ID | Area | Approved decision | Approved by / date | Rationale |
|---|---|---|---|---|
| P2-D01 | PIP-aware matching permissions | Retain the existing documented matrix: Admin and HR may use PIP-aware matching; RMG only within explicitly authorized portfolios; Delivery, TA, and Viewer must not receive PIP data or results influenced by PIP. Unauthorized requests must not reveal PIP through result membership, ranking, counts, scores, or errors. | User, 2026-10-12 | Preserve the existing README policy and prevent direct or indirect disclosure of sensitive performance information. |
| P2-D02 | Matching weights | Use equal weights for required-skill coverage, proficiency/experience, certifications, location/relocation, and availability/capacity over requested dates. Resource status is only a secondary preference and is not part of the match score. | User, 2026-10-12 | Provide a straightforward, explainable initial ranking. |
| P2-D03 | Missing profile data | Missing information counts as no match for that dimension and is explicitly shown as missing in the explanation. Do not remove that dimension from the score denominator. | User, 2026-10-12 | Avoid silently rewarding incomplete profiles. |
| P2-D04 | Forecast time grain and horizon | Weekly forecast buckets for a 26-week horizon. | User, 2026-10-12 | Establish an initial useful near-term planning window. |
| P2-D05 | Demand confidence weights | Implement named demand stages, but do not calculate confidence-weighted forecast totals until management/RMG approves the stage weights. Do not hard-code or imply unapproved probabilities. | User, 2026-10-12 | Keep demand entry possible without presenting speculative forecasts as fact. |
| P2-D06 | Demand quantity unit | Store demand as FTE only, allowing fractional values. | User, 2026-10-12 | Aligns demand quantity with capacity calculations and avoids redundant headcount/FTE fields. |
| P2-D07 | Demand lifecycle stages | Use Draft → Pipeline → Committed → Fulfilled, with Cancelled allowed before fulfillment. | User, 2026-10-12 | Separates early-stage demand from committed work and permits cancellation before completion. |
| P2-D08 | Weekly supply calculation | For each resource/week, count free supply as max(0, 1.0 FTE minus the sum of overlapping ACTIVE/SCHEDULED allocation percentages). AVAILABLE and bench resources contribute their unallocated capacity; ON_ML and TERMINATED resources contribute zero. | User, 2026-10-12 | A 40% assignment leaves 60% free; over-allocation never creates negative supply; leave and terminated resources are not available capacity. |
| P2-D10 | Demand create/edit authority | Admin and RMG may create/edit demand; Delivery is read-only. | User, 2026-10-12 | Keeps demand ownership with planning roles while allowing Delivery visibility. |
| P2-D11 | Demand entry/import | Support manual entry and a validated CSV template/import in the first release; no HRMIS/ERP integration. | User, 2026-10-12 | Allows controlled bulk entry without implying system integration. |
| P2-D15 | Partial matching behavior | Show candidates missing requested skills or certifications as partial matches with lower scores and explicit missing criteria; do not exclude them solely for those gaps. | User, 2026-10-12 | Makes recommendations useful while avoiding false full-match indicators. |
| P2-D20 | Requested versus unspecified dimensions | Score only dimensions specified in the search/demand requirement. If a requested dimension has missing profile data, score it as a no-match and explain the missing data. | User, 2026-10-12 | Avoids penalizing candidates for criteria not requested while keeping incomplete requested data visible. |
| P2-D21 | Minimum proficiency/experience matching | For a requested minimum proficiency or experience threshold, award a match only when the candidate meets the threshold; below-threshold or missing values are a miss for that dimension. | User, 2026-10-12 | Keeps qualification results straightforward and explainable; partial candidates may still appear based on other dimensions. |
| P2-D22 | Match-score tie-break order | After match score, rank AVAILABLE before BENCH_TRUE, then BENCH_COMMITTED, then ALLOCATED. TERMINATED resources are excluded. | User, 2026-10-12 | Retains the existing preference order as a secondary tie-break. |
| P2-D23 | Match score calculation | For each requested dimension: skill coverage is matched required skills / requested skills; proficiency/experience is satisfied minimum checks / requested minimum checks; certification coverage is matched requested certifications / requested certifications; location/relocation is a binary match; availability is free FTE / requested FTE, capped at 100%. Average only requested dimensions, show component reasons, then apply the approved status order as tie-break. | User, 2026-10-12 | Uses transparent, comparable dimension scores and preserves equal weighting among dimensions actually requested. |
| P2-D24 | Matching location semantics | A requested location matches an exact case-insensitive normalized profile location; otherwise a candidate matches when willing to relocate. | User, 2026-10-12 | Applies a simple binary location/relocation score and provides an explicit explanation. |
| P2-D26 | Certification validity in matching | Count a requested certification only if its issue date is on/before and expiry date is on/after the requested start date; when no start date is supplied, validate against today. A null issue or expiry date is treated as unbounded on that side. | User, 2026-10-12 | Prevents expired or not-yet-issued certifications from counting as current qualifications. |
| P2-D25 | PIP influence on matching | For a user authorized to view PIP data, show an authorized-only PIP indicator; do not change match score, candidate membership, or ranking based on PIP. Unauthorized users must not receive the indicator or any PIP-derived result. | User, 2026-10-12 | Makes sensitive context visible only where permitted without using PIP as a staffing recommendation factor. |
| P2-D27 | PIP indicator date basis | Use only the most recent dated performance record for each resource. If no record exists, return an unknown/absent indicator rather than inferring a negative status. | User, 2026-10-12 | Avoids exposing historical PIP as if it were current and avoids treating missing performance data as "not on PIP". |
| P2-D19 | Demand record granularity | Each demand record represents one role requirement with its own skill/qualification profile, FTE quantity, and dates. Different roles for the same project are separate records. | User, 2026-10-12 | Keeps role-level matching and supply/demand comparison unambiguous and makes one CSV row map to one requirement. |

## Pending management/product decisions

Recommended values below are copied from the Phase 2 plan for discussion. They are not
approved and must not be treated as implementation requirements until this register is
updated.

| ID | Decision needed | Plan proposal for discussion | Status | Approver / date | Notes |
|---|---|---|---|---|---|
| P2-D09 | Demand confidence-stage names and weights | Named stages such as pipeline, likely, and committed; weights to be supplied and approved by RMG/product owner. | Pending | — | Forecast weighting remains blocked until values are approved. |
| P2-D12 | TA bench scope | Plan proposal: retain organization-wide, read-only access to non-sensitive bench profiles; TA has no allocation, reallocation, or termination actions. | Pending | — | Confirm or choose portfolio-restricted read access. |
| P2-D13 | Termination trend date and population | Plan proposal: use actual completion date and approved reason codes; exclude pending, rejected, and approved-but-not-completed requests. | Pending | — | HR to confirm date basis, reason semantics, and treatment of reopened cases. |
| P2-D14 | Historical forecast snapshots | Plan proposal: calculate reproducibly as of request time and record generation time; persist snapshots only if historical accuracy comparisons are needed. | Pending | — | Confirm retention and correction behavior if snapshots are requested. |
| P2-D16 | Report privacy/aggregation | Confirm whether HR requires minimum group sizes or suppression for termination reason/portfolio summaries. | Pending | — | Avoid identifying individuals from small-group reporting. |
| P2-D17 | Demand lifecycle edge transitions | Decide whether a demand can move backwards between stages, whether Cancelled/Fulfilled records may be reopened, and what approvals/reasons are required for corrections after commitment. | Pending | — | Do not assume reversals or reopen behavior from the stage names alone. |
| P2-D18 | Absence timing in supply | Define how current/future ON_ML and any partial leave affect weekly supply. Existing maternity-leave records do not expose a leave date range in the verified schema. | Pending | — | The approved rule excludes resources currently marked ON_ML; future/partial leave cannot be calculated until dates are available and semantics approved. |

## Change history

| Date | Change | Recorded by |
|---|---|---|
| 2026-10-12 | Created register and recorded the five Phase 2 decisions explicitly approved by the user; listed unresolved decisions separately. | Project assistant |
| 2026-10-12 | Approved FTE-only demand quantities, allowing fractional values; removed this item from pending decisions. | Project assistant (user decision) |
| 2026-10-12 | Approved Draft → Pipeline → Committed → Fulfilled demand stages, with cancellation permitted before fulfillment; recorded lifecycle edge transitions separately as pending. | Project assistant (user decision) |
| 2026-10-12 | Approved Admin/RMG demand create/edit authority with Delivery read-only access. | Project assistant (user decision) |
| 2026-10-12 | Approved manual demand entry plus validated CSV template/import for the initial release; HRMIS/ERP integration remains out of scope. | Project assistant (user decision) |
| 2026-10-12 | Approved weekly supply calculation: subtract overlapping ACTIVE/SCHEDULED allocation percentages from 1.0 FTE, floor free capacity at zero, count AVAILABLE/bench residual capacity, and exclude ON_ML/TERMINATED. Future/partial leave timing remains pending. | Project assistant (user decision) |
| 2026-10-12 | Approved one demand record per role requirement, with separate records for different roles on the same project. | Project assistant (user decision) |
| 2026-10-12 | Approved showing partial matches for missing requested skills/certifications with lower scores and explicit explanations; detailed score mechanics remain pending. | Project assistant (user decision) |
| 2026-10-12 | Approved scoring only dimensions specified by the request; missing profile data for a requested dimension is a no-match with an explanation. | Project assistant (user decision) |
| 2026-10-12 | Approved existing secondary resource-status tie-break order: AVAILABLE, BENCH_TRUE, BENCH_COMMITTED, ALLOCATED; TERMINATED excluded. | Project assistant (user decision) |
| 2026-10-12 | Approved equal-weight match calculation: coverage for requested skills, minimum qualification checks, certifications, binary location/relocation, and capped available/requested FTE; average requested dimensions, explain components, then apply status tie-break. Location equivalence and PIP decision semantics remain pending. | Project assistant (user decision) |
| 2026-10-12 | Approved exact case-insensitive location matching or willingness-to-relocate as a binary location match. | Project assistant (user decision) |
| 2026-10-12 | Approved certification validity check at requested start date, or today if no start date is supplied; null issue/expiry dates are unbounded. | Project assistant (user decision) |
| 2026-10-12 | Approved an authorized-only PIP indicator that does not alter match score, candidate membership, or ranking. Date/current-status semantics remain pending. | Project assistant (user decision) |
| 2026-10-12 | Approved basing the authorized-only PIP indicator on the most recent dated performance record only; no record means unknown/absent, not a negative PIP assertion. | Project assistant (user decision) |
| 2026-10-12 | Approved minimum proficiency/experience semantics: meet threshold for a match; below-threshold or missing values are misses for the requested dimension. | Project assistant (user decision) |

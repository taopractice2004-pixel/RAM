# Resources & Allocations field inventory

This is the current `frontend/src/resourcesAllocations/fields.ts` registry, not a proposed API contract. It contains **38 fields**. The nine default-visible fields, in `DEFAULT_COLUMNS` order (the registry's `defaultOrder` values are 2–10), are **1 Emp ID, 2 Emp name, 3 Role, 4 Status, 5 Ageing, 6 Project, 7 Project end date, 8 Days to bench, 9 Manager**. Twenty-nine fields are available in Customize columns, subject to the sensitive-field role gate. Project role, Reallocated, Location, Minimum skill experience, Available %, FTE, Skill proficiency, Certification issuer, and Certification issue date remain in the registry for their existing sort/filter/export or feature behavior, but cannot be selected as columns. Customize also prunes these keys from previously saved column preferences. Emp ID and Emp name remain pinned in the table; Customize restores `name` on Apply. The selection checkbox and Action column are not registry fields.

In the table, **Filterable** and **Sortable** mean flags in the frontend registry: they describe client-side row filtering/sorting, **not** backend query capabilities. **API mapping** identifies the value actually displayed from a response or derived in the client; a query parameter, when available, is explicitly marked `GET`. **Permission** `read` means the authenticated Resources view can read ordinary resource fields; allocation-derived cells depend on the readable `/allocations` response, which is portfolio-scoped. `sensitive` means the UI only offers the field to ADMIN/RMG/HR, while the backend redacts its value by resource portfolio (ADMIN/HR all; RMG authorized portfolios only; DELIVERY/TA/VIEWER never). UI role visibility is not itself a per-portfolio authorization check.

| Field key | Label | Type | Source | Filterable | Sortable | Default visible | API mapping | Sensitive | Permission |
|---|---|---|---|---|---|---|---|---|---|
| employeeId | Emp ID | text | resources | Yes | Yes | Yes (1) | resource `employeeId`; GET `/resources?q` searches name or ID | No | read |
| name | Emp name | text | resources | Yes | Yes | Yes (2) | resource `name`; GET `/resources?q` searches name or ID | No | read |
| designation | Role | text | resources | Yes | Yes | Yes (3) | resource `designation`; GET `/resources?designation` | No | read |
| status | Status | select | resources | Yes | Yes | Yes (4) | resource `status`; GET `/resources?status` (comma-separated) | No | read |
| daysOnBench | Ageing | number | resources | **No** (dedicated ageing control) | Yes | Yes (5) | resource `daysOnBench`, derived by backend from bench status/dates | No | read |
| project | Project | select | allocations | Yes | Yes | Yes (6) | selected allocation `project.name`; GET `/allocations?project` searches name, not a field-filter request | No | readable allocation |
| projectEndDate | Project end date | date | allocations | Yes | Yes | Yes (7) | selected allocation `endDate` (not project `endDate`) | No | readable allocation; edit restricted to ADMIN or RMG with authorized portfolio |
| daysToBench | Days to bench | number | computed from resources/allocations | Yes | Yes | Yes (8) | client `daysToBench` from `expectedBenchDate` (projected bench start or active allocation/project end + 1 day), calendar-day difference from today | No | read |
| managerName | Manager | text | resources | Yes | Yes | Yes (9) | resource `managerName`; GET `/resources?managerName` | No | read |
| allocationPercent | Allocation % | number | allocations | Yes | Yes | No | selected allocation `allocationPercent` | No | readable allocation |
| roleOnProject | Project role | text | allocations | Yes | Yes | No | selected allocation `roleOnProject` | No | readable allocation |
| projectReportingManagerName | Reporting manager | text | allocations | Yes | Yes | No | selected allocation `projectReportingManagerName` | No | readable allocation |
| allocationStartDate | Start date | date | allocations | Yes | Yes | No | selected allocation `startDate`; GET `/allocations?startDate&endDate` bounds allocation **start** | No | readable allocation |
| allocationStatus | Allocation status | select | allocations | Yes | Yes | No | selected allocation `status`; GET `/allocations?status` | No | readable allocation |
| reallocated | Reallocated | boolean | allocations | Yes | Yes | No | client boolean from selected allocation `reallocatedFrom` (not `reallocatedFromId` in frontend type); GET `/allocations?reallocated` | No | readable allocation |
| resourceLocation | Location | text | resources | Yes | Yes | No | `workLocation || location`; GET `/resources?location` tests `location` only | No | read |
| workLocation | Work location | text | resources | Yes | Yes | No | resource `workLocation`; no dedicated list query parameter | No | read |
| country | Country | text | resources | Yes | Yes | No | resource `country`; GET `/resources?country` | No | read |
| gender | Gender | select | resources | Yes | Yes | No | resource `gender`; GET `/resources?gender` (UI does not send it) | No | read |
| portfolio | Portfolio / vertical | select | resources | Yes | Yes | No | resource `portfolio.name`; GET `/resources?portfolioId` takes ID, not displayed name | No | read; options from `/portfolios` scoped to readable portfolios |
| subCategory | Subcategory | select | resources | Yes | Yes | No | presented resource `subCategory`; GET `/resources?subCategory` | No | read |
| skills | Skills / Skillset | text | resources | Yes | Yes | No | comma-joined `skills[].skill.name`; GET `/resources?skills` uses comma-separated skill names | No | read |
| skillExperience | Minimum skill experience (years) | number | resources | Yes | Yes | No | maximum `skills[].yearsExperience` (0 when none); GET `/resources?minExperience` | No | read |
| taoExperience | TAO experience (years) | number | resources | Yes | Yes | No | presented `taoExperienceYears`; GET `/resources?minTaoExperience` | No | read |
| certifications | Certification | text | resources | Yes | Yes | No | comma-joined `certifications[].name`; GET `/resources?certification` is singular | No | read |
| willingToRelocate | Willing to relocate | boolean | resources | Yes | Yes | No | resource `willingToRelocate`; GET `/resources?willingToRelocate` | No | read |
| costRate | Cost rate | number | resources | Yes | Yes | No | resource `costRate` (converted to number for display), formatted with `currency`; GET `/resources?minCost&maxCost` | Yes, cost | ADMIN/HR all; RMG authorized portfolios only; others never; UI role-gated |
| email | Email | text | resources | No | No | No | resource `email`; no list email filter | Personal contact data; not marked `sensitive` in registry | read; no separate email redaction in this endpoint |
| dateOfJoining | Date of joining | date | resources | Yes | Yes | No | resource `dateOfJoining`; indirectly used by GET `/resources?minTaoExperience` | No | read |
| priorExperienceYears | Prior experience (years) | number | resources | Yes | Yes | No | resource `priorExperienceYears` | No | read |
| totalYearsExperience | Total experience (years) | number | resources | Yes | Yes | No | presented `totalYearsExperience` | No | read |
| availablePercentForDeployment | Available % | number | resources | Yes | Yes | No | presented `availablePercentForDeployment` | No | read |
| overallFte | FTE | number | resources | Yes | Yes | No | presented `overallFte` | No | read |
| skillsProficiency | Skill proficiency | number | resources | No | Yes | No | maximum `skills[].proficiency`; recommendations only: `minProficiency` | No | read |
| certificationIssuer | Certification issuer | text | resources | No | Yes | No | joined `certifications[].issuer` | No | read |
| certificationIssueDate | Certification issue date | date | resources | No | Yes | No | latest `certifications[].issueDate` | No | read |
| certificationExpiryDate | Certification expiry date | date | resources | No | Yes | No | earliest `certifications[].expiryDate` | No | read |
| pipStatus | PIP status | boolean | resources (detail only) | No | No | No | `performanceRecords[0].pipStatus` on detail; **not included in `/resources` list** | Yes, performance | ADMIN/HR all; RMG authorized portfolios only; others never; list column may show — even when permitted |

## Field filter catalog (Resources & Allocations table)

`FilterControls` receives only registry fields with `filterable: true`, minus sensitive fields for roles other than ADMIN/RMG/HR. These are **31** available field filters for eligible roles (**30** for other roles). All operate client-side on rows already fetched; selecting them does **not** append their equivalent GET parameters. Text uses contains/exact (case-insensitive); skills/certifications use entered tags and all/any substring checks against individual skill/certification names. Numbers and dates use inclusive min/max; booleans offer Any/Yes/No. Select checkboxes match any selected option within a field; distinct fields combine with AND. Missing numeric/date values never match ranges, and invalid or empty ranges are rejected. Date fields use timestamps and max date through end-of-day. Unrecognized filter keys are ignored.

Option source below is specifically the **field picker** `optionValues`, not an API contract. `none` means the picker supplies no options; an empty select cannot normally be chosen. All defaults are **unset** (`filters: []`), even for default-visible columns. “Multi” means OR within each select field.

| Field key | Label | Type | Option source / input | Default | Multi/single | Permission |
|---|---|---|---|---|---|---|
| employeeId | Emp ID | text | free text | unset | single | read |
| name | Emp name | text | free text | unset | single | read |
| designation | Role | text | free text | unset | single | read |
| status | Status | select | fixed ALLOCATED, BENCH_COMMITTED, BENCH_TRUE, ON_ML, TERMINATED | unset | multi (any selected) | read |
| project | Project | select | distinct project names from loaded resource allocations, not `/projects` | unset | multi (any selected) | readable allocation |
| projectEndDate | Project end date | date | date range; next 30/60/90 day shortcuts | unset | range | readable allocation |
| daysToBench | Days to bench | number | numeric min/max | unset | range | read |
| managerName | Manager | text | free text | unset | single | read |
| allocationPercent | Allocation % | number | numeric min/max | unset | range | readable allocation |
| roleOnProject | Project role | text | free text | unset | single | readable allocation |
| projectReportingManagerName | Reporting manager | text | free text | unset | single | readable allocation |
| allocationStartDate | Start date | date | date range; last 1/3 calendar years shortcuts | unset | range | readable allocation |
| allocationStatus | Allocation status | select | fixed ACTIVE, SCHEDULED, CLOSED, CANCELLED; projected row only ACTIVE/SCHEDULED | unset | multi (any selected) | readable allocation |
| reallocated | Reallocated | boolean | Any/Yes/No (fixed optionValues unused) | unset | single | readable allocation |
| resourceLocation | Location | text | free text | unset | single | read |
| workLocation | Work location | text | free text | unset | single | read |
| country | Country | text | free text | unset | single | read |
| gender | Gender | select | fixed FEMALE, MALE, OTHER, UNDISCLOSED | unset | multi (any selected) | read |
| portfolio | Portfolio / vertical | select | names from `/portfolios` (read-scoped); names matched against row portfolio | unset | multi (any selected) | read |
| subCategory | Subcategory | select | distinct values in loaded resources | unset | multi (any selected) | read |
| skills | Skills / Skillset | text | manually entered tags, all/any substring match | unset | multi tags | read |
| skillExperience | Minimum skill experience (years) | number | numeric min/max against maximum skill years | unset | range | read |
| taoExperience | TAO experience (years) | number | numeric min/max | unset | range | read |
| certifications | Certification | text | manually entered tags, all/any substring match | unset | multi tags | read |
| willingToRelocate | Willing to relocate | boolean | Any/Yes/No | unset | single | read |
| costRate | Cost rate | number | numeric min/max; optionValues from loaded cost values unused | unset | range | ADMIN/HR all; RMG authorized portfolios; UI hides for other roles |
| dateOfJoining | Date of joining | date | date range; last 1/3 calendar years shortcuts | unset | range | read |
| priorExperienceYears | Prior experience (years) | number | numeric min/max | unset | range | read |
| totalYearsExperience | Total experience (years) | number | numeric min/max | unset | range | read |
| availablePercentForDeployment | Available % | number | numeric min/max | unset | range | read |
| overallFte | FTE | number | numeric min/max | unset | range | read |

`daysOnBench`/Ageing is **not** in Add filter: its separate bench-ageing control defaults to All and provides 0–30, 31–60, >60 days or a custom inclusive min/max, excluding null ageing outside All. Separate status chips default to none and allow multiple statuses, including TERMINATED. Terminated resources remain excluded by default but appear when that status is selected by a status chip or filter. The local search defaults to empty and matches name, ID, manager, selected project name, or individual skill names; it is distinct from server `q`. The moving-to-bench strip's “View all” adds a `daysToBench` range of 0–60. Sorting defaults to the separate non-registry `benchPriority` rule. Stored per-user columns, sort rules and validated field filters use localStorage (cost filters are never persisted); search, status chips and ageing are not persisted. The UI's custom ageing editor applies only valid non-negative inclusive bounds and Reset restores All. The 31–60 preset includes day 60; 60+ starts at day 61.

## Query filters outside the field picker

The Resources page also declares legacy repository filter state `q`, `skills`, `location`, `manager`, `certification`, `designation`, `country`, `minExperience`, `minTaoExperience`, `minCost`, `maxCost`, `portfolioId`, `subCategory`, `relocation`, and `statuses`; these are passed to `GET /resources` as `q`, `skills`, `location`, `managerName`, `certification`, `designation`, `country`, `minExperience`, `minTaoExperience`, `minCost`, `maxCost`, `portfolioId`, `subCategory`, `willingToRelocate`, and comma-separated `status`. In the current page these repository-filter states have no rendered input controls (apart from `skills` in the recommendation panel); they default empty. The UI fetches all pages of `/resources` with `pageSize=100` (server caps at 100), then fetches `/allocations` without parameters. Resource list defaults to excluding TERMINATED unless `status` is supplied. `/allocations` defaults to ACTIVE/SCHEDULED and applies portfolio read scope; the client replaces/attaches allocation lists and projects **one** allocation per resource: latest-start ACTIVE, otherwise earliest-start SCHEDULED. Field filters cannot search full allocation history. The resource list itself is not portfolio-scoped for ordinary fields; `/portfolios` options and `/allocations` reads have their own scope. Cost filters are only sent by the page for ADMIN/RMG/HR; backend accepts cost bounds only for these roles and redacts `costRate` for unauthorized resource portfolios. This is distinct from client-side cost filtering of already redacted values.

The separate legacy **Allocations & Reallocations** page (`pages/Allocations.tsx`) has its own server-side filters, not these field filters: Resource text → `/allocations?resource` (name/ID), Project text → `project` (name), Status single select → `status` (empty means ACTIVE/SCHEDULED; choices ACTIVE/SCHEDULED/CLOSED), Starting on or after → `startDate`, Starting on or before → `endDate` (both bound allocation **startDate** inclusively), and Allocated/Reallocated tab → no `reallocated` parameter / `reallocated=true` respectively. Its reset clears inputs but does not change the tab. The backend additionally accepts `resourceId`, `projectId`, comma-separated `status`, and `reallocated=false`; these are not controls on that page. Allocation history is portfolio-scoped and the endpoint is not paginated.

“Recommend by skills” is another separate query, enabled only when the panel is open and at least one comma-separated skill is present: `GET /resources/recommendations/search` uses `skills` (required), `certifications` (comma-separated), `minProficiency` (1–5), `minExperience`, `location`, `portfolioId`, role-gated `maxCost`, and the trio `requiredFte`, `startDate`, `endDate` together for availability scoring. The current panel renders skills, certifications, proficiency, FTE and two dates; location, minimum experience, portfolio and max cost are inherited from the unrendered repository-filter state. `minProficiency` is not a list field filter. Recommendations exclude TERMINATED, redact cost per portfolio, and supply the latest authorized-only `pipStatus` in the **recommendation response**, not the Resources list.

`expectedBenchDate` and `benchPriority` are computed row/sort helpers, **not selectable registry columns**; `projectedBenchStartDate` is a presented resource property, also not a registry column. Other model/response properties (for example `currency`, `benchSince`, `sourceSystem`, `totalAllocatedPercent`, `nextScheduledAllocation`, `empCount`, allocation `taskId`, `createdBy`, `notes` and the legacy allocation table's derived FTE) do not become selectable simply because they exist in types or responses. Registry PIP is defined but absent from list payloads: it cannot reliably display a list PIP indicator. This document records current behavior and known limitations; focused frontend tests cover filtering semantics.

# RAM Project Timesheet and Handoff

**Last updated:** 2026-10-21

## Work log

| Date | Work area | Changes and findings | Verification / status |
|---|---|---|---|
| 2026-10-21 | RMG resource Excel import wizard | Added XLSX selection and mapping dialog for supported safe profile fields, bounded first-sheet parsing, server-side reconciliation with scope checks, duplicate/missing ID flags, changes/unchanged/new/blocked classification, and current/proposed safe-field differences. New records are explicitly blocked; Excel commit endpoint returns 409 and no save button is shown pending explicit field selection and stale-preview protection. | Backend build, three parser/reconciliation Node tests, frontend `npx tsc --noEmit` pass. No npm test script. Two moderate ExcelJS transitive UUID vulnerabilities remain open. No live DB writes/migrations/reset/seed. |

## Current import handoff

- Excel workbook review is at Admin > Import & Quarantine. Select XLSX, choose canonical mappings to headers or Ignore, then reconcile against current resources. First worksheet only; 10 MB, 5,000-row and 100-column limits. Blank cells never clear values. Workbook duplicate IDs are flagged on every affected row.
- Only employee ID/name/manager/designation/country/location/work-location mapping is offered; the server returns before/proposed deltas only for safe fields on authorized resources. New rows show an actionable creation-unavailable note. Unauthorized records are blocked without revealing current profile values.
- Existing app-vs-workbook differences do not establish which side changed most recently; no persisted baseline exists. Excel commit is deliberately disabled (409) until row/field selection and stale-preview protection are implemented. CSV upload and scheduled import are separate unchanged workflows.
- ExcelJS version currently brings two moderate `uuid` audit findings; dependency remediation is open. Do not apply database migrations or test imports against local `ram_db`.

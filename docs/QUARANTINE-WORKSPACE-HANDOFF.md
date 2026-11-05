# RAM import and quarantine handoff

## Pause checkpoint

User requested stopping work and saving progress and the plan. Work is paused. Existing edits remain on disk, uncommitted. Do not reset the working tree or overwrite existing changes. No commits or migration application were requested. Resume by inspecting git status and current source, not assuming interrupted work is complete.

## Approved decisions

- Improve existing import/quarantine/notification systems; no parallel systems.
- HR may commit Excel imports; CSV and Excel use shared validation rules.
- Import fields exclude email. Preserve existing resource emails; nullable resource email migration was added.
- New records require employeeId, name, location, costRate, portfolioCode. Partial updates preserve absent/blank values.
- Automatically quarantine invalid rows; revalidate-and-release must enforce backend rules.
- RMG owns quarantine review/notifications.
- Every nonblank data row has an explicit persisted outcome; safe row-level partial processing and idempotent retries.
- Preserve originals separately from corrections; retain discarded records.
- User approved the quarantine workspace proposal, additive persistence changes, and recommended unknown-portfolio RMG batch triage policy. Exact authorization must be implemented conservatively: authorized batch-level triage must not expose unrelated live resource values or bypass release portfolio grants.

## Previously implemented and reported verified

Existing ExcelImportWizard is mounted in Admin with five steps, source-column mapping, sample/type guidance, paginated editable preview, server revalidation, results and retry keys. CSV/history remain.

Import pipeline has manifest persistence, row-level transactions, PENDING/CREATED/UPDATED/SKIPPED/QUARANTINED/FAILED/DISCARDED outcomes, original source/mapped metadata, idempotency/digest, stale preview checks, duplicate sibling protection, retained discard and independent notification reconciliation. CSV source coordinates are record-ending physical lines; email source values are redacted.

Latest completed implementation report before workspace work: 37 backend tests and 3 frontend tests passed, both no-emit TypeScript checks and git diff --check passed. These results PRE-DATE the interrupted quarantine workspace changes and are not verification of the current checkpoint.

Known prior limitations: tests use serialized transaction mocks rather than PostgreSQL; normal Prisma generation was blocked by a locked Windows DLL (a no-engine client had been generated for typechecking); notification recovery requires another request rather than durable outbox; retry state does not survive browser reload; full shared effective-plan preview/write equivalence remains incomplete. Do not claim these are fixed without checking.

## Interrupted quarantine workspace work

The implementation agent was cancelled before returning a result. Partial changes ARE present: git status includes frontend/src/types/index.ts and the new migration backend/prisma/migrations/20261027020000_quarantine_workspace/migration.sql. Other modifications may be mixed into already-dirty files; inspect all diffs.

The new workspace migration currently adds ImportRecord.version default 0, nullable validation/review JSONB, and batch/status/createdAt plus employeeId indexes. It was read at pause time; migration application was not performed by this session. No QuarantineWorkspace component appears among untracked files at checkpoint, so do not assume the UI exists.

Existing untracked migrations:
- backend/prisma/migrations/20261027000000_optional_resource_email/
- backend/prisma/migrations/20261027010000_import_row_manifest/
- backend/prisma/migrations/20261027020000_quarantine_workspace/

Review all pending migrations and target environment before deployment. Do not apply automatically. Restore normal Prisma generation safely before runtime; do not kill user processes or forcibly replace locked binaries.

## Approved workspace implementation plan

1. Inspect current diffs and complete a consistent capability/authorization layer for list, detail, save, validate, release, retry, discard, history and bulk. Apply sensitive-data redaction server-side, including original source/live comparisons/audit payloads. Preserve ADMIN/RMG/HR policy and current/destination portfolio checks.
2. Extend existing imports router/service, not a second subsystem: authorized query summaries, searchable/filterable/sortable server pagination, detail with capabilities and safe provenance, versioned correction save, validation-only, persistent review flag, existing combined revalidate-release, retry and retained discard.
3. Persist corrections independently of resource writes. Add optimistic version checks, persisted validation snapshot tied to correction/resource versions, review metadata. Editing invalidates validation. Originals never accepted in mutation DTOs. Normalize legacy string errors into structured issues (code/category/field/severity/message/safe conflict details).
4. Reuse AuditLog for before/after correction diffs and validation/release/discard history. Secure the generic audit endpoint before adding richer sensitive snapshots.
5. Build an existing-Admin-integrated QuarantineWorkspace using existing card/button/input/badge styling: dashboard cards for unresolved/missing/invalid/duplicate/conflict/manual review/validated awaiting release, with failure/pending indicators. Categories may overlap and must say so.
6. Table: identifier/name, batch/file, worksheet row, categories/count, validation/resolution states, import/update timestamps/actions. Server pagination, explicit row selection, URL-managed batch/record/filter/page parameters; consume existing alert deep links.
7. Detail editor: typed fields based on current resource metadata; errors/warnings/conflicts next to fields; original/current/live comparison subject to permission; source and audit timeline. Save, validate, combined revalidate-release, mark review, retry, confirmed discard. Disable invalid actions with explanations. Confirm before losing dirty edits; accessible focus/labels/live status.
8. Bulk selected saved-row validation/revalidate-release/retry/review: preflight eligible/excluded counts and explicit confirmation, bounded processing, individual outcomes. Never silently submit local drafts. Bulk correction can be deferred until core workflow verified; report deferral honestly.
9. Test and verify current source. No dist builds/commits unless requested.

## Expected affected files

- frontend/src/pages/Admin.tsx
- frontend/src/components/QuarantineWorkspace.tsx and supporting components/tests if needed
- frontend/src/types/index.ts
- frontend/src/index.css only minimal existing-style extensions
- backend/src/routes/imports.ts
- backend/src/services/importService.ts and tests
- backend/src/routes/audit.ts
- backend/prisma/schema.prisma and workspace migration

## Verification to complete

- Save/validate never mutate resources; saved corrections survive reload.
- Originals immutable; legacy missing provenance handled honestly.
- Search/filter/sort/pagination and dashboard count consistency.
- Stale record versions, concurrent release/discard and live-resource changes.
- Current/destination portfolio permissions and sensitive redaction including generic audit reads.
- Backend validation on every release, duplicate groups and safe retries.
- Bulk exclusions, confirmations, partial failures and actual released/still-invalid/failed counts.
- Deep links, browser navigation, dirty draft confirmation and keyboard accessibility.
- Backend/frontend tests, no-emit typechecks, git diff --check. No lint scripts were previously configured; inspect again and ask if still absent.
- Real PostgreSQL integration remains necessary; do not use production data for tests.

## Working-tree preservation

At pause time git status contained preexisting modified backend/dist files, frontend/dist/index.html, frontend/src/components/Layout.tsx and frontend/tsconfig.tsbuildinfo, alongside implementation changes. Do not assume these are agent-owned or rebuild/revert them. Untracked existing wizard/test/service-test files and all migrations must be preserved. No git staging/commit was done at pause.

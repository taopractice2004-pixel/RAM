# RAM System Implementation Notes

This file records business rules and intentional deferrals introduced during the workforce-data expansion work.

## Locked Rules

- `DOJ` is the source of truth for TAO experience.
- `TAO Experience` is computed from `DOJ`, not trusted as a manually entered source field.
- `Total YOE` is `Prior Experience + TAO Experience`.
- Imported rows with inconsistent `YOE`, `TAO Experience`, and `DOJ` are quarantined.
- `Non-Bill Category` is intentionally ignored.
- `Sub Category` is hybrid: partly manual and partly derived.
- `Corporate Bench` means internal non-client work.
- `Internal Project` means work in the AI/ML internal portfolio.
- New hires in `AVAILABLE` age from `DOJ`.
- Unassigned resources can auto-move into bench handling after 60 days from `DOJ`.
- Resource lifecycle must never appear as `CLOSED`; only historical allocations may be closed.
- Rejected forced terminations must leave the resource on bench, not in a dead-end state.
- ML resources remain visible but unavailable, non-allocatable, and non-terminatable.
- Approvals UI combines termination and ML requests.
- Admin and RMG can edit safe operational profile fields.

## Deferred / To Review Later

- Final long-term shape of subcategory derivation overrides vs manual edits.
- Whether portfolio managers should eventually be modeled as first-class people instead of plain text.
- Whether yearly experience values should ever be materialized instead of derived.
- Import tooling UX for resolving quarantined experience mismatches in bulk.

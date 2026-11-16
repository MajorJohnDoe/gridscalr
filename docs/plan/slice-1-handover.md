# Drift Slice 1 handover

Plan: [`drift-slice-1.md`](drift-slice-1.md). Epic:
[#272](https://github.com/MajorJohnDoe/gridscalr/issues/272).

Schema 28 is the current development schema. 1.0 is deferred; no version bump,
tag or release is part of this phase.

## Phase 1 — schema 28 foundation

- **Issue:** [#273](https://github.com/MajorJohnDoe/gridscalr/issues/273)
- **PR:** [#274](https://github.com/MajorJohnDoe/gridscalr/pull/274)
- **Branch:** `feat/schema-28-foundation`
- **Commit:** `cf7b294` (implementation); handover commit follows
- **Status:** PR open; local gate green, CI verification pending on the PR head

### Completed work

- `SCHEMA_VERSION = 28`.
- New project arrays `fieldDefinitions`, `fieldSets`, `spaces` and `schedules`;
  `settings.summary` with the four default cards.
- Item fields `spaceId` and `custom`, and the `schedule` drawing kind with
  `scheduleId`, `rowStart`, `rowLimit`, `showHeader` and `showTotals`.
- Optional `summaryRole` on categories and count types, never inferred.
- Migration 27 → 28 adds empty arrays and default cards only. A pre-28 file
  ignores schema 28 fields, and a pre-28 `schedule` item is reported as
  `droppedSchedulePlacement`.
- Normalizers for fields, field sets, typed custom values, spaces, schedules and
  summary settings.
- Integrity rules for ids, per-scope keys, enum options, defaults, field sets,
  space parents/cycles, page links, manual and measured areas, duplicate sibling
  room numbers, item `spaceId` links, schedule columns, filters, grouping,
  sorting, totals, placements, custom values and summary cards.
- Load-report and doctor codes, including deterministic duplicate-id renames and
  dangling-link repairs.
- `fixtures/legacy/schema-28.gridscalr`, the generator and the schema 1–28
  corpus.
- Page delete now keeps spaces and clears their optional page link, reported as
  `clearedSpaces` in the page-delete summary.

### Modules

- `src/model/types.ts`, `driftTypes.ts`, `fields.ts`, `spaces.ts`,
  `schedules.ts`, `summary.ts`, `schema28Integrity.ts`
- `src/io/projectFile/fields.ts`, `spaces.ts`, `schedules.ts`, `summary.ts`,
  `schema28.ts`, `parse.ts`, `settings.ts`, `items.ts`, `layers.ts`,
  `categories.ts`, `shared.ts`
- `src/features/projectIntegrity/repairPlan.ts`, `repairDuplicate.ts`,
  `repairReferences.ts`, `repairDriftReferences.ts`, `issueText.ts`
- `src/features/pageModel/pageList.ts`
- `src/model/hitTest.ts`, `src/model/countTypes.ts`, `src/model/layers.ts`,
  `src/model/integrity.ts`, `src/ui/icons.ts`, `src/ui/itemIcon.ts`
- `fixtures/legacy/schema-28.gridscalr`,
  `fixtures/demo-project.gridscalr`,
  `scripts/make-legacy-fixtures.mjs`, `scripts/make-demo-project.mjs`
- `tests/schema28.test.ts`, `tests/robustness/migrations.test.ts`,
  `tests/integrity.test.ts`, `tests/derivedPdf.test.ts`,
  `tests/layerHierarchyMigration.test.ts`
- i18n catalogs and generated message types

### Decisions

- Schema 28 stores data only. No field editor, space register, schedule builder,
  summary panel, placed-table rendering, CSV or PDF table output ships in this
  phase, and the docs do not claim otherwise.
- Migration is additive and deterministic. Existing room text is never turned
  into a space, no summary roles are assigned and no item gets custom values.
- Built-in schedule field keys are code-level names. A custom field reference is
  `custom:<fieldId>` and must resolve to a field in the matching scope.
- Area derivation is not stored twice. A measured space keeps no manual area; a
  manual space keeps `areaM2` only while no measured source is chosen. The
  derivation itself lands in phase 3.
- Duplicate room numbers are a warning; duplicate ids are errors the doctor can
  rename; unknown or mistyped custom values are dropped with a load-report code
  because no other rendering is safe.
- Pre-28 fields that only schema 28 defines are ignored rather than trusted, the
  same rule used for pre-27 derived-PDF markers.

### Findings

- F-118 recorded: project page import does not merge the schema 28 registers, so
  an imported item can keep a `spaceId` or `scheduleId` that resolves only in the
  source project. The validator reports it after the commit and the doctor can
  clear or remove it; the preflight warning and the merge/remap decision belong
  to the field, space and schedule phases. No silent loss.
- Larger UI, CSV and performance work belongs to phases 2–7.

### Checks

Local gate green: `check:versions`, `check:file-budgets`, `check:modules`,
`check:security`, `check:actions`, `check:dependencies`, `check:i18n`,
`check:themes`, `check:docs`, `format:check`, `lint`, `npx tsc --noEmit`,
`npx vitest run` (158 files, 1527 tests) and `npm run test:robustness`
(5 files, 104 tests). `docs:capture` was not run because no visible screen
changed; `check:docs` reports only the expected stale-screenshot warning.
CI is authoritative on the PR head.

### Next phase

Phase 2 — custom fields: `src/features/fields/` model, Project settings editor,
inspector section and field-set application. No schema change is expected.

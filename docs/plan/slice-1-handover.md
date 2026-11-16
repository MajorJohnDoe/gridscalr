# Drift Slice 1 handover

Plan: [`drift-slice-1.md`](drift-slice-1.md). Epic:
[#272](https://github.com/MajorJohnDoe/gridscalr/issues/272).

Schema 28 is the current development schema. 1.0 is deferred; no version bump,
tag or release is part of this phase.

## Phase 1 — schema 28 foundation

- **Issue:** [#273](https://github.com/MajorJohnDoe/gridscalr/issues/273) (closed by the merge)
- **PR:** [#274](https://github.com/MajorJohnDoe/gridscalr/pull/274) (squash merged)
- **Branch:** `feat/schema-28-foundation` (deleted after merge)
- **Verified head SHA:** `1d64fb8ce01276f9a0a043577b2a12a34732c270`
  (`cf7b294` implementation, `1869c38` handover, `1d64fb8` CI record)
- **Merge commit:** `991ddca6b2de96cef02fd9b4ba101bb6ad4353ce`
- **Status:** merged to `main`. All six PR checks passed on the verified head.
  The `main` CI run [43863542599](https://github.com/MajorJohnDoe/gridscalr/actions/runs/43863542599)
  is green on the merge commit (dependency advisory gate, frontend tests and
  build, Rust format and check, and the desktop shell job on Ubuntu, Windows and
  macOS).

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

### Conductor verification

- PR [#274](https://github.com/MajorJohnDoe/gridscalr/pull/274) head
  `1d64fb8ce01276f9a0a043577b2a12a34732c270` matched the handover SHA; every one
  of the six checks was `success`, the base was `main` and the merge state was
  `CLEAN`/`MERGEABLE`.
- Conductor re-ran `npx vitest run tests/robustness/migrations.test.ts
  tests/schema28.test.ts`: 2 files, 71 tests passed.
- File list matched the Phase 1 module map and the issue non-goals. No field
  editor, space register, schedule builder, summary panel, CSV or table
  rendering shipped. `src/canvas/items/dispatch.ts` and
  `src/pdf/export/items/dispatch.ts` take a `schedule` branch that renders
  nothing, with a comment that the table renderer belongs to Phase 5.
- Squash merged as `991ddca6b2de96cef02fd9b4ba101bb6ad4353ce`; `main` CI is
  green on that commit.

### Next phase

Phase 2 — [custom fields #275](https://github.com/MajorJohnDoe/gridscalr/issues/275):
`src/features/fields/` model, Project settings editor, inspector section and
field-set application. No schema change is expected.

## Phase 2 — custom fields

- **Issue:** [#275](https://github.com/MajorJohnDoe/gridscalr/issues/275) (closed by the merge)
- **PR:** [#277](https://github.com/MajorJohnDoe/gridscalr/pull/277) (squash merged)
- **Branch:** `feat/custom-fields` (deleted after merge)
- **Verified head SHA:** `093a1ada9345927feedee09a8915d32169b8b0f6`
  (`ae8b8bb` model and editor, `16b7208` gates, `f2f2e7f` docs, `2e2c75d`
  handover, `093a1ad` link fix)
- **Merge commit:** `d745ffb036f1fc6ad183304d06f09f932abbf835`
- **Status:** merged to `main`. All six PR checks passed on the verified head.
  The `main` CI run [43874381080](https://github.com/MajorJohnDoe/gridscalr/actions/runs/43874381080)
  is green on the merge commit (dependency advisory gate, frontend tests and
  build, Rust format and check, and the desktop shell job on Ubuntu, Windows and
  macOS). No schema change, no app version bump, no tag or release.

### Completed work

- `src/features/fields/` with `index.ts` as the only public surface and pure
  model files: field lookup, strict `appliesTo`, typed value coercion and
  stored-value health, usage counting, draft validation, create/update/delete/
  reorder and field sets.
- Project settings → **Fields**: per-scope list, add/edit form (label, key, type,
  unit, options, required, default, description, min/max/maxLength, applies-to),
  reorder, delete with an inline confirmation that names the value count.
- Field sets: create, edit and delete in the same dialog; **Apply field set** in
  Properties fills each member's default value once.
- Inspector **Fields** section for the selected measurement: typed controls for
  text, number, unit number, yes/no, date, enum and multi-enum, inline validation,
  required hint, clear action and an explicit error when a stored value no longer
  matches its field.
- A type change with values is refused at the control and by the model with the
  value count; key and scope are permanent; an in-use enum option cannot be
  removed; deletion cascades values and set memberships in one undo step.
- Wiring only in `src/ui/settingsDialog.ts` and `src/ui/selectionInspector.ts`;
  `src/features/fields` is a foundation feature with a 400-line directory budget.
- i18n keys in both catalogs, generated types, model and jsdom UI tests.
- The axe gate covers the Custom fields dialog and the inspector section (8
  surfaces × 5 palettes); touch-target and UI-scale checks cover the editor.
  `tests/visual/hero.png` is updated because the inspector now shows Fields.

### Modules

- `src/features/fields/index.ts`, `model.ts`, `ui.ts`
- `src/features/fields/model/fieldRules.ts`, `draft.ts`, `sets.ts`, `problems.ts`
- `src/features/fields/ui/fieldDialog.ts`, `fieldForm.ts`, `fieldList.ts`,
  `fieldSets.ts`, `fieldOptions.ts`, `fieldAppliesTo.ts`, `valueInput.ts`,
  `inspector.ts`, `messages.ts`
- `src/styles/fields.css`
- `src/ui/settingsDialog.ts`, `src/ui/selectionInspector.ts`,
  `src/model/layers.ts` (`MEASUREMENT_ITEM_KINDS`)
- `tests/fields.test.ts`, `tests/fieldsUi.test.ts`
- `scripts/accessibility-*.mjs`, `scripts/touch-target-check.mjs`,
  `scripts/ui-scale-check.mjs`, `scripts/ui-harness.mjs`

### Decisions

- A field set fills default values on the selected measurement. Schema 28 has no
  per-item set reference, so the set is not a binding and nothing is inherited.
  There is no automatic fill when an item is created; the user applies the set.
- Only `measurement` and `space` scopes are offered. Space values wait for the
  register in Phase 3; the other scopes have no entity in schema 28.
- Custom values stay out of the Markups table, quantity reports, CSV, XLSX and
  PDF in this slice. `customFieldRef()` and `customValueText()` expose the stable
  `custom:<fieldId>` mapping for the schedule and CSV phases.
- The editor is its own modal, like the count-type manager. Closing it reopens
  Project settings on Fields.
- An invalid stored value is shown and can be replaced or cleared; it is never
  rewritten into another type.

### Findings

- F-119: the empty field editor explains fields but does not offer a template.
- F-120: the field editor closes Project settings while it is open; closing it
  reopens settings on Fields.
- F-118 remains open: page import still does not merge field definitions or field
  sets. Phase 2 did not change `src/features/projectImport`.
- No larger out-of-scope work was added to the phase; templates, CSV/schedule
  columns and the space register stay in their own phases.

### Checks

Local gate green: `check:versions`, `check:file-budgets`, `check:modules`,
`check:security`, `check:actions`, `check:dependencies`, `check:docs`,
`format:check`, `lint`, `check:i18n` (3146 keys), `check:themes`,
`npx tsc --noEmit`, `npx vitest run` (160 files, 1567 tests), `test:visual`,
`test:a11y` (40 checks), `test:touch-targets` (395 controls, 8 surfaces),
`test:ui-scale` and `test:docs-capture` (27 screenshots, `docs/screenshots/`
untouched), plus `test:ui`. `check:docs` reports only the expected
stale-screenshot warning; recapture is deferred to Phase 7.

### Conductor verification

- PR [#277](https://github.com/MajorJohnDoe/gridscalr/pull/277) head
  `093a1ada9345927feedee09a8915d32169b8b0f6` matched the worker report; all six
  checks were `success`, the base was `main` and the merge state was
  `CLEAN`/`MERGEABLE`.
- Conductor re-ran `npx vitest run tests/fields.test.ts tests/fieldsUi.test.ts
  tests/accessibilityGate.test.ts tests/schema28.test.ts`: 4 files, 66 tests
  passed. `check:modules`, `check:file-budgets` and `npx tsc --noEmit` are green.
- Scope matched the issue: no `schemaVersion` change (`SCHEMA_VERSION` stays 28),
  no version bump, no Markups/CSV/PDF output, no space register. Wiring stayed in
  `src/ui/settingsDialog.ts` and `src/ui/selectionInspector.ts`, plus a CSS
  import in `src/main.ts` and a read-only `MEASUREMENT_ITEM_KINDS` export from
  `src/model/layers.ts`.
- Gates were extended, not relaxed: the a11y surface list gains the Custom fields
  dialog and inspector section, `src/features/fields` joined the foundation
  feature list and the 400-line directory budget, and touch-target/UI-scale
  collect the new surfaces.
- Squash merged as `d745ffb036f1fc6ad183304d06f09f932abbf835`; `main` CI is green
  on that commit.

### Next phase

Phase 3 — [spaces #278](https://github.com/MajorJohnDoe/gridscalr/issues/278):
`src/features/spaces/` model, register panel, area derivation and the
measurement-to-space action. The measurement `custom` values and the field
editor are the surface the space register will mirror for `space` scope.

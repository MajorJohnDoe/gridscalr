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

## Phase 3 — spaces

- **Issue:** [#278](https://github.com/MajorJohnDoe/gridscalr/issues/278) (closed by the merge)
- **PR:** [#280](https://github.com/MajorJohnDoe/gridscalr/pull/280) (squash merged)
- **Branch:** `feat/spaces` (deleted after merge)
- **Verified head SHA:** `ed112b0bd327155d72074464a164bf0067a08bcc`
  (`5fe286f` feature, `f73d204` documentation, `5590c71` handover,
  `d0f53a3` glossary, `ed112b0` handover record)
- **Merge commit:** `05fbd39038edb67f37cad31a8dc53b246e4e0e94`
- **Status:** merged to `main`. All six PR checks passed on the verified head.
  The `main` CI run [43884442573](https://github.com/MajorJohnDoe/gridscalr/actions/runs/43884442573)
  is green on the merge commit. No schema change, no app version bump, no tag or
  release.

### Completed work

- `src/features/spaces/` with `index.ts` as the only public surface and pure
  model files: the space tree, derived area, create/update/delete and
  measurement links, and explicit room-from-text creation. Every mutation is
  caller-owned, so one click is one undo step.
- **View → Spaces…** opens the space register: a building → floor → room/zone
  tree with type, room number, name, an **Measured** / **Manual** / **Missing**
  area badge and the area in m².
- Add, edit, move to another parent, reorder among siblings and delete. A name
  is required, a space can never become its own ancestor, and a duplicate room
  number under one parent is a warning that names the number and does not block
  the save.
- Area derivation: a measured space sums its visible linked area measurements
  (add minus subtract, m²). A manual value is used only while nothing is linked;
  a linked measurement wins and the row says the manual value is unused. A
  missing area is reported with the reason and never falls back to manual.
- Hidden items and hidden layers are excluded from the area, locked measurements
  are included, and a visible link without a page scale reports a missing area
  instead of a partial sum.
- **Link the selected measurements**, **Unlink the selected measurements**,
  select-and-zoom to the first visible linked measurement, and **Create rooms
  from the room text** (one measured room per unique name, never a link).
- Space-scoped custom fields are edited in the space form and saved with the
  space in one undo step, reusing `src/features/fields`.
- Deleting a space asks first and names the link count; measurements are
  unlinked, never deleted, and the delete is one undo step. A space with child
  spaces is refused so a subtree is never reparented silently. Deleting a page
  keeps spaces and clears their page link, and the page-delete flow now toasts
  the cleared count.
- Wiring only: `src/app/App.ts` (one menu action), `src/ui/topMenu.ts` and
  `src/ui/panels.ts` (the action itself), `src/app/pageFlows.ts` (the page-delete
  report), `src/main.ts` (stylesheet) and the gate scripts.
- i18n keys in both catalogs, generated types, model and jsdom UI tests.

### Modules

- `src/features/spaces/index.ts`, `model.ts`, `ui.ts`
- `src/features/spaces/model/area.ts`, `tree.ts`, `mutations.ts`, `links.ts`,
  `roomText.ts`
- `src/features/spaces/ui/dialog.ts`, `form.ts`, `list.ts`, `messages.ts`
- `src/styles/spaces.css`
- `src/features/fields/index.ts`, `model.ts`, `ui.ts`,
  `model/fieldRules.ts` (`applicableSpaceFields`, `fieldAppliesToSpace`, and the
  exported `valueControl`)
- `src/app/App.ts`, `src/app/pageFlows.ts`, `src/ui/panels.ts`,
  `src/ui/topMenu.ts`, `src/main.ts`
- `tests/spaces.test.ts`, `tests/spacesUi.test.ts`, `tests/accessibilityGate.test.ts`
- `scripts/accessibility-rules.mjs`, `scripts/accessibility-check.mjs`,
  `scripts/touch-target-check.mjs`, `scripts/ui-scale-check.mjs`,
  `scripts/ui-harness.mjs`, `scripts/check-module-boundaries.mjs`,
  `file-budgets.json`

### Decisions

- The register is a wide modal opened from **View → Spaces…**, not a dock panel,
  so this phase adds no dock tab, shortcut or shell render path. A dock panel
  would need the selection to change while it is open; that is recorded as
  F-121.
- `areaMode` decides the source, but a linked measurement always wins: a manual
  space with links reports the measured area and flags the manual value unused.
  The derived area is never written to the space.
- A partial sum is refused. If any visible linked measurement has no page scale
  the space reports a missing area, because a smaller number presented as the
  room area is worse than an explicit warning.
- Area is reported in m² regardless of the project area unit, because the room
  register is not a measurement readout. Recorded in `docs/limitations.md`.
- A space with children cannot be deleted. Silent reparenting is a data change
  the user did not ask for; the register names the child count instead (F-122).
- **Create rooms from the room text** creates root-level measured rooms and
  never links a measurement. Deduplication is case-insensitive within the
  chosen parent.
- Page import still does not merge spaces: the F-118 phase-3 decision records
  why, and the missing preflight warning stays open rather than being
  half-implemented outside this module map.
- Custom field values on a space are edited in the space form (one undo step on
  save), not as live inspector edits; there is no space inspector yet.

### Findings

- F-121: the register is a modal, so measuring and linking cannot interleave.
- F-122: a space subtree has no bulk move or delete.
- F-118 extended: the Phase 3 decision keeps spaces out of the page-import merge
  and leaves the preflight warning open.

### Checks

Local gate green: `check:versions`, `check:file-budgets`, `check:modules`,
`check:security`, `check:actions`, `check:dependencies`, `check:docs`,
`format:check`, `lint`, `check:i18n` (3220 keys), `check:themes`,
`npx tsc --noEmit`, `npx vitest run` (162 files, 1603 tests), `test:visual`
(4 screens, no baseline change), `test:a11y` (45 checks, 5 palettes × 9
surfaces), `test:touch-targets` (427 controls, 9 surfaces), `test:ui-scale`,
`test:docs-capture` (27 screenshots, `docs/screenshots/` untouched) and
`test:ui`. `check:docs` reports only the expected stale-screenshot warning;
recapture is deferred to Phase 7. All six PR checks passed on `d0f53a3`
(dependency advisory gate, frontend tests and build, Rust format and check, and
the desktop shell on Ubuntu, Windows and macOS).

### Conductor verification

- PR [#280](https://github.com/MajorJohnDoe/gridscalr/pull/280) head
  `ed112b0bd327155d72074464a164bf0067a08bcc` matched the worker report; all six
  checks were `success`, the base was `main` and the merge state was
  `CLEAN`/`MERGEABLE`.
- Conductor re-ran `npx vitest run tests/spaces.test.ts tests/spacesUi.test.ts
  tests/fields.test.ts tests/schema28.test.ts`: 4 files, 73 tests passed.
  `check:modules` is green with 19 foundation features.
- Scope matched the issue: `SCHEMA_VERSION` stays 28, no version bump, no
  placement, CSV, XLSX or PDF output. Integration wiring is small — an import and
  menu action in `src/app/App.ts`, one page-delete toast in
  `src/app/pageFlows.ts`, the `PanelActions` entry and one View menu item.
- Every new file is 266 lines or fewer. `src/features/spaces` joined the
  foundation feature list and the 400-line directory budget; the a11y, touch and
  UI-scale gates gained the register surface rather than being relaxed.
- The area model derives from per-item scale, excludes hidden items and hidden
  layers, includes locked items, refuses a partial sum when a link is
  uncalibrated, and covers measured/manual/missing, page delete, page duplicate,
  cycles, room-from-text and one-undo link, unlink and delete in
  `tests/spaces.test.ts`. The documented child-delete refusal is in
  `docs/limitations.md`.
- F-118's Phase 3 decision is recorded: page import still does not merge spaces,
  and the missing preflight warning stays open rather than half-implemented
  outside the module map.
- Squash merged as `05fbd39038edb67f37cad31a8dc53b246e4e0e94`; `main` CI is green
  on that commit.

### Next phase

Phase 4 — [schedule engine and summary #281](https://github.com/MajorJohnDoe/gridscalr/issues/281):
`src/features/schedules/` model, the measurement and space sources, summary KPI
computation, the builder and the summary panel, plus the `Ctrl+Alt+S` shortcut.
The space source reads `spaceAreas()` from `src/features/spaces/index.ts`; no
schema change is expected.

## Phase 4 — schedule engine and summary

- **Issue:** [#281](https://github.com/MajorJohnDoe/gridscalr/issues/281) (closed by the merge)
- **PR:** [#283](https://github.com/MajorJohnDoe/gridscalr/pull/283) (squash merged)
- **Branch:** `feat/schedules` (deleted after merge)
- **Verified head SHA:** `0e57c04781fcdcd0d0535c0e5b8a92e3c83f72f3`
  (`6a0e820` feature, `4ddfd80` documentation, `42be802` filter cleanup,
  `34b3f77` findings, `0e57c04` handover)
- **Merge commit:** `0d24df5adb202bf0574bdd2ced6b6689efa19f2e`
- **Status:** merged to `main`. All six PR checks passed on the verified head.
  The `main` CI run [43897681426](https://github.com/MajorJohnDoe/gridscalr/actions/runs/43897681426)
  is green on the merge commit. No schema change (`SCHEMA_VERSION` stays 28), no
  app-version bump, no tag or release, no placement, CSV, XLSX or PDF table
  output.

### Completed work

- `src/features/schedules/` with `index.ts` as the only public surface and pure
  model files: a field catalogue for built-in keys and `custom:<fieldId>`,
  visibility-first filters, stable multi-field sorting, grouping with
  subtotals, totals, definition problems, summary roles and a revision- and
  locale-scoped cache.
- Measurement source reuses `itemMetrics`, the category fallback and the count
  quantity rule; the space source reads `spaceAreas()` from
  `src/features/spaces`, so the room area is never recomputed.
- Four KPI cards from `summaryRole` with 0 and a **Configure** action when a
  role is missing, the built-in category table, and a live schedule table.
- **View → Summary** / `Ctrl+Alt+S` opens the **Summary** tab in the right dock:
  cards, schedule picker, page/category/space chips, a virtualised table,
  row-to-drawing navigation and an empty state.
- Schedule builder: name, source, row mode, columns with drag order and
  accessible arrow buttons, grouping, sorting, totals, typed custom filters and
  a 20-row live preview. Save, duplicate and inline delete.
- **Summary roles…** sets the category and count-type roles the cards read, so
  the Configure action can fix a zero. One role change is one undo step.
- Shortcut in `src/ui/shortcuts.json`, `docs/shortcuts.md`, both README tables
  and `scripts/shortcut-catalogue.mjs`.
- i18n keys in `en.json` and `sv.json` (3389 keys), generated types,
  `src/styles/schedules.css`.
- Page, category, count-type and space deletion now cleans the matching
  schedule filter list; a page-delete toast names the cleared count. A filter
  that still dangles is reported by the panel and the doctor, never crashes.
- Each new file is under 400 lines. `App.ts` stays at 1092 lines: `updateTitle`
  moved to `src/app/windowTitle.ts` to pay for the action, shortcut and import.

### Modules

- `src/features/schedules/index.ts`, `model.ts`, `ui.ts`, `summary.ts`
- `src/features/schedules/model/types.ts`, `fields.ts`, `filters.ts`, `sort.ts`,
  `totals.ts`, `compute.ts`, `definition.ts`, `roles.ts`, `cache.ts`
- `src/features/schedules/sources/measurements.ts`, `spaces.ts`
- `src/features/schedules/ui/panel.ts`, `panelCards.ts`, `panelTable.ts`,
  `tableParts.ts`, `builder.ts`, `builderColumns.ts`, `builderRules.ts`,
  `builderFilters.ts`, `builderPreview.ts`, `builderContext.ts`, `roles.ts`,
  `messages.ts`, `state.ts`
- `src/app/App.ts`, `summaryFlow.ts`, `windowTitle.ts`, `pageFlows.ts`
- `src/ui/inspector.ts`, `panels.ts`, `topMenu.ts`, `shortcuts.json`
- `src/model/categories.ts`, `countTypes.ts`,
  `src/features/pageModel/pageList.ts`
- `src/main.ts`, `src/styles/schedules.css`
- `tests/schedules.test.ts`, `schedulesUi.test.ts`, `schedulesPerformance.test.ts`
- `scripts/accessibility-check.mjs`, `accessibility-rules.mjs`,
  `touch-target-check.mjs`, `ui-scale-check.mjs`, `ui-harness.mjs`,
  `check-module-boundaries.mjs`, `file-budgets.json`,
  `tests/accessibilityGate.test.ts`, `tests/visual/*.png`

### Decisions

- The Summary lives as the third tab in the right inspector dock, not as a
  second bottom panel. That is the plan's "right-dock tab" and reuses the
  existing inspector header; the tab strip scrolls horizontally instead of
  widening the dock. The table scrolls sideways for wide schedules, recorded as
  F-125.
- The panel's built-in table is the category summary the plan describes; a
  stored schedule is a selectable alternative table, not a second panel.
- The measurement source includes every visible item, so the schema's `status`,
  `tag`, `visible` and `locked` fields are meaningful. The summary table and
  cards use measurement kinds only.
- `rowMode = "grouped"` renders one row per group with subtotals and is
  read-only for the future CSV export; `items` is the round-trip mode.
- Count is a row count, not a sum of values. A mixed-unit total is marked.
- Roles are explicit. A missing role is 0 plus Configure, never a name match.
- Card visibility is read from `settings.summary`; there is no editor yet
  (F-124).
- Deleting a schedule that a placement references is refused until the
  placement phase owns the cascade.
- A deleted custom field leaves its schedule column or filter visible as
  **Unknown field** (F-123) rather than silently rewriting the definition.
- Filter cleanup on page, space, category and count-type deletion is a page/entity
  cascade and ships here, because this phase creates those filters.
- The cache key is the project revision, schedule id, active locale, preview
  limit and a stable filter signature. Any store change bumps the revision.
- `tests/visual/{hero,markups,quantities,count-types}.png` are updated because
  the inspector header gains the Summary tab. Intended and reviewed.

### Findings

- F-123: a deleted custom field leaves schedule references reported, not
  removed.
- F-124: summary card visibility has no editor.
- F-125: the Summary tab inherits the right dock width, so wide schedules scroll
  sideways.
- F-126: a total on a field with no visible column is computed but not shown.
- F-127: the Summary toolbar is rebuilt on every shell repaint, so a select
  loses focus after a change.
- F-118 extended: page import still does not merge schedule definitions; the
  risk is unchanged because this phase cannot place a table. Removed
  page/space/category/count-type filters no longer dangle; the preflight
  warning stays open.

### Checks

Local gate green on the implementation head: `check:versions`,
`check:file-budgets`, `check:modules` (20 foundation features), `check:security`,
`check:actions`, `check:dependencies`, `check:docs` (only the expected
stale-screenshot warning), `format:check`, `lint`, `check:i18n` (3389 keys),
`check:themes`, `npx tsc --noEmit`, `npx vitest run` (165 files, 1642 tests),
`test:ui`, `test:visual` (4 baselines updated), `test:a11y` (60 checks, 5
palettes × 12 surfaces, no serious/critical), `test:touch-targets` (495 controls,
12 surfaces), `test:ui-scale` (100/150/200 %, builder dialog and the open Summary
tab) and `test:docs-capture` (27 screenshots, `docs/screenshots/` untouched).

Measured on the development container with the synthetic 15 000-item project
(`tests/schedulesPerformance.test.ts`): summary cold compute about 17 ms
(target 100 ms), cached read about 0 ms, a cold 10 000-row schedule with
grouping, sorting and a total about 192 ms (target 250 ms), cached read about
0 ms, and a 1 000-row table renders at most 26 rows plus overscan. The test
asserts a looser hard ceiling for CI and the documented targets under
`GRIDSCALR_PERF_STRICT=1`. The numbers are also in `docs/limitations.md`.

### Conductor verification

- PR [#283](https://github.com/MajorJohnDoe/gridscalr/pull/283) head
  `0e57c04781fcdcd0d0535c0e5b8a92e3c83f72f3` matched the worker report; all six
  checks were `success`, the base was `main` and the merge state was
  `CLEAN`/`MERGEABLE`.
- Conductor re-ran `npx vitest run tests/schedules.test.ts
  tests/schedulesUi.test.ts tests/schedulesPerformance.test.ts
  tests/spaces.test.ts tests/schema28.test.ts`: 5 files, 74 tests passed.
  `check:modules` is green (20 foundation features) and `check:docs` passes.
- Scope matched the issue: no canvas, PDF, report, CSV or XLSX file changed, so
  no placement or table output shipped. `SCHEMA_VERSION` stays 28 and no app
  version was bumped.
- `Ctrl+Alt+S` is in `src/ui/shortcuts.json`, `docs/shortcuts.md`, both README
  tables and `scripts/shortcut-catalogue.mjs`; `check:docs` passes.
- Page, category and count-type deletion now clean the matching schedule filter
  entries, so a deletion cannot silently empty a saved schedule.
- The four visual baselines changed only where the third inspector tab appears;
  the worker re-ran `test:visual` green on the head.
- Measured on the synthetic 15 000-item project: summary cold 17.4 ms
  (target 100 ms) and a 10 000-row grouped, sorted, totalled schedule 191.9 ms
  (target 250 ms); the 1 000-row table renders at most 26 rows plus overscan.
- F-123 … F-127 are recorded and the F-118 Phase 4 decision keeps the import
  merge open, with the risk unchanged because no table can be placed yet.
- Squash merged as `0d24df5adb202bf0574bdd2ced6b6689efa19f2e`; `main` CI is green
  on that commit.

### Next phase

Phase 5 — [place schedules on the drawing #284](https://github.com/MajorJohnDoe/gridscalr/issues/284):
schedule item rendering, a shared `layoutScheduleTable`, hit-test, move, resize
and rotate, row range and continuation, PDF table output, page
delete/duplicate and the placement cascade on schedule deletion. No schema
change is expected, because schema 28 already stores the placement fields.

## Phase 5 — placement on the sheet

- **Issue:** [#284](https://github.com/MajorJohnDoe/gridscalr/issues/284) (closed by the merge)
- **PR:** [#286](https://github.com/MajorJohnDoe/gridscalr/pull/286) (squash merged)
- **Branch:** `feat/schedule-placement` (deleted after merge)
- **Verified head SHA:** `7dac593096162d54b774d57ec7a18261f9fafc13`
  (`68ab759` implementation, `7dac593` handover)
- **Merge commit:** `7a4944bced4f8aeb0945ac5ceba9c2cbcb7f8bac`
- **Status:** merged to `main`. All six PR checks passed on the verified head.
  The `main` CI run [43915397859](https://github.com/MajorJohnDoe/gridscalr/actions/runs/43915397859)
  is green on the merge commit. No schema change (`SCHEMA_VERSION` stays 28), no
  app-version bump, no tag or release, no CSV or XLSX work.

### Completed work

- `layoutScheduleTable()` is the single table layout for canvas and PDF. Text
  measurement is injected, so the screen uses `canvas.measureText` and the
  export uses the embedded font metrics. The output has header cells, row cells,
  group and subtotal rows, the grand total row, grid lines, an overflow reason
  (`range` or `box`) and the next continuation row.
- Long cell text is ellipsized, the font shrinks only to 4.5 pt, and rows that
  still do not fit are not drawn; they are reported as an overflow instead of
  clipped silently. There is no automatic pagination.
- `src/features/schedules/placement.ts` creates, updates, deletes and continues
  a placement, normalizes the row range, counts and cascades placements and
  picks a visible, unlocked draw layer. The active draw layer wins; a
  measurement layer is never used, and a new draw layer gets the localized
  **Schedules** / **Scheman** name.
- `src/canvas/items/schedule.ts` draws the live table from the cached schedule
  result, only for the visible row range. A missing schedule is a dashed
  placeholder with a localized message.
- Pointer integration reuses the existing gesture code: hit-test inside the box,
  marquee selection, move, four corner handles, in-place rotation, double-click
  to open the builder, and the context menu entries **Edit schedule…**,
  **Change row range…**, **Continue on a new table** and the existing delete.
- `src/ui/inspector/schedule.ts` shows the schedule name, row range, header and
  total switches, the edit/range actions, a missing-schedule warning and the
  overflow continuation.
- **Place on drawing…** in the Summary header opens a dialog with page, width in
  mm, all rows or first row/count, header and totals. It selects the new
  placement and goes to its page. The button is disabled without a selected
  schedule or in view-only.
- `src/pdf/export/items/schedule.ts` draws the same table as vector text and
  lines, honouring the exporter's page range, crop, layer selection, hidden
  items, hidden layers and locked items.
- Deleting a schedule with placements now names the placement count and removes
  the schedule plus every placement in one undo step.
- The a11y, touch-target and UI-scale gates cover the Place schedule dialog and
  the placed-table inspector section. `tests/schedulesPerformance.test.ts` adds
  the placed-table layout measurement.
- i18n keys in both catalogs, generated types, README, user guide, limitations
  and testing docs updated.

### Modules

- `src/features/schedules/layout.ts`, `layoutText.ts`, `layoutCells.ts`,
  `placement.ts`, `index.ts`
- `src/features/schedules/ui/placement.ts`, `ui.ts`, `ui/panel.ts`,
  `ui/builder.ts`
- `src/canvas/items/schedule.ts`, `items/dispatch.ts`
- `src/canvas/pointer/PointerHost.ts`, `contexts.ts`, `doubleClick.ts`,
  `transform.ts`
- `src/canvas/selectionHandles.ts`, `src/model/hitTest.ts`
- `src/pdf/export/items/schedule.ts`, `items/dispatch.ts`
- `src/ui/inspector/schedule.ts`, `ui/selectionMenu.ts`,
  `ui/selectionInspector.ts`, `ui/inspector.ts`
- `src/styles/schedules.css`, i18n catalogs, `src/i18n/types.generated.ts`
- `tests/schedulePlacement.test.ts`, `schedulePlacementPdf.test.ts`,
  `schedulePlacementUi.test.ts`, `schedulesPerformance.test.ts`,
  `accessibilityGate.test.ts`
- `scripts/accessibility-{rules,check}.mjs`, `touch-target-check.mjs`,
  `ui-scale-check.mjs`, `ui-harness.mjs`
- `docs/user-guide.md`, `docs/limitations.md`, `docs/testing.md`, `README.md`,
  `docs/plan/foundation-findings.md`

### Decisions

- A placed table stays an ordinary drawing item. It stores the schedule id, the
  box and the row range; content is computed at render time and never copied.
- Canvas and PDF consume one layout function. The measured text differs by font
  (browser versus embedded Liberation), so a borderline ellipsis can break at a
  different character; the structure and overflow are shared (F-129).
- The row range counts data rows. A grouped schedule renders one row per group
  with its subtotal; a group subtotal covers the whole group even when the range
  shows part of it, and the grand total always covers the whole filtered set.
- Overflow is explicit: the inspector warns, and **Continue on a new table**
  creates a second placement below with the same width, columns and totals. No
  paginator, no repeated header and no automatic reflow (F-128).
- Placement layer selection prefers the active draw layer, then the first
  visible unlocked draw layer, then creates a localized draw layer. A placement
  can never be created on a measurement layer.
- The confirmation for schedule deletion names the placement count; the
  placements and the schedule are removed inside one `store.mutate` call, so one
  undo restores both.
- The PDF table is flattened vector text and lines in the deterministic default.
  The optional OCG/annotation export keeps its existing rules.
- Visual baselines are unchanged; the new surfaces are dialogs and an inspector
  section, not one of the four captured screens.

### Findings

- F-128: a placed table has no automatic pagination or repeated header.
- F-129: the inspector overflow warning uses a slightly different text metric
  than the export.
- F-118 extended: project page import still does not merge schedule definitions,
  so an imported placement can reference a schedule that exists only in the
  source project. The validator reports it and the doctor can remove it; the
  preflight warning stays open. The risk is now real because a table can be
  placed.

### Checks

Local gate green on the implementation head: `check:versions`,
`check:file-budgets` (591 files), `check:modules` (20 foundation features),
`check:security`, `check:actions`, `check:dependencies`, `check:docs` (only the
expected stale-screenshot warning), `format:check`, `lint`, `check:i18n`
(3426 keys), `check:themes`, `npx tsc --noEmit`, `npm test -- --run`
(168 files, 1676 tests), `test:ui`, `test:canvas`, `test:visual` (4 baselines
unchanged), `test:a11y` (5 palettes × 14 surfaces, 70 checks, no
serious/critical), `test:touch-targets` (521 controls, 14 surfaces),
`test:ui-scale` (100/150/200 %) and `test:docs-capture` (27 screenshots,
`docs/screenshots/` untouched). `check:performance` passed.

Measured on the development container: a placed table lays out its visible
window in about 1.6 ms against a 10 000-row source and draws 25 rows; the
existing 15 000-item summary and 10 000-row schedule budgets are unchanged
(about 19.9 ms and 195.2 ms cold). The placed-table test asserts a looser CI
ceiling and the documented targets under `GRIDSCALR_PERF_STRICT=1`.

### Conductor verification

- PR [#286](https://github.com/MajorJohnDoe/gridscalr/pull/286) head
  `7dac593096162d54b774d57ec7a18261f9fafc13` matched the worker report; all six
  checks were `success`, the base was `main` and the merge state was
  `CLEAN`/`MERGEABLE`.
- Conductor re-ran `npx vitest run tests/schedulePlacement.test.ts
  tests/schedulePlacementPdf.test.ts tests/schedulePlacementUi.test.ts
  tests/schedulesPerformance.test.ts tests/schema28.test.ts`: 5 files, 46 tests
  passed. `check:modules`, `check:file-budgets` and `check:docs` are green.
- Scope matched the issue: no CSV, XLSX or report file changed and
  `SCHEMA_VERSION` stays 28. `src/canvas/CanvasView.ts` gained three wiring
  lines (an import and one builder callback), so the integration file stayed
  wiring only.
- Canvas and PDF both consume the shared layout through
  `src/features/schedules/layout.ts`; a shared-input test proves parity. PDF
  coverage exports a locked placement, excludes a hidden one and draws the
  missing-schedule placeholder.
- Placement tests cover the draw-layer rule, row-range update and delete,
  continuation, the schedule-delete cascade in one undo, move, corner resize,
  rotation with a locked refusal, page delete and duplicate with the same
  `scheduleId`, hit-test exclusion of hidden items and the doctor report.
- No visual baseline changed and no new `file-budgets.json` exception was added;
  the largest new file is 351 lines.
- F-128 and F-129 are recorded, and F-118 is extended: page import still does not
  merge schedule definitions, so an imported placement can reference a missing
  schedule and the preflight warning stays open.
- Squash merged as `7a4944bced4f8aeb0945ac5ceba9c2cbcb7f8bac`; `main` CI is green
  on that commit.

### Next phase

Phase 6 — [CSV round-trip for schedules #287](https://github.com/MajorJohnDoe/gridscalr/issues/287):
`src/features/schedules/csv.ts` and `csvUi.ts`, stable `Label [key]` headers with
an `ID` column, locale delimiter and BOM, formula-injection escaping, a dry-run
conflict report, one undo step and the large-file budget. No schema change is
expected.

## Phase 6 — CSV round-trip

- **Issue:** [#287](https://github.com/MajorJohnDoe/gridscalr/issues/287) (closed by the merge)
- **PR:** [#291](https://github.com/MajorJohnDoe/gridscalr/pull/291) (squash merged)
- **Branch:** `feat/schedule-csv` (deleted after merge)
- **Verified head SHA:** `35352c12f6c601d4d906044db9d7296af1409662`
  (`dfaccb1` feature and gates, `a56c9fd` documentation, `35352c1` handover)
- **Merge commit:** `ef52eec574cb42b7e91bb850b7d7bda811180d85`
- **Status:** merged to `main`. All six PR checks passed on the verified head.
  The `main` CI run [43927295563](https://github.com/MajorJohnDoe/gridscalr/actions/runs/43927295563)
  is green on the merge commit. No schema change (`SCHEMA_VERSION` stays 28), no
  app-version bump, no tag or release.

### Completed work

- `src/features/schedules/csv.ts` and `csv/` provide a pure round-trip: locale
  dialect, comma/semicolon/tab delimiter detection, BOM handling, an RFC 4180
  parser, `Label [key]` header mapping by key then label, typed value
  validation, a dry-run conflict plan and a apply step.
- Export writes `ID`, `Typ` (`item`/`space`) and every visible schedule column,
  uses the app-locale delimiter and a UTF-8 BOM, keeps numeric cells numeric and
  guards text starting with `=`, `+`, `-`, `@`, tab or CR with a leading
  apostrophe. A literal leading apostrophe that looks like a guard is escaped
  too. A grouped schedule exports one row per group with subtotals and
  `importable: false`.
- Import maps by bracketed key first and column label second, so a renamed label
  or a switched interface language does not mis-map a value. It validates stable
  IDs, `item`/`space` against the schedule source, duplicate IDs, extra cells,
  custom numbers, dates, booleans, exact enum ids or unambiguous labels and
  multi-enum tokens. A row with any invalid value is rejected and applies
  nothing.
- The dry run reports changed rows with before/after values, unchanged rows,
  unknown fields, duplicate headers, unknown IDs, duplicate IDs, wrong types,
  invalid values, read-only columns, malformed rows and schedule rows absent
  from the file. The dialog renders every value with `textContent`.
- Apply is one `store.mutate` call, so a multi-row import is one undo step. It
  updates existing measurements (`label`, `room`, `tag`) and spaces (`name`,
  `number`, `floor`, `usage`, `status`) plus custom values. It never creates an
  entity. The project revision captured when the dialog opens is checked before
  writing, so a change made while the preview is open refuses the apply.
- Bounds: UTF-8 only through a fatal decoder with BOM preservation, 10 MB
  (`MAX_SCHEDULE_CSV_BYTES` in `src/io/limits.ts`) checked before decoding and
  20 000 data rows (`MAX_SCHEDULE_CSV_ROWS`) checked before any value is mapped.
  `pickCsv()` checks the size before reading the file in the browser and in
  Tauri.
- The Summary header gains **Export CSV…** and **Import CSV…**. Export is
  available in a view-only session; import is disabled in view-only and for a
  grouped schedule. `src/app/exportFlows.ts` writes the file with the existing
  source-path write guard; `src/app/summaryFlow.ts` opens the feature import
  flow.
- The a11y, touch-target and UI-scale gates gain the CSV import dialog. The
  harness opens it through the real browser file picker with one changed label,
  so the gates inspect a populated preview and an enabled apply action.
- i18n keys in both catalogs, generated types, `src/styles/schedules.css`, and
  the documentation in `README.md`, `docs/user-guide.md`, `docs/limitations.md`,
  `docs/security-policy.md`, `docs/testing.md` and
  `docs/plan/foundation-findings.md`.

### Modules

- `src/features/schedules/csv.ts`, `csvUi.ts`, `csv/types.ts`, `text.ts`,
  `headers.ts`, `values.ts`, `row.ts`, `plan.ts`, `export.ts`, `apply.ts`
- `src/features/schedules/ui/csvImport.ts`, `ui/csvReport.ts`, `ui/panel.ts`
- `src/app/exportFlows.ts`, `src/app/summaryFlow.ts`, `src/app/App.ts` (two
  action lines), `src/ui/panels.ts`, `src/ui/inspector.ts`
- `src/io/limits.ts`, `src/io/platform.ts`
- `src/styles/schedules.css`, both i18n catalogs and generated types
- `tests/schedulesCsv.test.ts`, `schedulesCsvUi.test.ts`,
  `schedulesCsvPerformance.test.ts`, `tests/accessibilityGate.test.ts`
- `scripts/accessibility-{rules,check}.mjs`, `touch-target-check.mjs`,
  `ui-scale-check.mjs`, `ui-harness.mjs`
- `docs/user-guide.md`, `docs/limitations.md`, `docs/security-policy.md`,
  `docs/testing.md`, `README.md`, `docs/plan/foundation-findings.md`

### Decisions

- `store.mutate` already provides the one-call, one-history-step batch, so
  `src/state/store.ts` is unchanged. The import dialog calls it once.
- Importable built-in columns are deliberately narrow: measurement `label`,
  `room`, `tag` and space `name`, `number`, `floor`, `usage`, `status`. Reference
  and derived columns are exported but read-only, named in the dry run, because
  their CSV cells are display labels and importing by label is ambiguous after a
  rename (F-130).
- A custom enum value is exported as its label and accepted by exact option id
  or an unambiguous exact label. A multi-enum is exported as labels separated by
  semicolons, because the table's comma-separated form collides with the English
  delimiter. Renaming an option label can invalidate an older file (F-131).
- A yes/no value accepts `true`/`false`, `yes`/`no`, `ja`/`nej`, `1`/`0`. A
  decimal comma is accepted only when the delimiter is not a comma, so `1,234`
  in a comma file stays ambiguous and is rejected instead of silently becoming
  `1.234`.
- A row with any invalid cell is rejected as a whole; valid cells in the same
  row are not applied. The dialog states this and the rejected count.
- The import reports read-only columns instead of silently ignoring edits to
  them. It never creates rows (F-132).
- The apply refuses a stale preview by comparing the store revision. This is a
  small data-integrity safeguard rather than a second confirmation.
- The export writes a schedule with its own definition only, not the Summary
  panel's page/category/space chips, so the file is a stable schedule artifact
  and not a view snapshot.
- The four visual baselines are unchanged: the new surface is a dialog, not one
  of the captured screens. Screenshot recapture stays deferred to Phase 7.
- No XLSX schedule export or import, no formula or calculated field and no
  creation of measurements, spaces, fields or schedules.

### Findings

- F-130: reference and derived columns cannot be changed through CSV.
- F-131: a renamed custom option label makes an older CSV value invalid.
- F-132: CSV import never creates rows or entities.
- F-118 is unchanged: the CSV imports into existing measurements and spaces by
  stable ID, and reference columns are read-only, so it cannot create a dangling
  `spaceId` or `scheduleId`. The page-import preflight warning stays open.

### Checks

Local gate green on the implementation head: `check:versions`,
`check:file-budgets` (603 files, no new exception), `check:modules`
(20 foundation features), `check:security`, `check:actions`,
`check:dependencies` (5 accepted cargo advisories, no unaccepted finding),
`check:docs` (only the expected stale-screenshot warning), `format:check`,
`lint`, `check:i18n` (3486 keys), `check:themes`, `npx tsc --noEmit`,
`npm test -- --run` (171 files, 1707 tests), `test:robustness` (5 files,
104 tests), `test:ui`, `test:import`, `test:visual` (4 baselines unchanged),
`test:a11y` (5 palettes × 15 surfaces, 75 checks, no serious/critical),
`test:touch-targets` (526 controls, 15 surfaces), `test:ui-scale`
(100/150/200 %, CSV dialog 720/720/720 px wide and inside each viewport) and
`test:docs-capture` (27 screenshots, `docs/screenshots/` untouched).

Measured on the development container with the 10 000-item, five-column
synthetic project (`tests/schedulesCsvPerformance.test.ts`): export 209.2 ms and
import plan 188.7 ms against the 1 500 ms documented target. The test asserts a
looser 6 000 ms CI ceiling and the target under `GRIDSCALR_PERF_STRICT=1`. The
numbers are in `docs/limitations.md`.

### Conductor verification

- PR [#291](https://github.com/MajorJohnDoe/gridscalr/pull/291) head
  `35352c12f6c601d4d906044db9d7296af1409662` matched the worker report; all six
  checks were `success`, the base was `main` and the merge state was
  `CLEAN`/`MERGEABLE`.
- Conductor re-ran `npx vitest run tests/schedulesCsv.test.ts
  tests/schedulesCsvUi.test.ts tests/schedulesCsvPerformance.test.ts
  tests/schedulePlacement.test.ts tests/schema28.test.ts`: 5 files, 62 tests
  passed. `check:modules` and `check:file-budgets` are green with no new
  exception.
- Scope matched the issue: `SCHEMA_VERSION` stays 28, no app version bump, no
  store change (the existing `store.mutate` already gives one batch and one undo
  step). `App.ts` gained six wiring lines for export and import.
- The 10 MiB byte limit is shared in `src/io/limits.ts` and checked before
  decoding; the 20 000-row limit is checked after the record split and before any
  value is mapped. Both are documented in `docs/security-policy.md`.
- Tests cover stable headers with a BOM, Swedish delimiter and decimal comma,
  formula escaping and literal unguarding, grouped export read-only and import
  refusal, unchanged round-trip, before/after conflicts, unknown fields and IDs,
  duplicate headers and IDs, invalid enum options, read-only columns, non-UTF-8
  rejection, space updates, absent rows untouched, no entity creation and one
  undo step; export 209.2 ms and import plan 188.7 ms against the 1 500 ms
  target.
- No visual baseline changed. F-130 … F-132 are recorded; F-118 is unchanged
  because CSV updates existing rows by stable ID and cannot create a dangling
  reference.
- Squash merged as `ef52eec574cb42b7e91bb850b7d7bda811180d85`; `main` CI is green
  on that commit.

## Phase 7 — harden and document Drift Slice 1

- **Issue:** [#292](https://github.com/MajorJohnDoe/gridscalr/issues/292) (closed by the merge)
- **PR:** [#294](https://github.com/MajorJohnDoe/gridscalr/pull/294) (squash merged)
- **Branch:** `docs/slice-1-hardening` (deleted after merge)
- **Verified head SHA:** `78efccfe8fa4cba189c7aaee80e13140e58cc9d8`
  (`2392c24` focus fix, `ef677cc` gate seed data, `86e775a` documentation,
  release notes and screenshots, `78efccf` handover)
- **Merge commit:** `9e995ec832ebcb7eb67250862333f9df664d411c`
- **Status:** merged to `main`. All six PR checks passed on the verified head.
  The `main` CI run [43941627387](https://github.com/MajorJohnDoe/gridscalr/actions/runs/43941627387)
  and the **Pages** run [43941627377](https://github.com/MajorJohnDoe/gridscalr/actions/runs/43941627377)
  are green on the merge commit. No app-version bump, no tag, no release and no
  `site/release.json` change.

### Completed work

- `npm run docs:capture` recaptured all 35 screenshots, including the new
  Summary tab, schedule builder, summary roles, placed table, schedule CSV
  import, space register and custom-fields editor/inspector. The capture flow
  seeds deterministic property data through `scripts/ui-harness.mjs`.
- `docs/user-guide.md` covers the shipped fields, spaces, summary, schedules,
  placed tables and CSV round-trip; the stale phase wording is removed.
- `docs/workflows.md` gains a "Measure rooms and produce a schedule" task guide
  for an operations technician or technical property manager, including the
  Excel round-trip step and checklist.
- `docs/limitations.md` states every deliberate gap in F-118 … F-133 and adds
  the measured Slice 1 performance profile (15 000-item summary, 10 000-row
  schedule, placed-table layout, 10 000-row CSV export/import).
- `docs/testing.md` records the 15 accessibility surfaces / 75 checks and the
  current UI-scale dialog list.
- `docs/release-notes/0.29.0.md` is a draft for schema 28 with the compatible
  27 → 28 path and the known limits. No app version, tag, release or landing
  site changed.
- `docs/roadmap.md` marks Drift Slice 1 complete on schema 28 and links the
  merged phase issues; the 1.0 gate wording remains honest.
- The Summary toolbar now restores focus to the picker, filter chip, action or
  dialog trigger after a repaint (F-127). The keyboard walkthrough covered the
  picker and filters, builder, roles, placement, CSV import, space register and
  placed-table selection.
- F-133 records that the bundled demo project still has empty schema 28
  registers; the screenshots seed sample data instead.

### Modules

- `src/ui/inspector.ts`, `src/features/schedules/ui/panel.ts`,
  `tests/schedulesUi.test.ts`
- `scripts/ui-harness.mjs`, `scripts/docs-capture-flow.mjs`,
  `scripts/capture-docs-shots.mjs`
- `docs/user-guide.md`, `docs/workflows.md`, `docs/limitations.md`,
  `docs/testing.md`, `docs/roadmap.md`,
  `docs/plan/drift-slice-1.md`, `docs/plan/foundation-findings.md`,
  `docs/release-notes/0.29.0.md`, `README.md`, `AGENTS.md`
- `docs/screenshots/` (35 images) and `docs/screenshots/manifest.json`

### Decisions

- Screenshot data is seeded through the same harness helpers as the browser
  gates, so the docs capture exercises the real UI without changing the bundled
  demo fixture (F-133).
- No new feature, schema field, schema bump, version bump, tag, release or
  landing-site change is part of this phase.
- F-124, F-125 and F-118 stay open product decisions and are documented plainly
  in `docs/limitations.md`; the code is unchanged.

### Findings

- F-133: the bundled demo project has empty schema 28 registers.
- F-119 … F-132 remain as recorded by their phases; F-127's focus behaviour is
  fixed in this phase rather than only documented.

### Checks on the implementation head

Local gate green: `check:versions`, `check:file-budgets` (603 files),
`check:modules` (20 foundation features), `check:security`, `check:actions`,
`check:dependencies` (5 accepted cargo advisories, 0 unaccepted),
`GRIDSCALR_DOCS_STRICT=1 check:docs` (256 links, 50 images, 35 screenshots),
`format:check`, `lint`, `check:i18n` (3486 keys), `check:themes`,
`npx tsc --noEmit`, `npm test -- --run` (171 files, 1707 tests),
`test:docs-capture` (35 screenshots, committed folder untouched),
`test:a11y` (5 palettes × 15 surfaces, 75 checks, no serious/critical),
`test:touch-targets` (531 controls, 15 surfaces), `test:ui-scale`
(100/150/200 %), `test:visual` (4 baselines, 0 differing pixels), `test:ui` and
`check:performance` (CI profile, all budgets pass). CI is authoritative on the
PR head; the handover commit moves the head after this record.

### Conductor verification

- PR [#294](https://github.com/MajorJohnDoe/gridscalr/pull/294) head
  `78efccfe8fa4cba189c7aaee80e13140e58cc9d8` matched the worker report; all six
  checks were `success`, the base was `main` and the merge state was
  `CLEAN`/`MERGEABLE`.
- Conductor re-ran `npx vitest run tests/schedulesUi.test.ts
  tests/accessibilityGate.test.ts tests/schema28.test.ts`: 3 files, 38 tests
  passed, and `GRIDSCALR_DOCS_STRICT=1 npm run check:docs` passed with 256
  links, 50 images and 35 screenshots and no stale-screenshot warning.
- Scope matched the phase: documentation, screenshots, release notes, tooling
  and two small in-scope fixes. `src/ui/inspector.ts` and
  `src/features/schedules/ui/panel.ts` only carry the F-127 focus restoration
  found by the keyboard walkthrough. No version file, Tauri config, Cargo
  manifest or `site/` file changed.
- The screenshot set grew from 27 to 35 images, including the eight new Slice 1
  surfaces; the manifest, alt text and descriptions pass the strict check.
- `docs/release-notes/0.29.0.md` is a draft that states schema 28, the 27 → 28
  path and the known limits; the roadmap marks Drift Slice 1 complete on schema
  28 with links to every phase.
- Squash merged as `9e995ec832ebcb7eb67250862333f9df664d411c`; `main` CI and the
  Pages deployment are green on that commit.

### Slice 1 status

Drift Slice 1 is **complete and merged** in the 0.29.0 development line: schema
28 foundation, custom fields, spaces, the schedule engine and Summary tab,
placed tables with PDF output, the CSV round-trip, and the hardening and
documentation pass. Phases #273, #275, #278, #281, #284, #287 and #292 are all
closed by their merges.

No release has been tagged or published. The app version stays `0.28.0`, the
schema stays 28, and the `0.29.0` release notes are a draft. A release requires
the product owner's explicit approval, including the version bump, the
documentation pass confirmation and the landing-site update.

Open product decisions recorded, not implemented: F-125 (the right dock is narrow
for wide schedules) and the later import-phase choice between merging and
remapping the schema 28 registers. F-118's preflight warning and F-124's card
editor shipped in the closeout below, and F-133's demo data now ships in the
bundled project.

### Release readiness

With the closeout merged, no known P0–P2 issue and no open release-blocking P3
remains in Slice 1. The version, tag, GitHub release and `site/release.json`
update are deliberately still pending the product owner's explicit approval.

## Closeout — release blockers

- **Issue:** [#296](https://github.com/MajorJohnDoe/gridscalr/issues/296) (closed by the merge)
- **PR:** [#297](https://github.com/MajorJohnDoe/gridscalr/pull/297) (squash merged)
- **Branch:** `fix/slice-1-release-blockers` (deleted after merge)
- **Verified head SHA:** `fa43a0e192aa898b1948e967d1c372c265cf3afd`
  (`73c0107` summary cards, `b453a3d` demo property example, `2724b19` import
  preflight, `fa43a0e` documentation)
- **Merge commit:** `374f39a8a54814981e8e4b9b32cc6ea1750c0dbb`
- **Status:** merged to `main`. All six PR checks passed on the verified head.
  The `main` CI run [43952411198](https://github.com/MajorJohnDoe/gridscalr/actions/runs/43952411198)
  and the **Pages** run [43952411170](https://github.com/MajorJohnDoe/gridscalr/actions/runs/43952411170)
  are green on the merge commit. No app version bump, no schema change, no tag,
  no release and no `site/release.json` change.

### Completed work

- **F-124** — **Project settings → Display → Summary cards** has one checkbox
  per card (`rooms`, `area`, `wallLength`, `doors`). It writes
  `settings.summary.cards[].visible` through `store.mutate`, so each change is one
  undo step, and the Summary panel hides or restores the card from the stored
  setting. Both catalogs are localized and
  `tests/summaryCardsSettings.test.ts` drives the checkbox, the panel and the
  undo step.
- **F-133** — `scripts/make-demo-project.mjs` now writes a deterministic,
  language-neutral property example: building → ground floor → rooms 101 Office
  (manual area) and 102 Warehouse (area derived from the linked warehouse-floor
  measurement), a Fire class field with a Fire data field set, and a Quantity
  schedule. All ids are fixed and `npm run docs:demo` reproduces the fixture byte
  for byte. The browser seeds reuse the demo registers and only add the summary
  roles, the space schedule and the placed table the demo does not carry.
- **F-118** — `src/features/projectImport/unresolved.ts` counts copied items
  whose `spaceId` or `scheduleId` does not resolve and custom values with no
  destination measurement field. The preflight names those counts before the
  commit. **Clear unresolved links** is off by default; when on the commit
  clears the room link, removes a placement whose schedule is missing, drops the
  unknown custom values and reports the cleared counts after the import. No
  register is merged or remapped, and the source project and file are never
  modified.

### Decisions

- A placement with an unresolvable schedule is kept by default and renders the
  existing placeholder. The opt-in clear removes the placement item, because a
  table without a definition cannot be repaired in place; the preflight text says
  so and F-134 records the trade-off.
- The preflight dialog returns an explicit decision object
  (`{ confirmed, clearUnresolved }`) so the clear choice survives a relink in the
  same dialog and cannot be enabled by Cancel.
- The demo data is project data, not interface text: the field label, room names
  and schedule name are plain English values and the ids are stable.
- `tests/visual/hero.png` is updated because the demo now has a field definition
  and field set, so the selected measurement shows the Fields section. The other
  three visual baselines are pixel-identical. All 35 documentation screenshots
  were recaptured from the new demo; the changed images are the ones the register
  data and the Fields section actually affect.
- `docs/screenshots/manifest.json` records the new source fingerprint.

### Findings

- F-124 closed — the card visibility editor shipped and the limitation sentence
  is removed.
- F-133 closed — the bundled demo ships the property example and the tests
  assert it.
- F-118 closed for the preflight scope. The merge/remap decision stays open for a
  later import phase.
- F-134 recorded: the opt-in clear removes a placed table rather than keeping its
  box for later relinking. Accepted and stated in the preflight text.

### Checks

Local gate green on the implementation head: `check:versions`,
`check:file-budgets` (604 files), `check:modules` (20 foundation features),
`check:security`, `check:actions`, `check:dependencies` (5 accepted cargo
advisories, 0 unaccepted), `GRIDSCALR_DOCS_STRICT=1 check:docs` (256 links,
50 images, 35 screenshots), `format:check`, `lint`, `check:i18n` (3500 keys),
`check:themes`, `npx tsc --noEmit`, `npm test -- --run` (172 files, 1715 tests),
`test:robustness` (5 files, 104 tests), `test:ui`, `test:import`,
`test:visual` (hero baseline updated; three unchanged), `test:a11y` (5 palettes ×
15 surfaces, 75 checks), `test:touch-targets` (526 controls, 15 surfaces),
`test:ui-scale` (100/150/200 %), `test:canvas`, `test:docs-capture` (35
screenshots, committed folder untouched), `npm run docs:capture` (35 screenshots)
and `npm run build`. CI is authoritative on the PR head.

### Conductor verification

- PR [#297](https://github.com/MajorJohnDoe/gridscalr/pull/297) head
  `fa43a0e192aa898b1948e967d1c372c265cf3afd` matched the worker report; all six
  checks were `success`, the base was `main` and the merge state was
  `CLEAN`/`MERGEABLE`.
- Conductor re-ran `npx vitest run tests/summaryCardsSettings.test.ts
  tests/demoProject.test.ts tests/projectImport.test.ts
  tests/projectImportUi.test.ts`: 4 files, 30 tests passed. `check:modules` and
  `GRIDSCALR_DOCS_STRICT=1 npm run check:docs` are green (256 links, 50 images,
  35 screenshots).
- F-118 stayed at the agreed scope: `unresolvedImportReferences()` only counts
  and `clearUnresolved` defaults to `false`; `commitProjectImport` clears or
  removes references only when the option is on. No register merge or id remap
  exists in the diff.
- F-124 writes through one `store.mutate` per checkbox, so each visibility
  change is one undo step; all four cards are covered and localized.
- F-133's regenerated `fixtures/demo-project.gridscalr` is byte-identical when
  `npm run docs:demo` is re-run, and the fixture now carries four spaces, one
  field, one field set and one schedule. The only changed visual baseline is
  `tests/visual/hero.png`, which is the intended inspector/demo change.
- Squash merged as `374f39a8a54814981e8e4b9b32cc6ea1750c0dbb`; `main` CI and the
  Pages deployment are green on that commit.

# Drift Slice 1 — Custom fields, spaces, schedules and summary

Status: phase 1 (schema 28 foundation) implemented; phases 2–7 pending.
Target: next minor release on schema 28 (for example 0.29.0). 1.0 is deferred.
Owner: product + conductor; one fresh worker per phase.

## 0. Decision gate

Decided: **1.0 is deferred**. It stays a quality gate, not a date. The next
release is a pre-1.0 minor on schema 28, and foundation work comes first.

Consequences:

- Schema 27 is no longer frozen for 1.0. Schema 28 is a deliberate unfreeze.
- `AGENTS.md`, `docs/roadmap.md`, `docs/project-file.md` and the schema line in
  the README must be updated in the same change as the schema bump.
- 1.0 documentation must stop claiming that schema 27 is the last schema before
  1.0. The new statement is: 1.0 follows when the foundation is complete and
  the release gate is met; schema 28 is the current development schema.
- Slice 1 can start immediately on a branch. Do not tag 1.0 from it.

The broader foundation sequence is in `foundation-program.md`. Slice 1 is the
first step, not the whole program.

## 1. Goal

Give a technical property manager or operations technician a complete loop:

> measure rooms and building parts → see a live summary → place a schedule on
> the drawing → edit the data in Excel and bring it back

without leaving the local-first project model.

The slice must prove four things:

- custom fields can carry real property data,
- spaces are first-class and their areas are derived, not duplicated,
- a schedule is a live view over project data,
- the same data survives CSV round-trip and PDF export.

## 2. Users and jobs

Primary user: technical property manager / drifttekniker.

Jobs in this slice:

- “I want to record room number, name, floor, usage and area.”
- “I want to mark walls, doors and rooms and see totals immediately.”
- “I want a table on the drawing that updates when I measure.”
- “I want extra fields such as fire class, component type or condition.”
- “I want to edit a hundred rows in Excel and import them back.”
- “I want the table to look the same in the PDF as on screen.”

Not in this slice: assets, issues, inspections, signoff, maintenance plans,
documents, DWG/DXF, BCF/IFC/FI2, mobile, PDF/A, redaction.

## 3. Scope

### In scope

- Schema 28: field definitions, field sets, custom values, spaces, schedule
  definitions, schedule placements, summary settings.
- Custom fields on measurements and spaces.
- Space register: room number, name, floor, usage, status, area.
- Derived room area from linked area measurements, with manual fallback.
- Schedule sources: measurements and spaces.
- Live summary panel with four KPI cards.
- Schedule builder: columns, grouping, sorting, filters, totals.
- Schedule table placed on a drawing page, live-updating, resizable, lockable.
- CSV export/import round-trip with stable IDs and conflict report.
- XLSX export of a schedule (read-only; CSV is the round-trip format).
- PDF export of the placed table.
- Migration 27 → 28, integrity rules, project doctor entries.
- Documentation, screenshots, tests.

### Out of scope

- Assets, issues, inspections, signoff, audit trail, QR.
- DWG/DXF import; keep PDF/TIF only for now.
- PDF/A, redaction, cryptographic signatures.
- BCF, IFC, FI2, COBie.
- Mobile/tablet build.
- Formulas, calculated fields, cross-schedule references.
- Multi-source schedules; one source per schedule in this slice.
- Custom field inheritance; values are explicit.
- XLSX import; CSV is the import format.
- Schedule pagination beyond a row range and a continuation placement.

## 4. Product decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Schema timing | After 1.0 | Protect the 1.0 quality gate |
| Schedule placement | A drawing item of kind `schedule` | Reuses layers, visibility, locks, selection and PDF export |
| Custom field storage | `custom` object keyed by field id | Referential integrity; stable keys for CSV |
| Area source | Measured wins; manual only when no linked measurement | No dual source of truth |
| Summary semantics | `summaryRole` on category and count type | Robust to renames; no name matching |
| CSV header | `Label [key]` plus an `ID` column | Human-readable and stable |
| CSV round-trip scope | Item rows and space rows | Grouped views are read-only exports |
| Table overflow | Row range + continuation placement | Predictable layout; no unreadable shrinking |
| XLSX | Export only | CSV is enough for round-trip |
| Audit | Defer to Slice 2 | Keep the slice bounded |

## 5. Data model — schema 28

### 5.1 New project arrays

```ts
interface Project {
  // existing fields...
  fieldDefinitions: FieldDefinition[];
  fieldSets: FieldSet[];
  spaces: Space[];
  schedules: ScheduleDefinition[];
  settings: ProjectSettings; // gains summary settings
}
```

All new arrays default to `[]` on migration. Nothing is inferred or invented.

### 5.2 Custom fields

```ts
type FieldScope = "measurement" | "space" | "asset" | "issue" | "inspection" | "document";

type FieldType =
  | "text"
  | "number"
  | "unitNumber"
  | "boolean"
  | "date"
  | "enum"
  | "multiEnum";

interface FieldDefinition {
  id: string;              // field_...
  key: string;             // stable slug, unique per scope, immutable
  label: string;           // editable
  type: FieldType;
  scope: FieldScope;
  unit?: string;           // for unitNumber
  options?: { id: string; label: string }[]; // enum/multiEnum
  required?: boolean;
  defaultValue?: CustomValue;
  description?: string;
  order: number;
  appliesTo?: {
    itemKinds?: ItemKind[];
    categoryIds?: string[];
    countTypes?: string[];
    spaceKinds?: SpaceKind[];
  };
  validation?: {
    min?: number;
    max?: number;
    maxLength?: number;
  };
}

interface FieldSet {
  id: string;              // fset_...
  name: string;
  scope: FieldScope;
  fieldIds: string[];
  description?: string;
}

type CustomValue = string | number | boolean | string[] | null;
```

Rules:

- `key` is immutable after creation; `label` can change.
- Changing `type` is allowed only while no value exists. Otherwise block and
  ask for a new field.
- Enum options have stable ids; labels can change.
- Deleting a field with values requires confirmation naming the value count;
  deletion is one undo step.
- Unknown field ids or invalid values are reported, never silently coerced.
- Custom values live on `MarkupItem.custom` and `Space.custom`.

### 5.3 Spaces

```ts
type SpaceKind = "building" | "floor" | "room" | "zone";

interface Space {
  id: string;              // space_...
  kind: SpaceKind;
  parentId?: string;       // must be a space in the same project
  number?: string;         // room number, unique per parent as a warning only
  name: string;
  floor?: string;
  usage?: string;
  status?: string;
  areaMode: "measured" | "manual";
  areaM2?: number;         // only when areaMode = "manual"
  pageId?: PageId;         // optional location
  custom?: Record<string, CustomValue>;
  createdAt: string;
  updatedAt: string;
}
```

Area rules:

- `areaMode = "measured"`: area is the sum of visible area measurements whose
  `spaceId` matches, add minus subtract, converted to m². If none exist, area is
  missing and the UI shows a warning; it does not silently fall back to manual.
- `areaMode = "manual"`: `areaM2` is an explicit input. If a linked measurement
  also exists, the measured value wins and the manual value is flagged unused.
- Hidden items and hidden layers are excluded. Locked items are included.
- A space may link to a page, but the link is optional.
- Deleting a page does not delete spaces; it clears the page link and reports it.
- Deleting a space does not delete measurements; it clears `spaceId` and reports.

### 5.4 Category and count-type summary roles

Add optional fields:

```ts
interface Category {
  summaryRole?: "wall" | "floor" | "ceiling" | "roof" | "other";
}

interface CountTypeDef {
  summaryRole?: "door" | "window" | "fixture" | "other";
}
```

No automatic role assignment on migration. A template action (“Lägg till
byggdelspaket”) can create Walls, Floors, Ceilings, Doors and Windows with roles.
If roles are missing, the KPI card shows 0 and a “Konfigurera” link.

### 5.5 Summary settings

```ts
interface SummarySettings {
  cards: {
    id: "rooms" | "area" | "wallLength" | "doors";
    visible: boolean;
  }[];
}
```

Defaults: all four visible. Later slices add `openIssues` and `inspections`.

### 5.6 Schedules

```ts
type ScheduleSource = "measurements" | "spaces";
type FieldRef = string; // built-in key or "custom:<fieldId>"

interface ScheduleColumn {
  id: string;
  field: FieldRef;
  label?: string;
  width?: number;          // relative width
  visible: boolean;
  format?: "text" | "number" | "unit" | "date";
}

interface ScheduleFilter {
  pageIds?: PageId[];
  categoryIds?: string[];
  countTypes?: string[];
  spaceIds?: string[];
  itemKinds?: ItemKind[];
  custom?: { fieldId: string; op: "eq" | "contains" | "empty" | "notEmpty"; value?: CustomValue }[];
}

interface ScheduleDefinition {
  id: string;              // sched_...
  name: string;
  source: ScheduleSource;
  rowMode: "items" | "grouped";
  columns: ScheduleColumn[];
  filters: ScheduleFilter;
  groupBy?: FieldRef;
  sort?: { field: FieldRef; direction: "asc" | "desc" }[];
  totals?: { field: FieldRef; op: "sum" | "count" | "avg" | "min" | "max" }[];
  createdAt: string;
  updatedAt: string;
}
```

`rowMode = "grouped"` is read-only for CSV. `rowMode = "items"` is the
round-trip mode.

### 5.7 Schedule placement

A schedule on the sheet is a drawing item:

```ts
interface MarkupItem {
  kind: ItemKind;          // adds "schedule"
  scheduleId?: string;
  rowStart?: number;       // 0-based
  rowLimit?: number;       // visible rows
  fontSize?: number;
  showHeader?: boolean;
  showTotals?: boolean;
  // points define the table box; rotation and lock use existing fields
}
```

Rules:

- A schedule item must sit on a `draw` layer. If the active layer is a measure
  layer, the placement action creates or selects a draw layer named “Scheman”.
- The table content is computed at render time from the schedule definition.
- A missing schedule renders a visible placeholder and is reported by the doctor.
- Deletion of a schedule with placements requires confirmation and cascades the
  placements in one undo step.
- Hidden/locked semantics are the existing item and layer semantics.
- Page delete removes the placements on that page, like any other item.
- Page duplicate copies the placement with the same `scheduleId`.

### 5.8 Migration 27 → 28

- `SCHEMA_VERSION = 28`.
- `migrateV27ToV28` adds empty arrays and default summary settings.
- Existing `room` strings remain untouched. An explicit helper can create spaces
  from unique room strings; it is never automatic.
- Existing categories/count types get no `summaryRole`.
- Existing items get no `spaceId` or `custom`.
- Migration is deterministic, idempotent and does not drop data.
- Add `fixtures/legacy/schema-28.gridscalr` and update
  `scripts/make-legacy-fixtures.mjs`.
- Add 28 to the migration corpus test and keep 1–28 green.

### 5.9 Integrity and doctor

New validation rules:

- Field ids and keys unique per scope; enum options valid; defaults valid.
- Space ids unique; parent exists; no cycles; kind valid; areaMode valid.
- Measurement `spaceId` resolves to a space; area measurements only.
- Schedule ids unique; source valid; columns resolve; group/sort/total fields
  resolve; filters resolve.
- Schedule placement resolves to a schedule, a page and a draw layer.
- Custom values resolve to a field in the same scope and match its type.
- Summary cards reference known metrics.
- Duplicate room number is a warning, not a hard error.

Load report codes: `droppedFieldDefinition`, `repairedFieldId`,
`droppedSpace`, `repairedSpaceId`, `droppedSchedule`, `repairedScheduleId`,
`droppedSchedulePlacement`, `droppedCustomValue`, `repairedCustomValue`.

The doctor reports and repairs only deterministic issues: duplicate ids,
dangling references, unknown custom keys. It does not invent values or areas.

## 6. UX

### 6.1 Summary panel

A new right-dock tab **Sammanställning** and an action **Sammanställning**
(`Ctrl+Alt+S`).

Layout:

- Four KPI cards: Rum, Area, Väggar, Dörrar.
- A live table below: group, count, length, area, unit.
- Filter chips: page, category, room/space.
- Buttons: **Nytt schema…**, **Placera på ritning…**, **Exportera…**.
- Clicking a row zooms to the related items on the drawing.
- Empty state: “Inga rum ännu” / “Skapa ett schema”.

The panel must be readable by a screen reader: a real `<table>` with caption and
headers, plus text alternatives for the KPI cards.

### 6.2 Schedule builder

Dialog with:

- Name and source.
- Row mode: items or grouped.
- Column picker from built-in fields and custom fields; drag order.
- Group by, sort, totals.
- Filters: page, category, count type, space, custom field.
- Live preview with the first 20 rows.
- Save, duplicate, delete.

Validation messages are inline. Unknown fields are shown as invalid, not hidden.

### 6.3 Table on the sheet

- **Placera på ritning…** from the summary or the schedule list.
- Choose page, width and row range; click to place or accept a default position.
- The table renders header, rows, subtotal and grand total.
- Drag to move; corner handles to resize.
- Double-click or context menu opens the schedule.
- Context menu: **Redigera schema…**, **Byt radintervall…**, **Ta bort**.
- Overflow: show a warning and offer **Fortsätt på ny tabell** (row range).
- The table is selectable, lockable and hideable like any drawing item.
- PDF export draws the same table as vector text and lines.

### 6.4 Space register

A **Utrymmen** panel or dialog:

- Tree/list: building → floor → room, with room number, name and area.
- Add, edit, delete, move to another parent.
- **Koppla vald areamätning** and **Skapa rum från rumstext** actions.
- Area source badge: **Mätt** or **Manuell**; warning when missing.
- Clicking a room selects and zooms its measurement.
- Deleting a room clears `spaceId` on measurements after confirmation.

### 6.5 Custom fields UI

- **Project settings → Fält**: list, add, edit, delete, reorder.
- Field editor: label, key, type, unit, options, required, default, applies-to.
- **Fältuppsättningar**: named groups that can be applied to new measurements or
  spaces.
- Inspector section **Fält** for the selected measurement or space.
- Inputs by type; validation messages; required marker; clear button.
- Field values are included in the Markups table? Not in this slice; schedules
  and inspector only. Keep the Markups table stable.

### 6.6 Empty and error states

- No fields: explain what a field is and offer a template.
- No spaces: offer **Skapa rum från rumstext** or **Nytt rum**.
- No schedules: offer **Nytt mängdschema**.
- Missing area: warning with a link to the linked measurement.
- Schedule overflow: warning with a continuation action.
- Invalid custom value: inline error; save is not blocked for unrelated fields.

### 6.7 Shortcuts and i18n

- Add `summary: "Ctrl+Alt+S"` to `src/ui/shortcuts.json`.
- Update `docs/shortcuts.md` and both README shortcut tables.
- All new UI strings in `en.json` and `sv.json`; no hard-coded text.
- `npm run i18n:types` and `npm run check:i18n`.

## 7. Algorithms

### 7.1 Schedule computation

A pure source interface:

```ts
interface ScheduleSourceAdapter {
  columns(project: Project): ScheduleColumnDefinition[];
  rows(project: Project, filter: ScheduleFilter): ScheduleRow[];
}
```

`ScheduleRow` contains a stable `rowId`, `entityId`, `cells` and `groupPath`.
The measurement source reuses `itemMetrics` and the existing quantity rules.
The space source computes area with the derivation rule above.

Computation order:

1. Filter by visibility, page, category, count type, space and custom fields.
2. Map to rows.
3. Sort stably.
4. Group, compute subtotals.
5. Apply totals.
6. Limit rows for preview; the full set is available for export.

Cache by project change counter and schedule id. Invalidate on any store change.

### 7.2 Table layout

A pure `layoutScheduleTable` function:

- Inputs: rows, columns, widths, font metrics, box size, row range, style.
- Output: header cells, row cells, grid lines, subtotal rows, total row, overflow.
- Text measurement is injected: canvas `measureText` for screen, PDF font metrics
  for export.
- Wrap or ellipsize long cells; never overflow the box silently.
- Minimum font size; if the box cannot fit the row range, report overflow.

The canvas renderer and the PDF exporter share this layout, so the table looks
the same in both.

### 7.3 Area derivation

`spaceArea(project, space)`:

- If `areaMode = "manual"` and no linked measurement: return `areaM2`.
- If `areaMode = "measured"`: sum visible area items with `spaceId`; add minus
  subtract; convert to m².
- If `areaMode = "manual"` but linked measurements exist: use measured and flag
  the manual value as unused.
- Return `{ areaM2, source, measurementCount, warning? }`.

### 7.4 CSV round-trip

Export:

- First column `ID`; second `Typ` (`item`/`space`).
- Headers `Label [key]`; built-in keys and `custom:<fieldId>` keys.
- Use the project locale delimiter and UTF-8 BOM for Excel.
- Escape text starting with `=`, `+`, `-`, `@`, tab or CR with a leading `'`.
- Numbers stay numeric.

Import:

- Detect delimiter and BOM; parse headers; map by bracketed key, then by label.
- Validate ids, types and options; produce a dry-run conflict report.
- Apply only after confirmation; one store batch; one undo step.
- Report unknown fields, missing rows, duplicate ids, invalid values and
  unchanged rows.
- Never create entities from CSV in this slice; update only.

## 8. Module map

All new code follows ADR 0013: feature `index.ts`, model/ui/io separation, 300-line
target, 400-line hard limit, no legacy budget exceptions.

### Phase 1 — Schema 28 foundation

- `src/model/types.ts` — new types and item fields.
- `src/model/integrity.ts` — new validation rules.
- `src/io/projectFile/fields.ts` — field normalizer.
- `src/io/projectFile/spaces.ts` — space normalizer.
- `src/io/projectFile/schedules.ts` — schedule normalizer.
- `src/io/projectFile/summary.ts` — summary normalizer.
- `src/io/projectFile/schema28.ts` — migration.
- `src/io/projectFile/parse.ts` — wiring and load report.
- `src/io/projectFile/report.ts` — new codes.
- `fixtures/legacy/schema-28.gridscalr`.
- `scripts/make-legacy-fixtures.mjs`.
- `tests/robustness/migrations.test.ts`.
- `tests/model/integrity.test.ts`.
- Docs: `docs/project-file.md`, `AGENTS.md`, `README.md`.

No UI in this phase. Exit: schema 28 parses, migrates, round-trips and validates.

### Phase 2 — Custom fields

- `src/features/fields/model.ts` — types, validation, value coercion, field sets.
- `src/features/fields/ui.ts` — Project settings editor and inspector section.
- `src/features/fields/index.ts`.
- `src/ui/settingsDialog.ts` wiring.
- `src/ui/selectionInspector.ts` wiring.
- i18n keys.
- Tests: model, field editor, inspector, a11y, CSV value mapping.

Exit: a field can be created, assigned, validated, renamed and deleted.

### Phase 3 — Spaces

- `src/features/spaces/model.ts` — hierarchy, area derivation, room-from-text.
- `src/features/spaces/ui.ts` — register panel and room picker.
- `src/features/spaces/index.ts`.
- `src/ui/` wiring for the panel and the selected measurement action.
- Tests: area derivation, hidden/locked, page delete, duplicate, cycle detection.

Exit: rooms exist, areas are right, and a measurement can be assigned to a room.

### Phase 4 — Schedule engine and summary

- `src/features/schedules/model.ts` — definitions, columns, filters, grouping.
- `src/features/schedules/sources/measurements.ts`.
- `src/features/schedules/sources/spaces.ts`.
- `src/features/schedules/summary.ts` — KPI computation.
- `src/features/schedules/ui.ts` — builder and summary panel.
- `src/features/schedules/index.ts`.
- `src/ui/` wiring: dock tab, action, shortcut.
- Tests: computation, grouping, totals, formatting, 1 000 rows.

Exit: a schedule can be created, previewed and read in the summary panel.

### Phase 5 — Placement on the sheet

- `src/features/schedules/placement.ts` — create/update/delete placement.
- `src/model/types.ts` — schedule item fields.
- `src/io/projectFile/items.ts` — normalize schedule items.
- `src/canvas/items/schedule.ts` — canvas renderer.
- `src/canvas/items/dispatch.ts` — dispatch.
- `src/canvas/pointer/targets.ts`, `drag.ts`, `transform.ts`, `doubleClick.ts`,
  `contextMenu.ts` — selection, move, resize, edit.
- `src/ui/inspector/schedule.ts` — properties.
- `src/ui/selectionMenu.ts`, `src/ui/itemIcon.ts` — actions and icon.
- `src/pdf/export/items/schedule.ts` and dispatch.
- Tests: hit-test, move/resize, hidden/locked, page delete/duplicate, PDF export.

Exit: a table can be placed, updates live, and exports correctly.

### Phase 6 — CSV round-trip

- `src/features/schedules/csv.ts` — export/import, mapping, conflicts.
- `src/features/schedules/csvUi.ts` — import dialog and preview.
- `src/state/store.ts` — batch mutation if not already available.
- `src/app/exportFlows.ts` / file open wiring.
- Tests: round-trip, locale, formula injection, conflicts, one undo, large file.

Exit: a schedule can go to Excel and back without silent data loss.

### Phase 7 — Hardening and documentation

- Performance benchmark and budget.
- Accessibility, touch targets, UI scale.
- Visual regression and screenshots.
- User guide, workflows, limitations, shortcuts, README.
- Release notes and roadmap.
- No new features.

## 9. Phase issues and PRs

One epic:

> **Drift Slice 1 — custom fields, spaces, schedules and summary**

One issue per phase with problem, scope, non-goals, acceptance criteria and the
module map above. One PR per issue, linked with `Closes #N`. The conductor
verifies the PR head SHA, all checks on that SHA, file scope and acceptance
criteria before merge. Never reuse a worker session across phases.

Suggested labels: `enhancement`, `refactor`, `tests`, `documentation`,
`tech-debt` where applicable.

## 10. Test plan

- **Model:** field validation, type coercion, deletion rules, space tree,
  cycles, area derivation, schedule filters, grouping, totals, CSV mapping.
- **Migration:** 27 → 28, corpus 1–28, round-trip, determinism, invalid
  references reported not dropped, `schema-28` fixture.
- **Robustness:** seeded custom field/space/schedule operations; page delete,
  duplicate, reorder; one undo per bulk action.
- **Store:** schedule recompute, cache invalidation, batch import as one undo.
- **Canvas:** schedule item hit-test, move, resize, hidden/locked, selection,
  context menu, page switch.
- **PDF:** table text/lines, fonts, page ranges, crop, layers, totals, hidden
  items excluded.
- **CSV:** export/import, stable ids, `Label [key]`, locale delimiter, BOM,
  conflicts, formula injection, 10 000 rows.
- **UI:** summary panel, builder, placement, space register, field editor;
  Playwright; a11y; touch targets; UI scale; visual regression.
- **Performance:** 1 000-row schedule and the 15 000-item reference project;
  add a measured budget or document why not.
- **i18n:** all keys in `en.json` and `sv.json`; `check:i18n`.
- **Docs:** `check:docs`, `test:docs-capture`, screenshot recapture.

## 11. Documentation

Same commit as the change:

- `docs/shortcuts.md` and both README shortcut tables for `Ctrl+Alt+S`.
- `README.md` feature bullet and architecture map.
- `docs/project-file.md` schema 28, new arrays, migration and compatibility.
- `AGENTS.md` schema line.
- `docs/limitations.md` new limits.

Documentation pass before release:

- `docs/user-guide.md`: custom fields, rooms, summary, schedule, table,
  CSV round-trip.
- `docs/workflows.md`: “Measure rooms and produce a schedule”.
- `docs/screenshots/manifest.json` and `npm run docs:capture`.
- Release notes and roadmap.

Every PR states `Docs impact: ...`.

## 12. Performance

Targets:

- Summary panel opens with 15 000 items in under 100 ms.
- Schedule recompute for 15 000 items in under 250 ms.
- 1 000-row schedule scrolls without jank; the panel is virtualised.
- Canvas draws only the visible rows.
- PDF export of a 1 000-row table completes within the existing export budget.
- Project size grows by less than 1 MB for 1 000 rows and 50 fields.

If a target is missed, record the measured number and either optimise or document
the limit. Do not silently remove the test.

## 13. Security

- CSV import is bounded: max 10 MB, max 20 000 rows, UTF-8, no formulas executed.
- CSV export escapes formula-leading text.
- No new network access, no telemetry, no accounts.
- No HTML rendering from field values or schedule labels.
- PDF text is escaped; no script actions.
- Project file remains the source of truth; CSV import is a controlled mutation.
- New Rust commands, if any, follow the command cap and path guards.

## 14. Risks

| Risk | Mitigation |
| --- | --- |
| Scope creep into assets/issues | Keep them out of Slice 1; schedule sources are measurements and spaces only |
| Schedule layout is harder than expected | Pure layout function, shared by canvas and PDF, with snapshot tests |
| Canvas integration touches many switches | New `schedule` item kind, exhaustive tests, small PR |
| CSV round-trip loses data | Dry-run conflict report, stable ids, one undo, fixture tests |
| Custom fields become a formula engine | Only typed values in this slice |
| Migration breaks old projects | 1–28 corpus, round-trip, determinism, fixture |
| Performance regresses | Cache, virtualise, measure against the reference project |
| Schema freeze decision is unclear | Decision gate before Phase 1 |
| Docs lag | Same-commit rules plus a documentation pass |

## 15. Definition of done

- Schema 28 migration and corpus tests pass.
- A user can create fields, rooms, a schedule and a placed table.
- The table updates when a measurement changes.
- CSV export/import round-trips with a conflict report and one undo.
- PDF export matches the on-screen table.
- Hidden/locked rules hold on canvas, panel and export.
- All local gates and CI are green on the exact PR SHA.
- User guide, shortcuts, project-file docs and screenshots are updated.
- No new P0/P1 bug and no unaccepted dependency advisory.
- The release notes state the schema change and the compatible path.

## 16. Open decisions

1. 1.0 deferred; schema 28 is the current development schema? Decided yes.
2. Schedule item as a drawing item? Recommended yes.
3. `summaryRole` on category/count type? Recommended yes.
4. Measured area wins over manual? Recommended yes.
5. CSV header `Label [key]`? Recommended yes.
6. XLSX export only, CSV round-trip? Recommended yes.
7. Add `Ctrl+Alt+S` for summary? Recommended yes.
8. Defer audit/signoff to Slice 2? Recommended yes.

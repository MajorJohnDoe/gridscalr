# Operation cards and schematic sheets

**Status:** agreed 2026-11-04. Phases 0–6 are complete; custom templates, A1 paper and refresh-fields-from-project remain future work.
**Scope:** an authoring workflow for operation cards built from blank sheet templates,
starting with the title-block frame and the data-summary table.
**Naming:** code, paths and identifiers use English. User-facing Swedish labels come
from the message catalogs. This document uses “operation card” and “schematic sheet”.

If the code and this plan disagree, stop and surface the conflict rather than
silently choosing one.

## 1. Summary

GridScalr is currently a PDF-first markup and measurement tool. This feature adds
authoring from a blank sheet:

- Start a project from a sheet template instead of a PDF.
- Add template sheets to an existing project at any time.
- Fill title-block and table cells with free text.
- Draw schematic pipes, ducts, control cables, rails and components.
- Export the result as a normal PDF with the frame and all values included.

The feature deliberately does **not** invent a second document model. A template
sheet is a page in the existing `documents` / `pages` / `layers` / `items` model,
so page numbering, layers, undo, visibility, locking, export and the project package
keep working with one set of rules.

## 2. Goals

- A technician can create a blank operation card, fill in its title block, draw a
  schematic, save it, reopen it and export it without preparing a PDF first.
- A project may mix PDF/TIF pages and template sheets.
- The two built-in templates are available both when creating a project and when
  adding a page: the drawing frame and the data-summary table.
- Text, pipes, rails and symbols look the same on the canvas and in the exported PDF.
- The project file stays small and backward compatible through a normal schema
  migration.
- Every new user-facing string is localized in English and Swedish.

## 3. Non-goals

- Automatic page numbering. The “Page” field is free text owned by the user.
- Derived tags, equipment schedules or I/O lists. Table cells are filled in manually.
- Automatic cable routing. Cables snap to rails; the user places the connection dots.
- A logo/image library. The logo cell is a text field until the image library exists.
- A standards claim. Symbols are original vector interpretations, not certified
  reproductions of a named standard.
- Customer-specific frames. Built-in templates are generic; importing a customer
  frame is a later extension.
- A project type flag. Behaviour is derived from the content.

## 4. Locked decisions

| Area | Decision |
| --- | --- |
| Project type | None. A project can mix PDF/TIF pages and template sheets. |
| Template sheet | `DocumentRef.kind = "template"`, one page per sheet, appended at the end. |
| Template rendering | A shared static PDF per template/version/paper/locale, plus overlay fields. |
| Field storage | `DocumentRef.template.fields`, a string map keyed by field id. |
| Page number | Free-text field. Prefilled with the sheet ordinal, never updated automatically. |
| Paper | A3 default, A2 selectable. Parametric internally so A1/A4 can be added later. |
| Table rows | 9 mm row height, filling the available area. About 25 rows on A3, more on A2. |
| Logo | Text field in v1. Image binding is a later addition. |
| Prefill | Real, editable values from project data and the last sheet of the same template. |
| Designations | Free text. An optional tag on a symbol moves with the symbol; no numbering. |
| I/O rail | A configurable item, not part of the template. |
| Rail legends | Prefilled, editable text per row. |
| Rail presets | `PLC/DI/AI/DU/AU` and `M-Bus/DUC/DI/AI/DU/AU`. |
| Connection dots | Explicit small filled ellipses; never automatic. |
| Line types | Project-stored media classes with colour, width, dash and arrow. |
| Data summary | Manual cell entry. No derived rows, no CSV requirement. |
| Rich text | Box-level formatting plus optional per-range runs; plain text remains the fallback. |
| Symbols | Phase 5. A generated HTML catalogue is a phase 5 review tool. |

## 5. Architecture

### 5.1 Template sheets are pages

```ts
export const SCHEMA_VERSION = 23;

export type DocumentKind = "pdf" | "tiff" | "template";
export type PaperSize = "A3" | "A2";

export interface SheetTemplateRef {
  id: string;            // "gridscalr.operation-card.frame"
  version: number;       // frozen geometry per version
  paper: PaperSize;
  fields: Record<string, string>;
}

export interface DocumentRef {
  // existing fields
  template?: SheetTemplateRef;
}
```

A template document has `pageCount: 1`, `path: null`, `relativePath: null`,
`sha256: ""` and `sizeBytes: 0`. Page numbers, layer page state, deletion,
duplication and export keep using the existing helpers in `src/model/documents.ts`.

### 5.2 Static template plus overlay fields

The frame, title-block labels and table grid are **static furniture**. They are
generated once per `template + version + paper + locale` and shared by every sheet
that uses that combination. User values are **fields**, rendered as an overlay on
the canvas and painted into the export.

```text
SheetTemplateSpec ──► static PDF bytes ──► PDF.js page ──► canvas
        │                                      │
        │                                      └─ field overlay (HTML/canvas)
        └─ field specs ──► shared layout ──► pdf-lib text in export
```

Why this shape:

- Editing a field never regenerates a PDF, so there is no flicker and no stale cache.
- A3 sheets of the same template share one `PDFDocumentProxy`.
- Fields are always visible regardless of layer visibility or export layer selection.
- The exported PDF contains real, searchable text.
- The app’s PNG export includes fields because they are part of the canvas composition.

Field rendering order in both canvas and PDF export:

1. Source page (static frame).
2. Background images.
3. Sheet fields.
4. Annotation and schematic items.
5. Calibration and measurement labels.
6. Crop, if any.

Fields are not items and do not participate in layer visibility, locking or undo.
They are edited through the template editor, not selected on the canvas.

### 5.3 Coordinate convention

All item points and field rectangles use **PDF.js viewport coordinates at scale 1**:
origin at the top-left, x right, y down, units in PDF points.

- Canvas drawing uses those coordinates directly.
- pdf-lib uses the bottom-left origin, so the PDF renderer converts:
  - rectangle: `pdfY = pageHeight - y - height`
  - text baseline: `pdfY = pageHeight - (y + height / 2 + fontSize * 0.35)`
    for vertically centred text.
- One shared helper (`pdfRect`, `fieldBaselineY`) is used by export and tests.
- A unit test pins the conversion with an asymmetric page so a y-flip cannot slip in.

### 5.4 Resolving document bytes

Three places need bytes for a `DocumentRef`: the main load flow, the reference pane
and export. Introduce one helper:

```ts
resolveDocumentBytes(documentRef, projectPath): Promise<Uint8Array>
```

It handles `pdf`, `tiff` and `template`. A template resolves to the cached static
PDF. This prevents the reference pane or export from opening a file picker for a
template sheet.

### 5.5 Rendering and caching

- `buildStaticSheetPdf(spec, labels)` returns the static PDF.
- `buildSheetPdf(spec, labels, values)` loads the static PDF, draws the fields and
  returns the export bytes.
- The app caches the static `PDFDocumentProxy` by
  `template:${id}:${version}:${paper}:${locale}`.
- The reference pane and split view may share the same proxy.
- Thumbnails and the reference pane show the static frame without field values until
  the composed-page overlay is extended to them. This is documented as a limitation.

## 6. Data model changes

### 6.1 Project additions

```ts
export interface LineType {
  id: string;
  name: string;                       // seeded from the catalog, then user-editable
  color: string;
  widthPt: number;
  style: "solid" | "dashed" | "dashdot";
  arrow: "none" | "end" | "both";
}

export interface Project {
  // existing fields
  lineTypes: LineType[];
}
```

Defaults: supply air (red), extract air (yellow), exhaust air (brown), outdoor air
(blue), heating flow/return (orange), district heating flow/return (magenta),
domestic water, cooling (cyan), control cable (red dashed), bus (grey dashed).
Objects store the resolved colour, width and dash at creation plus `lineTypeId`, so
deleting a line type never breaks an existing drawing.

### 6.2 Item additions

```ts
export type DrawingKind =
  | "pen" | "line" | "arrow" | "rect" | "ellipse" | "highlight"
  | "text" | "image" | "cloud" | "callout" | "stamp" | "delta" | "symbol"
  | "polyline" | "textbox" | "rail";

export interface RailRow {
  id: string;
  label: string;
  legend?: string;
}

export interface MarkupItem {
  // existing fields
  lineTypeId?: string;
  tag?: string;
  tagOffset?: Point;
  textBackground?: "none" | "white";
  padding?: number;
  rows?: RailRow[];
  rowSpacing?: number;
  showBadges?: boolean;
  showLegend?: boolean;
}
```

- `textbox` uses two points as opposite corners and wraps text to the box width.
- `polyline` has two or more points.
- `rail` has two points for the horizontal extent and a row configuration.
- Dots and junctions are ordinary filled ellipses; no new kind.
- Symbol tags are free text with an optional offset; no derived structure.

### 6.3 Normalization and migration

- Bump `SCHEMA_VERSION` to 23.
- Normalize `lineTypes` with defaults when missing.
- Normalize `template` documents and their fields. Unknown template ids or versions
  must not make the project unopenable; render a fallback frame with a visible
  warning instead.
- Normalize the new item kinds with safe defaults.
- Add migration tests for 22 → 23 and a 23 round trip.
- Update `docs/project-file.md`.

## 7. Sheet templates

### 7.1 Template specification

```ts
export interface SheetTemplateSpec {
  id: string;
  version: number;
  paper: { widthMm: number; heightMm: number };
  staticPrimitives: FramePrimitive[];
  fields: SheetFieldSpec[];
  drawingArea: Rect;
}

export interface SheetFieldSpec {
  id: string;
  rect: Rect;                       // viewport coordinates, points
  align: "left" | "center" | "right";
  verticalAlign: "top" | "middle" | "bottom";
  fontSize: number;
  bold?: boolean;
  padding: number;
  maxLines: number;
  shrink: boolean;
}
```

`FramePrimitive` is a small vector language: `rect`, `line` and `text` (with a
rectangle, alignment and font weight). It is deliberately not a general vector
editor.

`staticPrimitives` never contain user data. `fields` contain only geometry and
typography. Values live in `DocumentRef.template.fields`.

### 7.2 Built-in drawing frame

A3/A2 landscape, 10 mm outer margin and 12 mm inner frame. The bottom band is 38 mm
high and contains:

- a revision table on the left: `Bet.`, `Rev. avser`, `Datum`, `Sign`, four data rows
  plus a header row;
- a project-name cell and a logo/text cell in the middle;
- a title block on the right with three label/value rows:
  `title.handledBy | value | title.card | value`,
  `title.date | value | title.system | value`,
  `title.assignment | value | title.page | value`.

The printed labels come from the message catalog, so the Swedish and English
sheets use the same geometry.

Field ids:

```text
project.name, project.logo
title.handledBy, title.card, title.date, title.system, title.assignment, title.page
rev.1.bet, rev.1.rev, rev.1.date, rev.1.sign  …  rev.4.*
```

All fields are optional. Empty fields render as empty cells, never as placeholder
text in the export. Prefill uses real values:

- project name from `Project.name`;
- date, prepared by and assignment number from `ProjectMetadata` when available;
- system/card values from the most recently created sheet of the same template;
- page number from the sheet ordinal.

Changing a project field later does not rewrite existing sheets. A future
“refresh fields from project data” action may be added.

### 7.3 Data-summary template

Same frame and title block. The drawing area is replaced by a table:

- title band `DATASAMMANSTÄLLNING`;
- grouped headers `UTRUSTNING`, `GRÄNSDRAGNING`, `ELDATA`, `VVS-DATA`, `ANMÄRKNING`;
- column headers from the reference layout;
- 9 mm data rows filling the remaining height, single-line cells with shrink-to-fit;
- one field per cell, id `table.r{row}.c{column}`.

Switching paper keeps values by field id. Rows that no longer fit are hidden but
retained, so switching back restores them. Additional rows are added by creating
another data-summary sheet.

### 7.4 Paper sizes

| Paper | Size (mm) | Drawing area height (approx.) | Table rows at 9 mm |
| --- | --- | --- | --- |
| A3 landscape | 420 × 297 | 235 mm | ~23–25 |
| A2 landscape | 594 × 420 | 358 mm | ~36 |

Paper is a property of the sheet. A3 is the default; A2 is selectable in the
template picker and in sheet settings. The title block keeps its physical size and
stays anchored to the bottom-right. Changing paper does not move existing drawing
items; the extra space is added to the drawing area.

## 8. Editing tools

### 8.1 Text box

A new `textbox` item:

- drag a rectangle, type inside, wrap to the width;
- move and resize;
- box-level font size, bold, underline, alignment;
- optional white background, padding and border;
- overflow is rendered and flagged, never silently clipped.

A plain `text` item also gains the optional background and padding. Multiple columns
are created as multiple text boxes.

Rich text is stored as an optional `runs` array with bold, italic, underline, size
and colour per range. `text` remains the plain-text fallback, so older boxes open
unchanged. HTML is never stored in the project file.

### 8.2 I/O rail

A configurable `rail` item:

- horizontal line set with configurable rows, labels and legends;
- optional rounded label badges on the left;
- optional legend line below the rail;
- row labels and legends are editable; legend text is prefilled from the preset;
- presets `PLC/DI/AI/DU/AU` and `M-Bus/DUC/DI/AI/DU/AU`;
- each row’s y and endpoints are snap targets;
- works on template sheets and PDF pages.

Connection dots are separate small filled ellipses. A cable may cross a rail row
without connecting, so dots are never inferred from intersections.

### 8.3 Pipes, ducts and cables

- `polyline` with an ortho constraint by default; Shift allows free angles.
- Snapping to a 5 mm grid, line endpoints and midpoints, symbol ports, rail rows,
  dots and the drawing-area border.
- Line types select colour, width, dash and arrow. The context bar exposes the
  current line type.
- No stored connectivity graph in the first version.

### 8.4 Symbols and tags

- New `schematic` symbol set with stroke-only art, ports, optional tag prefix and a
  fixed stroke width in points.
- Symbols live in `src/features/schematics/symbols/`; the existing facility signs
  stay in `src/model/symbols.ts`.
- A symbol can carry a free-text `tag` with an offset. The tag moves with the symbol.
- The symbol library gains a set filter (“Signs” / “Schematic”) and categories.
- No automatic numbering, no derived equipment list.

## 9. User flows

### 9.1 New project

`File → New` offers two sources:

1. **PDF/TIF** — the existing import flow.
2. **Operation card** — choose a template (drawing frame or data summary), paper
   (A3/A2) and project name.

The template sheet is created immediately with prefilled fields and appended as the
first page. The unsaved-changes prompt is shown before replacing an open project.

### 9.2 Add a sheet

The Pages panel’s add action offers the same sources: PDF/TIF or a template. Template
sheets append at the end, consistent with the existing append-only rule.

### 9.3 Edit fields

- Double-click an empty field to edit it with the existing inline editor.
- Tab/Enter moves between table cells.
- Values are stored per field id.
- The field outline is visible on hover; it is not a selectable canvas item.

### 9.4 Save, open, export and package

- The project file stores the template reference and field values only.
- Static PDF bytes are derived and never persisted.
- Export uses the existing drawing export: copy the static sheet, draw fields, draw
  items, apply crop and labels. Fields are included even when every layer is hidden.
- The exported PDF has searchable field text.
- A package containing only template sheets has no external document files and must
  create, validate and reopen successfully.

## 10. Robustness and edge cases

- A project always has at least one document and one page; a blank operation card is
  created with one sheet.
- New sheets append at the end. Insertion in the middle is not part of this feature.
- Deleting a sheet removes its items and page state, remaps later page numbers and
  never touches a source file.
- Unknown template id/version renders a fallback frame with a warning; it never opens
  a file picker and never crashes the project.
- Hidden or locked layers do not hide sheet fields; fields are part of the sheet.
- A missing line type falls back to the item’s stored colour, width and dash.
- A field value that is too wide shrinks to the minimum size and then ellipsizes;
  the full value remains stored.
- Text-box overflow is visible on the canvas and in the export.
- Paper changes keep field values and drawing coordinates; the drawing area grows.
- Search and OCR are no-ops on template sheets. Search does not index field text or
  items; the exported PDF does contain searchable text.
- The reference pane and split view show the static frame without field values until
  the composed overlay is extended to them.
- Thumbnails show the static frame, consistent with today’s thumbnails not showing
  markups.

## 11. Testing

### Unit tests

- Template geometry: A3/A2 sizes, frame primitives inside the page, unique field ids,
  fields inside their cells.
- Coordinate conversion: top-left rectangles to pdf-lib rectangles and baselines,
  including an asymmetric page.
- Static PDF: one page, correct page size, deterministic output.
- Field text fitting: shrink, ellipsis, alignment.
- Data-summary row count per paper; values survive a paper change.
- Text-box wrapping and overflow.
- Rail rows, presets, legend prefill and snap targets.
- Polyline ortho geometry, bounds and hit testing.
- Line-type resolution and fallback.
- Symbol ports and fixed stroke width.
- Normalization and migration 22 → 23, round trip.
- Project package with only template sheets.
- Export includes fields with all layers hidden.

### End-to-end and visual checks

- A dev sheet lab (`dev/sheet-lab.html`) renders A3/A2, edits fields, switches zoom and
  exports a PDF.
- Canvas regression: draw a polyline with ortho, snap to a rail, place a dot, create
  a text box, edit a field, lock a symbol.
- Smoke test: new operation card → fill fields → draw → save → reopen → export.
- `npm run docs:capture` for the new screens.
- `npm run check:i18n`, `npm run check:docs`, `npm run format:check`, `npm run lint`,
  `npx tsc --noEmit`, `npm test -- --run`, `npm run build`.

## 12. Implementation phases

### Phase 0 — spike (complete)

Proved the foundation before any schema or project-file change:

- parametric A3/A2 frame with the title block and revision table;
- static PDF generation with pdf-lib;
- PDF.js rendering at 1:1 and zoomed;
- field overlay with real editing;
- PDF export with field text;
- coordinate-convention test;
- a standalone dev lab at `dev/sheet-lab.html`.

Outcome:

- `src/features/schematics/model/sheetTemplate.ts` describes the paper, primitives
  and 24 fields.
- `src/features/schematics/render/sheetPdf.ts` builds the static PDF and the filled
  export with the shared text-fitting and coordinate helpers.
- The lab renders A3 at 96 % and A2 at 68 %, edits all fields and downloads a
  1190.6 × 841.9 pt PDF and a matching PNG.
- Unit tests cover paper sizes, field bounds and ids, the top-left to bottom-left
  conversion, baseline placement, text fitting and searchable field text.
- No project schema or application behaviour changed.

Acceptance met:

- A3 and A2 render with the title block in the bottom-right and the revision table in
  the bottom-left.
- Field values can be edited and appear in the exported PDF.
- Zooming does not shift fields relative to the frame.
- A test proves the top-left to bottom-left conversion.

### Phase 1 — blank operation card

- `kind: "template"`, schema 23, normalizer and migration.
- Drawing-frame template, field editing, prefill, A3/A2.
- New project and add-sheet flows.
- Save, open, export and package support.
- Fallback rendering for unknown templates.

Acceptance: create a three-sheet project, fill every title-block field, draw with the
existing tools, save, reopen, export, package and reopen; delete a sheet and verify
the remaining pages; switch paper and back with values preserved.

Outcome:

- Schema 23 adds `kind: "template"` documents with a template id/version, A3/A2 paper
  and a string map of field values. Template fields are capped at 500 characters and
  unknown ids are preserved.
- `File → New project…` and the Pages panel add action share a source dialog for
  PDF/TIF or a template sheet.
- The drawing frame is generated once per template/version/paper/locale and shared
  by every sheet in the project.
- Title-block values can be edited by double-clicking a cell or with **Edit sheet
  fields…** on the page card.
- Fields render above the page and below items, are unaffected by layer visibility
  and are drawn into the exported PDF with searchable text.
- Save, reopen, package and export round trips were verified in the app. Duplicated
  sheets deep-copy their field values.
- Remaining from the acceptance list: an automated three-sheet canvas regression and
  the paper switch A3 → A2 → A3 in the app; both are covered by unit tests and the
  dev lab but not yet by the canvas regression script.

### Phase 2 — text box

- `textbox` item with wrapping, resize, white background, padding and box formatting.
- Overflow warning.
- Canvas and PDF export parity.

Acceptance: a description page with three columns of wrapped text exports identically.

Outcome:

- `kind: "textbox"` stores two opposite corners, wrapped text, font size, bold,
  underline, alignment, text colour, an optional white background and padding.
- Dragging with the Text box tool (`X`) creates the box and opens the inline editor;
  `Enter` inserts a line break, `Ctrl/Cmd+Enter` or clicking outside commits.
- The inline strip edits size, colour, bold, underline and alignment for the box.
  Properties adds a white-background toggle, rotation and a **Edit text…** action.
- Canvas and PDF export use the same word wrapping. Overflow is visible on the canvas
  with a red dashed outline and is never silently clipped in the export.
- Tests cover wrapping, explicit line breaks, long words, project round trips and
  text-box text in the exported PDF.

### Phase 3 — data-summary sheet

- Table template with cell fields, 9 mm rows, Tab/Enter navigation and shrink-to-fit.
- Paper-dependent row count.

Acceptance: a filled data summary survives save, reopen, paper switch and export.

Outcome:

- The second built-in template, `gridscalr.operation-card.data`, keeps the same frame
  and title block and fills the drawing area with a 15-column table.
- Columns use fixed weights so the table fills A3 and A2. Group headers are
  `EQUIPMENT`, `BOUNDARY WORK`, `ELECTRICAL DATA`, `HVAC DATA` and `REMARKS`.
- Data rows use 9 mm height: about 23 on A3 and 36 on A2. Cell ids are
  `table.r{row}.c{column}` and values are retained when the row count changes.
- Table cells can be edited in a scrollable grid in **Edit sheet fields…** or by
  double-clicking the cell on the canvas.
- The sheet field form now changes paper. The renderer replaces the document in
  place, keeps page order, clears the page-size and thumbnail caches and refits the
  view. Paper changes are structural and clear undo.
- Tests cover the template registry, paper-dependent row counts, field bounds, the
  data-summary PDF headers and in-place renderer replacement. The app flow was
  checked with a Playwright round trip from A3 to A2 with a saved cell value.

### Phase 4 — rail and drawing tools

- `rail` item with rows, legends, presets and snap targets.
- `polyline` with ortho constraint.
- Line types and context-bar selection.
- Snapping to grid, ports, rail rows, dots and drawing-area edges.
- Drawing-area overflow warning.
- Connection dots as filled ellipses.

Acceptance: a ventilation schematic with four media types, a five-row rail and
snapped control cables; one undo step per action; exported output matches the canvas.

Outcome:

- Project line types are seeded for supply, extract, exhaust, outdoor, heating flow
  and return, district heating flow and return, domestic water, cooling, control
  cable and bus. The context bar selects them for the Pipe / duct tool.
- `polyline` uses orthogonal segments by default (Shift frees the angle), a 5 mm grid
  and existing item/rail snapping. `Enter` or double-click finishes; `Esc` cancels.
- `rail` is a draggable object with editable rows, labels and legends, two presets,
  optional badges and an optional legend line. Rails contribute endpoints, midpoints
  and segments to snapping.
- Canvas and PDF export share the same rail layout and line styles. Connection dots
  are ordinary filled ellipses placed explicitly.
- Tests cover line-type defaults and persistence, rail geometry and hit testing,
  rail snap candidates, polyline hit testing and style persistence, and polyline and
  rail output in the exported PDF.
- The app flow was checked with a Playwright run: polyline with a media class, a
  dashed control cable, a rail, the rail dialog and a renamed row.

Deferred within Phase 4, cleared in Phase 6:

- The drawing-area overflow warning and the **Fit drawing to area** action are now
  available on template sheets.
- Line types can be renamed, recoloured, reweighted, added and removed. Existing
  runs keep their stored style.
- Rail rows can be reordered with the arrow buttons. The normalizer keeps at most
  16 rows.
- Automatic cable routing, automatic junction dots and I/O extraction remain
  deliberately out of scope.

### Phase 5 — symbols

- `schematic` symbol set with ports, tag prefix and fixed stroke width.
- Symbol library set filter and categories.
- Roughly 40–60 core symbols across instruments, valves, pumps, heat exchangers,
  ventilation, heating, district heating, cooling, water and control.
- Generated HTML symbol catalogue for review (see section 13).

Acceptance: a district-heating substation and a ventilation unit with heat recovery
can be drawn using only the library; tags move with their symbols.

Outcome:

- The first ten ventilation symbols were reviewed in the generated catalogue. The
  full set now contains 111 stroke-only schematic symbols across instruments,
  valves, pumps, heat exchangers, ventilation, heating, district heating, cooling,
  domestic water, control/electrical and general categories. A later review aligned
  the existing artwork with the reference convention pages and added the missing
  sensor, actuator, valve, ventilation, heating, electrical, relay, transformer and
  general symbols.
- Every schematic symbol has a stable id, Swedish and English names, category,
  keywords, tag prefix, ports inside the 64-unit view box and a default size. The
  stroke stays at 1.4 pt at every symbol size on the canvas, in the PDF and in the
  catalogue.
- The symbol library has **Signs** and **Schematic** set filters and still contains
  the unchanged 52 facility signs.
- Symbols carry an optional free-text tag with an offset that follows the symbol.
  No numbering or equipment schedule is derived.
- `npm run symbols:catalog` generates `artifacts/symbol-catalog.html` from the same
  registry as the app, with search, sv/en switching, actual-size previews, a port
  toggle, A3 print styles and review feedback.
- Deferred: custom or imported symbols, automatic tag numbering, equipment
  schedules and I/O extraction.

### Phase 6 — rich text and refinements

- Formatting per selected range (bold, size, colour).
- More symbols and custom templates.
- A1 paper, fit-to-area, refresh fields from project data.

Outcome:

- Text boxes accept an optional `runs` array with bold, italic, underline, size and
  colour. The inline editor applies those styles to the selected range; older boxes
  without runs still open and edit as one plain run.
- Canvas and PDF export share the same per-run wrapping, alignment, underline and
  colour layout. The PDF embeds regular, bold, italic and bold-italic fonts.
- The line-type editor renames, recolours, reweights, adds and removes project media
  classes. Existing polylines keep their stored colour, width and dash.
- Rail rows can be moved up and down in the rail dialog.
- Template sheets warn when visible objects extend past the drawing area. The
  **Fit drawing to area** action scales and centres unlocked, visible items in one
  undoable change.
- Deferred: custom sheet templates, A1 paper and refreshing sheet fields from
  project data after the sheet is created.

## 13. Symbol catalogue

A generated, standalone HTML catalogue is a phase 5 review tool, not a shipped app
screen.

- Command: `npm run symbols:catalog`.
- Source: the same `SymbolDefinition` data and SVG renderer as the app.
- Output: `artifacts/symbol-catalog.html`, self-contained with inline CSS, SVG and
  filter JavaScript.
- Contents: large preview, actual-size preview, Swedish and English names, stable id,
  category, tag prefix, keywords, ports toggle and review status.
- Grouping: Instrument, Valves, Pumps, Heat exchangers, Ventilation, Heating, District
  heating, Cooling, Domestic water, Control and electrical, General, Signs.
- Review aids: per-symbol anchors, a “copy feedback” button and an optional local
  notes export.
- Print stylesheet for A3 landscape with one category per section.
- The catalogue is generated from the symbol registry so it cannot drift from the app.

The generator can be built before phase 5 with the existing 52 facility signs, so the
pipeline is proven when the schematic set starts.

## 14. Documentation and release

- New ADR: “Sheet templates as shared static PDFs with overlay fields”.
- Update `docs/project-file.md` with schema 23.
- Update `docs/user-guide.md`, `docs/workflows.md`, `docs/shortcuts.md`,
  `docs/limitations.md`, `README.md` and `docs/roadmap.md`.
- Add screenshots through `npm run docs:capture`.
- Add English and Swedish catalog keys for templates, fields, tools and symbols.
- Keep the roadmap status unchanged until each phase is complete.
- No version bump or release tag without explicit approval.

## 15. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Template/field drift between canvas and export | One shared layout function and coordinate tests. |
| Symbol scope grows without bounds | Core set, categories, generated catalogue, later custom symbols. |
| Customer-specific frames are requested early | Generic built-in templates; PDF frame import as a later escape hatch. |
| Field text overflows its cell | Shrink-to-fit, ellipsis, stored full value and tests. |
| Paper change moves content unexpectedly | Extra space is added to the drawing area; items keep coordinates. |
| Package and migration edge cases | Explicit tests for template-only packages and schema 22 → 23. |
| Performance with many fields and items | Shared static PDFs, cached proxies, one page render at a time. |
| Legal/branding confusion | Original generic frames, no customer logos, no standards claim. |

## 16. Naming glossary

| Term | Meaning |
| --- | --- |
| Operation card | The document this workflow produces. |
| Schematic sheet | A page created from a sheet template. |
| Sheet template | The frame, title block and optional table grid. |
| Field | An editable text cell in a template. |
| Rail | A configurable horizontal set of I/O bus lines with labels and legends. |
| Port | A connection anchor on a symbol. |
| Tag | Free-text designation shown next to a symbol. |
| Line type | A media class with colour, width, dash and arrow. |
| Sheet ordinal | The 1-based position of a template sheet, used only to prefill the page field. |

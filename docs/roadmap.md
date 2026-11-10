# Roadmap

GridScalr is pre-1.0. This page records the current status, the foundation
workstreams, the release quality gate and the backlog. It is not a schedule.
Detailed planning documents live in `docs/plan/`; the historical
implementation plans are in [`docs/plan/archive/`](plan/archive/README.md).

Current version: **0.22.4** · Project-file schema: **23**

1.0 is a **quality gate**, not a target date. Work is organised by foundation
workstreams so the product can release many versions while the base becomes
stable. Feature details belong in GitHub issues, not in a version-numbered
roadmap.

## Product principles

These are not negotiable without an explicit decision:

- Local-first. A source PDF or TIF is referenced by path and SHA-256 and is never
  overwritten.
- Hidden items never render, hit-test or export. Hidden layers behave the same way.
- Locked items stay visible and exportable but cannot be edited, moved or deleted.
  Layer visibility and locking take precedence over per-item flags.
- Measurement and drawing layers stay separate; a layer is `measure` or `draw`.
- One bulk action is one undo step.
- Project files stay backward compatible. Every schema change ships migration
  tests for the current and previous version.
- Derived quantities and summaries are calculated from item data, never stored as
  a separate source of truth.
- Exports use the same visibility and locking rules as the canvas.
- No accounts, cloud sync, collaboration, telemetry or network dependencies.
- Every project save is a conditional write. A changed disk file is never
  overwritten without an explicit choice. Accepted direction; implementation
  pending.
- Pages have stable IDs from schema 24 onward. Imports append by default, but
  insert, reorder and source replacement are explicit, tested operations.
- Source storage is explicit: reference, managed copy or package (schema 25).

`AGENTS.md` carries the same rules for contributors, with more detail.

## Shipped

| Milestone | Scope | Status | Schema |
| --- | --- | --- | --- |
| 1 | Layers, target layer, selection, per-item visibility and locks, bulk edits, clipboard, context menus | Complete | v2 |
| 2A | Categories, rooms, count tool, deduction areas, quantities panel, measurement bulk edits | Complete | v3 |
| 2B | Waste, rounding, order quantities, quantity CSV and print PDF | Complete | v3 |
| 3A | Quick areas, manual scale, per-page scale locks, markup snapping | Complete | v4 |
| 3B | Drawing export dialog with page ranges, crop, layer selection, labels, calibration and legend | Complete | v4 |
| 4 | Embedded PNG/JPEG images, background and annotation modes, image handles, opacity, rotation, image-aware PDF export | Complete | v5 |
| 5 | TIF import as lossless CCITT G3/G4 pages, multiple documents per project, append-only page numbering | Complete | v6 |
| 0.6 | Built-in vector facility symbols, inspection statuses, Markups symbol and status views | Complete | v13 |
| 0.7 | Docked Markups list with saved views, grouping and filters; stamp and symbol corner resizing; context-aware focus zoom; new app icon | Complete | v14 |
| 0.7.3 | Synchronized read-only split view and XLSX quantity workbook; schema 16 docs sync | Complete | v16 |
| 0.8.0 | Session-only revision comparison with overlay and side-by-side views, markup diff and comparison PDF | Complete | v16 |
| 0.9.0 | Local PDF text-layer search with highlighted hits | Complete | v16 |
| 0.10.0 | Bundled English/Swedish OCR for scanned pages, stored as a rebuildable schema 17 index | Complete | v17 |
| 0.11.0 | Radius, diameter and three-point arc measurements with labels, quantities and PDF export | Complete | v18 |
| 0.12.0 | Angle, slope and volume measurements with their own quantity units and depth input | Complete | v19 |
| 0.13.0 | Reference pane with same-page, revision and raw PDF drawing sources; curve, angle and slope labels placed outside their geometry | Complete | v19 |
| 0.13.1 | Slope preview matches the saved label, volume depth dialog and volume label locking, level reference panes and a collapsible comparison panel | Complete | v19 |
| 0.13.2 | Shared Circle & arc and Angle & slope tool families, a distinct symbol icon, and signal-red default measurement layers with local layer colour defaults | Complete | v19 |
| 0.13.3 | Release hardening: Save/Discard/Cancel, safe dialog focus, automated checksums, context-bar family switching and reference menu state | Complete | v19 |
| 0.14.0 | Internal refactors: reference/comparison controller, canvas draft renderer, shared flyout mount, ESLint in CI, direct UI tests and ADR 0001 | Complete | v19 |
| 0.14.1 | Lazy-loaded OCR, PDF exports, XLSX and TIF import; production source maps removed | Complete | v19 |
| 0.15.0 | Custom count types, pieces per count object, schema 20 and the first feature module | Complete | v20 |
| 0.16.0 | Count schedule: quantity rows per count type, Markups count-type column/filter/grouping, count legend glyphs and reusable presets | Complete | v21 |
| 0.16.1 | Two-finger touch pan and pinch zoom on both canvases, pen/palm priority and long-press context menu | Complete | v21 |
| 0.17.0 | Portable `.gridscalr.zip` packages, Windows/macOS/Linux builds, safer saving, preferences, diagnostics, demo onboarding, i18n foundation | Complete | v21 |
| 0.18.0 | Swedish/English UI and reports, locale formatting, project metadata and report branding | Complete | v22 |
| Schematic sheets | Template pages, title-block fields, rich text boxes, rails, schematic drawing tools, 156 schematic symbols and a fit-to-area action | Complete | v23 |
| 0.19.0 | Reviewed operation-card symbols: 119 schematic symbols, distinguishable check valves, switches and page-scoped move-to-layer | Complete | v23 |
| 0.19.3 | Blank A3/A2 pages and 37 additional schematic symbols; valve-stem and circulation-pump fixes; symbol libraries split by category | Complete | v23 |
| 0.20.0 | Large-project performance, code health, testing gates, shell polish and independent reference page navigation | Complete | v23 |
| 0.21.0 | PDF export, editor and App-flow splits; light, grey and navy themes with System mode | Complete | v23 |
| 0.22.0 | Medium Gray default theme, Dark Gray/Dark Jade rename, expandable tool rail, Project settings categories and colour hardening | Complete | v23 |
| 0.22.4 | Windows touchpad pinch-to-zoom | Complete | v23 |
| Import pages | Import pages from another project with thumbnails, partial imports, page-scoped layers and one-step undo | Complete | v23 |

Schema history and migration rules are documented in
[`project-file.md`](project-file.md).

## Foundation workstreams

These are the current priorities. They are capabilities, not release numbers.
Each should have an issue before implementation; larger ones have a plan or ADR.

### 1. Save integrity and recovery

**Goal:** no silent overwrite, no lost recovery snapshot, and a clear path back.

- Conditional project writes against the loaded file hash.
- **Save as conflicted copy** as the default conflict action.
- Rolling backups in app data and an explicit **Backup now…** flow.
- Autosave per project and base file version.
- Advisory lock lease with **Open read-only** as the default.
- Read-back verification and a failed-save relative-path fix.

Plan: [`plan/robustness.md`](plan/robustness.md) · ADR
[0010](adr/0010-project-file-integrity.md) · Issues
[#44](https://github.com/MajorJohnDoe/gridscalr/issues/44),
[#53](https://github.com/MajorJohnDoe/gridscalr/issues/53).

### 2. Page and document model

**Goal:** pages can be inserted, reordered, deleted and replaced without breaking
markup references; an empty project is a valid starting point.

- Stable `PageId` and an ordered `PageRecord[]`.
- Empty projects with zero pages.
- Insert, drag-and-drop reorder, duplicate and delete by ID.
- **Replace source…** with page mapping and superseded pages.
- Import preserves one layer per source layer identity across pages.
- Revision comparison matches pages by ID.

Plan: [`plan/robustness.md`](plan/robustness.md) · ADR
[0011](adr/0011-page-list-and-source-replacement.md) · PR
[#152](https://github.com/MajorJohnDoe/gridscalr/pull/152).

### 3. Source storage and relinking

**Goal:** a shared or cloud-hosted drawing cannot change the working geometry
without the user knowing.

- Reference, managed-copy and package modes.
- **Copy drawing into project** for cloud and network sources.
- **Consolidate drawings…**, **Use managed copy** and **Detach from source**.
- Source-changed banner with reload, relink and copy actions.
- Automatic relinking by checksum.

Plan: [`plan/robustness.md`](plan/robustness.md) · ADR
[0012](adr/0012-source-storage-modes.md) · ADR
[0002](adr/0002-project-package.md).

### 4. Import and merge

**Goal:** bringing pages in from another project is predictable and traceable.

- Preflight report with pages, items, references and missing files.
- Provenance for imported pages and source documents.
- One destination layer per source layer identity, not per page.
- Explicit merge choices when importing the same project again.
- One import remains one undo step.

PR [#152](https://github.com/MajorJohnDoe/gridscalr/pull/152) is merged. The
remaining work is provenance, preflight and layer identity.

### 5. Integrity validation and project doctor

**Goal:** a damaged or imported file opens with a report and a choice, never with
silent data loss.

- Shared project validator with referential-integrity rules.
- Pre-save validation and post-save round-trip.
- Load report for invalid or dropped data.
- Project doctor with repair, read-only open and diagnostics.
- Duplicate-ID and out-of-range page repair.

Plan: [`plan/robustness.md`](plan/robustness.md).

### 6. Interoperability

**Goal:** a recipient can review the result in the PDF ecosystem without making
the PDF the source of truth.

- Optional PDF optional-content-group (OCG) export.
- Optional standard PDF annotation export.
- Package/share flow that includes drawings once.
- **Compare with disk version** at a save conflict.

This work is additive and follows the integrity work.

### 7. Performance and test gates

**Goal:** the foundation stays fast and the invariants stay enforced.

- Large-project budgets from [`limitations.md`](limitations.md).
- Stateful and property-based tests for page, import and save flows.
- Conflict, crash and migration-corpus tests.
- Coverage, fuzzing and visual gates in CI.

Related: [#52](https://github.com/MajorJohnDoe/gridscalr/issues/52),
[#61](https://github.com/MajorJohnDoe/gridscalr/issues/61).

## 1.0 release gate

1.0 is reached when the foundation is stable and these criteria are met. There is
no date and no version-numbered path. The umbrella tracking issue is
[#59](https://github.com/MajorJohnDoe/gridscalr/issues/59).

1. Windows, macOS and Linux artifacts are built, checksummed and installable.
2. English and Swedish UI, reports and export formats are complete.
3. A project can be packaged, sent and opened by another person.
4. Large projects meet the documented performance budgets.
5. Saving, recovery, diagnostics and project metadata are production-ready.
6. Concurrent editing and source-storage behaviour are documented and tested.
7. Packaged desktop smoke tests pass on all platforms.
8. The schema and migration promise are frozen and documented.
9. No P0/P1 bugs, no unaccepted dependency alerts, and the release checklist is
   complete.
10. The Tauri capability, CSP and path-handling review is complete.
11. Coverage, fuzzing and visual regression gates are part of CI.

Related: [#53](https://github.com/MajorJohnDoe/gridscalr/issues/53),
[#54](https://github.com/MajorJohnDoe/gridscalr/issues/54),
[#55](https://github.com/MajorJohnDoe/gridscalr/issues/55),
[#62](https://github.com/MajorJohnDoe/gridscalr/issues/62).

## Backlog and candidates

These are candidates, not promises. Create an issue before implementation; keep
the problem, scope, non-goals and acceptance criteria in the issue.

- Code signing and macOS notarization — [#56](https://github.com/MajorJohnDoe/gridscalr/issues/56).
- Full Swedish user guide, workflows and additional languages —
  [#57](https://github.com/MajorJohnDoe/gridscalr/issues/57).
- Broader TIF decoding for LZW/Deflate, greyscale, colour and JPEG-in-TIFF scans —
  [#58](https://github.com/MajorJohnDoe/gridscalr/issues/58).
- Project templates for recurring properties and portfolios.
- Facility symbol quantities in the procurement report.
- Snap directly to PDF vector geometry as a separate spike.
- Semantic PDF vector comparison as a separate spike.
- Additional OCR languages with matching traineddata and license review.
- Wall and ceiling areas from length × height, and elevation-aware slopes.
- Custom measurement fields for richer door, window and equipment schedules.
- Statutory area classification (BTA/BRA/NTA/LOA) only with an explicit decision
  and a separate validation model.
- Read-only package review mode for contractors without edit access.
- Automatic update check only with an explicit local-first decision.
- Custom symbol uploads and custom count artwork.

## Deferred by design

These are known gaps, not bugs. See [`limitations.md`](limitations.md) for the
full list.

- No cloud sync, accounts, collaboration or automatic updates.
- Pages append by default and cannot be inserted or reordered until the explicit
  page list ships in Phase 3. Deleting a page is an explicit structural action.
- Markups are stored in the project, not as PDF annotations or optional-content
  groups. The drawing PDF export flattens visible markups into page content.
- Images are embedded in the project file. External image assets are only worth
  adding if project size becomes a practical problem.
- Ordinary PDFs are referenced or managed-copied, not base64-embedded in the
  project JSON. Packages carry them for transport.
- Quantity reports are CSV, XLSX and PDF. The Excel workbook is derived on demand
  and never replaces the item data.
- The symbol library is built in; custom symbol uploads and symbol quantities in
  the procurement report are not supported.
- Count types are limited to door, window, radiator, fixture and other.
- Count schedules for doors, windows and fixtures have no width, height or fire
  rating fields.
- Rectangle and ellipse quick areas cannot be rotated.
- Text notes do not wrap in a fixed box; `Shift+Enter` inserts a line break.
- The full user guide and workflows are English-only. The Swedish UI includes a
  Swedish quick start and an explicit English fallback.

## Open decisions

| Decision | Current position |
| --- | --- |
| Concurrent project edits | Accepted direction in [ADR 0010](adr/0010-project-file-integrity.md). Implementation not started; current behaviour is last save wins. |
| Page order | Accepted direction in [ADR 0011](adr/0011-page-list-and-source-replacement.md). Append-only remains until schema 24 ships. |
| Source storage | Accepted direction in [ADR 0012](adr/0012-source-storage-modes.md). Reference mode is current; managed copies are planned. |
| Windows code signing | Deferred. Unsigned installers, checksums and SmartScreen instructions. Revisit in [#56](https://github.com/MajorJohnDoe/gridscalr/issues/56). |
| macOS signing and notarization | Deferred. Document the Gatekeeper path. Revisit in [#56](https://github.com/MajorJohnDoe/gridscalr/issues/56). |
| Windows and Linux ARM64 | Deferred until there is demand. |
| Full Swedish help | UI is complete; the full guide/workflows translation is not scheduled. |
| External image assets | Deferred until embedded project files become too large in practice. |
| TIF codecs beyond CCITT G3/G4 | Deferred; would need a decoding fallback. Tracked in [#58](https://github.com/MajorJohnDoe/gridscalr/issues/58). |
| Revision comparison scope | Shipped with visual overlay, side-by-side and a markup diff. Semantic PDF vector diff is a separate spike. |
| OCR engine | Bundled Tesseract.js with English and Swedish models. Additional languages require new traineddata assets and license review. |
| PDF vector geometry snapping | A candidate spike, not scheduled. |
| Count schedule attributes | Not scheduled; no width, height or fire rating. |
| Statutory area classifications | Not implemented. BTA/BRA/NTA/LOA are not calculated; categories and rooms are user-defined. |
| Theme | Medium Gray is the default; Light, Dark Gray, Dark Jade and Navy are optional, with System following the OS preference. |
| Project package format | Standard `.gridscalr.zip` with manifest and relative paths. See [ADR 0002](adr/0002-project-package.md). |
| 1.0 | A quality gate, not a schedule. See the release gate above. |

## Technical debt and post-release refactors

These are internal improvements, not user-facing promises. Record concrete
items as GitHub issues with the `tech-debt` or `refactor` label rather than
anonymous `TODO` comments in code; see **Issue tracking** in `AGENTS.md`.

The next planned splits are sequenced in
[`plan/post-0.20-refactor.md`](plan/post-0.20-refactor.md).

- Split the PDF exporter by item family — [#126](https://github.com/MajorJohnDoe/gridscalr/issues/126).
- Split inline editors by editing family — [#127](https://github.com/MajorJohnDoe/gridscalr/issues/127).
- Extract the remaining `App.ts` flows — [#128](https://github.com/MajorJohnDoe/gridscalr/issues/128).
- Lazy-load the PDF.js renderer so the welcome screen and project shell do not parse the PDF runtime before a drawing is opened.
- Replace full-snapshot history for large projects.
- Audit Tauri capabilities, CSP and dependency surface — [#62](https://github.com/MajorJohnDoe/gridscalr/issues/62).
- Revisit the GTK/glib generation with a future Tauri upgrade so the Linux advisory can be cleared; tracked in [#21](https://github.com/MajorJohnDoe/gridscalr/issues/21).
- Further splits of `CanvasView.ts`, `labelLayout.ts`, `sheetTemplate.ts` or the symbol libraries are opportunistic only if those files grow again.

## Project operations

- The repository is public and MIT licensed. Releases are cut manually from tested
  artifacts; see [`releasing.md`](releasing.md).
- The release workflow builds Windows, macOS and Linux from one tag; see [`releasing.md`](releasing.md).
- CI runs lint, frontend tests, build, UI smoke tests and canvas regressions on
  Ubuntu, plus `cargo fmt`, `cargo check` and the Rust unit tests.
- The bilingual landing page and feature tour are generated from `site/` and
  deployed to GitHub Pages by `.github/workflows/pages.yml`. English pages are at
  `/` and `/features/`; Swedish pages at `/sv/` and `/sv/funktioner/`.
- `site/release.json` is the single source for the displayed release version,
  date, notes URL and download asset links. It is updated for every tagged release.
- `main` is protected and requires both CI jobs. Dependabot proposes weekly
  dependency updates.

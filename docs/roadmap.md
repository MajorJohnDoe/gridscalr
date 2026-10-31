# Roadmap

GridScalr is pre-1.0. This page is the current status: what is shipped, what is
deliberately deferred, and which decisions are still open. Detailed planning
documents from the implementation period live in
[`docs/plan/archive/`](plan/archive/README.md); they are historical and written in
Swedish.

Current version: **0.16.1** · Project-file schema: **21**

## Product principles

These are not negotiable without an explicit decision, and they apply to every
milestone:

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

`AGENTS.md` carries the same rules for contributors, with more detail.

## Milestones

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

Schema history and migration rules are documented in
[`project-file.md`](project-file.md).

## Next

There is no committed feature milestone after 0.16.0. The candidates below are ordered by
expected value, not scheduled:

1. **Independent page navigation in the reference pane** ([#23](https://github.com/MajorJohnDoe/gridscalr/issues/23)), so the primary and reference views can inspect different sheets.
2. **A TIF fallback decoder** for LZW/Deflate, greyscale, colour and JPEG-in-TIFF scans, if users need them often enough to justify the dependency.
3. **Snap directly to PDF vector geometry** as a separate spike. It needs extraction and indexing of drawing paths.
4. **Semantic PDF vector comparison** as a separate spike. It needs extraction and indexing of PDF operators and must not block other work.
5. **Additional OCR languages** if users need them, with the matching traineddata bundle and license review.
6. **macOS and Linux release builds** next to the Windows installers.

## Deferred by design

These are known gaps, not bugs. See [`limitations.md`](limitations.md) for the
full list.

- No cloud sync, accounts, collaboration or automatic updates.
- Pages are append-only. Deleting a page is an explicit structural action; pages
  cannot be inserted or reordered.
- Markups are stored in the project, not as PDF annotations or optional-content
  groups. The drawing PDF export flattens visible markups into page content.
- Images are embedded in the project file. External image assets are only worth
  adding if project size becomes a practical problem.
- Quantity reports are CSV, XLSX and PDF. The Excel workbook is derived on demand
  and never replaces the item data.
- The symbol library is built in; custom symbol uploads and symbol quantities in
  the procurement report are not supported.
- Count types are limited to door, window, radiator, fixture and other.
- Rectangle and ellipse quick areas cannot be rotated.
- Text notes do not wrap in a fixed box; `Shift+Enter` inserts a line break.

## Open decisions

| Decision | Current position |
| --- | --- |
| Windows code signing | Not purchased. Installers are unsigned; the README explains how to verify SHA-256 checksums. |
| External image assets | Deferred until embedded project files become too large in practice. |
| TIF codecs beyond CCITT G3/G4 | Deferred until there is demand; would need a decoding fallback. |
| Revision comparison scope | Shipped with visual overlay, side-by-side and a markup diff. Semantic PDF vector diff is a separate spike. |
| OCR engine | Bundled Tesseract.js with English and Swedish models. Additional languages require new traineddata assets and license review. |
| PDF vector geometry snapping | A candidate spike, not scheduled. |
| macOS and Linux release pipelines | Buildable from source; no automated artifacts yet. |

## Technical debt and post-release refactors

These are internal improvements, not user-facing promises. Concrete items should
become GitHub issues with the `tech-debt` or `refactor` label rather than
anonymous `TODO` comments in code.

- Split `CanvasView.ts` further into label rendering, annotation drawing and pointer interaction modules.
- Extract project save/open flows from `App.ts` into focused `src/app/` modules.
- Split `selectionInspector.ts` and `settingsDialog.ts` into section modules as they grow.
- Lazy-load the PDF.js renderer so the welcome screen and project shell do not parse the PDF runtime before a drawing is opened.
- Revisit the GTK/glib generation with a future Tauri upgrade so the Linux advisory can be cleared; tracked in [#21](https://github.com/MajorJohnDoe/gridscalr/issues/21).

## Project operations

- The repository is public and MIT licensed. Releases are cut manually from the
  Windows workflow; see [`releasing.md`](releasing.md).
- CI runs lint, frontend tests, build, UI smoke tests and canvas regressions on
  Ubuntu, plus `cargo fmt` and `cargo check`.
- `main` is protected and requires both CI jobs. Dependabot proposes weekly
  dependency updates.

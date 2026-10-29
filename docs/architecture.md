# Architecture

GridScalr is a Tauri 2 desktop shell around a TypeScript frontend. The frontend
owns the project model, rendering and interaction; Rust performs atomic file
writes and path checks. There is no server, database or background service.


```text
src/
  app/App.ts             application wiring, file flows, shortcuts
  app/exportFlows.ts     CSV, XLSX, PDF, PNG and JSON export orchestration
  compare/referenceSession.ts session-only reference project, renderer and source paths
  compare/revisionDiff.ts pure item matching and added/removed/changed classification
  canvas/CanvasView.ts   canvas rendering, hit testing, inline editing, resize/rotate, PNG compositing
  canvas/viewport.ts     pure page/screen transforms, fit, zoom and split-view synchronization
  canvas/geometry.ts     crop, handle, rotation and colour helpers
  canvas/selectionHandles.ts selection and rotation handles
  canvas/annotationDraw.ts callout, stamp, cloud-label and endpoint drawing
  canvas/crop.ts         export crop mode, overlay and toolbar
  canvas/editors.ts      inline text and measurement-label editors
  model/                 project types, geometry, quick-area shapes, snap, text layout, labels, units, calibration, layers, metrics, quantities, selection, clipboard, revision-cloud geometry, annotation layouts, stamp presets
  model/commands.ts      shared item visibility, locking, deletion, movement and style commands
  model/markups.ts       saved Markups views, columns, filters and grouping rules
  model/symbols.ts       classic sign artwork, categories and inspection statuses
  model/symbolPaths.ts   shared SVG path parsing and transforms for symbol artwork
  state/store.ts         immutable project snapshots, undo/redo, multi-selection UI state, autosave
  state/autosave.ts      IndexedDB recovery store with legacy localStorage fallback
  pdf/pdfRenderer.ts     PDF.js document lifecycle and progressive crop rendering
  pdf/thumbnails.ts      lazily rendered, cached page previews for the Pages panel
  pdf/pdfExport.ts       flattened vector PDF export with embedded text fonts
  pdf/reportPdf.ts       print-friendly A4 quantity report built with pdf-lib
  pdf/comparePdf.ts      side-by-side revision comparison PDF with visuals and diff tables
  report/reportModel.ts  pure quantity report model shared by CSV, XLSX and PDF
  report/rows.ts         shared quantity and markup table rows
  report/csv.ts          quantity CSV serialization with BOM and metadata
  report/xlsx.ts         six-sheet XLSX workbook built with fflate
  report/markupCsv.ts    visible markup CSV serialization
  ui/                    top menu, sidebar, page/layer lists, Markups panel, context bar, inspector, dialogs, status bar
  styles/help.css        help dialog, search, TOC and image lightbox
  styles/popovers.css    tool flyouts, Canvas options and measurement options
  ui/contextBar.ts       tool-specific context bar and target layer controls
  ui/inspector.ts        Properties header, active-layer and selection sections
  ui/markupsPanel.ts     docked Markups table, columns, views, grouping and filters
  ui/symbolLibrary.ts    searchable symbol library and recent symbols
  ui/duplicatePageDialog.ts page name, scale and markup duplication options
  ui/measureOptions.ts   category, room, count type and area options popover
  ui/selectionInspector.ts single and multi-selection Properties
  ui/selectionMenu.ts    shared item context menu for canvas, layers and Markups
  ui/itemIcon.ts         icon lookup shared by Layers and Markups
  ui/shortcuts.json      single source for tool and application shortcuts
  ui/shortcuts.ts        typed shortcut maps and platform formatting
  ui/statusBar.ts        page scale menu, cursor position and layer status
  ui/splitView.ts        synchronized read-only reference pane, comparison mode and divider
  ui/comparePanel.ts     revision summary, filters, difference list and comparison controls
  ui/welcome.ts          empty-project welcome screen and recent files
  ui/pageImportDialog.ts page picker with previews for PDF/TIF import
  ui/topMenu.ts          File/Edit/View/Settings/Help menu model and keyboard navigation
  ui/helpDialog.ts       bundled Markdown help, search, table of contents and image lightbox
  ui/settingsDialog.ts   project-wide units, snapping, quantity defaults
  model/cloud.ts         revision-cloud bezier geometry
  model/annotations.ts   callout, stamp, delta, and cloud-label layout
  model/stamps.ts        stamp preset normalization and defaults
  io/stampDefaults.ts    global stamp presets for new projects
  help/markdown.ts       safe Markdown renderer for bundled help
  help/content.ts        Vite raw imports of the user guide, workflows and shortcuts
  help/images.ts         Vite asset URLs for bundled help screenshots
  io/projectFile.ts      project schema normalization, serialization, relative paths, source-path protection
  io/platform.ts         Tauri/browser file I/O, dialogs, recents, SHA-256 entry point
  io/writeGuard.ts       conservative source-path matching for every save and export
  io/sha256.ts           dependency-free SHA-256 fallback
src-tauri/
  src/commands.rs        atomic text/binary writes, reads, and path checks
  src/lib.rs             Tauri command registration
  capabilities/          desktop permissions
docs/user-guide.md       in-app user guide and workflow reference
docs/workflows.md        role-based guides for operations and property management
docs/shortcuts.md        in-app keyboard reference
docs/screenshots/        versioned screenshots and capture manifest
tests/                   geometry, quick areas, snap, text layout, calibration, layers, quantities, selection/clipboard, hit-testing, project files, PDF export, page thumbnails, SHA-256, Markdown, help images, demo project, canvas geometry and autosave
scripts/plan-geometry.mjs shared geometry for the industrial sample set
scripts/make-industrial-fixture.mjs reproducible three-sheet industrial PDF generator
scripts/make-fixture.mjs legacy A4 sample generator
scripts/make-demo-project.mjs deterministic documentation project
scripts/ui-harness.mjs shared Playwright server and demo-project helpers
scripts/smoke-ui.mjs Playwright smoke test for open, measure, help and save
scripts/canvas-regression.mjs pointer-level canvas gesture regressions
scripts/benchmark-history.mjs synthetic undo/history benchmark with 2,000+ items
scripts/capture-docs.mjs Playwright screenshot capture for the documentation
scripts/check-docs.mjs link, image, anchor and schema checks
scripts/docs-fingerprint.mjs UI fingerprint for screenshot staleness checks
```

Key design choices:

- **Local first.** PDF bytes are read only when needed. Project data autosaves to a local IndexedDB recovery store; no data leaves the machine. A localStorage fallback is used only when the browser disables IndexedDB.
- **Markup layers are app-level.** They are not PDF optional-content groups, and GridScalr never rewrites the source PDF when saving a project. The drawing PDF export writes a new file and leaves the original untouched.
- **Coordinate stability.** Markup points are stored in PDF points, not screen pixels. Zooming, panning, and window resizing do not change measurements; export maps them through PDF.js viewports so page rotation and crop boxes are respected.
- **Progressive rendering.** Only the visible crop of a page is rendered at device resolution. A new render cancels the previous incomplete one.
- **On-demand page thumbnails.** The Pages panel rasterises only the cards near the viewport, one page at a time, at a capped pixel size, and caches the result. Thumbnail work yields while the main canvas renders, so page previews never block drawing.
- **Snapshot history.** Store mutations clone the project before applying changes, giving undo/redo without mutable shared state.
- **One scene, two viewports.** The primary canvas follows the store's viewport. The split reference pane reuses the same renderer and scene with a read-only canvas and a viewport centred on the primary pane, so pan, zoom and page changes stay synchronized without a second editing path.
- **Derived exports share one row model.** Quantity and markup tables are built once in `src/report/rows.ts` and serialized to CSV and XLSX from the same cells. The workbook never stores a second copy of the takeoff.
- **Comparison is session-only.** A reference project opens in its own renderer and its own read-only canvas scene. Matching uses item ids first, then geometry, then the nearest same-kind item inside a move tolerance. The current store, undo history and source drawings are never replaced by the reference.
- **Native I/O, portable format.** Rust commands perform atomic writes; the project file records both an absolute and relative PDF path plus a SHA-256 checksum.
- **Tauri prototype freezing stays off.** `@pdf-lib/fontkit` assigns to a prototype property inherited from `Object.prototype`; Tauri's `freezePrototype` makes that assignment throw and prevents the window from starting. GridScalr does not execute untrusted JavaScript, so this hardening is left disabled.

## Testing and fixtures

- `npm test` runs the Vitest suite for the model, project files, hit testing, TIFF parsing, PDF/XLSX export, revision matching, viewport math, Markdown, help images, the demo project, canvas geometry and autosave.
- `npm run test:ui` and `npm run test:canvas` drive the browser fallback with Playwright.
- `npm run bench:history` builds a synthetic project for undo/history timing (`GRIDSCALR_BENCH_ITEMS=5000` for a larger one).
- `fixtures/industrial-plan.pdf` is generated by `npm run fixture`; `fixtures/demo-project.gridscalr` by `npm run docs:demo`.
- `fixtures/tiff/` holds the small G4 and LZW scan fixtures used by the TIFF reader tests.
- `npm run docs:capture` regenerates the screenshots from the demo project, and `npm run check:docs` validates links, anchors, images, tool coverage, the schema reference and screenshot freshness.

## Browser fallback

Running `npm run dev` without Tauri is useful for layout and interaction work,
but it cannot use native file paths. In that mode opening and saving use the
hidden file input and browser downloads, recent files are desktop-only, and
reopening a project asks for the PDF again because browsers do not expose
persistent local paths. Checksum verification still works.


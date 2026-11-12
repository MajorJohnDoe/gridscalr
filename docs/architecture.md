# Architecture

GridScalr is a Tauri 2 desktop shell around a TypeScript frontend. The frontend
owns the project model, rendering and interaction; Rust performs atomic file
writes, canonical path checks and streaming project-package creation and
extraction. There is no server, database or background service.


```text
src/
  app/App.ts             application wiring, file flows, shortcuts
  app/referenceController.ts reference pane, comparison session and comparison PDF lifecycle
  app/exportFlows.ts     CSV, XLSX, PDF, PNG and JSON export orchestration
  app/selectionActions.ts selection, bulk edits and item commands
  app/documentImport.ts  PDF/TIF import, password retries and checksum checks
  app/searchController.ts search panel, text index and OCR run loop
  app/openTarget.ts      re-export of the shared dropped and opened file classification
  app/droppedDrawingFlows.ts PDF/TIF Pages-panel drop through the project-import selection, preflight and commit
  app/pageDropSetup.ts   binds the Pages-panel file-drop controller to the import host
  app/sheetFlows.ts      operation-card sheet creation, add-page and paper changes
  app/imageFlows.ts      image insertion and target-layer selection
  app/documentFlows.ts   PDF/TIF/project loading and source-page selection
  app/pageFlows.ts       page navigation, duplicate/delete and project reset
  app/scaleFlows.ts      calibration, manual scale and fit-to-area actions
  app/packageFlows.ts    package host adapter and packaged-project opening
  app/projectImportFlows.ts project page import, partial imports and history-aware commit
  app/projectImportSource.ts source project document loading, previews and missing-file recovery
  app/rendererDocuments.ts renderer/proxy cache that keeps import undo and redo instant
  app/diagnosticsFlows.ts diagnostics text, copy and report flow
  app/recoveryHost.ts   session-recovery host wiring for autosave, leases and banners
  features/              feature modules; see docs/adr/0001-feature-modules.md
  features/countTypes/model.ts count definitions, normalization, management and quantity helpers
  features/countTypes/ui.ts count-type management dialog
  features/projectPackage/model.ts package manifest validation, safe archive names and portable project paths
  features/projectPackage/controller.ts package creation and open-package flows, checksums and progress
  features/projectPackage/ui.ts package options, destination and progress dialogs
  features/projectPackage/ipc.ts Tauri package command wrappers and progress channels
  features/projectImport/model.ts source-page inspection, import planning and commit
  features/projectImport/merge.ts category, count-type, line-type, asset and document merge helpers
  features/projectImport/ui.ts graphical source-page picker with lazy previews
  features/listInteraction/ shared list selection, drag, drop line, keyboard move, filter and collapse rules
  features/importProvenance/ read-only provenance summary, Properties block and conditional Markups column
  features/pageReorder/ page-card drag, multi-selection, document drop plan and keyboard reorder
  features/pageFileDrop/model.ts Pages-panel file-drop target classification and pointer rules
  features/pageFileDrop/controller.ts Pages-panel PDF/TIF drop listeners, shared drop line and rejection messages
  features/pageStatus/ pure page badges and status filters derived from project and source state
  features/pageMenu/ page card menu, insert/move targets and page keyboard commands
  features/saveIntegrity/index.ts public surface for conditional saves and backups
  features/saveIntegrity/stamp.ts runtime file stamp, version comparison and conflicted-copy names
  features/saveIntegrity/conflict.ts conflict classification and default action
  features/saveIntegrity/compare.ts read-only local-versus-disk comparison summary
  features/saveIntegrity/backup.ts rolling-backup naming, ordering and default retention
  features/saveIntegrity/backupController.ts backup listing, restore-as-copy, explicit replace and confirmed delete flows
  features/saveIntegrity/backupManagerModel.ts pure backup selection, replace availability and origin-warning rules
  features/saveIntegrity/backupManagerUi.ts backup history, restore, replace and delete dialog
  features/saveIntegrity/restoreLinks.ts pure resolution of a restored backup's relative drawing links
  features/saveIntegrity/restoreUi.ts unresolved-drawing report with the explicit locate action
  features/saveIntegrity/controller.ts save, conflict and no-op orchestration
  features/saveIntegrity/ports.ts platform and dialog adapters for the save controller
  features/saveIntegrity/files.ts conditional-write, stamp, read-back and backup IPC
  features/saveIntegrity/ui.ts conflict and comparison dialogs
  features/conflictedCopies/model.ts strict conflicted-copy naming, ordering and delete guards
  features/conflictedCopies/ipc.ts conflicted-copy list and delete command wrappers
  features/conflictedCopies/controller.ts list, open, compare and confirmed-delete flow
  features/conflictedCopies/ui.ts conflicted-copy list dialog and delete confirmation
  features/sessionRecovery/index.ts public surface for scoped autosave, leases and recovery
  features/sessionRecovery/autosave.ts recovery snapshot API, pruning and legacy migration
  features/sessionRecovery/budget.ts pure retention rules: byte budget, usage totals and prune order
  features/sessionRecovery/failure.ts storage failure classification and the actionable quota message
  features/sessionRecovery/recoveryStore.ts IndexedDB records, budget pruning before write, localStorage fallback and legacy cleanup
  features/sessionRecovery/recovery.ts base-version comparison and recoverable entry collection
  features/sessionRecovery/lease.ts pure lease model, stale boundary and classification
  features/sessionRecovery/leaseFiles.ts Rust lease command wrappers and ownership errors
  features/sessionRecovery/leaseSession.ts acquire, heartbeat, take-over and release lifecycle
  features/sessionRecovery/controller.ts autosave loop, lease adoption, recovery center and watcher orchestration
  features/sessionRecovery/centerModel.ts recovery grouping per project and instance, sizes and base-version labels
  features/sessionRecovery/centerUi.ts recovery center dialog with selective restore and delete
  features/sessionRecovery/autosavePreference.ts app-level autosave enabled, interval and session pause
  features/sessionRecovery/checkpoint.ts labelled structural-operation checkpoints
  features/sessionRecovery/watch.ts visible-window project file polling
  features/sessionRecovery/summary.ts synchronous recovery summary for the welcome screen and Preferences
  features/sessionRecovery/ui.ts lease dialog and non-blocking session banners
  features/sessionRecovery/record.ts recovery record types, IDs and retention constants
  features/schematics/ operation-card templates, sheet fields, schematic symbols, fit and dialogs
  features/schematics/symbols/primitives.ts shared stroke-only drawing geometry, ports and catalogue entry helper
  features/schematics/symbols/firstBatch.ts first ten reviewed stroke-only ventilation symbols
  features/schematics/symbols/library/ full schematic set split by category, aggregated in index.ts
  features/schematics/symbols/reference/ reference-aligned sensors, electrical and general symbols
  features/schematics/symbols/registry.ts aggregate sign/schematic lookup and set helpers
  features/schematics/model/fitDrawing.ts drawing-area bounds, overflow warning and fit action
  features/schematics/ui/lineTypeDialog.ts project media-class editor
  features/launch/model.ts OS launch path classification for projects and drawings
  features/diagnostics/model.ts sanitised diagnostics text and anonymised project statistics
  features/diagnostics/log.ts local 80-entry event log and runtime error capture
  i18n/locales/en.json   English source catalog and per-key fallback
  i18n/locales/sv.json   complete Swedish catalog, lazy-loaded
  i18n/registry.ts       SUPPORTED_LOCALES descriptors, locale matching and pseudo-locale
  i18n/types.generated.ts generated MessageKey and MessageCatalog from en.json
  i18n/format.ts         locale-aware number, date and localized-number formatting
  i18n/index.ts          catalog loading, ICU translation, language state and t()
  i18n/help.ts           per-language help bundle map with English fallback
  i18n/hardcoded-baseline.json frozen pre-migration UI strings for the i18n gate
  compare/referenceSession.ts session-only revision project or raw PDF reference, renderer and source paths
  compare/revisionDiff.ts pure item matching and added/removed/changed classification
  canvas/CanvasView.ts   rendering orchestration, hit testing, inline editing, resize/rotate, PNG compositing
  canvas/itemRenderer.ts thin public entry point; delegates item drawing to canvas/items/
  canvas/items/context.ts shared item render context, panel drawer and label helper
  canvas/items/dispatch.ts rotation, shared canvas setup and the item-family switch
  canvas/items/measurement.ts length, angle, slope, radius, diameter, arc, area and volume drawing
  canvas/items/shapes.ts pen, line, arrow, rectangle, ellipse, highlight, polyline, rail and cloud shape drawing
  canvas/items/text.ts text, textbox and rich text drawing
  canvas/items/symbols.ts symbol artwork, free-text tags and inspection badges
  canvas/items/images.ts embedded image drawing and opacity
  canvas/items/annotations.ts callout, stamp, delta and cloud label drawing
  canvas/items/counts.ts count symbols and count-type glyphs
  canvas/items/visible.ts viewport culling and layered item iteration
  canvas/interactionRenderer.ts selection, marquee, snap and draft overlay drawing
  canvas/pointer/PointerController.ts pointer input, coordinate, cursor, marquee, pan, drag dispatch, wheel, space-pan, pen priority, touch navigation and long-press helpers
  canvas/pointer/PointerHost.ts explicit CanvasView surface used by the pointer controller
  canvas/pointer/contextMenu.ts context menus, measurement-label actions and label connections
  src/canvas/pointer/contexts.ts host context builders for creation, context-menu and double-click actions
  src/canvas/pointer/cursor.ts cursor selection for the current pointer state
  src/canvas/pointer/draft.ts draft state and every drawing/measurement finish path
  src/canvas/pointer/itemFactory.ts item creation from the current tool and style state
  src/canvas/pointer/listeners.ts pointer, wheel, double-click and context-menu listener binding
  src/canvas/pointer/navigation.ts pan, marquee and wheel navigation
  src/canvas/pointer/primitives.ts coordinate, pointer-capture and release helpers
  src/canvas/pointer/targets.ts selection and hover target resolution
  src/canvas/pointer/touchInput.ts pen priority, palm rejection, touch navigation and long-press

  canvas/pointer/creation.ts creation-tool pointer-down branches and draft start/finish
  canvas/pointer/doubleClick.ts double-click target resolution and edit dispatch
  canvas/pointer/drag.ts item move, vertex, label and measurement-label drag
  canvas/pointer/transform.ts resize, group scale and rotation application
  canvas/pointer/pointerState.ts drag, marquee and pan gesture state
  canvas/pointer/groupHandles.ts group selection handles shared by pointer and renderer
  canvas/symbolPath.ts   cached Path2D objects for symbol artwork
  canvas/draftRenderer.ts draft geometry, colours and preview labels in screen space
  canvas/touchNavigation.ts shared two-finger pan, pinch zoom and palm suppression
  canvas/viewport.ts     pure page/screen transforms, fit, zoom and split-view synchronization
  canvas/geometry.ts     crop, handle, rotation and colour helpers
  canvas/selectionHandles.ts selection and rotation handles
  canvas/annotationDraw.ts callout, stamp, cloud-label and endpoint drawing
  canvas/crop.ts         export crop mode, overlay and toolbar
  canvas/editors.ts      public CanvasEditorController surface
  canvas/editors/controller.ts editor facade and document pointer-down handling
  canvas/editors/shared.ts editor session types, surface colours and close helpers
  canvas/editors/text.ts text, textbox and annotation session starters
  canvas/editors/textSession.ts text editor DOM, style strip and resize binding
  canvas/editors/textPosition.ts inline editor positioning
  canvas/editors/textCommit.ts text editor commit semantics
  canvas/editors/textResize.ts cloud and callout resize handle
  canvas/editors/labels.ts measurement-label editing
  model/                 project types, geometry, radius/diameter/arc/angle/slope/volume measurement math, quick-area shapes, snap, text layout, labels, units, calibration, layers, metrics, quantities, selection, clipboard, revision-cloud geometry, annotation layouts, stamp presets
  model/commands.ts      shared item visibility, locking, deletion, movement and style commands
  model/markups.ts       saved Markups views, columns, filters and grouping rules
  model/symbols/         symbol types, categories, sign artwork, catalogue, lookup and render plan
  model/symbols/signs/   one facility-sign artwork module per category prefix
  model/symbolTag.ts     free-text symbol tag offsets shared by canvas and PDF
  model/richText.ts      rich text runs, wrapping, selection formatting and fallbacks
  model/symbolPaths.ts   shared SVG path parsing and transforms for symbol artwork
  state/store.ts         immutable project snapshots, undo/redo, multi-selection and read-only UI state
  state/history.ts       adaptive undo-history limits from the serialized snapshot size
  pdf/pdfRenderer.ts     PDF.js document lifecycle and progressive crop rendering
  pdf/thumbnails.ts      lazily rendered, cached page previews for the Pages panel
  pdf/pdfExport.ts       flattened vector PDF export entry point and page orchestration
  pdf/export/options.ts  export page range and crop normalization
  pdf/export/ocg.ts      optional-content groups for exported project layers
  pdf/export/annotations.ts review-only standard PDF annotations
  pdf/export/page.ts     crop application and calibration line drawing
  pdf/export/fonts.ts    embedded font set and run selection
  pdf/export/images.ts   image asset embedding
  pdf/export/geometry.ts PDF point, angle, colour and path helpers
  pdf/export/labels.ts   measurement labels, leaders and panels
  pdf/export/legend.ts   legend page and count glyphs
  pdf/export/items/dispatch.ts item-family switch
  pdf/export/items/measurement.ts length, angle, slope, radius, diameter, arc, area and volume
  pdf/export/items/shapes.ts pen, line, arrow, rectangle, ellipse, highlight, polyline, rail
  pdf/export/items/text.ts text, textbox and rich text
  pdf/export/items/symbols.ts symbol artwork, tags and inspection badges
  pdf/export/items/counts.ts count symbols and glyphs
  pdf/export/items/annotations.ts callout, stamp, delta, cloud labels and panels
  pdf/reportPdf.ts       print-friendly A4 quantity report built with pdf-lib
  pdf/comparePdf.ts      side-by-side reference PDF with visuals and an optional diff table
  report/reportModel.ts  pure quantity report model shared by CSV, XLSX and PDF
  report/rows.ts         shared quantity and markup table rows
  report/csv.ts          quantity CSV serialization with BOM and metadata
  report/xlsx.ts         six-sheet XLSX workbook built with fflate
  search/textIndex.ts    PDF text extraction, local index and page-space search hits
  search/ocr.ts          bundled Tesseract eng+swe OCR, page rendering and stored OCR conversion
  report/markupCsv.ts    visible markup CSV serialization
  ui/                    top menu, sidebar, page/layer lists, Markups panel, context bar, inspector, dialogs, status bar
  styles/tokens.css      theme token contract and semantic aliases
  styles/themes/         default jade, light-green, grey and navy palettes plus chrome overrides
  theme/theme.ts         theme preference resolution, application and System-mode watching
  public/boot-theme.js   CSP-safe pre-paint theme bootstrap
  styles/base.css        reset, typography and shared utilities
  styles/shell.css       top bar, docks, symbol library, canvas and welcome
  styles/panels.css      inspector, layers, pages, status bar and popover menu
  styles/dialogs.css     dialogs, menus, forms, quantities and preferences
  styles/projectImport.css project page import picker and source-document groups
  styles/markups.css     Markups panel, revision compare and text search
  styles/help.css        help dialog, search, TOC and image lightbox
  styles/popovers.css    tool flyouts, Canvas options and measurement options
  styles/reference.css   reference page navigation and follow-primary control
  styles/status.css      status, storage and welcome details
  styles/responsive.css  laptop widths and high OS scaling
  ui/contextBar.ts       tool-specific context bar and target layer controls
  ui/inspector.ts        Properties header, active-layer and selection sections
  ui/markupsPanel.ts     Markups public surface
  ui/markups/            Markups state, view favourites, grouping, rows and virtualised panel
  ui/layerList.ts        Layers panel orchestration, toolbar and rows
  ui/layers/             layer filter, row builder, menu, view state and drag reorder wiring
  ui/layerAction.ts      shared row icon button for Layers and Markups
  ui/symbolLibrary.ts    searchable Signs/Schematic symbol library and recent symbols
  ui/duplicatePageDialog.ts page name, scale and markup duplication options
  ui/measureOptions.ts   category, room, count type and area options popover
  ui/selectionInspector.ts selection Properties dispatcher
  ui/inspector/          selection summary, measurement, image, symbol, drawing, style and item actions
  ui/selectionMenu.ts    shared item context menu for canvas, layers and Markups
  ui/itemIcon.ts         icon lookup shared by Layers and Markups
  ui/shortcuts.json      single source for tool and application shortcuts
  ui/shortcuts.ts        typed shortcut maps and platform formatting
  ui/toolDefs.ts         tool metadata, shared rail families and last-used family member
  ui/toolFlyouts.ts      long-press/right-click variant and family panels
  ui/statusBar.ts        page scale menu, cursor position and layer status
  ui/splitView.ts        synchronized read-only reference pane, comparison mode and divider
  ui/referencePane.ts    reference source selector, reference name and Open/Close controls
  ui/comparePanel.ts     revision summary, filters, difference list and comparison controls
  ui/searchPanel.ts      floating full-text search field, progress and result list
  ui/welcome.ts          empty-project welcome screen and recent files
  ui/pageImportDialog.ts page picker with previews for PDF/TIF import
  ui/topMenu.ts          File/Edit/View/Settings/Help menu model and keyboard navigation
  ui/windowChrome.ts     minimize, maximize and close controls for the custom title row
  ui/helpDialog.ts       bundled Markdown help, search, table of contents and image lightbox
  ui/settingsDialog.ts   settings dialog orchestrator
  ui/settings/           project, storage, metadata, scale, units, labels, display, quantities, count types and stamps sections
  ui/settings/autosave.ts Preferences → Data autosave controls
  ui/settings/backups.ts Preferences → Data backup retention and manager entry
  source/sourceStatus.ts source drawing existence, size and checksum monitor
  features/sourceStorage/ reference/managed modes, managed copies, consolidation and relinking
  features/statusOverview/ project status summary model and popover for save, backup, autosave, validation and recovery
  app/sourceStorageHost.ts source-storage controller wiring and renderer replacement
  ui/preferencesDialog.ts local workspace, layer-colour and app stamp preferences
  ui/settingsControls.ts shared section, field, checkbox and preset-editor building blocks
  ui/diagnosticsDialog.ts copy diagnostics and the report-a-problem support dialog
  model/pages.ts         PageId, PageRecord and every page resolver
  model/openTarget.ts    PDF/TIF/project classification shared by window and Pages-panel drops
  features/pageModel/    page insert/reorder/delete/duplicate, source replacement and import mapping
  app/replacementFlows.ts file pick, previews, renderer swap and checkpoint
  model/cloud.ts         revision-cloud bezier geometry
  model/annotations.ts   callout, stamp, delta, and cloud-label layout
  model/stamps.ts        stamp preset normalization and defaults
  model/projectName.ts   shared project-name trimming, length cap and empty fallback
  io/stampDefaults.ts    global stamp presets for new projects
  io/layerDefaults.ts    local default colours for new measurement and drawing layers
  help/markdown.ts       safe Markdown renderer for bundled help
  help/content.ts        Vite raw imports of the user guide, workflows and shortcuts
  help/images.ts         Vite asset URLs for bundled help screenshots
  io/projectFile/        project schema normalization, serialization, relative paths, source-path protection
  io/projectFile/pages.ts schema 23 → 24 page migration and page normalization
  io/projectFile/sourceStorage.ts schema 24 → 25 reference/managed storage migration
  io/platform.ts         Tauri/browser file I/O, dialogs, recents, SHA-256 entry point
  io/platformError.ts    Rust command error codes to localized messages
  io/writeGuard.ts       conservative source-path matching for every save and export
  io/sha256.ts           dependency-free SHA-256 fallback
src-tauri/
  src/commands.rs        atomic text/binary replacement, canonical path checks, structured errors, reads, demo copy, smoke exit and commands
  src/project_write.rs   conditional project write, read-back hash stamp and file-stamp command
  src/project_lease.rs   advisory sidecar lease read/write/heartbeat/clear with owner checks
  src/project_backup.rs  app-data backup directory, origin metadata, rolling retention, list and delete commands
  src/conflicted_copy.rs strict conflicted-copy discovery and single-file delete guards
  src/package.rs         streaming ZIP package create/inspect/extract, manifest and checksum validation
  src/source_copy.rs     verified managed drawing copy, source hash and folder checksum search
  src/lib.rs             Tauri command registration, OS launch queue, smoke-test mode, single instance and window state
  capabilities/          desktop permissions
  tauri.conf.json        undecorated Windows/Linux window drawn by ui/windowChrome.ts
  tauri.macos.conf.json  overlay title bar so macOS keeps the native traffic lights
docs/user-guide.md       in-app user guide and workflow reference
docs/workflows.md        role-based guides for operations and property management
docs/shortcuts.md        in-app keyboard reference
docs/screenshots/        versioned screenshots and capture manifest
tests/                   geometry, quick areas, snap, text layout, calibration, layers, quantities, selection/clipboard, hit-testing, project files, PDF export, page thumbnails, SHA-256, Markdown, help images, demo project, canvas geometry and autosave
tests/robustness/        seeded page/save sequences, competing saves, the schema 1–25 migration corpus and source-storage gates
fixtures/legacy/         committed project fixtures for every supported schema; generate with scripts/make-legacy-fixtures.mjs
scripts/plan-geometry.mjs shared geometry for the industrial sample set
scripts/make-industrial-fixture.mjs reproducible three-sheet industrial PDF generator
scripts/make-fixture.mjs legacy A4 sample generator
scripts/make-demo-project.mjs deterministic documentation project
scripts/make-legacy-fixtures.mjs generator for the schema 1–25 migration corpus
scripts/ui-harness.mjs shared Playwright server and demo-project helpers
scripts/smoke-ui.mjs Playwright smoke test for open, measure, help and save
scripts/canvas-regression.mjs pointer-level canvas gesture regressions
scripts/benchmark-history.mjs synthetic undo/history benchmark with 2,000+ items
scripts/benchmark-large-project.mjs reference project benchmark for 150 pages and 15,000 items
scripts/symbol-catalog.mjs generated standalone schematic symbol review catalogue
scripts/capture-docs.mjs Playwright screenshot capture for the documentation
scripts/check-docs.mjs link, image, anchor and schema checks
scripts/check-file-budgets.mjs blocking source line budgets
scripts/docs-fingerprint.mjs UI fingerprint for screenshot staleness checks
scripts/build-site.mjs build site-dist from site/, icons, screenshots and release metadata
scripts/check-site.mjs link, asset, language parity, release and SEO checks for the built site
site/                  bilingual landing page and feature tour
site/features/         English feature tour
site/sv/funktioner/    Swedish feature tour
site/release.json      displayed release version, date, notes and asset URLs
.github/workflows/pages.yml GitHub Pages build and deploy
```

Architecture decisions are recorded in [`docs/adr/`](adr/README.md). The source map below describes the current code; accepted ADRs describe decisions that constrain future changes.

Key design choices:

- **Local first.** PDF bytes are read only when needed. Project data autosaves to a local IndexedDB recovery store; no data leaves the machine. A localStorage fallback is used only when the browser disables IndexedDB.
- **Markup layers are app-level.** They are not PDF optional-content groups, and GridScalr never rewrites the source PDF when saving a project. The drawing PDF export writes a new file and leaves the original untouched.
- **Coordinate stability.** Markup points are stored in PDF points, not screen pixels. Zooming, panning, and window resizing do not change measurements; export maps them through PDF.js viewports so page rotation and crop boxes are respected.
- **Progressive rendering.** Only the visible crop of a page is rendered at device resolution. A new render cancels the previous incomplete one.
- **On-demand page thumbnails.** The Pages panel rasterises only the cards near the viewport, one page at a time, at a capped pixel size, and caches the result. Thumbnail work yields while the main canvas renders, so page previews never block drawing.
- **Snapshot history.** Store mutations clone the project before applying changes, giving undo/redo without mutable shared state. Page reorder and page insert push the same snapshot, so each drag or insert is one undo step and keeps every page ID. Page delete, page duplicate, document import and source replacement are explicit structural boundaries that clear the stacks and write a recovery checkpoint instead; an undo must never silently recreate a removed page or restore a previous source path. Undo and redo keep the visible page on its `PageId` while that page exists, and the renderer document registry reapplies the display page order only when it actually changed.
- **One scene or one session, two viewports.** The primary canvas follows the store's viewport. In same-page mode the reference pane reuses the same renderer and scene with a read-only canvas; in revision or drawing mode it uses the reference session's renderer and either its project scene or a projectless PDF scene. Both modes centre the read-only viewport on the primary pane, so pan, zoom and page changes stay synchronized without a second editing path.
- **Reference lifecycle is one controller.** `src/app/referenceController.ts` owns the reference canvas, split view, toolbar, session, diff and comparison panel. `App.ts` only binds menus and delegates; the primary project, undo history and source files are never replaced by a reference.
- **Features are modules.** New user-facing features live under `src/features/<feature>/` with pure model code, UI, renderer and controller separated. `App.ts` and `CanvasView.ts` stay integration points; see [`adr/0001-feature-modules.md`](adr/0001-feature-modules.md).
- **The workspace lists share one interaction model.** `src/features/listInteraction/` owns the pure selection range, block move, insertion, filter and collapse rules plus the generic drag controller, drop line, live region and row focus navigator. Pages, Layers and Markups all use it, while each list keeps its own semantics: Pages move through the undoable `reorderPages` action and page IDs, Layers move within their kind groups through `reorderLayerGroup`, and Markups is a sorted and grouped virtualised table, so it follows focus, selection, filter and collapse conventions but deliberately has no drag handle or drop line. Layer filtering keeps unlisted layers in their existing slots. Markups view favourites are stored locally per project because pinning is a per-machine preference and does not justify a schema change.
- **Derived exports share one row model.** Quantity and markup tables are built once in `src/report/rows.ts` and serialized to CSV and XLSX from the same cells. The workbook never stores a second copy of the takeoff.
- **Search stays local.** PDF.js text items are converted to page-space rectangles and indexed in memory when the search panel opens. OCR runs only when requested, using bundled Tesseract English/Swedish models and local worker/WASM assets. OCR words and bounding boxes are stored as rebuildable page data so reopening a project does not repeat the work; the PDF text index itself is discarded with the project.
- **Comparison is session-only.** A reference revision opens its project and drawings in its own renderer; a raw PDF drawing opens as a projectless read-only scene. Matching uses item ids first, then geometry, then the nearest same-kind item inside a move tolerance. The current store, undo history and source drawings are never replaced by the reference. A drawing reference has no markup diff, so the panel and comparison PDF keep the visuals and summary only.
- **Packaged smoke mode is in the app.** `--smoke-test <dir>` is parsed with the other launch arguments, stored in Rust and consumed once by `App.bindSmokeTest`. The app runs its real open/save/reopen/quit-prompt flows against the bundled demo, writes `result.json` and exits through `finish_smoke_test`. CI runs it against the built desktop shell on all three platforms and against release artifacts, which covers the packaged binary without WebDriver (tauri-driver has no macOS support).
- **The demo is a copy.** `commands::prepare_demo_project` copies the bundled `fixtures/demo-project.gridscalr` and `industrial-plan.pdf` from the Tauri resource directory into a `demo` folder under the app data directory, and never overwrites an existing copy. The demo is therefore editable and saveable while the bundled resources stay read-only. The welcome screen opens it through the same `openPath` flow as a dropped project.
- **New UI strings go through one catalog.** `src/i18n/locales/*.json` holds flat namespaced keys, with English as the only catalog that must always be complete. `i18n/registry.ts` declares every locale once; the `Locale` type, language preference, selector options and help bundles derive from it. English loads eagerly, other locales load on demand before `new App(root)`, and system matching walks `navigator.languages` (`sv-FI → sv → en`). `i18n/format.ts` is the only number/date presentation path, and `intl-messageformat` supplies plural and select rules. `scripts/check-i18n.mjs` validates the catalogs (including duplicate keys), regenerates and compares `types.generated.ts`, and scans every `src` directory except `src/i18n` for hard-coded interface text in properties, `el()`/`option()` calls and template literals; the baseline stays empty, so any new literal fails `npm run check:i18n` unless it is deliberately excluded as technical English. See [`adr/0007-localization-at-scale.md`](adr/0007-localization-at-scale.md).
- **Support data is local and anonymised.** `features/diagnostics/model.ts` builds the report from version, schema, platform, WebView, viewport and aggregate project statistics only, and strips absolute paths from every field. `features/diagnostics/log.ts` keeps the last 80 runtime events in localStorage; nothing is uploaded. Autosave failures stay visible in the status bar until a later autosave succeeds, and the same chip opens the report dialog.
- **Files opened by the OS go through one queue.** Windows and Linux pass a file as a start argument, macOS delivers `RunEvent::Opened`, and a second launch is forwarded by the single-instance plugin. All three append to a Rust queue that the frontend drains with `take_launch_paths` on startup and after a `gridscalr:paths-queued` event, so the open path is identical to a dropped file. Only the window's size, position and maximised state are persisted by `tauri-plugin-window-state`; decorations stay app-controlled. The queue and the association live in `src-tauri/src/lib.rs` and `tauri.conf.json`, path classification in `src/features/launch/model.ts`.
- **Native I/O, portable format.** Rust commands perform atomic writes; the project file records both an absolute and relative PDF path plus a SHA-256 checksum. Portable packages are streamed in Rust so large PDFs never pass through the JavaScript heap: PDFs use ZIP store mode, text uses deflate, and every entry is checked against the manifest before extraction. Commands reject with `{ code, detail }`; `src/io/platformError.ts` maps the code to a catalog message and keeps the operating-system detail as a separate technical line.
- **Touch keeps tools and navigation separate.** One finger draws or selects with the active tool. Two fingers pan and pinch-zoom around their midpoint on both the primary canvas and the reference pane, cancel an unfinished touch draft, and suppress the remaining finger until all touches are lifted. A pen takes priority and recent palm touches are ignored. Long-press on an item opens the shared context menu on touch.
- **The title row is app-drawn on Windows and Linux.** `src-tauri/tauri.conf.json` turns the native decorations off and `src/ui/windowChrome.ts` draws minimize, maximize/restore and close at the end of the menu row; close routes through the unsaved-changes flow. macOS keeps the native traffic lights through `src-tauri/tauri.macos.conf.json` with an overlay title bar. Tauri replaces the `app.windows` array on platform merge, so the window block in that file must stay in sync with the base config. The browser fallback renders no window buttons.
- **Bundles follow user intent.** OCR, PDF exports, XLSX and TIF import load through dynamic imports only when used. Production builds omit source maps unless `GRIDSCALR_SOURCEMAPS=1` is set for a debuggable build.
- **Integration modules are wiring only.** `src/app/App.ts` and `src/canvas/CanvasView.ts` may import feature modules; `src/features`, `src/model`, `src/io` and canvas helpers must not import them. ESLint enforces the direction with `@typescript-eslint/no-restricted-imports`, and `max-lines` warns above 700 lines with a shrinking exception list for files that predate the rule. See [`adr/0008-integration-module-boundaries.md`](adr/0008-integration-module-boundaries.md).
- **The landing site is separate from the app.** `site/` is hand-authored HTML, CSS and a small progressive-enhancement script with a native-dialog screenshot lightbox. `scripts/build-site.mjs` copies it with the app icon, all documentation screenshots and `site/release.json` values into the gitignored `site-dist/`, and `.github/workflows/pages.yml` deploys that output. The site reuses screenshots and brand assets but no application code or build output. `site/release.json` is the single source for the displayed release version and download links and is updated for every tagged release.
- **Tauri prototype freezing stays off.** pdf-lib assigns `PDFHeader.prototype.toString` and `@pdf-lib/fontkit` assigns another property inherited from `Object.prototype`; Tauri's `freezePrototype` makes those assignments throw and prevents the window from starting. GridScalr does not execute untrusted JavaScript, so this hardening stays disabled; the value and reason are recorded in `security/policy.json` and `docs/security-policy.md`.

## Planned foundation work

The data-integrity work is accepted and progressively implemented. The source
map above describes the current schema 25 code.

- [ADR 0010](adr/0010-project-file-integrity.md): conditional project writes,
  conflict copies, scoped autosave and advisory lock leases.
- [ADR 0011](adr/0011-page-list-and-source-replacement.md): explicit
  `PageRecord[]`, stable `PageId`s, empty projects, reorder/insert and source
  replacement.
- [ADR 0012](adr/0012-source-storage-modes.md): reference, managed-copy and
  package source modes.
- [ADR 0013](adr/0013-module-first-foundation.md): module-first layout, public
  `index.ts` surfaces, 300/400-line budgets and the foundation module maps.
- [`plan/robustness.md`](plan/robustness.md): phases, invariants and tests.
- [`plan/foundation-findings.md`](plan/foundation-findings.md): larger
  out-of-scope findings discovered during the phases.

Do not describe these behaviours as shipped until their migrations and UI land.

## Testing and fixtures

- `npm test` runs the Vitest suite for the model, project files, hit testing, TIFF parsing, PDF/XLSX export, revision matching, text search and OCR conversion, viewport math, Markdown, help images, the demo project, canvas geometry, autosave and project-package manifest/path rules.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` covers atomic replacement, failed replacement, missing parents, large writes, canonical source-path protection, verified managed source copies, source folder checksum search, and package create/extract security, checksums, cancellation and limits. CI runs the same tests.
- `npm run check:file-budgets` compares every TypeScript and CSS file under `src` with `file-budgets.json`. New files default to 700 lines, `src/canvas/items` and `src/canvas/pointer` have stricter limits, and listed files may only shrink. CI fails when a budget is exceeded.
- `npm run lint` runs the type-aware ESLint checks for asynchronous calls, promise-returning handlers, type-only imports and exhaustive switches, plus the integration-module import boundary and the line budget. TypeScript 7 has no compiler API yet, so ESLint uses the official `@typescript/typescript6` alias while `npx tsc` remains TypeScript 7.
- `npm run test:coverage` runs the same Vitest suite with the v8 coverage provider and writes text, HTML and `json-summary` reports to `coverage/`. CI uploads the report as an artifact; no threshold is enforced yet.
- `npm run test:robustness` runs `tests/robustness/` as a named gate. The normal suite includes it; CI also runs the focused command. It covers seeded page identity, competing saves, the schema 1–25 corpus and source storage.
- `npm run test:ui` and `npm run test:canvas` drive the browser fallback with Playwright.
- `npm run test:count` drives the full count workflow: custom type creation, placement, pieces per object, Markups count-type filtering/grouping, quantities and presets.
- `npm run test:touch` covers two-finger pan, pinch zoom and one-finger count placement.
- `npm run bench:history` builds a synthetic project for undo/history timing (`GRIDSCALR_BENCH_ITEMS=5000` for a larger one).
- `npm run bench:large` builds the documented reference project and reports mutation, serialization, page-switch and autosave timings. The budgets live in `docs/limitations.md`.
- `fixtures/industrial-plan.pdf` is generated by `npm run fixture`; `fixtures/demo-project.gridscalr` by `npm run docs:demo`.
- `fixtures/tiff/` holds the small G4 and LZW scan fixtures used by the TIFF reader tests.
- `npm run docs:capture` regenerates the screenshots from the demo project, and `npm run check:docs` validates links, anchors, images, tool coverage, the schema reference and screenshot freshness.

## Browser fallback

Running `npm run dev` without Tauri is useful for layout and interaction work,
but it cannot use native file paths. In that mode opening and saving use the
hidden file input and browser downloads, recent files are desktop-only, and
reopening a project asks for the PDF again because browsers do not expose
persistent local paths. Checksum verification still works.


# AGENTS.md

Persistent working instructions for agents and maintainers of GridScalr. Read this file first, then `README.md` and the plans in `docs/plan/`.

## Project

- GridScalr is a local-first Tauri 2 desktop app for measuring PDF drawings and producing procurement quantities.
- Frontend: TypeScript, HTML5 Canvas, PDF.js, Vite. No UI framework.
- Desktop shell: Rust/Tauri 2.
- Repository: `https://github.com/MajorJohnDoe/gridscalr` (private).
- Current app version: `0.6.1`.
- Current project-file schema: `14`.
- Etapp 1–5 are complete. Etapp 2A added categories, rooms, the count tool, deduction areas, the quantities panel, and measurement bulk edits. Etapp 2B added waste, rounding, order quantities, and quantity CSV/PDF reports. Etapp 3A added quick areas, manual scale, per-page scale locks, and markup snapping. Etapp 3B added the drawing export dialog with page ranges, crop areas, layer selection, labels, calibration, and a legend. Etapp 4 added embedded PNG/JPEG images, background and annotation modes, image handles, opacity, rotation, and image-aware PDF export. Etapp 5 added scanned TIF import as lossless CCITT G3/G4 pages, multiple source documents per project, append-only page numbering, and schema v6.

## Read before changing code

1. `README.md` — user-facing behaviour, architecture, shortcuts, and file format.
2. `docs/user-guide.md` — the in-app user guide. Keep it accurate whenever the GUI or a user-facing workflow changes.
3. `docs/workflows.md` — task-oriented guides for operations technicians and technical property managers.
4. `docs/shortcuts.md` — the in-app shortcut reference.
5. `docs/screenshots/manifest.json` and the referenced screenshots — regenerate with `npm run docs:capture` when a visible screen changes.
6. `docs/plan/roadmap-etapper.md` — Etapp 1–5 scope, product invariants, and open decisions.
7. `docs/plan/etapp-2-mangddata.md` — detailed Etapp 2A/2B plan.
8. `docs/plan/etapp-3-matverktyg-skala-export.md` — approved Etapp 3A/3B plan.
9. `docs/plan/etapp-4-bilder.md` — approved Etapp 4 plan and image decisions.
10. `docs/plan/etapp-5-tiff.md` — approved Etapp 5 plan, TIF decisions, and S1 results.
11. The relevant source and tests for the area being changed.

If a plan and the code disagree, stop and surface the conflict rather than silently choosing one.

## Non-negotiable product rules

- The app is local-first. Never overwrite the source PDF. Reference it by path plus SHA-256.
- Hidden items must not render, hit-test, or export.
- Hidden layers behave like hidden items. Layer visibility/locking takes precedence over per-item flags.
- Locked items stay visible and exportable but cannot be moved, edited, or deleted.
- Measurement layers and drawing layers stay separate. Layers are `measure` or `draw`.
- One bulk action must be one undo step.
- Project files must remain backward compatible. Every schema change needs migration tests for the current and previous version.
- New documents always append pages at the end. Never insert or reorder pages.
- Deleting a page is an explicit structural action, not an undoable edit. It must delete that page's items and page state, remap later item/page-state numbers, keep at least one page in the project, and resync the PDF renderer. Source files are never modified.
- Derived quantities and summaries are calculated from item data, never stored as separate sources of truth.
- Exports must use the same visibility and locking rules as the canvas.
- Do not add cloud sync, accounts, telemetry, or network dependencies without an explicit decision.

## Documentation policy

Docs are maintained deliberately, not on every commit. Split the work in two.

**Same commit as the change (cheap, keeps the docs from being plainly wrong):**

- Update `docs/shortcuts.md` and the README shortcut table whenever a keyboard shortcut is added, removed, or changed.
- Update `README.md` when navigation, menus, panels, exports, or the architecture map change.
- Fix any existing instruction that a change makes outright wrong, such as a menu path or panel name that moved.
- Keep `Help → About` accurate. The version is read from `package.json` and the schema version from `SCHEMA_VERSION`; do not hardcode either in help content.

**Deferred to a documentation pass (decided, never automatic):**

- `docs/user-guide.md` prose for new features, renamed commands, moved panels, changed menu paths, and changed workflows.
- `docs/workflows.md` role guides.
- Screenshot recapture with `npm run docs:capture`.

Rules that keep the deferral honest:

- Every PR that defers documentation states it in the description: `Docs impact: deferred — <what>`, or `Docs impact: none`.
- Deferred documentation is cleared before a release tag, or earlier when the user asks for a documentation pass.
- `npm run check:docs` must pass. Stale-screenshot warnings are acceptable during development; `GRIDSCALR_DOCS_STRICT=1` is used for the release pass only.
- Documentation-only changes do not need the full build, but links, images, anchors, and instructions must remain correct.
- Never report a GUI change as documented while the user guide still describes the previous interface.

## Git workflow

- `main` is the integration branch and should always pass CI.
- Small fixes, documentation, and workflow changes may be committed directly to `main`.
- Larger features should use a branch such as `feat/etapp-2a` or `fix/pdf-export`, followed by a pull request.
- Never force-push `main`.
- Keep commits focused. Do not mix unrelated refactors with a feature or bug fix.
- Commit messages use the imperative mood and, where useful, a Conventional Commits prefix:
  - `feat: add count measurement tool`
  - `fix: exclude hidden layers from CSV export`
  - `docs: record Etapp 2 decisions`
  - `chore: update Windows build workflow`
- Do not commit `node_modules/`, `dist/`, `src-tauri/target/`, `exports/`, local environment files, or credentials.
- Do not commit generated test output unless it is deliberately part of the fixture set.

### Before every commit

Run the relevant checks from the repository root:

```bash
npm run check:versions
npm run check:docs
npm run format:check
npx tsc --noEmit
npm test -- --run
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml
```

For changes that affect the desktop shell, also run:

```bash
npm run tauri build -- --no-bundle
```

A docs-only change does not need the full build, but it must not leave broken links or contradictory instructions.

Before committing, confirm that:

- `docs/shortcuts.md` and the README shortcut table include every shortcut that changed.
- `README.md` highlights, workflow, and architecture map still match the code.
- `Help → About` still reports the version from `package.json`.

Before a feature or GUI change is reported as complete, either update `docs/user-guide.md`
and the affected screenshots, or record `Docs impact: deferred — <what>` in the PR.

### Push and verify

```bash
git status
git push origin main
gh run list --repo MajorJohnDoe/gridscalr --limit 5
gh run watch <run-id> --repo MajorJohnDoe/gridscalr --exit-status
```

Do not report a change as complete while CI is failing. If a workflow fails, inspect it with:

```bash
gh run view <run-id> --repo MajorJohnDoe/gridscalr --log-failed
```

## Versioning and releases

App versions follow [Semantic Versioning](https://semver.org/). The app is still pre-1.0, so minor versions may contain planned Etapp features and patch versions are fixes.

The app version must match in all three files:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

After changing the Rust crate version, run `cargo check` and commit the resulting `src-tauri/Cargo.lock` change.

The project-file `schemaVersion` is independent of the app version. Do not bump the schema merely because the app version changes.

Do not create or push a release tag, publish a GitHub Release, or bump the version for a release without explicit approval. Routine feature work does not need a version bump.

To create a Windows release build:

1. Update the three app-version fields.
2. Run the documentation pass: update `docs/user-guide.md` and `docs/workflows.md`,
   run `npm run docs:capture`, and verify with
   `GRIDSCALR_DOCS_STRICT=1 npm run check:docs`.
3. Run the checks above.
4. Commit and push.
5. Tag the commit with `vX.Y.Z` and push the tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The `Windows build` workflow runs on `v*` tags and can also be started manually. It uploads the `gridscalr-windows` artifact containing the executable and installers. The workflow currently creates artifacts, not a GitHub Release; add a release job only when the release process is deliberately changed.

## CI and build hosts

- `.github/workflows/ci.yml` runs frontend tests/build and Rust formatting/checking on pushes and pull requests.
- `.github/workflows/windows-build.yml` builds the Windows `.exe`, NSIS installer, and MSI on manual dispatch or `v*` tags.
- The Linux build host produces a Linux binary, not a Windows `.exe`. Use the Windows workflow for Windows artifacts.
- GitHub CLI is available in the development environment. Authentication is stored outside the repository; never copy tokens into committed files.
- If GitHub rejects a push because the OAuth token lacks a scope, refresh it with `gh auth refresh -h github.com -s workflow` when adding or changing workflow files.

## Architecture map

```text
src/app/App.ts             app wiring, file flows, shortcuts
src/app/exportFlows.ts     CSV, PDF, PNG and JSON export orchestration
src/canvas/CanvasView.ts   rendering, hit testing, inline editing, resize/rotate, PNG composition
src/canvas/geometry.ts     crop, handle, rotation and colour helpers
src/canvas/selectionHandles.ts selection and rotation handles
src/canvas/annotationDraw.ts callout, stamp, cloud-label and endpoint drawing
src/canvas/crop.ts         export crop mode, overlay and toolbar
src/canvas/editors.ts      inline text and measurement-label editors
src/model/                 types, geometry, labels, units, calibration, layers, images, metrics, selection, clipboard
src/model/commands.ts      shared item commands for visibility, locks, deletion, movement and style
src/model/markups.ts       saved Markups views, columns and grouping helpers
src/model/symbols.ts       classic sign artwork, categories and inspection statuses
src/model/symbolPaths.ts   shared SVG path parsing and transforms for symbol artwork
src/state/store.ts         immutable snapshots, undo/redo, multi-selection, autosave
src/state/autosave.ts      IndexedDB recovery store with legacy localStorage fallback
src/pdf/pdfRenderer.ts     PDF.js lifecycle and progressive page rendering
src/pdf/thumbnails.ts      on-demand, cached page previews for the Pages panel
src/pdf/pdfExport.ts       flattened vector PDF export
src/pdf/reportPdf.ts       print-friendly A4 quantity report
src/report/                pure report model, quantity and markup CSV serialization
src/ui/                    shell, top menu, sidebar, page/layer lists, inspector, dialogs, status bar
src/styles/help.css        help dialog, search, TOC and image lightbox
src/styles/popovers.css    tool flyouts, Canvas options and measurement options
src/ui/canvasOptions.ts    units, snapping, grid and scale-line popover
src/ui/contextBar.ts       tool-specific context bar and target layer controls
src/ui/inspector.ts        Properties scale and active-layer sections
src/ui/measureOptions.ts   category, room, count type and area options popover
src/ui/selectionInspector.ts single and multi-selection Properties
src/ui/selectionMenu.ts    shared item context menu for canvas, layers and Markups
src/ui/markupsPanel.ts     Markups table, columns, saved views, grouping and filters
src/ui/symbolLibrary.ts    searchable facility symbol library and recent symbols
src/ui/duplicatePageDialog.ts page name, scale and markup duplication options
src/ui/itemIcon.ts         icon lookup shared by Layers and Markups
src/ui/shortcuts.json      single source for tool and application shortcuts
src/ui/shortcuts.ts        typed shortcut maps and platform formatting
src/ui/statusBar.ts        calibration, cursor and layer status
src/ui/welcome.ts          empty-project welcome screen and recent files
src/ui/pageImportDialog.ts page picker with previews for PDF/TIF import
src/ui/topMenu.ts          File/Edit/View/Settings/Help menu and keyboard navigation
src/ui/helpDialog.ts       bundled Markdown help, search, table of contents and image lightbox
src/ui/settingsDialog.ts   project units, snapping, quantity defaults
src/help/markdown.ts       safe Markdown renderer for bundled help
src/help/content.ts        raw imports of the user guide, workflows and shortcuts
src/help/images.ts         bundled screenshot URLs for the help dialog
src/io/projectFile.ts      schema normalization, migration, serialization, relative paths
src/io/writeGuard.ts       source-path protection shared by all saves and exports
src/io/imageIngest.ts      PNG/JPEG validation, downscaling, embedded data URLs
src/io/tiff.ts             TIFF IFD parsing, DPI, orientation, strip layout
src/io/tiffImport.ts       lossless CCITT G3/G4 to PDF, embedded document refs
src/model/documents.ts     page mapping, included-page lists, and page deletion remapping
src/model/annotations.ts   callout, stamp, delta, and cloud-label layout
src/model/cloud.ts         revision-cloud bezier geometry
src/model/stamps.ts        stamp preset normalization and defaults
src/io/stampDefaults.ts    global stamp presets for new projects
src/io/platform.ts         Tauri/browser file I/O, dialogs, recents, hashing entry point
src-tauri/src/commands.rs  atomic file writes and path checks
docs/user-guide.md         in-app user guide
docs/workflows.md          role-based workflows for site work and procurement
docs/shortcuts.md          in-app shortcut reference
docs/screenshots/          versioned screenshots and capture manifest
tests/                     model, project-file, hit-test, selection, TIFF, PDF, Markdown, help image, demo project, canvas geometry and autosave tests
fixtures/tiff/             small G4/LZW TIFF fixtures for the reader tests
scripts/plan-geometry.mjs  shared geometry for the industrial sample set
scripts/make-industrial-fixture.mjs reproducible three-sheet industrial PDF generator
scripts/make-fixture.mjs   legacy A4 sample generator
scripts/make-demo-project.mjs deterministic documentation demo project
scripts/ui-harness.mjs     shared Playwright server, demo project and UI helpers
scripts/smoke-ui.mjs       Playwright smoke test for open, measure, help and save
scripts/canvas-regression.mjs pointer-level canvas gesture regressions
scripts/benchmark-history.mjs synthetic undo/history benchmark
scripts/capture-docs.mjs   Playwright screenshot capture into docs/screenshots
scripts/check-docs.mjs     documentation link, image, anchor and schema checks
scripts/docs-fingerprint.mjs UI fingerprint for screenshot staleness checks
```

When adding a project field, update `src/model/types.ts`, the normalizer in `src/io/projectFile.ts`, serialization/migration tests, and `README.md`.

When adding a layer or item operation, put lock and visibility semantics in `src/model/commands.ts` and keep the App, canvas, layer list, inspector and export call sites aligned.

## Testing and fixtures

- `npm test -- --run` runs the Vitest suite.
- `npm run test:ui` runs the Playwright smoke test against the browser fallback.
- `npm run test:canvas` runs pointer-level canvas regressions for draw, resize, rotate, text, hidden/locked items and crop.
- `npm run bench:history` runs the synthetic undo/history benchmark. Use `GRIDSCALR_BENCH_ITEMS=5000` for a larger project.
- `npm run format:check` verifies Prettier formatting for source, tests and scripts. Use `npm run format` to apply it.
- `npm run check:docs` validates documentation links, anchors, images, tool coverage, schema references and screenshot freshness. Set `GRIDSCALR_DOCS_STRICT=1` to turn stale screenshots into an error.
- `npm run docs:demo` regenerates `fixtures/demo-project.gridscalr`.
- `npx playwright install chromium` installs the browser once for `test:ui` and `docs:capture`.
- `npm run docs:capture` regenerates `docs/screenshots/` and its manifest with Playwright. Run it after a visible UI change.
- `npm run fixture` regenerates `fixtures/industrial-plan.pdf` from `scripts/make-industrial-fixture.mjs`.
- The industrial sample has three A3 landscape pages: ground floor at 1:100, mezzanine at 1:50, and site plan at 1:400. Page 1 contains a 10.00 m calibration dimension.
- `npm run fixture:legacy` regenerates the older A4 `fixtures/sample-plan.pdf`; it is kept for the historical Etapp 3 checklist only.
- Browser-only development (`npm run dev`) is a UI fallback. Native file paths and recents require Tauri.
- Do not delete `tests/` fixtures or generated sample files without checking whether tests depend on them.

## Etapp status

- **Etapp 1:** complete — layers, target layer, per-item visibility/lock, multi-select, group move, bulk edits, clipboard, context menus.
- **Etapp 2A:** complete — categories, rooms, default category, schema v3 and migration, the count tool, deduction areas, quantities, and measurement bulk edits.
- **Etapp 2B:** complete — waste, rounding, order quantities, CSV and print-friendly quantity reports.
- **Etapp 3:** complete — 3A added quick areas, manual scale/lock, and markup snapping; 3B added the drawing export dialog, crop areas, and legend.
- **Etapp 4:** complete — embedded PNG/JPEG images, background/annotation modes, image handles, opacity/rotation, schema v5, and image-aware PDF export.
- **Etapp 5:** complete — TIF import as documents, lossless CCITT G3/G4 passthrough, multiple documents per project, append-only pages, schema v6.
- **0.4.1:** complete — Markups tool-rail button and `Ctrl/Cmd+L`, focused zoom to a selected markup, the dedicated Markups tint, and removal of the redundant local-only status.
- **0.5.0:** complete — configurable Markups columns, project-stored views, category/page/type/search filters, multi-level grouping with building/floor/room hierarchy, and page-location labels.
- **0.6.0:** complete — the built-in vector symbol library, category colour coding, rotation, inspection statuses, Markups symbol/status views and CSV fields. Current schema is v13.
- **0.6.1:** complete — all 52 built-in facilities symbols are redrawn as original classic sign plates with filled vector pictograms, category-coloured plates, a 24 pt default size and a white-ringed status badge. No schema change; the schema remains v13.
- **Unreleased:** stamp and symbol corner resizing, schema 14 with optional `symbolSize` on facility symbols (missing means 24 pt), context-aware markup focus zoom, and the page scale moved from Properties to the status bar.
- XLSX is deferred until CSV proves insufficient.

Update the status in `docs/plan/roadmap-etapper.md` when an Etapp is completed.

## Start-of-session checklist

1. Read `AGENTS.md`, `README.md`, `docs/user-guide.md`, `docs/workflows.md`, `docs/shortcuts.md`, and the relevant plan.
2. Run `git status` and check that the working tree is not carrying unexplained changes.
3. Run `gh auth status` if GitHub operations are needed.
4. Check the latest CI status with `gh run list --repo MajorJohnDoe/gridscalr`.
5. Confirm which Etapp or fix is in scope before editing.
6. Make the smallest coherent change, run the checks, update the in-app documentation, commit, push, and verify CI.

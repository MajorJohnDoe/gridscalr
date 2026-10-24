# AGENTS.md

Persistent working instructions for agents and maintainers of GridScalr. Read this file first, then `README.md` and the plans in `docs/plan/`.

## Project

- GridScalr is a local-first Tauri 2 desktop app for measuring PDF drawings and producing procurement quantities.
- Frontend: TypeScript, HTML5 Canvas, PDF.js, Vite. No UI framework.
- Desktop shell: Rust/Tauri 2.
- Repository: `https://github.com/MajorJohnDoe/gridscalr` (private).
- Current app version: `0.2.0`.
- Current project-file schema: `6`.
- Etapp 1, Etapp 2, Etapp 3 and Etapp 4 are complete. Etapp 2A added categories, rooms, the count tool, deduction areas, the quantities panel, and measurement bulk edits. Etapp 2B added waste, rounding, order quantities, and quantity CSV/PDF reports. Etapp 3A added quick areas, manual scale, per-page scale locks, and markup snapping. Etapp 3B added the drawing export dialog with page ranges, crop areas, layer selection, labels, calibration, and a legend. Etapp 4 added embedded PNG/JPEG images, background and annotation modes, image handles, opacity, rotation, and image-aware PDF export. Etapp 5 added scanned TIF import as lossless CCITT G3/G4 pages, multiple source documents per project, append-only page numbering, and schema v6.

## Read before changing code

1. `README.md` — user-facing behaviour, architecture, shortcuts, and file format.
2. `docs/user-guide.md` — the in-app user guide. Keep it accurate whenever the GUI or a user-facing workflow changes.
3. `docs/shortcuts.md` — the in-app shortcut reference.
4. `docs/plan/roadmap-etapper.md` — Etapp 1–5 scope, product invariants, and open decisions.
5. `docs/plan/etapp-2-mangddata.md` — detailed Etapp 2A/2B plan.
6. `docs/plan/etapp-3-matverktyg-skala-export.md` — approved Etapp 3A/3B plan.
7. `docs/plan/etapp-4-bilder.md` — approved Etapp 4 plan and image decisions.
8. `docs/plan/etapp-5-tiff.md` — approved Etapp 5 plan, TIF decisions, and S1 results.
9. The relevant source and tests for the area being changed.

If a plan and the code disagree, stop and surface the conflict rather than silently choosing one.

## Non-negotiable product rules

- The app is local-first. Never overwrite the source PDF. Reference it by path plus SHA-256.
- Hidden items must not render, hit-test, or export.
- Hidden layers behave like hidden items. Layer visibility/locking takes precedence over per-item flags.
- Locked items stay visible and exportable but cannot be moved, edited, or deleted.
- Measurement layers and drawing layers stay separate. Layers are `measure` or `draw`.
- One bulk action must be one undo step.
- Project files must remain backward compatible. Every schema change needs migration tests for the current and previous version.
- Pages are append-only. New documents add pages after the existing ones; never insert, reorder, or delete pages, because measurements reference page numbers.
- Derived quantities and summaries are calculated from item data, never stored as separate sources of truth.
- Exports must use the same visibility and locking rules as the canvas.
- Do not add cloud sync, accounts, telemetry, or network dependencies without an explicit decision.

## Documentation requirement (non-negotiable)

Every change to the GUI, menu structure, shortcuts, or user-facing behaviour must update the in-app documentation in the same commit.

- Update `docs/user-guide.md` for any new feature, renamed command, moved panel, changed menu path, or changed workflow.
- Update `docs/shortcuts.md` and the README shortcut table whenever a keyboard shortcut is added, removed, or changed.
- Update `README.md` when navigation, menus, panels, exports, or the architecture map change.
- Keep `Help → About` accurate. The version is read from `package.json`; do not hardcode it in help content.
- Documentation-only changes do not need the full build, but links and instructions must remain correct.
- Do not report a GUI change as complete while the user guide describes the previous interface.

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

Before committing a GUI or feature change, confirm that:

- `docs/user-guide.md` describes the current menus, panels, and workflow.
- `docs/shortcuts.md` and the README shortcut table include every shortcut that changed.
- `README.md` highlights, workflow, and architecture map still match the code.
- `Help → About` still reports the version from `package.json`.

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
2. Run the checks above.
3. Commit and push.
4. Tag the commit with `vX.Y.Z` and push the tag:

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
src/app/App.ts             app wiring, file flows, shortcuts, export actions
src/canvas/CanvasView.ts   rendering, hit testing, inline editing, resize/rotate, PNG composition
src/model/                 types, geometry, labels, units, calibration, layers, images, metrics, selection, clipboard
src/state/store.ts         immutable snapshots, undo/redo, multi-selection, autosave
src/pdf/pdfRenderer.ts     PDF.js lifecycle and progressive page rendering
src/pdf/pdfExport.ts       flattened vector PDF export
src/pdf/reportPdf.ts       print-friendly A4 quantity report
src/report/                pure report model and CSV serialization
src/ui/                    shell, top menu, sidebar, page/layer lists, inspector, dialogs, status bar
src/ui/topMenu.ts          File/Edit/View/Settings/Help menu and keyboard navigation
src/ui/helpDialog.ts       bundled Markdown help and About dialog
src/ui/settingsDialog.ts   project units, snapping, quantity defaults
src/help/markdown.ts       safe Markdown renderer for bundled help
src/help/content.ts        raw imports of docs/user-guide.md and docs/shortcuts.md
src/io/projectFile.ts      schema normalization, migration, serialization, relative paths
src/io/imageIngest.ts      PNG/JPEG validation, downscaling, embedded data URLs
src/io/tiff.ts             TIFF IFD parsing, DPI, orientation, strip layout
src/io/tiffImport.ts       lossless CCITT G3/G4 to PDF, embedded document refs
src/model/documents.ts     page to document mapping and append-only helpers
src/io/platform.ts         Tauri/browser file I/O, dialogs, recents, hashing entry point
src-tauri/src/commands.rs  atomic file writes and path checks
docs/user-guide.md         in-app user guide
docs/shortcuts.md          in-app shortcut reference
tests/                     model, project-file, hit-test, selection, TIFF, PDF, and Markdown tests
fixtures/tiff/             small G4/LZW TIFF fixtures for the reader tests
```

When adding a project field, update `src/model/types.ts`, the normalizer in `src/io/projectFile.ts`, serialization/migration tests, and `README.md`.

When adding a layer or item operation, keep lock and visibility guards aligned in `src/state/store.ts`, `src/canvas/CanvasView.ts`, `src/ui/layerList.ts`, `src/ui/panels.ts`, and export code.

## Testing and fixtures

- `npm test -- --run` runs the Vitest suite.
- `npm run fixture` regenerates `fixtures/sample-plan.pdf` from `scripts/make-fixture.mjs`.
- The sample PDF has two A4 landscape pages; page 1 contains a 10.00 m calibration dimension.
- Browser-only development (`npm run dev`) is a UI fallback. Native file paths and recents require Tauri.
- Do not delete `tests/` fixtures or generated sample files without checking whether tests depend on them.

## Etapp status

- **Etapp 1:** complete — layers, target layer, per-item visibility/lock, multi-select, group move, bulk edits, clipboard, context menus.
- **Etapp 2A:** complete — categories, rooms, default category, schema v3 and migration, the count tool, deduction areas, quantities, and measurement bulk edits.
- **Etapp 2B:** complete — waste, rounding, order quantities, CSV and print-friendly quantity reports.
- **Etapp 3:** complete — 3A added quick areas, manual scale/lock, and markup snapping; 3B added the drawing export dialog, crop areas, and legend.
- **Etapp 4:** complete — embedded PNG/JPEG images, background/annotation modes, image handles, opacity/rotation, schema v5, and image-aware PDF export.
- **Etapp 5:** complete — TIF import as documents, lossless CCITT G3/G4 passthrough, multiple documents per project, append-only pages, schema v6.
- XLSX is deferred until CSV proves insufficient.

Update the status in `docs/plan/roadmap-etapper.md` when an Etapp is completed.

## Start-of-session checklist

1. Read `AGENTS.md`, `README.md`, `docs/user-guide.md`, `docs/shortcuts.md`, and the relevant plan.
2. Run `git status` and check that the working tree is not carrying unexplained changes.
3. Run `gh auth status` if GitHub operations are needed.
4. Check the latest CI status with `gh run list --repo MajorJohnDoe/gridscalr`.
5. Confirm which Etapp or fix is in scope before editing.
6. Make the smallest coherent change, run the checks, update the in-app documentation, commit, push, and verify CI.

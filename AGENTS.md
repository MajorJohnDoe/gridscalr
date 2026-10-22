# AGENTS.md

Persistent working instructions for agents and maintainers of GridScalr. Read this file first, then `README.md` and the plans in `docs/plan/`.

## Project

- GridScalr is a local-first Tauri 2 desktop app for measuring PDF drawings and producing procurement quantities.
- Frontend: TypeScript, HTML5 Canvas, PDF.js, Vite. No UI framework.
- Desktop shell: Rust/Tauri 2.
- Repository: `https://github.com/MajorJohnDoe/gridscalr` (private).
- Current app version: `0.1.0`.
- Current project-file schema: `3`.
- Etapp 1 is complete. Etapp 2A is in progress: categories, rooms, the count tool, deduction areas, and the quantities panel are implemented; bulk edits and polish remain.

## Read before changing code

1. `README.md` — user-facing behaviour, architecture, shortcuts, and file format.
2. `docs/plan/roadmap-etapper.md` — Etapp 1–4 scope, product invariants, and open decisions.
3. `docs/plan/etapp-2-mangddata.md` — detailed Etapp 2A/2B plan.
4. The relevant source and tests for the area being changed.

If a plan and the code disagree, stop and surface the conflict rather than silently choosing one.

## Non-negotiable product rules

- The app is local-first. Never overwrite the source PDF. Reference it by path plus SHA-256.
- Hidden items must not render, hit-test, or export.
- Hidden layers behave like hidden items. Layer visibility/locking takes precedence over per-item flags.
- Locked items stay visible and exportable but cannot be moved, edited, or deleted.
- Measurement layers and drawing layers stay separate. Layers are `measure` or `draw`.
- One bulk action must be one undo step.
- Project files must remain backward compatible. Every schema change needs migration tests for the current and previous version.
- Derived quantities and summaries are calculated from item data, never stored as separate sources of truth.
- Exports must use the same visibility and locking rules as the canvas.
- Do not add cloud sync, accounts, telemetry, or network dependencies without an explicit decision.

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
src/model/                 types, geometry, labels, units, calibration, layers, metrics, selection, clipboard
src/state/store.ts         immutable snapshots, undo/redo, multi-selection, autosave
src/pdf/pdfRenderer.ts     PDF.js lifecycle and progressive page rendering
src/pdf/pdfExport.ts       flattened vector PDF export
src/ui/                    shell, tool rail, panels, inspector, dialogs, status bar
src/io/projectFile.ts      schema normalization, migration, serialization, relative paths
src/io/platform.ts         Tauri/browser file I/O, dialogs, recents, hashing entry point
src-tauri/src/commands.rs  atomic file writes and path checks
tests/                     model, project-file, hit-test, selection, and PDF tests
```

When adding a project field, update `src/model/types.ts`, the normalizer in `src/io/projectFile.ts`, serialization/migration tests, and `README.md`.

When adding a layer or item operation, keep lock and visibility guards aligned in `src/state/store.ts`, `src/canvas/CanvasView.ts`, `src/ui/panels.ts`, and export code.

## Testing and fixtures

- `npm test -- --run` runs the Vitest suite.
- `npm run fixture` regenerates `fixtures/sample-plan.pdf` from `scripts/make-fixture.mjs`.
- The sample PDF has two A4 landscape pages; page 1 contains a 10.00 m calibration dimension.
- Browser-only development (`npm run dev`) is a UI fallback. Native file paths and recents require Tauri.
- Do not delete `tests/` fixtures or generated sample files without checking whether tests depend on them.

## Etapp status

- **Etapp 1:** complete — layers, target layer, per-item visibility/lock, multi-select, group move, bulk edits, clipboard, context menus.
- **Etapp 2A:** in progress — categories, rooms, default category, schema v3 and migration, the count tool, deduction areas, and quantities are implemented; bulk edits and polish remain.
- **Etapp 2B:** planned — waste, rounding, CSV and print-friendly quantity reports.
- **Etapp 3:** planned — quick area tools, manual scale/lock, snapping, drawing-export dialog.
- **Etapp 4:** planned — image objects and image-aware PDF export.
- XLSX is deferred until CSV proves insufficient.

Update the status in `docs/plan/roadmap-etapper.md` when an Etapp is completed.

## Start-of-session checklist

1. Read `AGENTS.md`, `README.md`, and the relevant plan.
2. Run `git status` and check that the working tree is not carrying unexplained changes.
3. Run `gh auth status` if GitHub operations are needed.
4. Check the latest CI status with `gh run list --repo MajorJohnDoe/gridscalr`.
5. Confirm which Etapp or fix is in scope before editing.
6. Make the smallest coherent change, run the checks, commit, push, and verify CI.

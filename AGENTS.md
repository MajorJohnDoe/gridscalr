# AGENTS.md

Persistent working instructions for agents and maintainers of GridScalr. Read this file first, then `README.md` and `docs/roadmap.md`.

## Project

- GridScalr is a local-first Tauri 2 desktop app for measuring PDF drawings and producing procurement quantities.
- Frontend: TypeScript, HTML5 Canvas, PDF.js, Vite. No UI framework.
- Desktop shell: Rust/Tauri 2.
- Repository: `https://github.com/MajorJohnDoe/gridscalr` (public).
- Current app version: `0.25.0`.
- Latest public release: `v0.25.0` (2026-11-12).
- Current project-file schema: `26`.
- 1.0 is a quality gate, not a schedule: Windows, macOS and Linux artifacts; English and Swedish UI; portable `.gridscalr.zip` packages; tested large-project performance; production-ready save, recovery and source handling. See `docs/roadmap.md` and `docs/adr/`.
- Milestones 1–5 are complete. Milestone 2A added categories, rooms, the count tool, deduction areas, the quantities panel, and measurement bulk edits. Milestone 2B added waste, rounding, order quantities, and quantity CSV/PDF reports. Milestone 3A added quick areas, manual scale, per-page scale locks, and markup snapping. Milestone 3B added the drawing export dialog with page ranges, crop areas, layer selection, labels, calibration, and a legend. Milestone 4 added embedded PNG/JPEG images, background and annotation modes, image handles, opacity, rotation, and image-aware PDF export. Milestone 5 added scanned TIF import as lossless CCITT G3/G4 pages, multiple source documents per project, append-only page numbering, and schema v6.
- `App.ts` and `CanvasView.ts` are integration points, not implementation sites. New user-facing features live under `src/features/<feature>/`; see `docs/adr/0001-feature-modules.md`. A pull request that adds more than roughly 50–100 lines of new business logic to either integration file must justify it or extract a module.

## Read before changing code

1. `README.md` — the public landing page and the pointers to the detailed docs.
2. `docs/user-guide.md` — the in-app user guide. Keep it accurate whenever the GUI or a user-facing workflow changes.
3. `docs/workflows.md` — task-oriented guides for operations technicians and technical property managers.
4. `docs/shortcuts.md` — the in-app shortcut reference.
5. `docs/screenshots/manifest.json`, the referenced screenshots and the `theme-*.png` showcase used by the README and site — regenerate with `npm run docs:capture` when a visible screen or theme changes.
6. `docs/roadmap.md` — current status, foundation workstreams, the 1.0 quality gate, backlog and open decisions.
7. `docs/plan/archive/` — historical planning documents from milestones 2–5. Written in Swedish; not maintained.
8. `docs/architecture.md` and `docs/adr/` — source map, design choices and accepted architecture decisions.
9. `docs/project-file.md` — the `.gridscalr` format and schema history.
10. `docs/limitations.md` — known gaps that must not be regressed.
11. `docs/security-policy.md` — the desktop CSP, capability and worker policy; change it together with `security/policy.json`.
12. `docs/releasing.md` — the manual release checklist.
13. The relevant source and tests for the area being changed.

If a plan and the code disagree, stop and surface the conflict rather than silently choosing one.

## Non-negotiable product rules

- The app is local-first. Never overwrite the source PDF. Reference it by path plus SHA-256 through the current reference mode or, from schema 25, an explicit managed-copy mode. Never base64-embed an ordinary PDF in the project JSON.
- Hidden items must not render, hit-test, or export.
- Hidden layers behave like hidden items. Layer visibility/locking takes precedence over per-item flags.
- Locked items stay visible and exportable but cannot be moved, edited, or deleted.
- A layer may carry an optional `parentId` (schema 26). Effective visibility is the layer's own visibility AND every ancestor's on that page; effective locking is the layer's own locking OR any ancestor's. A hidden group must not render, hit-test or export; a locked group stays visible and exportable but cannot be edited.
- Deleting a layer deletes its whole subtree after an explicit confirmation that names the child and item counts. A page deletion keeps a group while any descendant is still referenced, and never leaves a child pointing at a removed parent.
- A layer hierarchy reference is reported, never silently dropped or reparented. A missing parent, a cycle and a cross-kind link are validator issues for the project doctor.
- Measurement layers and drawing layers stay separate. Layers are `measure` or `draw`.
- One bulk action must be one undo step.
- Page reorder and page insert must each be one undo step, preserving every
  `PageId` and page state. Page delete, page duplicate, document import and
  source replacement stay explicit, non-undoable and checkpointed.
- Project files must remain backward compatible. Every schema change needs migration tests for the current and previous version.
- Pages have stable IDs from schema 24 onward. `Project.pages` is the ordered page list; page numbers are display data. Every new persistent page reference uses `PageId`.
- Imports append by default. Insert, reorder, duplicate, delete and source replacement are explicit, tested operations that cascade by page ID.
- Deleting a page is an explicit structural action, not an undoable edit. It must delete that page's items, page state and layer membership by page ID, keep the remaining page references valid, and resync the PDF renderer. A project may have zero pages. Source files are never modified.
- Derived quantities and summaries are calculated from item data, never stored as separate sources of truth.
- Exports must use the same visibility and locking rules as the canvas.
- Invalid or missing colours must never render or export as black. Fall back to the layer or item default.
- Do not add cloud sync, accounts, telemetry, or network dependencies without an explicit decision.

## Data integrity and concurrent editing

These rules protect the project file as the source of truth. They are accepted
but not fully implemented yet; the phases are in
`docs/plan/robustness.md`. Until a phase lands, do not deepen the gap: no new
unconditional project writes, no new persistent page-number references, and no
new source-storage mode.

- Every project save is a conditional write against the file version the editor
  loaded. Never overwrite a file that changed on disk without explicit
  confirmation.
- A conflict preserves both versions. The default is **Save as conflicted copy**,
  never a silent overwrite.
- Every persistent entity has a stable, unique ID. Never use array indexes or
  display page numbers as persistent references.
- Page identity is independent of page order. Imports append by default, but
  insert, reorder, duplicate, delete and source replacement are explicit, tested
  operations that cascade by page ID.
- A project may have zero pages. Empty is a valid state, not a corrupt file.
- Autosave is scoped to one project identity and one base file version. Never
  restore an autosave over a changed disk file.
- Validate project invariants before saving and after loading. Do not silently
  drop user data.
- Structural operations write a recovery checkpoint and stay explicit.
- A sidecar lock is advisory. It may warn, but it is never the safety mechanism.
- Source storage is explicit: reference, managed copy or package. Never
  base64-embed ordinary PDFs in the project JSON.
- Tests are required for concurrent save, crash during save, migration from the
  previous schema, and page delete/import/reorder/replace invariants.

See [`docs/adr/0010-project-file-integrity.md`](docs/adr/0010-project-file-integrity.md),
[`docs/adr/0011-page-list-and-source-replacement.md`](docs/adr/0011-page-list-and-source-replacement.md)
and [`docs/adr/0012-source-storage-modes.md`](docs/adr/0012-source-storage-modes.md).
The phased work is in [`docs/plan/robustness.md`](docs/plan/robustness.md).

## Module-first foundation work

The foundation phases follow [ADR 0013](docs/adr/0013-module-first-foundation.md).
The rule exists because adding logic to a large integration file is cheaper in
the short term and much more expensive later.

- Every new foundation feature lives in `src/features/<area>/` and has an
  `index.ts` public surface. Other modules import only that surface.
- Separate pure model, controller, UI and IO responsibilities. Do not create a
  `utils.ts` or `helpers.ts` grab bag; name files by domain.
- New files target 300 lines and must not exceed 400. A new foundation feature
  directory must not exceed 400 lines per file.
- New files must not be added to `LEGACY_LARGE_FILES` or to a per-file
  `file-budgets.json` exception. `npm run check:file-budgets -- --update` may
  adjust an existing legacy budget; it refuses a new oversized file.
- `npm run check:modules` enforces the foundation feature `index.ts` and blocks
  imports into a foundation feature's internals.
- `model` must not import `ui`, `app`, `canvas`, Tauri or a feature module.
  `ui` must not contain business rules. `io` must not contain UI or model
  decisions. Shared defaults and pure catalogues live in `src/model`; ESLint and
  `tests/modelBoundary.test.ts` enforce that model code never reaches into
  `src/features`.
- New Rust commands live in a separate Rust module instead of growing
  `src-tauri/src/commands.rs`. `npm run check:file-budgets` also scans
  `src-tauri/src`: new Rust files target 300 lines and must not exceed 400, and
  an existing oversized module stays only as a reviewed `{ "max", "reason" }`
  exception in `file-budgets.json`. `--update` refuses a new oversized Rust
  file, so a command cannot be parked in a large module.
- Each foundation phase issue records its module map before production code is
  added. A new responsibility gets a new file, not a larger existing one.
- Fix an in-scope problem immediately. Record a larger or out-of-scope finding in
  [`docs/plan/foundation-findings.md`](docs/plan/foundation-findings.md), triage it
  at the phase exit and convert accepted work into an issue.
- `App.ts` and `CanvasView.ts` remain wiring only; the 50–100 line rule in ADR
  0001 still applies.

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

## Issue tracking

An issue is the unit of intent; a pull request is the unit of change.

The roadmap is a map of foundation workstreams and a 1.0 quality gate, not a
version-numbered schedule. Concrete features and fixes belong in issues; do not
grow a static TODO list in the roadmap.

- Features, user-visible bugs, schema changes, architecture changes, security
  follow-ups and refactors larger than roughly half a day get a GitHub issue.
- Small fixes, documentation links, formatting and routine dependency bumps may
  go directly to a pull request.
- Use type labels: `bug`, `enhancement`, `refactor`, `tech-debt`, `tooling`,
  `tests`, `post-release`, `dependencies`, `documentation`.
- Use milestones for release scope, not priority labels. Only work that is
  actually planned for a release belongs in its milestone; everything else
  stays in the backlog.
- Link the issue from the pull request with `Closes #N`. One pull request may
  close more than one issue when the work is genuinely one change.
- Keep the problem, scope, non-goals, acceptance criteria and decisions in the
  issue. Keep implementation detail and verification in the pull request.
- Do not add anonymous `TODO` comments. Record technical debt as an issue or a
  roadmap item.
- During a foundation phase, use
  [`docs/plan/foundation-findings.md`](docs/plan/foundation-findings.md) for
  larger findings that are out of scope or need a later decision. Fix in-scope
  problems immediately. Review the log at every phase exit and before a release;
  convert accepted entries into issues.
- Security and dependency alerts stay open until they are fixed or explicitly
  accepted. A tracking issue may reference them but must not replace them.

## Git workflow

- `main` is the integration branch and should always pass CI.
- Small fixes, documentation, and workflow changes may be committed directly to `main`.
- Larger features should use a branch such as `feat/markups-panel` or `fix/pdf-export`, followed by a pull request.
- Never force-push `main`.
- Keep commits focused. Do not mix unrelated refactors with a feature or bug fix.
- Commit messages use the imperative mood and, where useful, a Conventional Commits prefix:
  - `feat: add count measurement tool`
  - `fix: exclude hidden layers from CSV export`
  - `docs: record Milestone 2 decisions`
  - `chore: update the release workflow`
- Do not commit `node_modules/`, `dist/`, `src-tauri/target/`, `exports/`, local environment files, or credentials.
- Do not commit generated test output unless it is deliberately part of the fixture set.

### Before every commit

Verification has two tiers. The **local gate** is fast enough to run on every
commit; **CI is authoritative** and runs the full list on the exact SHA that
gets merged. Do not report a change as complete, and do not merge, until that
full CI run is green.

The local gate (target: under two minutes):

```bash
npm run check:versions
npm run check:file-budgets
npm run check:modules
npm run check:security
npm run check:dependencies
npm run check:docs
npm run format:check
npm run lint
npm run check:i18n
npm run check:themes
npx tsc --noEmit
npx vitest run <the test files the change touches or can break>
```

Add what the change actually affects:

- project file, schema, page, source or package changes: the focused migration,
  round-trip and invariant tests, locally;
- save, lease or recovery changes: `tests/robustness/`;
- Rust changes: `cargo fmt --check`, `cargo check` and
  `cargo test --lib`;
- rendered or interaction changes: `npm run test:visual`, and the matching
  browser suite (`test:ui`, `test:import`, `test:canvas`, `test:count`,
  `test:touch`, `test:csp`);
- desktop shell changes: `npm run tauri build -- --no-bundle` once, before the
  push rather than after every intermediate fix;
- a captured screen changed: `npm run docs:capture`.

`.github/workflows/ci.yml` remains the full list: every check above, the whole
`npm test -- --run` suite, `npm run build`, the Rust build and tests, and the
`desktop` job on Ubuntu, Windows and macOS. Because CI runs all of it on the PR
head, running the same heavyweight suites locally on every commit duplicates
work without adding a guarantee.

A docs-only change does not need the full build, but it must not leave broken
links or contradictory instructions.

Before committing, confirm that:

- `docs/shortcuts.md` and the README shortcut table include every shortcut that changed.
- `README.md` highlights, workflow, and architecture map still match the code.
- `Help → About` still reports the version from `package.json`.

For changes that touch saving, pages, source documents or project loading, also
confirm:

- the save is conditional and cannot silently overwrite a changed file;
- every new persistent reference uses a stable ID;
- page insert, delete, reorder, import or replacement has an invariant test;
- a schema change has a migration fixture for the previous schema;
- a source drawing is never written by the new path;
- planned conflict, page-order or source-storage behavior is not described as
  shipped;
- new out-of-scope findings are recorded in
  `docs/plan/foundation-findings.md` and the log is reviewed at the phase exit.

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

## Multi-issue conductor workflow

Use this workflow when a request spans more than two issues, includes a schema
change, or is expected to take more than about one day. It keeps the conductor
context small and makes every phase independently reviewable.

The reusable prompts live in
[`docs/plan/conductor-prompt.md`](plan/conductor-prompt.md).

- **Epic and milestone.** A multi-issue effort gets one epic issue and one
  release milestone. The epic lists the ordered phases, the issue for each
  phase and the exit criteria.
- **One phase = one issue.** Every phase states problem, scope, non-goals and
  acceptance criteria. Foundation work records its module map in the issue
  before production code is written.
- **The conductor does not implement.** It coordinates, verifies and merges.
  One fresh `general` subagent handles one phase. Never reuse a child session
  for a different issue. A split phase is explicit, for example 10a/10b.
- **One PR per phase.** The worker reads `AGENTS.md`, the plan and ADRs, the
  phase issue and the relevant docs; creates a branch; implements; adds tests
  and documentation; runs the full check list; pushes; opens a PR linked to the
  issue; updates the handover; and returns only the structured result.
- **Defensive review.** The conductor treats the worker report as a claim.
  Before merging it verifies that the PR head SHA equals the reported commit,
  every required check passes on that exact SHA, the PR targets `main` and is
  mergeable, the file list matches the phase scope, and the acceptance criteria
  are present. For schema, save, page, source or package changes it re-runs the
  focused local test. If the head SHA changes, verification starts again. Merge
  only after this pass.
- **Schema change gate.** When a phase changes `SCHEMA_VERSION`, the worker must
  add a deterministic migration from the previous schema, a committed fixture
  for the previous schema, coverage for every older supported schema,
  round-trip and determinism tests, and a test that invalid references are
  reported rather than silently dropped. `docs/project-file.md`, `README.md`
  and the schema line in this file are updated in the same change. The
  migration tests must be present and green in the PR. An unsafe or untested
  migration is a stop condition.
- **Handover.** Update `docs/plan/<effort>-handover.md` after every phase with
  the phase, issue, PR, commit, completed work, modules, decisions, findings,
  checks and next phase. Update the epic checklist after each merge.
- **Context policy.** Keep the conductor context to phase status, PR links,
  short summaries and the handover file. Do not paste full diffs or full test
  logs into the conductor context.
- **Stop conditions.** Stop for an explicit user stop, a blocked worker, CI that
  cannot be made green, an unsafe migration, a missing product decision, a P0
  finding, or two runs touching the same branch or PR. Never start a phase with
  uncommitted changes or failing CI.

## Versioning and releases

App versions follow [Semantic Versioning](https://semver.org/). The app is still pre-1.0, so minor versions may contain planned Milestone features and patch versions are fixes.

The app version must match in all three files:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

After changing the Rust crate version, run `cargo check` and commit the resulting `src-tauri/Cargo.lock` change.

The project-file `schemaVersion` is independent of the app version. Do not bump the schema merely because the app version changes.

Do not create or push a release tag, publish a GitHub Release, or bump the version for a release without explicit approval. Routine feature work does not need a version bump.

To create a Windows release build:

1. Update the three app-version fields and create or update
   `docs/release-notes/<version>.md`.
2. Run the documentation pass: update `docs/user-guide.md` and `docs/workflows.md`,
   run `npm run docs:capture` (this also regenerates the five `theme-*.png`
   images used by the README and the landing site), and verify with
   `GRIDSCALR_DOCS_STRICT=1 npm run check:docs`.
3. Run the checks above.
4. Commit and push.
5. Tag the commit with `vX.Y.Z` and push the tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The `Release build` workflow runs on `v*` tags and can also be started manually. It builds Windows, macOS and Linux in one matrix and uploads `gridscalr-windows`, `gridscalr-macos`, `gridscalr-linux` and a merged `gridscalr-checksums` artifact. Releases are published manually from those artifacts with `gh release create`; follow `docs/releasing.md`. Do not add an automatic release job without an explicit decision.

Every tagged release must also update the landing site. Update `site/release.json`
with the published version, date, release URL, release notes URL and asset URLs,
then run `npm run site:build` and `npm run site:check`. The site must never name a
version that is not published. Commit and push `main`, and confirm that the
**Pages** workflow deployed successfully. Ordinary pull requests and commits that
do not change the released version must not change the version shown on the site.

## CI and build hosts

- `.github/workflows/ci.yml` runs the dependency advisory gate, lint, frontend tests/build and Rust formatting, checking and unit tests on pushes and pull requests. Its `desktop` job compiles the Tauri shell on Ubuntu, Windows and macOS, so platform-specific code is checked before a tag exists.
- CI keeps one authoritative run per branch: the `concurrency` group with `cancel-in-progress` cancels a superseded run when a branch is rebased or re-pushed, so a phase cannot accumulate competing runs. Every job has a `timeout-minutes` cap.
- The system-package and Playwright installation steps retry three times with a five-minute cap per attempt. A failure there is a **runner or mirror problem, not a code failure**: re-run the job, and if it repeats, record an environment finding instead of changing code to chase it. Changing application code to satisfy a broken package mirror has happened once and cost hours.
- `.github/workflows/release.yml` builds the Windows `.exe`, NSIS installer and MSI; the universal macOS DMG and `.app.zip`; and the Linux AppImage, `.deb` and `.tar.gz`, then merges the per-platform checksums. It runs on manual dispatch or `v*` tags. Its build jobs depend on the same dependency advisory gate.
- The Linux build host produces a Linux binary, not a Windows `.exe`. Use the `Release build` workflow for Windows and macOS artifacts.
- GitHub CLI is available in the development environment. Authentication is stored outside the repository; never copy tokens into committed files.
- If GitHub rejects a push because the OAuth token lacks a scope, refresh it with `gh auth refresh -h github.com -s workflow` when adding or changing workflow files.

## Architecture map

```text
src/app/App.ts             app wiring, file flows, shortcuts
src/app/clipboardPaste.ts  clipboard image and item paste entry point
src/app/pageZoomGuard.ts   suppresses WebView2 page zoom for Ctrl + wheel and pinch
src/app/referenceController.ts reference pane, comparison session and comparison PDF lifecycle
src/app/exportFlows.ts     CSV, XLSX, PDF, PNG and JSON export orchestration
src/app/selectionActions.ts selection, bulk edits and item commands
src/app/documentImport.ts  PDF/TIF import, password retries and checksum checks
src/app/searchController.ts search panel, text index and OCR run loop
src/app/openTarget.ts      shared PDF/TIF/project drop classification re-export
src/app/droppedDrawingFlows.ts Pages-panel PDF/TIF drop through import preflight and one-step commit
src/app/pageDropSetup.ts   Pages-panel file-drop controller wiring
src/app/sheetFlows.ts      sheet creation, add-page and paper changes
src/app/imageFlows.ts      image insertion and target-layer selection
src/app/documentFlows.ts   PDF/TIF/project loading and page selection
src/app/pageFlows.ts       page navigation, duplicate/delete and project reset
src/app/scaleFlows.ts      calibration, manual scale and fit-to-area actions
src/app/packageFlows.ts    package host adapter and packaged-project opening
src/app/projectImportFlows.ts project page import, preflight, provenance and history-aware commit
src/app/projectImportSource.ts source project document loading, previews and missing-file recovery
src/app/projectDoctorFlows.ts project doctor and load-report wiring
src/app/rendererDocuments.ts renderer/proxy cache that keeps import undo and redo instant
src/app/rendererSync.ts    single store listener that derives renderer page order and document reconcile
src/app/diagnosticsFlows.ts diagnostics text, copy and report flow
src/i18n/locales/*.json    message catalogs; en.json is the source and fallback
src/i18n/registry.ts       SUPPORTED_LOCALES descriptors, locale matching and pseudo-locale
src/i18n/types.generated.ts generated MessageKey and MessageCatalog from en.json
src/i18n/format.ts         locale-aware number, date and localized-number formatting
src/i18n/index.ts          catalog loading, ICU translation, language state and t()
src/features/              feature modules; see docs/adr/0001-feature-modules.md
src/features/countTypes/index.ts public surface for the count-type management dialog
src/features/countTypes/ui.ts count-type management dialog
src/features/projectPackage/model.ts package manifest, safe names and portable project paths
src/features/projectPackage/controller.ts package and open-package flows
src/features/projectPackage/ui.ts package dialogs and progress UI
src/features/projectPackage/ipc.ts package command wrappers
src/features/projectImport/model.ts source-page inspection, import planning and commit
src/features/projectImport/merge.ts category, count-type, line-type, asset and document merge helpers
src/features/projectImport/preflight.ts import counts, missing files and checksum warnings
src/features/projectImport/relink.ts per-document preflight state, relink blocking rules and snapshot summary
src/features/projectImport/preflightUi.ts localized preflight dialog with source relink and explicit mismatch confirmation
src/features/projectImport/ui.ts graphical source-page picker with lazy previews
src/features/pageFileDrop/model.ts Pages-panel drop target classification and pointer rules
src/features/pageFileDrop/controller.ts Pages-panel PDF/TIF drop listeners and shared insertion line
src/features/pageStatus/ pure page badges and status filters derived from project and source state
src/features/pageMenu/ page card menu, insert and move targets, page keyboard commands
src/features/listInteraction/ shared list selection, drag controller, drop line, keyboard move, filter and collapse rules
src/features/importProvenance/ read-only provenance summary, Properties block and conditional Markups column
src/features/projectIntegrity/ public surface, referential-integrity validation, repairs, project doctor and load report
src/features/projectIntegrity/repair.ts explicit duplicate-ID, dangling-reference and stale-OCR repairs
src/features/projectIntegrity/doctor.ts doctor loop, load-report decision, source section wiring and path-free diagnostics
src/features/projectIntegrity/ui.ts localized doctor, issue list, repair controls and source section
src/features/projectIntegrity/sourceModel.ts pure source-availability snapshot and referenced/orphan classification
src/features/projectIntegrity/sourceAvailability.ts source checks, explicit source actions and unused managed-copy deletion
src/features/projectIntegrity/sourceFiles.ts managed-copy listing and deletion IPC wrappers
src/features/projectIntegrity/sourceUi.ts localized doctor source rows, orphan selection and cleanup request
src/features/conflictedCopies/ strict discovery naming, delete guards, manager flow and dialog for conflicted copies
src/features/statusOverview/ pure project-status model, one-read controller and the status popover
src/features/viewOnly/ inspection-tool rule and the panel guard for a true view-only session
src/features/sessionRecovery/ scoped autosave, byte-budgeted recovery store, recovery center, lease takeover and external-change watcher
src/features/schematics/   operation-card templates, sheet fields, symbol catalogue surface, fit and dialogs
src/features/schematics/symbols/registry.ts localized symbol labels, search text and render-plan wrappers
src/features/schematics/model/fitDrawing.ts drawing-area bounds, overflow warning and fit action
src/features/schematics/ui/lineTypeDialog.ts project media-class editor
src/canvas/CanvasView.ts   pointer events, rendering orchestration, hit testing, inline editing, resize/rotate, PNG composition
src/canvas/itemRenderer.ts thin public entry point; delegates item drawing to canvas/items/
src/canvas/items/context.ts shared item render context, panel drawer and label helper
src/canvas/items/dispatch.ts rotation, shared canvas setup and the item-family switch
src/canvas/items/measurement.ts length, angle, slope, radius, diameter, arc, area and volume drawing
src/canvas/items/shapes.ts pen, line, arrow, rectangle, ellipse, highlight, polyline, rail and cloud shape drawing
src/canvas/items/text.ts text, textbox and rich text drawing
src/canvas/items/symbols.ts symbol artwork, free-text tags and inspection badges
src/canvas/items/images.ts embedded image drawing and opacity
src/canvas/items/annotations.ts callout, stamp, delta and cloud label drawing
src/canvas/items/counts.ts count symbols and count-type glyphs
src/canvas/items/visible.ts viewport culling and layered item iteration
src/canvas/interactionRenderer.ts selection, marquee, snap and draft overlay drawing
src/canvas/pointer/PointerController.ts pointer input, coordinate, cursor, marquee, pan, drag dispatch, wheel, space-pan, pen priority, touch navigation and long-press helpers
src/canvas/pointer/PointerHost.ts explicit CanvasView surface used by the pointer controller
src/canvas/pointer/contextMenu.ts context menus, measurement-label actions and label connections
src/canvas/pointer/contexts.ts host context builders for creation, context-menu and double-click actions
src/canvas/pointer/cursor.ts cursor selection for the current pointer state
src/canvas/pointer/draft.ts draft state and every drawing/measurement finish path
src/canvas/pointer/itemFactory.ts item creation from the current tool and style state
src/canvas/pointer/listeners.ts pointer, wheel, double-click and context-menu listener binding
src/canvas/pointer/navigation.ts pan, marquee and wheel navigation
src/canvas/pointer/wheel.ts       normalized wheel deltas and touchpad/mouse zoom sensitivity
src/canvas/pointer/primitives.ts coordinate, pointer-capture and release helpers
src/canvas/pointer/targets.ts selection and hover target resolution
src/canvas/pointer/touchInput.ts pen priority, palm rejection, touch navigation and long-press
src/canvas/pointer/creation.ts creation-tool pointer-down branches and draft start/finish
src/canvas/pointer/doubleClick.ts double-click target resolution and edit dispatch
src/canvas/pointer/drag.ts item move, vertex, label and measurement-label drag
src/canvas/pointer/transform.ts resize, group scale and rotation application
src/canvas/pointer/pointerState.ts drag, marquee and pan gesture state
src/canvas/pointer/groupHandles.ts group selection handles shared by pointer and renderer
src/canvas/symbolPath.ts   cached Path2D objects for symbol artwork
src/canvas/draftRenderer.ts draft geometry, colours and preview labels in screen space
src/canvas/touchNavigation.ts shared two-finger pan, pinch zoom and palm suppression
src/canvas/viewport.ts     pure page/screen transforms, fit, zoom and split-view synchronization
src/compare/               session reference loading, item matching and revision diff
src/search/                local PDF text-layer extraction, index, search hits and OCR
src/canvas/geometry.ts     crop, handle, rotation and colour helpers
src/canvas/selectionHandles.ts selection and rotation handles
src/canvas/annotationDraw.ts callout, stamp, cloud-label and endpoint drawing
src/canvas/crop.ts         export crop mode, overlay and toolbar
src/canvas/editors.ts      public CanvasEditorController surface
src/canvas/editors/        controller facade, text/textbox sessions, label editor and shared helpers
src/model/                 types, geometry, labels, units, calibration, layers, images, metrics, selection, clipboard
src/model/countTypes.ts    built-in count types, normalization, lookup, management and presets
src/model/integrity.ts     shared referential-integrity rules and round-trip shape comparison
src/model/layerHierarchy.ts pure layer parent links, tree order, effective visibility/lock and page-removal keep rules
src/model/commands.ts      shared item commands for visibility, locks, deletion, movement and style
src/model/markups.ts       saved Markups views, columns and grouping helpers
src/model/symbols/        symbol types, categories, sign and schematic catalogues, lookup and render plan
src/model/symbols/schematic/ stroke-only schematic symbol library, split by category
src/model/symbols/signs/  one facility-sign artwork module per category prefix
src/model/symbolTag.ts     free-text symbol tag offsets shared by canvas and PDF
src/model/richText.ts      rich text runs, wrapping, selection formatting and fallbacks
src/model/symbolPaths.ts   shared SVG path parsing and transforms for symbol artwork
src/state/store.ts         immutable snapshots, undo/redo, multi-selection, autosave
src/state/history.ts       adaptive undo-history limits from the serialized snapshot size
src/state/autosave.ts      IndexedDB recovery store with legacy localStorage fallback
src/pdf/pdfRenderer.ts     PDF.js lifecycle and progressive page rendering
src/pdf/thumbnails.ts      on-demand, cached page previews for the Pages panel
src/pdf/pdfExport.ts       flattened vector PDF export entry point and page orchestration
src/pdf/export/            options, page crop, fonts, images, geometry, labels, legend
src/pdf/export/ocg.ts      optional-content groups for exported project layers
src/pdf/export/annotations.ts review-only standard PDF annotation dictionaries
src/pdf/export/items/      measurement, shapes, text, symbols, counts, annotations and dispatch
src/pdf/reportPdf.ts       print-friendly A4 quantity report
src/pdf/comparePdf.ts      side-by-side comparison PDF with visuals and diff tables
src/report/                pure report model, shared table rows, CSV and XLSX serialization
src/ui/                    shell, top menu, sidebar, page/layer lists, inspector, dialogs, status bar
src/styles/tokens.css      theme token contract and semantic aliases
src/styles/themes/         medium-grey default, light-green, dark-grey, jade and navy palettes plus chrome overrides
src/theme/theme.ts         theme preference resolution, application and System-mode watching
public/boot-theme.js       CSP-safe pre-paint theme bootstrap
src/styles/base.css        reset, typography and shared utilities
src/styles/shell.css       top bar, docks, symbol library, canvas and welcome
src/styles/rail.css        expandable tool rail and its two-column layout
src/styles/panels.css      inspector, layers, pages, status bar and popover menu
src/styles/dialogs.css     dialogs, menus, forms, quantities and preferences
src/styles/projectImport.css project page import picker and source-document groups
src/styles/markups.css     Markups panel, revision compare and text search
src/styles/help.css        help dialog, search, TOC and image lightbox
src/styles/popovers.css    tool flyouts and measurement options
src/styles/reference.css   reference page navigation and follow-primary control
src/styles/status.css      status, storage and welcome details
src/styles/responsive.css  laptop widths and high OS scaling
src/ui/contextBar.ts       tool-specific context bar and target layer controls
src/ui/inspector.ts        Properties header, active-layer and selection sections
src/ui/measureOptions.ts   category, room, count type and area options popover
src/ui/selectionInspector.ts selection Properties dispatcher
src/ui/inspector/         selection summary, measurement, image, symbol, drawing, style and item actions
src/ui/selectionMenu.ts    shared item context menu for canvas, layers and Markups
src/ui/markupsPanel.ts     Markups public surface
src/ui/markups/            Markups state, view favourites, grouping, rows and virtualised panel
src/ui/layerList.ts        Layers panel wiring: toolbar, expansion controls, bulk bar and row loop
src/ui/layers/             layer filter and tree rows, layer row builder, bulk actions, menu, view state and tree-move wiring
src/ui/layerAction.ts      shared row icon button for Layers and Markups
src/ui/symbolLibrary.ts    searchable Signs/Schematic symbol library and recent symbols
src/ui/duplicatePageDialog.ts page name, scale and markup duplication options
src/ui/itemIcon.ts         icon lookup shared by Layers and Markups
src/ui/shortcuts.json      single source for tool and application shortcuts
src/ui/shortcuts.ts        typed shortcut maps and platform formatting
src/ui/toolDefs.ts         tool metadata, shared rail families and last-used family member
src/ui/toolFlyouts.ts      long-press/right-click variant and family panels
src/ui/statusBar.ts        page scale menu, cursor position and layer status
src/ui/splitView.ts        synchronized read-only reference pane, comparison mode and divider
src/ui/referencePane.ts    reference source selector, name and Open/Close controls
src/ui/comparePanel.ts     revision summary, filters, difference list and controls
src/ui/searchPanel.ts      floating full-text search field, progress and result list
src/ui/welcome.ts          empty-project welcome screen and recent files
src/ui/pageImportDialog.ts page picker with previews for PDF/TIF import
src/ui/topMenu.ts          File/Edit/View/Settings/Help menu and keyboard navigation
src/ui/helpDialog.ts       bundled Markdown help, search, table of contents and image lightbox
src/ui/settingsDialog.ts   settings dialog orchestrator
src/ui/settings/           project, storage, metadata, scale, units, labels, display, quantities, count types and stamps sections
src/source/sourceStatus.ts source drawing existence, size and checksum monitor
src/features/sourceStorage/  reference/managed source modes, managed copies, consolidation, relinking and the source-changed banner
src/io/projectFile/sourceStorage.ts schema 24 → 25 migration to explicit reference storage
src/app/sourceStorageHost.ts source-storage controller wiring and renderer replacement
src-tauri/src/source_copy.rs verified managed copy, source hash and folder checksum search
src-tauri/src/source_cleanup.rs managed-copy folder inventory and guarded single-file deletion
src-tauri/src/conflicted_copy.rs strict conflicted-copy discovery and single-file delete guards
src/help/markdown.ts       safe Markdown renderer for bundled help
src/help/content.ts        raw imports of the user guide, workflows and shortcuts
src/help/images.ts         bundled screenshot URLs for the help dialog
src/io/projectFile/       schema normalization, migration, serialization, relative paths
src/io/projectFile/report.ts load-report counts for dropped and repaired data
src/io/writeGuard.ts       source-path protection shared by all saves and exports
src/io/imageIngest.ts      PNG/JPEG validation, downscaling, embedded data URLs
src/io/tiff.ts             TIFF IFD parsing, DPI, orientation, strip and tile layout
src/io/tiffImport.ts       CCITT and JPEG passthrough, tiled and decoded raster to PDF
src/io/tiff/decode.ts      page validation, strip/region dispatch and PDF-ready samples
src/io/tiff/tiles.ts       tile grid composition into page bands with cropped edge tiles
src/io/tiff/jpeg.ts        JPEG-in-TIFF validation, JPEGTables composition, DCTDecode mapping
src/io/tiff/packbits.ts    PackBits strip decoding
src/io/tiff/lzw.ts         TIFF LZW strip decoding
src/io/tiff/deflate.ts     bounded Deflate strip decoding
src/io/tiff/predictor.ts   horizontal differencing (predictor 2)
src/model/documents.ts     source-document page math, included-page lists and import maps
src/model/pages.ts         PageId, PageRecord and every page resolver
src/features/pageModel/    page insert/reorder/delete/duplicate, source replacement and import mapping
src/features/layerTree/    layer tree rows, inherited state, drag/keyboard nesting, subtree duplicate, deletion plan and page-removal keep rules
src/features/saveIntegrity/backupController.ts backup listing, restore-as-copy, explicit replace and delete
src/features/saveIntegrity/backupManagerModel.ts pure backup selection and origin-warning rules
src/features/saveIntegrity/backupManagerUi.ts backup history, restore, replace and delete dialog
src/features/saveIntegrity/restoreLinks.ts pure resolution of a restored backup's relative drawing links
src/features/saveIntegrity/restoreUi.ts unresolved-drawing report with the explicit locate action
src/features/saveIntegrity/compare.ts read-only conflict comparison summary
src/io/projectFile/pages.ts schema 23 → 24 page migration and page normalization
src/model/metadata.ts      optional report metadata and logo reference normalization
src/model/annotations.ts   callout, stamp, delta, and cloud-label layout
src/model/cloud.ts         revision-cloud bezier geometry
src/model/stamps.ts        stamp preset normalization and defaults
src/io/stampDefaults.ts    global stamp presets for new projects
src/io/layerDefaults.ts    local default colours for new measurement and drawing layers
src/io/platform.ts         Tauri/browser file I/O, dialogs, recents, hashing entry point
src/io/platformError.ts    structured Rust command error codes to localized messages
src-tauri/src/commands.rs  atomic file replacement, canonical source-path checks, structured command errors and Tauri file commands
src-tauri/src/package.rs   streaming ZIP package create/inspect/extract with manifest checks
docs/user-guide.md         in-app user guide
docs/workflows.md          role-based workflows for site work and procurement
docs/shortcuts.md          in-app shortcut reference
docs/screenshots/          versioned screenshots and capture manifest
tests/                     model, project-file, hit-test, selection, TIFF, PDF, Markdown, help image, demo project, canvas geometry and autosave tests
tests/robustness/          seeded page/save sequences, competing saves, the schema 1–26 migration corpus and source-storage gates
fixtures/legacy/           committed project fixtures for every supported schema
fixtures/tiff/             small G4/LZW/PackBits/Deflate and colour TIFF fixtures for the reader and codec tests
scripts/plan-geometry.mjs  shared geometry for the industrial sample set
scripts/make-industrial-fixture.mjs reproducible three-sheet industrial PDF generator
scripts/make-fixture.mjs   legacy A4 sample generator
scripts/make-demo-project.mjs deterministic documentation demo project
scripts/make-legacy-fixtures.mjs generator for the schema 1–26 migration corpus
scripts/ui-harness.mjs     shared Playwright server, demo project and UI helpers
scripts/smoke-ui.mjs       Playwright smoke test for open, measure, help and save
scripts/canvas-regression.mjs pointer-level canvas gesture regressions
scripts/benchmark-history.mjs synthetic undo/history benchmark
scripts/symbol-catalog.mjs generated standalone schematic symbol review catalogue
scripts/capture-docs.mjs   Playwright screenshot and theme-showcase capture into docs/screenshots
scripts/check-docs.mjs     documentation link, image, anchor and schema checks
scripts/check-file-budgets.mjs blocking line budget for frontend and Rust source files
scripts/file-budget-rules.mjs pure budget scope, exception and --update rules
scripts/check-module-boundaries.mjs foundation feature index and deep-import guard
scripts/check-security-policy.mjs CSP, capability, worker and smoke-command policy guard
scripts/check-dependencies.mjs dependency and advisory gate runner
scripts/dependency-gate.mjs pure audit parsing, allowlist and threshold rules
scripts/check-versions.mjs   app-version agreement across the four version fields
scripts/csp-regression.mjs  browser CSP, PDF worker and OCR worker regression
security/policy.json       machine-checked CSP and capability justification
security/dependency-allowlist.json reviewed npm and Rust advisory exceptions with reasons and expiry
docs/security-policy.md    desktop security policy and how to change it
src-tauri/src/smoke.rs     debug-only packaged smoke-test commands
src/model/pathText.ts      shared absolute-path sanitizer for diagnostics and error copies
scripts/docs-fingerprint.mjs UI fingerprint for screenshot staleness checks
scripts/build-site.mjs     builds site-dist from site/, icons, screenshots and release metadata
scripts/check-site.mjs     link, asset, language parity, release and SEO checks for the built site
site/                      bilingual landing page and feature tour; English at /, Swedish at /sv/
site/features/index.html   English feature tour
site/sv/funktioner/index.html Swedish feature tour
site/release.json          displayed release version, date, notes URL and download asset URLs
.github/workflows/pages.yml GitHub Pages build and deploy
```

When adding a language, add `src/i18n/locales/<id>.json` and one entry in `src/i18n/registry.ts`, then run `npm run i18n:types` and `npm run i18n:report`. English must stay complete. New user-facing strings go in `en.json` and the matching catalogs, never as hard-coded UI text.

### UI text and the i18n gate

- Every user-facing string goes through `t()` with a key in `en.json` and the matching catalogs. Use `translate(locale, key, params)` only for intentionally locale-specific lookups.
- `npm run check:i18n` scans every `src` directory except `src/i18n`. It fails on quoted multi-word prose, single-word literals assigned to `textContent`, `innerText`, `title`, `placeholder`, or `aria-label`/`title`/`placeholder`, text passed directly to `el(tag, class, text)` or `option(value, text)`, template literals with prose outside `${…}`, duplicate catalog keys, missing or extra keys, empty values, placeholder drift and invalid ICU.
- `src/i18n/hardcoded-baseline.json` must stay `{}`. Do not add exceptions there. Deliberately technical English (diagnostics, package-manifest validation, Markdown/XLSX internals, developer geometry errors) is excluded by file in `TEMPLATE_EXCLUDE_FILES` in `scripts/check-i18n.mjs` with a reason.
- The gate does not scan Rust (`src-tauri`), the `index.html` boot fallback, or literal branches inside ternaries such as `cond ? "A" : "B"`; review those manually.
- A language change must relabel the open interface without a restart. Add new static chrome to `relabelShell()`/`relabelMenuBar()` or render it from `t()` on every update, and keep `document.documentElement.lang` in sync.

New logic goes in a module. `App.ts`, `CanvasView.ts` and `itemRenderer.ts` are wiring and dispatch points; `npm run check:file-budgets` blocks growth in the frontend and the Rust shell and is ratcheted down with every extraction. See ADR 0008 and `docs/plan/0.20-refactor.md`.

When adding a project field, update `src/model/types.ts`, the normalizer in `src/io/projectFile/`, serialization/migration tests, and `README.md`.

When adding a layer or item operation, put lock and visibility semantics in `src/model/commands.ts` and keep the App, canvas, layer list, inspector and export call sites aligned.

## Testing and fixtures

- `npm test -- --run` runs the Vitest suite, including viewport math, revision matching, text search, OCR conversion, XLSX package generation and project-package manifest, checksum and path rules.
- `npm run test:robustness` runs only `tests/robustness/`: seeded page-identity sequences, competing saves, the schema 1–26 migration corpus and source-storage gates. The normal suite includes these files; CI runs the focused command as a named step.
- `fixtures/legacy/` is the committed migration corpus, one fixture per schema 1–26. Regenerate schemas 1–22, `schema-23-full` through `schema-26` with `node scripts/make-legacy-fixtures.mjs`; keep the original `schema-23.gridscalr` and `schema-24.gridscalr` for the focused migration tests.
- `npm run test:ui` runs the Playwright smoke test against the browser fallback, including the desktop-only package menu state.
- `npm run test:import` drives the project page import through the browser fallback: thumbnail picker, page-scoped layers, undo, redo and source-file immutability.
- `npm run test:visual` compares four stable shell and dialog screens against the committed baselines in `tests/visual/` using the bundled Liberation Sans font; failures write actual and diff images to `visual-regression-failures/`. See `docs/testing.md` for tolerance, baseline updates and the manual visual checklist.
- `tests/fuzz.test.ts` runs deterministic, seeded fuzzing for project JSON, package manifests, archive names and document paths.
- The CI `desktop` job builds the Tauri shell on Ubuntu, Windows and macOS and runs the packaged app with `--smoke-test <dir>`. The app opens its bundled demo, loads the first PDF page through the PDF.js worker, runs the bundled OCR worker, saves to the directory, reopens it, checks the unsaved-changes prompt and exits 0/1 with `result.json`. Use the same flag locally against `src-tauri/target/debug/gridscalr` (prefix with `xvfb-run -a` on headless Linux).
- `npm run test:canvas` runs pointer-level canvas regressions for draw, resize, rotate, text, hidden/locked items, crop and split view.
- `npm run test:count` drives the count workflow through Project settings, custom type creation, placement, pieces per object, Markups count-type filtering, quantities and presets.
- `npm run test:touch` covers two-finger pan, pinch zoom and one-finger count placement in Chromium.
- `npm run test:csp` opens the demo in the browser fallback, checks the single dev policy, starts the real Tesseract worker, and proves a blob worker inherits the policy and cannot fetch a remote origin.
- `npm run check:security` compares the shipped CSP and capabilities with the reasoned record in `security/policy.json`, rejects a second page policy and inline styles, and verifies the debug-only smoke commands and worker bootstraps. See `docs/security-policy.md`.
- `npm run check:dependencies` runs `npm audit` and `cargo audit` and applies the reviewed `security/dependency-allowlist.json`; it fails on a new moderate-or-higher advisory, an expired or stale entry and an unreadable audit report, and writes its summary and reports to CI. `tests/dependencyGate.test.ts` proves the threshold, acceptance, expiry and fail-closed rules with synthetic reports.
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` covers atomic saves and project-package create/inspect/extract, manifest checks, checksums, cancellation and ZIP limits.
- `npm run bench:history` runs the synthetic undo/history benchmark. Use `GRIDSCALR_BENCH_ITEMS=5000` for a larger project.
- `npm run bench:large` builds the documented 150-page, 15,000-item reference project and reports mutation, serialization, page-switch and autosave timings. Budgets live in `docs/limitations.md`.
- `npm run format:check` verifies Prettier formatting for source, tests and scripts. Use `npm run format` to apply it.
- `npm run check:i18n` validates catalog keys, duplicate keys, placeholders and ICU syntax, compares generated message types, and scans every `src` directory except `src/i18n` for hard-coded UI text, including single-word properties, `el()`/`option()` text and template literals. The baseline is empty; keep it that way. Use `npm run check:i18n -- --update` only when retiring a deliberate migration entry.
- `npm run check:themes` checks that every palette defines the full token contract and meets the WCAG AA contrast targets for text and controls.
- `npm run theme:preview` captures the light and navy design previews under `docs/theme-preview/`; `public/boot-theme.js` applies the stored theme before first paint without an inline script.
- `npm run i18n:types` regenerates `src/i18n/types.generated.ts`; `npm run i18n:report` prints per-locale key coverage.
- `npm run check:docs` validates documentation links, anchors, images, tool coverage, schema references and screenshot freshness. Set `GRIDSCALR_DOCS_STRICT=1` to turn stale screenshots into an error.
- `npm run docs:demo` regenerates `fixtures/demo-project.gridscalr`.
- `npx playwright install chromium` installs the browser once for `test:ui` and `docs:capture`.
- `npm run docs:capture` regenerates `docs/screenshots/` and its manifest with Playwright. Run it after a visible UI change.
- `npm run site:build` copies `site/`, the app icon, all selected screenshots and `docs/social-preview.png` into `site-dist/`, injects `site/release.json`, and generates `sitemap.xml` and `robots.txt`; `npm run site:check` validates all four pages, release metadata, links and structured data. Preview it with `python3 -m http.server -d site-dist 8080`.
- `npm run fixture` regenerates `fixtures/industrial-plan.pdf` from `scripts/make-industrial-fixture.mjs`.
- The industrial sample has three A3 landscape pages: ground floor at 1:100, mezzanine at 1:50, and site plan at 1:400. Page 1 contains a 10.00 m calibration dimension.
- `npm run fixture:legacy` regenerates the older A4 `fixtures/sample-plan.pdf`; it is kept for the historical Milestone 3 checklist only.
- Browser-only development (`npm run dev`) is a UI fallback. Native file paths and recents require Tauri.
- Do not delete `tests/` fixtures or generated sample files without checking whether tests depend on them.

## Milestone status

- **Milestone 1:** complete — layers, target layer, per-item visibility/lock, multi-select, group move, bulk edits, clipboard, context menus.
- **Milestone 2A:** complete — categories, rooms, default category, schema v3 and migration, the count tool, deduction areas, quantities, and measurement bulk edits.
- **Milestone 2B:** complete — waste, rounding, order quantities, CSV and print-friendly quantity reports.
- **Milestone 3:** complete — 3A added quick areas, manual scale/lock, and markup snapping; 3B added the drawing export dialog, crop areas, and legend.
- **Milestone 4:** complete — embedded PNG/JPEG images, background/annotation modes, image handles, opacity/rotation, schema v5, and image-aware PDF export.
- **Milestone 5:** complete — TIF import as documents, lossless CCITT G3/G4 passthrough, multiple documents per project, append-only pages, schema v6.
- **0.4.1:** complete — Markups tool-rail button and `Ctrl/Cmd+L`, focused zoom to a selected markup, the dedicated Markups tint, and removal of the redundant local-only status.
- **0.5.0:** complete — configurable Markups columns, project-stored views, category/page/type/search filters, multi-level grouping with building/floor/room hierarchy, and page-location labels.
- **0.6.0:** complete — the built-in vector symbol library, category colour coding, rotation, inspection statuses, Markups symbol/status views and CSV fields. Current schema is v13.
- **0.6.1:** complete — all 52 built-in facilities symbols are redrawn as original classic sign plates with filled vector pictograms, category-coloured plates, a 24 pt default size and a white-ringed status badge. No schema change; the schema remains v13.
- **0.7.2:** complete — new application icon (measured area on a gridded plate), a regenerated demo project on schema 14, a public README, MIT license and third-party notices, and the community files. No schema change; the schema remains v14.
- **0.7.3:** complete — synchronized read-only split view, a shared quantity/markup row model, and a six-sheet XLSX quantity workbook. The documentation now reflects schema 16. No schema change; the schema remains v16.
- **0.7.1:** complete — the right panel gains **Properties** and **Project settings** buttons plus a restore tab when collapsed, the duplicate measurement units moved out of Properties, the layer explanation removed, and the redundant image and Canvas buttons removed from the context bar. Includes the 0.7.0 work: stamp and symbol corner resizing, schema 14 with optional `symbolSize` (missing means 24 pt), context-aware markup focus zoom, the page scale in the status bar, Created/Modified Markups columns with bulk actions, range selection, status/category/room context-menu actions, and the symbol library opened from the tool rail only.
- **0.8.0:** complete — session-only revision comparison with side-by-side and overlay views, a markup difference list, warnings and a comparison PDF. No schema change; the schema remains v16.
- **0.9.0:** complete — local PDF text-layer search with progress, snippets and canvas highlights. No schema change; the schema remains v16.
- **0.10.0:** complete — bundled English/Swedish OCR for scanned pages, stored as a rebuildable per-page index with schema 17, and merged into the existing search results.
- **0.11.0:** complete — radius, diameter and three-point arc measurements with labels, snapping, quantities, drawing export and schema 18.
- **0.12.0:** complete — angle, slope and volume measurements with their own quantity units, volume depth input, labels, drawing export and schema 19.
- **0.13.0:** complete — curve, angle and slope labels placed outside their geometry with leader lines; the reference pane gains same-page, revision and raw PDF drawing sources with a source selector, Open/Close controls, a projectless PDF reference scene and comparison PDF support without a markup diff. No schema change; the schema remains v19.
- **0.13.1:** complete — slope previews match the saved percentage-and-degree label, volume creation and double-click editing open a depth dialog, volume labels can lock inside their area, reference panes stay vertically level and the comparison panel can collapse to a Compare tab. No schema change; the schema remains v19.
- **0.13.2:** complete — Radius/Diameter/Arc and Angle/Slope share rail buttons with long-press/right-click family flyouts, Symbol gains a distinct sign icon, and new measurement layers default to signal red with local app-level layer colour defaults. No schema change; the schema remains v19.
- **0.13.3:** complete — release hardening adds Save/Discard/Cancel close handling, safe dialog focus, automatic Windows checksums, context-bar family switching, a reference-view menu state, clearer layer-default copy and the documented Tauri/GTK glib advisory. No schema change; the schema remains v19.
- **0.14.0:** complete — internal refactors extract the reference/comparison controller and canvas draft renderer, share the tool-flyout mount helper, add ESLint with type-aware CI linting and direct dialog/flyout/preview-colour tests, and record ADR 0001 for feature modules. No schema change; the schema remains v19.
- **0.14.1:** complete — OCR, PDF exports, XLSX and TIF import load on demand; production builds no longer ship source maps. No schema change; the schema remains v19.
- **0.15.0:** complete — custom project count types, pieces per count object and schema 20; the first feature module under `src/features/countTypes/`. Schema is v20.
- **0.16.0:** complete — count schedule with a quantity row per count type, Markups count-type column/filter/grouping, count legend glyphs and reusable count presets. Schema is v21.
- **0.16.1:** complete — two-finger touch pan and pinch zoom on both canvases, pen/palm priority and a long-press context menu, with one-finger drawing preserved. No schema change; the schema remains v21.
- **0.17.0:** complete — portable `.gridscalr.zip` packages, Windows/macOS/Linux release artifacts with one merged checksum file, safer atomic saving, app preferences separated from Project settings, local diagnostics with a rolling log and a persistent autosave warning, `.gridscalr` file association with single instance and window state, the app-drawn title row, project rename from settings and `F2`, bundled demo with quick start, the i18n foundation with System/English/Svenska, and packaged smoke tests on all three platforms. No schema change; the schema remains v21.
- **0.18.0:** complete (released 2026-11-04) — JSON catalogs and a locale registry, complete Swedish UI and reports, locale-aware numbers/dates and CSV modes, project metadata and report branding in schema 22, a Swedish quick start with explicit English fallback, and count-schedule wording aligned across the app, docs and site.
- **0.19.0:** complete (released 2026-11-06) — reviewed operation-card symbols with 119 schematic symbols, distinguishable check valves and a plain valve, single- and three-pole switches, downward safety-valve arrow, filled circulation-pump arrowhead, redrawn coils and page-scoped move-to-layer pickers. No schema change; the schema remains v23.
- **0.19.1:** complete (released 2026-11-06) — fixes the floor-heating symbol's arc paths that broke saving and PDF export in 0.19.0, keeps symbol tags upright when rotated, selects marquee items by geometry, scopes the target-layer picker to the page, points the circulation pump left, redraws the heat exchanger, adds the Special symbol-library tab for the I/O rail, enlarges symbol previews and lays drawing colours out in two rows. No schema change; the schema remains v23.
- **0.19.2:** complete (released 2026-11-06) — the I/O rail keeps the symbol library open, pipes and ducts draw freely on drawing pages while the 5 mm grid stays on operation-card sheets, Shift constrains line and pipe vertices while editing, colour swatches gain a working canvas eyedropper, and Rectangle and Ellipse share a menu with filled/outline and solid/dashed variants. Outline shapes are click-through inside. No schema change; the schema remains v23.
- **0.19.3:** complete (released 2026-11-07) — blank A3/A2 pages in the new-project and add-page flows, 37 additional schematic symbols (156 total), corrected valve stems, a left-pointing circulation pump, and the schematic symbol libraries split into category modules. No schema change; the schema remains v23.
- **0.20.0:** complete (released 2026-11-07) — large-project benchmark and budgets, virtualised Markups table, adaptive undo history, canvas viewport culling, serialised autosave, independent reference-page navigation, saved/source status in the shell, project-size reporting, recovery/recent-file controls and laptop-width layouts. No schema change; the schema remains v23.
- **0.21.0:** complete (released 2026-11-07) — PDF export, inline editor and App-flow module splits; light, grey and navy themes with System mode, a CSP-safe pre-paint bootstrap and theme contrast checks. No schema change; the schema remains v23.
- **0.22.0:** complete (released 2026-11-08) — Medium Gray as the default theme, Dark Gray/Dark Jade rename with preference migration, expandable two-column tool rail, Project settings categories, canonical colour handling and a redrawn rotary heat recovery symbol. No schema change; the schema remains v23.
- **0.22.4:** complete (released 2026-11-08) — Windows touchpad pinch-to-zoom via WebView2 pinch support, normalized wheel deltas and a touchpad-specific zoom sensitivity. No schema change; the schema remains v23.
- **Project page import:** complete — import pages from another project with thumbnails, partial imports, page-scoped layers and one-step undo (PR [#152](https://github.com/MajorJohnDoe/gridscalr/pull/152)). No schema change; the schema remains v23.
- **Foundation Phase 4:** complete — explicit reference and managed-copy source storage, verified copies in `<project>.drawings/`, **Consolidate drawings…**, **Use managed copy**, **Detach from source**, the source-changed banner with Reload/Use current/Relink/Copy into project, cloud and network import recommendations, and managed drawings included once in packages. Schema 25 adds `storage`, `originalPath` and `originalSha256`; schema 24 projects migrate to reference without moving a file. No app version bump.
- **Foundation Phase 5:** complete — shared `validateProject()` referential-integrity rules, a load report with dropped/repaired codes, pre-save validation and serialize → parse → write round-trip verification, the **Project doctor** with read-only open, explicit duplicate-ID/dangling-reference/stale-OCR repairs, repaired-copy save and path-free diagnostics, plus an import preflight and optional page provenance. Schema stays 25; provenance is additive and optional. No app version bump.
- **Foundation Phase 6:** complete — opt-in PDF optional-content-group export for visible project layers, opt-in review-only standard PDF annotations, a real read-only **Compare with disk version** in the save conflict dialog using the revision comparison engine, and **Share project package…** as the single share action with managed drawings included once. Flattened PDF stays the deterministic default. No schema change; the schema remains 25. No app version bump.
- **0.25.0:** implemented, release not cut — Pages and workspace: page drag-and-drop and keyboard reorder, PDF/TIF drop on the Pages panel, undoable reorder and insert, page status badges and filters, the page context menu, one shared Pages/Layers/Markups interaction model, import provenance, doctor source availability with explicit managed-copy cleanup and a repair preview, layer hierarchy in schema 26 with the Layers panel tree and nested optional-content export, TIF **Replace source…** with raw-byte provenance hashes, extra TIF codecs, relink in the import preflight, and the Rust source-budget and model-boundary gates. The app version stays 0.24.0 until the release is prepared; see `docs/release-notes/0.25.0.md` and `docs/plan/0.25-handover.md`.

Update the status in `docs/roadmap.md` when a milestone is completed. The current
focus is the foundation workstreams in `docs/roadmap.md`, not a 1.0 date.

## Start-of-session checklist

1. Read `AGENTS.md`, `README.md`, `docs/user-guide.md`, `docs/workflows.md`, `docs/shortcuts.md`, and the relevant plan.
2. Run `git status` and check that the working tree is not carrying unexplained changes.
3. Run `gh auth status` if GitHub operations are needed.
4. Check the latest CI status with `gh run list --repo MajorJohnDoe/gridscalr`.
5. Confirm which foundation workstream or issue is in scope before editing.
6. Make the smallest coherent change, run the checks, update the in-app documentation, commit, push, and verify CI.

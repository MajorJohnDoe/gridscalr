# Foundation follow-ups handover

Compact phase log for the foundation follow-up effort. Full review detail lives
on each pull request.

## Phase 1 — enforce the 400-line foundation feature budget (F-144)

- Issue: [#384](https://github.com/MajorJohnDoe/gridscalr/issues/384)
- PR: [#386](https://github.com/MajorJohnDoe/gridscalr/pull/386)
- Commit: `af8fa63` (implementation); this handover is updated in the same PR
- Schema: unchanged (28)

### Completed

- `file-budgets.json` gained a single `"src/features": 400` directory budget, so
  every file under `src/features/**` — including a directory added later — is
  capped at 400 through the existing rules, unless `file-budgets.json` carries a
  reviewed exception that predates the rule
  (`src/features/schematics/model/sheetTemplate.ts`, 714 lines, remains the only
  one). No new gate and no Rust change.
- Split the two offenders and the extra file the new budget revealed:
  - `src/features/projectPackage/model.ts` (619 → a small surface over
    `model/format.ts`, `model/archive.ts`, `model/portable.ts`,
    `model/manifest.ts` and `model/failure.ts`).
  - `src/features/projectImport/model.ts` (439 → a surface over
    `model/types.ts`, `model/inspect.ts`, `model/prepare.ts` and
    `model/commit.ts`).
  - `src/features/projectPackage/controller.ts` (495 → 345 + a separate
    `sources.ts` for source paths, missing-source checks and request
    preparation).
- Removed F-144 from the open findings register; the archive entry stays as
  history.
- Updated ADR 0013, `AGENTS.md`, `docs/architecture.md`, `docs/testing.md` and
  `tests/fileBudgetRules.test.ts` so the configuration, docs and test agree on
  400.

### Modules

- `file-budgets.json`, `scripts/file-budget-rules.mjs` (unchanged, reused),
  `tests/fileBudgetRules.test.ts`.
- `src/features/projectPackage/{model.ts,model/*,controller.ts,sources.ts}`.
- `src/features/projectImport/{model.ts,model/*}`.

### Decisions

- Used the existing `directoryMax` prefix match rather than changing
  `defaultMax` or adding a per-directory registration requirement: it is the
  smallest change and covers a feature directory created later.
- Kept `model.ts` as the feature's model surface over a `model/` directory, the
  same pattern as `spaces` and `schedules`, so existing internal and test
  imports keep working.
- `--update` still refuses a new oversized file because a directory-budget
  violation has no exact reviewed exception.

### Findings

- No new findings. F-144 fixed and removed from the open register.
- One in-scope split was required beyond the issue's two named files:
  `projectPackage/controller.ts` (495 lines) became a budget violation once the
  wildcard applied. It is split, not excepted.

### Open questions

- None.

### Checks

- Local gate: `check:versions`, `check:file-budgets`, `check:write-sites`,
  `check:modules`, `check:cycles`, `check:security`, `check:actions`,
  `check:dependencies`, `check:docs`, `format:check`, `lint`, `check:i18n`,
  `check:themes`, `npx tsc --noEmit` — pass.
- Focused: `tests/fileBudgetRules.test.ts`, the project-package/project-import
  suites, `pageFileDrop`, `emptyProject`, `fuzz` and the robustness
  source-storage, page-identity and adversarial-input tests — pass.
- Full `npm test` — 208 files, 2217 tests pass.
- Left to CI: the desktop matrix and the browser suites.

### Review

- Reviewer: `code-review` skill (independent, same fixed point `06a606d`).
- Reviewed commit: `deb1b3ec9e8bde050d924584c9068b27182363b0`.
- Verdict: pass — 8 findings across 3 review cycles (roadmap/archive
  bookkeeping for F-144, the `sheetTemplate.ts` exception in the 400-line
  wording, the stale `check-i18n` exclusion and two handover facts), all fixed
  before the final head.
- Findings: none open.

### Next

- Phase 2, [#383](https://github.com/MajorJohnDoe/gridscalr/issues/383).

## Phase 2 — transient overlay registry and takeoff table follow-ups (F-126/F-137/F-140)

- Issue: [#383](https://github.com/MajorJohnDoe/gridscalr/issues/383)
- PR: [#387](https://github.com/MajorJohnDoe/gridscalr/pull/387)
- Commit: `9b9f7d4` (squash merge; implementation `0a1b634` plus the review fix `c5f08e6`)
- Schema: unchanged (28)

### Completed

- **F-137** — Added `src/features/transientOverlay/` with a pure monotonic
  stack (`model.ts`), one DOM registry and Escape route (`controller.ts`) and an
  `index.ts` surface. `flyoutHost.ts`, `popover.ts` and `topMenu.ts` register
  their roots; the dialog controller calls `closeTopTransient()` instead of
  looking up `.tool-flyout, .menu-panel`. Transient levels paint above the dialog
  band, and two transient surfaces are ordered against each other.
- **F-140** — `src/pdf/reportPdf.ts` now reads ink, muted ink, rules and the
  header band from `DOCUMENT_SCHEDULE_STYLE` through the new
  `src/pdf/reportStyle.ts`; the order-quantity accent and clamped warning remain
  report-only semantic colours. The right-dock table deliberately keeps the
  chrome tokens; the accepted difference is recorded in `docs/limitations.md`.
- **F-126** — `placeTotals()` assigns each computed total to a renderable
  column exactly once: a total on the first visible column (the label cell) and
  a second total on an already-claimed field go to the foot line, as does a
  hidden field. The foot line (`Value (Sum): 12.5`) is drawn in the shared table
  layout, the builder preview and the dock table, and the canvas and drawing-PDF
  renderers draw `layout.foot`. No total is recomputed. The builder warning, its
  problem code and its catalog key are removed.
- Removed F-126, F-137 and F-140 from the open findings register.

### Modules

- `src/features/transientOverlay/{index,model,controller}.ts` (new).
- `src/features/schedules/model/totals.ts`, `layout.ts`,
  `ui/{tableParts,panelTable,builderPreview,builder,messages}.ts`.
- `src/pdf/reportStyle.ts` (new), `src/pdf/reportPdf.ts`.
- `src/ui/{flyoutHost,popover,topMenu}.ts`,
  `src/features/dialogHost/controller.ts`.
- `tests/transientOverlay.test.ts` (new), `tests/scheduleTableStyle.test.ts`,
  `tests/schedulesUi.test.ts`, `tests/schedules.test.ts`,
  `tests/reportPdf.test.ts`.

### Decisions

- The transient registry lives beside the dialog host as its own foundation
  feature rather than inside `dialogHost`, so the dialog stack is unchanged and
  the registry has one responsibility.
- The dock table is a live chrome surface, not a printed sheet: it keeps the
  shell tokens. The report and the placed table share the printed document
  palette.
- The report keeps its order-quantity accent and clamped warning as semantic
  colours; they are not band roles and have no place in `DOCUMENT_SCHEDULE_STYLE`.

### Findings

- No new findings. F-126, F-137 and F-140 fixed and removed from the open
  register.

### Open questions

- None.

### Checks

- Local gate: `check:versions`, `check:file-budgets`, `check:write-sites`,
  `check:modules`, `check:cycles`, `check:security`, `check:actions`,
  `check:dependencies`, `check:docs`, `format:check`, `lint`, `check:i18n`,
  `check:themes`, `npx tsc --noEmit` — pass.
- Full `npm test -- --run` — 209 files, 2224 tests pass.
- `npm run test:ui` and `npm run test:visual` — pass (four stable screens, 0
  differing pixels).
- Left to CI: the desktop matrix and the remaining browser suites.

### Review

- Reviewer: `code-review` skill (independent, fixed point `29ab229`).
- Reviewed commit: `c5f08e668de9323d3a6d7e23e8659a25349c5aa5`.
- Verdict: pass-with-findings — one P3 review round (F-126 first-column and
  duplicate totals, the `topMenu` class-name step-back, the F-140 wording) fixed
  on the branch; two P4 documentation nits were fixed on `main` after the merge.
- Findings: none open.

### Next

- Phase 3, [#385](https://github.com/MajorJohnDoe/gridscalr/issues/385).

## Phase 3 — renderer follow-ups: reference gesture reuse and WebKit tile verification (F-147/F-149)

- Issue: [#385](https://github.com/MajorJohnDoe/gridscalr/issues/385)
- PR: [#388](https://github.com/MajorJohnDoe/gridscalr/pull/388)
- Commit: `c727432` (implementation); review fixes in the latest commit on this
  PR
- Schema: unchanged (28)

### Completed

- **F-147** — `src/features/gestureRender/signal.ts` publishes every pan/wheel
  begin and end from the gesture render controller. The read-only reference pane
  passes the primary's signal to its own controller and mirrors both edges, so a
  split-view pan reuses its own raster and settles with the primary. A two-finger
  pan on the reference surface begins and ends the primary gesture through
  `beginExternalViewGesture`/`endExternalViewGesture`. The resting image is the
  unchanged real redraw; the visual harness masks the canvas, so the evidence is
  the gesture-inactive code path and the split-view canvas regression, not a
  pixel baseline.
- **F-147 follow-up** — the gesture raster is keyed on the page ID and the
  effective visibility of every layer. A page change or a hidden layer drops the
  raster and redraws for real, so the previous page or a hidden layer cannot
  linger in the gesture image. The probe restores the tile-path and level state
  it found instead of forcing tiles on after a run where the first-tile rule had
  disabled them.
- **F-149** — `src/features/tileProbe/` compares the tiled and whole-page base
  raster at zoom 1, 3 and 6. The packaged smoke test runs it on Linux, macOS and
  Windows and records a report-only `tile path probe` step with the verdict,
  difference, best 1-px shift, blank-block count, `forced`, `tilesUsed` and
  `tilePathExercised`. The probe forces the tiled path past the live first-tile
  cost rule when the platform supports it, so each level is real verification
  and `not-used` now means a missing platform capability or a failed force. The
  packaged Linux WebKitGTK forced run used tiles at all three zooms (match,
  mismatch, match). The head `5a5f368` macOS WKWebView CI run used tiles at all
  three zooms (mismatch, mismatch, match), and Windows WebView2 used tiles at all
  three zooms and recorded mismatches (2.33–4.68 %). The WebKit zoom-3
  differences are page-wide with no blank or
  material integer shift, but their maximum channel delta (156/119) exceeds the
  64 allowance, so the tightened verdict records them as `mismatch`. No blank or
  integer-offset tile was found, so tiles stay enabled. The differences are the
  open finding F-150 ([#389](https://github.com/MajorJohnDoe/gridscalr/issues/389)).
- `scripts/perf-probe.mjs` gains a split-view pan phase; `test:canvas` asserts
  both panes paint from a gesture raster during the pan.
- Removed F-147 and F-149 from the open register; added F-150 with #389.
- Pre-existing on `main` before this branch (`36c2526`): the tile-cache
  description says 128 MiB, matching `TILE_CACHE_BUDGET_BYTES`. This branch does
  not change it.

### Modules

- New: `src/features/gestureRender/signal.ts`,
  `src/features/tileProbe/{index,model,controller,access}.ts`,
  `src/canvas/rasterCadence.ts`, `src/app/tileProbeFlow.ts`,
  `tests/tileProbe.test.ts`, `tests/gestureRenderController.test.ts`.
- Changed: `src/features/gestureRender/{controller,index}.ts`,
  `src/canvas/{CanvasView,raster}.ts`, `src/app/{App,referenceController}.ts`,
  `scripts/{canvas-regression,perf-probe}.mjs`, `tests/gestureRender.test.ts`,
  `file-budgets.json`, `AGENTS.md`, `README.md`,
  `docs/{architecture,testing,limitations,performance/history}.md`,
  `docs/plan/{foundation-findings,archive/foundation-findings}.md`.

### Decisions

- The signal lives on the gesture controller rather than the store or a global:
  one responsibility, no UI or Tauri dependency, and the follower reuses the same
  controller path.
- The probe disables the display-level underlay and forces each path so it
  compares raster to raster; otherwise an exact level can serve both paths and
  mask a tile difference. When the platform supports the tile cache it also
  forces the tiled path past the live first-tile cost rule for each capture and
  records `forced`, so the verification no longer depends on a run-dependent
  fallback. The live app keeps the cost rule.
- A level where `tilesUsed` is false is `not-used` and can never pass. Reporting
  the full-page fallback as a match was the review's P2 evidence-integrity
  finding; `tilePathExercised` makes the distinction explicit in the report.
- A non-zero blank-block count is decisive before the strict-match return, so a
  faint, sparse mark under the 1 % ratio cannot hide a missing tile.
- `antialias` requires a page-wide differing bound (at least a quarter of the page
  area), the 2 % differing ratio, a maximum channel delta within the existing 64
  allowance, and no 1-pixel shift or blank block. A localized high-delta seam or
  a 2-pixel shift is `mismatch`.
- Existing legacy budgets for `App.ts` (+4) and `CanvasView.ts` (+46) were
  updated with `check:file-budgets -- --update`; no new file exception.
- No platform fallback was added. No blank or integer-offset tile was found;
  the page-wide differences are F-150 rather than an assumed fallback.

### Findings

- F-147 and F-149 fixed and removed from the open register.
- F-150 (P3, [#389](https://github.com/MajorJohnDoe/gridscalr/issues/389)) now
  covers the Windows WebView2 differences, the macOS zoom-1 difference and the
  WebKit zoom-3 differences above the tightened 64 max-delta allowance; no blank
  or integer offset was found.

### Open questions

- None for this phase. F-150 owns the tile-quality decision.

### Checks

- Local gate: `check:versions`, `check:file-budgets`, `check:write-sites`,
  `check:modules`, `check:cycles`, `check:security`, `check:actions`,
  `check:dependencies`, `check:docs`, `format:check`, `lint`, `check:i18n`,
  `check:themes`, `npx tsc --noEmit` — pass.
- Focused: `tileProbe`, `gestureRender` and `gestureRenderController` (56
  tests), plus `rasterController`, `rasterCache` and `storeGesture` (40 tests) —
  pass.
- `test:canvas` — pass.
- `npm run tauri build -- --debug --no-bundle` and the packaged Linux WebKitGTK
  smoke probe — re-run after the forced-path fix. Every level records
  `forced:true` and `tilesUsed:true`; zoom 1 match (0.168 %), zoom 3 mismatch
  (1.006 %, max delta 156) and zoom 6 match. `tilePathExercised:true`. The probe
  step stays `ok:true` because it is report-only.
- Left to CI: the remaining browser suites and the desktop matrix on the final
  handover commit.

### Review

- Reviewer: `code-review` skill (independent, fixed point `82b8669`).
- Reviewed commit: `4672633ea64a6a36de2de195c8b868d4c1c979fa`.
- Verdict: pass-with-findings across four review rounds. Round 1 fixed the
  probe's `not-used`-as-pass and low-contrast blank bugs plus verdict honesty.
  Round 2 fixed documentation that cited the previous head's artifacts, two
  gesture content-key holes and the invalidate-without-settle state. Round 3
  made the probe force the tiled path so `tilesUsed` no longer depended on the
  live first-tile rule. Round 4 left three documentation nits (stale "next CI
  run" wording, the local 1.006 % versus CI 1.007 % ratio, `unready` versus
  `not-used`), fixed on `main` after the merge.
- Findings: none open; F-150 is owned by #389, whose body now carries the forced
  numbers from CI run 46028378383.

### Next

- Phase 4, [#306](https://github.com/MajorJohnDoe/gridscalr/issues/306).

## Phase 4 — trash 5.4.0 removes the compiled chrono path (#306)

- Issue: [#306](https://github.com/MajorJohnDoe/gridscalr/issues/306)
- PR: [#391](https://github.com/MajorJohnDoe/gridscalr/pull/391)
- Commit: `508352d` (squash merge; implementation `0f68a55`)
- Schema: unchanged (28)

### Completed

- Bumped `trash` 5.3.0 → 5.4.0 in `src-tauri/Cargo.toml` and committed the
  resulting `src-tauri/Cargo.lock`. `trash` now uses `jiff` and
  `cargo tree -e features -i chrono` is empty, so chrono left the build graph.
- `chrono 0.4.45` remains in `Cargo.lock` only as an optional entry of
  `serde_with 3.24.0` through `tauri-utils 2.10.2`. The lockfile is
  feature-independent, so `cargo audit` still reports RUSTSEC-2026-0543 and the
  allowlist entry cannot be removed yet.
- Kept the chrono allowlist entry and corrected it: the reason names the
  `serde_with`/`tauri-utils` optional lock path, states that `trash 5.4.0`
  removed the compiled path and that the lockfile is feature-independent;
  `reviewedAt` is 2026-11-27, `reviewBy` is 2027-08-15 and `issue` points at
  [#390](https://github.com/MajorJohnDoe/gridscalr/issues/390).
- Updated `docs/security-policy.md` with a chrono bullet and the separate
  review dates (glib and GTK/zbus 2027-02-15, chrono 2027-08-15).
- The `trash::delete(path)` call site in `src-tauri/src/source_cleanup.rs` is
  unchanged; 5.4.0 has no API change for it.

### Modules

- `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`,
  `security/dependency-allowlist.json`, `docs/security-policy.md`.

### Decisions

- The allowlist entry stays for the optional `serde_with` lock path even though
  nothing compiles chrono; #390 owns its removal when upstream drops the
  optional dependency.
- No change to the dependency gate, no new exception, no `[patch.crates-io]`,
  and no schema or app-version change.

### Findings

- No new findings. The remaining optional chrono lock entry is tracked by #390,
  an upstream dependency decision, so it does not get a foundation-findings row.

### Checks

- `cargo fmt --check`, `cargo check` and `cargo test --lib` (144 passed) with
  `--manifest-path src-tauri/Cargo.toml` — pass.
- `npm run tauri build -- --no-bundle` — pass; release shell built with
  `trash 5.4.0` and `jiff 1.0.3`.
- `npm run check:dependencies` — PASS with six accepted cargo findings; chrono
  accepted until 2027-08-15.
- `check:versions`, `check:file-budgets`, `check:modules`, `check:security`,
  `check:docs`, `format:check` — pass.
- Left to CI: the desktop matrix and the remaining suites.

### Review

- Reviewer: `code-review` skill (independent, fixed point `d4af869`).
- Reviewed commit: `a618bf7b81ebccd05efb32eb11fbbd4d2b63e6c5`.
- Verdict: pass-with-findings — no P1/P2. Two P4s: the lockfile diff also moves
  the `cssparser-macros` → `syn` edge from 2.0.119 to 3.0.9 (benign and valid;
  package set changes only by trash/jiff), and the allowlist's file-level
  `reviewed` date stays 2026-11-17 while the chrono entry was re-reviewed
  2026-11-27. The `syn` edge is recorded here; the file-level date is left as the
  last whole-file review, matching the existing mixed history.
- Findings: none open.

### Next

- Phase 5, [#234](https://github.com/MajorJohnDoe/gridscalr/issues/234).

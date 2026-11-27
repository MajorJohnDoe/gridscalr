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
- Commit: `c727432` (implementation); this handover is updated in the same PR
- Schema: unchanged (28)

### Completed

- **F-147** — `src/features/gestureRender/signal.ts` publishes every pan/wheel
  begin and end from the gesture render controller. The read-only reference pane
  passes the primary's signal to its own controller and mirrors both edges, so a
  split-view pan reuses its own raster and settles with the primary. A two-finger
  pan on the reference surface begins and ends the primary gesture through
  `beginExternalViewGesture`/`endExternalViewGesture`. The resting image is the
  unchanged real redraw.
- **F-149** — `src/features/tileProbe/` compares the tiled and whole-page base
  raster at zoom 1, 3 and 6. The packaged smoke test runs it on Linux, macOS and
  Windows and records a report-only `tile path probe` step with the verdict,
  difference, best 1-px shift and blank-block count. Linux WebKitGTK and macOS
  WKWebView use tiles and pass with per-tile antialiasing only; no fallback was
  needed. The larger Windows WebView2 difference is the new open finding F-150
  ([#389](https://github.com/MajorJohnDoe/gridscalr/issues/389)).
- `scripts/perf-probe.mjs` gains a split-view pan phase; `test:canvas` asserts
  both panes paint from a gesture raster during the pan.
- Removed F-147 and F-149 from the open register; added F-150 with #389.

### Modules

- New: `src/features/gestureRender/signal.ts`,
  `src/features/tileProbe/{index,model,controller,access}.ts`,
  `src/app/tileProbeFlow.ts`, `tests/tileProbe.test.ts`.
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
  mask a tile difference.
- The 2 % antialias allowance is justified by the 1-px shift and blank-block
  checks: a misplaced or blank tile fails both. The Windows result is kept as a
  finding instead of widening the allowance.
- Existing legacy budgets for `App.ts` (+4) and `CanvasView.ts` (+46) were
  updated with `check:file-budgets -- --update`; no new file exception.
- No platform fallback was added: Linux and macOS passed their own probes, and
  Windows has its own open finding rather than an assumed fallback.

### Findings

- F-147 and F-149 fixed and removed from the open register.
- New F-150 (P3, [#389](https://github.com/MajorJohnDoe/gridscalr/issues/389)):
  Windows WebView2 tiled raster differs by 2.3–4.7 % at rest, no blank/offset.

### Open questions

- None for this phase. F-150 owns the Windows decision.

### Checks

- Local gate: `check:versions`, `check:file-budgets`, `check:write-sites`,
  `check:modules`, `check:cycles`, `check:security`, `check:actions`,
  `check:dependencies`, `check:docs`, `format:check`, `lint`, `check:i18n`,
  `check:themes`, `npx tsc --noEmit` — pass.
- Focused: `gestureRender`, `tileCache`, `rasterController`, `rasterCache`,
  `referenceSession`, `tileProbe` — 90 tests pass.
- `test:canvas`, `test:visual` (4 screens, 0 differing pixels),
  `check:performance` — pass.
- Packaged Linux WebKitGTK smoke probe — pass; desktop CI matrix — pass
  (macOS tiles verified, Windows recorded as F-150).
- Left to CI: the remaining browser suites and the desktop matrix on the final
  handover commit.

### Review

- Pending the conductor's independent review.

### Next

- Phase 4, [#306](https://github.com/MajorJohnDoe/gridscalr/issues/306).

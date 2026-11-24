# Performance 1 handover

Plan: `/root/.opencode/plan/2026-11-24-performance-1-4.md` (maintainer plan,
kept outside the repository). Epic: `Performance 1: measured edit and render
cost`. No release milestone: this effort is not release scope, so no version
bump, tag, release or `site/` change is part of it.

Schema 28 stays the current development schema. No persisted field changes.

## Phase 1 — Baseline and a repeatable probe

- Issue: [#348](https://github.com/MajorJohnDoe/gridscalr/issues/348)
- PR: [#352](https://github.com/MajorJohnDoe/gridscalr/pull/352), opened from
  `perf/1-baseline`, base `main` (`2e1df8d`). Not merged.
- Commit: `21c1bd8` (implementation and baseline) plus a handover-only commit
  that records this entry.
- Schema: unchanged (28)

### Completed

- Added the missing span names to the recorder catalogue: `draw-base`,
  `draw-items` and `pdf-render`.
- `pdfRenderer.ts`: `pdf-render` now wraps the awaited render task in
  `renderCrop()` (the primary and reference canvas path) and in
  `renderPagePreview()` (thumbnails, import picker, page previews). The existing
  `pdf-raster` span in `CanvasView.renderPdf()` is unchanged, so the raster time
  can be split into PDF.js work and the crop wrapper.
- `CanvasView.ts`: `draw-base` and `draw-items` time the bodies of `drawBase()`
  and `drawContent()`. `drawAll()` still has its single `canvas-redraw` span;
  a depth guard stops a stage that is called from another stage from being
  counted twice. Every entry point is one boolean check while the recorder is
  off, and every span swallows its own errors as before.
- New `scripts/perf-probe.mjs` and `npm run perf:probe`: fixed 1440 × 900 / DPR 1
  viewport, demo project, recorder enabled and cleared before each window, a
  5 s scripted pan, a three-step zoom, and a 20-edit loop. It prints one JSON
  object (frames, long-task windows, span counts/totals, edit latency, the
  `serialize` count and share, heap when available) and exits non-zero if the
  pan, zoom or edit shape is not observed. `GRIDSCALR_PERF_PROBE_RUNS` (default
  3) takes the median; `GRIDSCALR_PERF_PROBE_SHAPE=ci|reference` reshapes the
  project for the edit loop so the reference-profile share is measurable.
- New [`docs/performance/history.md`](../performance/history.md) with the phase 1
  baseline for the demo, default (40 pages / 4 000 items) and reference
  (150 pages / 15 000 items) profiles, the `bench:large` numbers, the
  `serialize` share, and the run-to-run variance.
- One link from the Large-project performance section of
  [`docs/limitations.md`](../limitations.md#large-project-performance).

### Modules

- `src/features/perfMonitor/model.ts` — three span names only.
- `src/pdf/pdfRenderer.ts` — two span wrappers, no restructure.
- `src/canvas/CanvasView.ts` — two stage spans and a depth guard; no new
  business logic. The file budget was raised to the new line count by
  `check:file-budgets -- --update` (existing legacy exception).
- `scripts/perf-probe.mjs` (new), `scripts/ui-harness.mjs` reused unchanged,
  `package.json` (`perf:probe`).
- `docs/performance/history.md` (new), `docs/plan/performance-handover.md`
  (new), `docs/limitations.md`.

### Decisions

- The probe reads the recorder through the dev module graph
  (`import("/src/features/perfMonitor/index.ts")`) instead of a new global test
  hook, so no production entry point changes and the panel stays closed during
  measurement.
- Span totals are summed from the recorder's own user-timing measures rather
  than added to the panel snapshot shape: the panel keeps its 30 s window and no
  UI or summary text changes.
- The probe's pan and zoom always use the demo project as specified. The
  `GRIDSCALR_PERF_PROBE_SHAPE` option only affects the edit loop, which is where
  the `serialize` share decides Phase 2 Scope B.
- Phase 2 Scope B is **in scope**: `serialize` is 43.0 % of p95 edit latency on
  the default profile and 53.8 % on the reference profile, both above the 25 %
  threshold.

### Findings

- F-145 — the image-exclusion replacer in `Store.snapshot()` makes the snapshot
  about 4× slower than a plain `JSON.stringify` of the same project (11.5 vs
  2.6 ms at 40 pages / 4 000 items, 43.5 vs 20.4 ms at 150 pages / 15 000 items).
  Phase 2 should remove the replacer cost, not only the sharding.
- F-146 — rAF frame-time p95 is clamped at the 60 Hz interval (16.7 ms) on
  every profile, so the phase 3 acceptance criterion "p95 frame time improves
  30 %" cannot be observed with that metric. Phase 3 should compare
  `draw-items` p95/total and the frame max/dropped-frame distribution.

### Checks

Run locally on the branch:

- `check:file-budgets`, `check:modules`, `check:docs`, `check:i18n`,
  `format:check`, `lint`, `npx tsc --noEmit`;
- `npx vitest run tests/perfMonitor.test.ts` (no model behaviour change);
- `npm run perf:probe` (demo, 3 runs) and the shaped `ci`/`reference` runs;
- `npm run bench:large` on both profiles;
- `GRIDSCALR_PERF_PROFILE=reference npm run check:performance` — all budgets
  pass, unchanged.

No browser suite, visual baseline or `docs:capture` run: this phase adds spans
and a script, and changes no pixels, UI text or project data. CI remains
authoritative for the full suite.

### Next

- Phase 2, #349 — remove the redundant snapshot per gesture and evaluate the
  serializer replacer cost; compare against the phase 1 rows.

## Phase 2 — Snapshot cost per edit

- Issue: [#349](https://github.com/MajorJohnDoe/gridscalr/issues/349)
- PR: [#354](https://github.com/MajorJohnDoe/gridscalr/pull/354), opened from
  `perf/2-snapshot-cost`, base `main` (`9ec19b3`). Not merged.
- Commit: `f473b91` (implementation and tests) plus a documentation-only commit
  that records this entry.
- Schema: unchanged (28)

### Completed

- History bookkeeping: the state now in memory is serialised once and cached
  (`SnapshotHistory.currentText`). `mutate()`, page reorder and page insert push
  the cached pre-state and serialise the post-state once. Undo and redo move
  cached text between the two stacks without serialising; `cancelGesture()`
  restores cached text. `clearHistory()` seeds the new baseline at a structural
  boundary.
- `endGesture()` compares the revision captured in `beginGesture()` instead of
  comparing snapshot strings. Drags change items in place without touching the
  revision, so `Store.noteGestureChange()` bumps it once per gesture from
  `drag.ts` / `transform.ts`. A completed drag pays one serialisation (the new
  state); a gesture that changed nothing, or was cancelled, pushes nothing.
- Serializer: embedded image payloads are set to `undefined` for one plain
  `JSON.stringify` and restored in a `finally`. The text is byte-identical to the
  old replacer output; the payload-registration side effect is preserved.
- Tests: `tests/storeSnapshot.test.ts` proves byte identity (demo project,
  `fixtures/legacy/schema-28` with an embedded PNG, in-memory PNG + JPEG), one
  serialise per edit, one per completed gesture, none for an unchanged or
  cancelled gesture, none on undo/redo, image payload restore across undo/redo
  and one undo step for a page reorder. `tests/storeGesture.test.ts` now calls
  `noteGestureChange()` for its direct gesture mutation.

### Modules

- `src/state/snapshot.ts` (new) — payload-free history text.
- `src/state/snapshotHistory.ts` (new) — stacks, cached current text, gesture
  snapshot and payload cache.
- `src/state/store.ts` — call sites only; 1002 → 962 lines.
- `src/canvas/pointer/drag.ts` and `src/canvas/pointer/transform.ts` — one
  `noteGestureChange()` call when a drag moved. `CanvasView.ts` and the render
  path are untouched.
- `docs/performance/history.md`, `docs/plan/foundation-findings.md` (F-145),
  `docs/architecture.md`, `AGENTS.md` architecture map.

### Decisions

- Scope B is the replacer removal, not per-page sharding. It measured well
  enough that the sharded fallback was not started: edit p95 fell 33.6 % (CI)
  and 35.9 % (reference) in the first probe session, 26.9 % and 33.8 % in the
  repeat. `docs/limits` and budgets are unchanged.
- `undefined` assignment beats `delete` for the payload fields: `delete` moves
  the asset objects to dictionary mode and cost 4.9 ms vs 2.3 ms on the CI
  shape in a direct measurement, while both produce the same text. This is the
  difference between the first probe result (serialize 6.0 ms) and the shipped
  one (3.0 ms).
- Project open now includes one seed serialisation. It rose from 9.1 to 13.0 ms
  (CI) and 27.8 to 38.3 ms (reference), still far inside the 10 s budget.
- The cache is refreshed on every store commit. Direct view writes between
  commits (`setActiveLayer`) and the rebuildable OCR index (`setPageOcr`) can be
  missing from the pre-state entry until the next commit; neither is undoable
  user data, and both are re-derived. This mirrors the old behaviour for the
  undo direction and only widens the redo text slightly.
- History text remains the same string format. No new persisted field, no
  export change, no UI text change.

### Findings

- F-145 — updated with the outcome: the replacer is gone, the snapshot text is
  byte-identical, and the remaining serialize cost is the plain JSON text
  (3.0 ms CI / 22 ms reference per edit).
- No new finding. F-146 is unchanged and still applies to phase 3.

### Checks

Run locally on the branch:

- `check:versions`, `check:file-budgets`, `check:modules`, `check:i18n`,
  `check:docs`, `check:themes`, `format:check`, `lint`, `npx tsc --noEmit`;
- `npm run test:robustness` (104 tests) and focused `vitest` over
  `storeSnapshot`, `storeGesture`, `pageHistory`, `rendererPageOrder`,
  `projectImportHistory`, `saveIntegrity`, `autosave`, `viewOnly`,
  `demoProject` and `images`;
- `npm run perf:probe` with `GRIDSCALR_PERF_PROBE_SHAPE=ci` and `=reference`,
  two sessions of three runs each;
- `npm run bench:large` on the default reference profile and
  `GRIDSCALR_BENCH_PROFILE=ci`;
- `GRIDSCALR_PERF_PROFILE=reference npm run check:performance` — every budget
  passes.
- `npm run test:canvas` for the gesture change.

No visual baseline or `docs:capture` run: no pixel or UI text change. CI remains
authoritative for the full suite.

### Next

- Phase 3, #350 — reuse the gesture-time content raster; compare `draw-items`
  p95/total and the frame distribution (F-146).

## Phase 3 — Gesture-time content reuse

- Issue: [#350](https://github.com/MajorJohnDoe/gridscalr/issues/350)
- PR: [#357](https://github.com/MajorJohnDoe/gridscalr/pull/357), opened from
  `perf/3-gesture-reuse`, base `main` (`e56fa71`, phase 2 merged). Not merged.
- Commit: `d3c907e` (implementation, tests and phase docs) plus a docs-only
  commit that records this entry.
- Schema: unchanged (28)

### Completed

- New `src/features/gestureRender/` (ADR 0013): `model.ts` is the pure settle
  rule (`GESTURE_SETTLE_MS` 120 ms, `clampSettleMs`, `settleDelay`,
  `settleDue`); `controller.ts` owns gesture state, `rasterTransform`, the
  offscreen capture and the paint; `index.ts` is the public surface and the
  feature is now in `FOUNDATION_FEATURES`, so `check:modules` blocks deep
  imports.
- During a pointer pan, a wheel pan or a wheel zoom the content canvas paints the
  previous item raster with one uniform scale and translation instead of running
  `drawContent()`. The base viewport is latched when the gesture begins and the
  pixels are captured on the first frame, so frames never compound the transform;
  a canvas resized mid-gesture abandons reuse and draws for real.
- Settle: pointerup for a pan, 120 ms after the last wheel event for a wheel
  stream, the two-finger end for a touch pinch. The settle drops the raster and
  runs the unchanged real redraw plus the unchanged PDF raster schedule.
- The `interaction` canvas is untouched: selection handles, marquee, snapping and
  the draft overlay still draw on every frame, and no hit-test, selection or
  snap code changed.
- `FrameWindow` gained `overGoodMs` (frames at or above `FRAME_GOOD_MS`, 20 ms)
  and `perf:probe` prints it, so phase 3 is judged on `draw-items` plus that
  counter instead of the vsync-clamped frame p95 (F-146).
- Measured `draw-items` p95 20.4 → 4.9 ms and total 2 130.8 → 71.6 ms on the CI
  shape, 21.8 → 4.9 ms and 2 083.0 → 76.4 ms on the reference shape; frame max
  33.4 → 33.3 / 49.9 → 33.4 ms and frames over 20 ms 1 → 1 / 3 → 1. Full rows in
  [`docs/performance/history.md`](../performance/history.md).

### Modules

- `src/features/gestureRender/{index,model,controller}.ts` (new, 254 lines
  total).
- `src/canvas/CanvasView.ts` — one adapter call in `drawContentStage`, one
  controller field and construction, two pointer-host delegates and
  `dispose()` in `destroy()`. 1550 → 1543 lines, inside the unchanged budget.
  The pure `itemFocusBounds()` helper moved to `src/model/geometry.ts` to make
  room; no behaviour change.
- `src/canvas/pointer/navigation.ts`, `touchInput.ts` — begin/end edges only;
  `PointerHost.ts` gains the two delegates. `TouchNavigation` gains an optional
  `onGestureEnd`.
- `src/canvas/pointer/PointerController.ts` — two context arrows and removal of
  the uncalled `cancelPan()` (the cancellation path now ends the gesture in
  `cancelAll()`, which also fixes Escape during a pan).
- `src/features/perfMonitor/model.ts` — `FrameWindow.overGoodMs`; `perf:probe`
  passes it through.
- `tests/gestureRender.test.ts` (new), `tests/perfMonitor.test.ts`,
  `scripts/check-module-boundaries.mjs`, `AGENTS.md`, `README.md`,
  `docs/architecture.md`, `docs/performance/history.md`,
  `docs/plan/foundation-findings.md`.

### Decisions

- The base viewport is latched in `begin()` and the pixels are captured lazily on
  the first paint. Capturing both in `paint()` would record the already-updated
  viewport against pixels drawn at the previous one and offset the raster by the
  first gesture delta; `tests/gestureRender.test.ts` pins the transform, and the
  ad-hoc held-pan check found 0 differing pixels against the settled redraw.
- A wheel stream (both Ctrl + wheel zoom and delta wheel pan) settles on the same
  120 ms idle rule. Touch and space-pan are pointer gestures and settle at
  pointerup. Nothing new is persisted or exposed in the UI.
- `CanvasView` stays inside its 1550-line budget without a budget raise: the
  unrelated-looking `focusBoundsForItem` extraction is mechanical (same inputs,
  same numbers) and exists only to pay for the adapter wiring.
- The split-view divider wheel (`zoomAtScreen`) and the read-only reference pane
  stay on the real redraw path. The reference pane attaches no pointer gestures
  at all, so it cannot begin one; giving it a follow signal is bigger than this
  phase and is recorded as F-147. This is why the phase 3 reduction applies to
  the primary canvas and the probe's numbers do not include split view.
- The settle redraw adds one `draw-items` and one PDF-raster schedule per
  gesture; the probe shows `pdf-render` 4 → 6 spans in the same time and p95
  band, which is the intended refresh after a zoom settles.
- `cancelAll()` now ends the view gesture, so Escape (or crop entry) during a pan
  cannot leave the canvas reusing a raster forever. This also allowed deleting the
  uncalled `cancelPan()` wrappers.

### Findings

- F-146 — updated with the outcome: `overGoodMs` exists, frame p95 stayed
  clamped at 16.7–16.8 ms, and `draw-items` fell 76–78 % p95 with no frame
  regression.
- F-147 — new: the reference pane still redraws every item during a primary pan
  because a read-only canvas never begins a gesture. Split view therefore keeps
  its old pan item cost; decide with the phase 4 tile cache, not before it.
- No open question.

### Checks

Run locally on the branch:

- `check:versions`, `check:file-budgets`, `check:modules`, `check:security`,
  `check:themes`, `check:i18n`, `check:docs`, `format:check`, `lint`,
  `npx tsc --noEmit`;
- `npx vitest run` over `gestureRender`, `perfMonitor`, `canvasGeometry`,
  `culling`, `modelBoundary`, `fileBudgetRules`, `listInteraction`, `pageMenu`
  (106 tests);
- `npm run test:visual` — 4 screens, 0 differing pixels, no baseline change;
- `npm run test:canvas` and `npm run test:touch` — green;
- `GRIDSCALR_PERF_PROFILE=reference npm run check:performance` — every budget
  passes (p95 edit 49.8 ms, open 37.6 ms, autosave 983.2 ms, page switch
  31.4 ms, UI freeze 211.1 ms, heap 97.3 MB);
- `npm run perf:probe` with `GRIDSCALR_PERF_PROBE_SHAPE=ci` and `=reference`,
  before and after, three runs each; plus an ad-hoc mid-gesture pixel-alignment
  check (not committed).

Not run locally: the full `npm test`, `test:ui`, `test:import`, `test:count`,
`test:csp`, `test:a11y`, `test:touch-targets`, `test:ui-scale`, the Rust builds
and `check:dependencies`. CI remains authoritative. No `docs:capture`: no visible
screen changed at rest.

### Next

- Phase 4, #351 — tile cache for the primary canvas; compare time-to-first-tile
  and steady-state bytes, keep the resting output pixel-identical.

## Phase 4 — Tile cache for the primary canvas

- Issue: [#351](https://github.com/MajorJohnDoe/gridscalr/issues/351)
- Branch: `perf/4-tile-cache`, cut from `main` `f44a213` (phase 3 merged). PR
  opened against `main`. Not merged.
- Schema: unchanged (28)
- No version bump, tag or release artifact.

### Completed

- New `src/features/tileCache/`: `model.ts` (512 CSS px device-pixel grid, zoom
  bucket, visible-first ordering, 64 MiB RGBA budget, distance-from-viewport
  eviction and the capability check), `controller.ts` (visible-first queue,
  cancellation on scene/zoom/page change, `createImageBitmap` with a canvas
  fallback, composition paint and stats), `render.ts` (the clipped-viewport
  adapter shared with `PdfRenderer.renderCrop`) and `index.ts` (public surface,
  now in `FOUNDATION_FEATURES`).
- `src/canvas/raster.ts` (new) owns render scheduling, the generation guard and
  the tile/full-page choice. `CanvasView` forwards its viewport, draws
  `raster.current` and exposes `tileCacheStats()` through the dev test API.
  `CanvasView.ts` fell to 1516 lines, inside the unchanged 1550 budget.
- `PdfRenderer.renderCrop` delegates to the shared adapter; new
  `renderTileCanvas()` returns a cancellable tile task. The OCR path still calls
  `renderCrop` unchanged.
- Primary canvas only. The reference pane, comparison and every read-only canvas
  keep the full-page path. A tile render error falls back to the full page for
  the rest of the session; missing `createImageBitmap`/`OffscreenCanvas` keeps
  the full page from the start.
- The previous composition stays visible until the first new tile is painted, so
  a zoom stream cannot flash a blank page.
- `perfMonitor` gained `tile-render` and `tile-cache-hit`; `perf:probe` now
  reports `raster.firstVisibleMs`, `raster.firstRenderMs`, cache bytes, tiles,
  hits and misses without changing an existing JSON key.
- `test:visual` 4/4 with 0 differing pixels and no baseline change; `test:canvas`
  and `test:ui` green; `check:performance` green on both profiles.

### Modules

- `src/features/tileCache/{index,model,controller,render}.ts` (new, 665 lines
  total; controller 304).
- `src/canvas/raster.ts` (new, 238 lines); `src/canvas/CanvasView.ts` 1543 → 1514.
- `src/pdf/pdfRenderer.ts` adapter only; `src/canvas/CanvasView.ts` draw path only.
- `src/features/perfMonitor/model.ts` two span names.
- `tests/tileCache.test.ts` (new), `scripts/perf-probe.mjs`,
  `scripts/check-module-boundaries.mjs`, `file-budgets.json`,
  `docs/performance/history.md`, `docs/limitations.md`,
  `docs/plan/foundation-findings.md`, `docs/architecture.md`, `AGENTS.md`,
  `README.md`.

### Decisions

- **Device-pixel tile grid, exact scale.** Tiles are whole device pixels aligned
  to the crop origin and rendered at the same scale as the old crop, so the
  composed raster matches the full-page output except for antialiased edges; a
  page-space or zoom-bucket-scaled grid differed by 4 % of pixels in a controlled
  comparison, so it was rejected. The zoom bucket groups tiles for eviction and
  cancellation, not for a different render scale.
- **64 MiB budget.** At 1440 × 900 that is about ten views at DPR 1 or two to
  three at DPR 2, measured steady state 10.2 MiB. The desktop working-set budget
  is unchanged; the cache is a bounded fraction of it.
- **Full-page fallback stays the default where the APIs are missing.** WebKitGTK
  could not be exercised here; `supportsTileCache()` requires both
  `createImageBitmap` and `OffscreenCanvas`, and any tile error reverts the page
  to the full-page path. This is an honest unverified limitation, F-149.
- **The first tile is not faster on the probe's small crop.** PDF.js traverses
  the operator list per tile. Measured time-to-first-visible moved +7.8 % (CI)
  and −2.4 % (reference) inside a 5–13 % spread; per-tile `pdf-render` p95 fell
  4–9 % and total raster work during a zoom stream fell 30–38 %. The phase ships
  the bounded cache and earlier first paint for capped/heavy renders, not a
  general raster speedup. Recorded as F-148.
- **Resting output.** `test:visual` is 0/4 with no baseline change. The canvas
  raster itself was compared against phase 3 at the same viewport and view:
  1 075 of 639 856 pixels differ at zoom 1 (max channel delta 10), 73 at zoom 3
  (max 3) and 185 at zoom 6 (max 27), all on antialiased edges with no seam or
  offset. This is documented in the history and limitations.
- **No visible UI change.** No new user-facing string, no schema field, no
  export change.

### Findings

- F-147 — updated: phase 4 stays primary-only; the reference pane and split view
  keep the full-page path, so the split-view pan cost is unchanged.
- F-148 — new: PDF.js re-walks the page operator list for every tile, so the
  first tile can cost about as much as the monolith on a small crop. Next step:
  a renderer seam that shares one operator list, or gate tiles on planned raster
  pixels / DPR.
- F-149 — new: the WebKitGTK tile path is feature-detected but unverified in
  this environment; a missing API keeps the full-page path.

### Checks

Run locally on the branch:

- `check:versions`, `check:file-budgets`, `check:modules`, `check:i18n`,
  `check:docs`, `format:check`, `lint`, `npx tsc --noEmit`;
- `npx vitest run` over `tileCache`, `pdfRenderer`, `perfMonitor` and
  `gestureRender` (47 tests);
- `npm run test:visual` (4 screens, 0 differing pixels, no baseline change);
- `npm run test:canvas` and `npm run test:ui`;
- `npm run check:performance` on the CI profile and
  `GRIDSCALR_PERF_PROFILE=reference npm run check:performance` — every budget
  passes;
- `npm run perf:probe` with `GRIDSCALR_PERF_PROBE_SHAPE=ci` and `=reference`,
  five runs before (phase 3 tree plus the updated probe) and after, on the same
  machine;
- an ad-hoc base-canvas comparison against the phase 3 tree at zoom 1, 3 and 6
  (not committed).

Not run locally: the full `npm test`, `test:import`, `test:count`, `test:touch`,
`test:csp`, `test:a11y`, `test:touch-targets`, `test:ui-scale`, the Rust builds
and `check:dependencies`. CI remains authoritative. No `docs:capture`: no visible
screen changed at rest.

### Next

- None. Phase 4 is the last phase of the effort. The deferred follow-ups are
  F-148 (operator-list sharing or a size gate) and F-149 (WebKitGTK
  verification).



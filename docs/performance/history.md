# Performance history

Measured baselines for the Performance 1–4 effort (`Performance 1: measured edit
and render cost`). One section per phase, newest last. Every row records what
was measured, on which profile, on which commit, so a later phase can compare
like with like instead of quoting a number without a method.

## How a number is produced

- `npm run perf:probe` — the interactive baseline. It opens the harness demo
  project in the browser fallback at a fixed 1440 × 900 viewport and DPR 1,
  turns on the opt-in performance recorder, clears its samples, runs 20 discrete
  edits, clears again, then runs a scripted 5 s pan and a three-step Ctrl + wheel
  zoom. It prints one JSON object: frame percentiles, long-task windows, span
  counts/totals, the edit loop with its `serialize` count and share, and the JS
  heap when the engine reports it.
  `GRIDSCALR_PERF_PROBE_RUNS` (default 3) repeats the scenario and the median is
  reported. `GRIDSCALR_PERF_PROBE_SHAPE=ci|reference` reshapes the open project
  with the same deterministic shape rules as `check:performance` before the edit
  loop; the pan and zoom always use the demo project as specified for the probe.
- `npm run bench:large` — the reference-project benchmark: project open, p95
  edit latency, serialization, page switch, autosave and Markups open.
  `GRIDSCALR_BENCH_PROFILE=ci` runs the 40-page / 4 000-item profile that
  `check:performance` uses by default; the unset default is the 150-page
  reference profile.
- `GRIDSCALR_PERF_PROFILE=reference npm run check:performance` — the budget gate
  itself. A missing measurement fails; the budgets are in
  [`docs/limitations.md`](../limitations.md#large-project-performance).

Both tools run against the Chromium browser fallback, not the packaged Tauri
app. Native working-set memory and WebView2 timing still need the manual desktop
check described in `docs/limitations.md`.

### Machine profile

- Development container, Linux 6.18.33-Unraid, 20 logical CPUs
  (13th Gen Intel Core i5-13500), 31.8 GB RAM.
- Node 24.22.1, Playwright 1.64.1, bundled Chromium (headless), Vite dev server.
- Browser fallback, Medium Grey theme, 1440 × 900 viewport, device pixel
  ratio 1.

Numbers from another machine are not comparable in absolute terms; compare the
same phase's before and after on one machine, and use the budgets for the
absolute limit.

## Phase 1 — Baseline and a repeatable probe (2026-11-24)

- Code measured: `perf/1-baseline` from `main` `2e1df8d`, phase commit
  `21c1bd8` (the added spans and the probe).
- Command: `npm run perf:probe`, `GRIDSCALR_PERF_PROBE_SHAPE=ci`.
- Runs: 3, median reported. Shape: 40 pages, 4 162 items, 2 documents
  (4 000 shaped measurements plus the demo's remaining layers).

### Interaction: frames and long tasks

The pan is 120 pointer moves over 5 s; the zoom is three Ctrl + wheel steps
(factor 1.91 in total). Frame samples and long tasks are cleared after the edit
loop, so they cover only the pan and zoom.

| Measure | Value |
| --- | --- |
| Frame p50 | 16.7 ms |
| Frame p95 | 16.7 ms |
| Frame p99 | 16.8 ms |
| Frame max | 33.4 ms |
| Long-task windows | 0 |
| JS heap | 86.4 MB |
| `draw-items` p95 / total (124 redraws) | 21.0 ms / 2 017.8 ms |
| `draw-base` total (128 draws) | 28.3 ms |
| `canvas-redraw` p95 / total | 21.2 ms / 2 041.2 ms |
| `pdf-render` p95 / total (4 renders) | 30.2 ms / 86.9 ms |
| `pdf-raster` p95 / total | 31.0 ms / 88.3 ms |

### Edits: latency and the `serialize` share

The edit loop is 20 discrete `store.mutate()` label changes (one history-tracked
edit each), timed around the call in page code while the recorder captures the
named spans.

| Measure | Value |
| --- | --- |
| Edit p50 | 23.6 ms |
| Edit p95 | 26.8 ms |
| `serialize` spans | 20 (exactly 1 per edit) |
| `serialize` per edit | 11.54 ms |
| `serialize` share of p95 edit | **43.0 %** |
| `serialize` p95 / max | 11.9 ms / 16.0 ms |
| `shell-render` p95 | 3.3 ms |
| `draw-items` p95 | 10.1 ms |

### Reference profile (150 pages / 15 000 items)

- Command: `GRIDSCALR_PERF_PROBE_SHAPE=reference npm run perf:probe`, 3 runs,
  median. Shape: 150 pages, 15 206 items, 2 documents. Same scenario and
  viewport.

| Measure | Value |
| --- | --- |
| Frame p50 / p95 | 16.7 / 16.8 ms |
| Long-task windows | 0 |
| JS heap | 188.0 MB |
| `draw-items` p95 / total (124 redraws) | 21.4 ms / 2 068.4 ms |
| `pdf-render` p95 / total (3 renders) | 28.4 ms / 71.2 ms |
| Edit p50 / p95 | 67.6 / 80.0 ms |
| `serialize` spans | 20 (exactly 1 per edit) |
| `serialize` per edit | 43.47 ms |
| `serialize` share of p95 edit | **53.8 %** |
| `serialize` p95 / max | 50.4 ms / 60.5 ms |

The shared demo project (4 pages, 174 items) is the third probe row used for
smoke-checking the tool itself: edit p95 7.7 ms, `serialize` 0.74 ms per edit
(10.3 % of p95), `draw-items` p95 3.8 ms, frame p95 16.7 ms, heap 50.4 MB.
Repeated probe sessions on this project varied its p95 edit between 5.7 and
11.9 ms, so it is a tool smoke row, not a phase comparison row.

`npm run perf:probe` writes npm's own banner before the JSON; use
`npm run --silent perf:probe` when piping stdout into a parser.

### Budget benchmark

`npm run bench:large` (default reference profile) and
`GRIDSCALR_BENCH_PROFILE=ci npm run bench:large`:

| Measure | ci (40 p / 4 000 i) | reference (150 p / 15 000 i) | Budget |
| --- | --- | --- | --- |
| Project open | 9.1 ms | 27.8 ms | under 10 s |
| p95 edit latency | 23.5 ms | 73.3 ms | under 100 ms |
| Serialization p50 / p95 (plain `JSON.stringify`) | 2.6 / 2.7 ms | 20.4 / 21.4 ms | — |
| Page switch p95 | 12.1 ms | 31.7 ms | under 100 ms |
| Autosave | 937 ms | 1 017 ms | under 2 s |
| Markups open (timed UI freeze proxy) | 123.5 ms | 217.6 ms | under 2 s |
| JS heap | 114.3 MB | 81.6 MB | 2 GB (desktop, manual) |

`GRIDSCALR_PERF_PROFILE=reference npm run check:performance` on the same machine
and commit passed every budget (p95 edit 78.3 ms, open 28.5 ms, autosave 1.01 s,
page switch 39.7 ms, UI freeze 209.2 ms). The gate is unchanged.

### Run-to-run variance

Median of 3 runs per row; variance is `(max − min) / median`.

| Row | Runs (p95 edit) | Variance |
| --- | --- | --- |
| Probe, ci profile | 26.7, 29.2, 26.8 ms | 9.3 % |
| Probe, reference profile | 85.2, 80.0, 79.0 ms | 7.8 % |
| Probe, demo project | 11.7, 7.7, 5.7 ms | 77.9 % |

The demo project's variance is high only in relative terms: its edits are
single-digit milliseconds, so one scheduling hiccup moves the ratio. An earlier
probe session on the same commit produced 11.9, 7.2 and 7.8 ms (60.3 %), so the
demo row swings by 60–78 % between sessions. Frame p95 varies by 0–0.6 % on every
profile because the browser clamps it to the 60 Hz refresh interval (see F-146).
The two project-shaped rows are inside the ±15 % acceptance band; use them, not
the demo row, when comparing phases.

### What the baseline says

- `serialize` is **1 per discrete edit** and **43.0 % of p95 edit latency on the
  default profile** and **53.8 % on the reference profile**. The Phase 2
  condition (≥ 25 %) is met, so Scope A and Scope B are both in scope. Phase 2
  must compare against these rows.
- The store snapshot is much more expensive than the plain `JSON.stringify`
  that `bench:large` reports (11.5 vs 2.6 ms on a similarly sized project),
  because `Store.snapshot()` passes an image-exclusion replacer. See F-145.
- Interaction cost is dominated by `draw-items`: about 19–21 ms of item redraw
  per pan frame on the shaped profiles while `draw-base` stays under 0.3 ms. The
  rAF frame p95 is clamped at 16.7 ms, so it cannot show a 30 % pan improvement;
  phase 3 should compare `draw-items` p95/total and the frame max/dropped-frame
  distribution instead. See F-146.
- No long tasks were recorded in any run, and every budget passed with
  headroom. The baseline is not a regression story; it is the number every later
  phase is measured against.

## Phase 2 — Snapshot cost per edit (2026-11-24)

- Code measured: `perf/2-snapshot-cost`, implementation commit `f473b91`, cut
  from `main` `9ec19b3` (phase 1 merged).
- Schema: unchanged (28). No snapshot text, export or UI change.
- Shape and viewport: identical to phase 1. The probe and benchmark still run
  against the browser fallback.

### What changed

- `Store.mutate()`, page reorder and page insert cache the serialised text of
  the state in memory and push that cached text, then serialise the new state
  once. Undo and redo move cached text between the two stacks without
  serialising; a cancelled gesture restores cached text. See
  `src/state/snapshotHistory.ts`.
- `endGesture()` compares the project revision captured in `beginGesture()`
  instead of comparing snapshot strings, so a completed drag pays one
  serialisation (the new state) instead of two. A gesture that changes nothing
  still pushes no history entry. Drags announce their direct item edits through
  `Store.noteGestureChange()`, one revision bump per gesture.
- `Store.snapshot()` no longer passes a per-value replacer. Embedded image
  payloads are cleared to `undefined` for one plain `JSON.stringify` and
  restored immediately, which is byte-identical to the old replacer text (F-145,
  `tests/storeSnapshot.test.ts`). See `src/state/snapshot.ts`.
- One serialisation per discrete edit, one per completed gesture, none for a
  cancelled or unchanged gesture and none for undo/redo are asserted by
  `tests/storeSnapshot.test.ts`.

### Edits: before and after

`npm run perf:probe`, two sessions of 3 runs each, median reported. Session A is
the phase 2 measurement; session B is the repeat used to check variance.

| Measure | Phase 1 baseline | Phase 2 A | Phase 2 B | Change |
| --- | --- | --- | --- | --- |
| CI shape: edit p50 | 23.6 ms | 15.2 ms | 16.2 ms | −31 to −36 % |
| CI shape: edit p95 | 26.8 ms | 17.8 ms | 19.6 ms | **−33.6 / −26.9 %** |
| CI shape: `serialize` per edit | 11.54 ms | 3.02 ms | 3.35 ms | −71 to −74 % |
| CI shape: `serialize` share of p95 | 43.0 % | 16.0 % | 16.2 % | −27 pt |
| CI shape: `serialize` spans | 20 (1/edit) | 20 (1/edit) | 20 (1/edit) | unchanged |
| Reference: edit p50 | 67.6 ms | 47.5 ms | 46.3 ms | −30 to −32 % |
| Reference: edit p95 | 80.0 ms | 51.3 ms | 53.0 ms | **−35.9 / −33.8 %** |
| Reference: `serialize` per edit | 43.47 ms | 22.1 ms | 21.79 ms | −49 to −50 % |
| Reference: `serialize` share of p95 | 53.8 % | 42.2 % | 40.7 % | −12 to −13 pt |
| Reference: `serialize` p95 / max | 50.4 / 60.5 ms | 23.9 / 24.8 ms | — | −53 % |

The remaining `serialize` cost is the project text itself: the phase 1 plain
`JSON.stringify` was 2.6 ms on the CI shape and 20.4 ms on the reference shape,
so the replacer overhead is gone and only the JSON text is left. The CI-shape
`serialize` p95 was 3.1 ms with a 6.5 ms max in session A.

### Interaction and heap (session A)

The pan and zoom are unchanged by this phase; the numbers are the health row.

| Measure | CI shape | Reference shape |
| --- | --- | --- |
| Frame p50 / p95 | 16.7 / 16.8 ms | 16.7 / 16.8 ms |
| Frame p99 / max | 16.8 / 33.4 ms | 16.8 / 33.4 ms |
| Long-task windows | 0 | 0 |
| JS heap | 123.0 MB | 188.0 MB |
| `draw-items` p95 / total (124 redraws) | 20.9 ms / 1 970.3 ms | 21.1 ms / 1 864.1 ms |
| `pdf-render` p95 / total (4 renders) | 29.4 ms / 95.9 ms | 24.8 ms / 80.4 ms |

The reference heap matches phase 1 exactly. The CI row moved from 86.4 MB to
123.0 MB in the browser heap counter, which is quantised and constant per shape
across runs; the history cache retains one extra copy of the current text
(1.9 MB) beyond the undo entries, so the rest is garbage awaiting collection,
not a retained structure. The desktop working-set budget is still the manual
packaged-app check.

### Budget benchmark

`npm run bench:large` on both profiles and
`GRIDSCALR_PERF_PROFILE=reference npm run check:performance`:

| Measure | ci (40 p / 4 000 i) | reference (150 p / 15 000 i) | Budget |
| --- | --- | --- | --- |
| Project open | 13.0 ms (was 9.1) | 38.3 ms (was 27.8) | under 10 s |
| p95 edit latency | 21.4 ms (was 23.5) | 61.6 ms (was 73.3) | under 100 ms |
| Serialization p50 / p95 (plain `JSON.stringify`) | 2.7 / 3.1 ms | 18.9 / 20.5 ms | — |
| Page switch p95 | 7.8 ms (was 12.1) | 32.9 ms (was 31.7) | under 100 ms |
| Autosave | 960.8 ms (was 937) | 1 002.9 ms (was 1 017) | under 2 s |
| Markups open | 91.5 ms (was 123.5) | 220.5 ms (was 217.6) | under 2 s |
| JS heap | 98.4 MB (was 114.3) | 97.1 MB (was 81.6) | 2 GB (desktop, manual) |

Project open now includes one seed serialisation of the opened project, which
is why it rose by about 4 ms (CI) and 11 ms (reference); both remain three
orders of magnitude inside the budget. The gate run reported p95 edit 53.0 ms
against the phase 1 gate run's 78.3 ms (**−32.3 %**) with every budget passing:
open 40.4 ms, autosave 986.3 ms, page switch 22.1 ms, UI freeze 229.8 ms,
serialization p95 24.0 ms, heap 90 MB.

`bench:large`'s p95 edit row is the noisiest number in this table: the
20-sample p95 is close to the maximum, and the reference row measured 61.6 and
62.0 ms in two consecutive runs (15–16 % versus phase 1) while the probe and the
budget gate on the same change measured 33–36 %. The probe's 20-edit median and
the gate are the comparison rows; the benchmark stays as the absolute budget
check.

### Run-to-run variance

| Row | Runs (p95 edit) | Variance |
| --- | --- | --- |
| Probe, CI shape, session A | 25.2, 17.8, 17.8 ms | 41.6 % |
| Probe, CI shape, session B | 19.5, 21.4, 19.6 ms | 9.7 % |
| Probe, reference, session A | 51.2, 51.3, 57.2 ms | 11.7 % |
| Probe, reference, session B | 52.5, 53.0, 55.5 ms | 5.7 % |

Session A's CI variance is one slow first run (the same run recorded the only
long-task window); sessions A and B agree within 10 % of each other and both
clear the 20 % improvement bar. Frame p95 is still vsync-clamped (F-146).

### What phase 2 says

- Removing the replacer and the second gesture snapshot cuts serialisation per
  edit by half to three quarters and edit p95 by 27–36 % on both project shapes.
  Per-page sharded snapshots (the phase plan's conditional fallback) were **not**
  needed and are not added.
- The byte-identity tests and the removed replacer answer F-145 without changing
  the snapshot text.
- Project open and the benchmark's absolute p95 remain inside every budget with
  wide headroom.

## Phase 3 — Gesture-time content reuse (2026-11-24)

- Code measured: `perf/3-gesture-reuse`, cut from `main` `e56fa71` (phase 2
  merged). Schema: unchanged (28). No snapshot, export or UI change.
- Shape and viewport: identical to phases 1–2. Both the before and the after rows
  come from the same probe script on this machine — two three-run probes with
  only the application change between them, median reported.

### What changed

- `src/features/gestureRender/` owns gesture-time reuse. During a pan or a wheel
  zoom the content canvas paints the previous item raster with one uniform scale
  and one translation (`rasterTransform`) instead of running `drawContent()`.
  The base viewport is latched when the gesture begins and the pixels are
  captured on the first frame, so repeated frames never compound the transform.
- A pointer pan settles at pointerup; a wheel stream settles 120 ms after the
  last wheel event (`GESTURE_SETTLE_MS`, `src/features/gestureRender/model.ts`).
  A touch pinch settles when the gesture ends. The settle drops the raster and
  runs the existing real redraw plus the existing PDF raster schedule.
- Gesture edges are the existing pointer paths: `NavigationGesture` (space-pan,
  middle-button pan, pan tool, Ctrl + wheel zoom and wheel pan) and
  `TouchNavigation` (two-finger pan and pinch). `CanvasView` gained one adapter
  call in `drawContentStage`, one controller field and two host delegates.
- The `interaction` canvas is untouched: selection handles, the marquee, snapping
  and the draft overlay still draw on every frame.
- `FrameWindow` gained `overGoodMs` (frames at or above 20 ms) and `perf:probe`
  reports it, so the metric F-146 asked for exists (F-146).

### Interaction: before and after

Both rows are the same 5 s scripted pan (120 pointer moves) and three-step
Ctrl + wheel zoom on the browser fallback. Frame samples and long tasks are
cleared after the edit loop, so they cover only the pan and zoom.

| Measure | CI before | CI after | Reference before | Reference after |
| --- | --- | --- | --- | --- |
| `draw-items` p50 | 18.7 ms | 0.0 ms | 19.1 ms | 0.0 ms |
| `draw-items` p95 | 20.4 ms | **4.9 ms (−76.0 %)** | 21.8 ms | **4.9 ms (−77.5 %)** |
| `draw-items` total | 2 130.8 ms | **71.6 ms (−96.6 %)** | 2 083.0 ms | **76.4 ms (−96.3 %)** |
| `draw-items` spans | 124 | 128 | 124 | 128 |
| `draw-items` max | 23.1 ms | 21.4 ms | 28.5 ms | 16.9 ms |
| `canvas-redraw` p95 / total | 20.6 / 2 153.0 ms | 5.1 / 100.1 ms | 21.9 / 2 104.5 ms | 5.1 / 103.4 ms |
| `draw-base` total | 28.0 ms | 30.6 ms | 25.2 ms | 29.4 ms |
| Frame p50 / p95 | 16.7 / 16.7 ms | 16.7 / 16.8 ms | 16.7 / 16.8 ms | 16.7 / 16.8 ms |
| Frame p99 / max | 16.8 / 33.4 ms | 16.8 / 33.3 ms | 16.8 / 49.9 ms | 16.8 / 33.4 ms |
| Frames over 20 ms | 1 | 1 | 3 | 1 |
| Long-task windows | 0 | 0 | 1 | 0 |
| `pdf-render` p95 / total (count) | 26.0 / 78.4 ms (4) | 25.7 / 110.9 ms (6) | 28.3 / 96.4 ms (4) | 22.8 / 103.1 ms (6) |

The four extra `draw-items` spans are the settle redraws (pointerup plus three
zoom settles); they carry the 21.4 ms / 16.9 ms max, while the per-frame paint is
below the 0.1 ms timer resolution at p50 and under 5 ms at p95. `draw-base` is
unchanged within noise. `pdf-render` records two more spans in the same window
because the settles re-arm the existing 90 ms PDF debounce (the first frames
coalesce); its p95 and total stay in the same band, and the PDF raster is now
refreshed after the zoom settles rather than only on the wheel event.

Frames over 20 ms did not regress. Frame p95 stayed vsync-clamped at 16.7–16.8 ms
in every row, exactly as F-146 predicted, which is why the phase compares
`draw-items` and `overGoodMs` instead.

### Alignment evidence

A mid-gesture capture of `#canvas-content` was compared with the settled redraw
at the same viewport (ad-hoc Playwright check, no committed script):

| Gesture | Differing pixels (> 48/255 on any channel) | Max channel delta |
| --- | --- | --- |
| Pan by 120 × 60 px, held | 0 of 639 856 | 13 (resampling of antialiased edges) |
| One Ctrl + wheel step, +24 % zoom | 9 138 of 639 856 (1.4 %) | 255 on high-contrast edges |

The pan case is a pure translation and is pixel-identical apart from resampling.
The zoom case differs only on antialiased item and label edges, which is the
intended softness of an upscaled raster for the settle window; it is not a
misalignment, and the settled frame is the full real redraw.

### Run-to-run variance

Each row above is the median of three runs. The probe reports its own spread for
frames and edits (frame p95 0.6 % in both the before and the after session on
each shape); it does not print a per-run span median, so the `draw-items` rows
above carry no within-session figure. The phase 3 preparation session measured
the untouched tree at 20.8 ms (CI) and 21.3 ms (reference) `draw-items` p95 with
the phase 1 probe, which brackets the before rows and puts the after row far
outside the run-to-run band. The after p95 sits on the 0.1 ms timer resolution,
so it is stable by construction rather than by luck.

### What phase 3 says

- Reusing the content raster removes 76–78 % of `draw-items` p95 and 96 % of its
  total during the scripted pan and zoom, on both project shapes. The 30 %
  acceptance bar is met with a wide margin and no frame regression.
- The resting canvas is unchanged: `test:visual` passes with zero differing
  pixels and no baseline update, because the settle path is the unchanged real
  draw.
- The optimization covers the primary canvas only. The reference pane and the
  split-view divider wheel stay on the real redraw path (F-147).

## Phase 4 — Tile cache for the primary canvas (2026-11-24)

- Code measured: `perf/4-tile-cache`, cut from `main` `f44a213` (phase 3
  merged). Schema: unchanged (28). No export, UI text or snapshot change.
- Both the before and the after rows come from the same updated probe on this
  machine, five runs each and median reported. The "before" tree is the phase 3
  commit (`f44a213`) with only the probe script updated, so the raster metric is
  measured the same way on both sides.
- Viewport: 1440 × 900, DPR 1, browser fallback, Medium Grey. The reference
  shape reshapes markup items and pages, not the source PDF, so the raster
  numbers are the same drawing on both shapes.

### What changed

- `src/features/tileCache/` renders the primary canvas crop as 512 CSS px tiles
  in visible-first order. `model.ts` owns the device-pixel grid, the zoom bucket,
  the 64 MiB RGBA budget and the distance-from-viewport eviction; `controller.ts`
  owns the queue, cancellation and `createImageBitmap` with a canvas fallback;
  `render.ts` is the adapter over the unchanged clipped-viewport math.
- A tile is composed into a full-size composition canvas at its integer device
  origin. The first completed tile is painted immediately; later tiles fill in.
  The raster controller keeps the previous composition until the first new tile
  exists, so a zoom stream never flashes a blank page.
- `src/canvas/raster.ts` now owns scheduling, the generation guard and the
  full-page fallback. `CanvasView` forwards its viewport and draws
  `raster.current`; the read-only reference and comparison canvases stay on the
  full-page path.
- `createImageBitmap` or `OffscreenCanvas` missing → the full-page path is used
  for the life of the page, so WebKitGTK stays on the safe path. A tile render
  error also falls back to the full-page path.
- `perfMonitor` gained `tile-render` and `tile-cache-hit`, and `perf:probe` now
  reports `raster.firstVisibleMs`, `raster.firstRenderMs`, cache bytes, tiles,
  hits and misses. Existing JSON keys are unchanged.

### Raster: before and after

The raster step changes the zoom once by +25 %, waits for the first raster
completion and paints it. `firstVisibleMs` is measured from the view change, so
it includes the canvas's 90 ms coalescing window. `firstRenderMs` is the first
`pdf-render`/`tile-render` span itself. Five runs, median.

| Measure | CI before | CI after | Reference before | Reference after |
| --- | --- | --- | --- | --- |
| Time to first visible raster | 122.7 ms | 132.3 ms (+7.8 %) | 130.0 ms | 126.9 ms (−2.4 %) |
| First render span | 19.8 ms | 22.5 ms | 20.3 ms | 17.7 ms |
| `pdf-render` p95 (pan/zoom window, 6 spans) | 21.8 ms | **20.9 ms (−4.1 %)** | 22.6 ms | **20.6 ms (−8.8 %)** |
| `pdf-render` total (same window) | 98.7 ms | **69.5 ms (−29.6 %)** | 114.5 ms | **70.9 ms (−38.1 %)** |
| `tile-render` p95 / total | — | 21.4 / 71.1 ms | — | 20.0 / 71.9 ms |
| `tile-cache-hit` spans | — | 6 | — | 6 |
| Steady-state cache bytes | 0 (no cache) | **10 645 864 (10.2 MiB)** | 0 | **10 645 864 (10.2 MiB)** |
| Cached tiles / budget | — | 18 / 64 MiB | — | 18 / 64 MiB |
| Cache hits / misses in the measured window | — | 6 / 4 | — | 6 / 4 |
| Frame p95 | 16.8 ms | 16.7 ms | 16.7 ms | 16.7 ms |
| Edit p95 | 18.2 ms | 19.1 ms | 54.3 ms | 51.9 ms |

The time-to-first-visible number is **not** a reliable win on this probe: the
90 ms coalescing window dominates, the crop at the scripted view is only about
2 × 2 tiles, and PDF.js re-traverses the page operator list for every tile. The
run-to-run spread was 4.8–13.4 % across the four rows, so the +7.8 % CI change is
inside the noise band and the −2.4 % reference change is smaller than it. The
repeatable signals are the per-tile raster p95 (−4 to −9 %) and the total raster
work during the zoom stream (−30 to −38 %): each intermediate zoom view renders
its first visible tile and the next view cancels the rest before they run.

### Resting output

`npm run test:visual`: 4 screens, 0 differing pixels, **no baseline change**.
The screenshots mask the canvas, so the raster itself was compared separately
against the phase 3 tree at the same viewport and view (demo project, 1440 × 900):

| View | Differing pixels | Max channel delta |
| --- | --- | --- |
| Zoom 1 | 1 075 of 639 856 (0.17 %) | 10 |
| Zoom 3 | 73 of 639 856 (0.01 %) | 3 |
| Zoom 6 | 185 of 639 856 (0.03 %) | 27 |

The differences are confined to antialiased drawing and label edges: per-tile
PDF.js rasterisation is deterministic within a tile but not bit-identical to one
crop over the same geometry. No seam, offset or blank region was observed. This
is the same class of resampling difference phase 3 recorded for a held zoom
(9 138 pixels, max 255 on high-contrast edges), but here it is at rest and two
orders of magnitude smaller.

### Run-to-run variance

`firstVisibleMs` per run, five runs per row:

| Row | Runs | Spread |
| --- | --- | --- |
| CI before | 122.7, 117.9, 134.4, 118.9, 122.9 ms | 13.4 % |
| CI after | 130.6, 132.3, 132.9, 133.0, 126.6 ms | 4.8 % |
| Reference before | 134.0, 124.9, 121.8, 130.0, 130.9 ms | 9.4 % |
| Reference after | 130.0, 123.2, 126.9, 125.6, 134.9 ms | 9.2 % |

The first-tile render itself varied more (5.7–24.5 ms on the CI after runs),
because the first tile's position and the PDF.js worker schedule decide how much
raster work lands in that one span. The per-tile p95 and the total are the stable
rows.

### Budget benchmark

`check:performance` on both profiles on the phase branch:

| Measure | ci (40 p / 4 000 i) | reference (150 p / 15 000 i) | Budget |
| --- | --- | --- | --- |
| Project open | 11.9 ms | 39.4 ms | under 10 s |
| p95 edit latency | 17.8 ms | 49.5 ms | under 100 ms |
| Page switch p95 | 6.1 ms | 31.6 ms | under 100 ms |
| Autosave | 927.4 ms | 994.2 ms | under 2 s |
| UI freeze | 96.3 ms | 215.9 ms | under 2 s |
| JS heap | 55.6 MB | 97.9 MB | 2 GB (desktop, manual) |

### What phase 4 says

- The primary canvas now paints the visible drawing tile by tile and keeps a
  **64 MiB** cache (measured steady state 10.2 MiB on both shapes). The cache is
  bounded, the reference pane and split view are untouched, and the safe
  full-page path remains the default without the two bitmap APIs.
- Tiles reduce the total raster work during a continuous zoom by 30–38 % because
  a new view cancels the previous view's unfinished queue, and they lower the
  per-tile `pdf-render` p95 by 4–9 %. They do **not** make the first tile faster
  on this probe's small crop: PDF.js walks the whole operator list for each tile,
  so the first visible tile can cost about as much as the monolith. That is F-148.
- The resting screen is unchanged and the visual baseline was not touched. The
  canvas raster differs only on antialiased edges (≤ 0.17 %, max delta 10 at the
  fit view), with no seam or offset.
- The tile path was exercised in Chromium only. WebKitGTK was not available in
  the development environment; a runtime without `createImageBitmap` or
  `OffscreenCanvas` uses the full-page path, and the tile path there is an
  unverified limitation (F-149).


## Scan phase 1 — Cover check, crop margin and cost cadence (2026-11-25)

- Code measured: `main` `8978332` (0.33.6) before, the phase branch after. Both
  trees were extracted to `/tmp` outside the repository and served by the same
  Vite version and the same symlinked `node_modules`, so neither side had an
  environment advantage: running the "after" tree in place and the "before" tree
  as an extracted copy made one worktree several seconds slower at project open
  for reasons unrelated to the change, and that artifact was excluded.
- Scenarios on the scanned page, recorder on, samples cleared per window:
  **A** ten separate 28 px pans inside the crop, **B** one continuous 5 s pan of
  360 px, **C** three Ctrl + wheel zoom-in steps and three zoom-out steps.
  Three runs each, median. Viewport 1440 × 900, DPR 1 and DPR 2.
- `pdf-raster` count and duration come from the named spans; blocked time is the
  recorder's long-task windows (tasks of 50 ms or more).

### Fixture and how it relates to the reported page

`BOTTENPLAN.tif` is not in the repository, so the measurement uses a synthetic
page of the same type and shape: a 2531 × 1685 pt page holding one 10546 × 7020
grayscale scan (74.0 Mpix at 300 dpi) encoded as CCITT G4 in a three-page PDF,
exactly the storage the schema 27 derived PDF uses for a scanned TIF. It is
opened as the demo project's source page, so the same 174 markups sit above it.

The per-raster cost on this fixture is **8–22 ms at DPR 1 and 9–47 ms at DPR 2**,
lower than the reported 46–85 ms on the user's machine. PDF.js decodes
the image once and then composites a cached bitmap, so the remaining cost is
destination pixels and machine speed, not the decode. The reported per-view
cost is therefore **not reproduced**, and no speedup claim is made for the
reported page. What this phase changes is measurable on any page: how many
renders a pan causes, and when during a gesture they start.

### Ten short pans inside the crop

| Measure | DPR 1 before | DPR 1 after | DPR 2 before | DPR 2 after |
| --- | --- | --- | --- | --- |
| `pdf-raster` spans | 9 | **0** | 10 | **0** |
| `pdf-raster` total | 97.1 ms | 0 ms | 161.8 ms | 0 ms |
| `pdf-raster` p50 / p95 | 10.7 / 16.6 ms | — | 18.5 / 21.7 ms | — |
| Blocked long tasks | 0 | 0 | 0 | 0 |

Every step stayed inside the raised 300 px crop margin, so the raster on screen
already described the view and no PDF.js render ran. Before, the 70 px margin
gave up after three steps and the coalesced cadence re-rendered on almost every
step.

### One continuous 5 s pan of 360 px

"During gesture" counts `pdf-raster` spans that started before `pointerup`, so a
render that only happens at release would show 0 there.

| Measure | DPR 1 before | DPR 1 after | DPR 2 before | DPR 2 after |
| --- | --- | --- | --- | --- |
| `pdf-raster` spans | 62 | **4** | 70 | **4** |
| Started during the gesture | 62 | **4** | 70 | **4** |
| `pdf-raster` total | 614.6 ms | **57.9 ms** | 834.6 ms | **125.6 ms** |
| `pdf-raster` p50 / p95 | 10.1 / 16.4 ms | 12.5 / 16.3 ms | 9.5 / 21.1 ms | 16.0 / 46.9 ms |
| Blocked long tasks (tasks / total / largest) | 0 / 0 / — | 0 / 0 / — | 0–2 / 0–120 / 70 ms | 0–3 / 0–177 / 62 ms |
| Frames over 20 ms / frame max | 0 / 16.8 ms | 0 / 16.8 ms | 44–48 / 66.7 ms | 48–53 / 50.1 ms |

Fewer, larger renders replace many small ones: total raster work falls 91 % at
DPR 1 and 85 % at DPR 2 while the largest single long task stays at or below the
0.33.6 level (70 ms here, 74 ms on the reported run) and far from the 611 ms in
11 tasks seen before 0.33.6. The renders start **during** the gesture at the
measured-cost interval — the binary "wait for the release" rule is gone.

### Zoom in and out (three steps each way)

| Measure | DPR 1 before | DPR 1 after | DPR 2 before | DPR 2 after |
| --- | --- | --- | --- | --- |
| `pdf-raster` spans | 15 | **6** | 12 | **6** |
| `pdf-raster` total | 148.1 ms | **60.6 ms** | 139.6 ms | **82.0 ms** |
| `pdf-raster` p50 / p95 | 8.8 / 15.6 ms | 8.4 / 15.4 ms | 9.4 / 18.7 ms | 13.3 / 14.9 ms |
| Blocked long tasks (tasks / total / largest) | 0 / 0 / — | 0 / 0 / — | 1–3 / 57–172 / 61 ms | 2–3 / 106–192 / 69 ms |

The zoom loop is the one row where the heavier DPR 2 profile pays a little: the
same six renders replace twelve, but three long tasks appear where there were
one to three, and the total blocked time rises by about 50 ms across the whole
loop. The largest single task is 69 ms against 61 ms before — still under the
74 ms reported level and two orders of magnitude below the pre-0.33.6 stall.
This is the deliberate trade of the phase: a raster may now start during the
gesture, and a raster that starts is a long task.

### The documented demo project (vector page)

`npm run perf:probe`, three runs, median, same machine and the same extracted
trees:

| Measure | Before | After |
| --- | --- | --- |
| `pdf-raster` spans / total / p95 | 73 / 1354.1 ms / 27.1 ms | **6 / 77.1 ms / 21.9 ms** |
| `pdf-render` spans / total | 75 / 1276.4 ms | 6 / 92.3 ms |
| Time to first visible raster | 59.0 ms | 45.3 ms |
| Frame p50 / p95 / max | 16.7 / 16.8 / 16.8 ms | 16.7 / 16.7 / 16.8 ms |
| Frames over 20 ms | 0 | 0 |
| `draw-items` p95 / total | 3.5 / 240.1 ms | 3.3 / 244.4 ms |
| Blocked long-task windows | 0 | 0 |
| JS heap | 56.8 MB | 56.8 MB |

Most of the 73 pre-change renders were the pan at the fit view, where the whole
page is already on screen and the cover check now proves it. No regression in
frames, edit cost or heap.

### Resting output and checks

- `npm run test:visual`: 4 screens, 0 differing pixels, **no baseline change**.
- `npm run test:canvas`: green, including crop and split view.
- `npm run test:ui`, `test:a11y`, `test:touch-targets`, `test:ui-scale`: green.
- `npx vitest run`: 188 files, 1950 tests green (new: `tests/rasterController.test.ts`
  and the pure cadence/cover tests in `tests/rasterCache.test.ts`).
- `npm run check:performance` (CI profile): every budget passes; p95 edit
  19.0 ms, open 12.2 ms, autosave 957.2 ms, page switch 6.4 ms, UI freeze
  105.8 ms, heap 54.1 MB.

### Observation, not attributed to this phase

On the scanned fixture the first tile a page ever renders can cost several
seconds, because PDF.js decodes and downsamples the whole 74 Mpix image for it
and 0.33.6 disables tiling only *after* that first tile returns. The clean
extracted-tree comparison measured the same cost on both sides (482–523 ms
before, 524–548 ms after at the fit view, with one outlier run at 6.6 s on each
side), so this phase neither causes nor fixes it. It is the size gate proposed
for F-148: decide from the page's planned raster pixels, not from a first tile
that has already paid the decode.

### What phase 1 says

- A pan that stays inside the rendered crop is now free: 0 renders instead of
  9–10 for ten steps, and 4 instead of 62–70 for a five-second pan.
- The 300 px margin is the reason a short pan never leaves the crop, and the
  cover check is the reason a pan that leaves it still renders only when it has
  to. Total raster work on the scripted pan fell 85–91 %.
- The cost-aware cadence removes the wait-for-release rule: every render in the
  measured window started while the pointer was still down, paced at 1.5 × the
  last measured cost between 220 and 600 ms.
- Blocked time stays bounded: largest single long task 69 ms after against
  70 ms before at DPR 2, no long tasks at all at DPR 1. The zoom loop on the
  heavier profile gains one extra long task; that is the measured cost of
  filling during the gesture instead of after it.
- Rest output and the visual baseline are unchanged, and the per-raster cost of
  the fixture itself is unchanged — this phase changes how often a render runs,
  not how expensive one render is. Phase 2's per-zoom level cache is the change
  that targets the render cost itself.

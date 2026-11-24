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


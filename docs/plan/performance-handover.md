# Performance 1 handover

Plan: `/root/.opencode/plan/2026-11-24-performance-1-4.md` (maintainer plan,
kept outside the repository). Epic: `Performance 1: measured edit and render
cost`. No release milestone: this effort is not release scope, so no version
bump, tag, release or `site/` change is part of it.

Schema 28 stays the current development schema. No persisted field changes.

## Phase 1 — Baseline and a repeatable probe

- Issue: [#348](https://github.com/MajorJohnDoe/gridscalr/issues/348)
- PR: `pending` (branch `perf/1-baseline`, base `main` `2e1df8d`)
- Commit: `pending`
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

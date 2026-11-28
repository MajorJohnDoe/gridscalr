# Open-pages tab strip — handover

**Epic:** [#398](https://github.com/MajorJohnDoe/gridscalr/issues/398)
**Milestone:** none (backlog; no release committed)
**State:** phase 1 implemented in PR [#402](https://github.com/MajorJohnDoe/gridscalr/pull/402). The first review returned fail (fixed in `dea29ed`); the second review returned fail at `87e4f37` and the final fixes are in the commit containing this handover. Final review pending.

## Locked design

See the epic. N4 row: 35 px between title row and workspace, label **Öppna**,
scrollable tabs, hint and `»` overflow, no page count. Active tab is neutral
slate `color-mix(--surface-tab 70%, --bg-deep)` with a 1 px inset highlight,
white text and a jade numeral. Session-only, schema stays 28.

## Phase queue

| Phase | Issue | Branch | Status |
| --- | --- | --- | --- |
| 1 — model, controller and the N4 row | [#399](https://github.com/MajorJohnDoe/gridscalr/issues/399) | `feat/open-pages-row` | PR [#402](https://github.com/MajorJohnDoe/gridscalr/pull/402) — final fixes committed, final review pending |
| 2 — menus and keyboard | [#400](https://github.com/MajorJohnDoe/gridscalr/issues/400) | `feat/open-pages-menus` | not started |
| 3 — lifecycle, Playwright flow and docs | [#401](https://github.com/MajorJohnDoe/gridscalr/issues/401) | `feat/open-pages-lifecycle` | not started |

## Decisions

- Tabs are controller-owned session state; never serialized, no schema change.
- One preview tab at most; pinned tabs never become preview except through the
  tab menu.
- Double-click on the page name keeps rename; double-click on the rest of the
  card pins.
- Nearest neighbour = the tab now at the removed index, else the one before.
- Activating an already pinned page leaves the preview tab untouched.
- Page changes funnel through the existing store notification; no second
  navigation path.

## Phase 1 — model, controller and the N4 row

**Issue:** [#399](https://github.com/MajorJohnDoe/gridscalr/issues/399)
**PR:** [#402](https://github.com/MajorJohnDoe/gridscalr/pull/402)
**Commits:** `873189d` (feature), `67c61d4` (first smoke-bound fix), `dea29ed` (first review fixes), `87e4f37` (handover record), final fixes — the commit that contains this handover (PR #402 head)

Completed:

- `src/features/openPages/` with `index.ts` as the only public surface:
  `model.ts` (pure open set, preview, pin, close, neighbour and prune rules),
  `controller.ts` (store subscription, session lifecycle and tab commands) and
  `ui.ts` (the row, tabs, overflow list and focus/scroll preservation).
- A 35 px full-width row as its own `auto` grid row between the title row and
  the workspace. It collapses and is `hidden` with no project or zero pages.
- One preview tab per project, seeded on open and cleared on close. Every
  existing page-change path updates it through the same store notification.
- Pinning, close, prune and neighbour activation; page reorder never reorders
  tabs. Tabs are never serialized and `schemaVersion` remains 28.
- Page card click previews, a quick second click pins, double-click on the page
  name keeps rename.
- `role=tablist`/`role=tab`, `aria-selected`, a navigation landmark, a focus
  ring, `aria-label` on close and 24 × 24 close/overflow controls that stay
  visible with a coarse pointer.

Modules: `src/features/openPages/{index,model,controller,ui,pageCardPin}.ts`,
`src/styles/openPages.css`, `src/ui/shell.ts` (mount and refs only),
`src/app/App.ts` (construct, start, stop and the pin action only),
`src/ui/pageList.ts` (the card click/pin gesture).

Decisions: the row is a navigation landmark so it is axe-clean; the active tab
uses `--text` rather than a literal white so Light Green stays readable; the
page-card pin gesture is a 400 ms same-page click pair because the page change
rebuilds the Pages panel between the two clicks of a native double-click.

Review fix cycle (`dea29ed`):

- Project-open detection now uses `ProjectStore.projectLoadId`, a monotonic
  counter incremented only in `loadProject`/`unloadProject` and read through
  `Store`. Gesture cancel, undo/redo and structural page changes keep the tabs
  and prune; only a real open or close reseeds.
- Close controls moved out of the tablist into a sibling overlay inside the
  shared scroll track, positioned over each tab. The tablist now owns only
  `role="tab"` elements, so axe `aria-required-children` passes with two tabs.
  `test:a11y` and `test:touch-targets` now build a real two-tab row.
- The preview tab name is italic and the active numeral chip is jade-outlined
  with `var(--accent)`; all four visual baselines were regenerated.
- The page-card 400 ms rule moved to
  `src/features/openPages/pageCardPin.ts` and is exported from the feature
  surface; `src/ui/pageList.ts` only calls it.
- The row skips a rebuild when the tab signature is unchanged and scrolls the
  active tab into view only when the active page changed.
- `scripts/smoke-ui.mjs` now uses a measured 1.35× bound for the Markups
  fit-to-item zoom. Measured with the 35 px row: 0.6113 → 0.8694, 1.42×.

Findings: none new. The first-review P1/P2/P3 findings are fixed in `dea29ed`.

Second review fix cycle (this commit):

- Explicit `grid-row` placement for topbar, open-pages row, workspace and
  status bar in `src/styles/base.css`. A hidden row now leaves a 0-height auto
  track; the status bar keeps `--status-h` (28 px) and the workspace keeps the
  free space. The old implicit placement put the workspace in the `auto` track
  and squeezed the status bar to 1 px when the row was hidden.
- `scripts/smoke-ui.mjs` now asserts the hidden-row shell on the welcome screen
  and a zero-page project at 1440 × 900 and 1024 × 700: row hidden and 0 height,
  status bar 28 px with visible children, workspace non-zero. This state had no
  gate before.
- Hover state is re-applied after a row render, so a hovered close control keeps
  `is-hover` across the rebuild. `OpenPagesRow.dispose()` disconnects the
  `ResizeObserver` and removes the pointer listeners; `OpenPagesController`
  exposes `dispose()` and its tests use it.
- The tab button now fills the whole tab cell, so the 8 px left padding and
  32 px close reserve are clickable for navigation while the inner button keeps
  the ARIA/keyboard model. Verified with a real click 4 px inside the cell's
  left edge (page 2 → page 1).

Budgets: the new module files are 16–210 lines. `App.ts` is +10 wiring lines
(existing budget 1111 → 1121) and `src/state/store.ts` is +3 for the read-only
getter (410 → 413). No new file or directory exception was added.


Checks: local gate green (`check:versions`, `check:file-budgets`,
`check:write-sites`, `check:modules`, `check:cycles`, `check:security`,
`check:actions`, `check:dependencies`, `check:docs`, `format:check`, `lint`,
`check:i18n`, `check:themes`, `npx tsc --noEmit`); focused Vitest
`openPagesModel`, `openPagesUi`, `openPagesController`, `pageList` (53 tests);
`test:visual`, `test:a11y` and `test:touch-targets` with a two-tab row,
`test:ui-scale`, `test:ui` including the hidden-row shell gate for the welcome
screen and a zero-page project at both viewport sizes, `test:import`,
`test:canvas`, `test:count`, `test:touch` and `test:csp`. The
Markups fit-to-item zoom assertion in `scripts/smoke-ui.mjs` uses a 1.35× bound
measured from 0.6113 → 0.8694 (1.42×) with the 35 px row. The symlinked
`node_modules` outside the worktree prevents `tests/appFlows.test.ts` and
`tests/pageMenu.test.ts` from resolving the PDF.js worker locally; CI uses a
real `node_modules`.

### Review

- First review: **fail** on project-open detection, tablist close markup and N4
  styling. Fixed in `dea29ed`.
- Second review at `87e4f37`: **fail** on the hidden-row shell grid (status bar
  squeezed to 1 px) plus hover persistence, observer disposal, the dead tab-cell
  padding and the stale commit history. Fixed in the commit containing this
  handover.
- Final independent review pending. The phase is not merged until it passes.

Next: phase 2 — [#400](https://github.com/MajorJohnDoe/gridscalr/issues/400),
tab context menu, page-list menu entries and keyboard navigation.

## Phase 2 — menus and keyboard

Not started.

## Phase 3 — lifecycle, Playwright flow and documentation

Not started.

## Findings

None.

## Checks

Phase 1: see the phase entry above. All local-gate, focused-test, visual,
accessibility (two-tab row), touch-target (two-tab row), UI-scale and
browser-flow checks, including the hidden-row shell gate, are green on the final
fixes. CI reruns on the pushed head.

# Open-pages tab strip — handover

**Epic:** [#398](https://github.com/MajorJohnDoe/gridscalr/issues/398)
**Milestone:** none (backlog; no release committed)
**State:** phase 1 is merged in PR [#402](https://github.com/MajorJohnDoe/gridscalr/pull/402) as `b8d48c7`, after a final delta review returned **pass** at `aa8d35a`. Phase 2 is implemented in PR [#403](https://github.com/MajorJohnDoe/gridscalr/pull/403) at `8e6d15f`, awaiting review.

## Locked design

See the epic. N4 row: 35 px between title row and workspace, label **Öppna**,
scrollable tabs, hint and `»` overflow, no page count. Active tab is neutral
slate `color-mix(--surface-tab 70%, --bg-deep)` with a 1 px inset highlight,
white text and a jade numeral. Session-only, schema stays 28.

## Phase queue

| Phase | Issue | Branch | Status |
| --- | --- | --- | --- |
| 1 — model, controller and the N4 row | [#399](https://github.com/MajorJohnDoe/gridscalr/issues/399) | `feat/open-pages-row` | merged in [#402](https://github.com/MajorJohnDoe/gridscalr/pull/402) as `b8d48c7` |
| 2 — menus and keyboard | [#400](https://github.com/MajorJohnDoe/gridscalr/issues/400) | `feat/open-pages-menus` | PR [#403](https://github.com/MajorJohnDoe/gridscalr/pull/403), awaiting review |
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
**Merged:** `b8d48c7` (squash)
**Commits:** `873189d` (feature), `67c61d4` (first smoke-bound fix), `dea29ed` (first review fixes), `87e4f37` (handover record), `f25847d` (hidden-row and follow-up fixes), `aa8d35a` (final P2/P3 fixes). Squash-merged as `b8d48c7`.

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
page-card pin gesture is a 600 ms same-page click pair because the page change
rebuilds the Pages panel between the two clicks of a native double-click; a
native card-body double-click also pins when the card survives both clicks.

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

Second review fix cycle (`f25847d`):

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

Final targeted fix cycle (`aa8d35a`):

- The hidden-row smoke gate now asserts the actual workspace relationship
  `viewport − topbar − status bar` within 1 px, at 1440 × 900 and 1024 × 700 on
  both the welcome screen and a zero-page project.
- The page-card pin fallback window is 600 ms (the platform interval is not
  exposed to the web layer; 600 ms covers the 500 ms Windows default), and a
  native `dblclick` on the card body also pins when the DOM survives. A native
  double-click on the name still renames; modified clicks never pin.
- `test:ui` now checks the two-tab geometry at 1440 × 900 and 1024 × 700: each
  close control is 24 × 24 and inside its tab cell, the right-hand hint stays
  visible, and a click 4 px inside the first cell's left edge navigates.
- The preview tab carries a visually hidden "Preview tab" label in addition to
  the italic name and pin icon, so the state is exposed to screen readers.
- The ≤1100 px rule that hid the right-hand hint was removed; the hint stays
  visible at 1024 px and the 200 % UI-scale width still fits.

Budgets: the new module files are 16–210 lines. `App.ts` is +10 wiring lines
(existing budget 1111 → 1121) and `src/state/store.ts` is +3 for the read-only
getter (410 → 413). No new file or directory exception was added.


Checks: local gate green (`check:versions`, `check:file-budgets`,
`check:write-sites`, `check:modules`, `check:cycles`, `check:security`,
`check:actions`, `check:dependencies`, `check:docs`, `format:check`, `lint`,
`check:i18n`, `check:themes`, `npx tsc --noEmit`); focused Vitest
`openPagesModel`, `openPagesUi`, `openPagesController`, `pageList` (57 tests);
`test:visual` (no baseline change), `test:a11y` and `test:touch-targets` with a
two-tab row, `test:ui-scale`, `test:ui` including the hidden-row shell gate at
both viewport sizes and both states and the two-tab geometry/left-edge click,
`test:import`, `test:canvas`, `test:count`, `test:touch` and `test:csp`. The
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
  padding and the stale commit history. Fixed in `f25847d`.
- Final review at `f25847d`: **pass-with-findings** (no P1; the hidden-row gate
  did not prove the workspace free space, and the 400 ms pin window was narrower
  than a real double-click, plus four P3s). Fixed in `aa8d35a`.
- Delta review at `aa8d35a`: **pass**, no findings. Merged as `b8d48c7`.

Next: phase 2 — [#400](https://github.com/MajorJohnDoe/gridscalr/issues/400),
tab context menu, page-list menu entries and keyboard navigation.

## Phase 2 — menus and keyboard

**Issue:** [#400](https://github.com/MajorJohnDoe/gridscalr/issues/400)
**PR:** [#403](https://github.com/MajorJohnDoe/gridscalr/pull/403)
**Commit:** `8e6d15f` (feature and tests; the handover update follows in the same PR)

Completed:

- Tab context menu from right-click, Shift+F10 and the ContextMenu key. Items
  are rebuilt from state on every open: Pin tab (preview only), Preview (pinned
  only), Close tab and Close other tabs, both disabled for a single tab. Labels
  and app icons; the shared `showPopover` / `showPopoverAt` component is reused.
- Preview converts a pinned tab to the single preview and removes the previous
  preview. Close others keeps only the target tab and activates it. Tab commands
  never change the project's pages.
- Page card menu gains Preview and Pin as tab directly after Go to page, with
  only true no-ops disabled. Existing entries keep their relative order and
  behaviour, including read-only navigation.
- Roving tabindex with exactly one tab in the tab order; left/right arrows move
  focus with wrap, Enter/Space activate, Delete/Backspace close when closable,
  and focus returns to the active tab after a close or a menu command.
- The close controls keep their `aria-label` and 24 × 24 target; the tab menu
  disables rather than hides an unavailable action.

Modules: `src/features/openPages/menu.ts` (pure menu models and disabled rules),
`model.ts` (preview conversion, promote, close others, tab info, keyboard map),
`controller.ts` (commands and menu opening), `ui.ts` (pointer/keyboard wiring and
roving focus), `index.ts` (public surface). `src/features/pageMenu/menu.ts`
merges the two page-card entries through the openPages surface;
`src/ui/panels.ts` and `src/app/App.ts` gained two one-line delegations.

Decisions: left/right arrows wrap at both ends (documented in a test), and a
pinned tab converted to preview keeps its position while the old preview tab is
removed. The page card menu keeps its read-only navigation and adds the
session-only tab entries there too, because they never write the project.
`App.ts` rises by two wiring lines (existing legacy budget 1121 → 1123; no new
file or directory exception).

Findings: none new. The phase 1 focus fallback used a selector that matched no
element after a close; fixed in scope as part of "focus stays visible after
close".

Checks: local gate green (`check:versions`, `check:file-budgets`,
`check:write-sites`, `check:modules`, `check:cycles`, `check:security`,
`check:actions`, `check:dependencies`, `check:docs`, `format:check`, `lint`,
`check:i18n`, `check:themes`, `npx tsc --noEmit`); focused Vitest
`openPagesModel`, `openPagesMenu`, `openPagesKeyboard`, `openPagesController`,
`openPagesUi`, `pageMenu`, `pageList` (104 tests); `test:a11y`,
`test:touch-targets`, `test:ui-scale` and `test:ui`. `test:visual` not needed:
no captured screen changed. The pageMenu suite needs the temporary Vite config
with `server.fs.allow` while `node_modules` is a symlink; CI uses a real
`node_modules`.

Next: phase 3 — [#401](https://github.com/MajorJohnDoe/gridscalr/issues/401),
lifecycle proof, the focused Playwright flow, user-guide prose and screenshots.

## Phase 3 — lifecycle, Playwright flow and documentation

Not started.

## Findings

None.

## Checks

Phase 1: see the phase entry above. All local-gate, focused-test, visual,
accessibility (two-tab row), touch-target (two-tab row), UI-scale and
browser-flow checks, including the hidden-row shell gate, are green on the final
fixes. CI reruns on the pushed head.

Phase 2: local gate and focused Vitest green; `test:a11y`, `test:touch-targets`,
`test:ui-scale` and `test:ui` green. No visual baseline change. CI is
authoritative on the PR head.

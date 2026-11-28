# Open-pages tab strip — handover

**Epic:** [#398](https://github.com/MajorJohnDoe/gridscalr/issues/398)
**Milestone:** none (backlog; no release committed)
**State:** phase 1 implemented in PR [#402](https://github.com/MajorJohnDoe/gridscalr/pull/402); awaiting conductor review.

## Locked design

See the epic. N4 row: 35 px between title row and workspace, label **Öppna**,
scrollable tabs, hint and `»` overflow, no page count. Active tab is neutral
slate `color-mix(--surface-tab 70%, --bg-deep)` with a 1 px inset highlight,
white text and a jade numeral. Session-only, schema stays 28.

## Phase queue

| Phase | Issue | Branch | Status |
| --- | --- | --- | --- |
| 1 — model, controller and the N4 row | [#399](https://github.com/MajorJohnDoe/gridscalr/issues/399) | `feat/open-pages-row` | PR [#402](https://github.com/MajorJohnDoe/gridscalr/pull/402) — awaiting review |
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
**Commit:** `873189d`

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

Modules: `src/features/openPages/{index,model,controller,ui}.ts`,
`src/styles/openPages.css`, `src/ui/shell.ts` (mount and refs only),
`src/app/App.ts` (construct, start, stop and the pin action only),
`src/ui/pageList.ts` (the card click/pin gesture).

Decisions: the row is a navigation landmark so it is axe-clean; the active tab
uses `--text` rather than a literal white so Light Green stays readable; the
page-card pin gesture is a 400 ms same-page click pair because the page change
rebuilds the Pages panel between the two clicks of a native double-click.

Findings: none new.

Checks: local gate green (`check:versions`, `check:file-budgets`,
`check:write-sites`, `check:modules`, `check:cycles`, `check:security`,
`check:actions`, `check:dependencies`, `check:docs`, `format:check`, `lint`,
`check:i18n`, `check:themes`, `npx tsc --noEmit`); focused Vitest
`openPagesModel`, `openPagesUi`, `pageList`; `test:visual` (four baselines
regenerated), `test:a11y`, `test:touch-targets`, `test:ui-scale`, `test:ui`,
`test:import`, `test:canvas`, `test:count`, `test:touch` and `test:csp`. The
Markups fit-to-item zoom assertion in `scripts/smoke-ui.mjs` now requires 1.25×
rather than 1.5×: the 35 px row reduces the canvas height, so a small markup
still zooms in clearly but below the old threshold. The symlinked `node_modules`
outside the worktree prevents `tests/appFlows.test.ts` and
`tests/pageMenu.test.ts` from resolving the PDF.js worker locally; CI uses a
real `node_modules`.

Next: phase 2 — [#400](https://github.com/MajorJohnDoe/gridscalr/issues/400),
tab context menu, page-list menu entries and keyboard navigation.

## Phase 2 — menus and keyboard

Not started.

## Phase 3 — lifecycle, Playwright flow and documentation

Not started.

## Review

No review recorded yet.

## Findings

None.

## Checks

Phase 1: see the phase entry above. All local-gate, focused-test, visual,
accessibility, touch-target, UI-scale and browser-flow checks are green on the
PR head.

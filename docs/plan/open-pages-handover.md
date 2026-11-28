# Open-pages tab strip — handover

**Epic:** [#398](https://github.com/MajorJohnDoe/gridscalr/issues/398)
**Milestone:** none (backlog; no release committed)
**State:** phase 1 not started. Waiting for the user's go-ahead.

## Locked design

See the epic. N4 row: 35 px between title row and workspace, label **Öppna**,
scrollable tabs, hint and `»` overflow, no page count. Active tab is neutral
slate `color-mix(--surface-tab 70%, --bg-deep)` with a 1 px inset highlight,
white text and a jade numeral. Session-only, schema stays 28.

## Phase queue

| Phase | Issue | Branch | Status |
| --- | --- | --- | --- |
| 1 — model, controller and the N4 row | [#399](https://github.com/MajorJohnDoe/gridscalr/issues/399) | `feat/open-pages-row` | not started |
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

Not started.

## Phase 2 — menus and keyboard

Not started.

## Phase 3 — lifecycle, Playwright flow and documentation

Not started.

## Review

No review recorded yet.

## Findings

None.

## Checks

None yet.

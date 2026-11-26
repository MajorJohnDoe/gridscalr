# Foundation findings

**A live register of open work, not a history.** An entry exists because someone
must act on it. When it is fixed, or accepted as a trade-off, it leaves this
file.

If the code and an entry disagree, stop and surface the conflict rather than
silently choosing one.

## Rules

1. Fix a small, in-scope problem immediately; do not record it here.
2. Record anything larger as **one row** in the table below: ID, severity, one
   sentence and an owner issue.
3. Every open entry names a live GitHub issue. No issue, no entry — open the
   issue first.
4. An accepted trade-off belongs in [`../limitations.md`](../limitations.md)
   (user-facing) or an ADR (internal), not here.
5. Keep this file within one screen. Over about 120 lines is a defect, not a
   state.

Only `open` entries appear here. A fixed entry and an accepted decision are
history: they live in [`archive/foundation-findings.md`](archive/foundation-findings.md)
and `docs/limitations.md`.

## Open

| Finding | Severity | Problem | Issue |
| --- | --- | --- | --- |
| F-126 | P4 | A schedule total on a hidden field is calculated but has no cell to render in; the builder only warns. | [#383](https://github.com/MajorJohnDoe/gridscalr/issues/383) |
| F-137 | P3 | Flyouts and popovers sit outside the dialog stack, so Escape is routed by a CSS class-name lookup. | [#383](https://github.com/MajorJohnDoe/gridscalr/issues/383) |
| F-140 | P3 | The dock table and the quantity report do not share the placed table's band palette. | [#383](https://github.com/MajorJohnDoe/gridscalr/issues/383) |
| F-144 | P2 | A new foundation feature directory gets 700 lines of gate headroom although the documented limit is 400. | [#384](https://github.com/MajorJohnDoe/gridscalr/issues/384) |
| F-147 | P3 | The read-only reference pane redraws every item during a split-view pan. | [#385](https://github.com/MajorJohnDoe/gridscalr/issues/385) |
| F-149 | P2 | The tile path is feature-detected but never verified on WebKitGTK or WKWebView. | [#385](https://github.com/MajorJohnDoe/gridscalr/issues/385) |

## History

Every resolved entry, with its evidence, decision and resolution, is in
[`archive/foundation-findings.md`](archive/foundation-findings.md); search the
finding ID. Accepted trade-offs are also stated in
[`../limitations.md`](../limitations.md) and the ADRs.

F-148 (one PDF.js operator-list walk per tile) was accepted on 2026-11-26 with
the Performance 1 phase 4 measurement: tiles cut total raster work during a zoom
stream by 30–38 % but did not improve first-tile latency, so operator-list
sharing is not pursued.

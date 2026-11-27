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
| F-150 | P3 | The Windows WebView2 tiled raster differs from the whole-page path by 2.3–4.7 % at rest, with no blank or offset found. | [#389](https://github.com/MajorJohnDoe/gridscalr/issues/389) |

## History

Every resolved entry, with its evidence, decision and resolution, is in
[`archive/foundation-findings.md`](archive/foundation-findings.md); search the
finding ID. Accepted trade-offs are also stated in
[`../limitations.md`](../limitations.md) and the ADRs.

F-148 (one PDF.js operator-list walk per tile) was accepted on 2026-11-26 with
the Performance 1 phase 4 measurement: tiles cut total raster work during a zoom
stream by 30–38 % but did not improve first-tile latency, so operator-list
sharing is not pursued.

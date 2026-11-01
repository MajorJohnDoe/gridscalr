# ADR 0005: Large-project performance budgets

- Status: Accepted
- Date: 2026-11-01
- Deciders: GridScalr maintainer
- Supersedes: none

## Context

GridScalr must handle large drawing sets and many objects without becoming slow.
Current risks:

- the Markups table builds every row in the DOM,
- undo history stores up to 80 full JSON snapshots,
- autosave serialises the whole project,
- canvas content iterates every item on the page without viewport culling,
- embedded images and OCR data increase project size.

The exact customer limit is unknown, so 1.0 needs a defined reference project and
measurable budgets rather than an open-ended promise.

## Decision

### Reference project

Use a reproducible synthetic or fixture-based project for performance work:

- 100–200 pages,
- 10,000–20,000 markup items,
- 50–100 embedded images,
- 0.5–1 GB of referenced source PDFs,
- several categories, rooms and count types.

The fixture is generated or assembled deterministically and never contains
customer data.

### Initial budgets

The first budgets are:

- p95 edit latency under 100 ms,
- project open under 10 seconds on a current desktop,
- autosave under 2 seconds,
- package creation/unpacking of a 1 GB project under 60 seconds,
- memory under 2 GB,
- no UI freeze over 2 seconds without progress and cancel.

Budgets are measured on Windows, macOS and Linux and may be adjusted once with a
recorded decision, not silently.

### Required architecture work

- Virtualise the Markups table and any long layer/page lists.
- Replace or adapt full-snapshot history for large projects. Options include an
  adaptive history size, compressed snapshots or inverse patches.
- Reduce full-project autosave work, for example through compression, batching or
  an incremental format.
- Add viewport culling for canvas items.
- Add progress and cancel to long operations.
- Keep PDF rendering progressive and thumbnails on demand.
- Avoid loading embedded image payloads into memory before they are visible.

### Measurement

- Add a repeatable benchmark script and report the reference project’s numbers.
- Keep `npm run bench:history` for history regression.
- Run large-project benchmarks in CI or a scheduled workflow.
- Record the device, OS, app version and item count with each result.
- A regression beyond the budget blocks the release candidate.

## Non-goals

- Unlimited project sizes.
- A database backend or cloud sync.
- Optimising every panel before measuring.

## Consequences

- The history and Markups implementations may need structural changes before 1.0.
- Large projects become a supported, tested use case rather than an aspiration.
- Benchmarks add CI or scheduled runtime. This is accepted because large projects
  are a 1.0 requirement.

## Enforcement

- `docs/limitations.md` states the tested limits once measured.
- The 1.0 release checklist includes the reference project and budget results.
- `npm run bench:history` and the large-project benchmark are documented in
  `AGENTS.md` and `docs/architecture.md`.

## Related issues

- [#52](https://github.com/MajorJohnDoe/gridscalr/issues/52) — large projects
- [#55](https://github.com/MajorJohnDoe/gridscalr/issues/55) — release gates

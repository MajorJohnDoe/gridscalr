# ADR 0001: Feature modules

- Status: Accepted
- Date: 2026-10-30
- Deciders: GridScalr maintainer
- Supersedes: none

## Context

`App.ts` and `CanvasView.ts` are the two integration points of the application.
They wire the shell, file flows, shortcuts, canvas interaction and rendering.
Both have grown large because new features were added in place rather than in a
module with its own state, tests and public surface. That makes changes harder to
review, increases merge conflicts and leaves pure logic coupled to the DOM or the
canvas.

The project already separates pure model code (`src/model`), UI controls
(`src/ui`), canvas helpers (`src/canvas`) and I/O (`src/io`). A feature such as
count types or independent reference pages still needs a home for its model, UI,
renderer and lifecycle.

## Decision

New user-facing features live in their own feature module:

```text
src/features/<feature>/
  model.ts       pure data, validation and calculations; covered by Vitest
  ui.ts          DOM controls and dialogs
  renderer.ts    canvas or PDF rendering, no shell wiring
  controller.ts  state and lifecycle when the feature needs it
  index.ts       the public surface used by integration points
```

A feature may omit folders it does not need. It must not import `App.ts` or
`CanvasView.ts`. Cross-feature rules belong in `src/model`, shared canvas helpers
in `src/canvas`, and shared controls in `src/ui`.

`App.ts` and `CanvasView.ts` are integration points, not implementation sites. A
pull request that adds more than roughly 50–100 lines of new business logic to
either file must either move that logic into a feature module or explain in the
pull request why the feature cannot be isolated.

Small fixes, documentation, dependency updates and changes to shared
infrastructure are exempt. They still follow the existing module boundaries.

## Consequences

- Features have an explicit public surface and can be tested without booting the
  shell.
- The application wires features once, which keeps file flows and shortcuts
  readable.
- More files per feature. This is accepted in exchange for smaller diffs and
  clearer ownership.
- Schema changes still go through `src/model/types.ts`, `src/io/projectFile.ts`
  and migration tests; a feature module must not introduce a second project
  format.
- The first feature built this way is custom count types, followed by
  independent page navigation in the reference pane.

## Enforcement

- `AGENTS.md` states the rule for contributors and agents.
- The pull request template asks whether new feature logic lives in a feature
  module.
- Reviewers may ask for a follow-up refactor rather than approving new business
  logic in `App.ts` or `CanvasView.ts`.

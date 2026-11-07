# ADR 0008: Integration module boundaries

- Status: Accepted
- Date: 2026-11-07
- Deciders: GridScalr maintainer
- Supersedes: none
- Related: [0001](0001-feature-modules.md), [#60](https://github.com/MajorJohnDoe/gridscalr/issues/60)

## Context

`src/app/App.ts` (about 2,500 lines) and `src/canvas/CanvasView.ts` (about 4,600
lines) are integration points. They wire the shell, project lifecycle, file
flows, pointer interaction and rendering. ADR 0001 already says new user-facing
features belong in `src/features/<feature>/`, but nothing enforces the rule and
both files keep growing.

The 0.20 refactor will move project lifecycle, document import, search/OCR,
selection commands, canvas pointer state, item rendering, label rendering and
draft editing into modules. Without an explicit boundary, the integration files
will absorb the logic again and the extraction will be temporary.

## Decision

### Target module map

The refactor extracts the following modules. Names may change in the individual
pull requests, but the direction and ownership stay:

| Area | Target module |
| --- | --- |
| Project lifecycle, autosave, recent files and drag-and-drop | `src/app/projectSession.ts` |
| PDF/TIF import, password state and checksum verification | `src/app/documentImport.ts` |
| Search and OCR orchestration | `src/app/searchController.ts` |
| Selection commands and bulk-edit wiring | `src/app/selectionActions.ts` |
| Canvas pointer and gesture state | `src/canvas/pointerController.ts` |
| Item and page rendering | `src/canvas/itemRenderer.ts` |
| Labels, tags and annotation rendering | `src/canvas/labelRenderer.ts` |
| Draft geometry and inline editing | `src/canvas/draftController.ts` |
| Large inspector and Markups sections | `src/ui/inspector/`, `src/ui/markups/` |
| Project-file normalisation | `src/io/projectFile/` validators |

Existing modules (`src/app/exportFlows.ts`, `src/app/referenceController.ts`,
`src/features/*`) keep their public surface and are reused instead of duplicated.

### Dependency direction

```text
features / ui / canvas helpers / app modules
        │
        ▼
model / io / state
```

- `src/features/**`, `src/model/**` and `src/io/**` must not import `App.ts` or
  `CanvasView.ts`.
- `src/ui/**` must not import `App.ts`; a type-only `CanvasView` import is
  allowed for panels that hold a reference instance.
- `src/canvas/**` helpers must not import `CanvasView.ts`.
- `App.ts` and `CanvasView.ts` may import feature modules and wiring helpers.
- A feature module must not import another feature's internal files; cross-feature
  rules go in `src/model`.

### Public surface

- Each extracted module exports named functions or a class with an explicit
  interface. No module reaches into another module's private state.
- `App.ts` and `CanvasView.ts` keep wiring, teardown and the public test bridge.
- New business logic belongs in the module, not in the integration file.

### Enforcement

- `eslint.config.mjs` uses `@typescript-eslint/no-restricted-imports` for the
  import direction. The TypeScript-aware rule is required because it supports
  `allowTypeImports`.
- `max-lines` warns on files above the agreed budget, with a documented exception
  list for files that predate this ADR.
- The exception list must shrink as #60 lands. New modules must not be added to it.
- `docs/architecture.md` and `AGENTS.md` describe the same boundary.

## Consequences

- The integration files become reviewable wiring, and feature work has a stable
  home.
- More modules and more imports per feature. This is accepted for smaller diffs
  and clearer ownership.
- The type-only `CanvasView` import in `src/ui/splitView.ts` stays valid; a
  runtime import would fail lint.
- The refactor must be split into reviewable pull requests with tests before and
  after.

## Non-goals

- A behaviour-changing rewrite.
- New user-facing features in refactor pull requests.
- A big-bang one-PR refactor.
- Moving pure model logic out of `src/model`.

## Related issues

- [#60](https://github.com/MajorJohnDoe/gridscalr/issues/60) — split integration
  modules, UI sections and styles
- [#61](https://github.com/MajorJohnDoe/gridscalr/issues/61) — coverage and
  regression gates

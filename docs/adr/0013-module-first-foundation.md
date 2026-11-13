# ADR 0013: Module-first foundation work

- Status: Accepted
- Date: 2026-11-10
- Deciders: GridScalr maintainer
- Supersedes: none
- Related: [0001](0001-feature-modules.md), [0008](0008-integration-module-boundaries.md), [0010](0010-project-file-integrity.md), [0011](0011-page-list-and-source-replacement.md), [0012](0012-source-storage-modes.md)

## Context

ADR 0001 defines feature modules and ADR 0008 defines the dependency direction
between features, UI, canvas, model, IO and state. Those rules work, but they
are not sharp enough for a new foundation that will touch saving, pages, source
files, recovery and migration.

The existing enforcement is mostly file-size based:

- `file-budgets.json` has a 700-line default and tighter limits for some
  directories.
- `npm run check:file-budgets` blocks files above their budget.
- ESLint warns above 700 lines and disables the warning for legacy files.
- `App.ts` and `CanvasView.ts` remain at roughly 1,000 and 1,500 lines, with
  explicit legacy budgets.

That is not sufficient for new work:

- a 700-line file can still mix model, IO, UI and orchestration;
- not every feature has an `index.ts` public surface;
- cross-feature deep imports are possible;
- `check:file-budgets --update` can record a new oversized file;
- Rust files are outside the budget check;
- model code imported a feature module in several places
  (`src/model/layers.ts` → `features/countTypes/model`, and the symbol lookup in
  geometry, hit-testing and snapping), which was the wrong direction. Phase 15
  moved those shared rules into `src/model`; this remains the rule for new code;
- phase issues do not require a module map before implementation.

The foundation work is the right time to stop repeating those patterns.

## Decision

The foundation work in `docs/plan/robustness.md` follows a **module-first**
layout. This ADR applies to phases 1–7 and to any new module created for them.

### Module form

Every new feature module has a public surface and separates responsibilities:

```text
src/features/<area>/
  index.ts        public surface; the only file other modules may import
  model.ts        pure types, validation and calculations
  controller.ts   orchestration and lifecycle
  ui.ts           DOM, dialogs and rendering
  io.ts           Tauri, file or platform adapter
```

A module may omit parts it does not need, but `index.ts` is required. Split by
responsibility, not by line count. A file named `utils.ts` or `helpers.ts` is not
a home for unrelated logic; name files by their domain (`stamp.ts`,
`conflict.ts`, `backup.ts`, `pageList.ts`, `managedCopy.ts`).

### Dependency direction

```text
app / ui / canvas / features
        │
        ▼
model / io / state
```

- `model` must not import `ui`, `app`, `canvas` or Tauri.
- `ui` must not contain business rules.
- `io` must not contain UI or model decisions.
- `controller` may orchestrate, but does not own DOM rendering.
- A feature imports another feature only through `features/<area>/index.ts`.
- `App.ts` and `CanvasView.ts` remain wiring only.

### Size budgets

- Target: **300 lines** per new file.
- Hard limit: **400 lines** per new file.
- Hard limit: **400 lines** per new foundation feature directory.
- New files must not be added to `LEGACY_LARGE_FILES` or to a per-file
  `file-budgets.json` exception.
- `check:file-budgets --update` may adjust an existing legacy budget but must
  not record a new oversized file. Split the file instead.
- New Rust commands live in a separate Rust module rather than growing
  `src-tauri/src/commands.rs`. Large Rust modules need the same responsibility
  split even though the frontend budget script does not scan them.

The initial directory budgets are:

| Directory | Budget |
| --- | ---: |
| `src/features/saveIntegrity` | 400 |
| `src/features/sessionRecovery` | 400 |
| `src/features/pageModel` | 400 |
| `src/features/sourceStorage` | 400 |
| `src/features/projectIntegrity` | 400 |

### Module maps for the foundation phases

**Phase 1 — save integrity**

```text
src/features/saveIntegrity/
  index.ts
  stamp.ts
  conflict.ts
  backup.ts
  controller.ts
  ui.ts
src-tauri/src/project_write.rs
```

**Phase 2 — recovery and open-elsewhere**

```text
src/features/sessionRecovery/
  index.ts
  autosave.ts
  lease.ts
  recovery.ts
  ui.ts
```

**Phase 3 — page list and document model**

```text
src/model/pages.ts
src/features/pageModel/
  index.ts
  pageList.ts
  replacement.ts
  importMapping.ts
  ui.ts
src/io/projectFile/pages.ts
```

**Phase 4 — source storage**

```text
src/features/sourceStorage/
  index.ts
  mode.ts
  managedCopy.ts
  relink.ts
  ui.ts
src/io/projectFile/sourceStorage.ts
```

**Phase 5 — integrity and project doctor**

```text
src/features/projectIntegrity/
  index.ts
  validator.ts
  repair.ts
  doctor.ts
  ui.ts
```

**Phase 6 — interoperability**

```text
src/pdf/export/ocg.ts
src/pdf/export/annotations.ts
```

**Phase 7 — tests**

```text
tests/robustness/
  saveConflict.test.ts
  pageIdentity.test.ts
  sourceStorage.test.ts
  migrations.test.ts
```

The map may change during implementation, but the phase issue must be updated
before the first production file is added.

### Enforcement

- `file-budgets.json` carries the directory limits above.
- `scripts/check-file-budgets.mjs` refuses to record new files with `--update`.
- `npm run check:modules` verifies that:
  - every existing foundation feature directory has `index.ts`;
  - files outside a foundation feature import only its `index.ts`;
  - no foundation feature reaches into another foundation feature's internals;
  - the Rust shell keeps its command boundary: `rust-commands.json` caps how
    many `#[tauri::command]` functions a module may carry (2 by default, with a
    reviewed cap and reason above it), and every `.rs` file in
    `src-tauri/src` is declared by another module (F-097).
- `eslint.config.mjs` rejects every `src/features` import from `src/model/**`,
  and `tests/modelBoundary.test.ts` walks the model tree and fails, naming the
  file and specifier, when an import resolves into `src/features`.
- `npm run lint` keeps the integration-module import boundaries.
- `AGENTS.md` states the rule for contributors and agents.
- Each phase issue carries its module map and acceptance criteria.
- Larger out-of-scope findings are recorded in
  [`plan/foundation-findings.md`](../plan/foundation-findings.md) and triaged at
  the phase exit.
- A pull request that needs a new file above 400 lines must split it or record an
  explicit decision before implementation.

## Consequences

- Foundation code stays reviewable and testable by responsibility.
- More files per phase. This is accepted in exchange for smaller diffs and clear
  ownership.
- The module-boundary check starts with the new foundation directories and can be
  extended to older features later.
- Shared defaults and pure catalogues live in `src/model`: count-type rules in
  `model/countTypes.ts` and the sign-plus-schematic symbol catalogue in
  `model/symbols/`, each imported by its feature. Model code never imports a
  feature; ESLint and `tests/modelBoundary.test.ts` enforce the direction.
- Rust file growth is a review rule until a Rust budget check exists.

## Non-goals

- A big-bang refactor of every existing feature.
- Moving all current model code into features.
- A formal plugin architecture.
- A line-count target for tests or generated files.

## Related

- [`docs/plan/robustness.md`](../plan/robustness.md)
- ADR [0001](0001-feature-modules.md)
- ADR [0008](0008-integration-module-boundaries.md)
- Issue [#153](https://github.com/MajorJohnDoe/gridscalr/issues/153) and the other
  foundation phase issues

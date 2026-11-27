# Foundation follow-ups handover

Compact phase log for the foundation follow-up effort. Full review detail lives
on each pull request.

## Phase 1 — enforce the 400-line foundation feature budget (F-144)

- Issue: [#384](https://github.com/MajorJohnDoe/gridscalr/issues/384)
- PR: [#386](https://github.com/MajorJohnDoe/gridscalr/pull/386)
- Commit: `af8fa63` (implementation); this handover is updated in the same PR
- Schema: unchanged (28)

### Completed

- `file-budgets.json` gained a single `"src/features": 400` directory budget, so
  every file under `src/features/**` — including a directory added later — is
  capped at 400 through the existing rules, unless `file-budgets.json` carries a
  reviewed exception that predates the rule
  (`src/features/schematics/model/sheetTemplate.ts`, 714 lines, remains the only
  one). No new gate and no Rust change.
- Split the two offenders and the extra file the new budget revealed:
  - `src/features/projectPackage/model.ts` (619 → a small surface over
    `model/format.ts`, `model/archive.ts`, `model/portable.ts`,
    `model/manifest.ts` and `model/failure.ts`).
  - `src/features/projectImport/model.ts` (439 → a surface over
    `model/types.ts`, `model/inspect.ts`, `model/prepare.ts` and
    `model/commit.ts`).
  - `src/features/projectPackage/controller.ts` (495 → 345 + a separate
    `sources.ts` for source paths, missing-source checks and request
    preparation).
- Removed F-144 from the open findings register; the archive entry stays as
  history.
- Updated ADR 0013, `AGENTS.md`, `docs/architecture.md`, `docs/testing.md` and
  `tests/fileBudgetRules.test.ts` so the configuration, docs and test agree on
  400.

### Modules

- `file-budgets.json`, `scripts/file-budget-rules.mjs` (unchanged, reused),
  `tests/fileBudgetRules.test.ts`.
- `src/features/projectPackage/{model.ts,model/*,controller.ts,sources.ts}`.
- `src/features/projectImport/{model.ts,model/*}`.

### Decisions

- Used the existing `directoryMax` prefix match rather than changing
  `defaultMax` or adding a per-directory registration requirement: it is the
  smallest change and covers a feature directory created later.
- Kept `model.ts` as the feature's model surface over a `model/` directory, the
  same pattern as `spaces` and `schedules`, so existing internal and test
  imports keep working.
- `--update` still refuses a new oversized file because a directory-budget
  violation has no exact reviewed exception.

### Findings

- No new findings. F-144 fixed and removed from the open register.
- One in-scope split was required beyond the issue's two named files:
  `projectPackage/controller.ts` (495 lines) became a budget violation once the
  wildcard applied. It is split, not excepted.

### Open questions

- None.

### Checks

- Local gate: `check:versions`, `check:file-budgets`, `check:write-sites`,
  `check:modules`, `check:cycles`, `check:security`, `check:actions`,
  `check:dependencies`, `check:docs`, `format:check`, `lint`, `check:i18n`,
  `check:themes`, `npx tsc --noEmit` — pass.
- Focused: `tests/fileBudgetRules.test.ts`, the project-package/project-import
  suites, `pageFileDrop`, `emptyProject`, `fuzz` and the robustness
  source-storage, page-identity and adversarial-input tests — pass.
- Full `npm test` — 208 files, 2217 tests pass.
- Left to CI: the desktop matrix and the browser suites.

### Next

- Phase 2, [#383](https://github.com/MajorJohnDoe/gridscalr/issues/383).

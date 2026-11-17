# Takeoff UI handover

Plan: `takeoff-ui.md` (maintainer plan shared with the orchestrator). Epic:
[#299](https://github.com/MajorJohnDoe/gridscalr/issues/299).

Schema 28 stays the current development schema. No app version bump, tag or
release is part of this effort.

## Phase 1 — terminology and feedback

- **Issue:** [#300](https://github.com/MajorJohnDoe/gridscalr/issues/300)
- **PR:** [#305](https://github.com/MajorJohnDoe/gridscalr/pull/305), opened from
  `refactor/takeoff-terminology`.
- **Branch:** `refactor/takeoff-terminology`
- **Verified head SHA:** `253bed00c7ad99c49a35aa41699995819b9701aa`
  (implementation `877c621`, documentation `dbeb7bf`, handover `34cf29d`, PR/CI
  record `253bed0`). The branch was rebased onto `main` `b825701` after the
  prerequisite advisory fix, so this is the final head the conductor verified.
  All six PR checks passed on that exact SHA (CI run
  [44077373737](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44077373737)).
- **Merge commit:** `5f1208705e62e074eae74c5e7f93b5411e2a1de1` (squash merged,
  branch deleted).
- **Status:** merged to `main`. The `main` CI run
  [44078536510](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44078536510)
  is green on the merge commit. No schema change, no app version bump, no tag,
  release or `site/` change.

### Completed work

- The right-dock tab, `View` menu entry, tab tooltip and inspector label are
  **Takeoff** / **Mängdning**.
- A saved table is a **takeoff table** / **mängdschema** in the picker, builder
  titles, save and delete messages, placement dialog, inspector, CSV dialog and
  doctor and import diagnostics.
- The procurement dialog and its View menu entry are **Order…** /
  **Beställning…**, including the dialog title, subtitle and its CSV, Excel and
  PDF buttons.
- **Card sources…** / **Kortens källor…** replaces the role dialog entry and
  title; the fields it edits are unchanged.
- **Cards** / **Kort** replaces **Summary cards** in Project settings → Display.
- The built-in category view is labelled **Preview – cannot be placed** /
  **Förhandsgranskning – kan inte placeras** in the picker, caption and a new
  preview block. The block carries a primary **Create takeoff table** /
  **Skapa mängdschema** action.
- Disabled **New takeoff table…**, **Edit takeoff table…**, **Place on
  drawing…**, **Card sources…**, **Export CSV…**, **Import CSV…** and the
  preview create action state why in visible text: no saved takeoff table is
  selected, or the session is read-only. Each disabled control is also linked to
  that text with `aria-describedby`.
- The remaining Swedish comment in `src/styles/tokens.css` is English.
- Both catalogs and the generated message types are updated (3 506 keys). No
  Swedish was added to code, tests, scripts or documentation.
- Shortcut labels, the shortcut catalogue, `docs/shortcuts.md`, both README
  shortcut tables, the user guide, workflows, quick starts, glossary, testing,
  limitations, architecture map and `AGENTS.md` use the new names.
- Four visual baselines are updated because the inspector tab label changed from
  Summary to Takeoff; no other layout changed.

### Modules

- `src/features/schedules/ui/panel.ts`, `ui.ts` chain, `builder.ts`,
  `placement.ts`, `state.ts`, `panelTable.ts`, `index.ts`
- `src/app/summaryFlow.ts`, `src/ui/inspector.ts`, `src/ui/panels.ts`
- `src/styles/schedules.css`, `src/styles/tokens.css`
- `src/i18n/locales/en.json`, `sv.json`, `src/i18n/types.generated.ts`
- `tests/schedulesUi.test.ts`, `schedulePlacementUi.test.ts`,
  `schedulePlacement.test.ts`, `schedulePlacementPdf.test.ts`, `markdown.test.ts`
- `tests/visual/{hero,markups,quantities,count-types}.png`
- `scripts/{ui-harness,accessibility-check,accessibility-rules,touch-target-check,
  ui-scale-check,docs-capture-flow,capture-docs-shots,shortcut-catalogue}.mjs`
- Documentation listed above and `docs/plan/takeoff-handover.md`

### Decisions

- **Create takeoff table is an affordance, not a factory, in Phase 1.** The
  button opens the existing takeoff table builder and writes nothing by itself.
  The standard-table factory, persistence semantics and create-and-place flow
  stay in Phase 3 ([#302](https://github.com/MajorJohnDoe/gridscalr/issues/302)).
- **No settings move.** Project settings keeps its current **Quantities** /
  **Mängder** section until Phase 2 moves it into the Takeoff settings hub as
  **Objects**. Renaming it now would create a second partial objects surface.
- **No CSV/XLSX relabeling.** `File → Export → Quantities to CSV / Quantities to
  Excel… / Quantity report (PDF)` and the workbook **Summary** sheet keep their
  current names because the phase excludes CSV/XLSX changes. They describe the
  quantity report, not the Order dialog or the Takeoff tab.
- **One visible reason line.** The reason is a single paragraph under the
  toolbar rather than one note per control, so the narrow right dock stays
  readable; each disabled control still points at it and carries a specific
  tooltip.
- **Screenshots stay deferred.** The capture catalogue metadata and browser
  locators use the new names, but `docs/screenshots/` is not recaptured until
  Phase 4 ([#303](https://github.com/MajorJohnDoe/gridscalr/issues/303)).

### Findings

- The external Rust advisory `RUSTSEC-2026-0543` for `chrono 0.4.45`
  (informational, unmaintained, no patched release) blocked CI on every branch,
  including untouched `main`. It was accepted with the product owner's approval
  as a reviewed allowlist entry in
  [#307](https://github.com/MajorJohnDoe/gridscalr/pull/307) (tracking issue
  [#306](https://github.com/MajorJohnDoe/gridscalr/issues/306)). Phase 1 was
  rebased onto that `main` and then passed every check. This is a prerequisite,
  not a Phase 1 code change.
- `npm run test:docs-capture` failed once at the count-type add step and passed
  on the next identical run; the failing locator is unrelated to the renamed
  takeoff surfaces.
- No new out-of-scope UI or data finding was added to
  `docs/plan/foundation-findings.md`.

### Checks

Local gate on the implementation + documentation head:

- `check:versions`, `check:file-budgets`, `check:modules` (20 foundation
  features), `check:security`, `check:actions`, `check:docs` (only the expected
  stale-screenshot warning), `format:check`, `lint`, `check:i18n` (3 506 keys),
  `check:themes`, `npx tsc --noEmit`
- `npx vitest run`: 172 files, 1 717 tests passed
- `test:ui`, `test:visual` (4 baselines updated for the tab label),
  `test:a11y` (5 palettes × 15 surfaces, 75 checks, no serious or critical),
  `test:touch-targets` (527 controls, 15 surfaces), `test:ui-scale` (100/150/200 %),
  `test:docs-capture` (35 screenshots in a temporary folder,
  `docs/screenshots/` untouched)
- `check:dependencies` is green after the prerequisite allowlist fix above.

CI is authoritative on the PR head. Run
[44077373737](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44077373737)
on `253bed0` passed every job.

### Conductor verification

- PR [#305](https://github.com/MajorJohnDoe/gridscalr/pull/305) head
  `253bed00c7ad99c49a35aa41699995819b9701aa` matched the worker report; all six
  checks were `success`, the base was `main` and the merge state was
  `CLEAN`/`MERGEABLE`.
- The branch was rebased onto `main` `b825701` (the reviewed chrono allowlist
  fix). The only content difference from the pre-rebase head is the merged
  `security/dependency-allowlist.json` and `tests/dependencyGate.test.ts` pair;
  no phase file changed.
- Conductor re-ran `npx vitest run tests/schedulesUi.test.ts
  tests/schedulePlacementUi.test.ts tests/schedulePlacement.test.ts
  tests/schedulePlacementPdf.test.ts tests/markdown.test.ts
  tests/schema28.test.ts`: 6 files, 70 tests passed. `check:modules`,
  `check:file-budgets` and `check:i18n` are green. `check:docs` passes with
  only the expected stale-screenshot warning, which Phase 4 clears.
- Scope matched the issue: no `src/model/types.ts`, `src/io/projectFile`, version
  file, Tauri manifest or `site/` file changed; `SCHEMA_VERSION` stays 28 and the
  app version stays 0.29.0. No Swedish was added outside
  `src/i18n/locales/sv.json`.
- Disabled controls point at one visible reason paragraph with
  `aria-describedby`; the built-in view is labelled a preview and its create
  action opens the existing builder without writing anything, so standard-table
  creation remains in Phase 3.
- Squash merged as `5f1208705e62e074eae74c5e7f93b5411e2a1de1`; `main` CI is
  green on that commit.

### Next phase

Phase 2 — [Takeoff settings hub #301](https://github.com/MajorJohnDoe/gridscalr/issues/301):
a new `src/features/takeoffSettings/` module with Objects, Fields, Tables and
Cards tabs, deep links, the single Project settings link row and **Fed by** card
sources. No schema change is expected.

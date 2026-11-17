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
- **Verified head SHA:** `29964eeb87d1db4596e2b76bc090c586fb511771`
  (implementation `b11887b`, documentation `8697403`, handover `29964ee`). CI
  on that SHA: frontend tests and build, Rust format and check, and the desktop
  shell on Ubuntu, Windows and macOS all passed; the dependency advisory gate
  failed on the external `chrono` advisory recorded below. This follow-up commit
  adds the PR link and the CI result; the conductor verifies the final branch
  head.
- **Merge commit:** pending.
- **Status:** implementation, tests and documentation complete; PR open; all PR
  checks green except the external dependency advisory gate; conductor
  verification pending.

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

- `npm run check:dependencies` now fails on a new Rust advisory,
  `RUSTSEC-2026-0543` for `chrono 0.4.45`, which is not in
  `security/dependency-allowlist.json`. No Cargo file changed in this phase, so
  this is an external advisory update and not caused by the terminology work.
  It needs a reviewed fix or acceptance before CI can be green; it is a stop
  condition for the conductor, not a Phase 1 change.
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
- `check:dependencies` is **red** on the new `chrono` advisory above. Every other
  local check is green.

CI is authoritative on the PR head. Run
[44072478873](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44072478873)
on `29964ee` passed every job except `Dependency advisory gate`.

### Conductor verification

Pending. The conductor must verify the PR head SHA against this file, every
required check on that exact SHA, the base `main`, the module map and the
acceptance criteria before merging.

### Next phase

Phase 2 — [Takeoff settings hub #301](https://github.com/MajorJohnDoe/gridscalr/issues/301):
a new `src/features/takeoffSettings/` module with Objects, Fields, Tables and
Cards tabs, deep links, the single Project settings link row and **Fed by** card
sources. No schema change is expected.

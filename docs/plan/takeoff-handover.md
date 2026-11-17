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

## Phase 2 — Takeoff settings hub

- **Issue:** [#301](https://github.com/MajorJohnDoe/gridscalr/issues/301)
- **PR:** [#309](https://github.com/MajorJohnDoe/gridscalr/pull/309), opened from
  `feat/takeoff-settings-hub`.
- **Branch:** `feat/takeoff-settings-hub`
- **Verified head SHA:** `f56172d` (product `7709be9`, documentation `144e3b4`,
  handover `f56172d`). CI run
  [44087039782](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44087039782)
  passed every job on that exact SHA. This handover status line is the only change
  after that verified head, so the conductor starts verification from the final
  branch head.
- **Merge commit:** pending.
- **Status:** implementation and documentation committed, PR open, local gate and
  browser gates green. Conductor review fixes are in `18c4269`. No schema change,
  no app version bump, no tag, release or `site/` change.

### Completed work

- One modal, **Takeoff settings** / **Mängdning – inställningar**, with **Objects**,
  **Fields**, **Tables** and **Cards**. The tab layout reuses the shared
  two-column dialog shell, so keyboard focus, the always-visible scrollbar and
  the narrow-dialog rules are the same as Project settings.
- **Objects** lists measured objects (categories) and counted objects (count
  types) in one table with an **Object**, **Type**, **Unit or symbol**,
  **Waste, rounding or pieces**, **Applies to** and **Actions** column. The
  project default category, waste and rounding controls sit above the list.
  Measured rows carry inline rename, up/down reorder and optional waste and
  rounding overrides; counted rows carry inline rename, the glyph picker and
  usage. Delete uses the existing category move-to-target confirmation and the
  existing count-type reassignment confirmation. **Add object** chooses Measured
  or Counted from one control. Every mutation is one `store.mutate` call.
- **Fields** lists measurement and space fields, their applies-to names and the
  field sets, and opens the existing **Custom fields** editor. Field behaviour is
  unchanged; closing the editor reopens the hub on the Fields tab.
- **Tables** lists the saved takeoff tables with edit, duplicate and delete plus
  **New takeoff table…**. Duplicate and delete call the schedules feature's own
  definition rules and placement cascade. No standard table is created or
  offered; that remains Phase 3 (#302).
- **Cards** shows the four cards with their visibility switch and a **Fed by**
  list: Walls lists categories, Doors lists count types, Rooms and Area explain
  that they read the space register. A stored role that no card uses is preserved
  in the project and is not rendered. Each tick and each visibility switch is one
  undo step.
- **Entry points:** a gear in the Takeoff tab, **View → Takeoff settings…**, and a
  single **Takeoff settings** link row in Project settings → Display. Project
  settings no longer has Quantities, Count types, Fields or card switches, and
  Settings → Manage categories… is removed.
- **Deep links:** an empty card's **Configure** opens the Cards tab on that card;
  the selection inspector gains **Edit object “…”** under the category and count
  type controls and opens the Objects tab on that row. The hub scrolls the card
  or focuses the object's name field.
- All text is localized in English and Swedish (60 new catalog keys); the
  generated message types are regenerated. No Swedish was added to code.
- The accessibility, touch-target and UI-scale gates now cover the four hub tabs.
  The a11y gate also runs the four tabs in Swedish; touch targets cover 734
  controls across 22 surfaces; UI scale covers 100/150/200 % in both locales.
- The count-workflow, visual-regression, documentation-capture and count-type
  screenshot paths were moved to the hub. `tests/visual/hero.png` changed because
  the inspector now shows the **Edit object** action; `count-types.png` changed
  from the old dialog to the Objects tab.

### Modules

- `src/features/takeoffSettings/{index,model}.ts` and
  `ui/{dialog,objects,categoryRows,fields,tables,cards}.ts`
- `src/features/countTypes/{index,ui}.ts` (counted-object rows moved here and kept
  as the feature's public surface)
- `src/features/fields/{index,ui}.ts` (dead Project settings section removed)
- `src/features/schedules/{index,ui}.ts`, `ui/panel.ts` (gear and deep-link host
  callback; `ui/roles.ts` removed)
- `src/ui/{settingsDialog,topMenu,inspector}.ts`,
  `src/ui/settings/display.ts`, `src/ui/inspector/measurement.ts`
- `src/styles/takeoffSettings.css`, `src/main.ts`
- `src/i18n/locales/{en,sv}.json`, `src/i18n/types.generated.ts`
- `tests/takeoffSettingsUi.test.ts`, `schedulesUi.test.ts`,
  `summaryCardsSettings.test.ts`, `accessibilityGate.test.ts`,
  `tests/visual/{hero,count-types}.png`
- `scripts/{accessibility-check,accessibility-rules,touch-target-check,
  ui-scale-check,ui-harness,count-workflow,visual-regression,docs-capture-flow,
  capture-docs-shots,check-module-boundaries}.mjs`, `file-budgets.json`
- `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/limitations.md`,
  `docs/testing.md`, `docs/user-guide.md`, `docs/workflows.md`

### Decisions

- **The category and count-type managers moved into the hub rather than opening
  from it.** The two old dialogs were presentation shells over the same store and
  model rules; moving their rows into one table gives the issue's single list
  with a Type column, while every rule, validation message and confirmation text
  is reused verbatim. The `countTypes` feature keeps the counted rows as its
  public surface. The old `categoriesDialog.ts`, `settings/quantities.ts`,
  `settings/countTypes.ts` and `schedules/ui/roles.ts` were deleted so no setting
  has two homes.
- **Roles are presented as card sources, not as a role field.** A tick in the
  Walls Fed by list stores `summaryRole: "wall"`, and a tick in Doors stores
  `"door"`; unticking clears it. Roles without a card are never shown and are
  never migrated away.
- **Counted objects keep their stored order.** No count-type reorder rule exists
  and Phase 2 moves behaviour rather than adding it, so only measured objects
  have up/down actions.
- **A nested editor returns to the hub.** The field editor and the table builder
  replace the hub modal (the dialog layer supports one active modal), and the hub
  reopens on the same tab when they close.
- **The hub refuses a view-only session.** `openTakeoffSettingsDialog` returns
  the localized **Editing disabled (view-only)** reason instead of opening when
  `store.readOnly` is set, so no hub control can show a mutation the store will
  silently ignore. The Takeoff-tab gear carries the same reason and the View
  menu, Project settings and inspector entry points are disabled, so an empty
  card's **Configure** and the inspector action cannot bypass the guard. The
  Tables tab follows the same rule because the whole hub is refused.
- **The Fields tab names every applies-to restriction.** Item kinds, categories,
  count types and space kinds are all summarised, using `itemKindLabel` and the
  existing `fields.spaceKind.*` keys; **All fields** appears only when the field
  has no restriction at all.
- **No standard table, no card-owned multi-source KPI.** Both stay in their
  follow-up issues (#302 and #304).

### Findings

- The conductor review found two in-scope defects that are now fixed in
  `18c4269`: the Fields applies-to summary ignored item-kind and space-kind
  restrictions, and the hub opened in a view-only session with editable-looking
  controls. Tests now cover an item-kind-only field, a space-kind-only field and
  a view-only hub that refuses the dialog, the card Configure action and the
  inspector action.
- The inspector **Edit object** action adds a button to every measurement's
  Properties section, which changed the `hero.png` visual baseline. The action is
  the issue's deep link, so the change is intended rather than a regression.
- No new out-of-scope data or UI finding was added to
  `docs/plan/foundation-findings.md`.

### Checks

Local gate on `7709be9` + `144e3b4`:

- `check:versions` (0.29.0), `check:file-budgets` (609 files; new feature files
  under 400 lines), `check:modules` (21 foundation features),
  `check:security`, `check:actions`, `check:dependencies` (six accepted
  advisories, none unaccepted), `check:docs` (only the expected stale-screenshot
  warning), `format:check`, `lint`, `check:i18n` (3 566 keys), `check:themes`,
  `npx tsc --noEmit`
- `npx vitest run`: 173 files, 1 728 tests passed
- `test:ui`, `test:count`, `test:visual` (two baselines updated),
  `test:a11y` (5 palettes × 18 surfaces plus 4 Swedish hub tabs, 94 checks, no
  serious or critical), `test:touch-targets` (734 controls, 22 surfaces),
  `test:ui-scale` (100/150/200 %, hub tabs in English and Swedish),
  `test:docs-capture` (35 screenshots in a temporary folder,
  `docs/screenshots/` untouched)

CI is authoritative on the PR head. Run
[44087039782](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44087039782)
on `f56172d` passed the dependency gate, the Rust format and check job, the
frontend tests and build, and the desktop shell on Ubuntu, Windows and macOS.

Review fixes on `18c4269` re-ran:

- `npx tsc --noEmit`, `lint`, `format:check`, `check:i18n` (3 566 keys),
  `check:file-budgets` (609 files), `check:modules` (21 foundation features),
  `check:docs` (only the expected stale-screenshot warning)
- `npx vitest run`: 173 files, 1 730 tests passed (the two new hub tests cover
  the applies-to summary and the view-only refusal)
- `test:ui` and `test:ui-scale` (100/150/200 %, hub tabs in English and Swedish,
  now labelled with English-only script strings)

The final CI run on the review-fix head is recorded in the PR.

### Conductor verification

pending

### Next phase

Phase 3 — [Standard takeoff table #302](https://github.com/MajorJohnDoe/gridscalr/issues/302):
create the standard table only on an explicit action, offer create and
create-and-place in the preview, and keep create-and-place to one undo step. No
schema change is expected.

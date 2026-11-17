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
- **Verified head SHA:** `7dc0d5b079f606816af82e6043450441728196e4`
  (implementation `7709be9`, documentation `144e3b4`, conductor review fixes
  `18c4269`, handover `7dc0d5b`). All six PR checks passed on that exact SHA
  (CI run [44091688600](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44091688600)).
- **Merge commit:** `49c06a554faebe9ac8cfcd13b0b167cd65b2b4cf` (squash merged,
  branch deleted).
- **Status:** merged to `main`. The `main` CI run
  [44093504582](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44093504582)
  is green on the merge commit. No schema change, no app version bump, no tag,
  release or `site/` change.

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

- PR [#309](https://github.com/MajorJohnDoe/gridscalr/pull/309) head
  `7dc0d5b079f606816af82e6043450441728196e4` matched the worker report; all six
  checks were `success`, the base was `main` and the merge state was
  `CLEAN`/`MERGEABLE`.
- The first review found three in-scope defects, which the worker fixed in
  `18c4269`: the Fields tab labelled item-kind- and space-kind-restricted fields
  as **All fields**; the hub was reachable in a view-only session from an empty
  card's Configure and the inspector action while its controls stayed editable;
  and the UI-scale gate hard-coded Swedish tab labels. All three are corrected
  and covered by tests.
- Conductor re-ran `npx vitest run tests/takeoffSettingsUi.test.ts
  tests/schedulesUi.test.ts tests/summaryCardsSettings.test.ts
  tests/accessibilityGate.test.ts tests/schema28.test.ts`: 5 files, 55 tests
  passed. `check:modules` (21 foundation features), `check:file-budgets` (609
  files), `check:i18n`, `check:docs` (only the expected stale-screenshot
  warning), `check:versions`, `check:security`, `check:themes`, `check:actions`,
  `check:dependencies`, `format:check` and `npx tsc --noEmit` are green.
- The old Quantities, Count types and Fields sections and the category,
  count-type and role dialogs are deleted; card visibility and Fed by have their
  only writer in the hub, so no takeoff setting exists in two places. Project
  settings → Display has exactly one link row. Opening the hub writes nothing.
- No `src/model/types.ts`, `src/io/projectFile`, version file, Tauri manifest or
  `site/` file changed; `SCHEMA_VERSION` stays 28 and the app version stays
  0.29.0. No Swedish literal was added outside `src/i18n/locales/sv.json`; the
  only remaining match is the English word "Swedish" in an a11y summary.
- The two visual baselines are the harness's masked captures: `hero.png` changes
  only in the inspector (the new **Edit object** action) and `count-types.png`
  only in the right-hand shell state around the masked dialog area. No canvas or
  thumbnail rasterisation is compared.
- Squash merged as `49c06a554faebe9ac8cfcd13b0b167cd65b2b4cf`; `main` CI is green
  on that commit.(https://github.com/MajorJohnDoe/gridscalr/issues/302):
create the standard table only on an explicit action, offer create and
create-and-place in the preview, and keep create-and-place to one undo step. No
schema change is expected.

## Phase 3 — standard table on first placement

- **Issue:** [#302](https://github.com/MajorJohnDoe/gridscalr/issues/302)
- **PR:** [#311](https://github.com/MajorJohnDoe/gridscalr/pull/311), opened from
  `feat/standard-takeoff-table`.
- **Branch:** `feat/standard-takeoff-table`
- **Verified head SHA:** `d5c18d9392b6bc503db58a681b99f5a8b54c4a24`
  (implementation `9671e82`, documentation `747135f`, handover `e431007`,
  module-note correction `0865e22`, handover update `6ee433d`, conductor
  preview-state fix `ea37052` and its handover `d5c18d9`). All six PR checks passed on that
  exact SHA (CI run
  [44108619891](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44108619891)).
- **Merge commit:** `fc94b41bd1c6a4e72d72cb468766d24078f16eda` (squash merged,
  branch deleted).
- **Status:** merged to `main`. The `main` CI run
  [44110236446](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44110236446)
  is green on the merge commit after the queued macOS desktop job was re-run
  (its first attempt was cancelled at the 15-minute runner queue limit without
  starting a step). No schema change, no app version bump, no tag, release or
  `site/` change.

### Completed work

- When the project has no saved takeoff table, the Takeoff tab renders the
  labelled **Preview – cannot be placed** state with two actions: **Create
  takeoff table** and **Create takeoff table and place…**. Both are disabled with
  the existing view-only reason and `aria-describedby` in a read-only session.
- When the project has saved takeoff tables, the tab opens on the first one in
  session state, so the live table renders and **Place on drawing…**, **Edit
  takeoff table…** and **Export CSV…** are enabled. The selection never writes
  the project, never marks it dirty and adds no undo step. Choosing the built-in
  preview from the picker still shows the built-in table with the disabled reason
  to select a saved table, but with no standard-table create block.
- Opening the tab still writes nothing: no schedule, no revision bump, no dirty
  flag and no undo entry, asserted on the serialized project and the store.
- `standardScheduleDraft()` in the schedule model builds the localized
  **Standard** table: measurement source, one row per item, columns
  **Object / Count / Unit / Value**, no filters, grouping, sorting or totals. It
  is an ordinary `ScheduleDefinition` with no standard flag and no new persisted
  field, so the builder can rename it and change every rule.
- **Create takeoff table** adds the table and selects it in one `store.mutate`
  call; one undo removes it. **Create takeoff table and place…** collects the
  existing placement dialog's answers first, then creates the table and the
  placement in one mutation, selects the table and the placed item, and reports
  **Standard takeoff table created.** Cancelling the dialog writes nothing.
- Placement keeps the existing draw-layer rule: the active draw layer, an
  existing draw layer, or a new draw layer named **Takeoff tables**. A
  measurement layer is never used, including when the active layer is a
  measurement layer and no draw layer exists.
- After creation the table is selected, so **Place on drawing…**, **Edit takeoff
  table…** and **Export CSV…** are enabled with no reason paragraph.
  **Import CSV…** keeps the existing one-row-per-item rule.
- The standard table appears in the Takeoff settings → Tables tab and opens in
  the builder with its four columns.
- A new `ui/panelNotice.ts` owns the preview block, the empty-rows hint and the
  shared disabled-reason helper, so `ui/panel.ts` stays under its line budget
  and the notice stays one module.

### Modules

- `src/features/schedules/model/definition.ts` (`standardScheduleDraft`),
  `model.ts`, `index.ts`
- `src/features/schedules/ui/placement.ts` (`placementOptions` collector,
  `createStandardSchedule`, `createAndPlaceStandardSchedule`), `ui.ts`
- `src/features/schedules/ui/panelNotice.ts` (new), `ui/panel.ts`, `ui/state.ts`
- `src/styles/schedules.css`
- `src/i18n/locales/en.json`, `sv.json`, `src/i18n/types.generated.ts`
- `tests/scheduleStandardTable.test.ts` (new), `tests/schedulesUi.test.ts`
- `tests/visual/count-types.png`
- `docs/user-guide.md`, `docs/plan/takeoff-handover.md`

### Decisions

- **The placement dialog is split into an options collector and a write.** The
  dialog no longer mutates when it closes; it resolves the page, width, row
  range, header and totals choices, and the caller writes. That is what makes
  create-and-place one mutation and makes Cancel write nothing, without a new
  placement engine.
- **The create actions live where placement already lives.** The standard-table
  factory is pure model code; the two actions and the selection side effect are
  in `ui/placement.ts`, which already owns the placement lifecycle and the
  localized draw-layer name.
- **Object and Count are stored column labels.** The first column is the item
  `label` field and the second the `countQuantity` field; both carry the
  localized **Object** / **Count** header so the standard table reads as the
  plan specifies while remaining an ordinary editable definition.
- **The no-table preview is keyed on the saved-table count, not the session
  selection.** Zero saved tables shows the preview with both create actions. Saved
  tables with no selection auto-select the first in session state, so the live
  table is shown without offering a duplicate standard table. An explicit pick of
  the built-in option keeps the built-in table and its disabled reason, and never
  shows the standard-table create block.
- **The live table's row links meet the 24 px touch minimum.** Now that the
  Takeoff tab can open on a live table, the row link gained a 24 px hit area with
  compensating negative block margin so the row height stays within the
  virtualiser's estimate.
- **One existing test changed meaning.** The Phase 1 test that clicked **Create
  takeoff table** expected the builder to open; it now asserts the two preview
  actions and that nothing is written on open. Creation is covered by the new
  suite.

### Findings

- The `count-types.png` visual baseline changed twice: first because the Takeoff
  tab behind the masked Takeoff settings dialog showed the second preview action,
  then because the tab now opens on the first saved table (with the 24 px row
  link). Both captures were inspected before they were committed; the rest of the
  shell and the masked area are byte-identical.
- The conductor review found the no-table preview was keyed on the session
  selection instead of the saved-table count, so a non-empty project could invite
  a duplicate standard table and left Place/Edit/CSV disabled. Fixed in
  `ea37052`; tests cover zero tables, auto-selection without a write and the
  explicit built-in pick without a create block.
- No other out-of-scope finding was added to `docs/plan/foundation-findings.md`.
- The Phase 2 "Next phase" paragraph in this file is missing its heading and has
  a run-on link; it is left untouched to preserve the Phase 2 record.

### Checks

Local gate on `ea37052` (implementation + review fix; documentation `747135f`):

- `check:versions` (0.29.0), `check:file-budgets` (610 files; `panel.ts` reduced,
  `placement.ts` and `definition.ts` under 400 lines), `check:modules` (21
  foundation features), `check:security`, `check:actions`, `check:dependencies`
  (six accepted advisories, none unaccepted), `check:docs` (only the expected
  stale-screenshot warning), `format:check`, `lint`, `check:i18n` (3 574 keys),
  `check:themes`, `npx tsc --noEmit`
- `npx vitest run`: 174 files, 1 743 tests passed (three new selection tests)
- `test:ui`, `test:visual` (`count-types.png` updated and re-verified at 0
  differing pixels), `test:a11y` (5 palettes × 18 surfaces plus 4 Swedish hub
  tabs, 94 checks, no serious or critical), `test:touch-targets` (743 controls,
  22 surfaces), `test:ui-scale` (100/150/200 %), `test:docs-capture` (35
  screenshots in a temporary folder, `docs/screenshots/` untouched)

CI is authoritative on the PR head and is recorded in the PR.

### Conductor verification

- PR [#311](https://github.com/MajorJohnDoe/gridscalr/pull/311) head
  `d5c18d9392b6bc503db58a681b99f5a8b54c4a24` matched the worker report; all six
  checks were `success`, the base was `main` and the merge state was
  `CLEAN`/`MERGEABLE`.
- Conductor review found one plan deviation, fixed in `ea37052`: the preview was
  keyed on the absence of a *selected* table, so a project with saved tables but
  no selection showed the no-table create block and left Place/Edit/CSV
  disabled. It is now keyed on `project.schedules.length === 0`; with saved
  tables the first table is selected in session state (no project write, no
  dirty flag) and an explicit built-in pick shows the built-in table without the
  create block.
- Conductor re-ran `npx vitest run tests/scheduleStandardTable.test.ts
  tests/schedulesUi.test.ts tests/schedulePlacement.test.ts
  tests/schedulePlacementUi.test.ts tests/schedulePlacementPdf.test.ts
  tests/takeoffSettingsUi.test.ts tests/schema28.test.ts`: 7 files, 83 tests
  passed. `check:modules` (21 features), `check:file-budgets` (610 files),
  `check:i18n` (3 574 keys) and `check:docs` (only the expected stale-screenshot
  warning) are green.
- The standard table is an ordinary `ScheduleDefinition`: measurement source,
  row mode `items`, columns Object / Count / Unit / Value, no filters, localized
  **Standard** name. No `src/model/types.ts`, `src/io/projectFile`, version file,
  Tauri manifest or `site/` file changed; `SCHEMA_VERSION` stays 28 and the app
  version stays 0.29.0. No Swedish was added outside `src/i18n/locales/sv.json`.
- `createAndPlaceStandardSchedule` collects the placement options first and adds
  the table plus the placement in one `store.mutate`; Cancel writes nothing and
  one undo removes both. Create-only is also one mutation and selects the table.
- The only visual baseline change is `count-types.png`, limited to the right
  dock (x 1627–1905) because the Takeoff tab behind the masked hub dialog now
  shows the live table. No canvas or thumbnail pixels are compared.
- Squash merged as `fc94b41bd1c6a4e72d72cb468766d24078f16eda`. The `main` run was
  re-run once because the macOS desktop job was cancelled at the 15-minute queue
  limit with no step started; the re-run is green on the merge commit.

### Next phase

Phase 4 — [Documentation and screenshots #303](https://github.com/MajorJohnDoe/gridscalr/issues/303):
user guide, workflows, limitations, README, AGENTS map and shortcut tables,
recaptured screenshots and a release-notes draft. No version bump, tag or release.

## Phase 4 — documentation and screenshots

- **Issue:** [#303](https://github.com/MajorJohnDoe/gridscalr/issues/303)
- **PR:** [#313](https://github.com/MajorJohnDoe/gridscalr/pull/313), opened from
  `docs/takeoff-pass`.
- **Branch:** `docs/takeoff-pass`
- **Verified head SHA:** `0466b76bf56477e0b305251a44163528c88e6dae`
  (documentation, screenshots and the capture harness). All six PR checks passed
  on that exact SHA (CI run
  [44126754525](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44126754525)).
  This handover commit follows and changes no product file.
- **Merge commit:** pending.
- **Status:** open for conductor review. No schema change, no app version bump,
  no tag, release or `site/` change.

### Completed work

- `docs/user-guide.md` gains one **Takeoff settings** section that explains the
  hub, its entry points, the four tabs and where each takeoff setting lives,
  including the Objects delete rules, the Fields editor entry, the Tables list
  and the Cards **Fed by** lists. The interface list, Takeoff tab, Custom fields,
  Takeoff, Create a takeoff table and Order sections use the shipped names. The
  preview and standard-table captures are inserted where the actions are
  described; the old "in 0.29.0" sentence is now version-neutral.
- `docs/workflows.md` room-to-schedule guide opens with the hub path and the four
  tabs, and step 5 documents the no-table preview, both create actions and the
  standard table before the builder walkthrough.
- `docs/limitations.md` records the deliberate gaps: no automatic table on open,
  the fixed standard table, one source per table, the four-card limit and unused
  roles being preserved but not exposed. The stale "roles dialog" wording,
  summary-card wording and the summary performance row labels are corrected.
- `README.md` features and architecture description name the hub, the standard
  table and its factory, the two create actions and **View → Order…**.
- `AGENTS.md` maps `src/features/schedules/model/definition.ts`
  (`standardScheduleDraft`), the schedules UI row and the existing
  `src/features/takeoffSettings/` entry. `docs/architecture.md` maps the
  standard-table factory, `ui/panelNotice.ts` and `ui/placement.ts`, and removes
  the stale "later phases; do not describe as shipped" paragraph.
- `docs/release-notes/0.30.0.md` is the next-minor draft: one vocabulary, the
  hub, the standard table, the deliberate gaps, no schema change, documentation
  and upgrade notes. The version, tag and publication stay undecided.
- `docs/roadmap.md` adds the Takeoff UI row and completion paragraph on schema 28
  with #300–#303, and closes the custom-fields/spaces/schedules open decision.
- `docs/screenshots/` and `manifest.json` were recaptured with
  `npm run docs:capture`: 39 screenshots. New files: `takeoff-preview.png`,
  `takeoff-standard-table.png`, `takeoff-settings-fields.png` and
  `takeoff-settings-tables.png`. `count-types.png`, `schedule-roles.png`,
  `fields.png` and the remaining shells now show the current hub and terminology
  instead of the old role dialog and old inspector tab.
- Shortcut tables are unchanged because the two documented labels (**Takeoff**,
  **Order**) did not change; `check:docs` pins them.

### Modules

- `docs/user-guide.md`, `docs/workflows.md`, `docs/limitations.md`,
  `docs/roadmap.md`, `docs/architecture.md`, `docs/release-notes/0.30.0.md`
- `README.md`, `AGENTS.md`, `docs/plan/takeoff-handover.md`
- `docs/screenshots/*.png`, `docs/screenshots/manifest.json`
- `scripts/docs-capture-flow.mjs`, `scripts/capture-docs-shots.mjs`,
  `scripts/ui-harness.mjs`

### Decisions

- **The preview is captured from a clean project without tables, not from an
  edited project.** `clearSchedules()` replaces the in-memory project with a
  schedule-free copy through `store.setProject(..., dirty = false)` so the
  screenshot can state that opening the tab writes nothing without showing an
  "Unsaved changes" badge caused by the capture itself. It is a capture-only
  harness helper; no application code changed.
- **The standard-table capture uses the widest user-resizable inspector
  (420 px).** The default 304 px dock clips the fourth column, so the capture
  widens `--inspector-w` and scrolls the virtualised table to its measured rows.
  The image is the real panel, not a mock; the wider dock is a state the panel
  resizer already supports.
- **Existing screenshot files keep their names.** `count-types.png` remains the
  Objects tab and `schedule-roles.png` remains the Cards tab, so the guide and
  README references stay stable; only their content and alt text changed.
- **The seeded field helper is additive.** The demo already ships `fireClass`,
  so the old early return skipped the Condition field and the Fire data set
  membership; the helper now extends the existing set instead. That makes the
  `fields.png` alt text true, not only the new Fields-tab capture.
- **No application defect was fixed.** The standard table listing drawing rows
  before measured rows is the shipped "one row per item" behaviour, so the
  capture scrolls instead of changing the table.

### Findings

- `count-types.png` and `schedule-roles.png` were still the pre-hub screens: the
  Objects capture did not show the added Socket row, and the Cards capture was
  the deleted role dialog. Both are corrected by the new capture steps.
- The standard table's fourth column does not fit the default right dock. This
  is the documented F-125 width limit; the capture uses the 420 px panel width
  and no layout change was made.
- No new out-of-scope finding was added to
  `docs/plan/foundation-findings.md`.

### Checks

Local gate on `0466b76`:

- `check:versions` (0.29.0), `check:file-budgets` (610 files),
  `check:modules` (21 foundation features, 34 Tauri commands),
  `check:security`, `check:actions` (37 pinned references),
  `check:dependencies` (six accepted cargo advisories, none unaccepted),
  `check:i18n` (3 574 keys, no hard-coded text), `check:themes` (5 themes),
  `format:check`, `lint`, `npx tsc --noEmit`
- `GRIDSCALR_DOCS_STRICT=1 npm run check:docs`: 260 links, 54 images,
  39 screenshots, no stale-screenshot warning
- `npm run test:docs-capture`: 39 screenshots in a temporary folder,
  `docs/screenshots/` untouched
- `npx vitest run tests/markdown.test.ts tests/helpImages.test.ts
  tests/shortcutDocs.test.ts tests/schedulesUi.test.ts
  tests/takeoffSettingsUi.test.ts tests/scheduleStandardTable.test.ts
  tests/performanceBudget.test.ts`: 7 files, 78 tests, plus 3 files, 28 tests
  after the final text edit
- `test:a11y` (5 palettes × 18 surfaces plus 4 Swedish hub tabs, 94 checks, no
  serious or critical), `test:touch-targets` (748 controls, 22 surfaces),
  `test:ui-scale` (100/150/200 %, no overflow)
- `npm run docs:capture`: 39 screenshots and a regenerated manifest

CI is authoritative on the PR head. Run
[44126754525](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44126754525)
on `0466b76` passed the dependency gate, Rust format and check, frontend tests
and build, and the desktop shell on Ubuntu, Windows and macOS.

### Conductor verification

Pending.

# Takeoff improvements handover

Plan: `takeoff-improvements.md` (maintainer plan shared with the orchestrator).
Epic: [#318](https://github.com/MajorJohnDoe/gridscalr/issues/318). Milestone
0.30.0 is held: no app version bump, tag, GitHub Release or `site/` change is
part of this effort.

Schema 28 stays the current development schema. No persisted field is added.

## Phase 1 — Windows 11 row reordering

- **Issue:** [#319](https://github.com/MajorJohnDoe/gridscalr/issues/319)
- **PR:** [#324](https://github.com/MajorJohnDoe/gridscalr/pull/324), opened from
  `fix/windows-row-drag`, base `main`
  (`e1efb58`). Not merged, not auto-merge.
- **Branch:** `fix/windows-row-drag`
- **Verified head SHA:** `6711d40fc1af011a4cef3724d9d9e1c95acf08b2`
  (implementation `432bfb6`, handover `8f818b1`, CI record `6711d40`). All six
  PR checks passed on that exact SHA (CI run
  [44290854777](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44290854777)).
- **Merge commit:** `0afa4dbf0f3eec97ac7ac860dde5a83fd2767ce6` (squash merged,
  branch deleted).
- **Status:** merged to `main`; the `main` CI run
  [44292590558](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44292590558)
  is green on the merge commit. Windows 11 mouse-drag confirmation and the
  product-owner release-complete check are still open.

### Completed work

- Cause confirmed by inspection, not assumed: `dragDropEnabled: true` makes
  `wry 0.57.0` revoke WebView2's `IDropTarget` and register its own `CF_HDROP`-
  only target on every child HWND, so HTML5 `dragover`/`drop` never reaches the
  page on Windows. The Tauri config reference states the same contract, and the
  exact versions are pinned in `src-tauri/Cargo.lock`
  (`tauri 2.12.5`, `tauri-runtime-wry 2.12.3`, `wry 0.57.0`).
- New `PointerRowDrag` (`src/features/listInteraction/pointerDrag.ts`, 187
  lines): delegated primary mouse/pen press, 4 px threshold, document-level
  move/up, Escape and window-blur cancel, one-shot click guard so a drop never
  activates the row, and an ignore list for controls inside a row.
- `ListReorderController` and `LayerTreeController` take the gesture from that
  helper. The reorder rules are untouched: `insertionIndexAt`, `planDrop`,
  `layerDropPreview`, `moveEntries`, `keyboardInsertion` and the layer tree move
  operations are unchanged, so a drop is still one `onMove` and one undo step.
- Takeoff builder columns use the same helper plus the new pure `rowIndexAt()`;
  `moveColumn()` is unchanged and the up/down buttons remain the keyboard path.
- `draggable` and the `dragstart`/`dragend` host wiring removed from
  `src/ui/pageList.ts` and `src/ui/layers/layerRow.ts`; the unused drag MIME
  option removed from both list controllers.
- Native window file drops (`getCurrentWebview().onDragDropEvent`) and the
  Pages-panel drop controller are untouched; `dragDropEnabled` stays `true`
  because a DOM drop in WebView2 cannot supply the absolute path the source
  reference model needs.
- Touch deliberately does not start a row drag; keyboard, layer
  `Alt` + `ArrowLeft`/`ArrowRight` and the builder's move buttons stay the touch
  path (`docs/limitations.md`).
- Tests: `tests/listInteraction.test.ts` and `tests/pageReorder.test.ts` drive
  pointer sequences (threshold, Escape, read-only, row control, release outside
  the list, click suppression) with all previous assertions kept; new
  `tests/layerTreeDrag.test.ts` covers sibling move, nest, cross-kind rejection,
  Escape and a row control; `tests/schedulesUi.test.ts` adds a pointer column
  reorder; `tests/helpers/pointer.ts` is the shared gesture helper;
  `scripts/smoke-ui.mjs` adds one real Chromium mouse drag and undoes it.
- Docs: `docs/limitations.md`, `docs/user-guide.md` (a layer drag starts on the
  row, not on its swatch, chevron or buttons), `docs/testing.md` (per-platform
  manual reorder and drop checks) and `docs/architecture.md`.

### Modules

- `src/features/listInteraction/` — `pointerDrag.ts` (new), `controller.ts`,
  `model.ts`, `index.ts`
- `src/features/layerTree/controller.ts`
- `src/features/schedules/ui/builderColumns.ts`
- `src/ui/pageList.ts`, `src/ui/layers/layerRow.ts`, `src/ui/layers/reorder.ts`
- `src/features/pageReorder/controller.ts`
- `tests/helpers/pointer.ts`, `tests/layerTreeDrag.test.ts`,
  `tests/listInteraction.test.ts`, `tests/pageReorder.test.ts`,
  `tests/schedulesUi.test.ts`, `scripts/smoke-ui.mjs`

### Decisions

- **Pointer rows, not `dragDropEnabled: false`.** Disabling the native handler
  would force window-level drops onto DOM `File` objects, which carry no
  absolute path in WebView2, breaking the path-plus-SHA-256 source model,
  managed copies, relinking and `.gridscalr` opens.
- **One gesture on every platform.** Keeping HTML5 drag as a fallback would let
  a native browser drag compete with the pointer drag on macOS and Linux, so
  HTML5 row drag was removed rather than kept alongside.
- **A release outside the list cancels.** The pointer path reproduces the old
  "drop only on the list" rule instead of clamping an outside release to the
  first or last slot.
- **No screenshot recapture.** No captured screen changes; `check:docs` reports
  only the pre-existing stale-screenshot warning, which is cleared in the
  release documentation pass.

### Findings

- **F-135** (P3): row reordering is not automated on WebKitGTK/WKWebView or on
  Windows; the manual per-platform step is in `docs/testing.md`.
- No other out-of-scope finding.

### Open questions

- Windows 11 mouse drag on pages, layers and builder columns is pending the
  product owner's manual check; the issue is not release-complete until it
  passes.
- macOS/Linux mouse drag moves from HTML5 to pointer input and is covered by the
  Chromium smoke drag only; it stays on the manual review list.

### Checks

Local gate on the implementation head (`432bfb6`):

- `check:versions`, `check:file-budgets`, `check:modules` (21 foundation
  features), `check:security`, `check:actions`, `check:dependencies`,
  `check:docs` (only the expected stale-screenshot warning), `format:check`,
  `lint`, `check:i18n` (3 574 keys), `check:themes`, `npx tsc --noEmit`
- `npm test -- --run`: 175 files, 1 757 tests passed
- focused: `listInteraction`, `pageReorder`, `layerTreeDrag` (new),
  `schedulesUi`, `layerTreeOperations`, `layerTreeView`, `pageFileDrop`,
  `schedules`
- `test:ui` (with the new mouse drag), `test:canvas`, `test:visual` (4
  baselines, 0 differing pixels), `test:a11y` (94 checks), `test:touch-targets`
  (748 controls, 22 surfaces), `test:ui-scale` (100/150/200 %)
- `npm run tauri build -- --no-bundle` succeeded. No Rust or
  `tauri.conf.json` change; the shell rebuild was run because the phase touches
  the drop path.

Not run locally, left to CI: the Windows and macOS desktop jobs, the packaged
smoke test, the docs-capture dry run and the full release workflow. The windows
and macOS desktop jobs compile the shell and run the packaged smoke test; they
do not exercise a mouse drag, so Windows reordering is still the manual gate.

### Conductor verification

- PR [#324](https://github.com/MajorJohnDoe/gridscalr/pull/324) head
  `6711d40fc1af011a4cef3724d9d9e1c95acf08b2` matched the worker report; all six
  checks were `success`, the base was `main` and the merge state was
  `CLEAN`/`MERGEABLE` immediately before the merge.
- Conductor re-ran `npx vitest run tests/listInteraction.test.ts
  tests/pageReorder.test.ts tests/layerTreeDrag.test.ts tests/schedulesUi.test.ts
  tests/schema28.test.ts`: 5 files, 75 tests passed.
  `check:versions` (0.29.0), `check:file-budgets` (611 files), `check:modules`
  (21 foundation features, 34 Tauri commands) and `check:i18n` (3 574 keys) are
  green.
- Scope matched #319: no `src/model/types.ts`, `src/io/projectFile`, version
  file, `Cargo.toml`/`Cargo.lock`, `tauri.conf.json`, `security/` or `site/`
  file changed; `SCHEMA_VERSION` stays 28 and the app version stays 0.29.0. No
  Swedish literal was added outside `src/i18n/locales/sv.json` (that file is
  unchanged).
- The change is one shared gesture, not three rewrites: `PointerRowDrag`
  (187 lines) holds no reorder rule, the host controllers keep `planDrop`,
  `layerDropPreview`, `moveColumn` and `keyboardInsertion`, and every drop is
  still one host callback and one undo step. HTML5 `draggable`/`dragstart`
  wiring is gone from `src/ui/pageList.ts` and
  `src/ui/layers/layerRow.ts`, and the unused drag MIME option is gone from both
  controllers. Native window drops and the Pages-panel drop controller are
  untouched.
- Windows test build: `Release build` was dispatched on the merge commit
  (`0afa4db`) as run
  [44292623517](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44292623517)
  for the product owner. It does not tag, publish or change `site/`.
- Squash merged as `0afa4dbf0f3eec97ac7ac860dde5a83fd2767ce6`; `main` CI is green
  on that commit.

### Next phase

Phase 2 — [measurement tool flyout #320](https://github.com/MajorJohnDoe/gridscalr/issues/320):
move the **New measurement** settings and layer selection into the measurement
tool flyout, open family flyouts on a normal left-click, keep long-press and
right-click. No schema change expected.

## Phase 2 — measurement tool flyout

- **Issue:** [#320](https://github.com/MajorJohnDoe/gridscalr/issues/320)
- **PR:** [#325](https://github.com/MajorJohnDoe/gridscalr/pull/325), opened from
  `feat/measurement-tool-flyout`, base `main` (`2e4e5e6`). Not merged, not
  auto-merge.
- **Branch:** `feat/measurement-tool-flyout`
- **Verified head SHA:** `b907897749c38517458b1576271159a1e107d841`
  (implementation `1c8083f`, handover `f4c3482`, CI record `b907897`). All six
  PR checks passed on that exact SHA (CI run
  [44306061281](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44306061281));
  an earlier run failed only on a Linux dependency-install timeout and was
  retried green.
- **Merge commit:** `22a1f6d7238f4cd1394eabdbcf91d4c3314d50d6` (squash merged,
  branch deleted).
- **Status:** merged to `main`; the `main` CI run on the merge commit is
  [44307835270](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44307835270).
- **Schema:** unchanged at 28. App version unchanged at 0.29.0.

### Completed work

- Rail family flyouts now open on a normal left-click. Long-press and
  right-click still open them. The rail click still activates the displayed
  member, so the previous one-click selection path is preserved; choosing
  another member selects it and closes the flyout.
- The **New measurement** settings moved into the measurement tool flyout:
  category, room (free text, clear and suggestions), count preset, count type,
  pieces, save/delete preset, area shape and Add/Deduct mode where supported.
  The same panel owns the page-scoped target layer.
- The context bar keeps a compact summary for measurement tools and opens the
  same flyout. The measurement target-layer select and the area Add/Deduct
  toggle were removed from the context bar; drawing and neutral tools keep
  their direct layer picker.
- `src/ui/measureOptions.ts` and its CSS surface are deleted.
- The layer list is page-scoped and excludes hidden, locked and other-page-only
  layers, including inherited hierarchy state. A view-only session refuses to
  open the panel and renders no editable controls.
- All setting changes reuse the existing store actions. Saving a count preset is
  one undo step.
- Keyboard: focus enters the panel, Tab follows the form order, Escape closes
  and returns focus to the anchor. Menu flyouts support
  ArrowUp/ArrowDown/Home/End.
- New `src/features/measurementFlyout/` module and `src/ui/flyoutHost.ts` shared
  mount/extraction. `toolFlyouts.ts` shrank from 705 to 617 lines.
- Docs updated in the same change; `measure.png` and the new
  `measure-flyout.png` were regenerated. The other capture outputs differed only
  by environment-level rendering noise, so they were not committed.
- Visual baselines updated for the intended rail triangles on measurement
  tools; the four scenes now pass with 0 differing pixels.

### Modules

- `src/features/measurementFlyout/model.ts`, `controller.ts`, `ui.ts`,
  `index.ts`
- `src/ui/flyoutHost.ts` (new), `src/ui/toolFlyouts.ts`, `toolDefs.ts`,
  `contextBar.ts`, `shell.ts`
- `src/styles/popovers.css`, `src/styles/themes/chrome.css`
- `tests/measurementFlyout.test.ts`, `tests/toolFlyouts.test.ts`,
  `tests/accessibilityGate.test.ts`, `tests/visual/`
- `scripts/smoke-ui.mjs`, `canvas-regression.mjs`, `theme-preview.mjs`,
  `accessibility-check.mjs`, `accessibility-rules.mjs`,
  `touch-target-check.mjs`, `ui-scale-check.mjs`, `capture-docs-shots.mjs`,
  `docs-capture-flow.mjs`

### Decisions

- **A rail click selects and opens.** Opening the flyout must not cost the
  one-click measurement path, so the rail handler still activates the displayed
  member before the flyout opens. Keyboard shortcuts keep selecting directly.
- **Member selection closes; settings changes stay open.** This matches the
  existing family-flyout behaviour and leaves the settings panel usable for
  repeated changes.
- **One surface.** The context-bar summary opens the measurement flyout; it is
  not a second editor. The measurement layer list lives only in the flyout.
- **Page-scoped target list.** A layer is offered only when it applies to the
  page, is visible on it and is unlocked. `createItemInStore` keeps its existing
  final guard.
- **`flyoutHost` extraction.** The shared mount, focus, Escape, arrow key and
  long-press code moved out of `toolFlyouts.ts` rather than raising its budget.

### Findings

- No new finding. The existing F-135 platform manual reorder gate is unchanged.

### Open questions

- The left-click flyout and touch long-press are covered by jsdom and Chromium
  tests; a real pen/touch hardware pass remains on the manual review list.
- Windows mouse behaviour is unchanged by this phase and still needs the Phase 1
  product-owner confirmation.

### Checks

Local gate on `1c8083f`:

- `check:versions` (0.29.0), `check:file-budgets` (615 files),
  `check:modules` (21 foundation features, 34 Tauri commands),
  `check:security`, `check:actions`, `check:dependencies`,
  `check:docs` (261 links, 55 images, 40 screenshots), `format:check`, `lint`,
  `check:i18n` (3,577 keys), `check:themes`, `npx tsc --noEmit`
- `npx vitest run`: 176 files, 1,767 tests passed
- `test:ui`, `test:canvas`, `test:count`, `test:visual` (4 baselines, 0
  differing pixels), `test:a11y` (5 palettes × 19 surfaces plus 5 Swedish
  checks, 100 checks), `test:touch-targets` (754 controls across 23 surfaces),
  `test:ui-scale` (100/150/200 %), `test:docs-capture`

Not run locally, left to CI: the Windows/macOS desktop matrix, packaged smoke
tests, `tauri build` (no Rust or Tauri change) and the complete CI suite on the
PR head.

### Conductor verification

- PR [#325](https://github.com/MajorJohnDoe/gridscalr/pull/325) head
  `b907897749c38517458b1576271159a1e107d841` matched the worker report; all six
  checks were `success`, the base was `main` (`2e4e5e6`, whose `main` CI run
  [44294008412](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44294008412)
  is green) and the merge state was `CLEAN`/`MERGEABLE` before the merge.
- Conductor re-ran `npx vitest run tests/measurementFlyout.test.ts
  tests/toolFlyouts.test.ts tests/accessibilityGate.test.ts`: 3 files, 32 tests
  passed. `check:versions` (0.29.0), `check:file-budgets` (615 files),
  `check:modules` (21 foundation features, 34 Tauri commands) and `check:i18n`
  (3 577 keys) are green.
- Scope matched #320 and the module map: new
  `src/features/measurementFlyout/` (pure model 100 lines, controller 50, UI 237,
  `index.ts` 10) plus the shared `src/ui/flyoutHost.ts`; `toolFlyouts.ts` shrank
  to 617 lines instead of growing. No `src/model/types.ts`,
  `src/io/projectFile`, version file, `tauri.conf.json`, `Cargo.*`, `security/`
  or `site/` file changed; `SCHEMA_VERSION` stays 28 and the app version stays
  0.29.0.
- One surface, verified in code: `src/ui/measureOptions.ts` and its CSS are
  deleted, no source imports a measure-options popover, the context bar renders a
  compact summary that calls `openMeasurementFlyout`, and the measurement target
  layer select is gone from the context bar (drawing and neutral tools keep their
  picker). The module keeps the model rules in `model.ts`
  (`measurementTargetLayers`, `matchingCountPreset`, `measurementSummary`) and
  reuses the store actions in `controller.ts`.
- Layer scoping and view-only are covered by tests: the target list is page-scoped
  and drops hidden, locked, other-page and draw-kind layers, including inherited
  hierarchy state; a view-only session refuses to open the panel. Left-click,
  long-press and right-click each open the family flyout, and a rail click still
  selects the displayed member, so the one-click measurement path is kept.
- Screenshots: `docs/screenshots/measure.png` and the new
  `docs/screenshots/measure-flyout.png` were recaptured; the four visual
  baselines changed only by the intended rail marker on family tools and pass at
  0 differing pixels. `docs/theme-preview/chrome.css` is the regenerated copy of
  the removed `.measure-options` rule.
- Squash merged as `22a1f6d7238f4cd1394eabdbcf91d4c3314d50d6`; the `main` CI run
  on that commit, the **Pages** screenshot deploy and a fresh `Release build`
  (run [44307859472](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44307859472),
  Windows test build for the product owner) were started from the merge commit.
  No tag, release or `site/` change.

### Next phase

Phase 3 — [movable dialogs #321](https://github.com/MajorJohnDoe/gridscalr/issues/321):
make every dialog with a close control movable and non-modal, with the ADR,
focus and accessibility work.

## Phase 3 — movable, non-modal dialogs

- **Issue:** [#321](https://github.com/MajorJohnDoe/gridscalr/issues/321)
- **PR:** [#326](https://github.com/MajorJohnDoe/gridscalr/pull/326), opened from
  `feat/movable-dialogs`, base `main` (`e897d6e`). Not merged, not auto-merge.
- **Branch:** `feat/movable-dialogs`
- **Implementation commit:** `7e11296048d22cb99141794e289d39fdbb25189b`
  (feature commit `d28cac7`, deterministic-centring fix `7e11296`). All six PR
  checks passed on `7e11296` (CI run
  [44319036364](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44319036364));
  the earlier run failed only on the visual gate, which the second commit fixes.
- **Final verified head:** `a98c800bd3ea42722a1521fc404b879a5e11d31a`
  (feature `d28cac7`, deterministic centring `7e11296`, docs record `01feb0f`
  and `456c0a4`, stale-screenshot fix `1738c3f`, review-fix docs `a98c800`).
  All six PR checks passed on that exact SHA (CI run
  [44324241684](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44324241684);
  the first attempt failed only in "Install Linux dependencies", a mirror
  timeout, and passed on re-run).
- **Merge commit:** `e37cff6ce670da203c491b5b69d878d57a6367f8` (squash merged,
  branch deleted).
- **Schema:** unchanged at 28. App version unchanged at 0.29.0. No persisted
  field, no migration fixture and no `src/io/projectFile` change.
- **Status:** merged to `main`; the `main` CI run on the merge commit is
  [44329205710](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44329205710),
  and the **Pages** run on the same commit republishes the 15 recaptured dialog
  screenshots.

### Completed work

- New foundation feature `src/features/dialogHost/` owns the window model:
  `model.ts` (pure stack, viewport clamp, target comparison), `controller.ts`
  (mount, stacking, header drag, Escape routing, focus return) and `ui.ts`
  (shell markup plus the shared confirm, message, text, depth, password and
  unsaved prompts). `src/ui/dialogs.ts` shrank from 525 to 264 lines and keeps
  only calibration, manual-scale and recovery content plus the `showModal` /
  `closeActiveModal` / prompt re-exports, so no call site changed its import.
- The dimming backdrop is gone. Each dialog is a `.dialog-layer` fixed to the
  viewport with `pointer-events: none`; only the `.modal` rectangle is
  interactive, so the canvas behind it pans, zooms, selects and measures.
  Clicking outside a dialog no longer dismisses it.
- `role="dialog"`, a unique per-dialog `aria-labelledby` title id and
  `aria-modal="false"`. Initial focus still enters the dialog and never lands on
  a destructive primary action; there is no focus trap, `Tab` leaves and
  re-enters, and closing returns focus to the opener when the closing dialog
  owned focus.
- Deterministic stacking: a monotonic counter from `DIALOG_Z_BASE` (2000), raised
  on open, pointer press and focus-in. New dialogs are inserted first in `<body>`
  so the first `.dialog-layer` is the topmost. `Escape` closes the focused
  dialog, else the topmost, and yields to an open flyout or menu.
- Header drag with button/field/`[data-dialog-no-drag]` opt-outs, an 8 px
  viewport clamp and a re-clamp on resize. Positions are not stored. An unmoved
  window is centred by CSS; the first drag freezes explicit coordinates. Freezing
  the position on mount was removed because the mount-time rectangle depends on
  when lazy content finished growing, which made the dialog's shadow land one
  pixel differently across machines and failed the visual gate.
- `showModal({ headerActions })` renders a reusable `.modal-header-actions`
  surface beside the close control; no Phase 4 action was added.
- `showModal` no longer closes the active dialog. Nested editors **stack**: the
  Takeoff settings hub stays open under the field editor and table builder and
  repaints the current tab in place (`categoryLayout().refresh()`; the hub now
  tracks `refresh` instead of reopening itself). Preferences repaints in place
  through `refreshPreferencesDialog()` for workspace, stamp, recovery and
  recent-file changes; a language switch still rebuilds the window for relabel.
- Destructive confirmations revalidate their target by stable id at confirm
  time: layer/inspector/bulk/subtree delete, layer clear-on-page, page delete,
  category, count type, takeoff table, custom field and space delete, backup
  delete, conflicted-copy delete and the destructive source actions. A vanished
  or changed target refuses with a localized explanation; one rule
  (`checkDialogTarget`/`targetProblem`, `revalidateTarget`,
  `revalidateTargetNow`) is shared, not copied per dialog.
- Global application shortcuts pause only while focus is inside a dialog
  (`App.onKeyDown`), so clicking the drawing restores tool, zoom and pan keys
  without closing the window; clipboard paste still refuses while a dialog is
  open.
- Docs: new `docs/adr/0017-movable-non-modal-dialogs.md`, updated
  `docs/adr/README.md`, `docs/architecture.md`, `docs/testing.md`,
  `docs/limitations.md`, `docs/user-guide.md` (**Dialogs and windows**),
  `README.md` and the `AGENTS.md` module map. The space-register limitation was
  corrected from "cannot change the selection while it is open" to "does not
  rebuild when the selection changes".
- Screenshots: 15 dialog captures plus `docs/screenshots/manifest.json`
  recaptured with `npm run docs:capture`; `test:docs-capture` passes. The visual
  baselines for `quantities.png` and `count-types.png` were re-baselined because
  the dimming layer is gone (the dialog itself sits under the masked canvas
  region). Non-dialog captures that differed only in the known ~30 px rendering
  noise were not committed.

### Modules

- `src/features/dialogHost/model.ts`, `controller.ts`, `ui.ts`, `index.ts`
- `src/ui/dialogs.ts` (264 lines), `src/styles/dialogs.css`,
  `src/styles/themes/chrome.css`
- `src/ui/preferencesDialog.ts`, `src/ui/settingsControls.ts` (`current()`)
- `src/features/takeoffSettings/ui/dialog.ts`, `objects.ts`, `tables.ts`
- `src/features/spaces/ui/list.ts`, `src/features/fields/ui/fieldList.ts`
- `src/ui/inspector.ts`, `src/ui/layers/menu.ts`, `src/ui/layers/bulk.ts`
- `src/app/pageFlows.ts`, `App.ts`, `clipboardPaste.ts`
- `src/features/saveIntegrity/backupController.ts`,
  `src/features/conflictedCopies/ui.ts` + `ports.ts`,
  `src/features/sourceStorage/sourceActions.ts`
- `src/i18n/locales/*.json`, `src/i18n/types.generated.ts`
- `scripts/check-module-boundaries.mjs`, `scripts/docs-capture-flow.mjs`
- `tests/dialogHost.test.ts` (new), `tests/takeoffSettingsUi.test.ts`,
  `tests/dialogFocus.test.ts` and the `.dialog-layer` cleanup rename across the
  dialog suites, `tests/visual/`

### Decisions

- **Non-modal means no outside-click close.** A modal backdrop dismissed on an
  outside click; a desktop window does not. A stray canvas click must not discard
  typed settings, and the drawing must remain a click target.
- **Stack, do not replace.** Opening a dialog from a dialog pushes it on top;
  closing returns to the window underneath. Self-rebuilding windows repaint in
  place instead of reopening, because reopening would now stack a duplicate.
- **Id-based revalidation, not a canvas freeze.** A blanket freeze would undo the
  reason for non-modal dialogs. The captured id plus a resolve callback is
  narrower and keeps the rest of the window usable. Inline confirmations use the
  synchronous `revalidateTargetNow`; the type (`ResolvedTarget`) rejects an async
  resolver at compile time.
- **Shortcuts pause on focus, not on presence.** The old `querySelector`
  guard would have made the keyboard useless while a window was open.
- **No remembered positions and no keyboard move**, recorded in the ADR and
  `docs/limitations.md`.
- **The help image lightbox stays a full-screen modal viewer.** It is the one
  documented exception to the window model (ADR 0017 §9): it fills the viewport
  with one screenshot, holds no editable state and no drawing work happens under
  it, so a movable window would be worse. The user guide states the same
  distinction. A surface that gains editable state must move to `dialogHost`.
- **Layout centring, not a mount-time position.** A frozen mount-time rectangle
  is timing-dependent; CSS centring plus clamping only on drag/resize is
  deterministic and fixed the visual gate.

### Findings

- **F-136** (P3, **resolved** in `1738c3f`): `docs/screenshots/layers.png` was
  left stale in Phase 2 because a real context-bar change was filtered as
  capture noise. The image was recaptured and committed in this PR; it now shows
  the current Area context bar with no **Variants** control.
- **F-137** (P3): transient flyouts and menus are not part of `DialogStack`;
  Escape precedence is a class-name check.
- **F-138** (P3): `--overlay-modal` is now an unused theme token in all five
  palettes.

### Open questions

- Windows 11 and macOS drag/interaction of a non-modal window are covered by
  jsdom and Chromium only; they stay on the manual release review list.
- `F-136` leaves `layers.png` stale in this PR on purpose to keep the change
  scoped; it belongs to the release documentation pass.

### Checks

Local gate on `d28cac7`:

- `check:versions` (0.29.0), `check:file-budgets` (619 files),
  `check:modules` (22 foundation features, 34 Tauri commands),
  `check:security`, `check:actions`, `check:dependencies`,
  `check:docs` (270 links, 55 images, 40 screenshots, no stale warning),
  `format:check`, `lint`, `check:i18n` (3 590 keys), `check:themes`,
  `npx tsc --noEmit`
- `npx vitest run`: 177 files, 1 783 tests passed
- `test:ui`, `test:visual` (4 baselines, 0 differing pixels),
  `test:a11y` (100 checks, 0 serious/critical), `test:touch-targets`
  (754 controls across 23 surfaces), `test:ui-scale` (100/150/200 %),
  `test:docs-capture`, `npm run docs:capture`

Not run locally, left to CI: the Windows/macOS desktop matrix and the packaged
smoke test. No Rust or `tauri.conf.json` change, so no desktop shell build was
needed.

### Conductor verification

- PR [#326](https://github.com/MajorJohnDoe/gridscalr/pull/326) final head
  `a98c800bd3ea42722a1521fc404b879a5e11d31a` matched the worker report; all six
  checks were `success`, the base was `main` (`e897d6e`, whose `main` CI run
  [44307940834](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44307940834)
  is green) and the merge state was `CLEAN`/`MERGEABLE` before the merge.
- Conductor re-ran `npx vitest run tests/dialogHost.test.ts
  tests/dialogFocus.test.ts tests/takeoffSettingsUi.test.ts
  tests/backupManager.test.ts tests/conflictedCopies.test.ts` on the
  pre-review-fix head: 5 files, 66 tests passed. The review-fix commit touches
  only the ADR, the user guide, `foundation-findings.md`, the handover,
  `layers.png` and its manifest entry, so no production code changed after that
  run.
- Scope matched #321: the new `src/features/dialogHost/` is a foundation feature
  with a pure `model.ts` (163 lines), a DOM controller (282) and a UI shell
  (337); `src/ui/dialogs.ts` shrank to 264 lines and `src/app/App.ts`,
  `src/app/pageFlows.ts` and `src/app/clipboardPaste.ts` changes are wiring.
  No `src/model/types.ts`, `src/io/projectFile`, version file, `Cargo.*`,
  `tauri.conf.json`, `security/`, `site/` or `file-budgets.json` change;
  `SCHEMA_VERSION` stays 28 and the app version stays 0.29.0.
- The locked decision is present in code, not only in the ADR: one
  `.dialog-layer` with `pointer-events: none` and only the `.modal` rectangle
  interactive, no backdrop, `aria-modal="false"` with `aria-labelledby`, no focus
  trap, focus return to the opener, a monotonic `DialogStack` from
  `DIALOG_Z_BASE`, pointer header drag with an ignore list and viewport clamping,
  and one id-based revalidation rule (`checkDialogTarget`/`targetProblem` plus
  `revalidateTarget`/`revalidateTargetNow`) used by every destructive
  confirmation the ADR lists. `headerActions` exists for Phase 4.
- Conductor review found one unstated exception — the Help image lightbox keeps
  `aria-modal="true"` and its dimming backdrop — and required it to be either
  fixed or documented as a deliberate exception. It is now ADR 0017 §9 and one
  sentence in the user guide, with the lightbox unchanged. The review also closed
  F-136 by committing the recaptured `layers.png`; `check:docs` now reports no
  stale-screenshot warning.
- Squash merged as `e37cff6ce670da203c491b5b69d878d57a6367f8`. No tag, release or
  `site/` change.

### Review fixes

- ADR 0017 §9 and the user guide now state the help image lightbox exception;
  the lightbox is unchanged (`role="dialog"`, `aria-modal="true"`, dimmed
  backdrop, Escape/close/click-outside).
- F-136 is resolved with the recaptured `docs/screenshots/layers.png`
  (`1738c3f`), and every other committed screenshot was re-checked by changed
  bounding box: only the autosave timestamp in `recovery-center.png` and faint
  antialiasing in `schedule-csv.png` differ between captures, and both remain
  current UI.
- Re-ran `check:docs`, `format:check`, `lint`, `npx tsc --noEmit`,
  `check:i18n` (catalogs unchanged) and
  `npx vitest run tests/markdown.test.ts tests/helpImages.test.ts tests/dialogHost.test.ts`.

### Next phase

Phase 4 — [schedule editor header actions #322](https://github.com/MajorJohnDoe/gridscalr/issues/322):
put Save, Duplicate and Delete in the takeoff table editor header beside Close,
reusing the Phase 3 `headerActions` surface.

## Phase 4 — schedule editor header actions

- **Issue:** [#322](https://github.com/MajorJohnDoe/gridscalr/issues/322)
- **PR:** [#327](https://github.com/MajorJohnDoe/gridscalr/pull/327), opened from
  `feat/schedule-editor-actions`, base `main` (`5121a3f`). Not merged, not
  auto-merge.
- **Branch:** `feat/schedule-editor-actions`
- **Final verified head:** `c5bad288b4ae52541645e89f438784967a7290f6`
  (implementation `440d3a5`, docs/screenshot/handover commit `c5bad28`). All six
  PR checks passed on that exact SHA; the Rust job's first attempt failed only in
  "Install Linux dependencies" (apt mirror timeout) and passed on the single
  permitted re-run.
- **Merge commit:** `63e9659a092dcbf7c66f8b4149b659eadc5a7b85` (squash merged,
  branch deleted).
- **Schema:** unchanged at 28. App version unchanged at 0.29.0. No persisted
  field, no migration fixture and no `src/io/projectFile` change.
- **Status:** merged to `main`. The base `main` commit `5121a3f` needed one
  environment re-run (same apt-mirror timeout, three attempts) before it was
  green; `main` is green on `5121a3f` and on the merge commit.

### Completed work

- **Save**, **Duplicate** and **Delete** for the takeoff table builder moved
  from the bottom footer toolbar into the dialog header beside the close (X)
  control, through the Phase 3 `showModal({ headerActions })` surface. The
  footer keeps only **Close**, and the `schedules-builder-actions` row is gone,
  so each action exists exactly once.
- New `src/features/schedules/ui/builderActions.ts` owns the header action list
  and the three handlers. They are the existing handlers, moved: the same
  `normalizeScheduleName` check, `createSchedule`/`updateSchedule`,
  `uniqueScheduleName` with `schedules.builder.copyName`, `deleteSchedule`,
  `deletePlacementsForSchedule` and `placementCount`. Each action is still one
  `store.mutate` call, so each is one undo step. No rule was reimplemented.
- Unchanged enabled/disabled rules: Save and Duplicate are disabled in a
  read-only session; Delete is disabled when read-only or when the draft has no
  id yet (a new table).
- The delete confirmation is the existing inline confirmation with the same
  table name and placement count. It is mounted directly under the dialog
  header, outside `.modal-body`, so it cannot scroll away, and it now
  revalidates its table by stable id at confirm time through
  `revalidateTargetNow` (ADR 0017 §6): a table removed behind the non-modal
  window refuses with a localized warning instead of deleting the wrong row.
- Header layout: `.btn .btn-small .modal-header-action` buttons with an icon, a
  visible label, `aria-label` and a `title` tooltip, in the order
  Save / Duplicate / Delete / Close. Save keeps the primary style, Delete keeps
  `.btn-danger` and the standard disabled opacity. Below 1100 px viewport (the
  breakpoint the builder already uses for its top form grid) the label is
  hidden and the button becomes a 26 px icon button while the accessible name
  and tooltip stay. Measured in Chromium: actions 259 px at 1920×1080 and
  1280×720 with labels, 90 px icon-only at 960×540 and 760×620, header overflow
  0 at every scale.
- Keyboard: the header actions precede the body in DOM order, so `Tab` reaches
  them first; initial focus stays on the Name field (the shell's "first enabled
  field" rule), so the dialog's focus contract is unchanged.
- `src/features/schedules/ui/builder.ts` shrank from 269 to about 130 lines. No
  business logic was added to `App.ts` or `CanvasView.ts`.
- Docs: `docs/user-guide.md` (builder section), `docs/architecture.md`,
  the `AGENTS.md` module map, `scripts/capture-docs-shots.mjs` alt/description
  and the recaptured `docs/screenshots/schedule-builder.png` with its manifest
  entry.

### Modules

- `src/features/schedules/ui/builderActions.ts` (new)
- `src/features/schedules/ui/builder.ts`
- `src/styles/dialogs.css` (`.modal-header-action` surface and the narrow rule)
- `src/styles/schedules.css` (`schedules-builder-confirm`; the action row rule
  removed)
- `tests/scheduleBuilderActions.test.ts` (new)
- `docs/user-guide.md`, `docs/architecture.md`, `AGENTS.md`,
  `scripts/capture-docs-shots.mjs`, `docs/screenshots/schedule-builder.png`,
  `docs/screenshots/manifest.json`, this handover

### Decisions

- **The confirmation sits under the header, not in the body and not in a second
  window.** It has to stay visible when the user scrolled the long body to reach
  a filter, and a nested confirm window would stack a third window over the hub
  for one yes/no question. The strip keeps the existing inline confirmation
  markup and adds the ADR 0017 §6 revalidation rule.
- **Icon buttons with a visible label that collapses.** The label is shown while
  the header has room and hidden at the 1100 px breakpoint the builder already
  uses, instead of a permanently icon-only header that would hide the primary
  action's meaning. The accessible name and tooltip do not depend on the label.
- **No new i18n keys.** The header actions reuse `schedules.builder.save`,
  `.duplicate`, `.delete` and `common.close`, so the catalogs are unchanged and
  `check:i18n` still reports 3 590 keys.
- **Only the builder screenshot was committed.** The other 39 captures differed
  by at most 192 pixels of the documented one-pixel rendering noise (scrollbar
  edge, autosave timestamp, antialiasing) and no other surface changed.

### Findings

- **F-139** (P3): `schedules.builder.deleteTitle` is an unused catalog key. See
  [`foundation-findings.md`](foundation-findings.md).
- Environment note, not a code finding: the `main` CI run on `5121a3f`
  ([44329344083](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44329344083))
  failed only in **Install Linux dependencies**, which hit the 12-minute apt
  timeout — the documented runner/mirror class. No application code was changed
  for it.

### Open questions

- Icon-only header actions at 200 % UI scale are covered by the accessibility,
  touch-target and UI-scale gates and by tooltips; a Windows real-scale review
  stays on the manual release list with the other Windows checks.
- The 1100 px label breakpoint is a viewport media query, not a dialog-width
  container query. It matches the existing builder breakpoint; a future dialog
  that is narrow in a wide window would need a container query.

### Checks

Local gate on `440d3a5`:

- `check:versions` (0.29.0), `check:file-budgets` (620 files),
  `check:modules` (22 foundation features, 34 Tauri commands),
  `check:security`, `check:actions` (37 pins), `check:dependencies` (PASS),
  `check:docs` (271 links, 55 images, 40 screenshots, no stale warning),
  `format:check`, `lint`, `check:i18n` (2 catalogs, 3 590 keys),
  `check:themes` (5 themes), `npx tsc --noEmit`
- focused Vitest: `scheduleBuilderActions` (new, 10 tests), `schedulesUi`,
  `schedules`, `scheduleStandardTable`, `schedulePlacementUi`,
  `takeoffSettingsUi`, `dialogHost`, `dialogFocus`, `accessibilityGate` —
  9 files, 119 tests passed
- `test:ui`, `test:a11y` (100 checks, 0 serious/critical), `test:touch-targets`
  (754 controls, 23 surfaces), `test:ui-scale` (100/150/200 %),
  `test:visual` (4 baselines), `test:docs-capture` (40 screenshots), and
  `npm run docs:capture` for the committed screenshot

Two browser runs failed once on `page.goto` with a 30-second navigation timeout
before the app had loaded and passed unchanged on the retry; that is the local
Vite cold-start class, not a code failure. Not run locally, left to CI: the
Windows/macOS desktop matrix and the packaged smoke test. No Rust or
`tauri.conf.json` change, so no desktop shell build was needed.

### Conductor verification

- PR [#327](https://github.com/MajorJohnDoe/gridscalr/pull/327) head
  `c5bad288b4ae52541645e89f438784967a7290f6` matched the worker report; all six
  checks were `success`, the base was `main` (`5121a3f`, green after one
  environment re-run) and the merge state was `CLEAN`/`MERGEABLE`.
- Conductor re-ran `npx vitest run tests/scheduleBuilderActions.test.ts
  tests/schedulesUi.test.ts tests/dialogHost.test.ts tests/takeoffSettingsUi.test.ts
  tests/accessibilityGate.test.ts`: 5 files, 70 tests passed.
  `check:file-budgets` (620 files), `check:modules` (22 foundation features),
  `check:i18n` (3 590 keys), `check:versions` (0.29.0) and `check:docs`
  (272 links, 55 images, 40 screenshots, no stale warning) are green.
- Scope matched #322: only `builder.ts` (−141 lines), the new
  `builderActions.ts` (206 lines), the two style sheets, one new test file, the
  builder screenshot and its capture metadata, and documentation. No
  `src/model/types.ts`, `src/io/projectFile`, version file, `Cargo.*`,
  `tauri.conf.json`, `security/`, `site/` or `file-budgets.json` change.
- Acceptance criteria verified in the diff: `headerActions` carries Save /
  Duplicate / Delete beside Close, the body keeps only `sections` and
  `problems`, the footer is Close only, and the delete confirmation strip is
  mounted under the header (outside the scrolling body). The handlers are the
  existing ones moved, so validation, duplicate naming, delete cascade and one
  undo step are unchanged, and the delete revalidates by stable id through the
  Phase 3 `revalidateTargetNow` rule.
- Squash merged as `63e9659a092dcbf7c66f8b4149b659eadc5a7b85`. No tag, release or
  `site/` change. F-139 (unused `schedules.builder.deleteTitle` key) is recorded
  as a P3 follow-up rather than fixed here.

### Next phase

Phase 5 — [placed takeoff table style #323](https://github.com/MajorJohnDoe/gridscalr/issues/323):
grey striped placed table with group, subtotal and grand-total emphasis on the
canvas and in the PDF through one shared layout.

## Phase 5 — placed takeoff table style

- **Issue:** [#323](https://github.com/MajorJohnDoe/gridscalr/issues/323)
- **PR:** [#328](https://github.com/MajorJohnDoe/gridscalr/pull/328), opened from
  `feat/placed-table-style`, base `main` (`f1e2a34`). Not merged, not auto-merge.
- **Branch:** `feat/placed-table-style`
- **Implementation commit:** `a39cd5c93ecc300df0f410b72478065e72d7c41f`
  (feature), documentation and capture commit `375a370`.
- **Final verified head:** `375a3706a2aae5ec5c17d0b14f16416954951b1b`.
  All six PR checks are `success` on that exact SHA after the `Rust format and
  check` job was re-run once: its two attempts failed only in
  "Install Linux dependencies" (`us-east-2.ec2.archive.ubuntu.com` apt mirror
  timeout), the same runner class as Phases 3–4, and it passed unchanged at the
  third attempt.
- **Merge commit:** `5dd6c681dd8e0c1ecd54c0f8bcdb2120a81eec8b` (squash merged,
  branch deleted).
- **Schema:** unchanged at 28. App version unchanged at 0.29.0. No persisted
  field, no migration fixture and no `src/io/projectFile` change.

### Completed work

- The placed table is banded in the shared layout: a light grey header band,
  subtle alternating row bands, a banded group header with a section rule above
  it, one separated subtotal row per group and a dark grand total row with light
  bold text. Cell padding, rule weights (0.4 grid / 0.8 section), alignment
  (numbers right, text left) and bold typography (headings, groups, subtotals,
  total) are unchanged or made explicit; the layout's geometry is untouched.
- `layoutScheduleTable()` stays the single source: it now also emits
  `bands: ScheduleBand[]` (one background rectangle per drawn row, in paint
  order) and adds `group`/`subtotal` section rules to `lines`. `ScheduleLineRole`
  gained those two roles. The canvas fills the bands, strokes the lines and inks
  the cells; the PDF export fills the same bands as rotated rectangles and
  strokes/inks the same cells.
- New `src/features/schedules/layoutStyle.ts` (253 lines, pure): band and ink
  roles, the `--table-*` token contract, the document palette, WCAG contrast and
  the readability resolver, plus the role mapping both renderers share.
- New `src/canvas/items/scheduleStyle.ts` (40 lines): reads the active theme's
  custom properties, caches per `data-theme` so a pan or zoom never calls
  `getComputedStyle`, and exposes a reset for tests and a theme switch.
- Twelve `--table-*` tokens added to `src/styles/tokens.css` and all five
  palettes, plus `REQUIRED` and nine AA pairs in `scripts/theme-token-rules.mjs`.
- Unchanged by design: hidden/locked rules, row ranges, overflow reporting,
  ellipsis, the column model, the builder, the right-dock live table and
  CSV/XLSX.

### Modules

- `src/features/schedules/layoutStyle.ts` (new), `layout.ts`, `layoutCells.ts`
- `src/canvas/items/scheduleStyle.ts` (new), `src/canvas/items/schedule.ts`
- `src/pdf/export/items/schedule.ts`
- `src/styles/tokens.css`, `src/styles/themes/*.css` (five palettes),
  `scripts/theme-token-rules.mjs`
- `tests/scheduleTableStyle.test.ts` (new)
- `docs/user-guide.md`, `README.md`, `docs/architecture.md`, `AGENTS.md`,
  `docs/plan/foundation-findings.md`, ten `docs/screenshots/*.png` and
  `docs/screenshots/manifest.json`

### Decisions

- **Document contract, not chrome.** A placed table is drawing content on the PDF
  sheet, which is white in every palette, so its roles describe a printed
  document: paper and bands stay light in all five themes and only the neutral
  tint and the header accent follow the palette. `check:themes` pins nine ink/band
  pairs at 4.5:1 in every palette so no theme can ship an unreadable table.
- **Injected resolution, one rule.** The pure layout carries roles, never
  colours. The canvas injects the theme tokens, the PDF injects nothing and gets
  the document palette, and both call the same resolver, so a broken palette
  falls back instead of rendering black on black.
- **Item colour keeps the outer frame.** `resolveItemColor` still draws the outer
  border (never black), so the table stays identifiable by its layer; inner rules
  and all ink come from the table contract. An explicit `item.fillColor` becomes
  the table paper rather than being overpainted.
- **The first group header reuses the header rule.** Its section rule lands on
  the header bottom, so `gridLines` de-duplicates by y instead of drawing two
  overlapping rules.

### Findings

- **F-140** (P3): the right-dock live table, the quantity report PDF and the
  CSV/XLSX output keep their own table styling, so one takeoff table has three
  looks. Out of scope for #323 by design.
- **F-141** (P3): `docs:capture` writes literal em dashes while the committed
  manifest stores `\u2014` escapes, so every capture changes six unrelated title
  lines. Phase 5 patched only `generatedAt` and `sourceFingerprint`.
- No regression finding: canvas draw work grows by one `fillRect` per drawn row
  (bounded by the row window), and the layout cost is unchanged; `check:performance`
  and the placement suites stay green.

### Open questions

- Whether the report PDF should adopt `DOCUMENT_SCHEDULE_STYLE` (F-140) is a
  design decision for the effort exit, not a bug.
- A future theme that renders a dark drawing sheet would need the `--table-*`
  contrast pairs re-checked; the contract assumes a white sheet.

### Checks

Local gate on `a39cd5c`:

- `check:versions` (0.29.0), `check:file-budgets` (622 files),
  `check:modules` (22 foundation features, 34 Tauri commands), `check:security`,
  `check:actions` (37 pins), `check:dependencies` (PASS), `check:docs`
  (272 links, 55 images, 40 screenshots, no stale warning), `format:check`,
  `lint`, `check:i18n` (2 catalogs, 3 590 keys), `check:themes` (5 themes),
  `npx tsc --noEmit`
- focused Vitest: `scheduleTableStyle` (new, 19 tests), `schedulePlacement`,
  `schedulePlacementPdf`, `schedulesPerformance`, `schedules`, `theme` — 6 files,
  114 tests passed
- `check:performance` (p95 edit 37.7 ms, open 9.6 ms, autosave 938.7 ms, page
  switch 23.8 ms, freeze 86.3 ms — all PASS), `test:visual` (4 baselines,
  `count-types` 24 px at delta 1), `test:a11y` (100 checks, no serious/critical),
  `test:ui-scale` (100/150/200 %), `test:docs-capture` (40 screenshots, dry run)

Not run locally, left to CI: the Windows/macOS desktop matrix and the packaged
smoke test. No Rust or `tauri.conf.json` change, so no desktop shell build was
needed.

### Conductor verification

- PR [#328](https://github.com/MajorJohnDoe/gridscalr/pull/328) head
  `375a3706a2aae5ec5c17d0b14f16416954951b1b` matched the worker report; the base
  was `main` (`f1e2a34`, green) and the merge state was
  `CLEAN`/`MERGEABLE` after the one environment re-run described above.
- Conductor re-ran `npx vitest run tests/scheduleTableStyle.test.ts
  tests/schedulePlacement.test.ts tests/schedulePlacementPdf.test.ts
  tests/schedulesPerformance.test.ts`: 4 files, 46 tests passed.
  `check:themes` (5 themes), `check:file-budgets` (622 files), `check:modules`
  (22 foundation features), `check:versions` (0.29.0) and
  `GRIDSCALR_PERF_PROFILE=ci npm run check:performance` (p95 edit 32.7 ms,
  open 9.6 ms, autosave 950 ms, page switch 13.3 ms, freeze 76.7 ms — all PASS)
  are green.
- Scope matched #323 and the module map: `layout.ts` emits paint-ordered
  `bands` plus `grid`/`outer`/`header`/`group`/`subtotal`/`total` rules, the new
  `layoutStyle.ts` (253 lines) owns the band roles and the injected token
  resolver, and the new `canvas/items/scheduleStyle.ts` (40 lines) only reads the
  palette. Both renderers consume the same layout; the parity tests assert
  identical rows, cells, lines and bands for a grouped table and a difference
  only in measured text. No `src/model/types.ts`, `src/io/projectFile`, version
  file, `Cargo.*`, `tauri.conf.json`, `security/`, `site/` or `file-budgets.json`
  change.
- Theme rule verified in tests and by `check:themes`: 12 `--table-*` tokens are
  required in all five palettes, a missing or malformed token falls back to the
  document palette, and a band that defeats both document inks is re-resolved so
  black-on-black cannot be produced.
- Screenshots: `placed-table.png` and `takeoff-tab.png` carry the restyle. Eight
  other captures were committed with sub-1 % size deltas from the same run; they
  are current renders rather than UI changes, which is the conservative choice
  after F-136. No `tests/visual/` baseline changed because no visual scene shows
  a placed table.
- Squash merged as `5dd6c681dd8e0c1ecd54c0f8bcdb2120a81eec8b`. No tag, release or
  `site/` change. F-140 (dock table and report PDF keep their own palette) and
  F-141 (capture manifest escaping churn) are recorded as P3 follow-ups.

## Effort status

The five phases are merged on schema 28 with the app version still **0.29.0**.
`0.30.0` remains untagged and unreleased, and `site/release.json` is unchanged.

- Phase 1 `0afa4dbf0f3eec97ac7ac860dde5a83fd2767ce6` — pointer-based row
  reordering for pages, layers and builder columns; native file drops kept.
- Phase 2 `22a1f6d7238f4cd1394eabdbcf91d4c3314d50d6` — measurement settings and
  the page-scoped target layer in one flyout; left-click family flyouts.
- Phase 3 `e37cff6ce670da203c491b5b69d878d57a6367f8` — movable, non-modal
  dialog windows, ADR 0017, id-based confirmation revalidation.
- Phase 4 `63e9659a092dcbf7c66f8b4149b659eadc5a7b85` — takeoff table builder Save
  / Duplicate / Delete in the header.
- Phase 5 `5dd6c681dd8e0c1ecd54c0f8bcdb2120a81eec8b` — grey banded placed table
  with group, subtotal and total bands shared by canvas and PDF.
- Findings carried: F-135 (per-platform reorder manual gate), F-137 (flyouts and
  menus outside `DialogStack`), F-138 (unused `--overlay-modal` token), F-139
  (unused builder delete label key), F-140 (dock table palette), F-141 (capture
  manifest churn). All are P3.
- Open gate: the product owner's Windows 11 check of mouse reordering and file
  drops, on a build from `5dd6c681d`. The release decision belongs to the product
  owner; no version bump, tag, GitHub Release or `site/release.json` change was
  made by this effort.
- Environment finding: the `Install Linux dependencies` step failed on an apt
  mirror timeout in four separate runs across Phases 3–5 and passed unchanged on
  re-run each time. No application change was made for it.

### Next

Next: effort exit — final documentation pass, Windows build and release decision

## Windows test build and effort exit

- **Build:** `Release build` run
  [44348740635](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44348740635)
  on merge commit `5dd6c681d`. The Windows job succeeded; the macOS job was
  cancelled at the runner-queue limit, so the `checksums` job was skipped and no
  merged `SHA256SUMS.txt` exists for this run. The Windows artifact was
  downloaded on its own and verified against the artifact's own
  `SHA256SUMS-windows.txt` (`sha256sum -c`: three files OK).
- **Artifacts handed to the product owner** (app version still 0.29.0, no tag, no
  release):
  - `GridScalr_0.29.0_x64-setup.exe` — `79c4c34abb94ae292f2ed8f14df1f531fd767f9fb49dc2319a2ea6b96975654b`
  - `GridScalr_0.29.0_x64_en-US.msi` — `2fbd105ccecd21caafdd62f4abecbd884dc16b920ccae0a31d7698a954bbb7e6`
  - `gridscalr.exe` (portable) — `edbb159e152600149b9614b7016d01ecde3a1fff6b0a920de56d876f5faa94c5`
- **Verification build for Windows 11:** drag a page card, a layer row and a
  takeoff builder column; drop a PDF, TIF and `.gridscalr` on the window and on
  the Pages panel; open a measurement tool flyout with a left-click and with a
  long-press. The result decides whether #319 is release-complete.
- **CI on `main`:** the merge-commit run
  [44348719921](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44348719921)
  was cancelled by the concurrency group when this handover commit was pushed.
  The descendant commit `a2b522a` (documentation only) is green in all six jobs
  (run
  [44348901947](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44348901947)),
  so the merged tree is verified. The **Pages** run
  [44348719855](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44348719855)
  deployed the recaptured screenshot set.
- **Strict documentation:** `GRIDSCALR_DOCS_STRICT=1 npm run check:docs` passes
  with 272 links, 55 images and 40 screenshots and no stale-screenshot warning.
- **Release decision:** 0.30.0 stays untagged and unreleased. No version field,
  tag, GitHub Release or `site/release.json` entry changed in this effort; the
  product owner decides the version and release after the Windows check.

## Follow-up — variant flyout click and area shape rows

- **Issues:** [#329](https://github.com/MajorJohnDoe/gridscalr/issues/329)
  (one left-click opens every tool flyout) and
  [#330](https://github.com/MajorJohnDoe/gridscalr/issues/330) (area shape as
  clickable icon options), one PR closing both. Epic #318. Schema unchanged at
  28; app version unchanged at 0.29.0.
- **PR:** [#331](https://github.com/MajorJohnDoe/gridscalr/pull/331), opened from
  `feat/measurement-flyout-polish`, base `main` (`504ad8f`). Not merged, not
  auto-merge.
- **Verified implementation head:** `4aa3996742addda5a25b3c0474a0c37d54239dd0`
  (`d440e17` #329, `e2617b7` #330 with docs and screenshot, `2b5a119` withdrawn
  advisory, `4aa3996` allowlist test). All six PR checks passed on that SHA (CI
  run [44397348746](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44397348746)).
  The commit carrying this handover entry is documentation only; it is not a new
  implementation head.
- **Branch:** `feat/measurement-flyout-polish`.

### Changes

- **#329.** The "opens on a click" decision moved out of a second id list in
  `toolFlyouts.ts` into the tool metadata: `ToolDef.variantFlyout` on the seven
  tools plus `hasToolVariants()` in `toolDefs.ts`. `attachToolFlyout` now passes
  the left-click flag to the shared press handler, so `cloud`, `highlight`,
  `callout`, `stamp`, `arrow`, `line` and `polyline` open on a normal click while
  the rail click still selects the tool. Long-press and right-click are
  unchanged, and the context bar's **Variants** control opens the same panel.
  The per-tool renderer is now a keyed `VARIANT_FLYOUTS` record instead of an
  if-chain that quietly fell back to the arrow panel, so a tool that declares
  variants without a panel is caught by `tests/toolFlyouts.test.ts`.
- **#330.** `renderAreaOptions` replaces the **Shape** select with a
  `role="radiogroup"` (`aria-label` from `measureOptions.areaShape`) of three
  `role="radio"` rows — Polygon, Rectangle, Ellipse — each with its tool icon and
  localized label. The selected row carries the check mark, the selected row
  style and `aria-checked`, and the group is one tab stop (roving `tabindex`);
  arrow keys move and apply, `Space`/`Enter` apply the focused row, focus stays
  in the flyout. The write path is still `store.setMeasureAreaShape(...)` and the
  **Area** add/deduct select is untouched. The row markup moved to the new
  shared `src/ui/variantRow.ts`, used by both the tool flyouts and this panel;
  `ui.ts` is 304 lines and `toolFlyouts.ts` shrank to 604.

### Tests and checks

- `tests/toolFlyouts.test.ts`: left-click opens and selects for every declared
  variant tool, metadata and renderer keys must match, long-press and
  right-click still open, a tool without metadata stays inert, each tool uses
  its own panel.
- `tests/measurementFlyout.test.ts`: three icon rows with no shape select, the
  selected row marked and announced, click writes and re-marks, single tab stop,
  arrow/Enter/Space keyboard path with focus kept in the flyout, and the Swedish
  group name and labels.
- `npm test -- --run` 179 files / 1 821 tests; focused flyout, tool-family,
  shortcut, accessibility, schedule-UI and dialog-focus suites; the local gate;
  `test:ui`, `test:canvas`, `test:a11y` (100 checks), `test:touch-targets` (756
  controls, 23 surfaces), `test:ui-scale` (100/150/200 %), `test:visual` (4
  baselines), `npm run docs:capture` for `measure-flyout.png` and
  `test:docs-capture`.
- Docs: `docs/user-guide.md` (click opens the variant flyouts; the shape is
  clicked), `docs/workflows.md`, `docs/architecture.md`, `AGENTS.md` module map,
  the recaptured `docs/screenshots/measure-flyout.png` with its manifest entry.
- **Dependency gate (F-142):** the first push failed `check:dependencies` because
  GitHub withdrew `GHSA-FC5Q-39XC-VJPF` (picomatch ReDoS) at 2026-11-18T15:38Z;
  `npm audit` reported zero npm findings for the unchanged lockfile and the gate
  demanded the stale entry's removal. The withdrawn npm exception is removed
  from `security/dependency-allowlist.json` (six cargo entries remain, all
  reviewed to 2027-02-15), the committed-allowlist test now pins those six, and
  the gate passes. No dependency version changed.
- **Run record:** the first CI run failed only on that stale gate plus the
  documented `Install Linux dependencies` apt-mirror timeout in the Rust job
  (re-run, then green). A second run exposed the allowlist test still asserting
  seven advisories; `4aa3996` fixes it, and the run above is green in all six
  jobs.


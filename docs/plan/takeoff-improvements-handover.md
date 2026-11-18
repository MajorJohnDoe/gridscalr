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
- **Verified head SHA:** `8f818b1` (implementation `432bfb6`, handover
  `8f818b1`). All six PR checks passed on that exact SHA (CI run
  [44289208825](https://github.com/MajorJohnDoe/gridscalr/actions/runs/44289208825)).
  This CI-record commit follows it; the conductor verifies the actual PR head.
- **Merge commit:** pending.
- **Status:** PR open and green, not merged, no auto-merge. Windows manual
  confirmation is pending and the issue stays open until it passes.

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

Pending. The conductor must confirm the PR head SHA, every required check on
that SHA, the file scope against #319 and the acceptance criteria, and must not
merge until the PR is green. The Windows manual gate stays open after the merge.

### Next phase

Phase 2 — [measurement tool flyout #320](https://github.com/MajorJohnDoe/gridscalr/issues/320):
move the **New measurement** settings and layer selection into the measurement
tool flyout, open family flyouts on a normal left-click, keep long-press and
right-click. No schema change expected.

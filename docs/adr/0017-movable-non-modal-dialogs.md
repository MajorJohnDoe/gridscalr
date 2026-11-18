# ADR 0017: Movable, non-modal dialog windows

- Status: Accepted; implemented in the 0.30.0 development line ([#321](https://github.com/MajorJohnDoe/gridscalr/issues/321))
- Date: 2026-11-18
- Deciders: GridScalr maintainer
- Supersedes: none
- Related: [0001](0001-feature-modules.md), [0008](0008-integration-module-boundaries.md), [0013](0013-module-first-foundation.md)

## Context

Every dialog in GridScalr was a web modal. `showModal` mounted a full-screen
backdrop with a dimming blur, marked the dialog `aria-modal="true"`, trapped
`Tab` inside it, and closed only when the dialog itself finished. The backdrop
swallowed every pointer event, so while a dialog was open the drawing behind it
could not be panned, zoomed, selected or measured.

That conflicts with how the app is used. A takeoff value is read from the
drawing, and a category, room, table filter or custom field is chosen by looking
at the plan. Under the modal contract the user had to close the dialog, inspect
the drawing, remember the value and reopen the dialog. Opening a confirmation
from a settings dialog also closed the settings dialog, because `showModal`
closed the active dialog before mounting the next one.

The product decision is that **every dialog with a close (X) behaves like a
normal desktop window**: it can be moved out of the way, it does not block the
rest of the window, and focus and Escape still behave predictably.

A non-modal window makes one destructive case newly possible: the object named
by a confirmation can change or disappear while the confirmation is open,
because the user can interact with the drawing behind it.

## Decision

### 1. One dialog window shell

`src/features/dialogHost/` owns the window behaviour. `showModal` remains the
name every call site uses (re-exported from `src/ui/dialogs.ts`) and now means
"open a dialog window" rather than "open a modal".

- Each dialog is mounted in its own `.dialog-layer` fixed to the viewport with
  `pointer-events: none`. The `.modal` rectangle restores `pointer-events: auto`.
  Nothing dims, blurs or covers the drawing, and a click outside the window
  reaches the canvas instead of the dialog.
- There is no backdrop and no click-outside-to-close. A non-modal window is
  dismissed by its X, its Cancel/Close action or `Escape`; clicking the drawing
  must not destroy unsaved dialog state.
- A normal `role="dialog"` names the window with `aria-labelledby` pointing at
  its own title. The title id is unique per dialog, so stacked dialogs do not
  share an id.
- `aria-modal="false"`. The content behind the dialog is not inert and is not
  hidden from assistive technology, because it is genuinely usable.

### 2. Focus

- Initial focus still enters the dialog: the element marked
  `data-dialog-autofocus`, else the first enabled field, else the safe primary
  action. A destructive primary action is never the default (unchanged from the
  previous contract).
- There is **no focus trap**. `Tab` and `Shift+Tab` leave the dialog and can
  re-enter it, which is what a non-modal window does and what the Web Content
  Accessibility Guidelines allow when the rest of the page is interactive.
- Closing a dialog returns focus to the element that opened it, when that
  element is still in the document and the closing dialog owned focus. Closing a
  background window does not steal focus.
- Global application shortcuts pause while focus is **inside** a dialog
  (`document.activeElement.closest(".dialog-layer")`). Clicking the canvas moves
  focus there, so tool, zoom and pan shortcuts work again without closing the
  dialog. Tool shortcuts never fire from a dialog field.

### 3. Escape and stacking

- `Escape` closes the dialog that owns focus, or the topmost dialog when focus is
  outside every dialog. A transient flyout or menu owns `Escape` while it is
  open, so a dialog does not close underneath it.
- Stacking is deterministic. Every open or raised dialog takes the next value of
  a monotonically increasing counter and uses it as its `z-index` from the
  `DIALOG_Z_BASE` (2000) band. A dialog is raised when it is opened, when it
  receives a pointer press and when focus enters it. The newest or most recently
  used window is therefore on top, and `Escape` never has to guess.
- New dialogs are inserted as the first child of `<body>`, so the first
  `.dialog-layer` in document order is the topmost window. Tests and diagnostics
  can read the order without consulting internal state.

### 4. Moving

- The header is the drag handle. Buttons, links, fields, selects, textareas,
  `[role="button"]`, contenteditable regions and `[data-dialog-no-drag]` opt out,
  so the close control, a header action and a title-bar field stay clickable.
- Dragging is pointer-based with an implicit capture, and `Escape`/pointer
  cancel ends the gesture. A drag cannot start from the body, a footer action or
  the close control.
- The window is clamped so its whole rectangle stays inside the viewport with an
  eighth-of-a-window-equivalent `DIALOG_MARGIN` (8 px); a window larger than the
  viewport keeps its top-left at the margin so the header stays reachable. A
  viewport resize re-clamps every open window.
- Window positions are **not remembered** across sessions and are not part of
  the project file.

### 5. Nested editors stack; self-refreshes repaint

- Opening a dialog while another is open stacks it on top; closing it returns to
  the window underneath. This is the reason `showModal` no longer closes the
  active dialog. The Takeoff settings hub therefore stays open under the custom
  field editor or the takeoff table builder, and returning repaints the current
  tab in place (`categoryLayout().refresh()`).
- A window that rebuilds **itself** after a change (Preferences, after a
  workspace, stamp, recovery or recent-file change) repaints its body in place
  through `refreshPreferencesDialog()` instead of opening a second copy.
  Switching the interface language still rebuilds the Preferences window because
  its title and tab labels must be relabelled.

### 6. Destructive confirmations revalidate their target

A confirmation that deletes, detaches, replaces or otherwise destroys something
records the target's **stable id** and a `resolve()` callback when it opens. Just
before the action runs, the shared rule re-resolves the id:

```ts
target: {
  kind: "layer",
  id: layer.id,
  name: layer.name,
  resolve: () => store.project?.layers.some((entry) => entry.id === layer.id) ? layer.id : null,
}
```

- The target is gone → the dialog shows a localized explanation and does
  nothing.
- The target resolves to a different id → same refusal.
- Otherwise the action runs on the captured id, never on whatever is selected
  now.

The rule lives in one place: `checkDialogTarget` / `targetProblem` in
`features/dialogHost/model.ts`, `revalidateTarget` (dialog action) and
`revalidateTargetNow` (inline confirmation) in `features/dialogHost/ui.ts`.
Confirmations covered today: item-less layer, layer-subtree and bulk-layer
delete, layer clear-on-page, page delete, category, count type, takeoff table and
custom field delete, space delete, backup delete, conflicted-copy delete and the
destructive source actions (detach, relink mismatch).

Inline confirmations that live inside a non-modal settings dialog (category,
count type, table, space, field) use the synchronous form and close with a
warning when the target vanished, because the drawing behind them is now
interactive.

### 7. Header action surface

`showModal` accepts `headerActions`, an array of controls placed between the
titles and the close button in `.modal-header-actions`. Phase 4 puts the takeoff
table editor Save, Duplicate and Delete there; the shell itself owns no action.

### 8. Accessibility gate

`npm run test:a11y` runs axe against the dialogs with `aria-modal="false"` and no
trap and must stay at zero serious or critical violations. No allowlist entry was
needed. The manual checklist in [`testing.md`](../testing.md) covers focus
return, `Tab` leaving and re-entering, Escape routing and moving a window.

## Consequences

- The drawing stays usable behind every dialog, which is the point. Reading a
  value from the plan and entering it in a dialog no longer requires closing it.
- A dialog no longer dismisses on an outside click. This is a deliberate
  behaviour change: a stray click on the drawing must not discard typed settings,
  and the drawing must remain a click target.
- Global shortcuts are suspended only while focus is inside a dialog, not while
  one is merely open. Users can click the canvas and keep measuring.
- Two dialogs can show the same settings surface if a future call site reopens
  its own window without a refresh hook. The hub and Preferences use in-place
  refresh; new self-reopening dialogs should do the same.
- Window positions are not persisted, so a rebuild or reopen returns the window to
  the centre. Remembered positions would need a separate product decision and a
  preference store, not a project field.
- A destructive confirmation can now be answered while the object behind it
  changes. The id-based revalidation rule is mandatory for every new destructive
  confirmation; a confirmation without a `target` is only acceptable when the
  target is a value typed into the dialog itself.

## Alternatives rejected

- **Keep the modal contract and add a "keep open" checkbox.** It would not solve
  reading the drawing, and a checkbox per dialog is worse than one window model.
- **Keep a transparent backdrop that blocks pointer events.** The drawing would
  still be unusable, and a full-screen transparent layer confuses hit testing.
- **Remember window positions.** Out of scope for this phase; the plan lists it as
  a non-goal.
- **Freeze the canvas behind a destructive confirmation.** A blanket freeze would
  undo the reason for non-modal dialogs; id-based revalidation is narrower and
  keeps the rest of the window usable.

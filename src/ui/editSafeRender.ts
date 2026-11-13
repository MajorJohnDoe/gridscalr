import type { ChangeReason } from "../state/store";
import {
  captureField,
  isEditableField,
  restoreField,
  type FieldSnapshot,
} from "./editFieldSnapshot";

/**
 * Edit-safe shell rendering.
 *
 * The shell renders from state: every panel is emptied and rebuilt. That is
 * cheap and predictable, but it removes the field the user is typing in. Each
 * whole-shell render therefore goes through this scheduler, which knows about
 * the edit in progress:
 *
 * - a background refresh (a save or read-only change emits `"save"`) waits for
 *   the focused field to lose focus instead of removing it;
 * - an immediate render runs one tick later, once the event that asked for it
 *   has finished, and restores the field through `editFieldSnapshot.ts`;
 * - a render requested from inside a running render is queued and runs after
 *   it, never nested, so a `change` fired while the panel is cleared cannot
 *   start a second clear inside the first.
 *
 * The state lives per shell root so the scheduler is testable on its own and a
 * second shell (a test harness) cannot share a queue with the app.
 */

export { captureField, isEditableField, restoreField } from "./editFieldSnapshot";
export type { FieldSnapshot } from "./editFieldSnapshot";

/** Reasons that only refresh derived data and must never disturb an edit. */
const BACKGROUND_REASONS: ReadonlySet<ChangeReason> = new Set<ChangeReason>(["save"]);

/** A render that keeps re-queueing itself is a bug; stop instead of looping. */
const MAX_RENDERS_PER_FLUSH = 8;

interface ShellRenderState {
  paint: () => void;
  snapshot: FieldSnapshot | null;
  running: boolean;
  queued: number;
  timer: number | undefined;
  waiting: HTMLElement | null;
  blurListener: (() => void) | null;
  focusOut: () => void;
  justBlurred: boolean;
}

const states = new WeakMap<HTMLElement, ShellRenderState>();

/**
 * Render the shell for `reason` through the paint callback.
 *
 * The callback must rebuild the shell from state. It may request another render
 * while it runs; that request is queued and replayed after the current paint.
 */
export function requestShellRender(
  root: HTMLElement,
  reason: ChangeReason,
  paint: () => void,
): void {
  const state = stateFor(root);
  state.paint = paint;
  if (state.running) {
    state.queued += 1;
    return;
  }
  if (state.timer !== undefined) return;
  if (BACKGROUND_REASONS.has(reason) && focusedField(root)) {
    waitForBlur(root, state);
    return;
  }
  // An explicit render replaces a deferred one: the shell state may have
  // changed in a way the user has to see before they leave the field.
  renderNow(root, state);
}

/** Drop the pending render and listeners for a shell that is going away. */
export function disposeShellRender(root: HTMLElement): void {
  const state = states.get(root);
  if (!state) return;
  cancelWait(state);
  root.removeEventListener("focusout", state.focusOut, true);
  states.delete(root);
}

function stateFor(root: HTMLElement): ShellRenderState {
  const existing = states.get(root);
  if (existing) return existing;
  const state: ShellRenderState = {
    paint: () => undefined,
    snapshot: null,
    running: false,
    queued: 0,
    timer: undefined,
    waiting: null,
    blurListener: null,
    focusOut: () => {
      // A `change` fired by a blur arrives in the same task. Deferring that
      // render by one tick lets the next focus target settle first, so Tab out
      // of a field lands on the control the user asked for.
      state.justBlurred = true;
      queueMicrotask(() => {
        state.justBlurred = false;
      });
    },
    justBlurred: false,
  };
  root.addEventListener("focusout", state.focusOut, true);
  states.set(root, state);
  return state;
}

function focusedField(root: HTMLElement): HTMLElement | null {
  const active = root.ownerDocument.activeElement;
  return isEditableField(active) && root.contains(active) ? active : null;
}

function waitForBlur(root: HTMLElement, state: ShellRenderState): void {
  const field = focusedField(root);
  if (!field) {
    renderNow(root, state);
    return;
  }
  if (state.waiting === field) return;
  cancelWait(state);
  state.waiting = field;
  state.blurListener = () => {
    cancelWait(state);
    schedule(root, state);
  };
  field.addEventListener("blur", state.blurListener, { once: true });
}

function renderNow(root: HTMLElement, state: ShellRenderState): void {
  cancelWait(state);
  if (state.running) {
    state.queued += 1;
    return;
  }
  const editing = captureField(root, root.ownerDocument.activeElement) !== null;
  if (editing || state.justBlurred) {
    schedule(root, state);
    return;
  }
  flush(root, state);
}

/**
 * Run the paint on the next tick. The snapshot is taken when the tick runs, not
 * when it was requested, so a focus move in between is respected.
 */
function schedule(root: HTMLElement, state: ShellRenderState): void {
  if (state.timer !== undefined) return;
  state.timer = window.setTimeout(() => {
    state.timer = undefined;
    if (state.running) {
      state.queued += 1;
      return;
    }
    if (!root.isConnected) return;
    state.snapshot = captureField(root, root.ownerDocument.activeElement);
    flush(root, state);
  }, 0);
}

function flush(root: HTMLElement, state: ShellRenderState): void {
  if (!root.isConnected) return;
  const snapshot = state.snapshot;
  state.snapshot = null;
  state.running = true;
  try {
    let passes = 0;
    do {
      if (state.queued > 0) state.queued -= 1;
      state.paint();
      passes += 1;
    } while (state.queued > 0 && passes < MAX_RENDERS_PER_FLUSH);
  } finally {
    state.running = false;
    state.queued = 0;
  }
  if (snapshot) restoreField(root, snapshot);
}

function cancelWait(state: ShellRenderState): void {
  if (state.waiting && state.blurListener) {
    state.waiting.removeEventListener("blur", state.blurListener);
  }
  state.waiting = null;
  state.blurListener = null;
  if (state.timer !== undefined) {
    window.clearTimeout(state.timer);
    state.timer = undefined;
  }
}

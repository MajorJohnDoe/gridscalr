import { TransientStack } from "./model";

/**
 * One registry for every transient surface above the drawing: tool flyouts,
 * top menus and popovers. A surface registers its root and an Escape callback;
 * the registry gives it a monotonic level, applies it as the root's `z-index`
 * and routes Escape to the topmost registered surface only. Hosts still own
 * their markup, outside-click handling and focus return.
 */

export interface TransientOverlayHandle {
  id: string;
  /** Brings the surface to the front of the transient band. */
  raise: () => void;
  /** Removes the surface from the registry; the host removes its own node. */
  unregister: () => void;
}

interface TransientRecord {
  id: string;
  root: HTMLElement;
  onEscape: () => void;
}

const stack = new TransientStack();
const records = new Map<string, TransientRecord>();
let sequence = 0;
let escapeBound = false;

function applyLevel(record: TransientRecord): void {
  const level = stack.level(record.id);
  record.root.dataset.transientLevel = String(level);
  record.root.style.zIndex = String(level);
}

function bindEscape(): void {
  if (escapeBound) return;
  escapeBound = true;
  document.addEventListener("keydown", onDocumentKeyDown);
}

function unbindEscape(): void {
  if (!escapeBound) return;
  escapeBound = false;
  document.removeEventListener("keydown", onDocumentKeyDown);
}

/**
 * Escape closes the topmost transient surface. The dialog controller also calls
 * `closeTopTransient`, so the routing is the same whichever document listener
 * runs first.
 */
function onDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const top = stack.top();
  if (!top) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  records.get(top)?.onEscape();
}

/**
 * Registers a transient surface. The host appends its root first, then calls
 * this, so the surface is never visible at an unmanaged level.
 */
export function registerTransientOverlay(
  root: HTMLElement,
  onEscape: () => void,
): TransientOverlayHandle {
  sequence += 1;
  const id = `transient-${sequence}`;
  const record: TransientRecord = { id, root, onEscape };
  records.set(id, record);
  stack.open(id);
  applyLevel(record);
  root.dataset.transientOverlayId = id;
  bindEscape();

  const raise = (): void => {
    if (stack.top() === id) return;
    stack.raise(id);
    applyLevel(record);
  };
  root.addEventListener("pointerdown", raise, true);

  return {
    id,
    raise,
    unregister: () => {
      if (!records.has(id)) return;
      records.delete(id);
      stack.close(id);
      root.removeEventListener("pointerdown", raise, true);
      delete root.dataset.transientOverlayId;
      delete root.dataset.transientLevel;
      if (!records.size) unbindEscape();
    },
  };
}

/** Closes the topmost transient surface; returns false when none is open. */
export function closeTopTransient(): boolean {
  const top = stack.top();
  if (!top) return false;
  records.get(top)?.onEscape();
  return true;
}

export function transientOverlayCount(): number {
  return records.size;
}

export function topTransientId(): string | null {
  return stack.top();
}

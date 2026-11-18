import { clampDialogPosition, DialogStack, type Point, type Size } from "./model";

/**
 * Dialog window lifecycle: stacking, header dragging, focus return and Escape
 * routing. The shell markup is built by `ui.ts`; this controller owns the
 * window behaviour shared by every dialog in the app.
 */

export interface DialogSurface {
  layer: HTMLElement;
  modal: HTMLElement;
  /** The header region that moves the window; controls in it stay clickable. */
  dragHandle: HTMLElement;
}

export interface MountedDialog {
  id: string;
  /** Removes the window, restores focus and reports the close once. */
  close: () => void;
  /** Brings the window to the front of the stack. */
  raise: () => void;
}

interface DialogRecord {
  id: string;
  layer: HTMLElement;
  modal: HTMLElement;
  close: () => void;
}

const stack = new DialogStack();
const records = new Map<string, DialogRecord>();
let sequence = 0;
let escapeBound = false;
let resizeBound = false;

const DRAG_IGNORE =
  "button, a, input, select, textarea, [role='button'], [contenteditable='true'], [data-dialog-no-drag]";

function viewportSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

function dialogSize(modal: HTMLElement, rect: DOMRect): Size {
  const style = window.getComputedStyle(modal);
  return {
    width: rect.width || Number.parseFloat(style.width) || modal.offsetWidth || 0,
    height: rect.height || Number.parseFloat(style.height) || modal.offsetHeight || 0,
  };
}

function currentPosition(modal: HTMLElement, rect: DOMRect): Point {
  if (modal.classList.contains("is-positioned")) {
    return {
      x: Number.parseFloat(modal.style.left) || 0,
      y: Number.parseFloat(modal.style.top) || 0,
    };
  }
  return { x: rect.left, y: rect.top };
}

function setPosition(modal: HTMLElement, point: Point): void {
  modal.classList.add("is-positioned");
  modal.style.left = `${Math.round(point.x)}px`;
  modal.style.top = `${Math.round(point.y)}px`;
}

function focusableInside(modal: HTMLElement): HTMLElement | null {
  return modal.querySelector<HTMLElement>("[data-dialog-autofocus]");
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
 * Escape closes the dialog that owns focus, or the topmost one when focus is
 * outside every dialog. A transient flyout or menu owns Escape while it is
 * open, so the dialog window does not close underneath it.
 */
function onDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  const top = stack.top();
  if (!top) return;
  if (document.querySelector(".tool-flyout, .menu-panel")) return;
  const focused = focusedDialogId();
  const target = focused && records.has(focused) ? focused : top;
  records.get(target)?.close();
}

function focusedDialogId(): string | null {
  const active = document.activeElement;
  if (!(active instanceof Element)) return null;
  const layer = active.closest<HTMLElement>(".dialog-layer");
  return layer?.dataset.dialogId ?? null;
}

function refreshTopMarkers(): void {
  const top = stack.top();
  for (const record of records.values()) {
    const isTop = record.id === top;
    record.layer.classList.toggle("is-top", isTop);
    record.layer.dataset.dialogLevel = String(stack.level(record.id));
  }
}

function bindResize(): void {
  if (resizeBound) return;
  resizeBound = true;
  window.addEventListener("resize", clampAll);
}

function unbindResize(): void {
  if (!resizeBound) return;
  resizeBound = false;
  window.removeEventListener("resize", clampAll);
}

function clampAll(): void {
  for (const record of records.values()) {
    // A window the user has not moved is centred by CSS; only a moved window
    // carries explicit coordinates that a resize can push off screen.
    if (!record.modal.classList.contains("is-positioned")) continue;
    const rect = record.modal.getBoundingClientRect();
    const position = currentPosition(record.modal, rect);
    setPosition(
      record.modal,
      clampDialogPosition(position, dialogSize(record.modal, rect), viewportSize()),
    );
  }
}

function enableDrag(record: DialogRecord, handle: HTMLElement): void {
  let drag: {
    pointerId: number | undefined;
    startX: number;
    startY: number;
    origin: Point;
    size: Size;
  } | null = null;

  const endDrag = (): void => {
    if (!drag) return;
    drag = null;
    record.modal.classList.remove("is-dragging");
  };

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || drag) return;
    const target = event.target;
    if (target instanceof Element && target.closest(DRAG_IGNORE)) return;
    const rect = record.modal.getBoundingClientRect();
    const size = dialogSize(record.modal, rect);
    const origin = clampDialogPosition(currentPosition(record.modal, rect), size, viewportSize());
    setPosition(record.modal, origin);
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin,
      size,
    };
    record.modal.classList.add("is-dragging");
    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable in the test DOM and in old engines.
    }
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!drag) return;
    if (drag.pointerId !== undefined && event.pointerId !== drag.pointerId) return;
    const next = clampDialogPosition(
      {
        x: drag.origin.x + (event.clientX - drag.startX),
        y: drag.origin.y + (event.clientY - drag.startY),
      },
      drag.size,
      viewportSize(),
    );
    setPosition(record.modal, next);
    event.preventDefault();
  });

  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    handle.addEventListener(type, endDrag);
  }
}

/**
 * Mounts a built dialog window. The newest window is inserted first in the
 * document so the first `.dialog-layer` in the DOM is the topmost one; the
 * stack itself is the source of truth for z-index and Escape.
 */
export function mountDialog(
  surface: DialogSurface,
  onClose: () => void,
  options: { initialFocus?: () => HTMLElement | null } = {},
): MountedDialog {
  sequence += 1;
  const id = `dialog-${sequence}`;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const { layer, modal, dragHandle } = surface;

  layer.dataset.dialogId = id;
  modal.dataset.dialogId = id;
  document.body.insertBefore(layer, document.body.firstChild);

  const record: DialogRecord = { id, layer, modal, close: () => undefined };
  records.set(id, record);
  layer.dataset.dialogLevel = String(stack.open(id));
  refreshTopMarkers();

  const raise = (): void => {
    if (stack.top() === id) return;
    layer.dataset.dialogLevel = String(stack.raise(id));
    refreshTopMarkers();
  };

  const close = (): void => {
    if (!records.has(id)) return;
    const hadFocus =
      modal.contains(document.activeElement) ||
      document.activeElement === document.body ||
      document.activeElement === null;
    records.delete(id);
    stack.close(id);
    layer.remove();
    refreshTopMarkers();
    if (hadFocus && opener?.isConnected) opener.focus({ preventScroll: true });
    if (!records.size) {
      unbindEscape();
      unbindResize();
    }
    onClose();
  };
  record.close = close;

  layer.addEventListener("pointerdown", raise, true);
  modal.addEventListener("focusin", raise);
  enableDrag(record, dragHandle);
  bindEscape();
  bindResize();

  requestAnimationFrame(() => {
    if (!records.has(id)) return;
    const target = options.initialFocus?.() ?? focusableInside(modal);
    target?.focus();
  });

  return { id, close, raise };
}

/** Closes the topmost dialog; the Escape and `closeActiveModal` rule. */
export function closeTopDialog(): void {
  const top = stack.top();
  if (!top) return;
  records.get(top)?.close();
}

/** Closes every open dialog, topmost first. Used when the project is replaced. */
export function closeAllDialogs(): void {
  for (const id of stack.ids().reverse()) records.get(id)?.close();
}

export function dialogCount(): number {
  return records.size;
}

export function topDialogId(): string | null {
  return stack.top();
}

export interface PointerListeners {
  down: (event: PointerEvent) => void;
  move: (event: PointerEvent) => void;
  up: (event: PointerEvent) => void;
  leave: () => void;
  doubleClick: (event: MouseEvent) => void;
  wheel: (event: WheelEvent) => void;
  contextMenu: (event: MouseEvent) => void;
}

export function attachPointerListeners(
  element: HTMLCanvasElement,
  listeners: PointerListeners,
): void {
  element.addEventListener("pointerdown", listeners.down);
  element.addEventListener("pointermove", listeners.move);
  element.addEventListener("pointerup", listeners.up);
  element.addEventListener("pointercancel", listeners.up);
  element.addEventListener("pointerleave", listeners.leave);
  element.addEventListener("dblclick", listeners.doubleClick);
  element.addEventListener("wheel", listeners.wheel, { passive: false });
  element.addEventListener("contextmenu", listeners.contextMenu);
}

export function detachPointerListeners(
  element: HTMLCanvasElement,
  listeners: PointerListeners,
): void {
  element.removeEventListener("pointerdown", listeners.down);
  element.removeEventListener("pointermove", listeners.move);
  element.removeEventListener("pointerup", listeners.up);
  element.removeEventListener("pointercancel", listeners.up);
  element.removeEventListener("pointerleave", listeners.leave);
  element.removeEventListener("dblclick", listeners.doubleClick);
  element.removeEventListener("wheel", listeners.wheel);
  element.removeEventListener("contextmenu", listeners.contextMenu);
}

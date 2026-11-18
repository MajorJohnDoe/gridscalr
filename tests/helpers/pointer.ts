/**
 * Shared jsdom helpers for the pointer-based row-drag tests.
 *
 * The list gesture no longer depends on HTML5 drag events, so these helpers
 * drive the same pointer sequence a mouse produces: press, move past the drag
 * threshold, release. Keeping one helper makes the page, layer and builder
 * tests exercise one gesture.
 */

/** A DOMRect stub for a row or list, measured from the viewport origin. */
export function rect(top: number, left: number, width: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    left,
    right: left + width,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

export interface PointerPress {
  /** Element that receives the initial press. */
  target: EventTarget;
  /** Viewport position of the press, defaults to the element's own rect. */
  x?: number;
  y?: number;
  pointerType?: string;
  button?: number;
  /** False to simulate a secondary touch pointer. */
  isPrimary?: boolean;
}

export function pointerEvent(type: string, init: PointerEventInit): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: 0,
    ...init,
  });
}

/** Presses a row, then moves and releases on the window, as a mouse does. */
export function dragPointer(
  from: PointerPress,
  to: { x: number; y: number },
  pointerType = "mouse",
): void {
  from.target.dispatchEvent(
    pointerEvent("pointerdown", {
      clientX: from.x ?? 10,
      clientY: from.y ?? 10,
      pointerType: from.pointerType ?? pointerType,
      button: from.button ?? 0,
      isPrimary: from.isPrimary ?? true,
    }),
  );
  window.dispatchEvent(pointerEvent("pointermove", { clientX: to.x, clientY: to.y }));
  window.dispatchEvent(pointerEvent("pointerup", { clientX: to.x, clientY: to.y }));
}

/** Starts a press and moves the pointer without releasing it. */
export function pressAndMove(
  from: PointerPress,
  to: { x: number; y: number },
): { release: (point?: { x: number; y: number }) => void; cancel: () => void } {
  from.target.dispatchEvent(
    pointerEvent("pointerdown", {
      clientX: from.x ?? 10,
      clientY: from.y ?? 10,
      pointerType: from.pointerType ?? "mouse",
      button: from.button ?? 0,
      isPrimary: from.isPrimary ?? true,
    }),
  );
  window.dispatchEvent(pointerEvent("pointermove", { clientX: to.x, clientY: to.y }));
  return {
    release: (point = to) => {
      window.dispatchEvent(pointerEvent("pointerup", { clientX: point.x, clientY: point.y }));
    },
    cancel: () => {
      window.dispatchEvent(pointerEvent("pointercancel", { clientX: to.x, clientY: to.y }));
    },
  };
}

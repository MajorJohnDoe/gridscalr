import type { Point } from "../../model/types";

export function localPoint(
  element: HTMLCanvasElement,
  event: PointerEvent | WheelEvent | MouseEvent,
): Point {
  return localFromClient(element, event.clientX, event.clientY);
}

export function localFromClient(
  element: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): Point {
  const rect = element.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

export function capturePointer(element: HTMLCanvasElement, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic events and some platforms do not expose an active pointer.
  }
}

export function releasePointer(element: HTMLCanvasElement, pointerId: number): void {
  try {
    element.releasePointerCapture(pointerId);
  } catch {
    // The pointer may already have been released by the browser.
  }
}

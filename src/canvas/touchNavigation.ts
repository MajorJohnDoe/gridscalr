import type { Point } from "../model/types";
import { screenToPage, viewForGesture, type Viewport } from "./viewport";

export interface TouchNavigationOptions {
  getView: () => Viewport;
  toLocal: (clientX: number, clientY: number) => Point;
  setView: (next: Viewport, start: Viewport) => void;
  onGestureStart?: () => void;
  /** Palms and accidental touches are ignored while a pen is active or recent. */
  suppressOneFinger?: () => boolean;
  capturePointer?: (pointerId: number) => void;
  releasePointer?: (pointerId: number) => void;
}

/**
 * Two-finger pan and pinch zoom for a canvas surface. One finger is left to
 * the caller so the active tool can draw or select. A remaining finger after a
 * gesture is suppressed until every touch has been lifted.
 */
export class TouchNavigation {
  private pointers = new Map<number, Point>();
  private gesture: {
    ids: [number, number];
    anchorPage: Point;
    startDistance: number;
    startZoom: number;
    startView: Viewport;
  } | null = null;
  private suppressUntilUp = false;

  constructor(private readonly options: TouchNavigationOptions) {}

  get active(): boolean {
    return this.gesture !== null;
  }

  /** True after a gesture until every finger has lifted. */
  get suppressed(): boolean {
    return this.suppressUntilUp;
  }

  /** Returns true when the event belongs to navigation and the caller must stop. */
  pointerDown(event: PointerEvent): boolean {
    if (event.pointerType !== "touch") return false;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.options.capturePointer?.(event.pointerId);
    if (this.pointers.size >= 2) {
      this.begin();
      return true;
    }
    if (this.suppressUntilUp || this.options.suppressOneFinger?.()) {
      this.suppressUntilUp = true;
      return true;
    }
    return false;
  }

  pointerMove(event: PointerEvent): boolean {
    if (event.pointerType !== "touch" || !this.pointers.has(event.pointerId)) return false;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.gesture) {
      this.update();
      return true;
    }
    return this.suppressUntilUp;
  }

  pointerUp(event: PointerEvent): boolean {
    if (event.pointerType !== "touch") return false;
    this.options.releasePointer?.(event.pointerId);
    const tracked = this.pointers.delete(event.pointerId);
    if (this.gesture) {
      this.gesture = null;
      this.suppressUntilUp = this.pointers.size > 0;
      return true;
    }
    if (tracked && this.suppressUntilUp) {
      if (this.pointers.size === 0) this.suppressUntilUp = false;
      return true;
    }
    return false;
  }

  /** Attaches touch-only listeners. Used by the read-only reference canvas. */
  attach(element: HTMLElement): () => void {
    const down = (event: PointerEvent) => {
      if (this.pointerDown(event)) event.preventDefault();
    };
    const move = (event: PointerEvent) => {
      if (this.pointerMove(event)) event.preventDefault();
    };
    const up = (event: PointerEvent) => {
      this.pointerUp(event);
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
    element.addEventListener("pointercancel", up);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
    };
  }

  private begin(): void {
    const entries = [...this.pointers.entries()].slice(0, 2);
    if (entries.length < 2) return;
    const first = entries[0][1];
    const second = entries[1][1];
    const startDistance = Math.hypot(first.x - second.x, first.y - second.y);
    if (startDistance < 4) return;
    const mid = this.options.toLocal((first.x + second.x) / 2, (first.y + second.y) / 2);
    const startView = this.options.getView();
    this.options.onGestureStart?.();
    this.gesture = {
      ids: [entries[0][0], entries[1][0]],
      anchorPage: screenToPage(startView, mid),
      startDistance,
      startZoom: startView.zoom,
      startView,
    };
    this.suppressUntilUp = true;
  }

  private update(): void {
    const gesture = this.gesture;
    if (!gesture) return;
    const first = this.pointers.get(gesture.ids[0]);
    const second = this.pointers.get(gesture.ids[1]);
    if (!first || !second) return;
    const mid = this.options.toLocal((first.x + second.x) / 2, (first.y + second.y) / 2);
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    const next = viewForGesture(
      gesture.startView,
      gesture.anchorPage,
      mid,
      gesture.startZoom * (distance / gesture.startDistance),
    );
    this.options.setView(next, gesture.startView);
  }
}

import type { Point } from "../../model/types";
import { store } from "../../state/store";
import { TouchNavigation } from "../touchNavigation";
import type { Viewport } from "../viewport";

export interface TouchInputContext {
  viewport(): Viewport;
  localFromClient(clientX: number, clientY: number): Point;
  capturePointer(pointerId: number): void;
  releasePointer(pointerId: number): void;
  cancelGesture(): void;
  cancelDraft(): void;
  openContextMenu(clientX: number, clientY: number): void;
}

/**
 * Pen priority, palm rejection, two-finger navigation and the touch long-press
 * timer. One-finger drawing is left to the caller through the pointer handlers.
 */
export class TouchInput {
  private penActive = false;
  private lastPenAt = 0;
  private touchLongPressTimer: number | null = null;
  private touchLongPressStart: Point | null = null;
  private touchLongPressFired = false;
  private readonly touchNavigation: TouchNavigation;

  constructor(
    private readonly element: HTMLCanvasElement,
    private readonly context: TouchInputContext,
  ) {
    this.touchNavigation = new TouchNavigation({
      getView: () => this.context.viewport(),
      toLocal: (clientX, clientY) => this.context.localFromClient(clientX, clientY),
      setView: (next) => store.setView(next.zoom, next.panX, next.panY),
      onGestureStart: () => {
        this.context.cancelGesture();
        this.context.cancelDraft();
      },
      suppressOneFinger: () => this.penActive || performance.now() - this.lastPenAt < 800,
      capturePointer: (pointerId) => this.context.capturePointer(pointerId),
      releasePointer: (pointerId) => this.context.releasePointer(pointerId),
    });
  }

  get touchBlocked(): boolean {
    return this.touchNavigation.active || this.touchNavigation.suppressed;
  }

  get longPressFired(): boolean {
    return this.touchLongPressFired;
  }

  resetLongPressFired(): void {
    this.touchLongPressFired = false;
  }

  markPenDown(event: PointerEvent): void {
    if (event.pointerType !== "pen") return;
    this.penActive = true;
    this.lastPenAt = performance.now();
  }

  down(event: PointerEvent): boolean {
    if (event.pointerType !== "touch") return false;
    this.cancelLongPress();
    this.resetLongPressFired();
    if (this.touchNavigation.pointerDown(event)) return true;
    this.startLongPress(event);
    return false;
  }

  move(event: PointerEvent): boolean {
    if (event.pointerType !== "touch") return false;
    this.trackLongPress(event);
    if (this.touchNavigation.pointerMove(event)) {
      event.preventDefault();
      return true;
    }
    return this.longPressFired;
  }

  up(event: PointerEvent): boolean {
    if (event.pointerType === "pen") {
      this.penActive = false;
      this.lastPenAt = performance.now();
      return false;
    }
    if (event.pointerType !== "touch") return false;
    this.cancelLongPress();
    if (this.longPressFired) {
      this.resetLongPressFired();
      if (this.element.hasPointerCapture(event.pointerId)) {
        this.context.releasePointer(event.pointerId);
      }
      return true;
    }
    return this.touchNavigation.pointerUp(event);
  }

  cancelLongPress(): void {
    if (this.touchLongPressTimer !== null) {
      window.clearTimeout(this.touchLongPressTimer);
      this.touchLongPressTimer = null;
    }
    this.touchLongPressStart = null;
  }

  private startLongPress(event: PointerEvent): void {
    this.cancelLongPress();
    if (event.pointerType !== "touch" || store.ui.activeTool !== "select") return;
    this.touchLongPressStart = { x: event.clientX, y: event.clientY };
    this.touchLongPressTimer = window.setTimeout(() => {
      this.touchLongPressTimer = null;
      this.touchLongPressFired = true;
      this.context.cancelGesture();
      this.context.openContextMenu(event.clientX, event.clientY);
    }, 550);
  }

  private trackLongPress(event: PointerEvent): void {
    if (!this.touchLongPressStart || event.pointerType !== "touch") return;
    if (
      Math.hypot(
        event.clientX - this.touchLongPressStart.x,
        event.clientY - this.touchLongPressStart.y,
      ) > 8
    ) {
      this.cancelLongPress();
    }
  }
}

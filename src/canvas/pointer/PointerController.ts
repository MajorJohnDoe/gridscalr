import { store } from "../../state/store";
import type { Point } from "../../model/types";
import { cursorForRole } from "../geometry";
import type { PointerHost } from "./PointerHost";

/**
 * Owns pointer input that is independent of a particular gesture: coordinate
 * conversion, pointer capture, cursor selection, wheel navigation, space-pan
 * state and the touch long-press timer. Gesture state moves here in later
 * pointer-controller steps.
 */
export class PointerController {
  private spaceDown = false;
  private touchLongPressTimer: number | null = null;
  private touchLongPressStart: Point | null = null;
  private touchLongPressFired = false;

  constructor(
    private readonly element: HTMLCanvasElement,
    private readonly host: PointerHost,
  ) {}

  get isSpaceDown(): boolean {
    return this.spaceDown;
  }

  setSpaceDown(down: boolean): void {
    this.spaceDown = down;
  }

  get longPressFired(): boolean {
    return this.touchLongPressFired;
  }

  resetLongPressFired(): void {
    this.touchLongPressFired = false;
  }

  localPoint(event: PointerEvent | WheelEvent | MouseEvent): Point {
    return this.localFromClient(event.clientX, event.clientY);
  }

  localFromClient(clientX: number, clientY: number): Point {
    const rect = this.element.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  capturePointer(pointerId: number): void {
    try {
      this.element.setPointerCapture(pointerId);
    } catch {
      // Synthetic events and some platforms do not expose an active pointer.
    }
  }

  releasePointer(pointerId: number): void {
    try {
      this.element.releasePointerCapture(pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
  }

  updateCursor(): void {
    if (this.host.isReadOnly()) return;
    const tool = store.ui.activeTool;
    let cursor = "";
    if (this.host.cropActive()) {
      cursor = this.host.cropCursor() ?? "crosshair";
    } else if (this.host.panState()) {
      cursor = "grabbing";
    } else if (this.host.dragState()) {
      const drag = this.host.dragState()!;
      if (drag.mode === "rotate") cursor = "grabbing";
      else if ((drag.mode === "resize" || drag.mode === "scale-selection") && drag.handle) {
        cursor = cursorForRole(drag.handle);
      } else if (drag.mode === "vertex") cursor = "crosshair";
      else if (drag.mode === "measurement-label-size") cursor = "nwse-resize";
      else cursor = "move";
    } else if (this.host.labelConnectActive()) cursor = "crosshair";
    else if (this.spaceDown || tool === "pan") cursor = "grab";
    else if (this.host.hasMarquee()) cursor = "crosshair";
    else if (this.host.hoverLabelResize()) cursor = "nwse-resize";
    else {
      const hoverHandle = this.host.hoverHandle();
      if (hoverHandle) cursor = hoverHandle.cursor;
      else if (tool === "text") cursor = "text";
      else if (tool !== "select") cursor = "crosshair";
      else if (store.ui.hover) cursor = "move";
    }
    this.host.setHostCursor(cursor);
  }

  onWheel(event: WheelEvent): void {
    if (!store.project) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * 0.0018);
      this.host.zoomAt(this.localPoint(event), factor);
      return;
    }
    const dx = event.shiftKey ? event.deltaY : event.deltaX;
    const dy = event.shiftKey ? 0 : event.deltaY;
    const view = this.host.viewport();
    store.setView(view.zoom, view.panX - dx, view.panY - dy);
  }

  startTouchLongPress(event: PointerEvent): void {
    this.cancelTouchLongPress();
    if (event.pointerType !== "touch" || store.ui.activeTool !== "select") return;
    this.touchLongPressStart = { x: event.clientX, y: event.clientY };
    this.touchLongPressTimer = window.setTimeout(() => {
      this.touchLongPressTimer = null;
      this.touchLongPressFired = true;
      this.host.cancelGesture();
      this.host.openContextMenu(event.clientX, event.clientY);
    }, 550);
  }

  trackTouchLongPress(event: PointerEvent): void {
    if (!this.touchLongPressStart || event.pointerType !== "touch") return;
    if (
      Math.hypot(
        event.clientX - this.touchLongPressStart.x,
        event.clientY - this.touchLongPressStart.y,
      ) > 8
    ) {
      this.cancelTouchLongPress();
    }
  }

  cancelTouchLongPress(): void {
    if (this.touchLongPressTimer !== null) {
      window.clearTimeout(this.touchLongPressTimer);
      this.touchLongPressTimer = null;
    }
    this.touchLongPressStart = null;
  }
}

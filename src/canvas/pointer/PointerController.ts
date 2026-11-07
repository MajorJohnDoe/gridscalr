import { store, type ToolId } from "../../state/store";
import { t } from "../../i18n";
import { toast } from "../../ui/toast";
import { TouchNavigation } from "../touchNavigation";
import type { Point } from "../../model/types";
import { expandRect } from "../../model/geometry";
import { itemIntersectsBounds } from "../../model/hitTest";
import { itemIsVisible, layerVisibleOnPage } from "../../model/layers";
import { cursorForRole } from "../geometry";
import { commitLabelConnection, openContextMenu } from "./contextMenu";
import { handleCreationDown } from "./creation";
import { handleDoubleClick } from "./doubleClick";
import { applyDragState } from "./drag";
import { applyTransformState } from "./transform";
import type { DragState, MarqueeState, PanState } from "./pointerState";
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
  private pan: PanState | null = null;
  private marquee: MarqueeState | null = null;
  private drag: DragState | null = null;
  private labelConnect: { itemId: string; layerId: string } | null = null;
  private penActive = false;
  private lastPenAt = 0;
  private readonly touchNavigation: TouchNavigation;

  constructor(
    private readonly element: HTMLCanvasElement,
    private readonly host: PointerHost,
  ) {
    this.touchNavigation = new TouchNavigation({
      getView: () => this.host.viewport(),
      toLocal: (clientX, clientY) => this.localFromClient(clientX, clientY),
      setView: (next) => store.setView(next.zoom, next.panX, next.panY),
      onGestureStart: () => {
        this.cancelPan();
        this.cancelMarquee();
        this.cancelDrag();
        store.cancelGesture();
        this.host.cancelDraft();
      },
      suppressOneFinger: () => this.penActive || performance.now() - this.lastPenAt < 800,
      capturePointer: (pointerId) => this.capturePointer(pointerId),
      releasePointer: (pointerId) => this.releasePointer(pointerId),
    });
  }

  get labelConnectActive(): boolean {
    return this.labelConnect !== null;
  }

  contextMenu(event: MouseEvent): void {
    event.preventDefault();
    if (this.longPressFired) return;
    this.cancelTouchLongPress();
    openContextMenu(event.clientX, event.clientY, this.contextMenuContext());
  }

  beginLabelConnection(itemId: string, layerId: string): void {
    this.labelConnect = { itemId, layerId };
    toast(t("canvas.connectionHint"), "info");
    this.element.focus({ preventScroll: true });
    this.updateCursor();
  }

  commitLabelConnection(page: Point): void {
    const connect = this.labelConnect;
    this.labelConnect = null;
    commitLabelConnection(page, connect, this.contextMenuContext());
  }

  cancelLabelConnection(): void {
    this.labelConnect = null;
  }

  private contextMenuContext() {
    return {
      cropActive: () => this.host.cropActive(),
      localFromClient: (clientX: number, clientY: number) => this.localFromClient(clientX, clientY),
      toPage: (screen: Point) => this.host.toPage(screen),
      viewPage: () => this.host.viewPage(),
      viewZoom: () => this.host.viewZoom(),
      measurementLabelHit: (screen: Point) => this.host.measurementLabelHit(screen),
      isLocked: (
        item: Parameters<typeof this.host.isLocked>[0],
        layer: Parameters<typeof this.host.isLocked>[1],
      ) => this.host.isLocked(item, layer),
      selectItem: (layerId: string, itemId: string) => this.host.selectItem(layerId, itemId),
      openHostContextMenu: (position: { page: Point; clientX: number; clientY: number }) =>
        this.host.openContextMenu(position.clientX, position.clientY),
      beginLabelConnection: (itemId: string, layerId: string) =>
        this.beginLabelConnection(itemId, layerId),
      promptVolumeDepth: (ref: { layerId: string; itemId: string } | null) =>
        this.host.promptVolumeDepth(ref),
      updateCursor: () => this.updateCursor(),
      drawInteraction: () => this.host.drawInteraction(),
    };
  }

  get touchBlocked(): boolean {
    return this.touchNavigation.active || this.touchNavigation.suppressed;
  }

  markPenDown(event: PointerEvent): void {
    if (event.pointerType !== "pen") return;
    this.penActive = true;
    this.lastPenAt = performance.now();
  }

  touchDown(event: PointerEvent): boolean {
    if (event.pointerType !== "touch") return false;
    this.cancelTouchLongPress();
    this.resetLongPressFired();
    if (this.touchNavigation.pointerDown(event)) return true;
    this.startTouchLongPress(event);
    return false;
  }

  touchMove(event: PointerEvent): boolean {
    if (event.pointerType !== "touch") return false;
    this.trackTouchLongPress(event);
    if (this.touchNavigation.pointerMove(event)) {
      event.preventDefault();
      return true;
    }
    return this.longPressFired;
  }

  touchUp(event: PointerEvent): boolean {
    if (event.pointerType === "pen") {
      this.penActive = false;
      this.lastPenAt = performance.now();
      return false;
    }
    if (event.pointerType !== "touch") return false;
    this.cancelTouchLongPress();
    if (this.longPressFired) {
      this.resetLongPressFired();
      if (this.element.hasPointerCapture(event.pointerId)) {
        this.releasePointer(event.pointerId);
      }
      return true;
    }
    return this.touchNavigation.pointerUp(event);
  }

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
    } else if (this.pan) {
      cursor = "grabbing";
    } else if (this.drag) {
      const drag = this.drag;
      if (drag.mode === "rotate") cursor = "grabbing";
      else if ((drag.mode === "resize" || drag.mode === "scale-selection") && drag.handle) {
        cursor = cursorForRole(drag.handle);
      } else if (drag.mode === "vertex") cursor = "crosshair";
      else if (drag.mode === "measurement-label-size") cursor = "nwse-resize";
      else cursor = "move";
    } else if (this.labelConnect) cursor = "crosshair";
    else if (this.spaceDown || tool === "pan") cursor = "grab";
    else if (this.marquee) cursor = "crosshair";
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

  doubleClick(event: MouseEvent): void {
    handleDoubleClick(this.localPoint(event), {
      touchNavigationBlocked: () => this.host.touchNavigationBlocked(),
      cropActive: () => this.host.cropActive(),
      activeTool: () => this.host.activeTool(),
      viewPage: () => this.host.viewPage(),
      viewZoom: () => this.host.viewZoom(),
      toPage: (screen) => this.host.toPage(screen),
      finishDraft: () => this.host.finishDraft(),
      calibrationLabelHit: (screen) => this.host.calibrationLabelHit(screen),
      editCalibration: () => this.host.editCalibration(),
      measurementLabelHit: (screen) => this.host.measurementLabelHit(screen),
      isLocked: (item, layer) => this.host.isLocked(item, layer),
      selectItem: (layerId, itemId) => this.host.selectItem(layerId, itemId),
      promptVolumeDepth: (ref) => this.host.promptVolumeDepth(ref),
      startLabelEdit: (hit) => this.host.startLabelEdit(hit),
      editSheetFieldAt: (page, screen) => this.host.editSheetFieldAt(page, screen),
      startTextEdit: (item, layer) => this.host.startTextEdit(item, layer),
      startTextBoxEdit: (item, layer) => this.host.startTextBoxEdit(item, layer),
      editRail: (item) => this.host.editRail(item),
      startCloudTextEdit: (item, layer) => this.host.startCloudTextEdit(item, layer),
      startCalloutTextEdit: (item, layer) => this.host.startCalloutTextEdit(item, layer),
      editItemText: (item) => this.host.editItemText(item),
    });
  }

  creationDown(page: Point, event: PointerEvent, tool: ToolId): void {
    handleCreationDown(page, event, tool, {
      getDraft: () => this.host.draft(),
      setDraft: (draft) => this.host.setDraft(draft),
      snapPoint: (point, excludeItemId) => this.host.snapPoint(point, excludeItemId),
      snapPolylinePoint: (point) => this.host.snapPolylinePoint(point),
      constrainPolyline: (last, point, free) => this.host.constrainPolyline(last, point, free),
      clearSnap: () => this.host.clearSnap(),
      viewZoom: () => this.host.viewZoom(),
      drawInteraction: () => this.host.drawInteraction(),
      capturePointer: (pointerId) => this.capturePointer(pointerId),
      finishDraft: () => this.host.finishDraft(),
      finishCallout: (point) => this.host.finishCallout(point),
      createItem: (kind, points, options) => this.host.createItem(kind, points, options),
      runCalibration: (p1, p2) => this.host.runCalibration(p1, p2),
      startTextTool: (point) => this.host.startTextTool(point),
    });
  }

  get dragActive(): boolean {
    return this.drag !== null;
  }

  get dragState(): DragState | null {
    return this.drag;
  }

  beginDrag(drag: DragState, pointerId: number): void {
    this.drag = drag;
    this.capturePointer(pointerId);
    this.updateCursor();
    this.host.drawInteraction();
  }

  applyDrag(page: Point, shiftKey: boolean): void {
    if (!this.drag) return;
    const result = applyDragState(this.drag, page, shiftKey, {
      snapPoint: (point, excludeItemId) => this.host.snapPoint(point, excludeItemId),
      clearSnap: () => this.host.clearSnap(),
    });
    if (result === "noop") return;
    if (result === "end") {
      this.endDrag();
      return;
    }
    if (result === "transform") {
      const transformResult = applyTransformState(this.drag, page, shiftKey);
      if (transformResult === "noop") return;
      if (transformResult === "end") {
        this.endDrag();
        return;
      }
    }
    this.host.drawContent();
    this.host.drawInteraction();
    this.updateCursor();
  }

  endDrag(): void {
    if (!this.drag) return;
    const moved = this.drag.moved;
    this.drag = null;
    this.host.clearHover();
    if (moved) store.endGesture("change");
    else store.cancelGesture();
    this.updateCursor();
    this.host.drawContent();
    this.host.drawInteraction();
  }

  cancelDrag(): void {
    this.drag = null;
  }

  get panActive(): boolean {
    return this.pan !== null;
  }

  get marqueeActive(): boolean {
    return this.marquee !== null;
  }

  get marqueeState(): MarqueeState | null {
    return this.marquee;
  }

  beginPan(clientX: number, clientY: number, pointerId: number): void {
    const view = this.host.viewport();
    this.pan = {
      startX: clientX,
      startY: clientY,
      panX: view.panX,
      panY: view.panY,
    };
    this.capturePointer(pointerId);
    this.updateCursor();
  }

  updatePan(event: PointerEvent): boolean {
    if (!this.pan) return false;
    const dx = event.clientX - this.pan.startX;
    const dy = event.clientY - this.pan.startY;
    const view = this.host.viewport();
    store.setView(view.zoom, this.pan.panX + dx, this.pan.panY + dy);
    return true;
  }

  endPan(): boolean {
    if (!this.pan) return false;
    this.pan = null;
    this.updateCursor();
    return true;
  }

  cancelPan(): void {
    this.pan = null;
  }

  beginMarquee(page: Point, additive: boolean, pointerId: number): void {
    this.marquee = { start: page, current: page, additive };
    this.capturePointer(pointerId);
    this.updateCursor();
    this.host.drawInteraction();
  }

  updateMarquee(page: Point): boolean {
    if (!this.marquee) return false;
    this.marquee.current = page;
    this.host.drawInteraction();
    return true;
  }

  finishMarquee(): void {
    const marquee = this.marquee;
    this.marquee = null;
    const view = this.host.viewport();
    if (!marquee || !store.project) {
      this.host.drawInteraction();
      return;
    }
    const rect = expandRect(marquee.start, marquee.current);
    if (rect.width < 2 / view.zoom && rect.height < 2 / view.zoom) {
      this.updateCursor();
      this.host.drawInteraction();
      return;
    }
    const refs = marquee.additive ? [...store.ui.selection] : [];
    const min = { x: rect.x, y: rect.y };
    const max = { x: rect.x + rect.width, y: rect.y + rect.height };
    for (const layer of store.project.layers) {
      if (!layerVisibleOnPage(layer, view.page)) continue;
      for (const item of layer.items) {
        if (item.page !== view.page || !itemIsVisible(item, layer)) continue;
        if (itemIntersectsBounds(item, min, max)) {
          refs.push({ layerId: layer.id, itemId: item.id });
        }
      }
    }
    store.setSelectionMany(refs);
    this.updateCursor();
    this.host.drawInteraction();
  }

  cancelMarquee(): void {
    this.marquee = null;
  }

  cancelPanAndMarquee(): void {
    this.pan = null;
    this.marquee = null;
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

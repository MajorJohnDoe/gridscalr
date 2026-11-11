import { store, type ToolId } from "../../state/store";
import { t } from "../../i18n";
import { toast } from "../../ui/toast";
import { NavigationGesture } from "./navigation";
import { TouchInput } from "./touchInput";
import type { Point } from "../../model/types";
import type { Handle } from "../selectionHandles";
import { cursorForState } from "./cursor";
import { attachPointerListeners, detachPointerListeners } from "./listeners";
import { capturePointer, localFromClient, localPoint, releasePointer } from "./primitives";
import {
  contextMenuContext,
  creationContext,
  doubleClickContext,
  hoverContext,
  selectionContext,
} from "./contexts";
import { commitLabelConnection, openContextMenu } from "./contextMenu";
import {
  finishDraftOnPointerUp,
  handleCreationDown,
  toolUsesSnapping,
  updateDraftFromPointer,
} from "./creation";
import { handleDoubleClick } from "./doubleClick";
import { applyDragState } from "./drag";
import { applyTransformState } from "./transform";
import { beginSelection, updateHover } from "./targets";
import type { DragState, MarqueeState } from "./pointerState";
import type { PointerHost } from "./PointerHost";
/**
 * Owns pointer input that is independent of a particular gesture: coordinate
 * conversion, pointer capture, cursor selection, wheel navigation, space-pan
 * state and the touch long-press timer. Gesture state moves here in later
 * pointer-controller steps.
 */
export class PointerController {
  private spaceDown = false;
  private drag: DragState | null = null;
  pointerScreen: Point | null = null;
  hoverHandle: Handle | null = null;
  hoverLabelResize = false;
  private labelConnect: { itemId: string; layerId: string } | null = null;
  private readonly navigation: NavigationGesture;
  private readonly touchInput: TouchInput;

  constructor(
    private readonly element: HTMLCanvasElement,
    private readonly host: PointerHost,
  ) {
    this.navigation = new NavigationGesture({
      viewport: () => this.host.viewport(),
      viewPageId: () => this.host.viewPageId(),
      capturePointer: (pointerId) => capturePointer(this.element, pointerId),
      updateCursor: () => this.updateCursor(),
      drawInteraction: () => this.host.drawInteraction(),
    });
    this.touchInput = new TouchInput(element, {
      viewport: () => this.host.viewport(),
      localFromClient: (clientX, clientY) => localFromClient(this.element, clientX, clientY),
      capturePointer: (pointerId) => capturePointer(this.element, pointerId),
      releasePointer: (pointerId) => releasePointer(this.element, pointerId),
      cancelGesture: () => this.cancelGesture(),
      cancelDraft: () => this.host.cancelDraft(),
      openContextMenu: (clientX, clientY) =>
        openContextMenu(
          clientX,
          clientY,
          contextMenuContext(
            this.host,
            (x, y) => localFromClient(this.element, x, y),
            () => this.updateCursor(),
            (itemId, layerId) => this.beginLabelConnection(itemId, layerId),
          ),
        ),
    });
  }

  cancelGesture(): void {
    this.cancelDrag();
    this.cancelPanAndMarquee();
    store.cancelGesture();
  }

  get labelConnectActive(): boolean {
    return this.labelConnect !== null;
  }

  contextMenu(event: MouseEvent): void {
    event.preventDefault();
    if (this.touchInput.longPressFired) return;
    this.touchInput.cancelLongPress();
    openContextMenu(
      event.clientX,
      event.clientY,
      contextMenuContext(
        this.host,
        (clientX, clientY) => localFromClient(this.element, clientX, clientY),
        () => this.updateCursor(),
        (itemId, layerId) => this.beginLabelConnection(itemId, layerId),
      ),
    );
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
    commitLabelConnection(
      page,
      connect,
      contextMenuContext(
        this.host,
        (clientX, clientY) => localFromClient(this.element, clientX, clientY),
        () => this.updateCursor(),
        (itemId, layerId) => this.beginLabelConnection(itemId, layerId),
      ),
    );
  }

  cancelLabelConnection(): void {
    this.labelConnect = null;
  }

  get touchBlocked(): boolean {
    return this.touchInput.touchBlocked;
  }

  markPenDown(event: PointerEvent): void {
    this.touchInput.markPenDown(event);
  }

  touchDown(event: PointerEvent): boolean {
    return this.touchInput.down(event);
  }

  touchMove(event: PointerEvent): boolean {
    return this.touchInput.move(event);
  }

  touchUp(event: PointerEvent): boolean {
    return this.touchInput.up(event);
  }

  get isSpaceDown(): boolean {
    return this.spaceDown;
  }

  setSpaceDown(down: boolean): void {
    this.spaceDown = down;
  }

  get longPressFired(): boolean {
    return this.touchInput.longPressFired;
  }

  resetLongPressFired(): void {
    this.touchInput.resetLongPressFired();
  }

  cancelTouchLongPress(): void {
    this.touchInput.cancelLongPress();
  }

  localPoint(event: PointerEvent | WheelEvent | MouseEvent): Point {
    return localFromClient(this.element, event.clientX, event.clientY);
  }

  updateCursor(): void {
    this.host.setHostCursor(
      cursorForState({
        readOnly: this.host.isReadOnly(),
        viewOnly: this.host.isViewOnly(),
        cropActive: this.host.cropActive(),
        cropCursor: this.host.cropCursor(),
        panActive: this.navigation.panActive,
        drag: this.drag,
        labelConnect: this.labelConnect !== null,
        spaceDown: this.spaceDown,
        activeTool: store.ui.activeTool,
        marquee: this.navigation.marqueeActive,
        hoverLabelResize: this.hoverLabelResize,
        hoverHandle: this.hoverHandle,
        hover: Boolean(store.ui.hover),
      }),
    );
  }

  doubleClick(event: MouseEvent): void {
    handleDoubleClick(localPoint(this.element, event), doubleClickContext(this.host));
  }

  creationDown(page: Point, event: PointerEvent, tool: ToolId): void {
    handleCreationDown(
      page,
      event,
      tool,
      creationContext(this.host, (pointerId) => capturePointer(this.element, pointerId)),
    );
  }

  attach(): void {
    if (this.host.isReadOnly()) return;
    attachPointerListeners(this.element, {
      down: this.onPointerDown,
      move: this.onPointerMove,
      up: this.onPointerUp,
      leave: this.onPointerLeave,
      doubleClick: this.onDoubleClick,
      wheel: this.onWheelEvent,
      contextMenu: this.onContextMenu,
    });
  }

  detach(): void {
    detachPointerListeners(this.element, {
      down: this.onPointerDown,
      move: this.onPointerMove,
      up: this.onPointerUp,
      leave: this.onPointerLeave,
      doubleClick: this.onDoubleClick,
      wheel: this.onWheelEvent,
      contextMenu: this.onContextMenu,
    });
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!store.project) return;
    this.host.commitEditors();
    this.host.focusCanvas();
    const screen = localPoint(this.element, event);

    this.markPenDown(event);
    if (this.touchDown(event)) return;

    if (this.host.cropActive()) {
      if (event.button !== 0) return;
      event.preventDefault();
      this.host.cropPointerDown(this.host.toPage(screen), event);
      return;
    }

    if (this.labelConnect) {
      event.preventDefault();
      this.commitLabelConnection(this.host.toPage(screen));
      return;
    }

    if (event.button === 1 || this.spaceDown || store.ui.activeTool === "pan") {
      event.preventDefault();
      this.beginPan(event.clientX, event.clientY, event.pointerId);
      return;
    }
    if (event.button !== 0) return;

    const page = this.host.toPage(screen);
    const tool = store.ui.activeTool;
    if (tool === "select") {
      this.beginSelection(page, screen, event);
      return;
    }
    if (!this.host.isViewOnly()) this.creationDown(page, event, tool);
  };
  private beginSelection(page: Point, screen: Point, event: PointerEvent): void {
    beginSelection(
      page,
      screen,
      event,
      selectionContext(
        this.host,
        (drag, pointerId) => this.beginDrag(drag, pointerId),
        (marqueePage, additive, pointerId) => this.beginMarquee(marqueePage, additive, pointerId),
        (item, point) => this.host.labelResizeAt(item, point),
        (point) => this.host.measurementLabelHit(point),
      ),
    );
  }
  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!store.project) return;
    const screen = localPoint(this.element, event);
    if (this.touchMove(event)) return;

    this.pointerScreen = screen;
    const page = this.host.toPage(screen);
    store.setCursor(page);

    if (this.host.cropActive()) {
      this.host.cropPointerMove(page);
      return;
    }
    if (this.updatePan(event)) return;
    if (this.dragActive) {
      this.applyDrag(page, event.shiftKey);
      return;
    }
    if (this.updateMarquee(page)) return;

    if (
      updateDraftFromPointer(
        page,
        event,
        creationContext(this.host, (pointerId) => capturePointer(this.element, pointerId)),
      )
    )
      return;

    const tool = store.ui.activeTool;
    if (tool === "select") {
      const hover = updateHover(page, screen, hoverContext(this.host));
      this.hoverHandle = hover.handle;
      this.hoverLabelResize = hover.labelResize;
      store.setHover(hover.hover);
      this.updateCursor();
      this.host.drawInteraction();
    } else {
      this.hoverHandle = null;
      this.hoverLabelResize = false;
      if (toolUsesSnapping(tool)) this.host.snapPoint(page);
      else this.host.clearSnap();
      this.updateCursor();
      this.host.drawInteraction();
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.touchUp(event)) return;
    if (this.element.hasPointerCapture(event.pointerId)) {
      releasePointer(this.element, event.pointerId);
    }
    if (this.host.cropActive()) {
      this.host.cropPointerUp();
      return;
    }
    if (this.endPan()) return;
    if (this.marqueeActive) {
      this.finishMarquee();
      return;
    }
    if (this.dragActive) {
      this.host.clearSnap();
      this.endDrag();
      return;
    }
    finishDraftOnPointerUp({
      getDraft: () => this.host.draft(),
      finishPen: () => this.host.finishPen(),
      finishQuickArea: () => this.host.finishQuickArea(),
      finishShape: () => this.host.finishShape(),
    });
  };

  private readonly onPointerLeave = (): void => {
    this.cancelTouchLongPress();
    if (this.host.cropActive()) {
      this.host.cropPointerLeave();
      return;
    }
    if (this.dragActive || this.panActive) return;
    this.pointerScreen = null;
    this.hoverHandle = null;
    this.hoverLabelResize = false;
    store.setCursor(null);
    store.setHover(null);
    this.host.clearSnap();
    this.updateCursor();
    this.host.drawInteraction();
  };

  private readonly onDoubleClick = (event: MouseEvent): void => {
    this.doubleClick(event);
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    this.contextMenu(event);
  };

  private readonly onWheelEvent = (event: WheelEvent): void => {
    this.onWheel(event);
  };

  clearHover(): void {
    this.hoverHandle = null;
    this.hoverLabelResize = false;
  }

  get dragActive(): boolean {
    return this.drag !== null;
  }

  get dragState(): DragState | null {
    return this.drag;
  }

  beginDrag(drag: DragState, pointerId: number): void {
    this.drag = drag;
    capturePointer(this.element, pointerId);
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
    return this.navigation.panActive;
  }

  get marqueeActive(): boolean {
    return this.navigation.marqueeActive;
  }

  get marqueeState(): MarqueeState | null {
    return this.navigation.marqueeState;
  }

  beginPan(clientX: number, clientY: number, pointerId: number): void {
    this.navigation.beginPan(clientX, clientY, pointerId);
  }

  updatePan(event: PointerEvent): boolean {
    return this.navigation.updatePan(event);
  }

  endPan(): boolean {
    return this.navigation.endPan();
  }

  cancelPan(): void {
    this.navigation.cancelPan();
  }

  beginMarquee(page: Point, additive: boolean, pointerId: number): void {
    this.navigation.beginMarquee(page, additive, pointerId);
  }

  updateMarquee(page: Point): boolean {
    return this.navigation.updateMarquee(page);
  }

  finishMarquee(): void {
    this.navigation.finishMarquee();
  }

  cancelMarquee(): void {
    this.navigation.cancelMarquee();
  }

  cancelPanAndMarquee(): void {
    this.navigation.cancelAll();
  }

  onWheel(event: WheelEvent): void {
    this.navigation.onWheel(event, localPoint(this.element, event), (point, factor) =>
      this.host.zoomAt(point, factor),
    );
  }
}

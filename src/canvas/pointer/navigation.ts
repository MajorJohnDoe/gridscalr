import { expandRect } from "../../model/geometry";
import { itemIntersectsBounds } from "../../model/hitTest";
import { itemIsVisible, layerVisibleOnPage } from "../../model/layers";
import type { Point } from "../../model/types";
import { store } from "../../state/store";
import type { Viewport } from "../viewport";
import type { MarqueeState, PanState } from "./pointerState";

export interface NavigationContext {
  viewport(): Viewport;
  capturePointer(pointerId: number): void;
  updateCursor(): void;
  drawInteraction(): void;
}

/** Pan and marquee state, including marquee hit testing. */
export class NavigationGesture {
  private pan: PanState | null = null;
  private marquee: MarqueeState | null = null;

  constructor(private readonly context: NavigationContext) {}

  get panActive(): boolean {
    return this.pan !== null;
  }

  get marqueeActive(): boolean {
    return this.marquee !== null;
  }

  get marqueeState(): MarqueeState | null {
    return this.marquee;
  }

  onWheel(
    event: WheelEvent,
    localPoint: Point,
    zoomAt: (point: Point, factor: number) => void,
  ): void {
    if (!store.project) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      zoomAt(localPoint, Math.exp(-event.deltaY * 0.0018));
      return;
    }
    const dx = event.shiftKey ? event.deltaY : event.deltaX;
    const dy = event.shiftKey ? 0 : event.deltaY;
    const view = this.context.viewport();
    store.setView(view.zoom, view.panX - dx, view.panY - dy);
  }

  beginPan(clientX: number, clientY: number, pointerId: number): void {
    const view = this.context.viewport();
    this.pan = {
      startX: clientX,
      startY: clientY,
      panX: view.panX,
      panY: view.panY,
    };
    this.context.capturePointer(pointerId);
    this.context.updateCursor();
  }

  updatePan(event: PointerEvent): boolean {
    if (!this.pan) return false;
    const dx = event.clientX - this.pan.startX;
    const dy = event.clientY - this.pan.startY;
    const view = this.context.viewport();
    store.setView(view.zoom, this.pan.panX + dx, this.pan.panY + dy);
    return true;
  }

  endPan(): boolean {
    if (!this.pan) return false;
    this.pan = null;
    this.context.updateCursor();
    return true;
  }

  cancelPan(): void {
    this.pan = null;
  }

  beginMarquee(page: Point, additive: boolean, pointerId: number): void {
    this.marquee = { start: page, current: page, additive };
    this.context.capturePointer(pointerId);
    this.context.updateCursor();
    this.context.drawInteraction();
  }

  updateMarquee(page: Point): boolean {
    if (!this.marquee) return false;
    this.marquee.current = page;
    this.context.drawInteraction();
    return true;
  }

  finishMarquee(): void {
    const marquee = this.marquee;
    this.marquee = null;
    const view = this.context.viewport();
    if (!marquee || !store.project) {
      this.context.drawInteraction();
      return;
    }
    const rect = expandRect(marquee.start, marquee.current);
    if (rect.width < 2 / view.zoom && rect.height < 2 / view.zoom) {
      this.context.updateCursor();
      this.context.drawInteraction();
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
    this.context.updateCursor();
    this.context.drawInteraction();
  }

  cancelMarquee(): void {
    this.marquee = null;
  }

  cancelAll(): void {
    this.pan = null;
    this.marquee = null;
  }
}

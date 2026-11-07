import type { Point } from "../../model/types";
import type { Handle } from "../selectionHandles";
import type { Viewport } from "../viewport";

/**
 * The scene facts and commands the pointer controller needs. `CanvasView`
 * implements this interface; the controller never receives the CanvasView
 * instance itself.
 */
export interface PointerHost {
  isReadOnly(): boolean;
  viewport(): Viewport;

  cropActive(): boolean;
  cropCursor(): string | null;

  labelConnectActive(): boolean;

  hoverHandle(): Handle | null;
  hoverLabelResize(): boolean;

  setHostCursor(cursor: string): void;
  drawContent(): void;
  drawInteraction(): void;
  clearHover(): void;
  snapPoint(point: Point, excludeItemId?: string): Point;
  clearSnap(): void;
  zoomAt(screen: Point, factor: number): void;
  cancelGesture(): void;
  openContextMenu(clientX: number, clientY: number): void;
}

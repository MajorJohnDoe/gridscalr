import type { Point } from "../../model/types";
import type { Handle } from "../selectionHandles";
import type { Viewport } from "../viewport";
import type { DragState, PanState } from "./pointerState";

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

  panState(): PanState | null;
  dragState(): DragState | null;
  hasMarquee(): boolean;
  labelConnectActive(): boolean;

  hoverHandle(): Handle | null;
  hoverLabelResize(): boolean;

  setHostCursor(cursor: string): void;
  zoomAt(screen: Point, factor: number): void;
  cancelGesture(): void;
  openContextMenu(clientX: number, clientY: number): void;
}

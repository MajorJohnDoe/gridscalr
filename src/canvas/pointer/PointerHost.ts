import type { AreaShape, InspectionStatus, ItemKind, Point } from "../../model/types";
import type { Draft } from "../draftRenderer";
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
  draft(): Draft | null;
  setDraft(draft: Draft | null): void;
  cropCursor(): string | null;

  labelConnectActive(): boolean;

  hoverHandle(): Handle | null;
  hoverLabelResize(): boolean;

  setHostCursor(cursor: string): void;
  drawContent(): void;
  drawInteraction(): void;
  clearHover(): void;
  snapPoint(point: Point, excludeItemId?: string): Point;
  snapPolylinePoint(point: Point): Point;
  constrainPolyline(last: Point, point: Point, free: boolean): Point;
  clearSnap(): void;
  viewZoom(): number;
  finishDraft(): void;
  finishCallout(page: Point): void;
  createItem(
    kind: ItemKind,
    points: Point[],
    options?: {
      text?: string;
      areaShape?: AreaShape;
      highlightShape?: "stroke" | "rectangle" | "polygon";
      symbolId?: string;
      status?: InspectionStatus;
    },
  ): { layerId: string; itemId: string } | null;
  runCalibration(p1: Point, p2: Point): Promise<void>;
  startTextTool(page: Point): void;
  zoomAt(screen: Point, factor: number): void;
  cancelGesture(): void;
  openContextMenu(clientX: number, clientY: number): void;
}

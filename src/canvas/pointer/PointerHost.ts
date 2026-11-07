import type {
  AreaShape,
  InspectionStatus,
  ItemKind,
  Layer,
  MarkupItem,
  Point,
} from "../../model/types";
import type { LabelHit } from "../editors";
import type { ToolId } from "../../state/store";
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
  cancelDraft(): void;
  touchNavigationBlocked(): boolean;
  activeTool(): ToolId;
  viewPage(): number;
  toPage(screen: Point): Point;
  calibrationLabelHit(screen: Point): boolean;
  editCalibration(): Promise<void> | void;
  measurementLabelHit(screen: Point): LabelHit | null;
  isLocked(item: MarkupItem, layer: Layer): boolean;
  selectItem(layerId: string, itemId: string): void;
  promptVolumeDepth(ref: { layerId: string; itemId: string } | null): void;
  startLabelEdit(hit: LabelHit): void;
  editSheetFieldAt(page: number, screen: Point): void;
  startTextEdit(item: MarkupItem, layer: Layer): void;
  startTextBoxEdit(item: MarkupItem, layer: Layer): void;
  editRail(item: MarkupItem): void;
  startCloudTextEdit(item: MarkupItem, layer: Layer): void;
  startCalloutTextEdit(item: MarkupItem, layer: Layer): void;
  editItemText(item: MarkupItem): Promise<void> | void;
  zoomAt(screen: Point, factor: number): void;
  cancelGesture(): void;
  openContextMenu(clientX: number, clientY: number): void;
}

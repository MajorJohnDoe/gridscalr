import { areaShapeOf } from "../../model/area";
import { nearestPointOnSegment, pointToItemLocal } from "../../model/geometry";
import { findSegment, hitTest } from "../../model/hitTest";
import { findItem } from "../../model/layers";
import type { Layer, MarkupItem, PageId, Point } from "../../model/types";
import { store, type ToolId } from "../../state/store";
import type { LabelHit } from "../editors";

export interface DoubleClickContext {
  touchNavigationBlocked(): boolean;
  cropActive(): boolean;
  activeTool(): ToolId;
  viewPage(): number;
  viewPageId(): PageId | null;
  viewZoom(): number;
  toPage(screen: Point): Point;
  finishDraft(): void;
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
}

/** Double-click target resolution and edit dispatch for the select and text tools. */
export function handleDoubleClick(screen: Point, context: DoubleClickContext): void {
  if (context.touchNavigationBlocked()) return;
  if (!store.project || context.cropActive()) return;
  const tool = context.activeTool();
  if (tool === "length" || tool === "area" || tool === "volume" || tool === "polyline") {
    context.finishDraft();
    return;
  }
  if (tool !== "select" && tool !== "text") return;
  const page = context.toPage(screen);

  if (tool === "select" && context.calibrationLabelHit(screen)) {
    void context.editCalibration();
    return;
  }

  const labelHit = context.measurementLabelHit(screen);
  if (labelHit && !context.isLocked(labelHit.item, labelHit.layer)) {
    context.selectItem(labelHit.layer.id, labelHit.item.id);
    if (labelHit.item.kind === "volume") {
      context.promptVolumeDepth({ layerId: labelHit.layer.id, itemId: labelHit.item.id });
      return;
    }
    context.startLabelEdit(labelHit);
    return;
  }

  const project = store.project;
  const hit = hitTest(project, context.viewPageId() ?? "", page, 7 / context.viewZoom());
  if (!hit) {
    if (tool === "select") context.editSheetFieldAt(context.viewPage(), screen);
    return;
  }
  if (context.isLocked(hit.item, hit.layer)) return;
  context.selectItem(hit.layer.id, hit.item.id);

  if (hit.item.kind === "volume") {
    context.promptVolumeDepth({ layerId: hit.layer.id, itemId: hit.item.id });
    return;
  }
  if (hit.item.kind === "text") {
    context.startTextEdit(hit.item, hit.layer);
    return;
  }
  if (hit.item.kind === "textbox") {
    context.startTextBoxEdit(hit.item, hit.layer);
    return;
  }
  if (hit.item.kind === "rail") {
    context.editRail(hit.item);
    return;
  }
  if (hit.item.kind === "cloud") {
    context.startCloudTextEdit(hit.item, hit.layer);
    return;
  }
  if (hit.item.kind === "callout") {
    context.startCalloutTextEdit(hit.item, hit.layer);
    return;
  }
  if (hit.item.kind === "stamp" || hit.item.kind === "delta") {
    void context.editItemText(hit.item);
    return;
  }

  const segment = findSegment(
    hit.item,
    page,
    7 / context.viewZoom(),
    hit.item.kind === "area" ||
      hit.item.kind === "rect" ||
      hit.item.kind === "ellipse" ||
      (hit.item.kind === "highlight" && hit.item.highlightShape === "polygon"),
  );
  if (
    segment &&
    ["length", "area", "pen"].includes(hit.item.kind) &&
    (hit.item.kind !== "area" || areaShapeOf(hit.item) === "polygon")
  ) {
    const insert = nearestPointOnSegment(
      pointToItemLocal(hit.item, page),
      hit.item.points[segment.index],
      hit.item.points[(segment.index + 1) % hit.item.points.length],
    );
    store.mutate((project) => {
      const item = findItem(project, hit.item.id)?.item;
      if (item) {
        item.points.splice(segment.index + 1, 0, insert);
        item.updatedAt = new Date().toISOString();
      }
    }, "change");
  }
}

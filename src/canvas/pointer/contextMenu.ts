import { areaOutline, areaShapeOf } from "../../model/area";
import { arcPolyline, circlePolyline, radiusCircle } from "../../model/geometry";
import { hitTest } from "../../model/hitTest";
import {
  closestPointOnPolyline,
  LABEL_FIT_POSITIONS,
  labelFitLabel,
} from "../../model/labelLayout";
import { findItem } from "../../model/layers";
import type { LabelFitPosition, MarkupItem, Point } from "../../model/types";
import { store } from "../../state/store";
import { showPopoverAt } from "../../ui/popover";
import { t } from "../../i18n";
import { toast } from "../../ui/toast";
import type { LabelHit } from "../editors";

export interface ContextMenuContext {
  cropActive(): boolean;
  localFromClient(clientX: number, clientY: number): Point;
  toPage(screen: Point): Point;
  viewPage(): number;
  viewZoom(): number;
  measurementLabelHit(screen: Point): LabelHit | null;
  isLocked(item: MarkupItem, layer: { id: string }): boolean;
  selectItem(layerId: string, itemId: string): void;
  openHostContextMenu(position: { page: Point; clientX: number; clientY: number }): void;
  beginLabelConnection(itemId: string, layerId: string): void;
  promptVolumeDepth(ref: { layerId: string; itemId: string } | null): void;
  updateCursor(): void;
  drawInteraction(): void;
}

export function openContextMenu(
  clientX: number,
  clientY: number,
  context: ContextMenuContext,
): void {
  if (context.cropActive()) return;
  const project = store.project;
  if (!project) return;
  const screen = context.localFromClient(clientX, clientY);
  const labelHit = context.measurementLabelHit(screen);
  if (labelHit && !context.isLocked(labelHit.item, labelHit.layer)) {
    context.selectItem(labelHit.layer.id, labelHit.item.id);
    showMeasurementLabelMenu(clientX, clientY, labelHit.item, labelHit.layer.id, context);
    return;
  }
  const page = context.toPage(screen);
  const hit = hitTest(project, context.viewPage(), page, 7 / context.viewZoom(), {
    includeLocked: true,
  });
  if (hit) {
    const ref = { layerId: hit.layer.id, itemId: hit.item.id };
    if (!store.isSelected(ref)) context.selectItem(hit.layer.id, hit.item.id);
  }
  context.openHostContextMenu({ page, clientX, clientY });
}

function showMeasurementLabelMenu(
  x: number,
  y: number,
  item: MarkupItem,
  layerId: string,
  context: ContextMenuContext,
): void {
  const custom = Boolean(item.labelOffset || item.labelAnchor || item.labelFit);
  showPopoverAt(x, y, [
    {
      label: t("canvas.resetLabelPosition"),
      icon: "undo",
      disabled: !custom,
      action: () => {
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (!target) return;
          delete target.labelOffset;
          delete target.labelAnchor;
          delete target.labelFit;
          target.updatedAt = new Date().toISOString();
        }, "change");
      },
    },
    {
      label: t("canvas.resetLabelSize"),
      icon: "undo",
      disabled: item.labelSize === undefined,
      action: () => {
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (!target) return;
          delete target.labelSize;
          target.updatedAt = new Date().toISOString();
        }, "change");
      },
    },
    ...(item.kind === "volume"
      ? [
          { separator: true as const },
          {
            label: t("canvas.setVolumeDepth"),
            icon: "volume",
            action: () => context.promptVolumeDepth({ layerId, itemId: item.id }),
          },
        ]
      : []),
    { separator: true },
    {
      label: item.labelFit
        ? t("canvas.lockInsidePosition", { position: labelFitLabel(item.labelFit) })
        : t("canvas.lockInsideArea"),
      icon: "target",
      disabled: item.kind !== "area" && item.kind !== "volume",
      children: [
        ...LABEL_FIT_POSITIONS.map((position) => ({
          label: `${item.labelFit === position ? "✓ " : ""}${labelFitLabel(position)}`,
          action: () => setMeasurementLabelFit(item.id, position),
        })),
        { separator: true },
        {
          label: t("canvas.release"),
          disabled: item.labelFit === undefined,
          action: () => releaseMeasurementLabelFit(item.id),
        },
      ],
    },
    { separator: true },
    {
      label: t("canvas.chooseConnection"),
      icon: "target",
      disabled: item.kind === "count" || Boolean(item.labelFit),
      action: () => context.beginLabelConnection(item.id, layerId),
    },
  ]);
}

function setMeasurementLabelFit(itemId: string, placement: LabelFitPosition): void {
  store.mutate((project) => {
    const target = findItem(project, itemId)?.item;
    if (!target || (target.kind !== "area" && target.kind !== "volume")) return;
    target.labelFit = placement;
    delete target.labelOffset;
    delete target.labelAnchor;
    target.updatedAt = new Date().toISOString();
  }, "change");
}

function releaseMeasurementLabelFit(itemId: string): void {
  store.mutate((project) => {
    const target = findItem(project, itemId)?.item;
    if (!target) return;
    delete target.labelFit;
    target.updatedAt = new Date().toISOString();
  }, "change");
}

export function commitLabelConnection(
  page: Point,
  connect: { itemId: string; layerId: string } | null,
  context: ContextMenuContext,
): void {
  const project = store.project;
  if (!connect || !project) {
    context.updateCursor();
    return;
  }
  const found = findItem(project, connect.itemId);
  if (
    !found ||
    context.isLocked(found.item, found.layer) ||
    found.item.page !== context.viewPage()
  ) {
    context.updateCursor();
    return;
  }
  const circle = radiusCircle(found.item);
  const point =
    found.item.kind === "length"
      ? closestPointOnPolyline(found.item.points, page, false)
      : found.item.kind === "area"
        ? closestPointOnPolyline(
            areaOutline(found.item.points, areaShapeOf(found.item)),
            page,
            true,
          )
        : found.item.kind === "arc"
          ? closestPointOnPolyline(arcPolyline(found.item), page, false)
          : circle
            ? closestPointOnPolyline(circlePolyline(circle.center, circle.radius), page, true)
            : found.item.points[0];
  if (!point) {
    context.updateCursor();
    return;
  }
  store.mutate((project) => {
    const target = findItem(project, connect.itemId)?.item;
    if (!target) return;
    target.labelAnchor = { ...point };
    target.updatedAt = new Date().toISOString();
  }, "change");
  toast(t("canvas.connectionUpdated"), "success");
  context.updateCursor();
  context.drawInteraction();
}

import { findItem } from "../../model/layers";
import { itemIsLocked } from "../../model/layers";
import {
  constrainAngle,
  pointToItemLocal,
  translatePoints,
  vertexAngleAnchor,
} from "../../model/geometry";
import { LABEL_PRIMARY_SIZE, clampLabelSize } from "../../model/label";
import { store } from "../../state/store";
import type { Point } from "../../model/types";
import type { DragState } from "./pointerState";

export interface DragContext {
  snapPoint(point: Point, excludeItemId?: string): Point;
  clearSnap(): void;
}

export type DragApplyResult = "handled" | "noop" | "transform" | "end";

/**
 * Applies the non-transform drag modes. Resize, group scale and rotation are
 * applied by the transform gesture module so each family stays reviewable.
 */
export function applyDragState(
  drag: DragState,
  page: Point,
  shiftKey: boolean,
  context: DragContext,
): DragApplyResult {
  if (!store.project) return "noop";
  if (drag.mode === "scale-selection" || drag.mode === "resize" || drag.mode === "rotate") {
    return "transform";
  }
  const found = findItem(store.project, drag.itemId);
  if (!found || itemIsLocked(found.item, found.layer)) return "end";
  const item = found.item;

  if (drag.mode === "move") {
    if (!drag.startPage || !drag.startSelection?.length) return "noop";
    const dx = page.x - drag.startPage.x;
    const dy = page.y - drag.startPage.y;
    if (dx === 0 && dy === 0 && !drag.moved) return "noop";
    for (const entry of drag.startSelection) {
      const target = findItem(store.project, entry.ref.itemId);
      if (!target || itemIsLocked(target.item, target.layer)) continue;
      target.item.points = translatePoints(entry.points, dx, dy);
      target.item.updatedAt = new Date().toISOString();
    }
    drag.last = page;
    drag.moved = true;
  } else if (drag.mode === "vertex") {
    const index = drag.vertexIndex;
    if (index >= 0 && index < item.points.length) {
      const angleAnchor = shiftKey ? vertexAngleAnchor(item, index) : null;
      const target = angleAnchor
        ? constrainAngle(angleAnchor, page)
        : context.snapPoint(page, drag.itemId);
      if (angleAnchor) context.clearSnap();
      const localTarget = item.rotation === 0 ? target : pointToItemLocal(item, target);
      item.points[index] = localTarget;
      item.updatedAt = new Date().toISOString();
      drag.moved = true;
    }
  } else if (drag.mode === "label") {
    if (!drag.startPage) return "noop";
    const start = drag.startTextOffset ?? { x: 0, y: 0 };
    item.textOffset = {
      x: start.x + (page.x - drag.startPage.x),
      y: start.y + (page.y - drag.startPage.y),
    };
    item.updatedAt = new Date().toISOString();
    drag.moved = true;
  } else if (drag.mode === "measurement-label") {
    if (!drag.startPage) return "noop";
    const start = drag.startLabelOffset ?? { x: 0, y: 0 };
    item.labelOffset = {
      x: start.x + (page.x - drag.startPage.x),
      y: start.y + (page.y - drag.startPage.y),
    };
    item.updatedAt = new Date().toISOString();
    drag.moved = true;
  } else if (drag.mode === "measurement-label-size") {
    if (!drag.center || !drag.startLabelDistance) return "noop";
    const pointerDistance = Math.hypot(page.x - drag.center.x, page.y - drag.center.y);
    const factor = pointerDistance / drag.startLabelDistance;
    const next = clampLabelSize((drag.startLabelSize ?? LABEL_PRIMARY_SIZE) * factor);
    const rounded = Math.round(next * 10) / 10;
    if (rounded !== item.labelSize) {
      item.labelSize = rounded;
      item.updatedAt = new Date().toISOString();
      drag.moved = true;
    }
  }
  return "handled";
}

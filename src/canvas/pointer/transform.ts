import { midpoint, normalizeDegrees, rotatePoint, rotatePointsAround } from "../../model/geometry";
import { handleLocalPoint, oppositeHandlePoint, scaleBounds } from "../geometry";
import { findItem, itemIsLocked } from "../../model/layers";
import { clampTextSize } from "../../model/text";
import { scaleItemAround } from "../../model/transform";
import type { MarkupItem, Point } from "../../model/types";
import { SYMBOL_SIZE, clampSymbolSize } from "../../features/schematics/symbols/registry";
import { store } from "../../state/store";
import type { DragState } from "./pointerState";

export type TransformApplyResult = "handled" | "noop" | "end";

function applyGroupScale(drag: DragState, page: Point): void {
  if (!store.project) return;
  if (!drag.scaleAnchor || !drag.scaleCorner || !drag.scaleStartItems) return;
  const anchor = drag.scaleAnchor;
  const corner = drag.scaleCorner;
  const dx = corner.x - anchor.x;
  const dy = corner.y - anchor.y;
  const denominator = dx * dx + dy * dy;
  if (denominator < 1e-9) return;
  const factor = Math.max(
    0.05,
    Math.min(20, ((page.x - anchor.x) * dx + (page.y - anchor.y) * dy) / denominator),
  );
  for (const entry of drag.scaleStartItems) {
    const target = findItem(store.project, entry.ref.itemId);
    if (!target || itemIsLocked(target.item, target.layer)) continue;
    Object.assign(target.item, structuredClone(entry.item));
    scaleItemAround(target.item, factor, anchor);
  }
  drag.moved = true;
}

function applyResize(drag: DragState, item: MarkupItem, page: Point, shiftKey: boolean): void {
  if (!drag.startBounds || !drag.center || !drag.handle) return;
  const bounds = drag.startBounds;
  const center = drag.center;
  const rotation = drag.startRotation ?? 0;
  const local = rotatePoint(page, center, -rotation);
  const opposite = oppositeHandlePoint(bounds, drag.handle);
  const handlePoint = handleLocalPoint(bounds, drag.handle);
  const signX = drag.handle.includes("e") ? 1 : drag.handle.includes("w") ? -1 : 0;
  const signY = drag.handle.includes("s") ? 1 : drag.handle.includes("n") ? -1 : 0;
  const dx = handlePoint.x - opposite.x;
  const dy = handlePoint.y - opposite.y;
  if (dx === 0 && dy === 0) return;

  let factorX = signX === 0 ? 1 : (local.x - opposite.x) / dx;
  let factorY = signY === 0 ? 1 : (local.y - opposite.y) / dy;

  if (item.kind === "text" || item.kind === "stamp" || item.kind === "symbol") {
    let factor: number;
    if (signX !== 0 && signY !== 0) {
      const pointerX = local.x - opposite.x;
      const pointerY = local.y - opposite.y;
      factor = (pointerX * dx + pointerY * dy) / (dx * dx + dy * dy);
    } else {
      factor = signX !== 0 ? factorX : factorY;
    }
    factor = Math.max(0.01, Math.min(50, factor));
    if (item.kind === "symbol") {
      const start = drag.startSymbolSize ?? SYMBOL_SIZE;
      factor = clampSymbolSize(start * factor) / start;
    } else {
      const start = drag.startFontSize ?? 12;
      factor = clampTextSize(start * factor) / Math.max(0.5, start);
    }
    factorX = factor;
    factorY = factor;
  } else {
    factorX = Math.max(0.02, Math.min(50, factorX));
    factorY = Math.max(0.02, Math.min(50, factorY));
    if (item.kind === "image") {
      // Corner handles keep the source aspect ratio; edge handles resize one axis.
      if (signX !== 0 && signY !== 0) {
        const factor = Math.abs(factorX - 1) >= Math.abs(factorY - 1) ? factorX : factorY;
        factorX = factor;
        factorY = factor;
      }
    } else if (shiftKey && signX !== 0 && signY !== 0) {
      const factor = Math.abs(factorX - 1) >= Math.abs(factorY - 1) ? factorX : factorY;
      factorX = factor;
      factorY = factor;
    }
  }

  const scaled = scaleBounds(bounds, opposite, factorX, factorY);
  let shiftX = 0;
  let shiftY = 0;
  if (rotation !== 0) {
    const oldOpposite = rotatePoint(opposite, center, rotation);
    const newCenter = midpoint(scaled.min, scaled.max);
    const newOpposite = rotatePoint(opposite, newCenter, rotation);
    shiftX = oldOpposite.x - newOpposite.x;
    shiftY = oldOpposite.y - newOpposite.y;
  }

  if (item.kind === "text") {
    item.fontSize = clampTextSize((drag.startFontSize ?? 12) * factorX);
    item.points[0] = {
      x: scaled.min.x + shiftX,
      y: scaled.min.y + shiftY,
    };
  } else if (item.kind === "stamp") {
    // Stamps are centre-anchored: keep the opposite corner fixed by moving the
    // centre to the middle of the scaled box.
    item.fontSize = clampTextSize((drag.startFontSize ?? 12) * factorX);
    item.points[0] = {
      x: (scaled.min.x + scaled.max.x) / 2 + shiftX,
      y: (scaled.min.y + scaled.max.y) / 2 + shiftY,
    };
  } else if (item.kind === "symbol") {
    // Scale the artwork around the opposite selection corner and move the
    // anchor so the visible symbol stays anchored where the user dragged.
    const start = drag.startSymbolSize ?? SYMBOL_SIZE;
    const next = clampSymbolSize(start * factorX);
    const sizeFactor = next / start;
    item.symbolSize = next;
    const startAnchor = drag.startAnchor ?? item.points[0];
    if (startAnchor) {
      const nextAnchor = {
        x: opposite.x + (startAnchor.x - opposite.x) * sizeFactor,
        y: opposite.y + (startAnchor.y - opposite.y) * sizeFactor,
      };
      if (rotation !== 0) {
        const oldOpposite = rotatePoint(opposite, startAnchor, rotation);
        const newOpposite = rotatePoint(opposite, nextAnchor, rotation);
        nextAnchor.x += oldOpposite.x - newOpposite.x;
        nextAnchor.y += oldOpposite.y - newOpposite.y;
      }
      item.points[0] = nextAnchor;
    }
  } else if (item.kind === "rail") {
    const startPoints = drag.startPoints ?? item.points;
    item.points = [
      { x: scaled.min.x + shiftX, y: startPoints[0].y },
      { x: scaled.max.x + shiftX, y: startPoints[1].y },
    ];
  } else if (
    item.kind === "rect" ||
    item.kind === "textbox" ||
    item.kind === "ellipse" ||
    item.kind === "image"
  ) {
    item.points = [
      { x: scaled.min.x + shiftX, y: scaled.min.y + shiftY },
      { x: scaled.max.x + shiftX, y: scaled.max.y + shiftY },
    ];
  } else if (item.kind === "pen" || item.kind === "highlight") {
    item.points = (drag.startPoints ?? item.points).map((point) => ({
      x: opposite.x + (point.x - opposite.x) * factorX + shiftX,
      y: opposite.y + (point.y - opposite.y) * factorY + shiftY,
    }));
  } else {
    return;
  }
  item.updatedAt = new Date().toISOString();
  drag.moved = true;
}

function applyRotation(drag: DragState, item: MarkupItem, page: Point, shiftKey: boolean): void {
  if (!drag.center || drag.startAngle === undefined) return;
  const center = drag.center;
  const angle = Math.atan2(page.y - center.y, page.x - center.x);
  let delta = ((angle - drag.startAngle) * 180) / Math.PI;
  if (shiftKey) delta = Math.round(delta / 15) * 15;
  if (delta === 0) return;
  if (
    item.kind === "text" ||
    item.kind === "textbox" ||
    item.kind === "rect" ||
    item.kind === "ellipse" ||
    item.kind === "image" ||
    item.kind === "symbol"
  ) {
    item.rotation = normalizeDegrees((drag.startRotation ?? 0) + delta);
  } else {
    item.points = rotatePointsAround(drag.startPoints ?? item.points, center, delta);
    delete item.rotation;
  }
  item.updatedAt = new Date().toISOString();
  drag.moved = true;
}

export function applyTransformState(
  drag: DragState,
  page: Point,
  shiftKey: boolean,
): TransformApplyResult {
  if (drag.mode === "scale-selection") {
    applyGroupScale(drag, page);
    return "handled";
  }
  if (!store.project) return "noop";
  const found = findItem(store.project, drag.itemId);
  if (!found || itemIsLocked(found.item, found.layer)) return "end";
  const item = found.item;
  if (drag.mode === "resize") applyResize(drag, item, page, shiftKey);
  else applyRotation(drag, item, page, shiftKey);
  return "handled";
}

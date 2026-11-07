import { arcGeometry, constrainAngle, distance } from "../../model/geometry";
import { constrainSquare } from "../geometry";
import type { AreaShape, InspectionStatus, ItemKind, MarkupItem, Point } from "../../model/types";
import { store, type ToolId } from "../../state/store";
import { t } from "../../i18n";
import { toast } from "../../ui/toast";
import type { Draft } from "../draftRenderer";

export interface CreationItemOptions {
  text?: string;
  areaShape?: AreaShape;
  highlightShape?: "stroke" | "rectangle" | "polygon";
  symbolId?: string;
  status?: InspectionStatus;
}

export interface CreatedItemRef {
  layerId: string;
  itemId: string;
}

/** The scene operations a creation tool needs from its host. */
export interface CreationContext {
  getDraft(): Draft | null;
  setDraft(draft: Draft | null): void;
  snapPoint(point: Point, excludeItemId?: string): Point;
  snapPolylinePoint(point: Point): Point;
  constrainPolyline(last: Point, point: Point, free: boolean): Point;
  clearSnap(): void;
  viewZoom(): number;
  drawInteraction(): void;
  capturePointer(pointerId: number): void;
  finishDraft(): void;
  finishCallout(page: Point): void;
  createItem(kind: ItemKind, points: Point[], options?: CreationItemOptions): CreatedItemRef | null;
  runCalibration(p1: Point, p2: Point): Promise<void>;
  startTextTool(page: Point): void;
}

/**
 * Handles the pointer-down branch for every creation tool. Selection remains in
 * CanvasView until the later target-resolution step.
 */
export function handleCreationDown(
  page: Point,
  event: PointerEvent,
  tool: ToolId,
  context: CreationContext,
): void {
  if (tool === "calibrate") {
    if (event.detail > 1) return;
    const snapped = context.snapPoint(page);
    const draft = context.getDraft();
    if (!draft || draft.kind !== "calibrate") {
      context.setDraft({ kind: "calibrate", points: [snapped], cursor: snapped });
      context.drawInteraction();
    } else {
      const first = draft.points[0];
      context.setDraft(null);
      void context.runCalibration(first, snapped);
    }
    return;
  }

  if (tool === "radius" || tool === "diameter") {
    const snapped = context.snapPoint(page);
    const draft = context.getDraft();
    if (!draft || (draft.kind !== "radius" && draft.kind !== "diameter")) {
      context.setDraft({ kind: tool, points: [snapped], cursor: snapped });
      context.drawInteraction();
    } else {
      const points = [draft.points[0], snapped];
      context.setDraft(null);
      context.clearSnap();
      context.createItem(tool, points);
      context.drawInteraction();
    }
    return;
  }

  if (tool === "slope") {
    const snapped = context.snapPoint(page);
    const draft = context.getDraft();
    if (!draft || draft.kind !== "slope") {
      context.setDraft({ kind: "slope", points: [snapped], cursor: snapped });
      context.drawInteraction();
    } else {
      const points = [draft.points[0], snapped];
      context.setDraft(null);
      context.clearSnap();
      context.createItem("slope", points);
      context.drawInteraction();
    }
    return;
  }

  if (tool === "angle") {
    const snapped = context.snapPoint(page);
    const draft = context.getDraft();
    if (!draft || draft.kind !== "angle") {
      context.setDraft({ kind: "angle", points: [snapped], cursor: snapped });
      context.drawInteraction();
    } else {
      draft.points.push(snapped);
      draft.cursor = snapped;
      if (draft.points.length >= 3) {
        const points = draft.points.slice(0, 3);
        context.setDraft(null);
        context.clearSnap();
        context.createItem("angle", points);
      }
      context.drawInteraction();
    }
    return;
  }

  if (tool === "arc") {
    const snapped = context.snapPoint(page);
    const draft = context.getDraft();
    if (!draft || draft.kind !== "arc") {
      context.setDraft({ kind: "arc", points: [snapped], cursor: snapped });
      context.drawInteraction();
    } else {
      draft.points.push(snapped);
      draft.cursor = snapped;
      if (draft.points.length >= 3) {
        const points = draft.points.slice(0, 3);
        context.setDraft(null);
        context.clearSnap();
        const preview = { kind: "arc", points } as MarkupItem;
        if (arcGeometry(preview)) context.createItem("arc", points);
        else toast(t("canvas.thirdPoint"), "warning");
      }
      context.drawInteraction();
    }
    return;
  }

  if (tool === "polyline") {
    if (event.detail > 1) {
      context.finishDraft();
      return;
    }
    let snapped = event.shiftKey ? page : context.snapPolylinePoint(page);
    if (event.shiftKey) context.clearSnap();
    const draft = context.getDraft();
    const existing = draft?.kind === "polyline" ? draft : null;
    if (existing && existing.points.length) {
      snapped = context.constrainPolyline(
        existing.points[existing.points.length - 1],
        snapped,
        event.shiftKey,
      );
    }
    if (!existing) {
      context.setDraft({ kind: "polyline", points: [snapped], cursor: snapped });
    } else {
      const last = existing.points[existing.points.length - 1];
      if (distance(last, snapped) > 0.001) existing.points.push(snapped);
      existing.cursor = snapped;
    }
    context.drawInteraction();
    return;
  }

  if (tool === "area" && store.ui.measureAreaShape !== "polygon") {
    if (event.detail > 1) return;
    const snapped = context.snapPoint(page);
    context.setDraft({
      kind: store.ui.measureAreaShape === "rectangle" ? "area-rect" : "area-ellipse",
      start: snapped,
      current: snapped,
    });
    context.capturePointer(event.pointerId);
    context.drawInteraction();
    return;
  }

  const polygonKind =
    tool === "length"
      ? "length"
      : tool === "area"
        ? "area"
        : tool === "volume"
          ? "volume"
          : tool === "cloud"
            ? "cloud"
            : tool === "highlight" && store.ui.highlightShape === "polygon"
              ? "highlight-polygon"
              : null;
  if (polygonKind) {
    if (event.detail > 1) {
      context.finishDraft();
      return;
    }
    let snapped = context.snapPoint(page);
    const draft = context.getDraft();
    if (draft && draft.kind === polygonKind && draft.points.length) {
      if (event.shiftKey) {
        const constrained = constrainAngle(draft.points[draft.points.length - 1], snapped);
        if (distance(constrained, snapped) > 1e-6) context.clearSnap();
        snapped = constrained;
      }
    }
    if (!draft || draft.kind !== polygonKind) {
      context.setDraft({ kind: polygonKind, points: [snapped], cursor: snapped });
    } else if (
      polygonKind !== "length" &&
      draft.points.length >= 3 &&
      distance(snapped, draft.points[0]) < 10 / context.viewZoom()
    ) {
      context.finishDraft();
      return;
    } else {
      const last = draft.points[draft.points.length - 1];
      if (distance(last, snapped) > 0.001) draft.points.push(snapped);
      draft.cursor = snapped;
    }
    context.drawInteraction();
    return;
  }

  if (
    tool === "highlight" &&
    (store.ui.highlightShape === "rectangle" || store.ui.highlightShape === "polygon")
  ) {
    if (store.ui.highlightShape === "rectangle") {
      const snapped = context.snapPoint(page);
      context.setDraft({ kind: "highlight-rect", start: snapped, current: snapped });
      context.capturePointer(event.pointerId);
      context.drawInteraction();
    }
    return;
  }

  if (tool === "pen" || tool === "highlight") {
    context.setDraft({ kind: tool, points: [page], cursor: page });
    context.capturePointer(event.pointerId);
    context.drawInteraction();
    return;
  }

  if (
    tool === "line" ||
    tool === "arrow" ||
    tool === "rect" ||
    tool === "ellipse" ||
    tool === "textbox" ||
    tool === "rail"
  ) {
    const snaps = tool === "line" || tool === "arrow";
    const snapped = snaps ? context.snapPoint(page) : page;
    if (!snaps) context.clearSnap();
    context.setDraft({ kind: tool, start: snapped, current: snapped });
    context.capturePointer(event.pointerId);
    context.drawInteraction();
    return;
  }

  if (tool === "text") {
    context.startTextTool(page);
    return;
  }

  if (tool === "callout") {
    if (event.detail > 1) return;
    const draft = context.getDraft();
    if (!draft || draft.kind !== "callout") {
      context.setDraft({ kind: "callout", start: page, current: page });
      context.drawInteraction();
    } else {
      context.finishCallout(page);
    }
    return;
  }

  if (tool === "stamp") {
    if (event.detail > 1) return;
    context.createItem("stamp", [page], { text: store.ui.stampText });
    context.drawInteraction();
    return;
  }

  if (tool === "delta") {
    if (event.detail > 1) return;
    context.createItem("delta", [page], { text: store.ui.deltaText });
    context.drawInteraction();
    return;
  }

  if (tool === "count") {
    if (event.detail > 1) return;
    const snapped = context.snapPoint(page);
    context.createItem("count", [snapped]);
    context.drawInteraction();
    return;
  }

  if (tool === "symbol") {
    if (event.detail > 1) return;
    const snapped = context.snapPoint(page);
    context.createItem("symbol", [snapped], {
      symbolId: store.ui.symbolId,
      status: store.ui.symbolStatus ?? undefined,
    });
    context.drawInteraction();
  }
}

const SNAP_TOOLS: ReadonlySet<ToolId> = new Set([
  "calibrate",
  "length",
  "radius",
  "diameter",
  "slope",
  "angle",
  "arc",
  "polyline",
  "area",
  "volume",
  "cloud",
  "line",
  "arrow",
  "count",
  "symbol",
]);

export function toolUsesSnapping(tool: ToolId): boolean {
  if (tool === "highlight") return store.ui.highlightShape !== "stroke";
  return SNAP_TOOLS.has(tool);
}

/** Updates an in-progress draft from pointer movement. */
export function updateDraftFromPointer(
  page: Point,
  event: PointerEvent,
  context: CreationContext,
): boolean {
  const draft = context.getDraft();
  if (!draft) return false;
  if (draft.kind === "area-rect" || draft.kind === "area-ellipse") {
    let current = context.snapPoint(page);
    if (event.shiftKey) {
      const constrained = constrainSquare(draft.start, current);
      if (distance(constrained, current) > 1e-6) context.clearSnap();
      current = constrained;
    }
    draft.current = current;
  } else if (draft.kind === "line" || draft.kind === "arrow" || draft.kind === "callout") {
    // Shift constrains the angle from the raw pointer, not from a segment
    // snap on an existing pipe. Otherwise the snap would force the old line
    // direction and the constrained endpoint could not move away from it.
    let current = event.shiftKey ? page : context.snapPoint(page);
    if (event.shiftKey) {
      context.clearSnap();
      const constrained = constrainAngle(draft.start, current);
      if (distance(constrained, current) > 1e-6) context.clearSnap();
      current = constrained;
    }
    draft.current = current;
  } else if (
    draft.kind === "rect" ||
    draft.kind === "textbox" ||
    draft.kind === "rail" ||
    draft.kind === "ellipse" ||
    draft.kind === "highlight-rect"
  ) {
    context.clearSnap();
    draft.current = event.shiftKey ? constrainSquare(draft.start, page) : page;
  } else if (draft.kind === "polyline") {
    const last = draft.points[draft.points.length - 1];
    const snapped = event.shiftKey ? page : context.snapPolylinePoint(page);
    draft.cursor = context.constrainPolyline(last, snapped, event.shiftKey);
  } else if (draft.kind === "pen" || draft.kind === "highlight") {
    const last = draft.points[draft.points.length - 1];
    if (distance(last, page) > 1.4 / context.viewZoom()) {
      draft.points.push({ ...page });
    }
    draft.cursor = page;
  } else {
    let snapped = context.snapPoint(page);
    if (
      event.shiftKey &&
      (draft.kind === "length" ||
        draft.kind === "area" ||
        draft.kind === "cloud" ||
        draft.kind === "highlight-polygon") &&
      draft.points.length
    ) {
      const constrained = constrainAngle(draft.points[draft.points.length - 1], snapped);
      if (distance(constrained, snapped) > 1e-6) context.clearSnap();
      snapped = constrained;
    }
    draft.cursor = snapped;
  }
  context.drawInteraction();
  return true;
}

export interface DraftFinishContext {
  getDraft(): Draft | null;
  finishPen(): void;
  finishQuickArea(): void;
  finishShape(): void;
}

/** Starts the matching finish path when a draft is released. */
export function finishDraftOnPointerUp(context: DraftFinishContext): void {
  const draft = context.getDraft();
  if (!draft) return;
  if (draft.kind === "pen" || draft.kind === "highlight") {
    context.finishPen();
  } else if (draft.kind === "area-rect" || draft.kind === "area-ellipse") {
    context.finishQuickArea();
  } else if (
    draft.kind === "line" ||
    draft.kind === "arrow" ||
    draft.kind === "rect" ||
    draft.kind === "textbox" ||
    draft.kind === "rail" ||
    draft.kind === "ellipse" ||
    draft.kind === "highlight-rect"
  ) {
    context.finishShape();
  }
}

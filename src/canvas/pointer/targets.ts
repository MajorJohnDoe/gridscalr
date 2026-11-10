import { calloutLayout, cloudLabelLayout } from "../../model/annotations";
import {
  itemCenter,
  itemLocalBounds,
  itemRotation,
  midpoint,
  symbolSelectionBounds,
} from "../../model/geometry";
import type { Bounds } from "../../model/geometry";
import { findVertex, hitTest } from "../../model/hitTest";
import { clampLabelSize, labelAnchorForPoints } from "../../model/label";
import type { LabelLayout } from "../../model/labelLayout";
import {
  findItem,
  isMeasurementKind,
  itemIsLocked,
  itemIsVisible,
  layerLockedOnPage,
} from "../../model/layers";
import { resolveSelection } from "../../model/selection";
import { selectionBounds } from "../../model/transform";
import type { MarkupItem, PageId, Point, SelectionRef } from "../../model/types";
import { symbolSizeOf } from "../../features/schematics/symbols/registry";
import { store } from "../../state/store";
import {
  averagePoints,
  handleLocalPoint,
  oppositeHandlePoint,
  type BoxHandleRole,
} from "../geometry";
import type { LabelHit } from "../editors";
import { handleAt, type Handle } from "../selectionHandles";
import { groupHandleAt } from "./groupHandles";
import type { DragState } from "./pointerState";

export interface SelectionContext {
  toScreen(point: Point): Point;
  viewPage(): number;
  viewPageId(): PageId | null;
  viewZoom(): number;
  beginDrag(drag: DragState, pointerId: number): void;
  beginMarquee(page: Point, additive: boolean, pointerId: number): void;
  drawInteraction(): void;
  labelResizeAt(item: MarkupItem, screen: Point): boolean;
  pageLabelLayouts(): Map<string, LabelLayout>;
  measurementLabelHit(screen: Point): LabelHit | null;
}

export interface HoverContext {
  toScreen(point: Point): Point;
  viewPage(): number;
  viewPageId(): PageId | null;
  viewZoom(): number;
  labelResizeAt(item: MarkupItem, screen: Point): boolean;
}

function beginHandleDrag(
  layerId: string,
  item: MarkupItem,
  handle: Handle,
  page: Point,
  event: PointerEvent,
  context: SelectionContext,
): void {
  let drag: DragState;
  if (handle.role === "label") {
    const label = cloudLabelLayout(item);
    const centroid = averagePoints(item.points);
    store.beginGesture();
    drag = {
      mode: "label",
      itemId: item.id,
      layerId,
      vertexIndex: -1,
      last: page,
      moved: false,
      startPage: page,
      startTextOffset: label
        ? { x: label.center.x - centroid.x, y: label.center.y - centroid.y }
        : item.textOffset
          ? { ...item.textOffset }
          : { x: 0, y: 0 },
    };
  } else if (handle.role === "vertex") {
    store.beginGesture();
    drag = {
      mode: "vertex",
      itemId: item.id,
      layerId,
      vertexIndex: handle.index,
      last: page,
      moved: false,
      startPage: page,
    };
  } else if (handle.role === "rotate") {
    const center = itemCenter(item);
    store.beginGesture();
    drag = {
      mode: "rotate",
      itemId: item.id,
      layerId,
      vertexIndex: -1,
      last: page,
      moved: false,
      startPage: page,
      startPoints: item.points.map((point) => ({ ...point })),
      startRotation: itemRotation(item),
      center,
      startAngle: Math.atan2(page.y - center.y, page.x - center.x),
    };
  } else {
    const bounds = item.kind === "symbol" ? symbolSelectionBounds(item) : itemLocalBounds(item);
    store.beginGesture();
    drag = {
      mode: "resize",
      itemId: item.id,
      layerId,
      vertexIndex: -1,
      last: page,
      moved: false,
      handle: handle.role,
      startPage: page,
      startPoints: item.points.map((point) => ({ ...point })),
      startFontSize: item.fontSize ?? 12,
      startSymbolSize: symbolSizeOf(item),
      startRotation: itemRotation(item),
      startBounds: {
        min: { ...bounds.min },
        max: { ...bounds.max },
      },
      startAnchor: item.points[0] ? { ...item.points[0] } : undefined,
      center:
        item.kind === "symbol" && item.points[0]
          ? { ...item.points[0] }
          : midpoint(bounds.min, bounds.max),
    };
  }
  context.beginDrag(drag, event.pointerId);
}

function beginGroupScale(
  project: NonNullable<typeof store.project>,
  bounds: Bounds,
  handle: Handle & { role: BoxHandleRole },
  page: Point,
  event: PointerEvent,
  context: SelectionContext,
): void {
  const items: Array<{ ref: SelectionRef; item: MarkupItem }> = [];
  for (const entry of resolveSelection(project, store.ui.selection)) {
    if (
      entry.locked ||
      !itemIsVisible(entry.item, entry.layer) ||
      layerLockedOnPage(entry.layer, entry.item.pageId)
    ) {
      continue;
    }
    items.push({ ref: entry.ref, item: structuredClone(entry.item) });
  }
  if (!items.length) return;
  store.beginGesture();
  context.beginDrag(
    {
      mode: "scale-selection",
      itemId: "",
      layerId: "",
      vertexIndex: -1,
      last: page,
      moved: false,
      handle: handle.role,
      startPage: page,
      scaleAnchor: oppositeHandlePoint(bounds, handle.role),
      scaleCorner: handleLocalPoint(bounds, handle.role),
      scaleStartItems: items,
    },
    event.pointerId,
  );
}

export function beginSelection(
  page: Point,
  screen: Point,
  event: PointerEvent,
  context: SelectionContext,
): void {
  const project = store.project;
  if (!project) return;
  const modifier = event.shiftKey || event.ctrlKey || event.metaKey;
  const selection = store.ui.selection;
  const primary = store.primarySelection;

  if (!modifier && selection.length > 1) {
    const bounds = selectionBounds(project, selection);
    const groupHandle =
      bounds && groupHandleAt(bounds, screen, (point) => context.toScreen(point), 10);
    if (bounds && groupHandle) {
      beginGroupScale(project, bounds, groupHandle, page, event, context);
      return;
    }
  }

  if (!modifier) {
    if (selection.length === 1 && primary) {
      const found = findItem(project, primary.itemId);
      if (
        found &&
        isMeasurementKind(found.item.kind) &&
        !itemIsLocked(found.item, found.layer) &&
        context.labelResizeAt(found.item, screen)
      ) {
        const layout = context.pageLabelLayouts().get(found.item.id);
        if (layout) {
          const center = {
            x: layout.box.x + layout.box.width / 2,
            y: layout.box.y + layout.box.height / 2,
          };
          const startLabelSize = clampLabelSize(Math.round(layout.metrics.primarySize * 10) / 10);
          store.beginGesture();
          if (found.item.labelFit) {
            found.item.labelSize = startLabelSize;
            delete found.item.labelFit;
          }
          context.beginDrag(
            {
              mode: "measurement-label-size",
              itemId: found.item.id,
              layerId: found.layer.id,
              vertexIndex: -1,
              last: page,
              moved: false,
              startPage: page,
              startLabelSize,
              startLabelDistance: Math.max(0.001, Math.hypot(page.x - center.x, page.y - center.y)),
              center,
            },
            event.pointerId,
          );
          return;
        }
      }
    }

    const labelHit = context.measurementLabelHit(screen);
    if (labelHit && !itemIsLocked(labelHit.item, labelHit.layer)) {
      const layout = context.pageLabelLayouts().get(labelHit.item.id);
      if (layout) {
        const ref = { layerId: labelHit.layer.id, itemId: labelHit.item.id };
        if (!store.isSelected(ref)) store.setSelection(ref);
        const center = {
          x: layout.box.x + layout.box.width / 2,
          y: layout.box.y + layout.box.height / 2,
        };
        const anchor = labelAnchorForPoints(labelHit.item, labelHit.item.points);
        store.beginGesture();
        // Dragging is the explicit escape hatch: keep the size the user is
        // looking at (which may be auto-fitted inside a narrow area) instead
        // of jumping back to the project size.
        const configuredSize = clampLabelSize(
          labelHit.item.labelSize ?? project.settings.labelSize,
        );
        const currentSize = clampLabelSize(Math.round(layout.metrics.primarySize * 10) / 10);
        if (Math.abs(currentSize - configuredSize) > 0.05) {
          labelHit.item.labelSize = currentSize;
        }
        delete labelHit.item.labelFit;
        context.beginDrag(
          {
            mode: "measurement-label",
            itemId: labelHit.item.id,
            layerId: labelHit.layer.id,
            vertexIndex: -1,
            last: page,
            moved: false,
            startPage: page,
            startLabelOffset: labelHit.item.labelOffset
              ? { ...labelHit.item.labelOffset }
              : { x: center.x - anchor.x, y: center.y - anchor.y },
          },
          event.pointerId,
        );
        return;
      }
    }
  }

  if (!modifier && selection.length === 1 && primary) {
    const found = findItem(project, primary.itemId);
    if (found && !itemIsLocked(found.item, found.layer)) {
      if (found.item.kind === "cloud") {
        const label = cloudLabelLayout(found.item);
        const inLabel =
          label &&
          page.x >= label.center.x - label.width / 2 &&
          page.y >= label.center.y - label.height / 2 &&
          page.x <= label.center.x + label.width / 2 &&
          page.y <= label.center.y + label.height / 2;
        if (label && inLabel) {
          beginHandleDrag(
            found.layer.id,
            found.item,
            { role: "label", index: -1, point: screen, cursor: "move" },
            page,
            event,
            context,
          );
          return;
        }
      }
      if (found.item.kind === "callout") {
        const layout = calloutLayout(found.item);
        const inBox =
          page.x >= layout.box.x &&
          page.y >= layout.box.y &&
          page.x <= layout.box.x + layout.box.width &&
          page.y <= layout.box.y + layout.box.height;
        if (inBox) {
          beginHandleDrag(
            found.layer.id,
            found.item,
            { role: "vertex", index: 1, point: screen, cursor: "crosshair" },
            page,
            event,
            context,
          );
          return;
        }
      }
      const handle = handleAt(found.item, screen, (point) => context.toScreen(point), 10);
      if (handle) {
        beginHandleDrag(found.layer.id, found.item, handle, page, event, context);
        return;
      }
    }
  }

  const hit = hitTest(project, context.viewPageId() ?? "", page, 7 / context.viewZoom(), {
    includeLocked: true,
  });
  if (!hit) {
    if (!modifier) store.clearSelection();
    context.beginMarquee(page, modifier, event.pointerId);
    return;
  }

  const ref: SelectionRef = { layerId: hit.layer.id, itemId: hit.item.id };
  if (modifier) {
    store.toggleSelection(ref);
    context.drawInteraction();
    return;
  }

  const alreadySelected = store.isSelected(ref);
  if (!alreadySelected) store.setSelection(ref);

  if (itemIsLocked(hit.item, hit.layer)) {
    context.drawInteraction();
    return;
  }

  const single = store.ui.selection.length === 1;
  const vertexEditable =
    single &&
    (hit.item.kind === "length" ||
      hit.item.kind === "area" ||
      hit.item.kind === "radius" ||
      hit.item.kind === "diameter" ||
      hit.item.kind === "arc" ||
      hit.item.kind === "angle" ||
      hit.item.kind === "slope" ||
      hit.item.kind === "volume" ||
      hit.item.kind === "polyline" ||
      hit.item.kind === "cloud" ||
      hit.item.kind === "callout" ||
      (hit.item.kind === "highlight" && hit.item.highlightShape !== "stroke") ||
      hit.item.kind === "line" ||
      hit.item.kind === "arrow" ||
      hit.item.kind === "pen");
  const vertexIndex = vertexEditable ? findVertex(hit.item, page, 7 / context.viewZoom()) : -1;
  const startSelection = resolveSelection(project, store.ui.selection)
    .filter((entry) => !entry.locked)
    .map((entry) => ({
      ref: entry.ref,
      points: entry.item.points.map((point) => ({ ...point })),
    }));
  if (!startSelection.length) {
    context.drawInteraction();
    return;
  }
  store.beginGesture();
  context.beginDrag(
    {
      mode: vertexIndex >= 0 ? "vertex" : "move",
      itemId: hit.item.id,
      layerId: hit.layer.id,
      vertexIndex,
      last: page,
      moved: false,
      startPage: page,
      startSelection,
    },
    event.pointerId,
  );
}

export function updateHover(
  page: Point,
  screen: Point,
  context: HoverContext,
): {
  handle: Handle | null;
  labelResize: boolean;
  hover: { layerId: string; itemId: string; vertexIndex: number } | null;
} {
  const project = store.project;
  if (!project) return { handle: null, labelResize: false, hover: null };
  let handle: Handle | null = null;
  let labelResize = false;
  const selection = store.primarySelection;
  if (selection && store.ui.selection.length === 1) {
    const found = findItem(project, selection.itemId);
    if (found && !itemIsLocked(found.item, found.layer)) {
      if (isMeasurementKind(found.item.kind)) {
        labelResize = context.labelResizeAt(found.item, screen);
      }
      if (!labelResize) {
        handle = handleAt(found.item, screen, (point) => context.toScreen(point), 10);
      }
    }
  }
  if (!handle && !labelResize && store.ui.selection.length > 1) {
    const bounds = selectionBounds(project, store.ui.selection);
    if (bounds) {
      handle = groupHandleAt(bounds, screen, (point) => context.toScreen(point), 10);
    }
  }
  if (!handle && !labelResize) {
    const hit = hitTest(project, context.viewPageId() ?? "", page, 7 / context.viewZoom());
    return {
      handle,
      labelResize,
      hover: hit ? { layerId: hit.layer.id, itemId: hit.item.id, vertexIndex: -1 } : null,
    };
  }
  return { handle, labelResize, hover: null };
}

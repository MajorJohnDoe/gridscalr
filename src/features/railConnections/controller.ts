import { makeId } from "../../model/calibration";
import { addItem, findItem } from "../../model/layers";
import { DEFAULT_DRAWING_STROKE_WIDTH } from "../../model/style";
import type { MarkupItem, Point } from "../../model/types";
import { store } from "../../state/store";
import { symbolCategoryColor, symbolCategoryOf, symbolDefaultSize } from "../schematics";
import { findRailCrossing, type RailCrossing } from "./model";

export const CONNECTION_SYMBOL_ID = "schematic.connection-dot";

export interface ConnectToChannelResult {
  layerId: string;
  itemId: string;
  crossing: RailCrossing;
}

/**
 * Inserts one existing connection-dot symbol at the nearest wire/rail crossing
 * on the wire's own layer. The whole insertion is a single store mutation, so
 * one undo removes it.
 */
export function connectToChannel(
  layerId: string,
  itemId: string,
  click: Point,
  zoom = store.ui.zoom,
): ConnectToChannelResult | null {
  const project = store.project;
  if (!project || store.readOnly) return null;
  const found = findItem(project, itemId);
  if (!found || found.layer.id !== layerId) return null;
  const crossing = findRailCrossing(project, { layerId, itemId }, click, zoom);
  if (!crossing) return null;

  const pageId = found.item.pageId;
  let created: MarkupItem | null = null;
  store.mutate((current) => {
    const layer = current.layers.find((entry) => entry.id === layerId);
    if (!layer) return;
    const now = new Date().toISOString();
    const dot: MarkupItem = {
      id: makeId("item"),
      pageId,
      kind: "symbol",
      points: [{ ...crossing.point }],
      color: symbolCategoryColor(symbolCategoryOf(CONNECTION_SYMBOL_ID)),
      strokeWidth: DEFAULT_DRAWING_STROKE_WIDTH,
      symbolId: CONNECTION_SYMBOL_ID,
      symbolSize: symbolDefaultSize(CONNECTION_SYMBOL_ID),
      createdAt: now,
      updatedAt: now,
    };
    addItem(current, layerId, dot);
    created = dot;
  }, "change");

  const result = created as MarkupItem | null;
  if (!result) return null;
  store.setSelection({ layerId, itemId: result.id });
  return { layerId, itemId: result.id, crossing };
}

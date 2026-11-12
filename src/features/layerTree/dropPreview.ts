import type { Layer } from "../../model/types";
import { layerMoveRejection, type LayerDropPlan, type LayerMoveRejection } from "./operations";

/**
 * Pure drop planning for the Layers panel tree.
 *
 * The pointer position decides three zones inside one row: the top band drops
 * above the row, the middle band nests inside it and the bottom band drops
 * below it. Modes are panel positions, not array positions. Validation is the same function the keyboard moves use, so a
 * pointer drop and a keyboard move cannot disagree about a cycle or a
 * cross-kind nesting.
 */

export type LayerDropFeedback = "move" | "nest" | "reject";

export interface LayerRowSpan {
  id: string;
  top: number;
  bottom: number;
}

export interface LayerDropPreview {
  plan: LayerDropPlan;
  feedback: LayerDropFeedback;
  insertionIndex: number;
  highlightId: string | null;
  rejection: LayerMoveRejection | null;
}

export function layerDropPreview(
  project: { layers: Layer[] },
  dragging: readonly string[],
  rows: readonly LayerRowSpan[],
  clientY: number,
): LayerDropPreview | null {
  if (!rows.length || !dragging.length) return null;
  let index = rows.findIndex((row) => clientY >= row.top && clientY <= row.bottom);
  if (index < 0) index = clientY < rows[0].top ? 0 : rows.length - 1;
  const row = rows[index];
  const ratio = row.bottom > row.top ? (clientY - row.top) / (row.bottom - row.top) : 0.5;
  const mode = ratio < 0.3 ? "above" : ratio > 0.7 ? "below" : "inside";
  const plan: LayerDropPlan = { mode, targetId: row.id };
  const rejection = layerMoveRejection(project, dragging, plan);
  if (rejection) {
    return {
      plan,
      feedback: "reject",
      insertionIndex: index + 1,
      highlightId: mode === "inside" ? row.id : null,
      rejection,
    };
  }
  return {
    plan,
    feedback: mode === "inside" ? "nest" : "move",
    insertionIndex: mode === "above" ? index : index + 1,
    highlightId: mode === "inside" ? row.id : null,
    rejection: null,
  };
}

/** Row spans in rendered order, for `layerDropPreview`. */
export function layerRowSpans(rows: readonly HTMLElement[]): LayerRowSpan[] {
  return rows.flatMap((row) => {
    const id = row.dataset.layerId;
    if (!id) return [];
    const rect = row.getBoundingClientRect();
    return [{ id, top: rect.top, bottom: rect.bottom }];
  });
}

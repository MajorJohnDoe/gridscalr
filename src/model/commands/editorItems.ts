import { findItem } from "../layers";
import type { Point, Project } from "../types";

/**
 * Small item edits made by the canvas double-click and depth flows that are not
 * general selection commands.
 *
 * Every function edits the project it is given and reports whether anything
 * changed. The caller keeps the one `store.mutate(...)` wrapper, so one action
 * stays one undo step. Pure model: no DOM, store or canvas import.
 */

function touch(item: { updatedAt: string }): void {
  item.updatedAt = new Date().toISOString();
}

/**
 * Inserts one vertex after `afterIndex`, which is the double-click "add a point
 * to this segment" action for lengths, areas and pen strokes.
 */
export function insertItemPoint(
  project: Project,
  itemId: string,
  afterIndex: number,
  point: Point,
): boolean {
  const item = findItem(project, itemId)?.item;
  if (!item) return false;
  item.points.splice(afterIndex + 1, 0, { ...point });
  touch(item);
  return true;
}

/** Sets the depth that turns a volume measurement into cubic metres. */
export function setMeasurementVolumeDepth(
  project: Project,
  itemId: string,
  depth: number,
): boolean {
  const item = findItem(project, itemId)?.item;
  if (!item || item.kind !== "volume") return false;
  item.depth = Math.max(0.001, Math.min(1_000_000, depth));
  touch(item);
  return true;
}

import { findItem } from "../layers";
import type { LabelFitPosition, Point, Project } from "../types";

/**
 * Measurement label commands shared by the inline label editor and the canvas
 * label context menu.
 *
 * Every function edits the project it is given and reports whether anything
 * changed. The caller keeps the one `store.mutate(...)` wrapper, so a label
 * action stays one undo step. Pure model: no DOM, store or canvas import.
 */

function touch(item: { updatedAt: string }): void {
  item.updatedAt = new Date().toISOString();
}

/** Sets the free-text label of a measurement; an empty value clears it. */
export function setItemLabel(project: Project, itemId: string, value: string): boolean {
  const item = findItem(project, itemId)?.item;
  if (!item) return false;
  item.label = value.trim() || undefined;
  touch(item);
  return true;
}

/** Moves the label leader connection to an explicit page point. */
export function setItemLabelAnchor(project: Project, itemId: string, anchor: Point): boolean {
  const item = findItem(project, itemId)?.item;
  if (!item) return false;
  item.labelAnchor = { ...anchor };
  touch(item);
  return true;
}

/** Drops a manual label point so the label size returns to the project default. */
export function resetItemLabelSize(project: Project, itemId: string): boolean {
  const item = findItem(project, itemId)?.item;
  if (!item) return false;
  delete item.labelSize;
  touch(item);
  return true;
}

/**
 * Pins an area or volume label inside the shape at one placement and drops the
 * manual offset and leader point, which no longer apply.
 */
export function setItemLabelFit(
  project: Project,
  itemId: string,
  placement: LabelFitPosition,
): boolean {
  const item = findItem(project, itemId)?.item;
  if (!item || (item.kind !== "area" && item.kind !== "volume")) return false;
  item.labelFit = placement;
  delete item.labelOffset;
  delete item.labelAnchor;
  touch(item);
  return true;
}

/** Releases an inside-shape pin and lets the label follow its default rules. */
export function releaseItemLabelFit(project: Project, itemId: string): boolean {
  const item = findItem(project, itemId)?.item;
  if (!item) return false;
  delete item.labelFit;
  touch(item);
  return true;
}

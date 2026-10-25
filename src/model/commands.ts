import { resolveSelection } from "./selection";
import { translatePoints } from "./geometry";
import type { ImageMode, Project, SelectionRef } from "./types";

export interface ItemCommandResult {
  /** Items that were eligible and received the operation. */
  changed: number;
  /** Items skipped because the item or its layer is locked. */
  skippedLocked: number;
  /** Items skipped when showing an item on a hidden layer. */
  skippedLayerHidden: number;
  /** Items skipped when unlocking an item on a locked layer. */
  skippedLayerLocked: number;
}

function emptyResult(): ItemCommandResult {
  return { changed: 0, skippedLocked: 0, skippedLayerHidden: 0, skippedLayerLocked: 0 };
}

export function emptyItemCommandResult(): ItemCommandResult {
  return emptyResult();
}

function touch(item: { updatedAt: string }): void {
  item.updatedAt = new Date().toISOString();
}

/**
 * Visibility follows the layer rule: a hidden layer can never be bypassed by
 * showing an item, but hiding an item is always allowed.
 */
export function setItemsVisible(
  project: Project,
  refs: SelectionRef[],
  visible: boolean,
): ItemCommandResult {
  const result = emptyResult();
  for (const entry of resolveSelection(project, refs)) {
    if (visible && !entry.layer.visible) {
      result.skippedLayerHidden += 1;
      continue;
    }
    entry.item.visible = visible;
    touch(entry.item);
    result.changed += 1;
  }
  return result;
}

/**
 * Locking an item is always allowed. Unlocking is blocked while the layer is
 * locked, because the layer would immediately lock it again.
 */
export function setItemsLocked(
  project: Project,
  refs: SelectionRef[],
  locked: boolean,
): ItemCommandResult {
  const result = emptyResult();
  for (const entry of resolveSelection(project, refs)) {
    if (!locked && entry.layer.locked) {
      result.skippedLayerLocked += 1;
      continue;
    }
    entry.item.locked = locked;
    touch(entry.item);
    result.changed += 1;
  }
  return result;
}

/** Deletes every selected item that is not protected by an item or layer lock. */
export function deleteItems(
  project: Project,
  refs: SelectionRef[],
): ItemCommandResult {
  const result = emptyResult();
  for (const entry of resolveSelection(project, refs)) {
    if (entry.locked) {
      result.skippedLocked += 1;
      continue;
    }
    const index = entry.layer.items.indexOf(entry.item);
    if (index < 0) continue;
    entry.layer.items.splice(index, 1);
    result.changed += 1;
  }
  return result;
}

export function translateItems(
  project: Project,
  refs: SelectionRef[],
  dx: number,
  dy: number,
): ItemCommandResult {
  const result = emptyResult();
  for (const entry of resolveSelection(project, refs)) {
    if (entry.locked) {
      result.skippedLocked += 1;
      continue;
    }
    entry.item.points = translatePoints(entry.item.points, dx, dy);
    touch(entry.item);
    result.changed += 1;
  }
  return result;
}

export function setItemsColor(
  project: Project,
  refs: SelectionRef[],
  color: string,
): ItemCommandResult {
  const result = emptyResult();
  for (const entry of resolveSelection(project, refs)) {
    if (entry.locked) {
      result.skippedLocked += 1;
      continue;
    }
    entry.item.color = color;
    touch(entry.item);
    result.changed += 1;
  }
  return result;
}

export function setItemsStrokeWidth(
  project: Project,
  refs: SelectionRef[],
  width: number,
): ItemCommandResult {
  const result = emptyResult();
  for (const entry of resolveSelection(project, refs)) {
    if (entry.locked) {
      result.skippedLocked += 1;
      continue;
    }
    entry.item.strokeWidth = width;
    touch(entry.item);
    result.changed += 1;
  }
  return result;
}

export function setItemsImageMode(
  project: Project,
  refs: SelectionRef[],
  mode: ImageMode,
): ItemCommandResult {
  const result = emptyResult();
  for (const entry of resolveSelection(project, refs)) {
    if (entry.item.kind !== "image" || !entry.item.image) continue;
    if (entry.locked) {
      result.skippedLocked += 1;
      continue;
    }
    entry.item.image = { ...entry.item.image, mode };
    touch(entry.item);
    result.changed += 1;
  }
  return result;
}

export function setItemsOpacity(
  project: Project,
  refs: SelectionRef[],
  opacity: number,
): ItemCommandResult {
  const result = emptyResult();
  const value = Math.max(0, Math.min(1, opacity));
  for (const entry of resolveSelection(project, refs)) {
    if (entry.item.kind !== "image") continue;
    if (entry.locked) {
      result.skippedLocked += 1;
      continue;
    }
    entry.item.opacity = value;
    touch(entry.item);
    result.changed += 1;
  }
  return result;
}

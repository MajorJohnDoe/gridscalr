import { resolveSelection } from "../selection";
import type { MarkupItem, Project, SelectionRef } from "../types";

/**
 * Outcome of an item command.
 *
 * Every command shares this shape so callers and tests can report what actually
 * changed without inspecting the project again.
 */
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

export function emptyResult(): ItemCommandResult {
  return { changed: 0, skippedLocked: 0, skippedLayerHidden: 0, skippedLayerLocked: 0 };
}

/** Marks an item as changed without opening a second undo step. */
export function touch(item: { updatedAt: string }): void {
  item.updatedAt = new Date().toISOString();
}

/**
 * Applies one edit to every selected item that is not protected by a lock.
 *
 * `apply` returns false when the item is not eligible (for example a count-only
 * command pointed at a length). An eligible item is timestamped once, so the
 * caller's single `store.mutate` remains one undo step.
 */
export function applyItemCommand(
  project: Project,
  refs: SelectionRef[],
  apply: (item: MarkupItem) => boolean,
): ItemCommandResult {
  const result = emptyResult();
  for (const entry of resolveSelection(project, refs)) {
    if (entry.locked) {
      result.skippedLocked += 1;
      continue;
    }
    if (!apply(entry.item)) continue;
    touch(entry.item);
    result.changed += 1;
  }
  return result;
}

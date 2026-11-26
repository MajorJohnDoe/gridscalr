import { findItem } from "../layers";
import type { Project } from "../types";

/**
 * Item label command shared by the Markups table and the canvas label editor.
 *
 * An empty value removes the custom label so the derived item label shows
 * again. The command reports whether it changed anything, which also keeps a
 * commit of the unchanged text out of the undo history.
 */
export function setItemLabel(project: Project, itemId: string, value: string): boolean {
  const found = findItem(project, itemId);
  if (!found) return false;
  const label = value.trim() || undefined;
  if (found.item.label === label) return false;
  if (label === undefined) delete found.item.label;
  else found.item.label = label;
  found.item.updatedAt = new Date().toISOString();
  return true;
}

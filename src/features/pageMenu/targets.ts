import type { PageId, Project } from "../../model/types";
import { pageReorder } from "../pageReorder";

/**
 * Page commands act on the Pages-panel selection when it holds live pages,
 * otherwise on the current page. Insert uses the first page of the block for
 * "before" and the last page for "after".
 *
 * The selection is session UI state in the page reorder controller, so this
 * helper is the only place that reads it for a page command.
 */
export function pageEditTargets(project: Project, pageId: PageId | null): PageId[] {
  const live = new Set(project.pages.map((page) => page.id));
  const selection = pageReorder.selectionIds().filter((id) => live.has(id));
  if (selection.length) return selection;
  return pageId ? [pageId] : [];
}

/** Backwards-compatible name used by the move command. */
export function moveTargets(project: Project, pageId: PageId): PageId[] {
  return pageEditTargets(project, pageId);
}

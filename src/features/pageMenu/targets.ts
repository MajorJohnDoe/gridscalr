import type { PageId, Project } from "../../model/types";
import { pageReorder } from "../pageReorder";

/**
 * The current page and the Pages-panel multi-selection share one keyboard
 * target: when the current page is part of the selection, the whole selection
 * moves. Duplicate and delete stay per page because both are structural.
 *
 * The selection is session UI state in the page reorder controller, so this
 * helper is the only place that reads it for a page command.
 */
export function moveTargets(project: Project, pageId: PageId): PageId[] {
  const selection = pageReorder
    .selectionIds()
    .filter((id) => project.pages.some((page) => page.id === id));
  return selection.includes(pageId) ? selection : [pageId];
}

import type { MarkupsView, Project } from "../types";

/**
 * Saved Markups view commands.
 *
 * A view is project data, so its add, upsert and replace operations live here
 * rather than in the Markups panel. Each function edits the project it is given
 * so the caller keeps the one `store.mutate(...)` wrapper and one undo step.
 * The arrays are copied, so a caller cannot mutate a stored view through the
 * object it passed in.
 */

function cloneView(view: MarkupsView): MarkupsView {
  return {
    ...view,
    columns: [...view.columns],
    groupBy: [...view.groupBy],
    sort: view.sort ? { ...view.sort } : null,
  };
}

/** Adds one view when its id is new and its name is not blank. */
export function addMarkupsView(project: Pick<Project, "markupsViews">, view: MarkupsView): boolean {
  if (!view.name.trim()) return false;
  if (project.markupsViews.some((entry) => entry.id === view.id)) return false;
  project.markupsViews.push(cloneView(view));
  return true;
}

/** Replaces the view with the same id in place, or appends a new one. */
export function upsertMarkupsView(
  project: Pick<Project, "markupsViews">,
  view: MarkupsView,
): boolean {
  if (!view.name.trim()) return false;
  const next = cloneView(view);
  const index = project.markupsViews.findIndex((entry) => entry.id === view.id);
  if (index >= 0) project.markupsViews[index] = next;
  else project.markupsViews.push(next);
  return true;
}

/**
 * Replaces the whole view list in the supplied order. Blank names and duplicate
 * ids are dropped rather than stored, and the return value is the kept count.
 */
export function replaceMarkupsViews(
  project: Pick<Project, "markupsViews">,
  views: readonly MarkupsView[],
): number {
  const seen = new Set<string>();
  const next: MarkupsView[] = [];
  for (const view of views) {
    if (!view.name.trim() || seen.has(view.id)) continue;
    seen.add(view.id);
    next.push(cloneView(view));
  }
  project.markupsViews = next;
  return next.length;
}

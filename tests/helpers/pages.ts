import type { PageState, Project } from "../../src/model/types";

/** Deterministic page IDs for unit tests: page_1, page_2, ... */
export function pageIdFor(page: number): string {
  return `page_${page}`;
}

/** Gives a freshly created project stable, predictable page IDs. */
export function withTestPageIds(project: Project): Project {
  const remap = new Map<string, string>();
  project.pages.forEach((record, index) => {
    const id = pageIdFor(index + 1);
    remap.set(record.id, id);
    record.id = id;
  });
  for (const layer of project.layers) {
    if (layer.homePageId) {
      layer.homePageId = remap.get(layer.homePageId) ?? layer.homePageId;
    }
    if (layer.pageState) {
      const next: Record<string, (typeof layer.pageState)[string]> = {};
      for (const [key, value] of Object.entries(layer.pageState)) {
        next[remap.get(key) ?? key] = value;
      }
      layer.pageState = next;
    }
    for (const item of layer.items) {
      item.pageId = remap.get(item.pageId) ?? item.pageId;
    }
  }
  return project;
}

/** Mutable page state for a 1-based display page. */
export function pageStateAt(project: Project, page: number): PageState | undefined {
  return project.pages[page - 1]?.state;
}

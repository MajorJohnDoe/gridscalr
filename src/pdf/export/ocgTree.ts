import { buildLayerHierarchy } from "../../model/layerHierarchy";
import { layerVisibleOnPage } from "../../model/layers";
import { pageIdAt } from "../../model/pages";
import type { Project } from "../../model/types";
import type { OptionalContentLayer } from "./ocg";

/**
 * Visible layer hierarchy for the optional-content order.
 *
 * A selected layer that draws on a selected page becomes a node; the node nests
 * under its resolved parent when that parent is also included, and becomes a
 * root otherwise. Effective visibility is used, so a hidden group and its whole
 * subtree never reach this tree and cannot contribute an empty folder. See ADR
 * 0014.
 */
export function optionalContentTree(
  project: Project,
  selectedLayers: ReadonlySet<string>,
  selectedPages: readonly number[],
): OptionalContentLayer[] {
  interface Node {
    id: string;
    name: string;
    children: Node[];
  }
  const hierarchy = buildLayerHierarchy(project.layers);
  const drawsOnSelectedPage = (layerId: string): boolean => {
    const layer = project.layers.find((entry) => entry.id === layerId);
    if (!layer || !selectedLayers.has(layer.id) || layer.opacity <= 0) return false;
    return selectedPages.some((pageNumber) => {
      const pageId = pageIdAt(project, pageNumber);
      return pageId ? layerVisibleOnPage(layer, pageId, hierarchy) : false;
    });
  };

  const nodes = new Map<string, Node>();
  for (const layer of project.layers) {
    if (drawsOnSelectedPage(layer.id)) {
      nodes.set(layer.id, { id: layer.id, name: layer.name, children: [] });
    }
  }
  const roots: Node[] = [];
  for (const layer of project.layers) {
    const node = nodes.get(layer.id);
    if (!node) continue;
    const parentId = hierarchy.parentOfId.get(layer.id) ?? null;
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

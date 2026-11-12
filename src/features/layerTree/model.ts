import {
  buildLayerHierarchy,
  layerDescendantIds,
  layerEffectiveState,
  layerIdsKeptAfterPageRemoval,
  layerTreeDepth,
  type LayerEffectiveState,
  type LayerHierarchyIssue,
} from "../../model/layerHierarchy";
import { removeLayer } from "../../model/layers";
import type { Layer, PageId, Project } from "../../model/types";

/**
 * Layer-tree view of a project. Pure model: no DOM, no IO and no persistence.
 *
 * A tree is derived from the optional `parentId` on every layer; nothing is
 * stored twice. The flat project case is the same tree with only roots, in
 * array order. See ADR 0014.
 */

export interface LayerTreeNode {
  layer: Layer;
  parentId: string | null;
  /** 0 for a root layer. */
  depth: number;
  childIds: readonly string[];
  /** Effective visibility and locking, resolved per page on demand. */
  stateOn(pageId: PageId): LayerEffectiveState | null;
}

export interface LayerTree {
  nodes: readonly LayerTreeNode[];
  byId: ReadonlyMap<string, LayerTreeNode>;
  /** Depth-first parent-then-children display order. */
  order: readonly string[];
  issues: readonly LayerHierarchyIssue[];
}

type LayerTreeProject = Pick<Project, "layers">;

export function buildLayerTree(project: LayerTreeProject): LayerTree {
  const hierarchy = buildLayerHierarchy(project.layers);
  const nodes: LayerTreeNode[] = [];
  const byId = new Map<string, LayerTreeNode>();
  for (const layerId of hierarchy.treeOrderIds) {
    const layer = hierarchy.byId.get(layerId);
    if (!layer) continue;
    const node: LayerTreeNode = {
      layer,
      parentId: hierarchy.parentOfId.get(layerId) ?? null,
      depth: layerTreeDepth(hierarchy, layerId),
      childIds: hierarchy.childrenOfId.get(layerId) ?? [],
      stateOn: (pageId) => layerEffectiveState(hierarchy, layerId, pageId),
    };
    nodes.push(node);
    byId.set(layerId, node);
  }
  return { nodes, byId, order: hierarchy.treeOrderIds, issues: hierarchy.issues };
}

/** Effective state of one layer on one page, including every ancestor. */
export function layerTreeState(
  project: LayerTreeProject,
  layerId: string,
  pageId: PageId,
): LayerEffectiveState | null {
  return layerEffectiveState(buildLayerHierarchy(project.layers), layerId, pageId);
}

/** Root-first descendant count for a layer. */
export function layerTreeDescendantCount(project: LayerTreeProject, layerId: string): number {
  return layerDescendantIds(buildLayerHierarchy(project.layers), layerId).length;
}

export interface LayerDeletionPlan {
  layerId: string;
  /** The layer and every descendant, in tree order. */
  layerIds: readonly string[];
  /** Descendants only, for the confirmation message. */
  childCount: number;
  itemCount: number;
}

/**
 * What deleting one layer will remove. A parent deletes its whole subtree, so
 * the caller must show `childCount` and `itemCount` before confirming.
 */
export function planLayerDeletion(
  project: LayerTreeProject,
  layerId: string,
): LayerDeletionPlan | null {
  const layer = project.layers.find((entry) => entry.id === layerId);
  if (!layer) return null;
  const hierarchy = buildLayerHierarchy(project.layers);
  const descendants = layerDescendantIds(hierarchy, layerId);
  const layerIds = [layerId, ...descendants];
  const itemCount = project.layers
    .filter((entry) => layerIds.includes(entry.id))
    .reduce((total, entry) => total + entry.items.length, 0);
  return { layerId, layerIds, childCount: descendants.length, itemCount };
}

/**
 * Deletes a layer and its subtree. Items on every removed layer are deleted
 * with it. The confirmation belongs to the caller; the cascade is deterministic.
 */
export function deleteLayerSubtree(
  project: Pick<Project, "layers" | "activeLayerId">,
  layerId: string,
): LayerDeletionPlan | null {
  const plan = planLayerDeletion(project, layerId);
  if (!plan) return null;
  removeLayer(project, layerId);
  return plan;
}

/**
 * Layers that survive a page-scoped reference change such as a page deletion.
 * A group stays while any descendant is still referenced, so a page delete can
 * never orphan or silently flatten a subtree. Order is preserved.
 */
export function layersAfterPageRemoval(
  layers: readonly Layer[],
  referenced: (layer: Layer) => boolean,
): Layer[] {
  const hierarchy = buildLayerHierarchy(layers);
  const referencedIds = new Set(
    layers.filter((layer) => referenced(layer)).map((layer) => layer.id),
  );
  const kept = layerIdsKeptAfterPageRemoval(hierarchy, referencedIds);
  return layers.filter((layer) => kept.has(layer.id));
}

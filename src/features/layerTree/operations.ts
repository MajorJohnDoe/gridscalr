import {
  buildLayerHierarchy,
  canNestLayerUnder,
  layerDescendantIds,
} from "../../model/layerHierarchy";
import { makeId } from "../../model/calibration";
import { normalizeLayerOrder } from "../../model/layers";
import type { Layer, MarkupItem, Project } from "../../model/types";

/**
 * Pure layer-tree edits: reparenting, sibling reorder, subtree duplication and
 * moving a layer out of its group.
 *
 * Every function either returns a changed project or refuses. References are
 * never silently dropped, a cycle and a cross-kind link are rejected instead of
 * repaired, and a move never changes a layer's page scope. See ADR 0014.
 */

/**
 * Drop position in panel terms, not array terms. The panel lists layers top to
 * bottom while the project array is bottom to top, so "above" and "below" are
 * mapped to the array inside `planLayerMove`.
 */
export type LayerDropMode = "inside" | "above" | "below";

export interface LayerDropPlan {
  mode: LayerDropMode;
  targetId: string;
}

export type LayerMoveRejection = "empty" | "unknown" | "self" | "kind" | "cycle";

export interface LayerMoveResult {
  /** True when applying the plan changes the stored order or a parent link. */
  changed: boolean;
  apply: (project: Pick<Project, "layers">) => void;
}

type LayerProject = Pick<Project, "layers">;

function uniqueIds(project: LayerProject, ids: readonly string[]): string[] {
  const present = new Map(project.layers.map((layer) => [layer.id, layer]));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (seen.has(id) || !present.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * Why a drop is refused, or null when it can run.
 *
 * A layer may only nest under a layer of its own kind, never under itself and
 * never under one of its own descendants. The same checks apply to a sibling
 * drop, because the new parent is the target's parent.
 */
export function layerMoveRejection(
  project: LayerProject,
  ids: readonly string[],
  plan: LayerDropPlan,
): LayerMoveRejection | null {
  const moving = uniqueIds(project, ids);
  if (!moving.length) return "empty";
  const hierarchy = buildLayerHierarchy(project.layers);
  const target = hierarchy.byId.get(plan.targetId);
  if (!target) return "unknown";
  if (moving.includes(plan.targetId)) return "self";
  const parentId =
    plan.mode === "inside" ? target.id : (hierarchy.parentOfId.get(target.id) ?? null);
  for (const id of moving) {
    const layer = hierarchy.byId.get(id);
    if (!layer || layer.kind !== target.kind) return "kind";
    if (!parentId) continue;
    const verdict = canNestLayerUnder(hierarchy, id, parentId);
    if (verdict === "ok") continue;
    return verdict === "unknown" ? "unknown" : verdict;
  }
  return null;
}

function moveSignature(project: LayerProject): string {
  return project.layers.map((layer) => `${layer.id}:${layer.parentId ?? ""}`).join("|");
}

/**
 * Plans one drag or keyboard move.
 *
 * Nesting only sets the parent link: the layer keeps its array position, so
 * grouping never restacks it in front of or behind its siblings. An above/below
 * move reorders the array next to the target and reparents to the target's
 * parent, so dropping a row at the top level leaves the group.
 */
export function planLayerMove(
  project: LayerProject,
  ids: readonly string[],
  plan: LayerDropPlan,
): LayerMoveResult | null {
  if (layerMoveRejection(project, ids, plan)) return null;
  const moving = uniqueIds(project, ids);
  const hierarchy = buildLayerHierarchy(project.layers);
  const target = hierarchy.byId.get(plan.targetId)!;
  const parentId =
    plan.mode === "inside" ? target.id : (hierarchy.parentOfId.get(target.id) ?? null);

  if (plan.mode === "inside") {
    return {
      changed: moving.some((id) => (hierarchy.parentOfId.get(id) ?? null) !== parentId),
      apply(next) {
        for (const id of moving) {
          const layer = next.layers.find((entry) => entry.id === id);
          if (layer) layer.parentId = parentId ?? undefined;
        }
      },
    };
  }

  const movingSet = new Set(moving);
  const remaining = project.layers.filter((layer) => !movingSet.has(layer.id));
  const moved = project.layers.filter((layer) => movingSet.has(layer.id));
  let insertion = remaining.findIndex((layer) => layer.id === plan.targetId);
  if (insertion < 0) return null;
  if (plan.mode === "above") {
    // Above the row means after the target's whole subtree in paint order.
    const subtree = new Set([plan.targetId, ...layerDescendantIds(hierarchy, plan.targetId)]);
    let last = insertion;
    remaining.forEach((layer, index) => {
      if (subtree.has(layer.id)) last = index;
    });
    insertion = last + 1;
  }

  const nextOrder = [
    ...remaining.slice(0, insertion).map((layer) => layer.id),
    ...moving,
    ...remaining.slice(insertion).map((layer) => layer.id),
  ];
  const signatureNow = moveSignature(project);
  const simulated = nextOrder.map((id) => {
    const source = project.layers.find((layer) => layer.id === id)!;
    return { id, parentId: movingSet.has(id) ? (parentId ?? undefined) : source.parentId };
  });
  const signatureNext = simulated.map((entry) => `${entry.id}:${entry.parentId ?? ""}`).join("|");
  return {
    changed: signatureNext !== signatureNow,
    apply(next) {
      const byId = new Map(next.layers.map((layer) => [layer.id, layer]));
      for (const layer of moved) {
        layer.parentId = parentId ?? undefined;
      }
      const ordered = nextOrder
        .map((id) => byId.get(id))
        .filter((layer): layer is Layer => Boolean(layer));
      next.layers = normalizeLayerOrder(ordered);
    },
  };
}

/** Applies one planned move. Returns true when the project changed. */
export function moveLayersInTree(
  project: LayerProject,
  ids: readonly string[],
  plan: LayerDropPlan,
): boolean {
  const result = planLayerMove(project, ids, plan);
  if (!result || !result.changed) return false;
  result.apply(project);
  return true;
}

/** Moves a layer out of its group, keeping it directly below the former parent. */
export function moveLayerOutOfGroup(project: LayerProject, layerId: string): boolean {
  const hierarchy = buildLayerHierarchy(project.layers);
  const parentId = hierarchy.parentOfId.get(layerId) ?? null;
  if (!parentId) return false;
  return moveLayersInTree(project, [layerId], { mode: "below", targetId: parentId });
}

export interface LayerSubtreeCopy {
  /** The duplicated root. */
  root: Layer;
  /** Every copied layer, root first. */
  layers: Layer[];
}

function copyItems(items: readonly MarkupItem[]): MarkupItem[] {
  const now = new Date().toISOString();
  return items.map((item) => ({
    ...item,
    id: makeId("item"),
    points: item.points.map((point) => ({ ...point })),
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * Duplicates a layer together with its whole subtree.
 *
 * Each copy gets a fresh ID once, and the parent links are remapped inside the
 * copy, so the result is a self-contained subtree and never points at the
 * source. The copies sit directly after the source subtree, and the duplicated
 * root becomes the active layer. This resolves F-086: duplicating a group no
 * longer produces a childless copy that looks like data loss.
 */
export function duplicateLayerSubtree(
  project: LayerProject & { activeLayerId?: string },
  layerId: string,
): LayerSubtreeCopy | null {
  const source = project.layers.find((layer) => layer.id === layerId);
  if (!source) return null;
  const hierarchy = buildLayerHierarchy(project.layers);
  const subtreeIds = [layerId, ...layerDescendantIds(hierarchy, layerId)];
  const idMap = new Map(subtreeIds.map((id) => [id, makeId("layer")]));
  const copies: Layer[] = [];
  for (const id of subtreeIds) {
    const original = project.layers.find((layer) => layer.id === id);
    if (!original) continue;
    const mappedParent =
      original.parentId && idMap.has(original.parentId)
        ? idMap.get(original.parentId)!
        : original.parentId;
    const copy: Layer = {
      ...original,
      id: idMap.get(id)!,
      name: id === layerId ? `${original.name} copy` : original.name,
      items: copyItems(original.items),
      pageState: original.pageState
        ? (JSON.parse(JSON.stringify(original.pageState)) as Layer["pageState"])
        : undefined,
    };
    if (mappedParent) copy.parentId = mappedParent;
    else delete copy.parentId;
    copies.push(copy);
  }
  if (!copies.length) return null;

  const subtree = new Set(subtreeIds);
  let insertion = -1;
  project.layers.forEach((layer, index) => {
    if (subtree.has(layer.id)) insertion = index;
  });
  project.layers = normalizeLayerOrder([
    ...project.layers.slice(0, insertion + 1),
    ...copies,
    ...project.layers.slice(insertion + 1),
  ]);
  if (project.activeLayerId !== undefined) project.activeLayerId = copies[0].id;
  return { root: copies[0], layers: copies };
}

/** How many layers and items a duplicated subtree would copy. */
export function layerSubtreeSize(
  project: LayerProject,
  layerId: string,
): { layers: number; items: number } {
  const hierarchy = buildLayerHierarchy(project.layers);
  const ids = new Set([layerId, ...layerDescendantIds(hierarchy, layerId)]);
  let items = 0;
  for (const layer of project.layers) {
    if (ids.has(layer.id)) items += layer.items.length;
  }
  return { layers: ids.size, items };
}

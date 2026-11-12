import type { Layer, PageId } from "./types";

/**
 * Pure layer-hierarchy rules shared by the model, the project-file normalizer,
 * the integrity validator and the layer-tree feature module.
 *
 * The hierarchy is an optional `parentId` on a layer. There is no separate group
 * entity, no separate order field and no adjacency requirement: sibling order is
 * the order of `project.layers`, and tree order is a depth-first walk over that
 * array. A flat project therefore has a tree order equal to its array order and
 * an effective state equal to each layer's own state. See ADR 0014.
 */

export type LayerHierarchyIssueCode =
  "missingLayerParent" | "layerParentCycle" | "layerParentKindMismatch";

export interface LayerHierarchyIssue {
  code: LayerHierarchyIssueCode;
  layerId: string;
}

export interface LayerHierarchy {
  readonly layers: readonly Layer[];
  readonly byId: ReadonlyMap<string, Layer>;
  /** Resolved parent, or `null` for a root. */
  readonly parentOfId: ReadonlyMap<string, string | null>;
  readonly childrenOfId: ReadonlyMap<string, readonly string[]>;
  readonly rootIds: readonly string[];
  /** Depth-first parent-then-children order. Equals array order when flat. */
  readonly treeOrderIds: readonly string[];
  readonly issues: readonly LayerHierarchyIssue[];
}

function rawParentId(layer: Layer): string | null {
  const value = layer.parentId;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function ownVisible(layer: Layer, pageId: PageId): boolean {
  return layer.pageState?.[pageId]?.visible ?? layer.visible;
}

function ownLocked(layer: Layer, pageId: PageId): boolean {
  return layer.pageState?.[pageId]?.locked ?? layer.locked;
}

/**
 * Resolves parents, cuts invalid links and walks the tree once.
 *
 * Invalid links are reported, never removed from the layer: the same layer keeps
 * its stored `parentId` so the validator, the load report and a later explicit
 * repair can all see the original value.
 */
export function buildLayerHierarchy(layers: readonly Layer[]): LayerHierarchy {
  const byId = new Map<string, Layer>();
  for (const layer of layers) {
    if (!byId.has(layer.id)) byId.set(layer.id, layer);
  }
  const issues: LayerHierarchyIssue[] = [];
  const parentOfId = new Map<string, string | null>();
  for (const layer of byId.values()) {
    const raw = rawParentId(layer);
    if (!raw) {
      parentOfId.set(layer.id, null);
      continue;
    }
    if (raw === layer.id) {
      issues.push({ code: "layerParentCycle", layerId: layer.id });
      parentOfId.set(layer.id, null);
      continue;
    }
    const parent = byId.get(raw);
    if (!parent) {
      issues.push({ code: "missingLayerParent", layerId: layer.id });
      parentOfId.set(layer.id, null);
      continue;
    }
    if (parent.kind !== layer.kind) {
      issues.push({ code: "layerParentKindMismatch", layerId: layer.id });
      parentOfId.set(layer.id, null);
      continue;
    }
    parentOfId.set(layer.id, raw);
  }

  // Cut every cycle at its first repeated layer. Each member becomes a root so
  // resolution always terminates and no layer is dropped.
  const settled = new Map<string, boolean>();
  for (const id of byId.keys()) {
    if (settled.has(id)) continue;
    const chain: string[] = [];
    const position = new Map<string, number>();
    let current: string | null = id;
    while (current && !settled.has(current)) {
      const seenAt = position.get(current);
      if (seenAt !== undefined) {
        for (const cycleId of chain.slice(seenAt)) {
          parentOfId.set(cycleId, null);
          settled.set(cycleId, true);
          issues.push({ code: "layerParentCycle", layerId: cycleId });
        }
        break;
      }
      position.set(current, chain.length);
      chain.push(current);
      current = parentOfId.get(current) ?? null;
      if (current === null) break;
    }
    for (const chainId of chain) {
      if (!settled.has(chainId)) settled.set(chainId, true);
    }
  }

  const childrenOfId = new Map<string, string[]>();
  for (const layer of byId.values()) childrenOfId.set(layer.id, []);
  const rootIds: string[] = [];
  for (const layer of byId.values()) {
    const parentId = parentOfId.get(layer.id) ?? null;
    if (parentId) childrenOfId.get(parentId)?.push(layer.id);
    else rootIds.push(layer.id);
  }

  const treeOrderIds: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string): void => {
    const stack = [id];
    while (stack.length) {
      const next = stack.pop()!;
      if (visited.has(next)) continue;
      visited.add(next);
      treeOrderIds.push(next);
      const children = childrenOfId.get(next) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        stack.push(children[index]);
      }
    }
  };
  for (const root of rootIds) visit(root);

  return {
    layers,
    byId,
    parentOfId,
    childrenOfId,
    rootIds,
    treeOrderIds,
    issues,
  };
}

/** Parent chain from the layer to its root. Cycle-safe. */
export function layerAncestorIds(hierarchy: LayerHierarchy, layerId: string): string[] {
  const ancestors: string[] = [];
  const seen = new Set<string>([layerId]);
  let current = hierarchy.parentOfId.get(layerId) ?? null;
  while (current && !seen.has(current)) {
    ancestors.push(current);
    seen.add(current);
    current = hierarchy.parentOfId.get(current) ?? null;
  }
  return ancestors;
}

/** Every descendant of a layer in tree order. Cycle-safe. */
export function layerDescendantIds(hierarchy: LayerHierarchy, layerId: string): string[] {
  const descendants: string[] = [];
  const seen = new Set<string>([layerId]);
  const stack = [...(hierarchy.childrenOfId.get(layerId) ?? [])].reverse();
  while (stack.length) {
    const next = stack.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    descendants.push(next);
    const children = hierarchy.childrenOfId.get(next) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
  }
  return descendants;
}

/** 0 for a root, 1 for its child and so on. Cycle-safe. */
export function layerTreeDepth(hierarchy: LayerHierarchy, layerId: string): number {
  return layerAncestorIds(hierarchy, layerId).length;
}

export function layerHasChildren(hierarchy: LayerHierarchy, layerId: string): boolean {
  return (hierarchy.childrenOfId.get(layerId) ?? []).length > 0;
}

export interface LayerEffectiveState {
  visible: boolean;
  locked: boolean;
  /** The nearest layer (self or ancestor) that hides this one. */
  hiddenBy: string | null;
  /** The nearest layer (self or ancestor) that locks this one. */
  lockedBy: string | null;
}

/**
 * Effective visibility and locking on one page.
 *
 * Visible = own state AND every ancestor. Locked = own state OR any ancestor.
 * With no hierarchy the walk is the layer itself, so flat behaviour is identical.
 */
export function layerEffectiveState(
  hierarchy: LayerHierarchy,
  layerId: string,
  pageId: PageId,
): LayerEffectiveState | null {
  const layer = hierarchy.byId.get(layerId);
  if (!layer) return null;
  const chain = [
    layer,
    ...layerAncestorIds(hierarchy, layerId).map((id) => hierarchy.byId.get(id)!),
  ];
  let visible = true;
  let locked = false;
  let hiddenBy: string | null = null;
  let lockedBy: string | null = null;
  for (const entry of chain) {
    if (visible && !ownVisible(entry, pageId)) {
      visible = false;
      hiddenBy = entry.id;
    }
    if (!locked && ownLocked(entry, pageId)) {
      locked = true;
      lockedBy = entry.id;
    }
  }
  return { visible, locked, hiddenBy, lockedBy };
}

/**
 * Layers to keep after a page-scoped reference change such as a page deletion.
 *
 * A layer is kept when it still has a page reference of its own, or when any
 * descendant is kept. A group therefore survives while its subtree is still in
 * use and is removed together with a subtree that has no references left.
 */
export function layerIdsKeptAfterPageRemoval(
  hierarchy: LayerHierarchy,
  referencedIds: ReadonlySet<string>,
): Set<string> {
  const kept = new Set<string>();
  const order = [...hierarchy.treeOrderIds].reverse();
  for (const id of order) {
    if (referencedIds.has(id)) {
      kept.add(id);
      continue;
    }
    const children = hierarchy.childrenOfId.get(id) ?? [];
    if (children.some((childId) => kept.has(childId))) kept.add(id);
  }
  return kept;
}

/** Issues keyed by layer, for the integrity validator. */
export function layerHierarchyIssues(layers: readonly Layer[]): LayerHierarchyIssue[] {
  return [...buildLayerHierarchy(layers).issues];
}

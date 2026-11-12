import {
  buildLayerHierarchy,
  layerEffectiveState,
  layerGlobalEffectiveState,
  layerTreeDepth,
  type LayerEffectiveState,
} from "../../model/layerHierarchy";
import { layerAppliesToPage } from "../../model/layers";
import type { Layer, PageId, Project } from "../../model/types";
import { layerTreeDisplayOrder } from "./model";

/**
 * Pure view model for the Layers panel tree.
 *
 * The panel needs a display order, an indent depth, a collapse decision, the
 * effective state for the current scope and the reason a row is inherited
 * hidden or locked. All of that is derived here so the renderer stays wiring and
 * the rules are testable without a DOM. See ADR 0014.
 */

export type LayerViewScope = "page" | "all";

export interface LayerTreeRow {
  id: string;
  layer: Layer;
  parentId: string | null;
  /** 0 for a root layer. */
  depth: number;
  /** Kept direct children, for the expand/collapse label. */
  childCount: number;
  /** Kept descendants, for the group count badge. */
  descendantCount: number;
  hasChildren: boolean;
  /** True when the row currently shows its children. */
  expanded: boolean;
  visible: boolean;
  locked: boolean;
  /**
   * The ancestor that hides or locks this row, when the row's own state does
   * not. Null when the row's own state is the reason, so the panel can tell its
   * own flag apart from an inherited one.
   */
  inheritedHiddenBy: string | null;
  inheritedLockedBy: string | null;
}

export interface LayerTreeRowsOptions {
  scope: LayerViewScope;
  pageId: PageId;
  /** Search text; empty matches every layer. */
  query?: string;
  /** Extra predicate, normally the layer-or-item search match. */
  matches?: (layer: Layer) => boolean;
  /** Layer rows the user has opened. */
  expanded: ReadonlySet<string>;
}

function keptIds(
  project: Pick<Project, "layers">,
  options: LayerTreeRowsOptions,
  hierarchy = buildLayerHierarchy(project.layers),
): Set<string> {
  const query = (options.query ?? "").trim().toLocaleLowerCase();
  const keep = new Set<string>();
  for (const layer of project.layers) {
    const applies = options.scope === "all" || layerAppliesToPage(layer, options.pageId);
    if (!applies) continue;
    if (query && options.matches && !options.matches(layer)) continue;
    keep.add(layer.id);
  }
  // A kept child keeps its whole ancestor path visible, so a group with page
  // items on this page never loses its children and a search hit shows its tree.
  for (const id of [...keep]) {
    let current = hierarchy.parentOfId.get(id) ?? null;
    const seen = new Set<string>([id]);
    while (current && !seen.has(current)) {
      seen.add(current);
      keep.add(current);
      current = hierarchy.parentOfId.get(current) ?? null;
    }
  }
  return keep;
}

/**
 * Rows the panel renders, in display order.
 *
 * A row is skipped when one of its ancestors is closed. With a search query the
 * ancestor path is forced open so every match is reachable; that is a search
 * behaviour and does not change the saved collapse state.
 */
export function buildLayerTreeRows(
  project: Pick<Project, "layers">,
  options: LayerTreeRowsOptions,
): LayerTreeRow[] {
  const hierarchy = buildLayerHierarchy(project.layers);
  const keep = keptIds(project, options, hierarchy);
  const searching = Boolean((options.query ?? "").trim());
  const display = layerTreeDisplayOrder(project, hierarchy);
  const rows: LayerTreeRow[] = [];
  const skipped = new Set<string>();

  const stateOf = (layerId: string): LayerEffectiveState | null =>
    options.scope === "page"
      ? layerEffectiveState(hierarchy, layerId, options.pageId)
      : layerGlobalEffectiveState(hierarchy, layerId);

  const descendantsOf = (layerId: string): number => {
    let total = 0;
    const stack = [...(hierarchy.childrenOfId.get(layerId) ?? [])];
    const seen = new Set<string>([layerId]);
    while (stack.length) {
      const next = stack.pop()!;
      if (seen.has(next) || !keep.has(next)) continue;
      seen.add(next);
      total += 1;
      stack.push(...(hierarchy.childrenOfId.get(next) ?? []));
    }
    return total;
  };

  for (const id of display) {
    const layer = hierarchy.byId.get(id);
    if (!layer || !keep.has(id) || skipped.has(id)) continue;
    const parentId = hierarchy.parentOfId.get(id) ?? null;
    if (parentId && skipped.has(parentId)) {
      skipped.add(id);
      continue;
    }
    const children = (hierarchy.childrenOfId.get(id) ?? []).filter((child) => keep.has(child));
    const isOpen = searching || options.expanded.has(id);
    if (children.length && !isOpen) {
      for (const child of children) skipped.add(child);
    }
    const state = stateOf(id);
    const ownVisible = state?.visible ?? true;
    const ownLocked = state?.locked ?? false;
    const hiddenBy = state?.hiddenBy ?? null;
    const lockedBy = state?.lockedBy ?? null;
    rows.push({
      id,
      layer,
      parentId,
      depth: layerTreeDepth(hierarchy, id),
      childCount: children.length,
      descendantCount: descendantsOf(id),
      hasChildren: children.length > 0,
      expanded: children.length > 0 && isOpen,
      visible: ownVisible,
      locked: ownLocked,
      inheritedHiddenBy: hiddenBy && hiddenBy !== id ? hiddenBy : null,
      inheritedLockedBy: lockedBy && lockedBy !== id ? lockedBy : null,
    });
  }
  return rows;
}

/** Ids of every kept row, for expand-all and collapse-all. */
export function layerRowsWithChildren(rows: readonly LayerTreeRow[]): string[] {
  return rows.filter((row) => row.hasChildren).map((row) => row.id);
}

/**
 * Ancestors that must be open for a layer to be visible, deepest first. The
 * controller expands these after a move so a nested layer never disappears
 * behind a closed group.
 */
export function layerAncestorRowIds(project: Pick<Project, "layers">, layerId: string): string[] {
  const hierarchy = buildLayerHierarchy(project.layers);
  const ancestors: string[] = [];
  const seen = new Set<string>([layerId]);
  let current = hierarchy.parentOfId.get(layerId) ?? null;
  while (current && !seen.has(current)) {
    seen.add(current);
    ancestors.push(current);
    current = hierarchy.parentOfId.get(current) ?? null;
  }
  return ancestors;
}

/**
 * Sibling ids of a layer in panel order, roots included. Used by the keyboard
 * moves so a layer never jumps across its own group by accident.
 */
export function layerSiblingIds(project: Pick<Project, "layers">, layerId: string): string[] {
  const hierarchy = buildLayerHierarchy(project.layers);
  const parentId = hierarchy.parentOfId.get(layerId) ?? null;
  const siblings = parentId ? (hierarchy.childrenOfId.get(parentId) ?? []) : hierarchy.rootIds;
  return [...siblings].reverse();
}

/**
 * Siblings as the panel shows them: the rendered rows of the same kind and
 * parent, in display order. Hidden layers of another page must not sit between
 * two visible rows, or a keyboard move could land nowhere on screen.
 */
export function layerRenderedSiblingIds(
  project: Pick<Project, "layers">,
  layerId: string,
  renderedIds: readonly string[],
): string[] {
  const hierarchy = buildLayerHierarchy(project.layers);
  const layer = hierarchy.byId.get(layerId);
  if (!layer) return [];
  const rendered = new Set(renderedIds);
  return layerSiblingIds(project, layerId).filter(
    (id) => rendered.has(id) && hierarchy.byId.get(id)?.kind === layer.kind,
  );
}

import { canonicalColor } from "../color";
import {
  moveLayer,
  removeLayer,
  setLayerLockedOnPage as applyLayerLockedOnPage,
  setLayerVisibleOnPage as applyLayerVisibleOnPage,
} from "../layers";
import type { Layer, PageId, Project } from "../types";

/**
 * Layer commands shared by the Layers panel and the layer row menu.
 *
 * Every function edits the project it is given and reports whether anything
 * changed, so the caller keeps the one `store.mutate(...)` wrapper and a
 * layer action stays one undo step. Pure model: no DOM, store, canvas or
 * feature module imports.
 */

function findLayer(project: Pick<Project, "layers">, layerId: string): Layer | undefined {
  return project.layers.find((layer) => layer.id === layerId);
}

/** Renames a layer. An empty or unchanged name is ignored. */
export function renameLayer(
  project: Pick<Project, "layers">,
  layerId: string,
  name: string,
): boolean {
  const layer = findLayer(project, layerId);
  if (!layer) return false;
  const next = name.trim();
  if (!next || next === layer.name) return false;
  layer.name = next;
  return true;
}

/**
 * Applies one colour to the layer and every item on it, which is what the
 * Layers panel swatch promises. An invalid colour is rejected rather than
 * stored, so a bad input can never render or export as black.
 */
export function setLayerColor(
  project: Pick<Project, "layers">,
  layerId: string,
  color: string,
): boolean {
  const layer = findLayer(project, layerId);
  const next = canonicalColor(color);
  if (!layer || !next) return false;
  layer.color = next;
  for (const item of layer.items) item.color = next;
  return true;
}

/** Sets the layer opacity, clamped to the 0–1 range used by the project file. */
export function setLayerOpacity(
  project: Pick<Project, "layers">,
  layerId: string,
  opacity: number,
): boolean {
  const layer = findLayer(project, layerId);
  if (!layer || !Number.isFinite(opacity)) return false;
  layer.opacity = Math.max(0, Math.min(1, opacity));
  return true;
}

/**
 * Sets the layer's own visibility on one page. Ancestor visibility is not
 * touched: effective visibility still resolves through the hierarchy.
 */
export function setLayerVisibleOnPage(
  project: Pick<Project, "layers">,
  layerId: string,
  pageId: PageId,
  visible: boolean,
): boolean {
  const layer = findLayer(project, layerId);
  if (!layer) return false;
  applyLayerVisibleOnPage(layer, pageId, visible);
  return true;
}

/** Sets the layer's own locking on one page; ancestor locking still applies. */
export function setLayerLockedOnPage(
  project: Pick<Project, "layers">,
  layerId: string,
  pageId: PageId,
  locked: boolean,
): boolean {
  const layer = findLayer(project, layerId);
  if (!layer) return false;
  applyLayerLockedOnPage(layer, pageId, locked);
  return true;
}

/** Sets page visibility for every selected layer in one project edit. */
export function setLayersVisibleOnPage(
  project: Pick<Project, "layers">,
  layerIds: readonly string[],
  pageId: PageId,
  visible: boolean,
): number {
  let changed = 0;
  for (const layerId of layerIds) {
    if (setLayerVisibleOnPage(project, layerId, pageId, visible)) changed += 1;
  }
  return changed;
}

/** Sets page locking for every selected layer in one project edit. */
export function setLayersLockedOnPage(
  project: Pick<Project, "layers">,
  layerIds: readonly string[],
  pageId: PageId,
  locked: boolean,
): number {
  let changed = 0;
  for (const layerId of layerIds) {
    if (setLayerLockedOnPage(project, layerId, pageId, locked)) changed += 1;
  }
  return changed;
}

/** Removes the layer's items on one page and leaves every other page intact. */
export function clearLayerItemsOnPage(
  project: Pick<Project, "layers">,
  layerId: string,
  pageId: PageId,
): number {
  const layer = findLayer(project, layerId);
  if (!layer) return 0;
  const before = layer.items.length;
  layer.items = layer.items.filter((item) => item.pageId !== pageId);
  return before - layer.items.length;
}

/**
 * Moves a layer one place within its kind. Drawing and measurement layers stay
 * separate, so the move never crosses the kind boundary.
 */
export function moveLayerWithinKind(project: Project, layerId: string, direction: -1 | 1): boolean {
  return moveLayer(project, layerId, direction);
}

/**
 * Deletes a layer and its whole subtree. The caller confirms the cascade from
 * `planLayerDeletion`; this command only performs the deterministic removal.
 */
export function deleteLayer(
  project: Pick<Project, "layers" | "activeLayerId">,
  layerId: string,
): boolean {
  return removeLayer(project, layerId);
}

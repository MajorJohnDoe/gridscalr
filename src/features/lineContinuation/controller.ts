import { buildLayerHierarchy } from "../../model/layerHierarchy";
import { findItem } from "../../model/layers";
import type { PageId, Point } from "../../model/types";
import { store } from "../../state/store";
import {
  canContinuePolyline,
  continuePolyline,
  polylineEndpoint,
  type PolylineContinuationTarget,
} from "./model";

export interface ContinuationStart {
  target: PolylineContinuationTarget;
  /** Page-space vertex the continuation draft starts from. */
  point: Point;
}

/**
 * Validates one continuation request against the current project and page.
 * The caller turns the result into a polyline draft; nothing is mutated here.
 */
export function startContinuation(
  layerId: string,
  itemId: string,
  vertexIndex: number,
  pageId: PageId | null,
): ContinuationStart | null {
  const project = store.project;
  if (!project || store.readOnly) return null;
  const found = findItem(project, itemId);
  if (!found || found.layer.id !== layerId || found.item.pageId !== pageId) return null;
  const hierarchy = buildLayerHierarchy(project.layers);
  if (!canContinuePolyline(found.item, found.layer, hierarchy)) return null;
  const point = polylineEndpoint(found.item, vertexIndex);
  if (!point) return null;
  return { target: { layerId, itemId, vertexIndex }, point };
}

/**
 * Appends the drafted page-space points to the existing item in one store
 * mutation, so the whole continuation is one undo step. The item/layer guards
 * are re-checked against the live project and no new item is created.
 */
export function appendContinuedPolyline(
  target: PolylineContinuationTarget,
  pagePoints: Point[],
): boolean {
  const project = store.project;
  if (!project || store.readOnly || pagePoints.length < 2) return false;
  const found = findItem(project, target.itemId);
  if (!found || found.layer.id !== target.layerId) return false;
  const hierarchy = buildLayerHierarchy(project.layers);
  if (!canContinuePolyline(found.item, found.layer, hierarchy)) return false;

  let changed = false;
  store.mutate((current) => {
    changed = continuePolyline(current, target, pagePoints);
  }, "change");
  return changed;
}

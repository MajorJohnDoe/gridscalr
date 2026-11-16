import { buildLayerHierarchy } from "../../../model/layerHierarchy";
import { findItem, itemIsLocked } from "../../../model/layers";
import type { Project, SelectionRef } from "../../../model/types";
import type { SpaceProblemCode } from "./mutations";

/**
 * Measurement links. A link is one field on the measurement (`spaceId`), so a
 * link is also a move: linking into another space replaces the previous one.
 * Every function changes the project in place and leaves the store mutation,
 * and therefore the undo step, to the caller.
 */

export interface LinkResult {
  linked: boolean;
  problem?: SpaceProblemCode;
}

/** The reason a measurement cannot be linked, or null when it can be. */
export function linkProblem(
  project: Project,
  spaceId: string,
  ref: SelectionRef,
): SpaceProblemCode | null {
  if (!project.spaces.some((space) => space.id === spaceId)) return "spaceNotFound";
  const found = findItem(project, ref.itemId);
  if (!found || found.layer.id !== ref.layerId) return "measurementNotFound";
  if (found.item.kind !== "area") return "measurementNotArea";
  const hierarchy = buildLayerHierarchy(project.layers);
  if (itemIsLocked(found.item, found.layer, hierarchy)) return "measurementLocked";
  return null;
}

/** Links one area measurement to a space. A locked item is refused. */
export function linkMeasurement(
  project: Project,
  spaceId: string,
  ref: SelectionRef,
  now: string = new Date().toISOString(),
): LinkResult {
  const problem = linkProblem(project, spaceId, ref);
  if (problem) return { linked: false, problem };
  const found = findItem(project, ref.itemId);
  if (!found) return { linked: false, problem: "measurementNotFound" };
  found.item.spaceId = spaceId;
  found.item.updatedAt = now;
  return { linked: true };
}

/** Clears a measurement link; the measurement itself is untouched. */
export function unlinkMeasurement(
  project: Project,
  ref: SelectionRef,
  now: string = new Date().toISOString(),
): boolean {
  const found = findItem(project, ref.itemId);
  if (!found || found.layer.id !== ref.layerId || !found.item.spaceId) return false;
  delete found.item.spaceId;
  found.item.updatedAt = now;
  return true;
}

export interface LinkManyResult {
  linked: number;
  problems: SpaceProblemCode[];
}

/** Links several selected measurements in one caller-owned mutation. */
export function linkMeasurements(
  project: Project,
  spaceId: string,
  refs: readonly SelectionRef[],
  now: string = new Date().toISOString(),
): LinkManyResult {
  const result: LinkManyResult = { linked: 0, problems: [] };
  for (const ref of refs) {
    const outcome = linkMeasurement(project, spaceId, ref, now);
    if (outcome.linked) result.linked += 1;
    else if (outcome.problem && !result.problems.includes(outcome.problem)) {
      result.problems.push(outcome.problem);
    }
  }
  return result;
}

/** The selected measurements that can be linked: existing area measurements. */
export function linkableSelection(
  project: Project,
  selection: readonly SelectionRef[],
): SelectionRef[] {
  return selection.filter((ref) => {
    const found = findItem(project, ref.itemId);
    return Boolean(found && found.layer.id === ref.layerId && found.item.kind === "area");
  });
}

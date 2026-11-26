import { normalizeRoom } from "../categories";
import { isMeasurementKind } from "../layers";
import type { AreaMode, CountType, Project, SelectionRef } from "../types";
import { applyItemCommand, emptyResult, type ItemCommandResult } from "./shared";

/** Assigns a measurement to a project room; an empty value clears the room. */
export function setItemRoom(
  project: Project,
  refs: SelectionRef[],
  room: string | undefined,
): ItemCommandResult {
  const next = normalizeRoom(room ?? "");
  return applyItemCommand(project, refs, (item) => {
    if (!isMeasurementKind(item.kind)) return false;
    if (next) item.room = next;
    else delete item.room;
    return true;
  });
}

/**
 * Assigns a measurement to an existing project category. A stale category id is
 * ignored rather than stored, so the project never gains a dangling reference.
 */
export function setItemCategory(
  project: Project,
  refs: SelectionRef[],
  categoryId: string,
): ItemCommandResult {
  if (!project.categories.some((category) => category.id === categoryId)) {
    return emptyResult();
  }
  return applyItemCommand(project, refs, (item) => {
    if (!isMeasurementKind(item.kind)) return false;
    item.categoryId = categoryId;
    return true;
  });
}

/** Chooses whether an area measurement adds to or deducts from the room area. */
export function setItemAreaMode(
  project: Project,
  refs: SelectionRef[],
  mode: AreaMode,
): ItemCommandResult {
  return applyItemCommand(project, refs, (item) => {
    if (item.kind !== "area") return false;
    item.areaMode = mode;
    return true;
  });
}

/** Assigns a count object to an existing project count type. */
export function setItemCountType(
  project: Project,
  refs: SelectionRef[],
  countType: CountType,
): ItemCommandResult {
  if (!project.countTypes.some((type) => type.id === countType)) {
    return emptyResult();
  }
  return applyItemCommand(project, refs, (item) => {
    if (item.kind !== "count") return false;
    item.countType = countType;
    return true;
  });
}

/**
 * Sets how many pieces one count object represents. A quantity of one is the
 * default and is stored as an omitted field.
 */
export function setItemCountQuantity(
  project: Project,
  refs: SelectionRef[],
  quantity: number,
): ItemCommandResult {
  if (!Number.isFinite(quantity)) return emptyResult();
  const pieces = Math.max(1, Math.min(100000, Math.round(quantity)));
  return applyItemCommand(project, refs, (item) => {
    if (item.kind !== "count") return false;
    if (pieces > 1) item.countQuantity = pieces;
    else delete item.countQuantity;
    return true;
  });
}

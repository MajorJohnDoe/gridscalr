import { normalizeRoom } from "./categories";
import { isMeasurementKind, itemIsLocked } from "./layers";
import { resolveSelection } from "./selection";
import type { AreaMode, CountType, Project, SelectionRef } from "./types";

/** Fields that can be changed together on a measurement selection. */
export interface MeasurementBulkPatch {
  categoryId?: string;
  /** Omit to leave rooms unchanged. An empty string or null clears the room. */
  room?: string | null;
  /** Only applied to area measurements. */
  areaMode?: AreaMode;
  /** Only applied to count measurements. */
  countType?: CountType;
}

export interface MeasurementBulkResult {
  updated: number;
  skippedLocked: number;
  skippedNonMeasurement: number;
}

/**
 * Applies one bulk measurement edit. Call this inside a single store mutation
 * so the whole selection becomes one undo step, even across layers.
 */
export function applyMeasurementBulkEdit(
  project: Project,
  refs: readonly SelectionRef[],
  patch: MeasurementBulkPatch,
): MeasurementBulkResult {
  const result: MeasurementBulkResult = {
    updated: 0,
    skippedLocked: 0,
    skippedNonMeasurement: 0,
  };
  for (const entry of resolveSelection(project, [...refs])) {
    if (!isMeasurementKind(entry.item.kind)) {
      result.skippedNonMeasurement += 1;
      continue;
    }
    if (itemIsLocked(entry.item, entry.layer)) {
      result.skippedLocked += 1;
      continue;
    }
    let changed = false;
    if (patch.categoryId !== undefined) {
      entry.item.categoryId = patch.categoryId;
      changed = true;
    }
    if (patch.room !== undefined) {
      const room = normalizeRoom(patch.room ?? "");
      if (room) entry.item.room = room;
      else delete entry.item.room;
      changed = true;
    }
    if (patch.areaMode !== undefined && entry.item.kind === "area") {
      entry.item.areaMode = patch.areaMode;
      changed = true;
    }
    if (patch.countType !== undefined && entry.item.kind === "count") {
      entry.item.countType = patch.countType;
      changed = true;
    }
    if (changed) {
      entry.item.updatedAt = new Date().toISOString();
      result.updated += 1;
    }
  }
  return result;
}

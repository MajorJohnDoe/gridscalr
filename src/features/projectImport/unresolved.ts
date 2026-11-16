import type { MarkupItem, Project } from "../../model/types";
import type { PreparedProjectImport } from "./model";

/**
 * Schema 28 references copied by page import that do not resolve in the
 * destination. The import never merges or remaps the registers; it only
 * reports the counts, and the optional clear step removes them from the
 * imported copies. The source project is never touched.
 */
export interface ImportUnresolvedCounts {
  /** Imported items whose `spaceId` has no destination space. */
  spaces: number;
  /** Imported placements whose `scheduleId` has no destination schedule. */
  schedules: number;
  /** Imported custom values whose field has no destination definition. */
  customValues: number;
}

export function emptyImportUnresolvedCounts(): ImportUnresolvedCounts {
  return { spaces: 0, schedules: 0, customValues: 0 };
}

export function hasUnresolvedImport(counts: ImportUnresolvedCounts): boolean {
  return counts.spaces > 0 || counts.schedules > 0 || counts.customValues > 0;
}

interface DestinationReferences {
  spaceIds: ReadonlySet<string>;
  scheduleIds: ReadonlySet<string>;
  fieldIds: ReadonlySet<string>;
}

/** The destination register identifiers a copied item may resolve against. */
function destinationReferences(destination: Project): DestinationReferences {
  return {
    spaceIds: new Set(destination.spaces.map((space) => space.id)),
    scheduleIds: new Set(destination.schedules.map((schedule) => schedule.id)),
    fieldIds: new Set(
      destination.fieldDefinitions
        .filter((field) => field.scope === "measurement")
        .map((field) => field.id),
    ),
  };
}

/** Counts the copied references that will not resolve after the commit. */
export function unresolvedImportReferences(
  prepared: PreparedProjectImport,
  destination: Project,
): ImportUnresolvedCounts {
  const refs = destinationReferences(destination);
  const counts = emptyImportUnresolvedCounts();
  for (const layer of prepared.createdLayers) {
    for (const item of layer.items) {
      if (item.spaceId && !refs.spaceIds.has(item.spaceId)) counts.spaces += 1;
      if (
        item.kind === "schedule" &&
        (!item.scheduleId || !refs.scheduleIds.has(item.scheduleId))
      ) {
        counts.schedules += 1;
      }
      if (item.custom) {
        for (const fieldId of Object.keys(item.custom)) {
          if (!refs.fieldIds.has(fieldId)) counts.customValues += 1;
        }
      }
    }
  }
  return counts;
}

/**
 * Removes only the unresolvable references from the prepared copies. A space
 * link is cleared, a custom value is dropped, and a placement whose schedule
 * does not exist is removed entirely because a table without a definition
 * cannot be repaired in place. The counts are returned for the commit report.
 */
export function clearUnresolvedImportReferences(
  prepared: PreparedProjectImport,
  destination: Project,
): ImportUnresolvedCounts {
  const refs = destinationReferences(destination);
  const counts = emptyImportUnresolvedCounts();
  for (const layer of prepared.createdLayers) {
    const kept: MarkupItem[] = [];
    for (const item of layer.items) {
      // Count every unresolved reference before a placement is removed, so the
      // cleared counts always match the preflight counts.
      if (item.spaceId && !refs.spaceIds.has(item.spaceId)) {
        delete item.spaceId;
        counts.spaces += 1;
      }
      if (item.custom) {
        for (const fieldId of Object.keys(item.custom)) {
          if (!refs.fieldIds.has(fieldId)) {
            delete item.custom[fieldId];
            counts.customValues += 1;
          }
        }
        if (!Object.keys(item.custom).length) delete item.custom;
      }
      if (
        item.kind === "schedule" &&
        (!item.scheduleId || !refs.scheduleIds.has(item.scheduleId))
      ) {
        counts.schedules += 1;
        continue;
      }
      kept.push(item);
    }
    layer.items = kept;
  }
  return counts;
}

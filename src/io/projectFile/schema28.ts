import { defaultSummarySettings } from "../../model/summary";

/**
 * Schema 27 → 28 migration.
 *
 * A pre-28 file did not have custom fields, spaces, schedules or summary
 * settings. The migration adds the empty arrays and the default cards, and it
 * ignores any field that only schema 28 defines, because the version it names
 * did not exist yet. It never creates a space from an existing `room` string,
 * never assigns a `summaryRole` and never moves data.
 */

export interface Schema28MigrationResult {
  /** Schedule placements found in pre-28 data; they could not exist yet. */
  droppedSchedulePlacements: number;
}

function entries(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null,
  );
}

export function migrateToSchema28(
  raw: Record<string, unknown>,
  schemaVersion: number,
): Schema28MigrationResult {
  if (schemaVersion >= 28) return { droppedSchedulePlacements: 0 };

  let droppedSchedulePlacements = 0;
  raw.fieldDefinitions = [];
  raw.fieldSets = [];
  raw.spaces = [];
  raw.schedules = [];

  const settings =
    typeof raw.settings === "object" && raw.settings !== null
      ? (raw.settings as Record<string, unknown>)
      : {};
  settings.summary = defaultSummarySettings();
  raw.settings = settings;

  for (const category of entries(raw.categories)) delete category.summaryRole;
  for (const countType of entries(raw.countTypes)) delete countType.summaryRole;

  for (const layer of entries(raw.layers)) {
    if (!Array.isArray(layer.items)) continue;
    const kept: unknown[] = [];
    for (const item of layer.items) {
      if (typeof item !== "object" || item === null) {
        kept.push(item);
        continue;
      }
      const record = item as Record<string, unknown>;
      if (record.kind === "schedule") {
        droppedSchedulePlacements += 1;
        continue;
      }
      delete record.spaceId;
      delete record.custom;
      delete record.scheduleId;
      delete record.rowStart;
      delete record.rowLimit;
      delete record.showHeader;
      delete record.showTotals;
      kept.push(item);
    }
    layer.items = kept;
  }

  return { droppedSchedulePlacements };
}

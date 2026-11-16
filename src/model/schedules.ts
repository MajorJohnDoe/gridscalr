import { CUSTOM_FIELD_PREFIX } from "./fields";
import type {
  FieldDefinition,
  ScheduleDefinition,
  ScheduleFieldRef,
  ScheduleRowMode,
  ScheduleSource,
} from "./types";

/**
 * Pure schedule rules. A schedule stores a source, columns, filters, grouping,
 * sorting and totals; rows are computed from project data when they are needed.
 * Built-in field keys are code-level names, not persisted entity ids.
 */

export const SCHEDULE_SOURCES: readonly ScheduleSource[] = ["measurements", "spaces"];
export const SCHEDULE_ROW_MODES: readonly ScheduleRowMode[] = ["items", "grouped"];

export const MEASUREMENT_SCHEDULE_FIELDS: readonly ScheduleFieldRef[] = [
  "id",
  "kind",
  "label",
  "page",
  "layer",
  "category",
  "room",
  "space",
  "value",
  "unit",
  "countType",
  "countQuantity",
  "status",
  "tag",
  "created",
  "modified",
  "visible",
  "locked",
];

export const SPACE_SCHEDULE_FIELDS: readonly ScheduleFieldRef[] = [
  "id",
  "kind",
  "number",
  "name",
  "floor",
  "usage",
  "status",
  "area",
  "areaSource",
  "parent",
  "page",
  "created",
  "modified",
];

export function isScheduleSource(value: unknown): value is ScheduleSource {
  return typeof value === "string" && (SCHEDULE_SOURCES as readonly string[]).includes(value);
}

export function isScheduleRowMode(value: unknown): value is ScheduleRowMode {
  return typeof value === "string" && (SCHEDULE_ROW_MODES as readonly string[]).includes(value);
}

export function builtInScheduleFields(source: ScheduleSource): readonly ScheduleFieldRef[] {
  return source === "spaces" ? SPACE_SCHEDULE_FIELDS : MEASUREMENT_SCHEDULE_FIELDS;
}

export function isCustomFieldRef(value: string): boolean {
  return value.startsWith(CUSTOM_FIELD_PREFIX) && value.length > CUSTOM_FIELD_PREFIX.length;
}

/** The field id named by a `custom:<fieldId>` reference, or null. */
export function customFieldIdForRef(value: string): string | null {
  return isCustomFieldRef(value) ? value.slice(CUSTOM_FIELD_PREFIX.length) : null;
}

/**
 * Whether a column, group, sort or total field resolves for a schedule source.
 * A custom reference must name a field in the matching scope.
 */
export function scheduleFieldRefResolves(
  ref: string,
  source: ScheduleSource,
  fields: readonly Pick<FieldDefinition, "id" | "scope">[],
): boolean {
  if (!ref) return false;
  const customId = customFieldIdForRef(ref);
  if (customId) {
    const scope = source === "spaces" ? "space" : "measurement";
    return fields.some((field) => field.id === customId && field.scope === scope);
  }
  return (builtInScheduleFields(source) as readonly string[]).includes(ref);
}

/** Field refs used anywhere by a definition, in stable order. */
export function scheduleFieldRefs(definition: ScheduleDefinition): string[] {
  const refs = new Set<string>();
  for (const column of definition.columns) refs.add(column.field);
  if (definition.groupBy) refs.add(definition.groupBy);
  for (const sort of definition.sort ?? []) refs.add(sort.field);
  for (const total of definition.totals ?? []) refs.add(total.field);
  return [...refs];
}

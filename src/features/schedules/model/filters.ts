import { categoryForItem } from "../../../model/categories";
import { itemIsVisible } from "../../../model/layers";
import type { LayerHierarchy } from "../../../model/layerHierarchy";
import type {
  CustomValue,
  FieldDefinition,
  Layer,
  MarkupItem,
  Project,
  ScheduleCustomFilter,
  ScheduleFilter,
  Space,
} from "../../../model/types";
import { customValueText } from "../../fields";

/**
 * Pure filter matching for both schedule sources. Visibility is the caller's
 * first rule: a hidden item or layer never reaches this function, while a
 * locked item does.
 */

export interface ScheduleFilterContext {
  project: Project;
  fieldById: ReadonlyMap<string, FieldDefinition>;
  spaceById: ReadonlyMap<string, Space>;
}

export function scheduleFilterContext(project: Project): ScheduleFilterContext {
  return {
    project,
    fieldById: new Map(project.fieldDefinitions.map((field) => [field.id, field])),
    spaceById: new Map(project.spaces.map((space) => [space.id, space])),
  };
}

function customEmpty(value: CustomValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function sameText(
  field: FieldDefinition | undefined,
  left: CustomValue | undefined,
  right: CustomValue | undefined,
): boolean {
  if (!field) return false;
  const leftText = customValueText(field, left).trim().toLocaleLowerCase();
  const rightText = customValueText(field, right).trim().toLocaleLowerCase();
  if (!rightText) return !leftText;
  if (Array.isArray(left)) {
    return left.some(
      (entry) => customValueText(field, entry).trim().toLocaleLowerCase() === rightText,
    );
  }
  return leftText === rightText;
}

function customFilterMatches(
  context: ScheduleFilterContext,
  scope: "measurement" | "space",
  filter: ScheduleCustomFilter,
  value: CustomValue | undefined,
): boolean {
  const field = context.fieldById.get(filter.fieldId);
  // An unresolved field filter can never match; the builder and validator name it.
  if (!field || field.scope !== scope) return false;
  switch (filter.op) {
    case "empty":
      return customEmpty(value);
    case "notEmpty":
      return !customEmpty(value);
    case "contains": {
      const needle = customValueText(field, filter.value).trim().toLocaleLowerCase();
      if (!needle) return true;
      return customValueText(field, value).toLocaleLowerCase().includes(needle);
    }
    case "eq":
      return sameText(field, value, filter.value);
  }
}

function customFiltersMatch(
  context: ScheduleFilterContext,
  scope: "measurement" | "space",
  filters: readonly ScheduleCustomFilter[] | undefined,
  values: Readonly<Record<string, CustomValue>> | undefined,
): boolean {
  for (const filter of filters ?? []) {
    if (!customFilterMatches(context, scope, filter, values?.[filter.fieldId])) return false;
  }
  return true;
}

/** All definition filters plus the panel's extra filter must hold. */
export function itemMatchesFilters(
  item: MarkupItem,
  layer: Layer,
  hierarchy: LayerHierarchy,
  context: ScheduleFilterContext,
  filters: readonly (ScheduleFilter | undefined)[],
): boolean {
  if (!itemIsVisible(item, layer, hierarchy)) return false;
  for (const filter of filters) {
    if (!filter) continue;
    if (filter.pageIds?.length && !filter.pageIds.includes(item.pageId)) return false;
    if (filter.categoryIds?.length) {
      const category = categoryForItem(context.project, item);
      if (!category || !filter.categoryIds.includes(category.id)) return false;
    }
    if (filter.countTypes?.length) {
      if (item.kind !== "count") return false;
      if (!filter.countTypes.includes(item.countType ?? "other")) return false;
    }
    if (filter.spaceIds?.length && !filter.spaceIds.includes(item.spaceId ?? "")) return false;
    if (filter.itemKinds?.length && !filter.itemKinds.includes(item.kind)) return false;
    if (!customFiltersMatch(context, "measurement", filter.custom, item.custom)) {
      return false;
    }
  }
  return true;
}

/**
 * Space rows have no visibility or item flags. Category, count type and item
 * kind filters do not apply to a space and are reported as inapplicable by the
 * builder instead of silently emptying the table.
 */
export function spaceMatchesFilters(
  space: Space,
  context: ScheduleFilterContext,
  filters: readonly (ScheduleFilter | undefined)[],
): boolean {
  for (const filter of filters) {
    if (!filter) continue;
    if (filter.pageIds?.length && !filter.pageIds.includes(space.pageId ?? "")) return false;
    if (filter.spaceIds?.length && !filter.spaceIds.includes(space.id)) return false;
    if (!customFiltersMatch(context, "space", filter.custom, space.custom)) return false;
  }
  return true;
}

/** Stable cache signature for a panel-level filter. */
export function filterSignature(filter: ScheduleFilter | undefined): string {
  if (!filter) return "";
  const list = (values?: readonly string[]) => [...(values ?? [])].sort().join(",");
  const custom = [...(filter.custom ?? [])]
    .map((entry) => `${entry.fieldId}:${entry.op}:${JSON.stringify(entry.value ?? null)}`)
    .sort()
    .join(",");
  return [
    list(filter.pageIds),
    list(filter.categoryIds),
    list(filter.countTypes),
    list(filter.spaceIds),
    list(filter.itemKinds),
    custom,
  ].join("|");
}

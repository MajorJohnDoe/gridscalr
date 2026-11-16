import { formatNumber } from "../../../i18n/format";
import { areaShapeOf, areaValue } from "../../../model/area";
import { categoryForItem } from "../../../model/categories";
import { countQuantityOf, countTypeLabel } from "../../../model/countTypes";
import { formatTimestamp } from "../../../model/dates";
import { itemIsLocked, isMeasurementKind } from "../../../model/layers";
import { buildLayerHierarchy } from "../../../model/layerHierarchy";
import { itemKindLabel, itemLabel, itemMetrics } from "../../../model/measure";
import { inspectionStatusLabel } from "../../../model/symbols";
import { areaInUnit, lengthInUnit } from "../../../model/units";
import { pageNumber } from "../../../model/pages";
import type {
  MarkupItem,
  Project,
  ScheduleDefinition,
  ScheduleFieldRef,
  ScheduleFilter,
} from "../../../model/types";
import { t } from "../../../i18n";
import { customFieldIdForRef } from "../../../model/schedules";
import { customValueText } from "../../fields";
import type { FieldDefinition } from "../../../model/types";
import { scheduleFilterContext, itemMatchesFilters } from "../model/filters";
import { scheduleRefs } from "../model/fields";
import type { ScheduleCell, ScheduleRow } from "../model/types";

/**
 * The measurement source: one row per visible item, reusing `itemMetrics`, the
 * category fallback and the count-quantity rule. Hidden items and hidden layers
 * never reach a row; locked items do. A symbol or a drawing appears with an
 * empty value and unit because neither has a quantity.
 */

interface ItemContext {
  project: Project;
  item: MarkupItem;
  layerName: string;
  metrics: ReturnType<typeof itemMetrics>;
  categoryName: string;
  spaceName: string;
  locked: boolean;
  fields: ReadonlyMap<string, FieldDefinition>;
}

function displayValue(context: ItemContext): { text: string; value: number | null } {
  const { project, item, metrics } = context;
  if (!metrics) return { text: "", value: null };
  const scale = metrics.scale;
  const ppm = scale?.pointsPerMeter ?? 0;
  if (
    item.kind === "length" ||
    item.kind === "radius" ||
    item.kind === "diameter" ||
    item.kind === "arc"
  ) {
    const value = scale ? lengthInUnit(metrics.rawPoints, ppm, project.settings.lengthUnit) : null;
    return { text: metrics.primary, value };
  }
  if (item.kind === "area") {
    const value = scale
      ? areaInUnit(areaValue(item.points, areaShapeOf(item)), ppm, project.settings.areaUnit)
      : null;
    const subtract = item.areaMode === "subtract";
    return {
      text: subtract ? `${t("schedules.value.subtractPrefix")}${metrics.primary}` : metrics.primary,
      value: value === null ? null : subtract ? -value : value,
    };
  }
  if (item.kind === "count") {
    return { text: metrics.primary, value: countQuantityOf(item) };
  }
  if (item.kind === "angle" || item.kind === "slope") {
    return { text: metrics.primary, value: metrics.rawPoints };
  }
  if (item.kind === "volume") {
    return { text: metrics.primary, value: scale ? metrics.rawPoints : null };
  }
  return { text: metrics.primary, value: null };
}

function textCell(text: string): ScheduleCell {
  return { text, value: null, invalid: false };
}

function cellFor(context: ItemContext, ref: ScheduleFieldRef): ScheduleCell {
  const { project, item, metrics } = context;
  const customId = customFieldIdForRef(ref);
  if (customId) {
    const field = context.fields.get(customId);
    if (!field || field.scope !== "measurement") return { text: "", value: null, invalid: true };
    const value = item.custom?.[customId];
    return {
      text: customValueText(field, value),
      value: typeof value === "number" ? value : null,
      invalid: false,
    };
  }
  switch (ref) {
    case "id":
      return textCell(item.id);
    case "kind":
      return textCell(itemKindLabel(item.kind));
    case "label":
      return textCell(itemLabel(item, project));
    case "page":
      return textCell(String(pageNumber(project, item.pageId)));
    case "layer":
      return textCell(context.layerName);
    case "category":
      return textCell(context.categoryName);
    case "room":
      return textCell(item.room ?? "");
    case "space":
      return textCell(context.spaceName);
    case "value": {
      const value = displayValue(context);
      return { text: value.text, value: value.value, invalid: false };
    }
    case "unit":
      return textCell(metrics?.unit ?? "");
    case "countType":
      return textCell(item.kind === "count" ? countTypeLabel(project, item.countType) : "");
    case "countQuantity":
      return item.kind === "count"
        ? {
            text: formatNumber(countQuantityOf(item), 0),
            value: countQuantityOf(item),
            invalid: false,
          }
        : textCell("");
    case "status":
      return textCell(item.kind === "symbol" ? inspectionStatusLabel(item.status) : "");
    case "tag":
      return textCell(item.tag ?? "");
    case "created":
      return textCell(formatTimestamp(item.createdAt));
    case "modified":
      return textCell(formatTimestamp(item.updatedAt));
    case "visible":
      return textCell(t("common.yes"));
    case "locked":
      return textCell(context.locked ? t("common.yes") : t("common.no"));
    default:
      return { text: "", value: null, invalid: true };
  }
}

export function measurementRows(
  project: Project,
  definition: ScheduleDefinition,
  extra?: ScheduleFilter,
): ScheduleRow[] {
  const hierarchy = buildLayerHierarchy(project.layers);
  const context = scheduleFilterContext(project);
  const refs = scheduleRefs(definition);
  const rows: ScheduleRow[] = [];
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (!itemMatchesFilters(item, layer, hierarchy, context, [definition.filters, extra])) {
        continue;
      }
      const category = isMeasurementKind(item.kind) ? categoryForItem(project, item) : undefined;
      const itemContext: ItemContext = {
        project,
        item,
        layerName: layer.name,
        metrics: itemMetrics(item, project),
        categoryName: category?.name ?? "",
        spaceName: item.spaceId ? (context.spaceById.get(item.spaceId)?.name ?? "") : "",
        locked: itemIsLocked(item, layer, hierarchy),
        fields: context.fieldById,
      };
      const values: Record<string, ScheduleCell> = {};
      for (const ref of refs) values[ref] = cellFor(itemContext, ref);
      rows.push({
        rowId: `measurement:${item.id}`,
        entityId: item.id,
        pageId: item.pageId,
        layerId: layer.id,
        cells: [],
        values,
        groupPath: [],
      });
    }
  }
  return rows;
}

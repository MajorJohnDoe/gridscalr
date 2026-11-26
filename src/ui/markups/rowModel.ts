import { matchesFilterText, normalizeFilterQuery } from "../../model/textFilter";
import { t } from "../../i18n";
import { categoryForItem } from "../../model/categories";
import { countTypeLabel } from "../../model/countTypes";
import { formatTimestamp, timestampValue } from "../../model/dates";
import { buildLayerHierarchy, type LayerHierarchy } from "../../model/layerHierarchy";
import { isMeasurementKind, itemIsLocked, itemIsVisible } from "../../model/layers";
import type { MarkupsViewSettings } from "../../model/markups";
import { itemKindLabel, itemLabel, itemMetrics } from "../../model/measure";
import { pageBuilding, pageDisplayName, pageFloor, pageNumber } from "../../model/pages";
import {
  inspectionStatusLabel,
  symbolCategoryLabel,
  symbolCategoryOf,
  symbolName,
} from "../../model/symbols";
import type {
  Layer,
  MarkupItem,
  MarkupsColumnId,
  MarkupsGroupField,
  MarkupsSort,
  PageId,
  Project,
} from "../../model/types";

/** One item together with the layer that owns it, as the table consumes it. */
export interface MarkupRow {
  item: MarkupItem;
  layer: Layer;
}

/**
 * Filters and sorts the project items for the Markups table.
 *
 * The panel settings and the current page are explicit so this module stays
 * free of the module singleton and the store. `currentPage` is the stable page
 * id of the visible canvas page, used only by the "current page" filter.
 */
export function filteredRows(
  project: Project,
  settings: MarkupsViewSettings,
  currentPage: PageId | null,
): MarkupRow[] {
  const query = normalizeFilterQuery(settings.search);
  const rows: MarkupRow[] = [];
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (settings.pageFilter === "current" && item.pageId !== currentPage) continue;
      const kind = isMeasurementKind(item.kind)
        ? "measure"
        : item.kind === "symbol"
          ? "symbol"
          : "draw";
      if (settings.typeFilter === "count") {
        if (item.kind !== "count") continue;
      } else if (settings.typeFilter !== "all" && kind !== settings.typeFilter) continue;
      const category = isMeasurementKind(item.kind) ? categoryForItem(project, item) : undefined;
      if (settings.categoryId) {
        if (!isMeasurementKind(item.kind) || category?.id !== settings.categoryId) continue;
      }
      const symbolCategory = item.kind === "symbol" ? symbolCategoryOf(item.symbolId) : undefined;
      if (settings.symbolCategory && symbolCategory !== settings.symbolCategory) continue;
      if (
        settings.countType &&
        (item.kind !== "count" || (item.countType ?? "other") !== settings.countType)
      ) {
        continue;
      }
      if (query) {
        const created = formatTimestamp(item.createdAt);
        const modified = formatTimestamp(item.updatedAt);
        const haystack = `${itemLabel(item, project)} ${itemKindLabel(item.kind)} ${layer.name} ${item.text ?? ""} ${item.room ?? ""} ${category?.name ?? ""} ${item.kind === "count" ? countTypeLabel(project, item.countType) : ""} ${item.kind === "symbol" ? `${symbolName(item.symbolId)} ${symbolCategoryLabel(symbolCategory)} ${inspectionStatusLabel(item.status)}` : ""} ${item.kind === "area" && item.areaMode === "subtract" ? "deduct deduction" : ""} ${created} ${modified} ${item.createdAt ?? ""} ${item.updatedAt ?? ""}`;
        if (!matchesFilterText(haystack, query)) continue;
      }
      rows.push({ item, layer });
    }
  }
  rows.sort((a, b) => compareRows(a, b, project, settings.sort));
  return rows;
}

export function compareRows(
  a: MarkupRow,
  b: MarkupRow,
  project: Project,
  sort: MarkupsSort | null,
): number {
  if (sort) {
    const hierarchy = buildLayerHierarchy(project.layers);
    const left = sortValue(a, sort.column, project, hierarchy);
    const right = sortValue(b, sort.column, project, hierarchy);
    let result: number;
    if (typeof left === "number" && typeof right === "number") result = left - right;
    else result = String(left).localeCompare(String(right), undefined, { numeric: true });
    if (result !== 0) return sort.direction === "desc" ? -result : result;
  }
  return (
    pageNumber(project, a.item.pageId) - pageNumber(project, b.item.pageId) ||
    a.layer.name.localeCompare(b.layer.name) ||
    itemLabel(a.item, project).localeCompare(itemLabel(b.item, project), undefined, {
      numeric: true,
    })
  );
}

export function sortValue(
  row: MarkupRow,
  column: MarkupsColumnId,
  project: Project,
  hierarchy?: LayerHierarchy,
): string | number {
  const category = isMeasurementKind(row.item.kind)
    ? categoryForItem(project, row.item)
    : undefined;
  switch (column) {
    case "name":
      return itemLabel(row.item, project).toLocaleLowerCase();
    case "type":
      return itemKindLabel(row.item.kind);
    case "page":
      return pageNumber(project, row.item.pageId);
    case "layer":
      return row.layer.name.toLocaleLowerCase();
    case "value":
      return itemMetrics(row.item, project)?.rawPoints ?? 0;
    case "countType":
      return row.item.kind === "count"
        ? countTypeLabel(project, row.item.countType).toLocaleLowerCase()
        : "";
    case "category":
      return row.item.kind === "symbol"
        ? symbolCategoryLabel(symbolCategoryOf(row.item.symbolId)).toLocaleLowerCase()
        : (category?.name.toLocaleLowerCase() ?? "");
    case "room":
      return (row.item.room ?? "").toLocaleLowerCase();
    case "status":
      return row.item.kind === "symbol"
        ? inspectionStatusLabel(row.item.status).toLocaleLowerCase()
        : "";
    case "created":
      return timestampValue(row.item.createdAt);
    case "modified":
      return timestampValue(row.item.updatedAt);
    case "visible":
      return itemIsVisible(row.item, row.layer, hierarchy) ? 0 : 1;
    case "locked":
      return itemIsLocked(row.item, row.layer, hierarchy) ? 0 : 1;
  }
}

export function groupValue(row: MarkupRow, field: MarkupsGroupField, project: Project): string {
  switch (field) {
    case "category": {
      if (row.item.kind === "symbol") {
        return symbolCategoryLabel(symbolCategoryOf(row.item.symbolId));
      }
      if (!isMeasurementKind(row.item.kind)) return t("markups.uncategorized");
      return categoryForItem(project, row.item)?.name ?? t("markups.uncategorized");
    }
    case "room":
      return row.item.room?.trim() || t("markups.unassigned");
    case "countType":
      return row.item.kind === "count"
        ? countTypeLabel(project, row.item.countType)
        : t("markups.other");
    case "page": {
      const page = pageNumber(project, row.item.pageId);
      const name = pageDisplayName(project, row.item.pageId);
      return name ? t("markups.pageWithName", { page, name }) : t("markups.pageOnly", { page });
    }
    case "layer":
      return row.layer.name;
    case "building":
      return pageBuilding(project, row.item.pageId) ?? t("markups.unassigned");
    case "floor":
      return pageFloor(project, row.item.pageId) ?? t("markups.unassigned");
  }
}

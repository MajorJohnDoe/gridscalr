import { countTypeLabel } from "../../features/countTypes/model";
import {
  INSPECTION_STATUSES,
  inspectionStatusColor,
  inspectionStatusLabel,
  symbolCategoryLabel,
  symbolCategoryOf,
  symbolName,
} from "../../features/schematics/symbols/registry";
import { t } from "../../i18n";
import { categoryForItem } from "../../model/categories";
import { setItemsLocked, setItemsStatus, setItemsVisible } from "../../model/commands";
import { formatTimestamp, timestampValue } from "../../model/dates";
import {
  currentPageId,
  pageBuilding,
  pageDisplayName,
  pageFloor,
  pageNumber,
} from "../../model/pages";
import {
  findItem,
  isMeasurementKind,
  itemIsLocked,
  itemIsVisible,
  layerLockedOnPage,
  layerVisibleOnPage,
  moveItemsToLayer,
  moveTargetLayers,
} from "../../model/layers";
import { itemKindLabel, itemLabel, itemMetrics, itemScaleWarning } from "../../model/measure";
import { selectionKey } from "../../model/selection";
import type {
  InspectionStatus,
  Layer,
  MarkupItem,
  MarkupsColumnId,
  MarkupsGroupField,
  Project,
} from "../../model/types";
import { store } from "../../state/store";
import { el, option } from "../dom";
import { icon } from "../icons";
import { markupIcon } from "../itemIcon";
import { layerAction } from "../layerList";
import type { PanelActions } from "../panels";
import { showSelectionMenuAt } from "../selectionMenu";
import { markupsState } from "./state";

export interface MarkupRow {
  item: MarkupItem;
  layer: Layer;
}

export function filteredRows(project: Project): MarkupRow[] {
  const query = markupsState.settings.search.trim().toLocaleLowerCase();
  const rows: MarkupRow[] = [];
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (
        markupsState.settings.pageFilter === "current" &&
        item.pageId !== currentPageId(project, store.ui.page)
      )
        continue;
      const kind = isMeasurementKind(item.kind)
        ? "measure"
        : item.kind === "symbol"
          ? "symbol"
          : "draw";
      if (markupsState.settings.typeFilter === "count") {
        if (item.kind !== "count") continue;
      } else if (
        markupsState.settings.typeFilter !== "all" &&
        kind !== markupsState.settings.typeFilter
      )
        continue;
      const category = isMeasurementKind(item.kind) ? categoryForItem(project, item) : undefined;
      if (markupsState.settings.categoryId) {
        if (!isMeasurementKind(item.kind) || category?.id !== markupsState.settings.categoryId)
          continue;
      }
      const symbolCategory = item.kind === "symbol" ? symbolCategoryOf(item.symbolId) : undefined;
      if (
        markupsState.settings.symbolCategory &&
        symbolCategory !== markupsState.settings.symbolCategory
      )
        continue;
      if (
        markupsState.settings.countType &&
        (item.kind !== "count" || (item.countType ?? "other") !== markupsState.settings.countType)
      ) {
        continue;
      }
      if (query) {
        const created = formatTimestamp(item.createdAt);
        const modified = formatTimestamp(item.updatedAt);
        const haystack =
          `${itemLabel(item, project)} ${itemKindLabel(item.kind)} ${layer.name} ${item.text ?? ""} ${item.room ?? ""} ${category?.name ?? ""} ${item.kind === "count" ? countTypeLabel(project, item.countType) : ""} ${item.kind === "symbol" ? `${symbolName(item.symbolId)} ${symbolCategoryLabel(symbolCategory)} ${inspectionStatusLabel(item.status)}` : ""} ${item.kind === "area" && item.areaMode === "subtract" ? "deduct deduction" : ""} ${created} ${modified} ${item.createdAt ?? ""} ${item.updatedAt ?? ""}`.toLocaleLowerCase();
        if (!haystack.includes(query)) continue;
      }
      rows.push({ item, layer });
    }
  }
  rows.sort((a, b) => compareRows(a, b, project));
  return rows;
}

export function compareRows(a: MarkupRow, b: MarkupRow, project: Project): number {
  const sort = markupsState.settings.sort;
  if (sort) {
    const left = sortValue(a, sort.column, project);
    const right = sortValue(b, sort.column, project);
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
      return itemIsVisible(row.item, row.layer) ? 0 : 1;
    case "locked":
      return itemIsLocked(row.item, row.layer) ? 0 : 1;
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

export function beginMarkupRename(label: HTMLElement, itemId: string, fallback: string): void {
  if (label.querySelector(".markups-name-input")) return;
  const project = store.project;
  const found = project ? findItem(project, itemId) : undefined;
  if (!found || itemIsLocked(found.item, found.layer)) return;
  const input = el("input", "markups-name-input");
  input.value = label.textContent ?? "";
  input.placeholder = fallback;
  label.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (commit: boolean) => {
    if (done || !input.isConnected) return;
    done = true;
    const value = input.value.trim();
    if (commit && value !== (label.textContent ?? "")) {
      store.mutate((project) => {
        const item = findItem(project, itemId)?.item;
        if (item) {
          item.label = value || undefined;
          item.updatedAt = new Date().toISOString();
        }
      }, "change");
    } else {
      input.replaceWith(label);
    }
  };
  input.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    }
  });
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("dblclick", (event) => event.stopPropagation());
}

export function markupRowElement(
  row: MarkupRow,
  columns: MarkupsColumnId[],
  actions: PanelActions,
  refreshRows: () => void,
  /** Every rendered row in display order; the table itself is virtualised. */
  rowOrder: MarkupRow[] = [],
): HTMLTableRowElement {
  const project = store.project!;
  const { item, layer } = row;
  const ref = { layerId: layer.id, itemId: item.id };
  const labelText = itemLabel(item, project);
  const category = isMeasurementKind(item.kind) ? categoryForItem(project, item) : undefined;
  const metrics = itemMetrics(item, project);
  const deduction = item.kind === "area" && item.areaMode === "subtract";
  const hidden = !itemIsVisible(item, layer);
  const locked = itemIsLocked(item, layer);
  const layerShown = layerVisibleOnPage(layer, item.pageId);
  const layerLocked = layerLockedOnPage(layer, item.pageId);

  const tr = el("tr", "markups-row");
  tr.dataset.itemId = item.id;
  tr.dataset.layerId = layer.id;
  tr.tabIndex = 0;
  tr.classList.toggle("is-selected", store.isSelected(ref));
  tr.setAttribute("aria-selected", String(store.isSelected(ref)));
  tr.classList.toggle("is-hidden", hidden);
  tr.classList.toggle("is-locked", locked);
  tr.classList.toggle("is-deduction", deduction);

  const label = el("span", "markups-item-label", labelText);
  const cells = new Map<MarkupsColumnId, HTMLTableCellElement>();

  const nameCell = el("td", "markups-name-cell");
  const nameWrap = el("div", "markups-name");
  const itemIcon = el("span", "markups-item-icon");
  itemIcon.innerHTML = icon(markupIcon(item.kind), 14);
  itemIcon.style.color = item.color;
  label.title = t("markups.itemTitle", { label: labelText });
  const rename = el("button", "markups-rename");
  rename.type = "button";
  rename.title = t("markups.rename");
  rename.setAttribute("aria-label", t("markups.renameAria", { name: labelText }));
  rename.innerHTML = icon("text", 11);
  rename.addEventListener("click", (event) => {
    event.stopPropagation();
    beginMarkupRename(label, item.id, labelText);
  });
  nameWrap.append(itemIcon, label, rename);
  if (deduction) nameWrap.append(el("span", "markups-deduct", t("context.deduct")));
  nameCell.append(nameWrap);
  cells.set("name", nameCell);

  cells.set("type", el("td", "markups-type", itemKindLabel(item.kind)));

  const itemPage = pageNumber(project, item.pageId);
  const pageCell = el("td", "markups-page", `p.${itemPage}`);
  const pageName = pageDisplayName(project, item.pageId);
  if (pageName) pageCell.title = t("markups.pageWithName", { page: itemPage, name: pageName });
  cells.set("page", pageCell);

  const layerCell = el("td", "markups-layer-cell");
  const layerSelect = el("select", "markups-layer-select");
  layerSelect.setAttribute("aria-label", t("markups.layerFor", { name: labelText }));
  layerSelect.title = t("markups.moveLayer");
  for (const candidate of moveTargetLayers(project, layer.kind, [item.pageId])) {
    const candidateOption = option(candidate.id, candidate.name, candidate.id === layer.id);
    if (candidate.id !== layer.id && layerLockedOnPage(candidate, item.pageId)) {
      candidateOption.disabled = true;
    }
    layerSelect.append(candidateOption);
  }
  layerSelect.disabled = locked;
  layerSelect.addEventListener("click", (event) => event.stopPropagation());
  layerSelect.addEventListener("change", (event) => {
    event.stopPropagation();
    const target = layerSelect.value;
    if (store.isSelected(ref) && store.ui.selection.length > 1) {
      actions.moveSelectionToLayer(target);
      return;
    }
    let moved = 0;
    store.mutate((project) => {
      const result = moveItemsToLayer(project, [ref], target);
      moved = result.moved;
    }, "change");
    if (moved) store.setSelection({ layerId: target, itemId: item.id });
    else refreshRows();
  });
  layerCell.append(layerSelect);
  cells.set("layer", layerCell);

  const valueCell = el("td", "markups-value");
  valueCell.append(document.createTextNode(metrics?.primary ?? "–"));
  const scaleWarning = itemScaleWarning(item, project);
  if (scaleWarning) {
    const badge = el("span", "scale-warning");
    badge.innerHTML = icon("warning", 11);
    badge.title = scaleWarning;
    badge.setAttribute("role", "img");
    badge.setAttribute("aria-label", scaleWarning);
    valueCell.append(badge);
  }
  cells.set("value", valueCell);

  cells.set(
    "countType",
    el(
      "td",
      "markups-count-type",
      item.kind === "count" ? countTypeLabel(project, item.countType) : "–",
    ),
  );

  const categoryCell = el(
    "td",
    "markups-category",
    item.kind === "symbol"
      ? symbolCategoryLabel(symbolCategoryOf(item.symbolId))
      : (category?.name ?? "–"),
  );
  cells.set("category", categoryCell);

  const roomCell = el("td", "markups-room", item.room ?? "–");
  cells.set("room", roomCell);

  const statusCell = el("td", "markups-status-cell");
  if (item.kind === "symbol") {
    const status = el("select", "markups-status-select");
    status.setAttribute("aria-label", t("markups.statusFor", { name: labelText }));
    status.title = locked ? t("markups.statusLocked") : t("markups.inspectionStatus");
    status.append(option("", t("markups.notAssessed"), !item.status));
    for (const inspection of INSPECTION_STATUSES) {
      status.append(
        option(inspection, inspectionStatusLabel(inspection), item.status === inspection),
      );
    }
    status.disabled = locked;
    status.style.color = inspectionStatusColor(item.status ?? undefined);
    status.addEventListener("click", (event) => event.stopPropagation());
    status.addEventListener("change", (event) => {
      event.stopPropagation();
      const bulk = store.isSelected(ref) && store.ui.selection.length > 1;
      const targets = bulk ? store.ui.selection : [ref];
      store.mutate((project) => {
        setItemsStatus(project, targets, status.value ? (status.value as InspectionStatus) : null);
      }, "change");
    });
    statusCell.append(status);
  } else {
    statusCell.textContent = "–";
  }
  cells.set("status", statusCell);

  const createdCell = el("td", "markups-time", formatTimestamp(item.createdAt));
  createdCell.title = item.createdAt ?? "";
  cells.set("created", createdCell);

  const modifiedCell = el("td", "markups-time", formatTimestamp(item.updatedAt));
  modifiedCell.title = item.updatedAt ?? "";
  cells.set("modified", modifiedCell);

  const visibleCell = el("td", "markups-flag-cell");
  const eye = layerAction(
    hidden ? "eyeOff" : "eye",
    layerShown
      ? hidden
        ? t("markups.showItem")
        : t("markups.hideItem")
      : t("markups.layerHiddenOnPage", { page: pageNumber(project, item.pageId) }),
  );
  eye.classList.toggle("is-on", !hidden);
  eye.disabled = !layerShown;
  eye.addEventListener("click", (event) => {
    event.stopPropagation();
    const next = item.visible === false;
    store.mutate((project) => {
      setItemsVisible(project, [ref], next);
    }, "change");
  });
  visibleCell.append(eye);
  cells.set("visible", visibleCell);

  const lockedCell = el("td", "markups-flag-cell");
  const lock = layerAction(
    locked ? "lock" : "unlock",
    layerLocked
      ? t("markups.layerLockedOnPage", { page: pageNumber(project, item.pageId) })
      : locked
        ? t("markups.unlockItem")
        : t("markups.lockItem"),
  );
  lock.classList.toggle("is-locked", locked);
  lock.disabled = layerLocked;
  lock.addEventListener("click", (event) => {
    event.stopPropagation();
    const next = item.locked !== true;
    store.mutate((project) => {
      setItemsLocked(project, [ref], next);
    }, "change");
  });
  lockedCell.append(lock);
  cells.set("locked", lockedCell);

  for (const column of columns) {
    const cell = cells.get(column);
    if (cell) tr.append(cell);
  }

  const navigate = () => actions.navigateToItem(item.pageId, layer.id, item.id);
  tr.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, select, input, textarea")) return;
    if (event.shiftKey) {
      const source = rowOrder.length
        ? rowOrder.map((entry) => ({ layerId: entry.layer.id, itemId: entry.item.id }))
        : Array.from(
            (tr.closest("tbody") ?? document).querySelectorAll<HTMLElement>("tr.markups-row"),
          ).map((row) => ({
            layerId: row.dataset.layerId ?? "",
            itemId: row.dataset.itemId ?? "",
          }));
      const rows = source;
      const anchor = markupsState.rangeAnchor ?? ref;
      const start = rows.findIndex((entry) => selectionKey(entry) === selectionKey(anchor));
      const end = rows.findIndex((entry) => selectionKey(entry) === selectionKey(ref));
      if (pageNumber(project, item.pageId) !== store.ui.page) {
        actions.goToPage(pageNumber(project, item.pageId), false);
      }
      if (start >= 0 && end >= 0) {
        const [from, to] = start <= end ? [start, end] : [end, start];
        store.setSelectionMany(rows.slice(from, to + 1));
      } else {
        store.toggleSelection(ref);
      }
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      if (pageNumber(project, item.pageId) !== store.ui.page) {
        actions.goToPage(pageNumber(project, item.pageId), false);
      }
      store.toggleSelection(ref);
      markupsState.rangeAnchor = ref;
      return;
    }
    markupsState.rangeAnchor = ref;
    navigate();
  });
  tr.addEventListener("dblclick", (event) => {
    if ((event.target as HTMLElement | null)?.closest(".markups-item-label")) {
      event.preventDefault();
      event.stopPropagation();
      beginMarkupRename(label, item.id, labelText);
    }
  });
  tr.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    if (!store.isSelected(ref)) store.setSelection(ref);
    showSelectionMenuAt(event.clientX, event.clientY, actions);
  });
  tr.addEventListener("keydown", (event) => {
    if (event.target !== tr) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigate();
    } else if (event.key === "F2") {
      event.preventDefault();
      event.stopPropagation();
      beginMarkupRename(label, item.id, labelText);
    }
  });
  return tr;
}

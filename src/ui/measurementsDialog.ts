import { categoryForItem } from "../model/categories";
import { countTypeLabel } from "../model/countSymbols";
import { totalPageCount } from "../model/documents";
import {
  findItem,
  isMeasurementKind,
  itemIsLocked,
  itemIsVisible,
  layerLockedOnPage,
  layerVisibleOnPage,
} from "../model/layers";
import { setItemsLocked, setItemsVisible } from "../model/commands";
import { itemKindLabel, itemLabel, itemMetrics } from "../model/measure";
import type { Layer, MarkupItem } from "../model/types";
import { store } from "../state/store";
import { showModal } from "./dialogs";
import { clear, el, option } from "./dom";
import { icon } from "./icons";
import { layerAction } from "./layerList";
import type { PanelActions } from "./panels";
import { markupIcon } from "./itemIcon";
import { showSelectionMenuAt } from "./selectionMenu";

function beginMarkupRename(label: HTMLElement, itemId: string, fallbackLabel: string): void {
  if (label.querySelector(".markup-label-input")) return;
  const found = store.project ? findItem(store.project, itemId) : undefined;
  if (found && itemIsLocked(found.item, found.layer)) return;
  const input = el("input", "markup-label-input");
  input.value = label.textContent ?? "";
  input.placeholder = fallbackLabel;
  label.replaceWith(input);
  input.focus();
  input.select();
  const finish = (commit: boolean) => {
    if (!input.isConnected) return;
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

interface MarkupRowData {
  item: MarkupItem;
  layer: Layer;
  layerId: string;
  layerName: string;
  color: string;
}

export function openMeasurementsDialog(actions: PanelActions): void {
  const project = store.project;
  if (!project) return;

  let pageFilter: "current" | "all" = "current";
  let kindFilter = "all";
  let searchQuery = "";
  let closeDialog: (() => void) | null = null;
  let unsubscribe: (() => void) | null = null;

  const body = el("div", "measurements-dialog");
  const toolbar = el("div", "measurements-toolbar");
  const pageSelect = el("select", "select");
  pageSelect.append(option("current", "Current page"), option("all", "All pages"));
  pageSelect.value = pageFilter;
  pageSelect.setAttribute("aria-label", "Filter measurements by page");
  const kindSelect = el("select", "select");
  kindSelect.append(
    option("all", "All types"),
    option("measure", "Measurements"),
    option("draw", "Drawings"),
  );
  kindSelect.value = kindFilter;
  kindSelect.setAttribute("aria-label", "Filter by item type");

  const search = el("input", "input");
  search.type = "search";
  search.placeholder = "Filter by label, type, layer, category or room…";
  search.setAttribute("aria-label", "Filter measurements");
  const selectAll = el("button", "btn btn-small btn-ghost", "Select all");
  selectAll.type = "button";
  selectAll.title = "Select all items matching the current filter";
  const exportCsv = el("button", "btn btn-small btn-ghost", "Export CSV");
  exportCsv.type = "button";
  exportCsv.innerHTML = `${icon("csv", 13)}<span>Export CSV</span>`;
  exportCsv.title = "Export the markups list as CSV";
  exportCsv.addEventListener("click", () => actions.exportAs("csv"));

  const searchRow = el("div", "measurements-toolbar");
  searchRow.append(search, selectAll);
  toolbar.append(pageSelect, kindSelect);
  const metaRow = el("div", "measurements-meta");
  const list = el("div", "markup-list measurements-list");
  const total = el("div", "markup-total");
  metaRow.append(total);

  let filteredRows: MarkupRowData[] = [];

  const update = () => {
    if (!store.project) return;
    const currentProject = store.project;
    clear(list);
    const query = searchQuery.trim().toLowerCase();
    const rows: MarkupRowData[] = [];
    for (const layer of currentProject.layers) {
      for (const item of layer.items) {
        if (pageFilter === "current" && item.page !== store.ui.page) continue;
        const kindGroup = isMeasurementKind(item.kind) ? "measure" : "draw";
        if (kindFilter !== "all" && kindGroup !== kindFilter) continue;
        const category = isMeasurementKind(item.kind)
          ? categoryForItem(currentProject, item)
          : undefined;
        if (query) {
          const haystack =
            `${itemLabel(item, currentProject)} ${itemKindLabel(item.kind)} ${layer.name} ${item.text ?? ""} ${category?.name ?? ""} ${item.room ?? ""} ${item.kind === "count" ? countTypeLabel(item.countType) : ""} ${item.kind === "area" && item.areaMode === "subtract" ? "Deduction" : ""}`.toLowerCase();
          if (!haystack.includes(query)) continue;
        }
        rows.push({ item, layer, layerId: layer.id, layerName: layer.name, color: layer.color });
      }
    }
    filteredRows = rows;
    rows.sort((a, b) => a.item.page - b.item.page || a.layerName.localeCompare(b.layerName));
    if (!rows.length) {
      const note = el("div", "empty-note");
      note.innerHTML = `${icon("markups", 24)}<div>No items match this filter.</div>`;
      list.append(note);
    }
    for (const row of rows) {
      const metrics = itemMetrics(row.item, currentProject);
      const fallbackLabel = itemLabel(row.item, currentProject);
      const itemRow = el("div", "markup-row");
      itemRow.tabIndex = 0;
      itemRow.setAttribute("role", "button");
      itemRow.dataset.itemId = row.item.id;
      const locked = itemIsLocked(row.item, row.layer);
      const visible = itemIsVisible(row.item, row.layer);
      itemRow.classList.toggle(
        "is-selected",
        store.isSelected({ layerId: row.layerId, itemId: row.item.id }),
      );
      itemRow.classList.toggle("is-hidden", !visible);
      itemRow.classList.toggle("is-locked", locked);
      const iconWrap = el("span", "markup-icon");
      iconWrap.innerHTML = icon(markupIcon(row.item.kind), 14);
      iconWrap.style.color = row.color;
      const label = el("span", "markup-label", fallbackLabel);
      label.title = `${row.item.text ?? fallbackLabel} — double-click to rename`;
      const value = el("span", "markup-value", metrics?.primary ?? "");
      const category = isMeasurementKind(row.item.kind)
        ? categoryForItem(currentProject, row.item)
        : undefined;
      const countType = row.item.kind === "count" ? countTypeLabel(row.item.countType) : undefined;
      const deduction = row.item.kind === "area" && row.item.areaMode === "subtract";
      const metaParts = category
        ? [category.name, countType, deduction ? "Deduction" : undefined, row.item.room].filter(
            Boolean,
          )
        : [itemKindLabel(row.item.kind), row.layerName];
      const meta = el("span", "markup-meta", metaParts.join(" · "));
      meta.title = category
        ? [itemKindLabel(row.item.kind), ...metaParts, row.layerName].join(" · ")
        : metaParts.join(" · ");
      itemRow.classList.toggle("is-deduction", deduction);
      const page = el("span", "markup-page", `p.${row.item.page}`);
      const rowActions = el("span", "markup-actions");
      const layerShown = layerVisibleOnPage(row.layer, row.item.page);
      const eye = layerAction(
        row.item.visible === false ? "eyeOff" : "eye",
        layerShown
          ? row.item.visible === false
            ? "Show item"
            : "Hide item"
          : `Layer is hidden on Page ${row.item.page}`,
      );
      eye.classList.toggle("is-on", row.item.visible !== false && layerShown);
      eye.disabled = !layerShown;
      eye.addEventListener("click", (event) => {
        event.stopPropagation();
        const nextVisible = row.item.visible === false;
        const ref = { layerId: row.layerId, itemId: row.item.id };
        store.mutate((project) => {
          setItemsVisible(project, [ref], nextVisible);
        }, "change");
        if (!nextVisible) {
          store.setSelectionMany(
            store.ui.selection.filter((selection) => selection.itemId !== row.item.id),
          );
        }
      });
      const layerIsLocked = layerLockedOnPage(row.layer, row.item.page);
      const lock = layerAction(
        locked ? "lock" : "unlock",
        layerIsLocked
          ? `Layer is locked on Page ${row.item.page}`
          : locked
            ? "Unlock item"
            : "Lock item",
      );
      lock.classList.toggle("is-locked", locked);
      lock.disabled = layerIsLocked;
      lock.addEventListener("click", (event) => {
        event.stopPropagation();
        const nextLocked = !row.item.locked;
        const ref = { layerId: row.layerId, itemId: row.item.id };
        store.mutate((project) => {
          setItemsLocked(project, [ref], nextLocked);
        }, "change");
      });
      rowActions.append(eye, lock);
      itemRow.append(iconWrap, label, value, meta, page, rowActions);
      itemRow.addEventListener("click", (event) => {
        const modifier = event.shiftKey || event.ctrlKey || event.metaKey;
        if (modifier) {
          if (row.item.page !== store.ui.page) actions.goToPage(row.item.page, false);
          store.toggleSelection({ layerId: row.layerId, itemId: row.item.id });
          return;
        }
        actions.navigateToItem(row.item.page, row.layerId, row.item.id);
        closeDialog?.();
      });
      itemRow.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        if (!store.isSelected({ layerId: row.layerId, itemId: row.item.id })) {
          store.setSelection({ layerId: row.layerId, itemId: row.item.id });
        }
        showSelectionMenuAt(event.clientX, event.clientY, actions);
      });
      itemRow.addEventListener("keydown", (event) => {
        if (event.target !== itemRow) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          actions.navigateToItem(row.item.page, row.layerId, row.item.id);
          closeDialog?.();
        } else if (event.key === "F2") {
          event.preventDefault();
          event.stopPropagation();
          beginMarkupRename(label, row.item.id, fallbackLabel);
        }
      });
      label.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        beginMarkupRename(label, row.item.id, fallbackLabel);
      });
      list.append(itemRow);
    }
    total.replaceChildren(
      el("span", "", `${rows.length} item${rows.length === 1 ? "" : "s"}`),
      el(
        "span",
        "",
        pageFilter === "current"
          ? `Page ${store.ui.page}`
          : `${totalPageCount(currentProject.documents)} pages`,
      ),
    );
  };

  pageSelect.addEventListener("change", () => {
    pageFilter = pageSelect.value as "current" | "all";
    update();
  });
  kindSelect.addEventListener("change", () => {
    kindFilter = kindSelect.value;
    update();
  });
  search.addEventListener("input", () => {
    searchQuery = search.value;
    update();
  });
  selectAll.addEventListener("click", () => {
    store.setSelectionMany(
      filteredRows.map((row) => ({ layerId: row.layerId, itemId: row.item.id })),
    );
  });

  body.append(toolbar, searchRow, list, metaRow, el("div", "measurements-actions"));
  const actionsRow = body.lastElementChild as HTMLElement;
  actionsRow.append(exportCsv);
  update();

  void showModal({
    title: "Measurements",
    subtitle: "Find, select and navigate every measurement and drawing.",
    body,
    wide: true,
    className: "modal-measurements",
    actions: [{ label: "Close", value: "close", primary: true }],
    onMount: (_modal, close) => {
      closeDialog = close;
      unsubscribe = store.subscribe((reason) => {
        if (reason === "cursor" || reason === "view") return;
        update();
      });
    },
    onClose: () => {
      unsubscribe?.();
      unsubscribe = null;
      closeDialog = null;
    },
  });
}

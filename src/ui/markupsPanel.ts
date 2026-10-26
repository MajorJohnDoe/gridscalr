import { categoryForItem } from "../model/categories";
import { countTypeLabel } from "../model/countSymbols";
import { pageDisplayName } from "../model/documents";
import {
  findItem,
  isMeasurementKind,
  itemIsLocked,
  itemIsVisible,
  layerLockedOnPage,
  layerVisibleOnPage,
  layersForKind,
  moveItemsToLayer,
} from "../model/layers";
import { setItemsLocked, setItemsVisible } from "../model/commands";
import { itemKindLabel, itemLabel, itemMetrics } from "../model/measure";
import type { Layer, MarkupItem } from "../model/types";
import { store } from "../state/store";
import { clear, el, option } from "./dom";
import { icon } from "./icons";
import { markupIcon } from "./itemIcon";
import { layerAction } from "./layerList";
import type { PanelActions } from "./panels";
import { showSelectionMenuAt } from "./selectionMenu";
import type { ShellRefs } from "./shell";

const PREFS_KEY = "gridscalr.ui.markups.v1";
const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 140;

interface MarkupsPreferences {
  open: boolean;
  height: number;
}

function clampHeight(value: number): number {
  const max = Math.max(MIN_HEIGHT, window.innerHeight * 0.62);
  return Math.max(MIN_HEIGHT, Math.min(max, Math.round(value)));
}

function loadPreferences(): MarkupsPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { open: false, height: DEFAULT_HEIGHT };
    const parsed = JSON.parse(raw) as Partial<MarkupsPreferences>;
    return {
      open: parsed.open === true,
      height: clampHeight(Number(parsed.height) || DEFAULT_HEIGHT),
    };
  } catch {
    return { open: false, height: DEFAULT_HEIGHT };
  }
}

const initialPreferences = loadPreferences();
let markupsOpen = initialPreferences.open;
let markupsHeight = initialPreferences.height;
let pageFilter: "all" | "current" = "all";
let typeFilter: "all" | "measure" | "draw" = "all";
let searchQuery = "";
let resizerBound = false;

function savePreferences(): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ open: markupsOpen, height: markupsHeight }));
  } catch {
    // The panel layout is a convenience only.
  }
}

export function isMarkupsOpen(): boolean {
  return markupsOpen;
}

export function setMarkupsOpen(open: boolean): void {
  markupsOpen = open;
  savePreferences();
}

export function toggleMarkupsPanel(): void {
  setMarkupsOpen(!markupsOpen);
}

interface MarkupRow {
  item: MarkupItem;
  layer: Layer;
}

function filteredRows(): MarkupRow[] {
  const project = store.project;
  if (!project) return [];
  const query = searchQuery.trim().toLowerCase();
  const rows: MarkupRow[] = [];
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (pageFilter === "current" && item.page !== store.ui.page) continue;
      const kind = isMeasurementKind(item.kind) ? "measure" : "draw";
      if (typeFilter !== "all" && kind !== typeFilter) continue;
      if (query) {
        const category = isMeasurementKind(item.kind) ? categoryForItem(project, item) : undefined;
        const haystack =
          `${itemLabel(item, project)} ${itemKindLabel(item.kind)} ${layer.name} ${item.text ?? ""} ${item.room ?? ""} ${category?.name ?? ""} ${item.kind === "count" ? countTypeLabel(item.countType) : ""} ${item.kind === "area" && item.areaMode === "subtract" ? "deduct deduction" : ""}`.toLowerCase();
        if (!haystack.includes(query)) continue;
      }
      rows.push({ item, layer });
    }
  }
  rows.sort(
    (a, b) =>
      a.item.page - b.item.page ||
      a.layer.name.localeCompare(b.layer.name) ||
      itemLabel(a.item, project).localeCompare(itemLabel(b.item, project)),
  );
  return rows;
}

function beginMarkupRename(label: HTMLElement, itemId: string, fallback: string): void {
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

function markupRowElement(
  row: MarkupRow,
  actions: PanelActions,
  refreshRows: () => void,
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
  const layerShown = layerVisibleOnPage(layer, item.page);
  const layerLocked = layerLockedOnPage(layer, item.page);

  const tr = el("tr", "markups-row");
  tr.dataset.itemId = item.id;
  tr.tabIndex = 0;
  tr.classList.toggle("is-selected", store.isSelected(ref));
  tr.classList.toggle("is-hidden", hidden);
  tr.classList.toggle("is-locked", locked);
  tr.classList.toggle("is-deduction", deduction);

  const nameCell = el("td", "markups-name-cell");
  const nameWrap = el("div", "markups-name");
  const itemIcon = el("span", "markups-item-icon");
  itemIcon.innerHTML = icon(markupIcon(item.kind), 14);
  itemIcon.style.color = item.color;
  const label = el("span", "markups-item-label", labelText);
  label.title = `${labelText} — double-click or use the rename button`;
  const rename = el("button", "markups-rename");
  rename.type = "button";
  rename.title = "Rename markup";
  rename.setAttribute("aria-label", `Rename ${labelText}`);
  rename.innerHTML = icon("text", 11);
  rename.addEventListener("click", (event) => {
    event.stopPropagation();
    beginMarkupRename(label, item.id, labelText);
  });
  nameWrap.append(itemIcon, label, rename);
  if (deduction) nameWrap.append(el("span", "markups-deduct", "Deduct"));
  nameCell.append(nameWrap);

  const typeCell = el("td", "markups-type", itemKindLabel(item.kind));
  const pageCell = el("td", "markups-page", `p.${item.page}`);
  const pageName = pageDisplayName(project, item.page);
  if (pageName) pageCell.title = `Page ${item.page} · ${pageName}`;

  const layerCell = el("td", "markups-layer-cell");
  const layerSelect = el("select", "markups-layer-select");
  layerSelect.setAttribute("aria-label", `Layer for ${labelText}`);
  layerSelect.title = "Move to another layer";
  for (const candidate of layersForKind(project, layer.kind)) {
    const candidateOption = option(candidate.id, candidate.name, candidate.id === layer.id);
    if (candidate.id !== layer.id && layerLockedOnPage(candidate, item.page)) {
      candidateOption.disabled = true;
    }
    layerSelect.append(candidateOption);
  }
  layerSelect.disabled = locked;
  layerSelect.addEventListener("click", (event) => event.stopPropagation());
  layerSelect.addEventListener("change", (event) => {
    event.stopPropagation();
    const target = layerSelect.value;
    let moved = 0;
    store.mutate((project) => {
      const result = moveItemsToLayer(project, [ref], target);
      moved = result.moved;
    }, "change");
    if (moved) {
      store.setSelection({ layerId: target, itemId: item.id });
    } else {
      refreshRows();
    }
  });
  layerCell.append(layerSelect);

  const valueCell = el("td", "markups-value", metrics?.primary ?? "–");
  const categoryCell = el("td", "markups-category", category?.name ?? "–");
  const roomCell = el("td", "markups-room", item.room ?? "–");

  const visibleCell = el("td", "markups-flag-cell");
  const eye = layerAction(
    hidden ? "eyeOff" : "eye",
    layerShown ? (hidden ? "Show item" : "Hide item") : `Layer is hidden on Page ${item.page}`,
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

  const lockedCell = el("td", "markups-flag-cell");
  const lock = layerAction(
    locked ? "lock" : "unlock",
    layerLocked ? `Layer is locked on Page ${item.page}` : locked ? "Unlock item" : "Lock item",
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

  tr.append(
    nameCell,
    typeCell,
    pageCell,
    layerCell,
    valueCell,
    categoryCell,
    roomCell,
    visibleCell,
    lockedCell,
  );

  const navigate = () => actions.navigateToItem(item.page, layer.id, item.id);
  tr.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, select, input, textarea")) return;
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      if (item.page !== store.ui.page) actions.goToPage(item.page, false);
      store.toggleSelection(ref);
      return;
    }
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

function bindResizer(refs: ShellRefs): void {
  if (resizerBound) return;
  resizerBound = true;
  refs.markupsResizer.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = markupsHeight;
    const onMove = (move: PointerEvent) => {
      markupsHeight = clampHeight(startHeight + startY - move.clientY);
      refs.markupsPanel.style.setProperty("--markups-h", `${markupsHeight}px`);
    };
    const onUp = () => {
      savePreferences();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  });
  refs.markupsResizer.addEventListener("dblclick", () => {
    markupsHeight = DEFAULT_HEIGHT;
    refs.markupsPanel.style.setProperty("--markups-h", `${markupsHeight}px`);
    savePreferences();
  });
}

export function renderMarkupsPanel(refs: ShellRefs, actions: PanelActions): void {
  const project = store.project;
  const visible = markupsOpen && Boolean(project);
  refs.markupsPanel.hidden = !visible;
  refs.markupsResizer.hidden = !visible;
  if (!visible || !project) return;

  bindResizer(refs);
  const panel = refs.markupsPanel;
  panel.style.setProperty("--markups-h", `${markupsHeight}px`);
  const previousScroll = panel.querySelector<HTMLElement>(".markups-table-wrap")?.scrollTop ?? 0;
  clear(panel);

  const head = el("div", "markups-head");
  const title = el("div", "markups-title");
  title.append(el("span", "markups-title-text", "Markups"));
  const count = el("span", "markups-count", "0");
  title.append(count);
  const headActions = el("div", "markups-head-actions");
  const exportCsv = el("button", "btn btn-small btn-ghost", "Export CSV");
  exportCsv.type = "button";
  exportCsv.innerHTML = `${icon("csv", 13)}<span>Export CSV</span>`;
  exportCsv.title = "Export the markups list as CSV";
  exportCsv.addEventListener("click", () => actions.exportAs("csv"));
  const close = el("button", "icon-btn");
  close.type = "button";
  close.title = "Close Markups list";
  close.setAttribute("aria-label", "Close Markups list");
  close.innerHTML = icon("close", 15);
  close.addEventListener("click", () => {
    setMarkupsOpen(false);
    actions.refresh();
  });
  headActions.append(exportCsv, close);
  head.append(title, headActions);

  const toolbar = el("div", "markups-toolbar");
  const pageSelect = el("select", "select");
  pageSelect.setAttribute("aria-label", "Filter markups by page");
  pageSelect.append(
    option("all", "All pages"),
    option("current", `Current page (${store.ui.page})`),
  );
  pageSelect.value = pageFilter;
  pageSelect.addEventListener("change", () => {
    pageFilter = pageSelect.value as "all" | "current";
    refreshRows();
  });

  const typeSelect = el("select", "select");
  typeSelect.setAttribute("aria-label", "Filter markups by type");
  typeSelect.append(
    option("all", "All types"),
    option("measure", "Measurements"),
    option("draw", "Drawings"),
  );
  typeSelect.value = typeFilter;
  typeSelect.addEventListener("change", () => {
    typeFilter = typeSelect.value as "all" | "measure" | "draw";
    refreshRows();
  });

  const search = el("input", "input markups-search");
  search.type = "search";
  search.placeholder = "Filter by name, type, layer, category or room…";
  search.value = searchQuery;
  search.setAttribute("aria-label", "Filter markups");
  search.addEventListener("input", () => {
    searchQuery = search.value;
    refreshRows();
  });

  const selectAll = el("button", "btn btn-small btn-ghost", "Select all");
  selectAll.type = "button";
  selectAll.title = "Select all markups matching the current filter";
  selectAll.addEventListener("click", () => {
    store.setSelectionMany(rows.map((row) => ({ layerId: row.layer.id, itemId: row.item.id })));
  });

  toolbar.append(pageSelect, typeSelect, search, selectAll);
  panel.append(head, toolbar);

  const wrap = el("div", "markups-table-wrap");
  const table = el("table", "markups-table");
  const thead = el("thead");
  const headerRow = el("tr");
  for (const label of [
    "Name",
    "Type",
    "Page",
    "Layer",
    "Value",
    "Category",
    "Room",
    "Vis.",
    "Lock",
  ]) {
    const th = el("th", "", label);
    th.scope = "col";
    headerRow.append(th);
  }
  thead.append(headerRow);
  const tbody = el("tbody");
  table.append(thead, tbody);
  wrap.append(table);
  panel.append(wrap);

  const foot = el("div", "markups-foot");
  const footLeft = el("span", "markups-foot-count", "");
  const footRight = el("span", "markups-foot-hint", "Click a row to navigate · F2 rename");
  foot.append(footLeft, footRight);
  panel.append(foot);

  let rows: MarkupRow[] = [];

  function refreshRows(): void {
    rows = filteredRows();
    clear(tbody);
    if (!rows.length) {
      const emptyRow = el("tr", "markups-empty");
      const cell = el("td");
      cell.colSpan = 9;
      cell.innerHTML = `${icon("markups", 22)}<div>No items match this filter.</div>`;
      emptyRow.append(cell);
      tbody.append(emptyRow);
    } else {
      for (const row of rows) tbody.append(markupRowElement(row, actions, refreshRows));
    }
    count.textContent = String(rows.length);
    footLeft.textContent = `${rows.length} item${rows.length === 1 ? "" : "s"} · ${store.ui.selection.length} selected`;
  }

  refreshRows();
  wrap.scrollTop = previousScroll;
}

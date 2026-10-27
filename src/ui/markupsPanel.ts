import { makeId } from "../model/calibration";
import { categoryForItem } from "../model/categories";
import { countTypeLabel } from "../model/countSymbols";
import { pageBuilding, pageDisplayName, pageFloor } from "../model/documents";
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
import {
  MARKUPS_COLUMN_IDS,
  MARKUPS_COLUMN_LABELS,
  MARKUPS_GROUP_PRESETS,
  defaultMarkupsViewSettings,
  groupMarkupRows,
  markupsGroupPresetFor,
  markupsSettingsEqual,
  normalizeMarkupsColumns,
  settingsForView,
  uniqueMarkupsViewName,
  viewFromSettings,
  type MarkupGroup,
  type MarkupsViewSettings,
} from "../model/markups";
import type {
  Layer,
  MarkupItem,
  MarkupsColumnId,
  MarkupsGroupField,
  MarkupsView,
  Project,
} from "../model/types";
import { store } from "../state/store";
import { clear, el, option } from "./dom";
import { confirmDialog, showModal, textDialog } from "./dialogs";
import { icon } from "./icons";
import { markupIcon } from "./itemIcon";
import { layerAction } from "./layerList";
import type { PanelActions } from "./panels";
import { showPopover } from "./popover";
import { showSelectionMenuAt } from "./selectionMenu";
import type { ShellRefs } from "./shell";

const PREFS_KEY = "gridscalr.ui.markups.v1";
const ACTIVE_VIEW_KEY = "gridscalr.ui.markups.active-view.v1";
const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 140;

const COLUMN_WIDTHS: Record<MarkupsColumnId, number> = {
  name: 27,
  type: 8,
  page: 5,
  layer: 14,
  value: 9,
  category: 10,
  room: 10,
  visible: 5,
  locked: 5,
};

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
let resizerBound = false;

let currentProjectId: string | null = null;
let activeViewId: string | null = null;
let settings: MarkupsViewSettings = defaultMarkupsViewSettings();
let viewDirty = false;
const collapsedGroups = new Set<string>();
let viewDirtyEl: HTMLElement | null = null;
let saveViewBtn: HTMLButtonElement | null = null;

function savePreferences(): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ open: markupsOpen, height: markupsHeight }));
  } catch {
    // The panel layout is a convenience only.
  }
}

function activeViewStorageKey(projectId: string): string {
  return `${ACTIVE_VIEW_KEY}.${projectId}`;
}

function loadActiveViewId(projectId: string): string | null {
  try {
    return localStorage.getItem(activeViewStorageKey(projectId));
  } catch {
    return null;
  }
}

function saveActiveViewId(projectId: string | null, viewId: string | null): void {
  if (!projectId) return;
  try {
    if (viewId) localStorage.setItem(activeViewStorageKey(projectId), viewId);
    else localStorage.removeItem(activeViewStorageKey(projectId));
  } catch {
    // The active view is a session convenience; saved views live in the project.
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

function syncProject(project: Project): void {
  if (project.id !== currentProjectId) {
    currentProjectId = project.id;
    collapsedGroups.clear();
    const stored = loadActiveViewId(project.id);
    const view = stored ? project.markupsViews.find((entry) => entry.id === stored) : undefined;
    if (view) {
      activeViewId = view.id;
      settings = settingsForView(view);
    } else {
      activeViewId = null;
      settings = defaultMarkupsViewSettings();
    }
    viewDirty = false;
    return;
  }

  const activeView = activeViewId
    ? project.markupsViews.find((entry) => entry.id === activeViewId)
    : undefined;
  if (activeViewId && !activeView) {
    activeViewId = null;
    settings = defaultMarkupsViewSettings();
    viewDirty = false;
    saveActiveViewId(project.id, null);
    return;
  }
  if (activeView && !viewDirty) {
    const storedSettings = settingsForView(activeView);
    if (!markupsSettingsEqual(settings, storedSettings)) settings = storedSettings;
  }
  if (
    settings.categoryId &&
    !project.categories.some((entry) => entry.id === settings.categoryId)
  ) {
    settings.categoryId = null;
  }
}

function markViewDirty(): void {
  viewDirty = true;
  updateViewControls();
}

function updateViewControls(): void {
  if (viewDirtyEl) viewDirtyEl.hidden = !(viewDirty && activeViewId);
  if (saveViewBtn) {
    saveViewBtn.disabled = Boolean(activeViewId) && !viewDirty;
    saveViewBtn.title = activeViewId
      ? "Save changes to the current Markups view"
      : "Save the current columns and filters as a view";
  }
}

function applyView(viewId: string | null, actions: PanelActions): void {
  const project = store.project;
  const view = viewId ? project?.markupsViews.find((entry) => entry.id === viewId) : undefined;
  activeViewId = view?.id ?? null;
  settings = view ? settingsForView(view) : defaultMarkupsViewSettings();
  viewDirty = false;
  collapsedGroups.clear();
  saveActiveViewId(project?.id ?? null, activeViewId);
  actions.refresh();
}

async function saveViewAs(actions: PanelActions): Promise<void> {
  const project = store.project;
  if (!project) return;
  const suggested = uniqueMarkupsViewName(
    project.markupsViews,
    `View ${project.markupsViews.length + 1}`,
  );
  const requested = await textDialog(
    "Save Markups view",
    "Views store the visible columns, filters, grouping and sorting in the project file.",
    suggested,
    "View name",
  );
  if (!requested) return;
  const latest = store.project;
  if (!latest) return;
  const name = uniqueMarkupsViewName(latest.markupsViews, requested);
  const view = viewFromSettings(makeId("view"), name, settings);
  activeViewId = view.id;
  viewDirty = false;
  saveActiveViewId(latest.id, view.id);
  store.mutate((current) => {
    current.markupsViews.push(view);
  }, "change");
  actions.refresh();
}

function saveCurrentView(actions: PanelActions): void {
  const project = store.project;
  if (!project) return;
  if (!activeViewId) {
    void saveViewAs(actions);
    return;
  }
  const existing = project.markupsViews.find((view) => view.id === activeViewId);
  if (!existing) {
    activeViewId = null;
    void saveViewAs(actions);
    return;
  }
  const next = viewFromSettings(existing.id, existing.name, settings);
  viewDirty = false;
  updateViewControls();
  store.mutate((current) => {
    const index = current.markupsViews.findIndex((view) => view.id === existing.id);
    if (index >= 0) current.markupsViews[index] = next;
    else current.markupsViews.push(next);
  }, "change");
  actions.refresh();
}

function openColumnsDialog(actions: PanelActions): void {
  const body = el("div", "markups-columns-dialog");
  const checks = new Map<MarkupsColumnId, HTMLInputElement>();
  for (const id of MARKUPS_COLUMN_IDS) {
    const label = el("label", "markups-column-option");
    const check = el("input");
    check.type = "checkbox";
    check.checked = settings.columns.includes(id);
    check.disabled = id === "name";
    if (id === "name") check.checked = true;
    checks.set(id, check);
    label.append(check, el("span", "", MARKUPS_COLUMN_LABELS[id]));
    body.append(label);
  }
  body.append(
    el(
      "p",
      "modal-hint",
      "Name is always shown. Column choices are saved with the view in the project file.",
    ),
  );
  void showModal({
    title: "Markups columns",
    subtitle: "Choose the columns that are useful for the current task.",
    body,
    actions: [
      { label: "Cancel", value: "__cancel__" },
      { label: "Apply", value: "apply", primary: true },
    ],
  }).then((value) => {
    if (value !== "apply") return;
    settings.columns = normalizeMarkupsColumns(
      MARKUPS_COLUMN_IDS.filter((id) => checks.get(id)?.checked),
    );
    collapsedGroups.clear();
    markViewDirty();
    actions.refresh();
  });
}

function openManageViews(project: Project, actions: PanelActions): void {
  const body = el("div", "markups-view-manager");
  if (!project.markupsViews.length) {
    body.append(el("p", "modal-message", "No saved views yet. Save one from the view menu."));
  }
  const rows: Array<{
    view: MarkupsView;
    name: HTMLInputElement;
    remove: HTMLInputElement;
    row: HTMLElement;
  }> = [];
  for (const view of project.markupsViews) {
    const row = el("div", "markups-view-row");
    const name = el("input", "input");
    name.type = "text";
    name.maxLength = 60;
    name.value = view.name;
    name.setAttribute("aria-label", `Name for ${view.name}`);
    const removeLabel = el("label", "markups-view-remove");
    const remove = el("input");
    remove.type = "checkbox";
    removeLabel.append(remove, el("span", "", "Remove"));
    remove.addEventListener("change", () => {
      name.disabled = remove.checked;
      row.classList.toggle("is-removed", remove.checked);
    });
    row.append(name, removeLabel);
    body.append(row);
    rows.push({ view, name, remove, row });
  }
  body.append(
    el(
      "p",
      "modal-hint",
      "Renaming or removing a view changes the project file and can be undone.",
    ),
  );
  void showModal({
    title: "Markups views",
    subtitle: "Rename or remove saved views. The active view is stored for this project.",
    body,
    wide: true,
    actions: [
      { label: "Cancel", value: "__cancel__" },
      { label: "Apply", value: "apply", primary: true },
    ],
    onValidate: () => {
      const kept = rows.filter((entry) => !entry.remove.checked);
      const names = kept.map((entry) => entry.name.value.replace(/\s+/g, " ").trim().slice(0, 60));
      if (names.some((name) => !name)) return "Every remaining view needs a name.";
      const keys = names.map((name) => name.toLocaleLowerCase());
      if (new Set(keys).size !== keys.length) return "View names must be unique.";
      return null;
    },
  }).then((value) => {
    if (value !== "apply") return;
    const kept = rows.filter((entry) => !entry.remove.checked);
    const activeRemoved = Boolean(
      activeViewId && kept.every((entry) => entry.view.id !== activeViewId),
    );
    if (activeRemoved) {
      activeViewId = null;
      settings = defaultMarkupsViewSettings();
      viewDirty = false;
      collapsedGroups.clear();
      saveActiveViewId(project.id, null);
    }
    const names = new Map(
      kept.map((entry) => [
        entry.view.id,
        entry.name.value.replace(/\s+/g, " ").trim().slice(0, 60),
      ]),
    );
    store.mutate((current) => {
      current.markupsViews = kept.map((entry) => {
        const source = current.markupsViews.find((view) => view.id === entry.view.id) ?? entry.view;
        return { ...source, name: names.get(entry.view.id) ?? source.name };
      });
    }, "change");
    actions.refresh();
  });
}

function filteredRows(project: Project): MarkupRow[] {
  const query = settings.search.trim().toLocaleLowerCase();
  const rows: MarkupRow[] = [];
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (settings.pageFilter === "current" && item.page !== store.ui.page) continue;
      const kind = isMeasurementKind(item.kind) ? "measure" : "draw";
      if (settings.typeFilter !== "all" && kind !== settings.typeFilter) continue;
      const category = isMeasurementKind(item.kind) ? categoryForItem(project, item) : undefined;
      if (settings.categoryId && category?.id !== settings.categoryId) continue;
      if (query) {
        const haystack =
          `${itemLabel(item, project)} ${itemKindLabel(item.kind)} ${layer.name} ${item.text ?? ""} ${item.room ?? ""} ${category?.name ?? ""} ${item.kind === "count" ? countTypeLabel(item.countType) : ""} ${item.kind === "area" && item.areaMode === "subtract" ? "deduct deduction" : ""}`.toLocaleLowerCase();
        if (!haystack.includes(query)) continue;
      }
      rows.push({ item, layer });
    }
  }
  rows.sort((a, b) => compareRows(a, b, project));
  return rows;
}

function compareRows(a: MarkupRow, b: MarkupRow, project: Project): number {
  const sort = settings.sort;
  if (sort) {
    const left = sortValue(a, sort.column, project);
    const right = sortValue(b, sort.column, project);
    let result = 0;
    if (typeof left === "number" && typeof right === "number") result = left - right;
    else result = String(left).localeCompare(String(right), undefined, { numeric: true });
    if (result !== 0) return sort.direction === "desc" ? -result : result;
  }
  return (
    a.item.page - b.item.page ||
    a.layer.name.localeCompare(b.layer.name) ||
    itemLabel(a.item, project).localeCompare(itemLabel(b.item, project), undefined, {
      numeric: true,
    })
  );
}

function sortValue(row: MarkupRow, column: MarkupsColumnId, project: Project): string | number {
  const category = isMeasurementKind(row.item.kind)
    ? categoryForItem(project, row.item)
    : undefined;
  switch (column) {
    case "name":
      return itemLabel(row.item, project).toLocaleLowerCase();
    case "type":
      return itemKindLabel(row.item.kind);
    case "page":
      return row.item.page;
    case "layer":
      return row.layer.name.toLocaleLowerCase();
    case "value":
      return itemMetrics(row.item, project)?.rawPoints ?? 0;
    case "category":
      return category?.name.toLocaleLowerCase() ?? "";
    case "room":
      return (row.item.room ?? "").toLocaleLowerCase();
    case "visible":
      return itemIsVisible(row.item, row.layer) ? 0 : 1;
    case "locked":
      return itemIsLocked(row.item, row.layer) ? 0 : 1;
  }
}

function groupValue(row: MarkupRow, field: MarkupsGroupField, project: Project): string {
  switch (field) {
    case "category": {
      if (!isMeasurementKind(row.item.kind)) return "Uncategorized";
      return categoryForItem(project, row.item)?.name ?? "Uncategorized";
    }
    case "room":
      return row.item.room?.trim() || "Unassigned";
    case "page": {
      const name = pageDisplayName(project, row.item.page);
      return name ? `Page ${row.item.page} · ${name}` : `Page ${row.item.page}`;
    }
    case "layer":
      return row.layer.name;
    case "building":
      return pageBuilding(project, row.item.page) ?? "Unassigned";
    case "floor":
      return pageFloor(project, row.item.page) ?? "Unassigned";
  }
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
  columns: MarkupsColumnId[],
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

  const label = el("span", "markups-item-label", labelText);
  const cells = new Map<MarkupsColumnId, HTMLTableCellElement>();

  const nameCell = el("td", "markups-name-cell");
  const nameWrap = el("div", "markups-name");
  const itemIcon = el("span", "markups-item-icon");
  itemIcon.innerHTML = icon(markupIcon(item.kind), 14);
  itemIcon.style.color = item.color;
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
  cells.set("name", nameCell);

  cells.set("type", el("td", "markups-type", itemKindLabel(item.kind)));

  const pageCell = el("td", "markups-page", `p.${item.page}`);
  const pageName = pageDisplayName(project, item.page);
  if (pageName) pageCell.title = `Page ${item.page} · ${pageName}`;
  cells.set("page", pageCell);

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
    if (moved) store.setSelection({ layerId: target, itemId: item.id });
    else refreshRows();
  });
  layerCell.append(layerSelect);
  cells.set("layer", layerCell);

  const valueCell = el("td", "markups-value", metrics?.primary ?? "–");
  cells.set("value", valueCell);

  const categoryCell = el("td", "markups-category", category?.name ?? "–");
  cells.set("category", categoryCell);

  const roomCell = el("td", "markups-room", item.room ?? "–");
  cells.set("room", roomCell);

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
  cells.set("visible", visibleCell);

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
  cells.set("locked", lockedCell);

  for (const column of columns) {
    const cell = cells.get(column);
    if (cell) tr.append(cell);
  }

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
  if (!project) {
    currentProjectId = null;
    activeViewId = null;
    settings = defaultMarkupsViewSettings();
    viewDirty = false;
    collapsedGroups.clear();
  } else {
    syncProject(project);
  }

  const visible = markupsOpen && Boolean(project);
  refs.markupsPanel.hidden = !visible;
  refs.markupsResizer.hidden = !visible;
  if (!visible || !project) return;

  bindResizer(refs);
  const panel = refs.markupsPanel;
  panel.style.setProperty("--markups-h", `${markupsHeight}px`);
  const previousScroll = panel.querySelector<HTMLElement>(".markups-table-wrap")?.scrollTop ?? 0;
  clear(panel);
  viewDirtyEl = null;
  saveViewBtn = null;

  const head = el("div", "markups-head");
  const title = el("div", "markups-title");
  title.append(el("span", "markups-title-text", "Markups"));
  const count = el("span", "markups-count", "0");
  title.append(count);
  const headActions = el("div", "markups-head-actions");

  const viewSelect = el("select", "select markups-view-select");
  viewSelect.setAttribute("aria-label", "Markups view");
  viewSelect.title = "Apply a saved Markups view";
  viewSelect.append(option("", "All markups", !activeViewId));
  for (const view of project.markupsViews) {
    viewSelect.append(option(view.id, view.name, view.id === activeViewId));
  }
  viewSelect.value = activeViewId ?? "";
  viewSelect.addEventListener("change", () => {
    const nextId = viewSelect.value || null;
    const proceed = async () => {
      if (viewDirty && activeViewId && nextId !== activeViewId) {
        const discard = await confirmDialog(
          "Discard view changes?",
          "The current columns and filters have not been saved to this view.",
          "Discard changes",
          { danger: true },
        );
        if (!discard) {
          viewSelect.value = activeViewId;
          return;
        }
      }
      applyView(nextId, actions);
    };
    void proceed();
  });

  viewDirtyEl = el("span", "markups-view-dirty", "•");
  viewDirtyEl.title = "Unsaved view changes";
  viewDirtyEl.hidden = true;

  saveViewBtn = el("button", "icon-btn markups-save-view");
  saveViewBtn.type = "button";
  saveViewBtn.innerHTML = icon("check", 14);
  saveViewBtn.setAttribute("aria-label", "Save view");
  saveViewBtn.addEventListener("click", () => saveCurrentView(actions));

  const more = el("button", "icon-btn");
  more.type = "button";
  more.title = "More view options";
  more.setAttribute("aria-label", "More view options");
  more.innerHTML = icon("settings", 14);
  more.addEventListener("click", () =>
    showPopover(more, [
      {
        label: "Save as new view…",
        icon: "plus",
        action: () => void saveViewAs(actions),
      },
      {
        label: "Manage views…",
        icon: "settings",
        action: () => openManageViews(project, actions),
      },
    ]),
  );

  const columns = el("button", "btn btn-small btn-ghost", "Columns");
  columns.type = "button";
  columns.title = "Show or hide Markups columns";
  columns.innerHTML = `${icon("grid", 13)}<span>Columns</span>`;
  columns.addEventListener("click", () => openColumnsDialog(actions));

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

  headActions.append(viewSelect, viewDirtyEl, saveViewBtn, more, columns, exportCsv, close);
  head.append(title, headActions);

  const toolbar = el("div", "markups-toolbar");
  const pageSelect = el("select", "select markups-page-filter");
  pageSelect.setAttribute("aria-label", "Filter markups by page");
  pageSelect.append(
    option("all", "All pages", settings.pageFilter === "all"),
    option("current", `Current page (${store.ui.page})`, settings.pageFilter === "current"),
  );
  pageSelect.value = settings.pageFilter;
  pageSelect.addEventListener("change", () => {
    settings.pageFilter = pageSelect.value === "current" ? "current" : "all";
    collapsedGroups.clear();
    markViewDirty();
    refreshTable();
  });

  const typeSelect = el("select", "select markups-type-filter");
  typeSelect.setAttribute("aria-label", "Filter markups by type");
  typeSelect.append(
    option("all", "All types", settings.typeFilter === "all"),
    option("measure", "Measurements", settings.typeFilter === "measure"),
    option("draw", "Drawings", settings.typeFilter === "draw"),
  );
  typeSelect.value = settings.typeFilter;
  typeSelect.addEventListener("change", () => {
    settings.typeFilter =
      typeSelect.value === "measure" || typeSelect.value === "draw"
        ? (typeSelect.value as "measure" | "draw")
        : "all";
    collapsedGroups.clear();
    markViewDirty();
    refreshTable();
  });

  const categorySelect = el("select", "select markups-category-filter");
  categorySelect.setAttribute("aria-label", "Filter markups by category");
  categorySelect.append(option("", "All categories", !settings.categoryId));
  for (const category of project.categories) {
    categorySelect.append(option(category.id, category.name, category.id === settings.categoryId));
  }
  categorySelect.value = settings.categoryId ?? "";
  categorySelect.addEventListener("change", () => {
    settings.categoryId = categorySelect.value || null;
    collapsedGroups.clear();
    markViewDirty();
    refreshTable();
  });

  const groupSelect = el("select", "select markups-group-select");
  groupSelect.setAttribute("aria-label", "Group markups");
  const groupPreset = markupsGroupPresetFor(settings.groupBy);
  for (const preset of MARKUPS_GROUP_PRESETS) {
    groupSelect.append(option(preset.id, preset.label, preset.id === groupPreset?.id));
  }
  if (!groupPreset && settings.groupBy.length) {
    groupSelect.append(option("custom", "Custom grouping", true));
  }
  groupSelect.value = groupPreset?.id ?? (settings.groupBy.length ? "custom" : "none");
  groupSelect.addEventListener("change", () => {
    const preset = MARKUPS_GROUP_PRESETS.find((entry) => entry.id === groupSelect.value);
    if (!preset) return;
    settings.groupBy = [...preset.fields];
    collapsedGroups.clear();
    markViewDirty();
    refreshTable();
  });

  const search = el("input", "input markups-search");
  search.type = "search";
  search.placeholder = "Filter by name, type, layer, category or room…";
  search.value = settings.search;
  search.setAttribute("aria-label", "Filter markups");
  search.addEventListener("input", () => {
    settings.search = search.value;
    markViewDirty();
    refreshTable();
  });

  const selectAll = el("button", "btn btn-small btn-ghost", "Select all");
  selectAll.type = "button";
  selectAll.title = "Select all markups matching the current filter";
  selectAll.addEventListener("click", () => {
    store.setSelectionMany(rows.map((row) => ({ layerId: row.layer.id, itemId: row.item.id })));
  });

  toolbar.append(pageSelect, typeSelect, categorySelect, groupSelect, search, selectAll);
  panel.append(head, toolbar);

  const wrap = el("div", "markups-table-wrap");
  const table = el("table", "markups-table");
  wrap.append(table);
  panel.append(wrap);

  const foot = el("div", "markups-foot");
  const footLeft = el("span", "markups-foot-count", "");
  const footRight = el("span", "markups-foot-hint", "Click a row to navigate · F2 rename");
  foot.append(footLeft, footRight);
  panel.append(foot);

  let rows: MarkupRow[] = [];

  function refreshTable(): void {
    clear(table);
    const columns = settings.columns;
    const colgroup = el("colgroup");
    for (const column of columns) {
      const col = el("col");
      col.style.width = `${COLUMN_WIDTHS[column]}%`;
      colgroup.append(col);
    }
    const thead = el("thead");
    const headerRow = el("tr");
    for (const column of columns) {
      const th = el("th");
      th.scope = "col";
      th.dataset.column = column;
      const sorted = settings.sort?.column === column ? settings.sort.direction : null;
      th.setAttribute(
        "aria-sort",
        sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none",
      );
      const button = el("button", "markups-sort-button");
      button.type = "button";
      button.title = `Sort by ${MARKUPS_COLUMN_LABELS[column]}`;
      button.append(el("span", "", MARKUPS_COLUMN_LABELS[column]));
      if (sorted) {
        button.append(el("span", "markups-sort-arrow", sorted === "asc" ? "↑" : "↓"));
      }
      button.addEventListener("click", () => {
        if (settings.sort?.column !== column) {
          settings.sort = { column, direction: "asc" };
        } else if (settings.sort.direction === "asc") {
          settings.sort = { column, direction: "desc" };
        } else {
          settings.sort = null;
        }
        markViewDirty();
        refreshTable();
      });
      th.append(button);
      headerRow.append(th);
    }
    thead.append(headerRow);

    const tbody = el("tbody");
    const currentProject = project!;
    rows = filteredRows(currentProject);
    if (!rows.length) {
      const emptyRow = el("tr", "markups-empty");
      const cell = el("td");
      cell.colSpan = columns.length;
      cell.innerHTML = `${icon("markups", 22)}<div>No items match this filter.</div>`;
      emptyRow.append(cell);
      tbody.append(emptyRow);
    } else if (settings.groupBy.length) {
      const groups = groupMarkupRows(rows, settings.groupBy, (row, field) =>
        groupValue(row, field, currentProject),
      );
      for (const group of groups) {
        appendGroup(group, 0, tbody, columns, actions, refreshTable);
      }
    } else {
      for (const row of rows) tbody.append(markupRowElement(row, columns, actions, refreshTable));
    }
    table.append(colgroup, thead, tbody);
    count.textContent = String(rows.length);
    footLeft.textContent = `${rows.length} item${rows.length === 1 ? "" : "s"} · ${store.ui.selection.length} selected`;
    updateViewControls();
  }

  refreshTable();
  wrap.scrollTop = previousScroll;
}

function appendGroup(
  group: MarkupGroup<MarkupRow>,
  level: number,
  tbody: HTMLElement,
  columns: MarkupsColumnId[],
  actions: PanelActions,
  refreshRows: () => void,
): void {
  const collapsed = collapsedGroups.has(group.key);
  const row = el("tr", "markups-group-row");
  const cell = el("td");
  cell.colSpan = columns.length;
  cell.style.paddingLeft = `${8 + level * 16}px`;
  const toggle = el("button", "markups-group-toggle");
  toggle.type = "button";
  toggle.title = collapsed ? "Expand group" : "Collapse group";
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.innerHTML = icon(collapsed ? "chevronRight" : "chevronDown", 12);
  toggle.addEventListener("click", () => {
    if (collapsedGroups.has(group.key)) collapsedGroups.delete(group.key);
    else collapsedGroups.add(group.key);
    refreshRows();
  });
  cell.append(
    toggle,
    el("span", "markups-group-label", group.value),
    el("span", "markups-group-count", String(group.count)),
  );
  row.append(cell);
  tbody.append(row);
  if (collapsed) return;
  if (group.children.length) {
    for (const child of group.children) {
      appendGroup(child, level + 1, tbody, columns, actions, refreshRows);
    }
    return;
  }
  for (const entry of group.rows) {
    tbody.append(markupRowElement(entry, columns, actions, refreshRows));
  }
}

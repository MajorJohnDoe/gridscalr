import { pageCalibration, pageScale } from "../model/calibration";
import { hasClipboard } from "../model/clipboard";
import {
  duplicateLayer,
  findItem,
  isMeasurementKind,
  itemIsLocked,
  itemIsVisible,
  layersForKind,
  moveItemToLayer,
  moveLayer,
  removeLayer,
  swapLayers,
} from "../model/layers";
import { itemKindLabel, itemLabel, itemMetrics } from "../model/measure";
import { resolveSelection, selectionKind } from "../model/selection";
import type {
  AreaUnit,
  Layer,
  LengthUnit,
  MarkupItem,
  PageSize,
  RecentEntry,
  LayerKind,
  SelectionRef,
} from "../model/types";
import {
  AREA_UNITS,
  LENGTH_UNITS,
  formatCoordinate,
  formatNumber,
  formatScale,
} from "../model/units";
import { store, toolLayerKind } from "../state/store";
import type { AutosavePayload } from "../state/store";
import { clear, el, option } from "./dom";
import { confirmDialog, textDialog } from "./dialogs";
import { openCategoriesDialog } from "./categoriesDialog";
import { icon } from "./icons";
import type { ShellRefs } from "./shell";
import { TOOL_BY_ID } from "./toolDefs";
import { toast } from "./toast";

export interface PanelActions {
  openPdf: () => void;
  openProject: () => void;
  saveProject: () => void;
  exportAs: (kind: "csv" | "json" | "png" | "pdf") => void;
  startCalibration: () => void;
  clearCalibration: () => void;
  deleteSelection: () => void;
  editSelectedText: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  pasteSelection: () => void;
  duplicateSelection: () => void;
  moveSelectionToLayer: (layerId: string) => void;
  setSelectionVisible: (visible: boolean) => void;
  setSelectionLocked: (locked: boolean) => void;
  setSelectionColor: (color: string) => void;
  goToPage: (page: number, fit?: boolean) => void;
  navigateToItem: (page: number, layerId: string, itemId: string) => void;
  ensurePageSize: (page: number) => void;
  getPageSize: (page: number) => PageSize | undefined;
  refresh: () => void;
  restoreAutosave: () => void;
  getAutosave: () => AutosavePayload | null;
  openRecent: (entry: RecentEntry) => void;
}

let markupPageFilter: "current" | "all" = "current";
let markupKindFilter = "all";
let markupSearch = "";

function beginMarkupRename(label: HTMLElement, itemId: string, fallbackLabel: string): void {
  if (label.querySelector(".markup-label-input")) return;
  const found = store.project ? findItem(store.project, itemId) : undefined;
  if (found && itemIsLocked(found.item, found.layer)) {
    toast("This markup is locked.", "warning");
    return;
  }
  const original = found?.item.label ?? "";
  const input = document.createElement("input");
  input.className = "markup-label-input";
  input.value = original;
  input.placeholder = fallbackLabel;
  input.setAttribute("aria-label", "Markup name");
  label.replaceWith(input);
  input.focus({ preventScroll: true });
  input.select();

  let finished = false;
  const finish = (commit: boolean) => {
    if (finished) return;
    finished = true;
    if (!commit) {
      input.replaceWith(label);
      return;
    }
    const value = input.value.trim();
    if (value === original) {
      input.replaceWith(label);
      return;
    }
    store.mutate(
      (project) => {
        const item = findItem(project, itemId)?.item;
        if (item) {
          item.label = value || undefined;
          item.updatedAt = new Date().toISOString();
        }
      },
      "change",
    );
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

/** Starts an inline rename for the selected markup; falls back to the inspector. */
export function requestMarkupRename(refs: ShellRefs): void {
  const selection = store.ui.selection.length === 1 ? store.primarySelection : null;
  if (!selection) {
    toast("Select one markup to rename it.", "info");
    return;
  }
  store.setLeftTab("markups");
  window.requestAnimationFrame(() => {
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(selection.itemId) : selection.itemId;
    const row = refs.dockBody.querySelector<HTMLElement>(`[data-item-id="${escaped}"]`);
    const label = row?.querySelector<HTMLElement>(".markup-label");
    if (label) {
      beginMarkupRename(label, selection.itemId, row?.dataset.label ?? "Markup name");
      return;
    }
    const fallback = refs.inspector.querySelector<HTMLInputElement>('[data-role="selection-label"]');
    if (fallback) {
      fallback.focus({ preventScroll: true });
      fallback.select();
    }
  });
}

export function renderChrome(refs: ShellRefs, actions: PanelActions): void {
  renderTopbar(refs, actions);
  renderToolRail(refs);
  renderDock(refs, actions);
  renderContextBar(refs, actions);
  renderInspector(refs, actions);
  renderStatus(refs);
  renderWelcome(refs, actions);
}

export function renderTopbar(refs: ShellRefs, _actions: PanelActions): void {
  const project = store.project;
  const hasProject = Boolean(project);
  refs.projectName.hidden = !hasProject;
  if (!refs.projectName.isContentEditable) {
    refs.projectName.textContent = project?.name ?? "";
  }
  refs.projectName.title = "Double-click to rename project";
  refs.docName.textContent = project?.document.name ?? "No drawing open";
  refs.docMeta.textContent = project
    ? `Page ${store.ui.page} of ${project.document.pageCount}`
    : "";
  refs.dirtyDot.classList.toggle("hidden", !store.dirty || !hasProject);
  refs.dirtyDot.title = "Unsaved changes";
  refs.openPdfBtn.disabled = false;
  refs.openProjectBtn.disabled = false;
  refs.saveBtn.disabled = !hasProject;
  refs.exportBtn.disabled = !hasProject;
  refs.undoBtn.disabled = !store.canUndo;
  refs.redoBtn.disabled = !store.canRedo;
  refs.zoomReadout.textContent = `${Math.round(store.ui.zoom * 100)}%`;
  refs.pageInput.disabled = !hasProject;
  refs.pagePrevBtn.disabled = !hasProject || store.ui.page <= 1;
  refs.pageNextBtn.disabled = !hasProject || store.ui.page >= (project?.document.pageCount ?? 1);
  if (document.activeElement !== refs.pageInput) {
    refs.pageInput.value = hasProject ? String(store.ui.page) : "1";
  }
  refs.pageTotal.textContent = `/ ${project?.document.pageCount ?? 0}`;
}

function renderToolRail(refs: ShellRefs): void {
  for (const btn of refs.toolRail.querySelectorAll<HTMLElement>("[data-tool]")) {
    btn.classList.toggle("is-active", btn.dataset.tool === store.ui.activeTool);
  }
}

export function updateStatus(refs: ShellRefs): void {
  renderStatus(refs);
}

function renderStatus(refs: ShellRefs): void {
  const project = store.project;
  clear(refs.statusCalibration);
  clear(refs.statusCoords);
  clear(refs.statusZoom);
  clear(refs.statusPage);
  clear(refs.statusLayer);

  if (!project) {
    refs.statusCalibration.append(chip("No drawing open", "warning"));
    refs.statusZoom.innerHTML = `<span class="status-label">Zoom</span> <span class="status-value">—</span>`;
    return;
  }

  const calibration = pageCalibration(project, store.ui.page);
  const scale = pageScale(project, store.ui.page);
  refs.statusCalibration.append(
    calibration
      ? chip(`Calibrated · ${formatScale(scale)}`, "calibrated")
      : chip("No scale on this page", "warning"),
  );

  const cursor = store.ui.cursor;
  const coords = cursor
    ? `X ${formatCoordinate(cursor.x, scale, project.settings.lengthUnit)}  Y ${formatCoordinate(cursor.y, scale, project.settings.lengthUnit)} ${scale ? project.settings.lengthUnit : "pt"}`
    : "X —  Y —";
  refs.statusCoords.innerHTML = `<span class="status-label">Cursor</span> <span class="status-value">${coords}</span>`;
  refs.statusZoom.innerHTML = `<span class="status-label">Zoom</span> <span class="status-value">${Math.round(store.ui.zoom * 100)}%</span>`;
  refs.statusPage.innerHTML = `<span class="status-label">Page</span> <span class="status-value">${store.ui.page} / ${project.document.pageCount}</span>`;
  const active = project.layers.find((l) => l.id === project.activeLayerId);
  refs.statusLayer.innerHTML = active
    ? `<span class="status-label">Layer</span> <span class="status-value" style="color:${active.color}">${escapeHtml(active.name)}</span>`
    : "";
}

function chip(text: string, kind: "calibrated" | "warning"): HTMLElement {
  const node = el("span", `status-chip${kind === "calibrated" ? " is-calibrated" : " is-warning"}`);
  node.innerHTML = `<span class="status-dot"></span>`;
  node.append(document.createTextNode(text));
  return node;
}

export function renderDock(refs: ShellRefs, actions: PanelActions): void {
  for (const tab of refs.dockTabs) {
    tab.classList.toggle("is-active", tab.dataset.tab === store.ui.leftTab);
  }
  clear(refs.dockBody);
  clear(refs.dockFooter);
  if (!store.project) {
    const note = el("div", "empty-note");
    note.innerHTML = `${icon("folder", 26)}<div>Open a PDF drawing to start measuring.</div>`;
    refs.dockBody.append(note);
    return;
  }
  switch (store.ui.leftTab) {
    case "pages":
      renderPages(refs, actions);
      break;
    case "layers":
      renderLayers(refs, actions);
      break;
    case "markups":
      renderMarkups(refs, actions);
      break;
  }
}

/* ---------------- Layers ---------------- */

function renderLayers(refs: ShellRefs, actions: PanelActions): void {
  const project = store.project!;
  const groups: Array<{ kind: LayerKind; title: string; note: string }> = [
    { kind: "draw", title: "Drawing layers", note: "Below measurements" },
    { kind: "measure", title: "Measurement layers", note: "Top of stack" },
  ];

  let draggedId: string | null = null;

  for (const group of groups) {
    const layers = [...layersForKind(project, group.kind)].reverse();
    const header = el("div", "layer-group-title");
    const label = el("span", "", group.title);
    label.title = group.note;
    header.append(label, el("span", "count", String(layers.length)));
    refs.dockBody.append(header);

    for (const layer of layers) {
      const row = el("div", "layer-row");
      row.dataset.layerId = layer.id;
      row.classList.toggle("is-active", layer.id === project.activeLayerId);
      row.classList.toggle("is-hidden", !layer.visible);
      row.draggable = true;

      const grip = el("span", "layer-grip");
      grip.innerHTML = icon("up", 11);
      grip.title = "Drag to reorder within this group";

      const color = el("input", "layer-color");
      color.type = "color";
      color.value = layer.color;
      color.title = "Layer colour";
      color.addEventListener("click", (event) => event.stopPropagation());
      color.addEventListener("change", () => {
        store.mutate(
          (project) => {
            const target = project.layers.find((l) => l.id === layer.id);
            if (!target) return;
            target.color = color.value;
            for (const item of target.items) item.color = color.value;
          },
          "layers",
        );
      });

      const name = el("span", "layer-name", layer.name);
      name.title = layer.name;
      name.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        beginInlineRename(row, name, layer.id);
      });

      const count = el("span", "layer-count", String(layer.items.length));
      count.title = `${layer.items.length} items`;

      const actionsWrap = el("div", "layer-actions");
      const eye = layerAction(layer.visible ? "eye" : "eyeOff", layer.visible ? "Hide layer" : "Show layer");
      eye.classList.toggle("is-on", layer.visible);
      eye.addEventListener("click", (event) => {
        event.stopPropagation();
        store.mutate(
          (project) => {
            const target = project.layers.find((l) => l.id === layer.id);
            if (target) target.visible = !target.visible;
          },
          "layers",
        );
      });
      const lock = layerAction(layer.locked ? "lock" : "unlock", layer.locked ? "Unlock layer" : "Lock layer");
      lock.classList.toggle("is-locked", layer.locked);
      lock.addEventListener("click", (event) => {
        event.stopPropagation();
        store.mutate(
          (project) => {
            const target = project.layers.find((l) => l.id === layer.id);
            if (target) target.locked = !target.locked;
          },
          "layers",
        );
      });
      const menu = layerAction("markups", "Layer actions", "layer-menu-btn");
      menu.addEventListener("click", (event) => {
        event.stopPropagation();
        showLayerMenu(menu, layer.id, actions);
      });
      actionsWrap.append(eye, lock, menu);

      row.append(grip, color, name, count, actionsWrap);
      row.addEventListener("click", () => {
        store.setActiveLayer(layer.id);
        if (!layer.visible) toast("This layer is hidden. Show it to edit its contents.", "warning");
      });
      row.addEventListener("dragstart", (event) => {
        draggedId = layer.id;
        event.dataTransfer?.setData("text/plain", layer.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        row.classList.add("is-dragging");
      });
      row.addEventListener("dragend", () => {
        draggedId = null;
        row.classList.remove("is-dragging");
      });
      row.addEventListener("dragover", (event) => {
        if (!draggedId || draggedId === layer.id) return;
        const other = project.layers.find((l) => l.id === draggedId);
        if (!other || other.kind !== layer.kind) return;
        event.preventDefault();
        row.classList.add("is-drop-target");
      });
      row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        row.classList.remove("is-drop-target");
        const sourceId = draggedId ?? event.dataTransfer?.getData("text/plain");
        if (!sourceId || sourceId === layer.id) return;
        store.mutate(
          (project) => {
            swapLayers(project, sourceId, layer.id);
          },
          "layers",
        );
      });

      refs.dockBody.append(row);
    }
  }

  refs.dockBody.append(el("div", "layer-add-row"));
  const addRow = refs.dockBody.lastElementChild as HTMLElement;
  const addMeasure = el("button", "btn btn-small", "+ Measure layer");
  addMeasure.type = "button";
  addMeasure.addEventListener("click", () => {
    store.createLayer("measure");
    toast("Measurement layer created.", "success");
  });
  const addDraw = el("button", "btn btn-small", "+ Drawing layer");
  addDraw.type = "button";
  addDraw.addEventListener("click", () => {
    store.createLayer("draw");
    toast("Drawing layer created.", "success");
  });
  addRow.append(addMeasure, addDraw);

  const active = project.layers.find((l) => l.id === project.activeLayerId);
  if (active) {
    const note = el("div", "empty-note small");
    note.style.paddingTop = "4px";
    note.innerHTML = `${icon("info", 14)} Items are created in <strong>${escapeHtml(active.name)}</strong> (${active.kind === "measure" ? "measurement" : "drawing"} layer).`;
    refs.dockBody.append(note);
  }

  const footerMeasure = el("button", "btn btn-small btn-ghost", "New measurement layer");
  footerMeasure.type = "button";
  footerMeasure.addEventListener("click", () => store.createLayer("measure"));
  const footerDraw = el("button", "btn btn-small btn-ghost", "New drawing layer");
  footerDraw.type = "button";
  footerDraw.addEventListener("click", () => store.createLayer("draw"));
  refs.dockFooter.append(footerMeasure, footerDraw);
}

function layerAction(iconName: string, label: string, extraClass = ""): HTMLButtonElement {
  const btn = el("button", `layer-action ${extraClass}`.trim());
  btn.type = "button";
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = icon(iconName, 13);
  return btn;
}

function beginInlineRename(row: HTMLElement, name: HTMLElement, layerId: string): void {
  const input = el("input", "layer-name-input");
  input.value = name.textContent ?? "";
  row.replaceChild(input, name);
  input.focus();
  input.select();
  let done = false;
  const commit = (save: boolean) => {
    if (done) return;
    done = true;
    if (save && input.value.trim()) {
      store.mutate(
        (project) => {
          const layer = project.layers.find((l) => l.id === layerId);
          if (layer) layer.name = input.value.trim();
        },
        "layers",
      );
    } else {
      store.emit("layers");
    }
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") commit(true);
    if (event.key === "Escape") commit(false);
    event.stopPropagation();
  });
  input.addEventListener("blur", () => commit(true));
  input.addEventListener("click", (event) => event.stopPropagation());
}

function showLayerMenu(anchor: HTMLElement, layerId: string, actions: PanelActions): void {
  const project = store.project;
  const layer = project?.layers.find((l) => l.id === layerId);
  if (!layer) return;
  const group = project!.layers.filter((l) => l.kind === layer.kind);
  const index = group.findIndex((l) => l.id === layerId);
  showPopover(anchor, [
    {
      label: "Rename…",
      icon: "text",
      action: () => {
        void textDialog("Rename layer", "Layer", layer.name, "Layer name").then((value) => {
          if (!value) return;
          store.mutate(
            (project) => {
              const target = project.layers.find((l) => l.id === layerId);
              if (target) target.name = value;
            },
            "layers",
          );
        });
      },
    },
    {
      label: "Duplicate",
      icon: "copy",
      action: () => store.mutate((project) => duplicateLayer(project, layerId), "layers"),
    },
    {
      label: `Move selection here (${store.ui.selection.length})`,
      icon: "layers",
      disabled:
        store.ui.selection.length === 0 ||
        selectionKind(project!, store.ui.selection) !== layer.kind ||
        layer.locked,
      action: () => actions.moveSelectionToLayer(layerId),
    },
    {
      label: "Move up",
      icon: "up",
      disabled: index <= 0,
      action: () => store.mutate((project) => moveLayer(project, layerId, 1), "layers"),
    },
    {
      label: "Move down",
      icon: "down",
      disabled: index < 0 || index >= group.length - 1,
      action: () => store.mutate((project) => moveLayer(project, layerId, -1), "layers"),
    },
    { separator: true },
    {
      label: "Clear layer",
      icon: "trash",
      danger: true,
      disabled: layer.items.length === 0,
      action: () => {
        void confirmDialog(
          "Clear layer",
          `Remove all ${layer.items.length} items from “${layer.name}”? This can be undone.`,
          "Clear",
          { danger: true },
        ).then((confirmed) => {
          if (!confirmed) return;
          store.mutate(
            (project) => {
              const target = project.layers.find((l) => l.id === layerId);
              if (target) target.items = [];
            },
            "layers",
          );
        });
      },
    },
    {
      label: "Delete layer",
      icon: "trash",
      danger: true,
      action: () => {
        void confirmDialog(
          "Delete layer",
          `Delete “${layer.name}”${layer.items.length ? ` and its ${layer.items.length} items` : ""}? This can be undone.`,
          "Delete",
          { danger: true },
        ).then((confirmed) => {
          if (!confirmed) return;
          store.mutate((project) => removeLayer(project, layerId), "layers");
          actions.refresh();
        });
      },
    },
  ]);
}

/* ---------------- Pages ---------------- */

function renderPages(refs: ShellRefs, actions: PanelActions): void {
  const project = store.project!;
  const list = el("div", "page-list");
  const total = project.document.pageCount;
  const max = Math.min(total, 400);
  for (let page = 1; page <= max; page++) {
    actions.ensurePageSize(page);
    const card = el("button", "page-card");
    card.type = "button";
    card.classList.toggle("is-active", page === store.ui.page);
    const thumb = el("div", "page-thumb");
    const size = actions.getPageSize(page);
    if (size) {
      thumb.style.aspectRatio = `${size.width} / ${size.height}`;
    }
    const thumbNumber = el("span", "page-thumb-placeholder", String(page));
    thumb.append(thumbNumber);
    const info = el("div", "page-info");
    info.append(el("div", "page-title", `Page ${page}`));
    const sizeNode = el(
      "div",
      "page-size",
      size ? `${Math.round(size.width)} × ${Math.round(size.height)} pt` : "Loading size…",
    );
    info.append(sizeNode);
    const badges = el("div", "page-badges");
    if (project.pages[String(page)]?.calibration) {
      badges.append(el("span", "page-badge is-calibrated", "Calibrated"));
    }
    const itemCount = project.layers.reduce(
      (count, layer) => count + layer.items.filter((item) => item.page === page).length,
      0,
    );
    if (itemCount) badges.append(el("span", "page-badge", `${itemCount} items`));
    if (badges.childElementCount) info.append(badges);
    card.append(thumb, info);
    card.addEventListener("click", () => actions.goToPage(page, true));
    list.append(card);
  }
  refs.dockBody.append(list);
  if (total > max) {
    const note = el("div", "empty-note small", `Showing the first ${max} of ${total} pages.`);
    refs.dockBody.append(note);
  }
  const footer = el("button", "btn btn-small btn-ghost", "Fit current page");
  footer.type = "button";
  footer.addEventListener("click", () => actions.goToPage(store.ui.page, true));
  refs.dockFooter.append(footer);
}

/* ---------------- Markups ---------------- */

function renderMarkups(refs: ShellRefs, actions: PanelActions): void {
  const project = store.project!;
  const toolbar = el("div", "markup-toolbar");
  const pageSelect = el("select", "select");
  pageSelect.append(option("current", "Current page"), option("all", "All pages"));
  pageSelect.value = markupPageFilter;
  const kindSelect = el("select", "select");
  kindSelect.append(option("all", "All types"), option("measure", "Measurements"), option("draw", "Drawings"));
  kindSelect.value = markupKindFilter;
  toolbar.append(pageSelect, kindSelect);

  const searchRow = el("div", "markup-toolbar");
  const search = el("input", "input");
  search.type = "search";
  search.placeholder = "Filter markups…";
  search.value = markupSearch;
  const selectAll = el("button", "btn btn-small btn-ghost", "Select all");
  selectAll.type = "button";
  selectAll.title = "Select all markups matching the current filter";
  searchRow.append(search, selectAll);
  const list = el("div", "markup-list");
  const total = el("div", "markup-total");
  let filteredRows: Array<{
    item: MarkupItem;
    layer: Layer;
    layerId: string;
    layerName: string;
    color: string;
  }> = [];

  const update = () => {
    clear(list);
    const query = markupSearch.trim().toLowerCase();
    const rows: Array<{
      item: MarkupItem;
      layer: Layer;
      layerId: string;
      layerName: string;
      color: string;
    }> = [];
    for (const layer of project.layers) {
      for (const item of layer.items) {
        if (markupPageFilter === "current" && item.page !== store.ui.page) continue;
        const kindGroup = isMeasurementKind(item.kind) ? "measure" : "draw";
        if (markupKindFilter !== "all" && kindGroup !== markupKindFilter) continue;
        if (query) {
          const haystack = `${itemLabel(item, project)} ${itemKindLabel(item.kind)} ${layer.name} ${item.text ?? ""}`.toLowerCase();
          if (!haystack.includes(query)) continue;
        }
        rows.push({ item, layer, layerId: layer.id, layerName: layer.name, color: layer.color });
      }
    }
    filteredRows = rows;
    rows.sort((a, b) => a.item.page - b.item.page || a.layerName.localeCompare(b.layerName));
    if (!rows.length) {
      const note = el("div", "empty-note");
      note.innerHTML = `${icon("markups", 24)}<div>No markups match this filter.</div>`;
      list.append(note);
    }
    for (const row of rows) {
      const metrics = itemMetrics(row.item, project);
      const fallbackLabel = itemLabel(row.item, project);
      const itemRow = el("div", "markup-row");
      itemRow.tabIndex = 0;
      itemRow.setAttribute("role", "button");
      itemRow.dataset.itemId = row.item.id;
      itemRow.dataset.label = fallbackLabel;
      const locked = itemIsLocked(row.item, row.layer);
      const visible = itemIsVisible(row.item, row.layer);
      itemRow.classList.toggle("is-selected", store.isSelected({ layerId: row.layerId, itemId: row.item.id }));
      itemRow.classList.toggle("is-hidden", !visible);
      itemRow.classList.toggle("is-locked", locked);
      const iconWrap = el("span", "markup-icon");
      iconWrap.innerHTML = icon(markupIcon(row.item.kind), 14);
      iconWrap.style.color = row.color;
      const label = el("span", "markup-label", fallbackLabel);
      label.title = `${row.item.text ?? fallbackLabel} — double-click to rename`;
      const value = el("span", "markup-value", metrics?.primary ?? "");
      const meta = el("span", "markup-meta", `${itemKindLabel(row.item.kind)} · ${row.layerName}`);
      const page = el("span", "markup-page", `p.${row.item.page}`);
      const rowActions = el("span", "markup-actions");
      const eye = layerAction(
        row.item.visible === false ? "eyeOff" : "eye",
        row.layer.visible
          ? row.item.visible === false
            ? "Show markup"
            : "Hide markup"
          : "Layer is hidden",
      );
      eye.classList.toggle("is-on", row.item.visible !== false && row.layer.visible);
      eye.disabled = !row.layer.visible;
      eye.addEventListener("click", (event) => {
        event.stopPropagation();
        const nextVisible = row.item.visible === false;
        store.mutate(
          (project) => {
            const target = findItem(project, row.item.id)?.item;
            if (target) target.visible = nextVisible;
          },
          "change",
        );
        if (!nextVisible) {
          store.setSelectionMany(
            store.ui.selection.filter((ref) => ref.itemId !== row.item.id),
          );
        }
      });
      const lock = layerAction(
        locked ? "lock" : "unlock",
        row.layer.locked ? "Layer is locked" : locked ? "Unlock markup" : "Lock markup",
      );
      lock.classList.toggle("is-locked", locked);
      lock.disabled = row.layer.locked;
      lock.addEventListener("click", (event) => {
        event.stopPropagation();
        const nextLocked = !row.item.locked;
        store.mutate(
          (project) => {
            const target = findItem(project, row.item.id)?.item;
            if (target) target.locked = nextLocked;
          },
          "change",
        );
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
    total.innerHTML = "";
    total.append(el("span", "", `${rows.length} markup${rows.length === 1 ? "" : "s"}`));
    total.append(el("span", "", markupPageFilter === "current" ? `Page ${store.ui.page}` : `${project.document.pageCount} pages`));
  };

  pageSelect.addEventListener("change", () => {
    markupPageFilter = pageSelect.value as "current" | "all";
    update();
  });
  kindSelect.addEventListener("change", () => {
    markupKindFilter = kindSelect.value;
    update();
  });
  search.addEventListener("input", () => {
    markupSearch = search.value;
    update();
  });
  selectAll.addEventListener("click", () => {
    store.setSelectionMany(
      filteredRows.map((row) => ({ layerId: row.layerId, itemId: row.item.id })),
    );
  });

  refs.dockBody.append(toolbar, searchRow, list, total);
  update();

  const exportBtn = el("button", "btn btn-small btn-ghost", "Export CSV");
  exportBtn.type = "button";
  exportBtn.innerHTML = `${icon("csv", 13)}<span>Export CSV</span>`;
  exportBtn.addEventListener("click", actions.exportAs.bind(null, "csv"));
  refs.dockFooter.append(exportBtn);
}

function markupIcon(kind: MarkupItem["kind"]): string {
  switch (kind) {
    case "length":
      return "length";
    case "area":
      return "area";
    case "count":
      return "count";
    case "pen":
      return "pen";
    case "line":
      return "line";
    case "arrow":
      return "arrow";
    case "rect":
      return "rect";
    case "ellipse":
      return "ellipse";
    case "highlight":
      return "highlight";
    case "text":
      return "text";
  }
}

/* ---------------- Context bar ---------------- */

function renderContextBar(refs: ShellRefs, _actions: PanelActions): void {
  clear(refs.contextBar);
  const project = store.project;
  const tool = TOOL_BY_ID.get(store.ui.activeTool);
  const toolWrap = el("div", "context-tool");
  if (tool) {
    toolWrap.innerHTML = icon(tool.icon, 17);
    toolWrap.append(el("span", "", tool.label));
  }
  refs.contextBar.append(toolWrap);
  refs.contextBar.append(el("div", "context-hint", tool?.hint ?? ""));
  if (!project) return;

  const controls = el("div", "context-controls");

  const activeLayer = project.layers.find((layer) => layer.id === project.activeLayerId);
  const targetKind = toolLayerKind(store.ui.activeTool);
  const layerTarget = el("label", "layer-target");
  if (activeLayer) {
    layerTarget.classList.toggle("is-warning", Boolean(targetKind && (!activeLayer.visible || activeLayer.locked)));
    const dot = el("span", "layer-target-dot");
    dot.style.background = activeLayer.color;
    const select = el("select", "select layer-target-select");
    select.title = "Layer that receives new items";
    select.setAttribute("aria-label", "Target layer");
    for (const kind of ["draw", "measure"] as LayerKind[]) {
      if (targetKind && kind !== targetKind) continue;
      const group = document.createElement("optgroup");
      group.label = kind === "measure" ? "Measurements" : "Drawings";
      for (const candidate of [...layersForKind(project, kind)].reverse()) {
        group.append(option(candidate.id, candidate.name, candidate.id === activeLayer.id));
      }
      if (group.childElementCount) select.append(group);
    }
    select.addEventListener("change", () => {
      store.setActiveLayer(select.value);
      const next = store.project?.layers.find((layer) => layer.id === select.value);
      if (targetKind && next && (!next.visible || next.locked)) {
        toast(
          `“${next.name}” is ${next.locked ? "locked" : "hidden"}. Unlock or show it before drawing.`,
          "warning",
        );
      }
    });
    layerTarget.append(
      el("span", "layer-target-label", "Layer"),
      dot,
      select,
    );
    if (targetKind && (!activeLayer.visible || activeLayer.locked)) {
      const warning = el("span", "layer-target-warning");
      warning.title = activeLayer.locked
        ? "The target layer is locked"
        : "The target layer is hidden";
      warning.innerHTML = icon(activeLayer.locked ? "lock" : "eyeOff", 13);
      layerTarget.append(warning);
    }
    controls.append(layerTarget, el("div", "divider-v"));
  }

  if (store.ui.activeTool === "pen" || store.ui.activeTool === "line" || store.ui.activeTool === "arrow" || store.ui.activeTool === "rect" || store.ui.activeTool === "ellipse" || store.ui.activeTool === "highlight" || store.ui.activeTool === "text") {
    const color = el("input", "color-swatch");
    color.type = "color";
    color.value = store.ui.style.color;
    color.title = "Markup colour";
    color.addEventListener("change", () => store.setStyle({ color: color.value }));
    const width = el("select", "select");
    for (const value of [1, 2, 3, 4, 6, 8]) {
      width.append(option(String(value), `${value} pt`, value === store.ui.style.strokeWidth));
    }
    width.title = "Stroke width";
    width.addEventListener("change", () => store.setStyle({ strokeWidth: Number(width.value) }));
    controls.append(color, width);
    if (store.ui.activeTool === "text") {
      const sizeWrap = el("label", "context-number");
      sizeWrap.title = "Text size in points";
      sizeWrap.append(el("span", "", "Size"));
      const fontSize = el("input", "input context-number-input");
      fontSize.type = "number";
      fontSize.min = "0.5";
      fontSize.max = "300";
      fontSize.step = "0.5";
      fontSize.value = String(store.ui.style.fontSize);
      fontSize.setAttribute("aria-label", "Text size in points");
      fontSize.addEventListener("change", () => {
        const value = Number(fontSize.value);
        if (Number.isFinite(value) && value > 0) {
          store.setStyle({ fontSize: Math.max(0.5, Math.min(300, value)) });
        } else {
          fontSize.value = String(store.ui.style.fontSize);
        }
      });
      sizeWrap.append(fontSize, el("span", "context-unit", "pt"));
      controls.append(sizeWrap);
    }
    controls.append(el("div", "divider-v"));
  }

  const lengthUnit = el("select", "select");
  for (const unit of LENGTH_UNITS) {
    lengthUnit.append(option(unit.id, unit.id, unit.id === project.settings.lengthUnit));
  }
  lengthUnit.title = "Length unit";
  lengthUnit.addEventListener("change", () => {
    store.mutate(
      (project) => {
        project.settings.lengthUnit = lengthUnit.value as LengthUnit;
      },
      "change",
    );
  });
  const areaUnit = el("select", "select");
  for (const unit of AREA_UNITS) {
    areaUnit.append(option(unit.id, unit.label, unit.id === project.settings.areaUnit));
  }
  areaUnit.title = "Area unit";
  areaUnit.addEventListener("change", () => {
    store.mutate(
      (project) => {
        project.settings.areaUnit = areaUnit.value as AreaUnit;
      },
      "change",
    );
  });
  controls.append(lengthUnit, areaUnit);

  controls.append(
    toggleButton("target", "Snap", project.settings.snapToGeometry, () => {
      store.mutate(
        (project) => {
          project.settings.snapToGeometry = !project.settings.snapToGeometry;
        },
        "change",
      );
    }),
    toggleButton("grid", "Grid", project.settings.showGrid, () => {
      store.mutate(
        (project) => {
          project.settings.showGrid = !project.settings.showGrid;
        },
        "change",
      );
    }),
    toggleButton("ruler", "Scale line", project.settings.showCalibration, () => {
      store.mutate(
        (project) => {
          project.settings.showCalibration = !project.settings.showCalibration;
        },
        "change",
      );
    }),
  );

  refs.contextBar.append(controls);
}

function toggleButton(iconName: string, label: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const btn = el("button", `toggle${active ? " is-on" : ""}`);
  btn.type = "button";
  btn.innerHTML = `${icon(iconName, 14)}<span>${label}</span>`;
  btn.setAttribute("aria-pressed", String(active));
  btn.addEventListener("click", onClick);
  return btn;
}

/* ---------------- Inspector ---------------- */

function renderInspector(refs: ShellRefs, actions: PanelActions): void {
  clear(refs.inspector);
  refs.inspector.append(el("div", "inspector-header", "Properties"));
  const project = store.project;
  if (!project) {
    const note = el("div", "empty-note");
    note.innerHTML = `${icon("info", 26)}<div>Open a drawing to see scale, layer and selection properties.</div>`;
    refs.inspector.append(note);
    return;
  }

  refs.inspector.append(scaleSection(project, actions));
  refs.inspector.append(unitsSection(project));
  refs.inspector.append(categoriesSection(project));
  refs.inspector.append(activeLayerSection(project, actions));
  refs.inspector.append(selectionSection(project, actions));
}

function scaleSection(project: NonNullable<typeof store.project>, actions: PanelActions): HTMLElement {
  const section = el("section", "inspector-section");
  const head = el("div", "section-head");
  head.append(el("h3", "", "Scale"));
  const calibration = pageCalibration(project, store.ui.page);
  head.append(
    el(
      "span",
      `status-chip${calibration ? " is-calibrated" : " is-warning"}`,
      calibration ? "Calibrated" : "No scale",
    ),
  );
  section.append(head);

  const card = el("div", `scale-card${calibration ? " is-calibrated" : ""}`);
  const status = el("div", "scale-status");
  const dot = el("span", "dot");
  status.append(dot, el("span", "", `Page ${store.ui.page}`));
  card.append(status);
  if (calibration) {
    const detail = el("div", "scale-detail");
    detail.innerHTML = `Reference: <strong>${formatNumber(calibration.knownLength, 2)} ${calibration.unit}</strong><br>${formatScale(pageScale(project, store.ui.page))}<br>All measurements on this page use this scale.`;
    card.append(detail);
  } else {
    card.append(
      el(
        "div",
        "scale-detail",
        "Draw a line over a known dimension to unlock real-world lengths and areas.",
      ),
    );
  }
  const buttons = el("div", "scale-actions");
  const calibrate = el("button", "btn btn-small", calibration ? "Recalibrate" : "Calibrate");
  calibrate.type = "button";
  calibrate.addEventListener("click", actions.startCalibration);
  buttons.append(calibrate);
  if (calibration) {
    const clearBtn = el("button", "btn btn-small btn-ghost", "Clear");
    clearBtn.type = "button";
    clearBtn.addEventListener("click", actions.clearCalibration);
    buttons.append(clearBtn);
  }
  card.append(buttons);
  section.append(card);
  return section;
}

function unitsSection(project: NonNullable<typeof store.project>): HTMLElement {
  const section = el("section", "inspector-section");
  section.append(el("h3", "", "Units & guides"));
  const lengthField = el("label", "field");
  lengthField.append(el("span", "field-label", "Length unit"));
  const lengthSelect = el("select", "select");
  for (const unit of LENGTH_UNITS) {
    lengthSelect.append(option(unit.id, unit.label, unit.id === project.settings.lengthUnit));
  }
  lengthSelect.addEventListener("change", () => {
    store.mutate(
      (project) => {
        project.settings.lengthUnit = lengthSelect.value as LengthUnit;
      },
      "change",
    );
  });
  lengthField.append(lengthSelect);

  const areaField = el("label", "field");
  areaField.append(el("span", "field-label", "Area unit"));
  const areaSelect = el("select", "select");
  for (const unit of AREA_UNITS) {
    areaSelect.append(option(unit.id, unit.label, unit.id === project.settings.areaUnit));
  }
  areaSelect.addEventListener("change", () => {
    store.mutate(
      (project) => {
        project.settings.areaUnit = areaSelect.value as AreaUnit;
      },
      "change",
    );
  });
  areaField.append(areaSelect);
  section.append(lengthField, areaField);

  section.append(
    checkRow("Snap to geometry", project.settings.snapToGeometry, (checked) => {
      store.mutate((project) => {
        project.settings.snapToGeometry = checked;
      }, "change");
    }),
    checkRow("Show grid", project.settings.showGrid, (checked) => {
      store.mutate((project) => {
        project.settings.showGrid = checked;
      }, "change");
    }),
    checkRow("Show scale reference", project.settings.showCalibration, (checked) => {
      store.mutate((project) => {
        project.settings.showCalibration = checked;
      }, "change");
    }),
  );
  return section;
}

function categoriesSection(project: NonNullable<typeof store.project>): HTMLElement {
  const section = el("section", "inspector-section");
  section.append(el("h3", "", "Categories"));

  const field = el("label", "field");
  field.append(el("span", "field-label", "Default for new measurements"));
  const select = el("select", "select");
  for (const category of project.categories) {
    select.append(
      option(
        category.id,
        category.name,
        category.id === project.settings.quantity.defaultCategoryId,
      ),
    );
  }
  select.addEventListener("change", () => store.setDefaultCategory(select.value));
  field.append(select);

  const manage = el("button", "btn btn-small", `Manage categories (${project.categories.length})`);
  manage.type = "button";
  manage.addEventListener("click", () => openCategoriesDialog());

  section.append(field, manage);
  return section;
}

function checkRow(label: string, checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const row = el("label", "check-row");
  const input = el("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  row.append(input, el("span", "", label));
  return row;
}

function activeLayerSection(project: NonNullable<typeof store.project>, actions: PanelActions): HTMLElement {
  const section = el("section", "inspector-section");
  const head = el("div", "section-head");
  head.append(el("h3", "", "Active layer"));
  const active = project.layers.find((l) => l.id === project.activeLayerId);
  section.append(head);
  if (!active) {
    section.append(el("div", "empty-note small", "No active layer."));
    return section;
  }
  head.append(el("span", "status-chip", active.kind === "measure" ? "Measurement" : "Drawing"));

  const nameField = el("label", "field");
  nameField.append(el("span", "field-label", "Name"));
  const nameInput = el("input", "input");
  nameInput.value = active.name;
  nameInput.addEventListener("change", () => {
    if (!nameInput.value.trim()) return;
    store.mutate(
      (project) => {
        const layer = project.layers.find((l) => l.id === active.id);
        if (layer) layer.name = nameInput.value.trim();
      },
      "layers",
    );
  });
  nameField.append(nameInput);
  section.append(nameField);

  const colorField = el("label", "field");
  colorField.append(el("span", "field-label", "Layer colour"));
  const color = el("input", "color-swatch");
  color.type = "color";
  color.value = active.color;
  color.addEventListener("change", () => {
    store.mutate(
      (project) => {
        const layer = project.layers.find((l) => l.id === active.id);
        if (!layer) return;
        layer.color = color.value;
        for (const item of layer.items) item.color = color.value;
      },
      "layers",
    );
  });
  colorField.append(color);
  section.append(colorField);

  const opacityField = el("label", "field");
  const opacityHead = el("div", "section-head");
  opacityHead.style.marginBottom = "4px";
  opacityHead.append(el("span", "field-label", "Opacity"));
  const opacityValue = el("span", "range-value", `${Math.round(active.opacity * 100)}%`);
  opacityHead.append(opacityValue);
  const range = el("input");
  range.type = "range";
  range.min = "10";
  range.max = "100";
  range.step = "1";
  range.value = String(Math.round(active.opacity * 100));
  range.addEventListener("input", () => {
    opacityValue.textContent = `${range.value}%`;
  });
  range.addEventListener("change", () => {
    store.mutate(
      (project) => {
        const layer = project.layers.find((l) => l.id === active.id);
        if (layer) layer.opacity = Number(range.value) / 100;
      },
      "layers",
    );
  });
  opacityField.append(opacityHead, range);
  section.append(opacityField);

  const toggles = el("div", "field-row");
  const visible = el("button", `toggle${active.visible ? " is-on" : ""}`);
  visible.type = "button";
  visible.innerHTML = `${icon(active.visible ? "eye" : "eyeOff", 13)}<span>${active.visible ? "Visible" : "Hidden"}</span>`;
  visible.addEventListener("click", () => {
    store.mutate((project) => {
      const layer = project.layers.find((l) => l.id === active.id);
      if (layer) layer.visible = !layer.visible;
    }, "layers");
  });
  const locked = el("button", `toggle${active.locked ? " is-on" : ""}`);
  locked.type = "button";
  locked.innerHTML = `${icon(active.locked ? "lock" : "unlock", 13)}<span>${active.locked ? "Locked" : "Editable"}</span>`;
  locked.addEventListener("click", () => {
    store.mutate((project) => {
      const layer = project.layers.find((l) => l.id === active.id);
      if (layer) layer.locked = !layer.locked;
    }, "layers");
  });
  toggles.append(visible, locked);
  section.append(toggles);

  const deleteLayerBtn = el("button", "btn btn-small btn-ghost", `Delete layer (${active.items.length})`);
  deleteLayerBtn.type = "button";
  deleteLayerBtn.style.marginTop = "8px";
  deleteLayerBtn.addEventListener("click", () => {
    void confirmDialog(
      "Delete layer",
      `Delete “${active.name}”${active.items.length ? ` and its ${active.items.length} items` : ""}?`,
      "Delete",
      { danger: true },
    ).then((confirmed) => {
      if (confirmed) store.mutate((project) => removeLayer(project, active.id), "layers");
      actions.refresh();
    });
  });
  section.append(deleteLayerBtn);
  return section;
}

function selectionSection(project: NonNullable<typeof store.project>, actions: PanelActions): HTMLElement {
  const refs = store.ui.selection;
  if (refs.length > 1) return multiSelectionSection(project, refs, actions);

  const section = el("section", "inspector-section");
  section.append(el("h3", "", "Selection"));
  const selection = refs[0] ?? null;
  const found = selection ? findItem(project, selection.itemId) : undefined;
  if (!selection || !found) {
    const note = el("div", "empty-note small");
    note.style.padding = "12px 6px";
    note.innerHTML = `${icon("cursor", 18)}<div>Select a markup to edit it. Shift-click or drag a box to select several.</div>`;
    section.append(note);
    return section;
  }

  const { item, layer } = found;
  const locked = itemIsLocked(item, layer);
  const hidden = !itemIsVisible(item, layer);
  const metrics = itemMetrics(item, project);
  const card = el("div", "selection-card");
  const type = el("div", "selection-type");
  const swatch = el("span", "swatch");
  swatch.style.background = item.color;
  type.append(swatch, el("span", "", itemKindLabel(item.kind)));
  card.append(type);
  if (metrics) {
    card.append(el("div", "selection-value", metrics.primary));
    if (metrics.secondary) card.append(el("div", "selection-secondary", metrics.secondary));
  } else if (item.kind === "text") {
    card.append(el("div", "selection-secondary", "Text annotation"));
  }
  card.append(
    el(
      "div",
      "selection-secondary",
      `Page ${item.page} · ${layer.name} · ${item.points.length} point${item.points.length === 1 ? "" : "s"}`,
    ),
  );
  section.append(card);

  if (locked) {
    section.append(
      el(
        "div",
        "empty-note small",
        layer.locked
          ? `“${layer.name}” is locked. Unlock the layer to edit this markup.`
          : "This markup is locked. Unlock it below to edit it.",
      ),
    );
  }
  if (hidden) {
    section.append(el("div", "empty-note small", "This markup is hidden."));
  }

  if (metrics && !metrics.scale) {
    section.append(
      el(
        "div",
        "empty-note small",
        "This measurement has no scale. Calibrate its page to show real-world values.",
      ),
    );
  }

  const labelField = el("label", "field");
  labelField.append(
    el(
      "span",
      "field-label",
      metrics ? "Label (optional)" : "List label (optional)",
    ),
  );
  const labelInput = el("input", "input");
  labelInput.id = "selection-label-input";
  labelInput.dataset.role = "selection-label";
  labelInput.value = item.label ?? "";
  labelInput.placeholder = metrics?.primary ?? (item.kind === "text" ? "Text note" : "Label");
  labelInput.disabled = locked;
  labelInput.title = locked
    ? "Unlock the layer to edit this markup."
    : metrics
      ? "Shown with the measurement on the page."
      : "Used in the Markups list and exports. Double-click the Markups row or press F2.";
  labelInput.addEventListener("change", () => {
    store.mutate((project) => {
      const target = findItem(project, item.id)?.item;
      if (target) target.label = labelInput.value.trim() || undefined;
    }, "change");
  });
  labelField.append(labelInput);
  section.append(labelField);
  if (!metrics) {
    section.append(
      el(
        "div",
        "empty-note small",
        "List labels are export and Markups-list metadata; they are not drawn on the page.",
      ),
    );
  }

  if (item.kind === "text") {
    const textField = el("label", "field");
    textField.append(el("span", "field-label", "Text"));
    const edit = el("button", "btn btn-small", "Edit on canvas");
    edit.type = "button";
    edit.disabled = locked;
    edit.addEventListener("click", actions.editSelectedText);
    textField.append(edit);
    section.append(textField);
  }

  const styleRow = el("div", "field-row");
  const colorField = el("label", "field");
  colorField.append(el("span", "field-label", item.kind === "text" ? "Text colour" : "Colour"));
  const colorInput = el("input", "color-swatch");
  colorInput.type = "color";
  colorInput.value = item.color;
  colorInput.disabled = locked;
  colorInput.addEventListener("change", () => {
    store.mutate((project) => {
      const target = findItem(project, item.id)?.item;
      if (target) target.color = colorInput.value;
    }, "change");
  });
  colorField.append(colorInput);
  styleRow.append(colorField);

  const sizeField = el("label", "field");
  if (item.kind === "text") {
    sizeField.append(el("span", "field-label", "Text size"));
    const sizeWrap = el("div", "input-row");
    const size = el("input", "input");
    size.type = "number";
    size.min = "0.5";
    size.max = "300";
    size.step = "0.5";
    size.value = String(item.fontSize ?? 12);
    size.disabled = locked;
    size.setAttribute("aria-label", "Text size in points");
    size.addEventListener("change", () => {
      const value = Number(size.value);
      if (!Number.isFinite(value) || value <= 0) {
        size.value = String(item.fontSize ?? 12);
        return;
      }
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (target) target.fontSize = Math.max(0.5, Math.min(300, value));
      }, "change");
    });
    sizeWrap.append(size, el("span", "context-unit", "pt"));
    sizeField.append(sizeWrap);
  } else {
    sizeField.append(el("span", "field-label", "Stroke width"));
    const width = el("select", "select");
    for (const value of [1, 1.5, 2, 3, 4, 6, 8]) {
      width.append(option(String(value), `${value} pt`, Math.abs(value - item.strokeWidth) < 0.01));
    }
    width.disabled = locked;
    width.addEventListener("change", () => {
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (target) target.strokeWidth = Number(width.value);
      }, "change");
    });
    sizeField.append(width);
  }
  styleRow.append(sizeField);
  section.append(styleRow);

  if (item.kind === "text" || item.kind === "rect" || item.kind === "ellipse") {
    const rotationField = el("label", "field");
    rotationField.append(el("span", "field-label", "Rotation"));
    const rotationWrap = el("div", "input-row");
    const rotation = el("input", "input");
    rotation.type = "number";
    rotation.min = "-360";
    rotation.max = "360";
    rotation.step = "1";
    rotation.value = String(Math.round(item.rotation ?? 0));
    rotation.disabled = locked;
    rotation.setAttribute("aria-label", "Rotation in degrees");
    rotation.addEventListener("change", () => {
      const value = Number(rotation.value);
      if (!Number.isFinite(value)) {
        rotation.value = String(Math.round(item.rotation ?? 0));
        return;
      }
      const normalized = ((value % 360) + 360) % 360;
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (!target) return;
        if (normalized === 0) delete target.rotation;
        else target.rotation = normalized;
        target.updatedAt = new Date().toISOString();
      }, "change");
    });
    rotationWrap.append(rotation, el("span", "context-unit", "°"));
    rotationField.append(rotationWrap);
    section.append(rotationField);
  }

  const layerField = el("label", "field");
  layerField.append(el("span", "field-label", "Move to layer"));
  const layerSelect = el("select", "select");
  for (const candidate of layersForKind(project, layer.kind)) {
    layerSelect.append(option(candidate.id, candidate.name, candidate.id === layer.id));
  }
  layerSelect.disabled = locked || layersForKind(project, layer.kind).length < 2;
  layerSelect.addEventListener("change", () => {
    store.mutate((project) => {
      moveItemToLayer(project, layer.id, item.id, layerSelect.value);
    }, "change");
    store.setSelection({ layerId: layerSelect.value, itemId: item.id });
  });
  layerField.append(layerSelect);
  section.append(layerField);

  const visibilityRow = el("div", "field-row");
  const visibleToggle = el("button", `toggle${!hidden ? " is-on" : ""}`);
  visibleToggle.type = "button";
  visibleToggle.disabled = !layer.visible;
  visibleToggle.title = layer.visible ? "Show or hide this markup" : "Show the layer first";
  visibleToggle.innerHTML = `${icon(hidden ? "eyeOff" : "eye", 13)}<span>${hidden ? "Hidden" : "Visible"}</span>`;
  visibleToggle.addEventListener("click", () => actions.setSelectionVisible(hidden));
  const lockToggle = el("button", `toggle${locked ? " is-on" : ""}`);
  lockToggle.type = "button";
  lockToggle.disabled = layer.locked;
  lockToggle.title = layer.locked ? "Unlock the layer first" : "Lock or unlock this markup";
  lockToggle.innerHTML = `${icon(locked ? "lock" : "unlock", 13)}<span>${locked ? "Locked" : "Editable"}</span>`;
  lockToggle.addEventListener("click", () => actions.setSelectionLocked(!item.locked));
  visibilityRow.append(visibleToggle, lockToggle);
  section.append(visibilityRow);

  const actionsWrap = el("div", "selection-actions");
  const duplicate = el("button", "btn btn-small", "Duplicate");
  duplicate.type = "button";
  duplicate.disabled = locked;
  duplicate.innerHTML = `${icon("copy", 13)}<span>Duplicate</span>`;
  duplicate.addEventListener("click", actions.duplicateSelection);
  const remove = el("button", "btn btn-small btn-danger", "Delete");
  remove.type = "button";
  remove.disabled = locked;
  remove.innerHTML = `${icon("trash", 13)}<span>Delete</span>`;
  remove.addEventListener("click", actions.deleteSelection);
  actionsWrap.append(duplicate, remove);
  section.append(actionsWrap);

  return section;
}

function multiSelectionSection(
  project: NonNullable<typeof store.project>,
  refs: SelectionRef[],
  actions: PanelActions,
): HTMLElement {
  const section = el("section", "inspector-section");
  const head = el("div", "section-head");
  head.append(el("h3", "", "Selection"));
  head.append(el("span", "status-chip", `${refs.length} items`));
  section.append(head);

  const resolved = resolveSelection(project, refs);
  const kind = selectionKind(project, refs);
  const lockedCount = resolved.filter((entry) => entry.locked).length;
  const hiddenCount = resolved.filter((entry) => !itemIsVisible(entry.item, entry.layer)).length;
  const commonColor =
    resolved.length > 0 && resolved.every((entry) => entry.item.color === resolved[0].item.color)
      ? resolved[0].item.color
      : "";

  const card = el("div", "selection-card multi");
  card.append(el("div", "selection-value", `${resolved.length} selected`));
  card.append(
    el(
      "div",
      "selection-secondary",
      kind
        ? `${kind === "measure" ? "Measurement" : "Drawing"} marks`
        : "Mixed measurements and drawings",
    ),
  );
  if (lockedCount || hiddenCount) {
    card.append(
      el(
        "div",
        "selection-secondary",
        [lockedCount ? `${lockedCount} locked` : "", hiddenCount ? `${hiddenCount} hidden` : ""]
          .filter(Boolean)
          .join(" · "),
      ),
    );
  }
  section.append(card);

  if (!kind) {
    section.append(
      el(
        "div",
        "empty-note small",
        "Mixed selections can be styled or hidden together, but moving to a layer requires either only measurements or only drawings.",
      ),
    );
  }

  if (kind) {
    const layerField = el("label", "field");
    layerField.append(el("span", "field-label", "Move to layer"));
    const layerSelect = el("select", "select");
    layerSelect.append(option("", "Choose layer…", true));
    for (const candidate of layersForKind(project, kind)) {
      if (candidate.locked) continue;
      if (resolved.every((entry) => entry.layer.id === candidate.id)) continue;
      layerSelect.append(option(candidate.id, candidate.name, false));
    }
    layerSelect.addEventListener("change", () => {
      if (layerSelect.value) actions.moveSelectionToLayer(layerSelect.value);
    });
    layerField.append(layerSelect);
    if (layerSelect.options.length > 1) section.append(layerField);
  }

  const colorField = el("label", "field");
  colorField.append(el("span", "field-label", "Colour"));
  const colorInput = el("input", "color-swatch");
  colorInput.type = "color";
  colorInput.value = commonColor || "#f2a93b";
  colorInput.disabled = lockedCount === resolved.length;
  colorInput.addEventListener("change", () => actions.setSelectionColor(colorInput.value));
  colorField.append(colorInput);
  section.append(colorField);

  const toggles = el("div", "field-row");
  const anyVisible = resolved.some((entry) => itemIsVisible(entry.item, entry.layer));
  const canShow = resolved.some((entry) => entry.layer.visible);
  const visible = el("button", `toggle${anyVisible ? " is-on" : ""}`);
  visible.type = "button";
  visible.disabled = !anyVisible && !canShow;
  visible.title = visible.disabled ? "The layers are hidden" : "";
  visible.innerHTML = `${icon(anyVisible ? "eye" : "eyeOff", 13)}<span>${anyVisible ? "Hide" : "Show"}</span>`;
  visible.addEventListener("click", () => actions.setSelectionVisible(!anyVisible));
  const anyUnlocked = resolved.some((entry) => !entry.locked);
  const canUnlock = resolved.some((entry) => !entry.layer.locked);
  const lock = el("button", `toggle${!anyUnlocked ? " is-on" : ""}`);
  lock.type = "button";
  lock.disabled = !anyUnlocked && !canUnlock;
  lock.title = lock.disabled ? "The layers are locked" : "";
  lock.innerHTML = `${icon(anyUnlocked ? "unlock" : "lock", 13)}<span>${anyUnlocked ? "Lock" : "Unlock"}</span>`;
  lock.addEventListener("click", () => actions.setSelectionLocked(anyUnlocked));
  toggles.append(visible, lock);
  section.append(toggles);

  const actionsWrap = el("div", "selection-actions");
  const allLocked = lockedCount === resolved.length;
  const duplicate = el("button", "btn btn-small", "Duplicate");
  duplicate.type = "button";
  duplicate.disabled = allLocked;
  duplicate.innerHTML = `${icon("copy", 13)}<span>Duplicate</span>`;
  duplicate.addEventListener("click", actions.duplicateSelection);
  const remove = el("button", "btn btn-small btn-danger", "Delete");
  remove.type = "button";
  remove.disabled = allLocked;
  remove.innerHTML = `${icon("trash", 13)}<span>Delete</span>`;
  remove.addEventListener("click", actions.deleteSelection);
  actionsWrap.append(duplicate, remove);
  section.append(actionsWrap);

  return section;
}

/* ---------------- Welcome ---------------- */

function renderWelcome(refs: ShellRefs, actions: PanelActions): void {
  const show = !store.project;
  refs.welcome.classList.toggle("hidden", !show);
  if (!show) {
    refs.welcome.textContent = "";
    return;
  }
  clear(refs.welcome);
  const card = el("div", "welcome-card");
  const brand = el("div", "welcome-brand");
  brand.innerHTML = `${icon("grid", 42)}`;
  brand.firstElementChild?.classList.add("brand-mark");
  const title = el("h1", "welcome-title", "GridScalr");
  brand.append(title);
  card.append(brand);
  card.append(
    el(
      "p",
      "welcome-subtitle",
      "Open architectural or engineering PDF drawings, calibrate the scale, and measure lengths and areas. Organise every measurement and markup on separate, lockable layers — entirely on your device.",
    ),
  );
  const actionsWrap = el("div", "welcome-actions");
  const open = el("button", "btn btn-primary", "Open PDF drawing");
  open.type = "button";
  open.innerHTML = `${icon("folder", 16)}<span>Open PDF drawing</span>`;
  open.addEventListener("click", actions.openPdf);
  const openProject = el("button", "btn", "Open project");
  openProject.type = "button";
  openProject.innerHTML = `${icon("file", 15)}<span>Open project</span>`;
  openProject.addEventListener("click", actions.openProject);
  actionsWrap.append(open, openProject);

  const autosave = actions.getAutosave();
  if (autosave) {
    const restore = el("button", "btn", "Restore last session");
    restore.type = "button";
    restore.innerHTML = `${icon("undo", 15)}<span>Restore last session</span>`;
    restore.title = `Autosaved ${new Date(autosave.savedAt).toLocaleString()}`;
    restore.addEventListener("click", actions.restoreAutosave);
    actionsWrap.append(restore);
  }
  card.append(actionsWrap);

  const recent = getRecentSafe();
  if (recent.length) {
    const recents = el("div", "welcome-recents");
    recents.append(el("h3", "", "Recent"));
    const list = el("div", "recent-list");
    for (const entry of recent.slice(0, 5)) {
      const row = el("button", "recent-item");
      row.type = "button";
      row.innerHTML = icon(entry.kind === "pdf" ? "file" : "layers", 15);
      row.append(el("span", "recent-name", entry.name));
      row.append(el("span", "recent-meta", entry.kind === "pdf" ? "PDF" : "Project"));
      row.addEventListener("click", () => actions.openRecent(entry));
      list.append(row);
    }
    recents.append(list);
    card.append(recents);
  }

  const note = el("p", "welcome-footnote");
  note.innerHTML = `${icon("lock", 14)}<span>Local-first. Drawings are read from your disk and never uploaded.</span>`;
  card.append(note);
  refs.welcome.append(card);
}

function getRecentSafe(): RecentEntry[] {
  try {
    const raw = localStorage.getItem("gridscalr.recent.v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/* ---------------- Popover ---------------- */

interface PopoverItem {
  label?: string;
  icon?: string;
  action?: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

function buildPopover(items: PopoverItem[]): HTMLElement {
  const popover = el("div", "popover");
  for (const item of items) {
    if (item.separator) {
      popover.append(el("div", "popover-separator"));
      continue;
    }
    const btn = el("button", `popover-item${item.danger ? " is-danger" : ""}`);
    btn.type = "button";
    btn.disabled = item.disabled ?? false;
    if (item.icon) btn.innerHTML = icon(item.icon, 14);
    btn.append(el("span", "", item.label ?? ""));
    btn.addEventListener("click", () => {
      popover.remove();
      item.action?.();
    });
    popover.append(btn);
  }
  return popover;
}

function mountPopover(popover: HTMLElement, left: number, top: number): void {
  document.querySelectorAll(".popover").forEach((node) => node.remove());
  document.body.append(popover);
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (top + height > window.innerHeight - 8) top = window.innerHeight - height - 8;
  popover.style.left = `${Math.max(8, left)}px`;
  popover.style.top = `${Math.max(8, top)}px`;

  const close = (event: Event) => {
    if (event.type === "mousedown" && popover.contains(event.target as Node)) return;
    popover.remove();
    document.removeEventListener("mousedown", close);
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") close(event);
  };
  setTimeout(() => {
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
  }, 0);
}

export function showPopover(anchor: HTMLElement, items: PopoverItem[]): void {
  const popover = buildPopover(items);
  document.body.append(popover);
  const rect = anchor.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  let left = rect.left;
  let top = rect.bottom + 5;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (top + height > window.innerHeight - 8) top = rect.top - height - 5;
  popover.remove();
  mountPopover(popover, left, top);
}

export function showPopoverAt(x: number, y: number, items: PopoverItem[]): void {
  mountPopover(buildPopover(items), x + 2, y + 2);
}

export function showSelectionMenuAt(x: number, y: number, actions: PanelActions): void {
  const project = store.project;
  if (!project) return;
  const refs = store.ui.selection;
  const resolved = resolveSelection(project, refs);
  const kind = selectionKind(project, refs);
  const anyVisible = resolved.some((entry) => itemIsVisible(entry.item, entry.layer));
  const canShow = resolved.some((entry) => entry.layer.visible);
  const anyUnlocked = resolved.some((entry) => !entry.locked);
  const canUnlock = resolved.some((entry) => !entry.layer.locked);
  const items: PopoverItem[] = [];

  if (!resolved.length) {
    items.push({
      label: "Paste",
      icon: "copy",
      disabled: !hasClipboard(project),
      action: actions.pasteSelection,
    });
    showPopoverAt(x, y, items);
    return;
  }

  items.push(
    { label: "Copy", icon: "copy", action: actions.copySelection },
    { label: "Cut", icon: "trash", action: actions.cutSelection },
    { label: "Duplicate", icon: "copy", action: actions.duplicateSelection },
    { separator: true },
    {
      label: anyVisible ? "Hide" : "Show",
      icon: anyVisible ? "eyeOff" : "eye",
      disabled: !anyVisible && !canShow,
      action: () => actions.setSelectionVisible(!anyVisible),
    },
    {
      label: anyUnlocked ? "Lock" : "Unlock",
      icon: anyUnlocked ? "lock" : "unlock",
      disabled: !anyUnlocked && !canUnlock,
      action: () => actions.setSelectionLocked(anyUnlocked),
    },
  );

  const targets = kind ? layersForKind(project, kind) : [];
  if (targets.length > 1) {
    items.push({ separator: true });
    for (const layer of targets) {
      if (resolved.every((entry) => entry.layer.id === layer.id)) continue;
      items.push({
        label: `Move to ${layer.name}`,
        icon: "layers",
        disabled: layer.locked,
        action: () => actions.moveSelectionToLayer(layer.id),
      });
    }
  }

  items.push(
    { separator: true },
    {
      label: "Delete",
      icon: "trash",
      danger: true,
      disabled: !anyUnlocked,
      action: actions.deleteSelection,
    },
  );
  showPopoverAt(x, y, items);
}

export function showExportMenu(anchor: HTMLElement, actions: PanelActions): void {
  showPopover(anchor, [
    { label: "Flattened PDF", icon: "file", action: () => actions.exportAs("pdf") },
    { label: "View as PNG", icon: "image", action: () => actions.exportAs("png") },
    { label: "Markups to CSV", icon: "csv", action: () => actions.exportAs("csv") },
    { label: "Project to JSON", icon: "file", action: () => actions.exportAs("json") },
  ]);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

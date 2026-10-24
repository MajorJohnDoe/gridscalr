import { isManualCalibration, pageCalibration, pageScale, pageScaleLocked } from "../model/calibration";
import {
  allRooms,
  categoryForItem,
  measurementCategory,
  normalizeRoom,
} from "../model/categories";
import { hasClipboard } from "../model/clipboard";
import { COUNT_TYPES, COUNT_TYPE_LABELS } from "../model/countSymbols";
import { primaryDocument, totalPageCount } from "../model/documents";
import {
  findItem,
  isMeasurementKind,
  itemIsLocked,
  itemIsVisible,
  layersForKind,
  moveItemToLayer,
  removeLayer,
} from "../model/layers";
import { itemKindLabel, itemMetrics } from "../model/measure";
import {
  formatImageDimensions,
  IMAGE_MODE_LABELS,
  imageAssetForItem,
  imageModeOf,
  imageOpacity,
} from "../model/images";
import { resolveSelection, selectionKind } from "../model/selection";
import { formatBytes, getRecent } from "../io/platform";
import type {
  AreaMode,
  AreaShape,
  AreaUnit,
  CountType,
  ImageMode,
  LengthUnit,
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
import { STROKE_WIDTH_OPTIONS } from "../model/style";
import type { AutosavePayload } from "../state/store";
import { clear, el, escapeHtml, option } from "./dom";
import { confirmDialog } from "./dialogs";
import { icon } from "./icons";
import type { PopoverItem } from "./popover";
import { showPopoverAt } from "./popover";
import type { ShellRefs } from "./shell";
import { openSettingsDialog } from "./settingsDialog";
import { renderSidebar, setInspectorCollapsed } from "./sidebar";
import { TOOL_BY_ID } from "./toolDefs";
import { toast } from "./toast";

export interface PanelActions {
  openPdf: () => void;
  openProject: () => void;
  newProject: () => void;
  closeProject: () => void;
  quit: () => void;
  saveProject: () => void;
  saveProjectAs: () => void;
  exportAs: (
    kind: "csv" | "json" | "png" | "drawing" | "quantity-csv" | "quantity-pdf",
  ) => void;
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  zoomActual: () => void;
  renameSelection: () => void;
  openMeasurements: () => void;
  openQuantities: () => void;
  startCalibration: () => void;
  clearCalibration: () => void;
  openManualScale: () => void;
  setScaleLock: (locked: boolean) => void;
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
  setSelectionStrokeWidth: (width: number) => void;
  setSelectionCategory: (categoryId: string) => void;
  setSelectionRoom: (room: string) => void;
  setSelectionAreaMode: (mode: AreaMode) => void;
  setSelectionCountType: (type: CountType) => void;
  insertImage: () => void;
  setSelectionImageMode: (mode: ImageMode) => void;
  setSelectionOpacity: (opacity: number) => void;
  goToPage: (page: number, fit?: boolean) => void;
  navigateToItem: (page: number, layerId: string, itemId: string) => void;
  ensurePageSize: (page: number) => void;
  getPageSize: (page: number) => PageSize | undefined;
  deletePage: (page: number) => void;
  refresh: () => void;
  restoreAutosave: () => void;
  getAutosave: () => AutosavePayload | null;
  openRecent: (entry: RecentEntry) => void;
}

/** Focuses the selection label in Properties for rename. */
export function requestMarkupRename(refs: ShellRefs): void {
  const selection = store.ui.selection.length === 1 ? store.primarySelection : null;
  if (!selection) {
    toast("Select one item to rename it.", "info");
    return;
  }
  setInspectorCollapsed(false);
  window.requestAnimationFrame(() => {
    const fallback = refs.inspector.querySelector<HTMLInputElement>(
      '[data-role="selection-label"]',
    );
    if (fallback) {
      fallback.focus({ preventScroll: true });
      fallback.select();
      return;
    }
    toast("Select the item and edit its label in Properties.", "info");
  });
}

export function renderChrome(refs: ShellRefs, actions: PanelActions): void {
  renderTopbar(refs, actions);
  renderToolRail(refs);
  renderSidebar(refs, actions);
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
  refs.docName.textContent = project ? (primaryDocument(project.documents)?.name ?? "No drawing open") : "No drawing open";
  refs.docMeta.textContent = project
    ? `Page ${store.ui.page} of ${totalPageCount(project.documents)}`
    : "";
  refs.dirtyDot.classList.toggle("hidden", !store.dirty || !hasProject);
  refs.dirtyDot.title = "Unsaved changes";
  refs.zoomReadout.textContent = `${Math.round(store.ui.zoom * 100)}%`;
  refs.pageInput.disabled = !hasProject;
  refs.pagePrevBtn.disabled = !hasProject || store.ui.page <= 1;
  refs.pageNextBtn.disabled = !hasProject || store.ui.page >= (project ? totalPageCount(project.documents) : 1);
  if (document.activeElement !== refs.pageInput) {
    refs.pageInput.value = hasProject ? String(store.ui.page) : "1";
  }
  refs.pageTotal.textContent = `/ ${project ? totalPageCount(project.documents) : 0}`;
}

function renderToolRail(refs: ShellRefs): void {
  for (const btn of refs.toolRail.querySelectorAll<HTMLElement>("[data-tool]")) {
    const active = btn.dataset.tool === store.ui.activeTool;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  }
}

export function updateStatus(refs: ShellRefs): void {
  renderStatus(refs);
}

function renderStatus(refs: ShellRefs): void {
  const project = store.project;
  clear(refs.statusCalibration);
  clear(refs.statusCoords);
  clear(refs.statusLayer);

  if (!project) {
    refs.statusCalibration.append(chip("No drawing open", "warning"));
    return;
  }

  const calibration = pageCalibration(project, store.ui.page);
  const scale = pageScale(project, store.ui.page);
  const scaleLocked = pageScaleLocked(project, store.ui.page);
  refs.statusCalibration.append(
    calibration
      ? chip(
          `${scaleLocked ? "Scale locked" : "Calibrated"} · ${formatScale(scale, calibration)}`,
          "calibrated",
        )
      : chip("No scale on this page", "warning"),
  );

  const cursor = store.ui.cursor;
  const coords = cursor
    ? `X ${formatCoordinate(cursor.x, scale, project.settings.lengthUnit)}  Y ${formatCoordinate(cursor.y, scale, project.settings.lengthUnit)} ${scale ? project.settings.lengthUnit : "pt"}`
    : "X —  Y —";
  refs.statusCoords.innerHTML = `<span class="status-label">Cursor</span> <span class="status-value">${coords}</span>`;
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

/* ---------------- Context bar ---------------- */

function renderContextBar(refs: ShellRefs, actions: PanelActions): void {
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

  const imageButton = el("button", "btn btn-small btn-ghost context-image-button", "Import image");
  imageButton.type = "button";
  imageButton.title = "Import a PNG or JPEG image (Ctrl+V also pastes images)";
  imageButton.innerHTML = `${icon("image", 14)}<span>Import image</span>`;
  imageButton.addEventListener("click", actions.insertImage);
  controls.append(imageButton, el("div", "divider-v"));

  const measureTool =
    store.ui.activeTool === "length" ||
    store.ui.activeTool === "area" ||
    store.ui.activeTool === "count";
  if (measureTool) {
    if (store.ui.activeTool === "count") {
      const typeField = el("label", "context-field");
      typeField.title = "Object type for new counts";
      typeField.append(el("span", "context-field-label", "Type"));
      const typeSelect = el("select", "select context-select");
      typeSelect.setAttribute("aria-label", "Object type for new counts");
      for (const type of COUNT_TYPES) {
        typeSelect.append(
          option(type, COUNT_TYPE_LABELS[type], type === store.ui.measureCountType),
        );
      }
      typeSelect.addEventListener("change", () =>
        store.setMeasureCountType(typeSelect.value as CountType),
      );
      typeField.append(typeSelect);
      controls.append(typeField, el("div", "divider-v"));
    }
    if (store.ui.activeTool === "area") {
      const shapeField = el("label", "context-field");
      shapeField.title = "Quick areas use two opposite corners; polygon is click-by-click";
      shapeField.append(el("span", "context-field-label", "Shape"));
      const shapeSelect = el("select", "select context-select");
      shapeSelect.setAttribute("aria-label", "Area shape for new measurements");
      shapeSelect.append(
        option("polygon", "Polygon", store.ui.measureAreaShape === "polygon"),
        option("rectangle", "Rectangle", store.ui.measureAreaShape === "rectangle"),
        option("ellipse", "Ellipse", store.ui.measureAreaShape === "ellipse"),
      );
      shapeSelect.addEventListener("change", () =>
        store.setMeasureAreaShape(shapeSelect.value as AreaShape),
      );
      shapeField.append(shapeSelect);
      controls.append(shapeField, el("div", "divider-v"));

      const modeField = el("label", "context-field");
      modeField.title = "Add the area or deduct it from its category and room";
      modeField.append(el("span", "context-field-label", "Area"));
      const modeSelect = el("select", "select context-select");
      modeSelect.setAttribute("aria-label", "Area mode for new measurements");
      modeSelect.append(
        option("add", "Add", store.ui.measureAreaMode === "add"),
        option("subtract", "Deduct", store.ui.measureAreaMode === "subtract"),
      );
      modeSelect.addEventListener("change", () =>
        store.setMeasureAreaMode(modeSelect.value as AreaMode),
      );
      modeField.append(modeSelect);
      controls.append(modeField, el("div", "divider-v"));
    }
    const pendingCategory = measurementCategory(project, store.ui.measureCategoryId);
    const categoryField = el("label", "context-field");
    categoryField.title = "Category for new measurements";
    categoryField.append(el("span", "context-field-label", "Category"));
    const categorySelect = el("select", "select context-select");
    categorySelect.setAttribute("aria-label", "Category for new measurements");
    for (const category of project.categories) {
      categorySelect.append(option(category.id, category.name, category.id === pendingCategory?.id));
    }
    categorySelect.addEventListener("change", () => store.setMeasureCategory(categorySelect.value));
    categoryField.append(categorySelect);

    const roomField = el("label", "context-field");
    roomField.title = "Room for new measurements";
    roomField.append(el("span", "context-field-label", "Room"));
    const roomWrap = el("span", "context-room");
    const roomInput = el("input", "input context-room-input");
    roomInput.type = "text";
    roomInput.value = store.ui.measureRoom;
    roomInput.placeholder = "Room";
    roomInput.setAttribute("aria-label", "Room for new measurements");
    const roomList = el("datalist");
    roomList.id = "context-room-options";
    for (const room of allRooms(project)) roomList.append(option(room, room));
    roomInput.setAttribute("list", roomList.id);
    roomInput.addEventListener("input", () => store.setMeasureRoom(roomInput.value));
    const clearRoom = el("button", "icon-btn context-room-clear");
    clearRoom.type = "button";
    clearRoom.title = "Clear room";
    clearRoom.setAttribute("aria-label", "Clear room");
    clearRoom.innerHTML = icon("close", 11);
    clearRoom.addEventListener("click", () => {
      roomInput.value = "";
      store.setMeasureRoom("");
      roomInput.focus();
    });
    roomWrap.append(roomInput, clearRoom);
    roomField.append(roomWrap, roomList);
    controls.append(categoryField, roomField, el("div", "divider-v"));
  }

  if (store.ui.activeTool === "pen" || store.ui.activeTool === "line" || store.ui.activeTool === "arrow" || store.ui.activeTool === "rect" || store.ui.activeTool === "ellipse" || store.ui.activeTool === "highlight" || store.ui.activeTool === "text") {
    const color = el("input", "color-swatch");
    color.type = "color";
    color.value = store.ui.style.color;
    color.title = "Markup colour";
    color.addEventListener("change", () => store.setStyle({ color: color.value }));
    const width = el("select", "select");
    for (const value of STROKE_WIDTH_OPTIONS) {
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
  const header = el("div", "inspector-header");
  header.append(el("span", "", "Properties"));
  const headerActions = el("span", "inspector-header-actions");
  const settings = el("button", "icon-btn inspector-settings");
  settings.type = "button";
  settings.title = "Project settings (Ctrl/Cmd+,)";
  settings.setAttribute("aria-label", "Project settings");
  settings.innerHTML = icon("settings", 14);
  settings.disabled = !store.project;
  settings.addEventListener("click", () => openSettingsDialog());
  const collapse = el("button", "icon-btn inspector-settings");
  collapse.type = "button";
  collapse.title = "Hide properties (Ctrl/Cmd+Shift+\\)";
  collapse.setAttribute("aria-label", "Hide properties");
  collapse.innerHTML = icon("chevronRight", 14);
  collapse.addEventListener("click", () => setInspectorCollapsed(true));
  headerActions.append(settings, collapse);
  header.append(headerActions);
  refs.inspector.append(header);
  const project = store.project;
  if (!project) {
    const note = el("div", "empty-note");
    note.innerHTML = `${icon("info", 26)}<div>Open a drawing to see scale, layer and selection properties.</div>`;
    refs.inspector.append(note);
    return;
  }

  refs.inspector.append(scaleSection(project, actions));
  refs.inspector.append(activeLayerSection(project, actions));
  refs.inspector.append(selectionSection(project, actions));
}

function scaleSection(project: NonNullable<typeof store.project>, actions: PanelActions): HTMLElement {
  const section = el("section", "inspector-section");
  const page = store.ui.page;
  const head = el("div", "section-head");
  head.append(el("h3", "", "Scale"));
  const calibration = pageCalibration(project, page);
  const locked = pageScaleLocked(project, page);
  head.append(
    el(
      "span",
      `status-chip${calibration ? " is-calibrated" : " is-warning"}`,
      calibration ? (locked ? "Locked" : "Calibrated") : "No scale",
    ),
  );
  section.append(head);

  const card = el("div", `scale-card${calibration ? " is-calibrated" : ""}`);
  const status = el("div", "scale-status");
  const dot = el("span", "dot");
  status.append(dot, el("span", "", `Page ${page}`));
  card.append(status);
  if (calibration) {
    const detail = el("div", "scale-detail");
    if (isManualCalibration(calibration)) {
      detail.innerHTML = `Manual scale: <strong>1:${formatNumber(calibration.ratio, 6)}</strong><br>${formatScale(
        pageScale(project, page),
        calibration,
      )}<br>Uses the physical PDF page size. Measurements on this page use this scale.`;
    } else {
      detail.innerHTML = `Reference: <strong>${formatNumber(calibration.knownLength, 2)} ${calibration.unit}</strong><br>${formatScale(
        pageScale(project, page),
        calibration,
      )}<br>All measurements on this page use this scale.`;
    }
    if (locked) {
      detail.append(
        el(
          "div",
          "empty-note small",
          "This scale is locked. Unlock it to recalibrate, set a manual scale, or clear it.",
        ),
      );
    }
    card.append(detail);
  } else {
    card.append(
      el(
        "div",
        "scale-detail",
        "Draw a line over a known dimension, or enter the printed 1:N ratio.",
      ),
    );
  }
  const buttons = el("div", "scale-actions");
  const calibrate = el("button", "btn btn-small", calibration ? "Recalibrate" : "Calibrate");
  calibrate.type = "button";
  calibrate.disabled = locked;
  calibrate.title = locked ? "Unlock the page scale first." : "Draw a reference line";
  calibrate.addEventListener("click", actions.startCalibration);
  const manual = el("button", "btn btn-small", "Manual scale…");
  manual.type = "button";
  manual.disabled = locked;
  manual.title = locked ? "Unlock the page scale first." : "Enter a printed 1:N ratio";
  manual.addEventListener("click", actions.openManualScale);
  buttons.append(calibrate, manual);
  if (calibration) {
    const lock = el("button", "btn btn-small btn-ghost", locked ? "Unlock scale" : "Lock scale");
    lock.type = "button";
    lock.addEventListener("click", () => actions.setScaleLock(!locked));
    buttons.append(lock);

    const clearBtn = el("button", "btn btn-small btn-ghost", "Clear");
    clearBtn.type = "button";
    clearBtn.disabled = locked;
    clearBtn.title = locked ? "Unlock the page scale first." : "Clear the page scale";
    clearBtn.addEventListener("click", actions.clearCalibration);
    buttons.append(clearBtn);
  }
  card.append(buttons);
  section.append(card);
  return section;
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
  } else if (item.kind === "image") {
    const asset = imageAssetForItem(project, item);
    card.append(
      el(
        "div",
        "selection-secondary",
        `${IMAGE_MODE_LABELS[imageModeOf(item)]} image${asset ? ` · ${formatImageDimensions(asset)}` : ""}`,
      ),
    );
    if (asset) {
      card.append(el("div", "selection-secondary", `${formatBytes(asset.byteSize)} embedded`));
    }
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

  if (metrics && !metrics.scale && item.kind !== "count") {
    section.append(
      el(
        "div",
        "empty-note small",
        "This measurement has no scale. Calibrate its page to show real-world values.",
      ),
    );
  }

  if (isMeasurementKind(item.kind)) {
    if (item.kind === "count") {
      const typeField = el("label", "field");
      typeField.append(el("span", "field-label", "Object type"));
      const typeSelect = el("select", "select");
      for (const type of COUNT_TYPES) {
        typeSelect.append(
          option(type, COUNT_TYPE_LABELS[type], type === (item.countType ?? "other")),
        );
      }
      typeSelect.disabled = locked;
      typeSelect.title = locked
        ? "Unlock the layer to edit this markup."
        : "Count symbol and label type";
      typeSelect.addEventListener("change", () => {
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (target) target.countType = typeSelect.value as CountType;
        }, "change");
      });
      typeField.append(typeSelect);
      section.append(typeField);
    }

    const categoryField = el("label", "field");
    categoryField.append(el("span", "field-label", "Category"));
    const categorySelect = el("select", "select");
    const currentCategory = categoryForItem(project, item);
    for (const category of project.categories) {
      categorySelect.append(
        option(category.id, category.name, category.id === currentCategory?.id),
      );
    }
    categorySelect.disabled = locked;
    categorySelect.title = locked
      ? "Unlock the layer to edit this markup."
      : "Grouping used by the quantity report";
    categorySelect.addEventListener("change", () => {
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (target) target.categoryId = categorySelect.value;
      }, "change");
    });
    categoryField.append(categorySelect);
    section.append(categoryField);

    if (item.kind === "area") {
      const modeField = el("label", "field");
      modeField.append(el("span", "field-label", "Area mode"));
      const modeSelect = el("select", "select");
      modeSelect.append(
        option("add", "Add to area", (item.areaMode ?? "add") === "add"),
        option("subtract", "Deduct from area", item.areaMode === "subtract"),
      );
      modeSelect.disabled = locked;
      modeSelect.title = locked
        ? "Unlock the layer to edit this markup."
        : "Deducted areas are subtracted from their category and room";
      modeSelect.addEventListener("change", () => {
        store.mutate((project) => {
          const target = findItem(project, item.id)?.item;
          if (target) target.areaMode = modeSelect.value as AreaMode;
        }, "change");
      });
      modeField.append(modeSelect);
      section.append(modeField);
    }

    const roomField = el("label", "field");
    roomField.append(el("span", "field-label", "Room"));
    const roomInput = el("input", "input");
    roomInput.type = "text";
    roomInput.value = item.room ?? "";
    roomInput.placeholder = "Optional";
    roomInput.disabled = locked;
    roomInput.title = locked
      ? "Unlock the layer to edit this markup."
      : "Free text; suggestions come from rooms already used in the project";
    const roomList = el("datalist");
    roomList.id = "selection-room-options";
    for (const room of allRooms(project)) roomList.append(option(room, room));
    roomInput.setAttribute("list", roomList.id);
    roomInput.addEventListener("change", () => {
      const room = normalizeRoom(roomInput.value);
      roomInput.value = room ?? "";
      store.mutate((project) => {
        const target = findItem(project, item.id)?.item;
        if (!target) return;
        if (room) target.room = room;
        else delete target.room;
      }, "change");
    });
    roomField.append(roomInput, roomList);
    section.append(roomField);
  }

  if (item.kind === "image") {
    const image = item.image;
    const asset = image ? imageAssetForItem(project, item) : undefined;
    const modeField = el("label", "field");
    modeField.append(el("span", "field-label", "Image mode"));
    const modeSelect = el("select", "select");
    modeSelect.append(
      option("background", "Background (below markups)", imageModeOf(item) === "background"),
      option("annotation", "Annotation (in layer order)", imageModeOf(item) === "annotation"),
    );
    modeSelect.disabled = locked;
    modeSelect.title = locked
      ? "Unlock the image to change its mode."
      : "Background images sit above the PDF and below every markup.";
    modeSelect.addEventListener("change", () => actions.setSelectionImageMode(modeSelect.value as ImageMode));
    modeField.append(modeSelect);
    section.append(modeField);

    const opacityField = el("label", "field");
    const opacityHead = el("div", "section-head");
    opacityHead.style.marginBottom = "4px";
    opacityHead.append(el("span", "field-label", "Opacity"));
    const opacityValue = el("span", "range-value", `${Math.round(imageOpacity(item) * 100)}%`);
    opacityHead.append(opacityValue);
    const opacityRange = el("input");
    opacityRange.type = "range";
    opacityRange.min = "0";
    opacityRange.max = "100";
    opacityRange.step = "1";
    opacityRange.value = String(Math.round(imageOpacity(item) * 100));
    opacityRange.disabled = locked;
    opacityRange.setAttribute("aria-label", "Image opacity");
    opacityRange.addEventListener("input", () => {
      opacityValue.textContent = `${opacityRange.value}%`;
    });
    opacityRange.addEventListener("change", () =>
      actions.setSelectionOpacity(Number(opacityRange.value) / 100),
    );
    opacityField.append(opacityHead, opacityRange);
    section.append(opacityField);

    if (asset) {
      section.append(
        el(
          "div",
          "empty-note small",
          `${asset.name} · ${formatImageDimensions(asset)} · ${formatBytes(asset.byteSize)} embedded`,
        ),
      );
    } else if (image) {
      section.append(el("div", "empty-note small", "The embedded image data is missing."));
    }
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
      : "Used in the Measurements dialog and exports. Press F2 to focus it.";
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
        "List labels are export and Measurements metadata; they are not drawn on the page.",
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

  if (item.kind !== "image") {
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
    for (const value of STROKE_WIDTH_OPTIONS) {
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
  }

  if (
    item.kind === "text" ||
    item.kind === "rect" ||
    item.kind === "ellipse" ||
    item.kind === "image"
  ) {
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

  if (kind === "measure") {
    const measurements = resolved.filter((entry) => isMeasurementKind(entry.item.kind));
    const editable = measurements.filter((entry) => !entry.locked);
    const allLocked = editable.length === 0;
    if (measurements.length) {
      const firstCategory = categoryForItem(project, measurements[0].item)?.id ?? "";
      const commonCategory = measurements.every(
        (entry) => (categoryForItem(project, entry.item)?.id ?? "") === firstCategory,
      )
        ? firstCategory
        : "";
      const categoryField = el("label", "field");
      categoryField.append(el("span", "field-label", "Category"));
      const categorySelect = el("select", "select");
      categorySelect.append(option("", "Set category…", !commonCategory));
      for (const category of project.categories) {
        categorySelect.append(
          option(category.id, category.name, category.id === commonCategory),
        );
      }
      categorySelect.disabled = allLocked;
      categorySelect.setAttribute("aria-label", "Category for selected measurements");
      categorySelect.title = allLocked
        ? "Unlock the selected measurements to edit them."
        : "Apply one category to the selected measurements";
      categorySelect.addEventListener("change", () => {
        if (categorySelect.value) actions.setSelectionCategory(categorySelect.value);
      });
      categoryField.append(categorySelect);
      section.append(categoryField);

      const firstRoom = (measurements[0].item.room ?? "").trim();
      const commonRoom = measurements.every(
        (entry) => (entry.item.room ?? "").trim() === firstRoom,
      )
        ? firstRoom
        : "";
      const roomField = el("div", "field");
      roomField.append(el("span", "field-label", "Room"));
      const roomRow = el("div", "input-row");
      const roomInput = el("input", "input");
      roomInput.type = "text";
      roomInput.value = commonRoom;
      roomInput.placeholder = "Set room…";
      roomInput.disabled = allLocked;
      roomInput.title = allLocked
        ? "Unlock the selected measurements to edit them."
        : "Set one room for the selected measurements. Leave empty to clear their rooms.";
      roomInput.setAttribute("aria-label", "Room for selected measurements");
      const roomList = el("datalist");
      roomList.id = "multi-selection-room-options";
      for (const room of allRooms(project)) roomList.append(option(room, room));
      roomInput.setAttribute("list", roomList.id);
      const applyRoom = () => actions.setSelectionRoom(roomInput.value);
      roomInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          applyRoom();
        }
      });
      const roomButton = el("button", "btn btn-small", "Apply");
      roomButton.type = "button";
      roomButton.disabled = allLocked;
      roomButton.addEventListener("click", applyRoom);
      roomRow.append(roomInput, roomButton);
      roomField.append(roomRow, roomList);
      section.append(roomField);

      if (measurements.every((entry) => entry.item.kind === "area")) {
        const firstMode = measurements[0].item.areaMode ?? "add";
        const commonMode = measurements.every(
          (entry) => (entry.item.areaMode ?? "add") === firstMode,
        )
          ? firstMode
          : "";
        const modeField = el("label", "field");
        modeField.append(el("span", "field-label", "Area mode"));
        const modeSelect = el("select", "select");
        modeSelect.append(option("", "Set area mode…", !commonMode));
        modeSelect.append(
          option("add", "Add to area", commonMode === "add"),
          option("subtract", "Deduct from area", commonMode === "subtract"),
        );
        modeSelect.disabled = allLocked;
        modeSelect.setAttribute("aria-label", "Area mode for selected measurements");
        modeSelect.title = allLocked
          ? "Unlock the selected measurements to edit them."
          : "Apply one area mode to the selected areas";
        modeSelect.addEventListener("change", () => {
          if (modeSelect.value) {
            actions.setSelectionAreaMode(modeSelect.value as AreaMode);
          }
        });
        modeField.append(modeSelect);
        section.append(modeField);
      }

      if (measurements.every((entry) => entry.item.kind === "count")) {
        const firstType = measurements[0].item.countType ?? "other";
        const commonType = measurements.every(
          (entry) => (entry.item.countType ?? "other") === firstType,
        )
          ? firstType
          : "";
        const countField = el("label", "field");
        countField.append(el("span", "field-label", "Object type"));
        const countSelect = el("select", "select");
        countSelect.append(option("", "Set object type…", !commonType));
        for (const type of COUNT_TYPES) {
          countSelect.append(
            option(type, COUNT_TYPE_LABELS[type], type === commonType),
          );
        }
        countSelect.disabled = allLocked;
        countSelect.setAttribute("aria-label", "Object type for selected counts");
        countSelect.title = allLocked
          ? "Unlock the selected measurements to edit them."
          : "Apply one object type to the selected counts";
        countSelect.addEventListener("change", () => {
          if (countSelect.value) {
            actions.setSelectionCountType(countSelect.value as CountType);
          }
        });
        countField.append(countSelect);
        section.append(countField);
      }

      if (allLocked) {
        section.append(
          el(
            "div",
            "empty-note small",
            "All selected measurements are locked. Unlock them to use bulk edits.",
          ),
        );
      } else if (lockedCount > 0) {
        section.append(
          el("div", "empty-note small", "Locked measurements are skipped by bulk edits."),
        );
      }
    }
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

  const weights = resolved.map((entry) => entry.item.strokeWidth);
  const firstWeight = weights[0] ?? 1;
  const commonWeight = weights.every((value) => Math.abs(value - firstWeight) < 0.01)
    ? firstWeight
    : null;
  const weightField = el("label", "field");
  weightField.append(el("span", "field-label", "Line weight"));
  const weightSelect = el("select", "select");
  weightSelect.append(
    option(
      "",
      commonWeight === null ? "Set line weight…" : `${commonWeight} pt (current)`,
      true,
    ),
  );
  for (const value of STROKE_WIDTH_OPTIONS) {
    weightSelect.append(option(String(value), `${value} pt`, false));
  }
  weightSelect.disabled = lockedCount === resolved.length;
  weightSelect.setAttribute("aria-label", "Line weight for selected items");
  weightSelect.title =
    lockedCount === resolved.length
      ? "Unlock the selected items to change their line weight."
      : "Apply one line weight to the selected items";
  weightSelect.addEventListener("change", () => {
    if (weightSelect.value) actions.setSelectionStrokeWidth(Number(weightSelect.value));
  });
  weightField.append(weightSelect);
  section.append(weightField);

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
      "Open architectural or engineering drawings as PDF or scanned TIF, calibrate the scale, and measure lengths and areas. Add several sheets to one project. Everything stays on your device.",
    ),
  );
  const actionsWrap = el("div", "welcome-actions");
  const open = el("button", "btn btn-primary", "Open drawing");
  open.type = "button";
  open.innerHTML = `${icon("folder", 16)}<span>Open drawing</span>`;
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

  const recent = getRecent();
  if (recent.length) {
    const recents = el("div", "welcome-recents");
    recents.append(el("h3", "", "Recent"));
    const list = el("div", "recent-list");
    for (const entry of recent.slice(0, 10)) {
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

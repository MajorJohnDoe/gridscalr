import { measurementCategory } from "../model/categories";
import { CLOUD_FILL_PRESETS, cloudFillColor } from "../model/cloud";
import { COUNT_TYPE_LABELS } from "../model/countSymbols";
import { layersForKind, layerLockedOnPage, layerVisibleOnPage } from "../model/layers";
import { stampStatusColor } from "../model/stamps";
import { STROKE_WIDTH_OPTIONS } from "../model/style";
import {
  INSPECTION_STATUSES,
  INSPECTION_STATUS_LABELS,
  inspectionStatusColor,
  symbolCategoryColor,
  symbolCategoryLabel,
  symbolCategoryOf,
  symbolFor,
  symbolSvgMarkup,
} from "../model/symbols";
import type { LayerKind, Project } from "../model/types";
import { store, toolLayerKind } from "../state/store";
import { clear, el, option } from "./dom";
import { openMeasureOptions } from "./measureOptions";
import { textDialog } from "./dialogs";
import { icon } from "./icons";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";
import { TOOL_BY_ID, familyForTool } from "./toolDefs";
import { hasToolVariants, openToolFamilyVariants, openToolVariants } from "./toolFlyouts";
import { toast } from "./toast";

export function renderContextBar(refs: ShellRefs, _actions: PanelActions): void {
  clear(refs.contextBar);
  const project = store.project;
  const tool = TOOL_BY_ID.get(store.ui.activeTool);
  const family = tool ? familyForTool(tool.id) : undefined;
  const toolWrap = el("div", "context-tool");
  if (tool) {
    toolWrap.innerHTML = icon(tool.icon, 17);
    toolWrap.append(el("span", "", tool.label));
    if (hasToolVariants(tool.id) || family) {
      const variants = el("button", "context-variant-btn");
      variants.type = "button";
      variants.title = "Choose variants and presets";
      variants.setAttribute("aria-label", `Choose variants for ${tool.label}`);
      variants.innerHTML = `${icon("chevronDown", 12)}<span>Variants</span>`;
      variants.addEventListener("click", () => {
        if (family) openToolFamilyVariants(variants, family);
        else openToolVariants(variants, tool.id);
      });
      toolWrap.append(variants);
    }
  }
  refs.contextBar.append(toolWrap);
  refs.contextBar.append(el("div", "context-hint", tool?.hint ?? ""));
  if (!project) return;

  const controls = el("div", "context-controls");

  const activeLayer = project.layers.find((layer) => layer.id === project.activeLayerId);
  const targetKind = toolLayerKind(store.ui.activeTool);
  const layerTarget = el("label", "layer-target");
  if (activeLayer) {
    const page = store.ui.page;
    const activeVisible = layerVisibleOnPage(activeLayer, page);
    const activeLocked = layerLockedOnPage(activeLayer, page);
    layerTarget.classList.toggle(
      "is-warning",
      Boolean(targetKind && (!activeVisible || activeLocked)),
    );
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
      if (
        targetKind &&
        next &&
        (!layerVisibleOnPage(next, page) || layerLockedOnPage(next, page))
      ) {
        toast(
          `“${next.name}” is ${layerLockedOnPage(next, page) ? "locked" : "hidden"}. Unlock or show it before drawing.`,
          "warning",
        );
      }
    });
    layerTarget.append(el("span", "layer-target-label", "Layer"), dot, select);
    if (targetKind && (!activeVisible || activeLocked)) {
      const warning = el("span", "layer-target-warning");
      warning.title = activeLocked ? "The target layer is locked" : "The target layer is hidden";
      warning.innerHTML = icon(activeLocked ? "lock" : "eyeOff", 13);
      layerTarget.append(warning);
    }
    controls.append(layerTarget, el("div", "divider-v"));
  }

  const measureTool =
    store.ui.activeTool === "length" ||
    store.ui.activeTool === "area" ||
    store.ui.activeTool === "count" ||
    store.ui.activeTool === "radius" ||
    store.ui.activeTool === "diameter" ||
    store.ui.activeTool === "arc" ||
    store.ui.activeTool === "angle" ||
    store.ui.activeTool === "slope" ||
    store.ui.activeTool === "volume";
  if (measureTool) {
    const measureOptions = el("button", "btn btn-small btn-ghost context-measure-options");
    measureOptions.type = "button";
    measureOptions.title = "Category, room and measurement options";
    measureOptions.setAttribute("aria-label", "New measurement options: category, room and type");
    measureOptions.setAttribute("aria-expanded", "false");
    measureOptions.setAttribute("aria-haspopup", "dialog");
    measureOptions.innerHTML = `${icon("markups", 14)}<span class="context-measure-summary"></span>${icon("chevronDown", 12)}`;
    const summary = measureOptions.querySelector<HTMLElement>(".context-measure-summary");
    if (summary) summary.textContent = measurementSummary(project);

    let syncAreaMode = () => {};
    const updateSummary = () => {
      const current = store.project;
      if (current && summary) summary.textContent = measurementSummary(current);
      syncAreaMode();
    };
    const selectAreaMode = (mode: "add" | "subtract") => {
      store.setMeasureAreaMode(mode);
      updateSummary();
    };

    let areaMode: HTMLElement | null = null;
    if (store.ui.activeTool === "area") {
      const addButton = toggleButton("plus", "Add", store.ui.measureAreaMode === "add", () =>
        selectAreaMode("add"),
      );
      const deductButton = toggleButton(
        "minus",
        "Deduct",
        store.ui.measureAreaMode === "subtract",
        () => selectAreaMode("subtract"),
      );
      addButton.classList.add("area-mode-btn");
      deductButton.classList.add("area-mode-btn");
      addButton.title = "Add areas to their category and room";
      deductButton.title = "Deduct areas from their category and room";
      areaMode = el("div", "area-mode-toggle");
      areaMode.setAttribute("role", "group");
      areaMode.setAttribute("aria-label", "Area mode");
      areaMode.append(addButton, deductButton);
      syncAreaMode = () => {
        addButton.classList.toggle("is-on", store.ui.measureAreaMode === "add");
        addButton.setAttribute("aria-pressed", String(store.ui.measureAreaMode === "add"));
        deductButton.classList.toggle("is-on", store.ui.measureAreaMode === "subtract");
        deductButton.setAttribute("aria-pressed", String(store.ui.measureAreaMode === "subtract"));
      };
    }

    measureOptions.addEventListener("click", () =>
      openMeasureOptions(measureOptions, updateSummary),
    );
    if (areaMode) controls.append(areaMode, el("div", "divider-v"));
    controls.append(measureOptions, el("div", "divider-v"));
  }

  if (store.ui.activeTool === "symbol") {
    const definition = symbolFor(store.ui.symbolId);
    const symbolButton = el("button", "btn btn-small btn-ghost context-symbol-button");
    symbolButton.type = "button";
    symbolButton.title = "Open the Symbols library";
    symbolButton.setAttribute("aria-label", "Open the Symbols library");
    const color = symbolCategoryColor(symbolCategoryOf(definition.id));
    symbolButton.innerHTML = `${symbolSvgMarkup(definition, 16, color)}<span>${definition.name}</span>`;
    symbolButton.addEventListener("click", () => store.setLeftTab("symbols"));

    const category = el(
      "span",
      "context-symbol-category",
      symbolCategoryLabel(definition.category),
    );
    category.style.color = color;

    const status = el("select", "select context-symbol-status");
    status.setAttribute("aria-label", "Status for the next symbol");
    status.title = "Inspection status for the next placed symbol";
    status.append(option("", "Not assessed", !store.ui.symbolStatus));
    for (const value of INSPECTION_STATUSES) {
      status.append(
        option(value, INSPECTION_STATUS_LABELS[value], store.ui.symbolStatus === value),
      );
    }
    status.value = store.ui.symbolStatus ?? "";
    status.style.color = inspectionStatusColor(store.ui.symbolStatus ?? undefined);
    status.addEventListener("change", () => {
      store.setSymbolStatus(
        status.value ? (status.value as (typeof INSPECTION_STATUSES)[number]) : null,
      );
    });
    controls.append(symbolButton, category, status, el("div", "divider-v"));
  }

  if (
    store.ui.activeTool === "pen" ||
    store.ui.activeTool === "line" ||
    store.ui.activeTool === "arrow" ||
    store.ui.activeTool === "rect" ||
    store.ui.activeTool === "ellipse" ||
    store.ui.activeTool === "highlight" ||
    store.ui.activeTool === "text" ||
    store.ui.activeTool === "cloud" ||
    store.ui.activeTool === "callout" ||
    store.ui.activeTool === "stamp" ||
    store.ui.activeTool === "delta"
  ) {
    const color = el("input", "color-swatch");
    color.type = "color";
    const cloudPreset = store.ui.activeTool === "cloud" ? cloudFillColor(store.ui.cloudFill) : null;
    color.value =
      store.ui.activeTool === "stamp"
        ? stampStatusColor(store.ui.stampText, store.ui.style.color)
        : (cloudPreset ?? store.ui.style.color);
    color.title =
      store.ui.activeTool === "stamp"
        ? "Stamp colour follows its status preset"
        : cloudPreset
          ? "Cloud colour follows its fill preset"
          : "Markup colour";
    color.disabled = store.ui.activeTool === "stamp" || Boolean(cloudPreset);
    color.addEventListener("change", () => store.setStyle({ color: color.value }));
    const width = el("select", "select");
    for (const value of STROKE_WIDTH_OPTIONS) {
      width.append(option(String(value), `${value} pt`, value === store.ui.style.strokeWidth));
    }
    width.title = "Stroke width";
    width.addEventListener("change", () => store.setStyle({ strokeWidth: Number(width.value) }));
    controls.append(color, width);
    if (
      store.ui.activeTool === "text" ||
      store.ui.activeTool === "cloud" ||
      store.ui.activeTool === "callout" ||
      store.ui.activeTool === "stamp" ||
      store.ui.activeTool === "delta"
    ) {
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

  if (store.ui.activeTool === "highlight") {
    const shapeField = el("label", "context-field");
    shapeField.title = "Highlight mode";
    shapeField.append(el("span", "context-field-label", "Mode"));
    const shapeSelect = el("select", "select context-select");
    shapeSelect.setAttribute("aria-label", "Highlight mode");
    shapeSelect.append(
      option("stroke", "Pen", store.ui.highlightShape === "stroke"),
      option("rectangle", "Rectangle", store.ui.highlightShape === "rectangle"),
      option("polygon", "Polygon", store.ui.highlightShape === "polygon"),
    );
    shapeSelect.addEventListener("change", () =>
      store.setHighlightShape(shapeSelect.value as "stroke" | "rectangle" | "polygon"),
    );
    shapeField.append(shapeSelect);
    controls.prepend(shapeField, el("div", "divider-v"));
  }

  if (store.ui.activeTool === "stamp") {
    const presetField = el("label", "context-field");
    presetField.title = "Stamp preset for the next stamp";
    presetField.append(el("span", "context-field-label", "Stamp"));
    const presetSelect = el("select", "select context-select");
    presetSelect.setAttribute("aria-label", "Stamp preset");
    const presets = project.settings.stampPresets.length
      ? project.settings.stampPresets
      : ["APPROVED"];
    if (!presets.includes(store.ui.stampText)) {
      presetSelect.append(option(store.ui.stampText, store.ui.stampText, true));
    }
    for (const preset of presets) {
      presetSelect.append(option(preset, preset, preset === store.ui.stampText));
    }
    presetSelect.addEventListener("change", () => store.setStampText(presetSelect.value));
    const custom = el("button", "btn btn-small btn-ghost", "Custom…");
    custom.type = "button";
    custom.addEventListener("click", () => {
      void textDialog("Custom stamp", "Only for the next stamp", store.ui.stampText, "Status").then(
        (value) => {
          if (value !== null && value.trim()) store.setStampText(value.trim());
        },
      );
    });
    presetField.append(presetSelect);
    controls.prepend(presetField, custom, el("div", "divider-v"));
  }

  if (store.ui.activeTool === "delta") {
    const revisionField = el("label", "context-field");
    revisionField.title = "Revision number or letter";
    revisionField.append(el("span", "context-field-label", "Revision"));
    const revision = el("input", "input context-room-input");
    revision.type = "text";
    revision.value = store.ui.deltaText;
    revision.setAttribute("aria-label", "Revision number or letter");
    revision.addEventListener("input", () => store.setDeltaText(revision.value));
    revisionField.append(revision);
    controls.prepend(revisionField, el("div", "divider-v"));
  }

  if (store.ui.activeTool === "arrow") {
    const headsField = el("label", "context-field");
    headsField.title = "Arrowheads";
    headsField.append(el("span", "context-field-label", "Heads"));
    const heads = el("select", "select context-select");
    heads.setAttribute("aria-label", "Arrowheads");
    heads.append(
      option("end", "Single", store.ui.arrowHeads === "end"),
      option("both", "Double", store.ui.arrowHeads === "both"),
    );
    heads.addEventListener("change", () =>
      store.setArrowHeads(heads.value === "both" ? "both" : "end"),
    );
    headsField.append(heads);
    controls.prepend(headsField, el("div", "divider-v"));
  }

  if (store.ui.activeTool === "cloud") {
    const textToggle = toggleButton("callout", "Text box", store.ui.cloudText, () => {
      store.setCloudText(!store.ui.cloudText);
    });
    const fillField = el("label", "context-field");
    fillField.title = "Fill preset for the next cloud";
    fillField.append(el("span", "context-field-label", "Fill"));
    const fillSelect = el("select", "select context-select");
    fillSelect.setAttribute("aria-label", "Cloud fill preset");
    for (const preset of CLOUD_FILL_PRESETS) {
      fillSelect.append(option(preset.id, preset.label, preset.id === store.ui.cloudFill));
    }
    fillSelect.addEventListener("change", () =>
      store.setCloudFill(fillSelect.value as typeof store.ui.cloudFill),
    );
    fillField.append(fillSelect);
    controls.prepend(textToggle, fillField, el("div", "divider-v"));
  }

  refs.contextBar.append(controls);
}

function measurementSummary(project: Project): string {
  const parts: string[] = [];
  if (store.ui.activeTool === "area") {
    parts.push(
      store.ui.measureAreaShape === "rectangle"
        ? "Rectangle"
        : store.ui.measureAreaShape === "ellipse"
          ? "Ellipse"
          : "Polygon",
    );
    parts.push(store.ui.measureAreaMode === "subtract" ? "Deduct" : "Add");
  } else if (store.ui.activeTool === "count") {
    parts.push(COUNT_TYPE_LABELS[store.ui.measureCountType]);
  }
  const category = measurementCategory(project, store.ui.measureCategoryId);
  parts.push(category?.name ?? "Category");
  const room = store.ui.measureRoom.trim();
  if (room) parts.push(room);
  return parts.join(" · ");
}

function toggleButton(
  iconName: string,
  label: string,
  active: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const btn = el("button", `toggle${active ? " is-on" : ""}`);
  btn.type = "button";
  btn.innerHTML = `${icon(iconName, 14)}<span>${label}</span>`;
  btn.setAttribute("aria-pressed", String(active));
  btn.addEventListener("click", onClick);
  return btn;
}

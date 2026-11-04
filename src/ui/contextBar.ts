import { measurementCategory } from "../model/categories";
import { CLOUD_FILL_PRESETS, cloudFillColor, cloudFillLabel } from "../model/cloud";
import { countTypeLabel } from "../features/countTypes/model";
import { layersForKind, layerLockedOnPage, layerVisibleOnPage } from "../model/layers";
import { stampStatusColor } from "../model/stamps";
import { STROKE_WIDTH_OPTIONS } from "../model/style";
import {
  INSPECTION_STATUSES,
  inspectionStatusColor,
  inspectionStatusLabel,
  symbolCategoryColor,
  symbolCategoryLabel,
  symbolCategoryOf,
  symbolFor,
  symbolName,
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
import { t } from "../i18n";

export function renderContextBar(refs: ShellRefs, _actions: PanelActions): void {
  clear(refs.contextBar);
  const project = store.project;
  const tool = TOOL_BY_ID.get(store.ui.activeTool);
  const family = tool ? familyForTool(tool.id) : undefined;
  const toolWrap = el("div", "context-tool");
  if (tool) {
    toolWrap.innerHTML = icon(tool.icon, 17);
    toolWrap.append(el("span", "", t(tool.label)));
    if (hasToolVariants(tool.id) || family) {
      const variants = el("button", "context-variant-btn");
      variants.type = "button";
      variants.title = t("context.chooseVariants");
      variants.setAttribute("aria-label", t("tool.chooseVariants", { name: t(tool.label) }));
      variants.innerHTML = `${icon("chevronDown", 12)}<span>${t("context.variants")}</span>`;
      variants.addEventListener("click", () => {
        if (family) openToolFamilyVariants(variants, family);
        else openToolVariants(variants, tool.id);
      });
      toolWrap.append(variants);
    }
  }
  refs.contextBar.append(toolWrap);
  refs.contextBar.append(el("div", "context-hint", tool ? t(tool.hint) : ""));
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
    select.title = t("context.layerReceives");
    select.setAttribute("aria-label", t("context.targetLayer"));
    for (const kind of ["draw", "measure"] as LayerKind[]) {
      if (targetKind && kind !== targetKind) continue;
      const group = document.createElement("optgroup");
      group.label = kind === "measure" ? t("context.measurements") : t("context.drawings");
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
          t("context.targetUnavailable", {
            name: next.name,
            state: layerLockedOnPage(next, page)
              ? t("context.stateLocked")
              : t("context.stateHidden"),
          }),
          "warning",
        );
      }
    });
    layerTarget.append(el("span", "layer-target-label", t("context.layer")), dot, select);
    if (targetKind && (!activeVisible || activeLocked)) {
      const warning = el("span", "layer-target-warning");
      warning.title = activeLocked ? t("context.targetLocked") : t("context.targetHidden");
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
    measureOptions.title = t("context.measureOptionsTitle");
    measureOptions.setAttribute("aria-label", t("context.measureOptionsAria"));
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
      const addButton = toggleButton(
        "plus",
        t("context.add"),
        store.ui.measureAreaMode === "add",
        () => selectAreaMode("add"),
      );
      const deductButton = toggleButton(
        "minus",
        t("context.deduct"),
        store.ui.measureAreaMode === "subtract",
        () => selectAreaMode("subtract"),
      );
      addButton.classList.add("area-mode-btn");
      deductButton.classList.add("area-mode-btn");
      addButton.title = t("context.addAreasTitle");
      deductButton.title = t("context.deductAreasTitle");
      areaMode = el("div", "area-mode-toggle");
      areaMode.setAttribute("role", "group");
      areaMode.setAttribute("aria-label", t("context.areaMode"));
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
    symbolButton.title = t("context.openSymbols");
    symbolButton.setAttribute("aria-label", t("context.openSymbols"));
    const color = symbolCategoryColor(symbolCategoryOf(definition.id));
    symbolButton.innerHTML = `${symbolSvgMarkup(definition, 16, color)}<span>${symbolName(definition.id)}</span>`;
    symbolButton.addEventListener("click", () => store.setLeftTab("symbols"));

    const category = el(
      "span",
      "context-symbol-category",
      symbolCategoryLabel(definition.category),
    );
    category.style.color = color;

    const status = el("select", "select context-symbol-status");
    status.setAttribute("aria-label", t("context.statusNext"));
    status.title = t("context.statusNextTitle");
    status.append(option("", t("context.notAssessed"), !store.ui.symbolStatus));
    for (const value of INSPECTION_STATUSES) {
      status.append(option(value, inspectionStatusLabel(value), store.ui.symbolStatus === value));
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
        ? t("context.stampColour")
        : cloudPreset
          ? t("context.cloudColour")
          : t("context.markupColour");
    color.disabled = store.ui.activeTool === "stamp" || Boolean(cloudPreset);
    color.addEventListener("change", () => store.setStyle({ color: color.value }));
    const width = el("select", "select");
    for (const value of STROKE_WIDTH_OPTIONS) {
      width.append(option(String(value), `${value} pt`, value === store.ui.style.strokeWidth));
    }
    width.title = t("context.strokeWidth");
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
      sizeWrap.title = t("context.textSizePoints");
      sizeWrap.append(el("span", "", t("context.size")));
      const fontSize = el("input", "input context-number-input");
      fontSize.type = "number";
      fontSize.min = "0.5";
      fontSize.max = "300";
      fontSize.step = "0.5";
      fontSize.value = String(store.ui.style.fontSize);
      fontSize.setAttribute("aria-label", t("context.textSizePoints"));
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
    shapeField.title = t("context.highlightMode");
    shapeField.append(el("span", "context-field-label", t("context.mode")));
    const shapeSelect = el("select", "select context-select");
    shapeSelect.setAttribute("aria-label", t("context.highlightMode"));
    shapeSelect.append(
      option("stroke", t("tool.pen"), store.ui.highlightShape === "stroke"),
      option("rectangle", t("tool.rect"), store.ui.highlightShape === "rectangle"),
      option("polygon", t("context.polygon"), store.ui.highlightShape === "polygon"),
    );
    shapeSelect.addEventListener("change", () =>
      store.setHighlightShape(shapeSelect.value as "stroke" | "rectangle" | "polygon"),
    );
    shapeField.append(shapeSelect);
    controls.prepend(shapeField, el("div", "divider-v"));
  }

  if (store.ui.activeTool === "stamp") {
    const presetField = el("label", "context-field");
    presetField.title = t("context.stampPresetNext");
    presetField.append(el("span", "context-field-label", t("context.stamp")));
    const presetSelect = el("select", "select context-select");
    presetSelect.setAttribute("aria-label", t("context.stampPreset"));
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
    const custom = el("button", "btn btn-small btn-ghost", t("context.custom"));
    custom.type = "button";
    custom.addEventListener("click", () => {
      void textDialog(
        t("context.customStampTitle"),
        t("context.customStampSubtitle"),
        store.ui.stampText,
        t("context.statusPlaceholder"),
      ).then((value) => {
        if (value !== null && value.trim()) store.setStampText(value.trim());
      });
    });
    presetField.append(presetSelect);
    controls.prepend(presetField, custom, el("div", "divider-v"));
  }

  if (store.ui.activeTool === "delta") {
    const revisionField = el("label", "context-field");
    revisionField.title = t("context.revisionNumber");
    revisionField.append(el("span", "context-field-label", t("context.revision")));
    const revision = el("input", "input context-room-input");
    revision.type = "text";
    revision.value = store.ui.deltaText;
    revision.setAttribute("aria-label", t("context.revisionNumber"));
    revision.addEventListener("input", () => store.setDeltaText(revision.value));
    revisionField.append(revision);
    controls.prepend(revisionField, el("div", "divider-v"));
  }

  if (store.ui.activeTool === "arrow") {
    const headsField = el("label", "context-field");
    headsField.title = t("context.arrowheads");
    headsField.append(el("span", "context-field-label", t("context.heads")));
    const heads = el("select", "select context-select");
    heads.setAttribute("aria-label", t("context.arrowheads"));
    heads.append(
      option("end", t("context.single"), store.ui.arrowHeads === "end"),
      option("both", t("context.double"), store.ui.arrowHeads === "both"),
    );
    heads.addEventListener("change", () =>
      store.setArrowHeads(heads.value === "both" ? "both" : "end"),
    );
    headsField.append(heads);
    controls.prepend(headsField, el("div", "divider-v"));
  }

  if (store.ui.activeTool === "cloud") {
    const textToggle = toggleButton("callout", t("context.textBox"), store.ui.cloudText, () => {
      store.setCloudText(!store.ui.cloudText);
    });
    const fillField = el("label", "context-field");
    fillField.title = t("context.fillPresetNext");
    fillField.append(el("span", "context-field-label", t("context.fill")));
    const fillSelect = el("select", "select context-select");
    fillSelect.setAttribute("aria-label", t("context.cloudFillPreset"));
    for (const preset of CLOUD_FILL_PRESETS) {
      fillSelect.append(
        option(preset.id, cloudFillLabel(preset.id), preset.id === store.ui.cloudFill),
      );
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
        ? t("tool.rect")
        : store.ui.measureAreaShape === "ellipse"
          ? t("tool.ellipse")
          : t("context.polygon"),
    );
    parts.push(store.ui.measureAreaMode === "subtract" ? t("context.deduct") : t("context.add"));
  } else if (store.ui.activeTool === "count") {
    parts.push(countTypeLabel(project, store.ui.measureCountType));
  }
  const category = measurementCategory(project, store.ui.measureCategoryId);
  parts.push(category?.name ?? t("context.categoryFallback"));
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

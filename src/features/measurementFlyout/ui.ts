import { allRooms } from "../../model/categories";
import { countPresetLabel, countTypeLabel } from "../../model/countTypes";
import { pageIdAt } from "../../model/pages";
import type { AreaMode, AreaShape, CountType } from "../../model/types";
import { store } from "../../state/store";
import { el, option } from "../../ui/dom";
import { icon } from "../../ui/icons";
import { toast } from "../../ui/toast";
import { t } from "../../i18n";
import {
  matchingCountPreset,
  measurementCapabilities,
  measurementCategoryId,
  measurementTargetLayers,
} from "./model";
import { applyCountPreset, deleteCountPreset, saveCurrentCountPreset } from "./controller";

export interface MeasurementPanelOptions {
  tool: string;
  rerender: () => void;
  onChange?: () => void;
}

function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el("label", "tool-flyout-field");
  wrap.append(el("span", "tool-flyout-field-label", label), control);
  return wrap;
}

function heading(panel: HTMLElement): void {
  const row = el("div", "tool-flyout-heading");
  row.append(
    el("span", "tool-flyout-heading-title", t("measureOptions.newMeasurement")),
    el("span", "tool-flyout-subtitle", t("measureOptions.sticky")),
  );
  panel.append(row);
}

/**
 * The one measurement settings surface: category, room, tool-specific options
 * and the page-scoped target layer. Every value is read from the store and
 * written through the existing store actions, so the panel adds no rule of its
 * own and each user action keeps its existing undo behaviour.
 */
export function renderMeasurementPanel(panel: HTMLElement, options: MeasurementPanelOptions): void {
  heading(panel);
  if (store.readOnly) {
    panel.append(el("div", "tool-flyout-note", t("measureFlyout.viewOnly")));
    return;
  }
  const project = store.project;
  if (!project) return;

  const capabilities = measurementCapabilities(options.tool);
  const changed = (rerender = false): void => {
    options.onChange?.();
    if (rerender) options.rerender();
  };

  const category = el("select", "select tool-flyout-select");
  category.setAttribute("aria-label", t("measureOptions.category"));
  const selectedCategoryId = measurementCategoryId(project, store.ui);
  for (const entry of project.categories) {
    category.append(option(entry.id, entry.name, entry.id === selectedCategoryId));
  }
  category.addEventListener("change", () => {
    store.setMeasureCategory(category.value);
    changed(true);
  });
  panel.append(field(t("measureOptions.category"), category));

  const room = el("input", "input");
  room.type = "text";
  room.value = store.ui.measureRoom;
  room.placeholder = t("measureOptions.roomOptional");
  room.setAttribute("aria-label", t("measureOptions.roomAria"));
  const roomList = el("datalist");
  roomList.id = "measure-flyout-rooms";
  for (const name of allRooms(project)) roomList.append(option(name, name));
  room.setAttribute("list", roomList.id);
  room.addEventListener("input", () => {
    store.setMeasureRoom(room.value);
    changed();
  });
  const clear = el("button", "icon-btn tool-flyout-clear");
  clear.type = "button";
  clear.innerHTML = icon("close", 13);
  clear.title = t("measureOptions.clearRoom");
  clear.setAttribute("aria-label", t("measureOptions.clearRoom"));
  clear.addEventListener("click", () => {
    room.value = "";
    store.setMeasureRoom("");
    changed();
    room.focus();
  });
  const roomWrap = el("div", "tool-flyout-room");
  roomWrap.append(room, clear, roomList);
  panel.append(field(t("measureOptions.room"), roomWrap));

  if (capabilities.area) renderAreaOptions(panel, changed);
  if (capabilities.count) renderCountOptions(panel, changed);

  renderLayerTarget(panel, pageIdAt(project, store.ui.page), changed);
}

function renderAreaOptions(panel: HTMLElement, changed: (rerender?: boolean) => void): void {
  panel.append(el("div", "tool-flyout-section", t("toolFlyout.area")));

  const shape = el("select", "select tool-flyout-select");
  shape.setAttribute("aria-label", t("measureOptions.areaShape"));
  for (const entry of [
    { value: "polygon", label: t("measureOptions.polygon") },
    { value: "rectangle", label: t("measureOptions.rectangle") },
    { value: "ellipse", label: t("measureOptions.ellipse") },
  ]) {
    shape.append(option(entry.value, entry.label, entry.value === store.ui.measureAreaShape));
  }
  shape.addEventListener("change", () => {
    store.setMeasureAreaShape(shape.value as AreaShape);
    changed();
  });
  panel.append(field(t("measureOptions.shape"), shape));

  const mode = el("select", "select tool-flyout-select");
  mode.setAttribute("aria-label", t("measureOptions.areaMode"));
  mode.append(
    option("add", t("measureOptions.addToArea"), store.ui.measureAreaMode === "add"),
    option("subtract", t("measureOptions.deductFromArea"), store.ui.measureAreaMode === "subtract"),
  );
  mode.addEventListener("change", () => {
    store.setMeasureAreaMode(mode.value as AreaMode);
    changed();
  });
  panel.append(field(t("measureOptions.area"), mode));
}

function renderCountOptions(panel: HTMLElement, changed: (rerender?: boolean) => void): void {
  const project = store.project;
  if (!project) return;
  panel.append(el("div", "tool-flyout-section", t("tool.count")));

  const matching = matchingCountPreset(project, store.ui);
  const preset = el("select", "select tool-flyout-select");
  preset.setAttribute("aria-label", t("measureOptions.countPreset"));
  preset.append(
    option("", t("measureOptions.currentSettings"), !matching),
    ...project.countPresets.map((entry) =>
      option(entry.id, countPresetLabel(project, entry), entry.id === matching?.id),
    ),
  );
  preset.addEventListener("change", () => {
    if (!preset.value) return;
    applyCountPreset(preset.value);
    changed(true);
  });
  panel.append(field(t("measureOptions.preset"), preset));

  const type = el("select", "select tool-flyout-select");
  type.setAttribute("aria-label", t("measureOptions.objectType"));
  for (const entry of project.countTypes) {
    type.append(
      option(entry.id, countTypeLabel(project, entry.id), entry.id === store.ui.measureCountType),
    );
  }
  type.addEventListener("change", () => {
    store.setMeasureCountType(type.value as CountType);
    changed(true);
  });
  panel.append(field(t("measureOptions.type"), type));

  const pieces = el("input", "input");
  pieces.type = "number";
  pieces.min = "1";
  pieces.max = "100000";
  pieces.step = "1";
  pieces.value = String(store.ui.measureCountQuantity);
  pieces.setAttribute("aria-label", t("measureOptions.piecesPerCount"));
  pieces.title = t("measureOptions.piecesAria");
  pieces.addEventListener("change", () => {
    const value = Number(pieces.value);
    if (!Number.isFinite(value) || value < 1) {
      pieces.value = String(store.ui.measureCountQuantity);
      toast(t("measureOptions.piecesInvalid"), "warning");
      return;
    }
    store.setMeasureCountQuantity(value);
    changed();
  });
  panel.append(field(t("measureOptions.pieces"), pieces));

  const actions = el("div", "tool-flyout-actions");
  const save = el("button", "btn btn-small", t("measureOptions.savePreset"));
  save.type = "button";
  save.addEventListener("click", () => {
    if (saveCurrentCountPreset()) changed(true);
  });
  actions.append(save);
  if (matching) {
    const remove = el("button", "btn btn-small btn-ghost", t("measureOptions.deletePreset"));
    remove.type = "button";
    remove.addEventListener("click", () => {
      deleteCountPreset(matching.id);
      changed(true);
    });
    actions.append(remove);
  }
  panel.append(actions);
}

function renderLayerTarget(
  panel: HTMLElement,
  pageId: string | null,
  changed: (rerender?: boolean) => void,
): void {
  const project = store.project;
  if (!project) return;
  panel.append(el("div", "tool-flyout-section", t("context.targetLayer")));
  const layers = measurementTargetLayers(project, pageId);
  if (!layers.length) {
    panel.append(el("div", "tool-flyout-note", t("measureFlyout.noTargetLayer")));
    return;
  }
  const select = el("select", "select tool-flyout-select");
  select.setAttribute("aria-label", t("context.targetLayer"));
  const activeId = project.activeLayerId;
  const hasActive = layers.some((layer) => layer.id === activeId);
  select.append(option("", t("measureFlyout.chooseLayer"), !hasActive));
  for (const layer of layers) {
    select.append(option(layer.id, layer.name, layer.id === activeId));
  }
  select.addEventListener("change", () => {
    if (!select.value) return;
    store.setActiveLayer(select.value);
    changed();
  });
  panel.append(select);
}

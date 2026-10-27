import {
  layerLockedOnPage,
  layerVisibleOnPage,
  removeLayer,
  setLayerLockedOnPage,
  setLayerVisibleOnPage,
} from "../model/layers";
import { AREA_UNITS, LENGTH_UNITS } from "../model/units";
import type { AreaUnit, LengthUnit } from "../model/types";
import { store } from "../state/store";
import { confirmDialog } from "./dialogs";
import { clear, el, option } from "./dom";
import { icon } from "./icons";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";
import { selectionSection } from "./selectionInspector";
import { openSettingsDialog } from "./settingsDialog";
import { setInspectorCollapsed } from "./sidebar";

export function renderInspector(refs: ShellRefs, actions: PanelActions): void {
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

  refs.inspector.append(unitsSection(project));
  const layerSection = activeLayerSection(project, actions);
  layerSection.classList.add("active-layer-section");
  const selection = selectionSection(project, actions);
  selection.classList.add("selection-section");
  // A selected markup is the task at hand. Put it above the layer-wide
  // settings so the two colour controls are harder to confuse.
  if (store.ui.selection.length) {
    refs.inspector.append(selection, layerSection);
  } else {
    refs.inspector.append(layerSection, selection);
  }
}

function unitsSection(project: NonNullable<typeof store.project>): HTMLElement {
  const section = el("section", "inspector-section");
  const unitsHead = el("div", "section-head");
  unitsHead.append(el("h3", "", "Measurement units"));
  unitsHead.append(el("span", "status-chip", "Project"));
  section.append(unitsHead);
  const unitsRow = el("div", "field-row");

  const lengthField = el("label", "field");
  lengthField.append(el("span", "field-label", "Length"));
  const lengthUnit = el("select", "select");
  lengthUnit.setAttribute("aria-label", "Project length unit");
  lengthUnit.title = "Applies to every page and to quantity reports";
  for (const unit of LENGTH_UNITS) {
    lengthUnit.append(option(unit.id, unit.label, unit.id === project.settings.lengthUnit));
  }
  lengthUnit.addEventListener("change", () => {
    store.mutate((current) => {
      current.settings.lengthUnit = lengthUnit.value as LengthUnit;
    }, "change");
  });
  lengthField.append(lengthUnit);

  const areaField = el("label", "field");
  areaField.append(el("span", "field-label", "Area"));
  const areaUnit = el("select", "select");
  areaUnit.setAttribute("aria-label", "Project area unit");
  areaUnit.title = "Applies to every page and to quantity reports";
  for (const unit of AREA_UNITS) {
    areaUnit.append(option(unit.id, unit.label, unit.id === project.settings.areaUnit));
  }
  areaUnit.addEventListener("change", () => {
    store.mutate((current) => {
      current.settings.areaUnit = areaUnit.value as AreaUnit;
    }, "change");
  });
  areaField.append(areaUnit);

  unitsRow.append(lengthField, areaField);
  section.append(unitsRow);
  section.append(
    el(
      "div",
      "empty-note small",
      "Project-wide. Changing units only changes the display and reports. Set the page scale from the status bar.",
    ),
  );
  return section;
}

function activeLayerSection(
  project: NonNullable<typeof store.project>,
  actions: PanelActions,
): HTMLElement {
  const section = el("section", "inspector-section");
  const head = el("div", "section-head");
  head.append(el("h3", "", "Active layer"));
  const active = project.layers.find((l) => l.id === project.activeLayerId);
  section.append(head);
  section.append(
    el(
      "div",
      "empty-note small",
      "Name, colour and opacity apply to the whole layer. Visibility and lock apply to the current page. To change one markup, use Selection.",
    ),
  );
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
    store.mutate((project) => {
      const layer = project.layers.find((l) => l.id === active.id);
      if (layer) layer.name = nameInput.value.trim();
    }, "layers");
  });
  nameField.append(nameInput);
  section.append(nameField);

  const colorField = el("label", "field");
  colorField.append(el("span", "field-label", "Layer colour (all items)"));
  const color = el("input", "color-swatch");
  color.type = "color";
  color.value = active.color;
  color.addEventListener("change", () => {
    store.mutate((project) => {
      const layer = project.layers.find((l) => l.id === active.id);
      if (!layer) return;
      layer.color = color.value;
      for (const item of layer.items) item.color = color.value;
    }, "layers");
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
    store.mutate((project) => {
      const layer = project.layers.find((l) => l.id === active.id);
      if (layer) layer.opacity = Number(range.value) / 100;
    }, "layers");
  });
  opacityField.append(opacityHead, range);
  section.append(opacityField);

  const toggles = el("div", "field-row");
  const page = store.ui.page;
  const activeVisible = layerVisibleOnPage(active, page);
  const activeLocked = layerLockedOnPage(active, page);
  const visible = el("button", `toggle${activeVisible ? " is-on" : ""}`);
  visible.type = "button";
  visible.title = `Visibility on Page ${page}`;
  visible.innerHTML = `${icon(activeVisible ? "eye" : "eyeOff", 13)}<span>${activeVisible ? "Visible" : "Hidden"} on p.${page}</span>`;
  visible.addEventListener("click", () => {
    store.mutate((project) => {
      const layer = project.layers.find((l) => l.id === active.id);
      if (layer) setLayerVisibleOnPage(layer, page, !layerVisibleOnPage(layer, page));
    }, "layers");
  });
  const locked = el("button", `toggle${activeLocked ? " is-on" : ""}`);
  locked.type = "button";
  locked.title = `Lock state on Page ${page}`;
  locked.innerHTML = `${icon(activeLocked ? "lock" : "unlock", 13)}<span>${activeLocked ? "Locked" : "Unlocked"} on p.${page}</span>`;
  locked.addEventListener("click", () => {
    store.mutate((project) => {
      const layer = project.layers.find((l) => l.id === active.id);
      if (layer) setLayerLockedOnPage(layer, page, !layerLockedOnPage(layer, page));
    }, "layers");
  });
  toggles.append(visible, locked);
  section.append(toggles);

  const deleteLayerBtn = el(
    "button",
    "btn btn-small btn-ghost",
    `Delete layer (${active.items.length})`,
  );
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

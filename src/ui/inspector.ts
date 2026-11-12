import {
  defaultColorForLayer,
  layerLockedOnPage,
  layerVisibleOnPage,
  removeLayer,
  resolveLayerColor,
  setLayerLockedOnPage,
  setLayerVisibleOnPage,
} from "../model/layers";
import { buildLayerHierarchy } from "../model/layerHierarchy";
import { layerSubtreeSize } from "../features/layerTree";
import { store } from "../state/store";
import { pageIdAt } from "../model/pages";
import { pageProvenanceSection } from "../features/importProvenance";
import { colorInputValue, setColorInput } from "./colorInput";
import { colorWithEyedropper } from "./colorPicker";
import { confirmDialog } from "./dialogs";
import { clear, el } from "./dom";
import { icon } from "./icons";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";
import { selectionSection } from "./selectionInspector";
import { openSettingsDialog } from "./settingsDialog";
import { setInspectorCollapsed } from "./sidebar";
import { t } from "../i18n";
import { disableEditingControls, viewOnlyPanelNote } from "../features/viewOnly";

export function renderInspector(refs: ShellRefs, actions: PanelActions): void {
  clear(refs.inspector);
  const header = el("div", "inspector-header");
  const tabs = el("div", "inspector-tabs");
  const propertiesTab = el("button", "inspector-tab is-active", t("shell.properties"));
  propertiesTab.type = "button";
  propertiesTab.setAttribute("aria-pressed", "true");
  propertiesTab.title = t("inspector.layerSelectionProps");
  const settingsTab = el("button", "inspector-tab", t("inspector.projectSettings"));
  settingsTab.type = "button";
  settingsTab.setAttribute("aria-pressed", "false");
  settingsTab.title = store.readOnly
    ? `${t("inspector.settingsTitle")} · ${t("viewOnly.disabled")}`
    : t("inspector.settingsTitle");
  settingsTab.disabled = !store.project || store.readOnly;
  settingsTab.addEventListener("click", () => openSettingsDialog());
  tabs.append(propertiesTab, settingsTab);
  const headerActions = el("span", "inspector-header-actions");
  const collapse = el("button", "icon-btn inspector-settings");
  collapse.type = "button";
  collapse.title = t("inspector.hidePropertiesTitle");
  collapse.setAttribute("aria-label", t("inspector.hideProperties"));
  collapse.innerHTML = icon("chevronRight", 14);
  collapse.addEventListener("click", () => setInspectorCollapsed(true));
  headerActions.append(collapse);
  header.append(tabs, headerActions);
  refs.inspector.append(header);
  const project = store.project;
  if (!project) {
    const note = el("div", "empty-note");
    note.innerHTML = `${icon("info", 26)}<div>${t("inspector.openDrawingNote")}</div>`;
    refs.inspector.append(note);
    return;
  }

  const layerSection = activeLayerSection(project, actions);
  layerSection.classList.add("active-layer-section");
  const selection = selectionSection(project, actions);
  selection.classList.add("selection-section");
  const currentPageId = pageIdAt(project, store.ui.page);
  const provenance = currentPageId ? pageProvenanceSection(project, currentPageId) : null;
  if (store.readOnly) {
    refs.inspector.append(viewOnlyPanelNote());
    disableEditingControls(layerSection, true);
    disableEditingControls(selection, true);
  }
  // A selected markup is the task at hand. Put it above the layer-wide
  // settings so the two colour controls are harder to confuse.
  if (store.ui.selection.length) {
    refs.inspector.append(selection, layerSection);
  } else {
    refs.inspector.append(layerSection, selection);
  }
  // Imported pages carry a read-only source record; normal pages render no
  // section and no empty heading.
  if (provenance) refs.inspector.append(provenance);
}

function activeLayerSection(
  project: NonNullable<typeof store.project>,
  actions: PanelActions,
): HTMLElement {
  const section = el("section", "inspector-section");
  const head = el("div", "section-head");
  head.append(el("h3", "", t("inspector.activeLayer")));
  const active = project.layers.find((l) => l.id === project.activeLayerId);
  section.append(head);
  if (!active) {
    section.append(el("div", "empty-note small", t("inspector.noActiveLayer")));
    return section;
  }
  head.append(
    el(
      "span",
      "status-chip",
      active.kind === "measure" ? t("inspector.measurement") : t("inspector.drawing"),
    ),
  );

  const nameField = el("label", "field");
  nameField.append(el("span", "field-label", t("inspector.name")));
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
  colorField.append(el("span", "field-label", t("inspector.layerColour")));
  const color = el("input", "color-swatch");
  color.type = "color";
  const fallbackColor = defaultColorForLayer(active.kind);
  setColorInput(color, resolveLayerColor(active), fallbackColor);
  color.addEventListener("change", () => {
    const next = colorInputValue(color, fallbackColor);
    store.mutate((project) => {
      const layer = project.layers.find((l) => l.id === active.id);
      if (!layer) return;
      layer.color = next;
      for (const item of layer.items) item.color = next;
    }, "layers");
  });
  colorField.append(colorWithEyedropper(color, t("inspector.layerColour")));
  section.append(colorField);

  const opacityField = el("label", "field");
  const opacityHead = el("div", "section-head");
  opacityHead.style.marginBottom = "4px";
  opacityHead.append(el("span", "field-label", t("inspector.opacity")));
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
  const pageId = pageIdAt(project, page) ?? "";
  const hierarchy = buildLayerHierarchy(project.layers);
  const activeVisible = layerVisibleOnPage(active, pageId, hierarchy);
  const activeLocked = layerLockedOnPage(active, pageId, hierarchy);
  const visible = el("button", `toggle${activeVisible ? " is-on" : ""}`);
  visible.type = "button";
  visible.title = t("inspector.visibilityOnPage", { page });
  visible.innerHTML = `${icon(activeVisible ? "eye" : "eyeOff", 13)}<span>${activeVisible ? t("inspector.visibleOnPage", { page }) : t("inspector.hiddenOnPage", { page })}</span>`;
  visible.addEventListener("click", () => {
    store.mutate((project) => {
      const layer = project.layers.find((l) => l.id === active.id);
      if (layer) setLayerVisibleOnPage(layer, pageId, !layerVisibleOnPage(layer, pageId));
    }, "layers");
  });
  const locked = el("button", `toggle${activeLocked ? " is-on" : ""}`);
  locked.type = "button";
  locked.title = t("inspector.lockStateOnPage", { page });
  locked.innerHTML = `${icon(activeLocked ? "lock" : "unlock", 13)}<span>${activeLocked ? t("inspector.lockedOnPage", { page }) : t("inspector.unlockedOnPage", { page })}</span>`;
  locked.addEventListener("click", () => {
    store.mutate((project) => {
      const layer = project.layers.find((l) => l.id === active.id);
      if (layer) setLayerLockedOnPage(layer, pageId, !layerLockedOnPage(layer, pageId));
    }, "layers");
  });
  toggles.append(visible, locked);
  section.append(toggles);

  // A group deletes its whole subtree, so the button and the confirmation name
  // everything that will be removed, not only the layer's own items.
  const subtree = layerSubtreeSize(project, active.id);
  const deleteLayerBtn = el(
    "button",
    "btn btn-small btn-ghost",
    t("inspector.deleteLayerCount", { count: subtree.items }),
  );
  deleteLayerBtn.type = "button";
  deleteLayerBtn.style.marginTop = "8px";
  deleteLayerBtn.addEventListener("click", () => {
    const message =
      subtree.layers > 1
        ? t("layer.deleteSubtree", {
            name: active.name,
            children: subtree.layers - 1,
            items: subtree.items,
          })
        : subtree.items
          ? t("inspector.deleteLayerWithItems", {
              name: active.name,
              count: subtree.items,
            })
          : t("inspector.deleteLayerEmpty", { name: active.name });
    void confirmDialog(t("inspector.deleteLayerTitle"), message, t("common.delete"), {
      danger: true,
    }).then((confirmed) => {
      if (confirmed) store.mutate((project) => removeLayer(project, active.id), "layers");
      actions.refresh();
    });
  });
  section.append(deleteLayerBtn);
  return section;
}

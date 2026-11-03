import {
  currentLayerColorDefaults,
  resetLayerColorDefaults,
  saveLayerColorDefaults,
} from "../io/layerDefaults";
import {
  loadGlobalStampPresets,
  resetGlobalStampPresets,
  saveGlobalStampPresets,
} from "../io/stampDefaults";
import { store } from "../state/store";
import { showModal } from "./dialogs";
import { el } from "./dom";
import { loadPanelPreferences } from "./preferences";
import { resetPanelLayout, setInspectorCollapsed, setSidebarCollapsed } from "./sidebar";
import { presetEditor, section } from "./settingsControls";
import { toast } from "./toast";

type PreferenceCategory = "workspace" | "layers" | "stamps";

function workspaceSection(): HTMLElement {
  const wrap = section(
    "Workspace",
    "Panel widths and collapsed state are stored on this computer and are not part of the project file.",
  );
  const prefs = loadPanelPreferences();
  wrap.append(
    el(
      "p",
      "settings-note",
      `Sidebar ${prefs.leftWidth} px${prefs.leftCollapsed ? " (collapsed)" : ""} · Properties ${prefs.rightWidth} px${prefs.rightCollapsed ? " (collapsed)" : ""}.`,
    ),
  );

  const actions = el("div", "settings-actions");
  const expand = el("button", "btn btn-small btn-ghost", "Expand both panels");
  expand.type = "button";
  expand.addEventListener("click", () => {
    setSidebarCollapsed(false);
    setInspectorCollapsed(false);
    openPreferencesDialog();
    toast("Panels expanded.", "success");
  });
  const reset = el("button", "btn btn-small btn-ghost", "Reset panel layout");
  reset.type = "button";
  reset.addEventListener("click", () => {
    resetPanelLayout();
    openPreferencesDialog();
    toast("Panel layout reset.", "success");
  });
  actions.append(expand, reset);
  wrap.append(actions);
  return wrap;
}

function layersSection(): HTMLElement {
  const wrap = section(
    "Layer defaults",
    "Applies to new measurement and drawing layers only. Existing layers keep their colour.",
  );
  let colors = currentLayerColorDefaults();
  const row = el("div", "field-row");

  const colorField = (label: string, value: string) => {
    const fieldWrap = el("label", "field settings-field");
    const input = el("input", "color-swatch");
    input.type = "color";
    input.value = value;
    input.setAttribute("aria-label", label);
    fieldWrap.append(el("span", "field-label", label), input);
    return { fieldWrap, input };
  };

  const measure = colorField("Measurement layer colour", colors.measure);
  const draw = colorField("Drawing layer colour", colors.draw);
  row.append(measure.fieldWrap, draw.fieldWrap);

  const save = () => {
    colors = saveLayerColorDefaults({
      measure: measure.input.value,
      draw: draw.input.value,
    });
  };
  measure.input.addEventListener("change", save);
  draw.input.addEventListener("change", save);

  const actions = el("div", "settings-actions");
  const signalRed = el("button", "btn btn-small btn-ghost", "Use signal red for both");
  signalRed.type = "button";
  signalRed.addEventListener("click", () => {
    measure.input.value = "#f70808";
    draw.input.value = "#f70808";
    save();
    toast("Layer colours set to signal red.", "success");
  });
  const reset = el("button", "btn btn-small btn-ghost", "Reset layer colours");
  reset.type = "button";
  reset.addEventListener("click", () => {
    colors = resetLayerColorDefaults();
    measure.input.value = colors.measure;
    draw.input.value = colors.draw;
    toast("Layer colour defaults reset.", "success");
  });
  actions.append(signalRed, reset);
  wrap.append(row, actions);
  return wrap;
}

function stampsSection(): HTMLElement {
  const wrap = section(
    "Stamps",
    "Defaults for new projects. The open project keeps its own preset list in Project settings.",
  );

  const editor = presetEditor(
    loadGlobalStampPresets(),
    (next) => {
      saveGlobalStampPresets(next);
    },
    "New default preset",
  );

  const actions = el("div", "settings-actions");
  const fromProject = el(
    "button",
    "btn btn-small btn-ghost",
    "Use the project's presets as defaults",
  );
  fromProject.type = "button";
  fromProject.disabled = !store.project;
  fromProject.title = store.project
    ? "Copy this project's stamp presets into the app defaults."
    : "Open a project to copy its presets.";
  fromProject.addEventListener("click", () => {
    const project = store.project;
    if (!project) return;
    saveGlobalStampPresets(project.settings.stampPresets);
    openPreferencesDialog();
    toast("App stamp defaults updated.", "success");
  });
  const reset = el("button", "btn btn-small btn-ghost", "Reset app defaults");
  reset.type = "button";
  reset.addEventListener("click", () => {
    resetGlobalStampPresets();
    openPreferencesDialog();
    toast("App stamp defaults reset.", "success");
  });
  actions.append(fromProject, reset);
  wrap.append(editor, actions);
  return wrap;
}

export function openPreferencesDialog(): void {
  const body = el("div", "preferences-dialog");
  const nav = el("nav", "preferences-nav");
  nav.setAttribute("aria-label", "Preference categories");
  const content = el("div", "preferences-body");
  body.append(nav, content);

  const categories: Array<{ id: PreferenceCategory; label: string; render: () => HTMLElement }> = [
    { id: "workspace", label: "Workspace", render: workspaceSection },
    { id: "layers", label: "Layers", render: layersSection },
    { id: "stamps", label: "Stamps", render: stampsSection },
  ];

  const buttons = new Map<PreferenceCategory, HTMLButtonElement>();
  const select = (id: PreferenceCategory) => {
    for (const [key, button] of buttons) {
      const selected = key === id;
      button.classList.toggle("is-active", selected);
      if (selected) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
    const category = categories.find((entry) => entry.id === id);
    content.replaceChildren(category ? category.render() : el("div"));
  };

  for (const category of categories) {
    const button = el("button", "preferences-tab", category.label);
    button.type = "button";
    button.addEventListener("click", () => select(category.id));
    nav.append(button);
    buttons.set(category.id, button);
  }
  select("workspace");

  void showModal({
    title: "Preferences",
    subtitle: "Stored on this computer; not part of the project file",
    body,
    wide: true,
    className: "modal-preferences",
    actions: [{ label: "Close", value: "close", primary: true }],
  });
}

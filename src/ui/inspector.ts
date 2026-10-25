import { isManualCalibration, pageCalibration, pageScale, pageScaleLocked } from "../model/calibration";
import { removeLayer } from "../model/layers";
import { formatNumber, formatScale } from "../model/units";
import { store } from "../state/store";
import { confirmDialog } from "./dialogs";
import { clear, el } from "./dom";
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


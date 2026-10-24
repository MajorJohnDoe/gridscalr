import {
  isManualCalibration,
  pageCalibration,
  pageScale,
  pageScaleLocked,
} from "../model/calibration";
import type { AreaUnit, LengthUnit } from "../model/types";
import { AREA_UNITS, formatNumber, formatScale, LENGTH_UNITS } from "../model/units";
import { store } from "../state/store";
import { openCategoriesDialog } from "./categoriesDialog";
import { showModal } from "./dialogs";
import { el, option } from "./dom";
import { resetPanelLayout } from "./sidebar";
import { toast } from "./toast";

function section(title: string, note?: string): HTMLElement {
  const wrap = el("section", "settings-section");
  wrap.append(el("h3", "", title));
  if (note) wrap.append(el("p", "settings-note", note));
  return wrap;
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

function field(label: string, control: HTMLElement): HTMLElement {
  const wrap = el("label", "field settings-field");
  wrap.append(el("span", "field-label", label), control);
  return wrap;
}

function scaleSection(): HTMLElement {
  const project = store.project!;
  const page = store.ui.page;
  const calibration = pageCalibration(project, page);
  const locked = pageScaleLocked(project, page);
  const wrap = section("Page scale", "Scale is stored per page and can be locked.");
  const value = el("p", "settings-scale-value");
  if (!calibration) {
    value.textContent = `Page ${page}: no scale. Length and area measurements use PDF points.`;
  } else {
    const detail = isManualCalibration(calibration)
      ? `Manual 1:${formatNumber(calibration.ratio, 6)}`
      : `Reference ${formatNumber(calibration.knownLength, 2)} ${calibration.unit}`;
    value.textContent = `Page ${page}: ${detail} · ${formatScale(pageScale(project, page), calibration)}${locked ? " · locked" : ""}`;
  }
  const hint = el(
    "p",
    "settings-note",
    "Use Properties → Scale to calibrate the current page, enter a manual 1:N scale, apply it to all pages, or lock it.",
  );
  wrap.append(value, hint);
  return wrap;
}

function unitsSection(): HTMLElement {
  const project = store.project!;
  const wrap = section("Units", "Project-wide units for measurements and quantity reports.");
  const row = el("div", "field-row");

  const length = el("select", "select");
  length.setAttribute("aria-label", "Project length unit");
  for (const unit of LENGTH_UNITS) {
    length.append(option(unit.id, unit.id, unit.id === project.settings.lengthUnit));
  }
  length.addEventListener("change", () => {
    store.mutate((project) => {
      project.settings.lengthUnit = length.value as LengthUnit;
    }, "change");
  });

  const area = el("select", "select");
  area.setAttribute("aria-label", "Project area unit");
  for (const unit of AREA_UNITS) {
    area.append(option(unit.id, unit.label, unit.id === project.settings.areaUnit));
  }
  area.addEventListener("change", () => {
    store.mutate((project) => {
      project.settings.areaUnit = area.value as AreaUnit;
    }, "change");
  });

  row.append(field("Length", length), field("Area", area));
  wrap.append(row);
  return wrap;
}

function displaySection(): HTMLElement {
  const project = store.project!;
  const wrap = section("Display and snapping");
  wrap.append(
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
    checkRow("Snap to geometry", project.settings.snapToGeometry, (checked) => {
      store.mutate((project) => {
        project.settings.snapToGeometry = checked;
      }, "change");
    }),
  );

  const snapField = field("Snap distance", el("div", "settings-range"));
  const range = snapField.querySelector<HTMLElement>(".settings-range")!;
  const input = el("input", "input");
  input.type = "range";
  input.min = "2";
  input.max = "24";
  input.step = "1";
  input.value = String(project.settings.snapTolerancePx);
  input.setAttribute("aria-label", "Snap distance in screen pixels");
  const readout = el("span", "settings-range-value", `${project.settings.snapTolerancePx} px`);
  input.addEventListener("input", () => {
    readout.textContent = `${input.value} px`;
  });
  input.addEventListener("change", () => {
    const value = Math.max(2, Math.min(24, Number(input.value)));
    store.mutate((project) => {
      project.settings.snapTolerancePx = value;
    }, "change");
  });
  range.append(input, readout);
  wrap.append(snapField);
  return wrap;
}

function quantitiesSection(): HTMLElement {
  const project = store.project!;
  const wrap = section(
    "Quantities",
    "Waste and rounding apply to order quantities. Categories can override both; 0 means no rounding, and counts always round to whole pcs.",
  );

  const defaultCategory = el("select", "select");
  defaultCategory.setAttribute("aria-label", "Default category for new measurements");
  for (const category of project.categories) {
    defaultCategory.append(
      option(
        category.id,
        category.name,
        category.id === project.settings.quantity.defaultCategoryId,
      ),
    );
  }
  defaultCategory.addEventListener("change", () => {
    store.setDefaultCategory(defaultCategory.value);
  });

  const row = el("div", "field-row");
  const waste = el("input", "input");
  waste.type = "number";
  waste.min = "0";
  waste.max = "100";
  waste.step = "0.5";
  waste.value = String(project.settings.quantity.wastePercent);
  waste.setAttribute("aria-label", "Project waste percentage");
  waste.addEventListener("change", () => {
    const value = Number(waste.value);
    if (waste.value.trim() === "" || !Number.isFinite(value) || value < 0 || value > 100) {
      waste.value = String(project.settings.quantity.wastePercent);
      toast("Waste must be between 0 and 100 percent.", "warning");
      return;
    }
    store.setQuantityDefaults({ wastePercent: value });
  });

  const rounding = el("input", "input");
  rounding.type = "number";
  rounding.min = "0";
  rounding.step = "0.01";
  rounding.value = String(project.settings.quantity.roundingStep);
  rounding.setAttribute("aria-label", "Project rounding step");
  rounding.addEventListener("change", () => {
    const value = Number(rounding.value);
    if (rounding.value.trim() === "" || !Number.isFinite(value) || value < 0) {
      rounding.value = String(project.settings.quantity.roundingStep);
      toast("Rounding step must be zero or greater.", "warning");
      return;
    }
    store.setQuantityDefaults({ roundingStep: value });
  });

  row.append(field("Waste (%)", waste), field("Round up", rounding));
  wrap.append(field("Default category", defaultCategory), row);

  const manage = el("button", "btn btn-small", `Manage categories (${project.categories.length})`);
  manage.type = "button";
  manage.addEventListener("click", () => {
    void openCategoriesDialog().then(() => {
      openSettingsDialog();
    });
  });
  wrap.append(manage);
  return wrap;
}

function interfaceSection(): HTMLElement {
  const wrap = section("Interface", "Panel layout is stored locally and is not part of the project file.");
  const reset = el("button", "btn btn-small", "Reset panel layout");
  reset.type = "button";
  reset.addEventListener("click", () => {
    resetPanelLayout();
    toast("Panel layout reset.", "success");
  });
  wrap.append(reset);
  return wrap;
}

export function openSettingsDialog(): void {
  if (!store.project) return;
  const body = el("div", "settings-dialog");
  const content = el("div", "settings-content");
  body.append(content);

  const render = () => {
    if (!store.project) return;
    content.replaceChildren(
      scaleSection(),
      unitsSection(),
      displaySection(),
      quantitiesSection(),
      interfaceSection(),
    );
  };
  render();

  void showModal({
    title: "Project settings",
    subtitle: "Project defaults and local interface preferences",
    body,
    wide: true,
    className: "modal-settings",
    actions: [{ label: "Close", value: "close", primary: true }],
  });
}

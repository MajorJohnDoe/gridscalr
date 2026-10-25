import type { LayerKind, LengthUnit } from "../model/types";
import { manualPointsPerMeter } from "../model/calibration";
import {
  cropAreaPercent,
  formatPageList,
  parsePageRange,
  type DrawingExportOptions,
  type NormalizedCrop,
} from "../model/export";
import { formatNumber, LENGTH_UNITS } from "../model/units";
import { el, option } from "./dom";
import { icon } from "./icons";

let activeModal: { close: () => void } | null = null;

interface ModalAction {
  label: string;
  value: string;
  primary?: boolean;
  danger?: boolean;
}

function closeActiveModal(): void {
  activeModal?.close();
}

export function showModal(options: {
  title: string;
  subtitle?: string;
  body: HTMLElement;
  actions: ModalAction[];
  onValidate?: () => string | null;
  /** Called after the modal is mounted, for dynamic button and field state. */
  onMount?: (modal: HTMLElement, close: () => void) => void;
  onClose?: () => void;
  wide?: boolean;
  className?: string;
}): Promise<string | null> {
  closeActiveModal();
  return new Promise((resolve) => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backdrop = el("div", "modal-backdrop");
    const modal = el(
      "div",
      `modal${options.wide ? " modal-wide" : ""}${options.className ? ` ${options.className}` : ""}`,
    );
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "modal-title");
    modal.tabIndex = -1;

    const header = el("div", "modal-header");
    const titles = el("div", "modal-titles");
    const title = el("h2", "", options.title);
    title.id = "modal-title";
    titles.append(title);
    if (options.subtitle) titles.append(el("p", "modal-subtitle", options.subtitle));
    header.append(titles);
    const close = el("button", "icon-btn modal-close");
    close.type = "button";
    close.title = "Close";
    close.innerHTML = icon("close", 16);
    header.append(close);

    const body = el("div", "modal-body");
    body.append(options.body);

    const footer = el("div", "modal-footer");
    let error: HTMLElement | null = null;
    let finished = false;

    const finish = (value: string | null) => {
      if (finished) return;
      finished = true;
      document.removeEventListener("keydown", onKeyDown);
      backdrop.remove();
      if (activeModal?.close === closeModal) activeModal = null;
      options.onClose?.();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(value);
    };
    const closeModal = () => finish(null);

    for (const action of options.actions) {
      const btn = el("button", `btn${action.primary ? " btn-primary" : ""}${action.danger ? " btn-danger" : ""}`, action.label);
      btn.type = "button";
      btn.addEventListener("click", () => {
        if (action.value === "__cancel__") {
          closeModal();
          return;
        }
        const validation = options.onValidate?.();
        if (validation) {
          if (!error) {
            error = el("p", "form-error");
            body.append(error);
          }
          error.textContent = validation;
          return;
        }
        finish(action.value);
      });
      footer.append(btn);
    }

    modal.append(header, body, footer);
    backdrop.append(modal);
    document.body.append(backdrop);
    activeModal = { close: closeModal };
    options.onMount?.(modal, closeModal);

    close.addEventListener("click", closeModal);
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) closeModal();
    });
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusableElements = () =>
      [...modal.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (element) => !element.hasAttribute("hidden") && element.offsetParent !== null,
      );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements();
      if (!focusable.length) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!modal.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    const focusable = modal.querySelector<HTMLElement>("input, textarea, select, button.btn-primary");
    requestAnimationFrame(() => focusable?.focus());
  });
}

export function confirmDialog(
  title: string,
  message: string,
  confirmLabel = "Confirm",
  options: { danger?: boolean } = {},
): Promise<boolean> {
  const body = el("div");
  body.append(el("p", "modal-message", message));
  return showModal({
    title,
    body,
    actions: [
      { label: "Cancel", value: "__cancel__" },
      { label: confirmLabel, value: "confirm", primary: true, danger: options.danger },
    ],
  }).then((value) => value === "confirm");
}

export function messageDialog(title: string, message: string, kind: "info" | "warning" = "info"): Promise<void> {
  const body = el("div", "modal-message-row");
  const iconWrap = el("div", `modal-callout ${kind}`);
  iconWrap.innerHTML = icon(kind === "warning" ? "warning" : "info", 20);
  body.append(iconWrap, el("p", "modal-message", message));
  return showModal({
    title,
    body,
    actions: [{ label: "OK", value: "ok", primary: true }],
  }).then(() => undefined);
}

export function textDialog(
  title: string,
  subtitle: string,
  initial = "",
  placeholder = "",
  multiline = false,
): Promise<string | null> {
  const body = el("div", "form-stack");
  const field = el("label", "field");
  field.append(el("span", "field-label", "Text"));
  const input = multiline ? el("textarea", "input textarea") : el("input", "input");
  if (!multiline) (input as HTMLInputElement).type = "text";
  input.value = initial;
  input.placeholder = placeholder;
  field.append(input);
  body.append(field);
  return showModal({
    title,
    subtitle,
    body,
    actions: [
      { label: "Cancel", value: "__cancel__" },
      { label: "Apply", value: "apply", primary: true },
    ],
    onValidate: () => (input.value.trim() ? null : "Enter some text."),
  }).then((value) => (value === "apply" ? input.value.trim() : null));
}

export function passwordDialog(filename: string): Promise<string | null> {
  const body = el("div", "form-stack");
  body.append(el("p", "modal-message", `“${filename}” is password protected. Enter the password to open it.`));
  const field = el("label", "field");
  field.append(el("span", "field-label", "Password"));
  const input = el("input", "input");
  input.type = "password";
  input.autocomplete = "off";
  field.append(input);
  body.append(field);
  return showModal({
    title: "Password required",
    body,
    actions: [
      { label: "Cancel", value: "__cancel__" },
      { label: "Unlock", value: "unlock", primary: true },
    ],
    onValidate: () => (input.value ? null : "Enter the PDF password."),
  }).then((value) => (value === "unlock" ? input.value : null));
}

export interface CalibrationDialogResult {
  knownLength: number;
  unit: LengthUnit;
  applyToAll: boolean;
  updateMeasurements: boolean;
}

export function calibrationDialog(options: {
  defaultUnit: LengthUnit;
  hasMeasurements: boolean;
  pageCount: number;
  currentPage: number;
  mode?: "new" | "edit";
  initialKnownLength?: number;
  initialUnit?: LengthUnit;
}): Promise<CalibrationDialogResult | null> {
  const editing = options.mode === "edit";
  const body = el("div", "form-stack");
  body.append(
    el(
      "p",
      "modal-message",
      editing
        ? "Update the reference length used for measurements on this page. The reference line itself stays in place."
        : "Enter the real-world length of the line you just drew. GridScalr uses it to convert measurements on this drawing.",
    ),
  );

  const lengthField = el("label", "field");
  lengthField.append(el("span", "field-label", "Known length"));
  const inputWrap = el("div", "input-row");
  const lengthInput = el("input", "input");
  lengthInput.type = "number";
  lengthInput.min = "0.0001";
  lengthInput.step = "any";
  lengthInput.placeholder = "e.g. 1000";
  if (options.initialKnownLength && options.initialKnownLength > 0) {
    lengthInput.value = String(options.initialKnownLength);
  }
  const unitSelect = el("select", "input input-unit");
  const selectedUnit = options.initialUnit ?? options.defaultUnit;
  for (const unit of LENGTH_UNITS) {
    unitSelect.append(option(unit.id, unit.label, unit.id === selectedUnit));
  }
  inputWrap.append(lengthInput, unitSelect);
  lengthField.append(inputWrap);
  body.append(lengthField);

  const allCheck = el("input");
  allCheck.type = "checkbox";
  if (!editing) {
    const allLabel = el("label", "check-row");
    allLabel.append(allCheck, el("span", "", `Apply this scale to all ${options.pageCount} pages`));
    body.append(allLabel);
  }

  const updateCheck = el("input");
  updateCheck.type = "checkbox";
  updateCheck.checked = true;
  if (options.hasMeasurements) {
    const updateLabel = el("label", "check-row");
    updateLabel.append(
      updateCheck,
      el("span", "", "Also update measurements already created on the affected pages"),
    );
    body.append(updateLabel);
  }

  return showModal({
    title: editing ? `Edit calibration · page ${options.currentPage}` : `Calibrate page ${options.currentPage}`,
    subtitle: editing ? "Update reference length" : "Set drawing scale",
    body,
    actions: [
      { label: "Cancel", value: "__cancel__" },
      { label: editing ? "Update scale" : "Set scale", value: "apply", primary: true },
    ],
    onValidate: () => {
      const value = Number(lengthInput.value);
      if (!Number.isFinite(value) || value <= 0) return "Enter a length greater than zero.";
      return null;
    },
  }).then((value) =>
    value === "apply"
      ? {
          knownLength: Number(lengthInput.value),
          unit: unitSelect.value as LengthUnit,
          applyToAll: editing ? false : allCheck.checked,
          updateMeasurements: updateCheck.checked,
        }
      : null,
  );
}

export interface ManualScaleDialogResult {
  ratio: number;
  applyToAll: boolean;
  updateMeasurements: boolean;
}

export function manualScaleDialog(options: {
  currentPage: number;
  pageCount: number;
  hasMeasurements: boolean;
  initialRatio?: number;
}): Promise<ManualScaleDialogResult | null> {
  const body = el("div", "form-stack");
  body.append(
    el(
      "p",
      "modal-message",
      "Set a manual 1:N drawing scale from the physical PDF page size. This replaces any reference calibration on the affected pages; no reference line is added.",
    ),
  );

  const field = el("label", "field");
  field.append(el("span", "field-label", "Scale ratio (1:N)"));
  const ratioInput = el("input", "input");
  ratioInput.type = "number";
  ratioInput.min = "0.0001";
  ratioInput.step = "any";
  ratioInput.placeholder = "e.g. 100";
  if (options.initialRatio && options.initialRatio > 0) {
    ratioInput.value = String(options.initialRatio);
  }
  field.append(ratioInput);
  body.append(field);

  const preview = el("p", "modal-message");
  preview.style.margin = "0";
  const updatePreview = () => {
    const ratio = Number(ratioInput.value);
    if (!Number.isFinite(ratio) || ratio <= 0) {
      preview.textContent = "Enter a ratio greater than zero.";
      return;
    }
    const points = manualPointsPerMeter(ratio);
    preview.textContent = `1 m on paper = ${formatNumber(ratio, 6)} m in the real world · ${formatNumber(points, 3)} pt per metre`;
  };
  ratioInput.addEventListener("input", updatePreview);
  updatePreview();
  body.append(preview);

  const presets = el("div", "field-row");
  for (const ratio of [50, 100, 200, 400]) {
    const button = el("button", "btn", `1:${ratio}`);
    button.type = "button";
    button.addEventListener("click", () => {
      ratioInput.value = String(ratio);
      updatePreview();
      ratioInput.focus();
    });
    presets.append(button);
  }
  body.append(presets);

  const allCheck = el("input");
  allCheck.type = "checkbox";
  if (options.pageCount > 1) {
    const allLabel = el("label", "check-row");
    allLabel.append(allCheck, el("span", "", `Apply this scale to all ${options.pageCount} pages`));
    body.append(allLabel);
  }

  const updateCheck = el("input");
  updateCheck.type = "checkbox";
  updateCheck.checked = true;
  if (options.hasMeasurements) {
    const updateLabel = el("label", "check-row");
    updateLabel.append(
      updateCheck,
      el("span", "", "Also update measurements already created on the affected pages"),
    );
    body.append(updateLabel);
  }

  return showModal({
    title: `Manual scale · page ${options.currentPage}`,
    subtitle: "Use the printed drawing ratio",
    body,
    actions: [
      { label: "Cancel", value: "__cancel__" },
      { label: "Set scale", value: "apply", primary: true },
    ],
    onValidate: () => {
      const ratio = Number(ratioInput.value);
      if (!Number.isFinite(ratio) || ratio <= 0) return "Enter a scale ratio greater than zero.";
      return null;
    },
  }).then((value) =>
    value === "apply"
      ? {
          ratio: Number(ratioInput.value),
          applyToAll: allCheck.checked,
          updateMeasurements: updateCheck.checked,
        }
      : null,
  );
}

export interface DrawingExportLayer {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  color: string;
}

export interface DrawingExportDialogOptions {
  currentPage: number;
  pageCount: number;
  layers: DrawingExportLayer[];
  initial: DrawingExportOptions;
  /** Keeps the area mode when the dialog reopens after drawing a crop. */
  initialAreaMode?: "whole" | "crop";
  /** Page used when the crop was drawn, shown to make the relative area clear. */
  cropReferencePage: number;
}

export interface DrawingExportDialogResult {
  action: "export" | "crop";
  options: DrawingExportOptions;
}

export function drawingExportDialog(
  options: DrawingExportDialogOptions,
): Promise<DrawingExportDialogResult | null> {
  const { currentPage, pageCount, layers, initial } = options;
  const allPages = Array.from({ length: pageCount }, (_, index) => index + 1);
  const initialPages = [...new Set(initial.pages)]
    .filter((page) => Number.isInteger(page) && page >= 1 && page <= pageCount)
    .sort((a, b) => a - b);
  const initialIsAll =
    initialPages.length === pageCount && initialPages.every((page, index) => page === index + 1);
  let pageMode: "current" | "all" | "range" =
    initialPages.length === 1 && initialPages[0] === currentPage
      ? "current"
      : initialIsAll
        ? "all"
        : "range";
  let rangeText =
    pageMode === "range" ? formatPageList(initialPages.length ? initialPages : [currentPage]) : "";
  let areaMode: "whole" | "crop" = options.initialAreaMode ?? (initial.crop ? "crop" : "whole");
  let crop: NormalizedCrop | undefined = initial.crop ? { ...initial.crop } : undefined;
  const selectedLayers = new Set(
    layers.filter((layer) => layer.visible && initial.layerIds.includes(layer.id)).map((layer) => layer.id),
  );
  let includeLabels = initial.includeLabels;
  let includeCalibration = initial.includeCalibration;
  let includeLegend = initial.includeLegend;
  let primary: HTMLButtonElement | null = null;

  const body = el("div", "form-stack export-form");

  const areaSection = el("section", "export-section");
  areaSection.append(el("h3", "export-section-title", "Area"));
  const areaRadios = el("div", "export-radio-group");
  const radioName = `drawing-export-area-${Date.now()}`;
  const wholeRadio = exportRadio(radioName, "Whole page(s)", areaMode === "whole");
  const cropRadio = exportRadio(radioName, "Selected area (crop)", areaMode === "crop");
  areaRadios.append(wholeRadio.row, cropRadio.row);
  areaSection.append(areaRadios);

  const cropDetail = el("p", "export-note");
  const cropButtons = el("div", "field-row export-actions-row");
  const drawAreaButton = el("button", "btn btn-small", "Draw area…");
  drawAreaButton.type = "button";
  drawAreaButton.dataset.exportCrop = "true";
  const clearAreaButton = el("button", "btn btn-small btn-ghost", "Clear");
  clearAreaButton.type = "button";
  cropButtons.append(drawAreaButton, clearAreaButton);
  areaSection.append(cropDetail, cropButtons);
  body.append(areaSection);

  const pagesSection = el("section", "export-section");
  pagesSection.append(el("h3", "export-section-title", "Pages"));
  const pageRadios = el("div", "export-radio-group");
  const currentRadio = exportRadio(radioName + "-pages", `Current page (${currentPage})`, pageMode === "current");
  const allRadio = exportRadio(radioName + "-pages", `All pages (${pageCount})`, pageMode === "all");
  const rangeRadio = exportRadio(radioName + "-pages", "Range", pageMode === "range");
  pageRadios.append(currentRadio.row, allRadio.row, rangeRadio.row);
  pagesSection.append(pageRadios);

  const rangeField = el("label", "field export-range-field");
  rangeField.append(el("span", "field-label", "Page range"));
  const rangeInput = el("input", "input");
  rangeInput.type = "text";
  rangeInput.placeholder = "e.g. 1-3, 5";
  rangeInput.value = rangeText;
  rangeField.append(rangeInput);
  const rangeError = el("p", "form-error");
  rangeField.append(rangeError);
  pagesSection.append(rangeField);
  body.append(pagesSection);

  const layerSection = el("section", "export-section");
  const layerHead = el("div", "export-section-head");
  layerHead.append(el("h3", "export-section-title", "Layers"));
  const layerActions = el("div", "field-row export-actions-row");
  const selectAll = el("button", "btn btn-small btn-ghost", "Select all");
  selectAll.type = "button";
  const clearAll = el("button", "btn btn-small btn-ghost", "Clear");
  clearAll.type = "button";
  layerActions.append(selectAll, clearAll);
  layerHead.append(layerActions);
  layerSection.append(layerHead);
  const layerList = el("div", "export-layer-list");
  const layerInputs = new Map<string, HTMLInputElement>();
  for (const layer of layers) {
    const row = el("label", `export-layer-row${layer.visible ? "" : " is-disabled"}`);
    const input = el("input");
    input.type = "checkbox";
    input.checked = layer.visible && selectedLayers.has(layer.id);
    input.disabled = !layer.visible;
    input.addEventListener("change", () => {
      if (input.checked) selectedLayers.add(layer.id);
      else selectedLayers.delete(layer.id);
      update();
    });
    layerInputs.set(layer.id, input);
    const swatch = el("span", "export-layer-swatch");
    swatch.style.background = layer.color;
    row.append(input, swatch, el("span", "export-layer-name", layer.name));
    if (!layer.visible) row.append(el("span", "export-hidden-tag", "Hidden"));
    layerList.append(row);
  }
  layerSection.append(layerList);
  body.append(layerSection);

  const optionsSection = el("section", "export-section");
  optionsSection.append(el("h3", "export-section-title", "Content"));
  const labelsCheck = exportCheckbox("Labels", "Generated measurement labels; text notes always follow the drawing.", includeLabels);
  const calibrationCheck = exportCheckbox(
    "Calibration line",
    "Reference line and label. Manual scales appear in the legend instead.",
    includeCalibration,
  );
  const legendCheck = exportCheckbox(
    "Legend",
    "Adds a separate A4 page after the drawing pages.",
    includeLegend,
  );
  labelsCheck.input.addEventListener("change", () => {
    includeLabels = labelsCheck.input.checked;
    update();
  });
  calibrationCheck.input.addEventListener("change", () => {
    includeCalibration = calibrationCheck.input.checked;
    update();
  });
  legendCheck.input.addEventListener("change", () => {
    includeLegend = legendCheck.input.checked;
    update();
  });
  optionsSection.append(labelsCheck.row, calibrationCheck.row, legendCheck.row);
  body.append(optionsSection);

  const syncAreaRadios = () => {
    wholeRadio.input.checked = areaMode === "whole";
    cropRadio.input.checked = areaMode === "crop";
    cropDetail.textContent = crop
      ? `${formatNumber(crop.width * 100, 1)}% × ${formatNumber(crop.height * 100, 1)}% of page ${options.cropReferencePage} · ${formatNumber(cropAreaPercent(crop), 1)}% of the page area. Same relative area on every selected page.`
      : "No area selected. Draw a rectangular area on the page.";
    clearAreaButton.disabled = !crop;
    drawAreaButton.textContent = crop ? "Redraw area…" : "Draw area…";
    cropDetail.hidden = areaMode !== "crop";
    cropButtons.hidden = areaMode !== "crop";
  };

  const syncPageRadios = () => {
    currentRadio.input.checked = pageMode === "current";
    allRadio.input.checked = pageMode === "all";
    rangeRadio.input.checked = pageMode === "range";
    rangeField.hidden = pageMode !== "range";
  };

  const selectedPageNumbers = (): number[] => {
    if (pageMode === "current") return [currentPage];
    if (pageMode === "all") return [...allPages];
    return parsePageRange(rangeText || rangeInput.value, pageCount).pages;
  };

  const rangeValidation = (): string | null => {
    if (pageMode !== "range") return null;
    return parsePageRange(rangeInput.value, pageCount).error;
  };

  const collect = (): DrawingExportOptions => ({
    pages: selectedPageNumbers(),
    crop: areaMode === "crop" ? crop : undefined,
    layerIds: layers
      .filter((layer) => layer.visible && selectedLayers.has(layer.id))
      .map((layer) => layer.id),
    includeLabels,
    includeCalibration,
    includeLegend,
  });

  const validation = (): string | null => {
    const range = rangeValidation();
    if (range) return range;
    const pages = selectedPageNumbers();
    if (!pages.length) return "Choose at least one page to export.";
    if (areaMode === "crop" && !crop) return "Draw an export area first.";
    if (!collect().layerIds.length) return "Select at least one visible layer to export.";
    return null;
  };

  const update = () => {
    rangeText = rangeInput.value;
    syncAreaRadios();
    syncPageRadios();
    const range = rangeValidation();
    rangeError.hidden = !range;
    rangeError.textContent = range ?? "";
    const error = validation();
    if (primary) {
      primary.disabled = Boolean(error);
      primary.title = error ?? "Export the selected drawing pages";
    }
    legendCheck.row.title = "";
    const legendNote = legendCheck.row.querySelector<HTMLElement>(".export-check-note");
    if (legendNote) {
      legendNote.textContent = includeLegend
        ? `A separate A4 legend page will be added after ${selectedPageNumbers().length} drawing page${selectedPageNumbers().length === 1 ? "" : "s"}.`
        : "Adds a separate A4 page after the drawing pages.";
    }
  };

  wholeRadio.input.addEventListener("change", () => {
    areaMode = "whole";
    update();
  });
  cropRadio.input.addEventListener("change", () => {
    areaMode = "crop";
    update();
  });
  currentRadio.input.addEventListener("change", () => {
    pageMode = "current";
    update();
  });
  allRadio.input.addEventListener("change", () => {
    pageMode = "all";
    update();
  });
  rangeRadio.input.addEventListener("change", () => {
    pageMode = "range";
    update();
  });
  rangeInput.addEventListener("input", () => {
    pageMode = "range";
    update();
  });
  drawAreaButton.addEventListener("click", () => {
    areaMode = "crop";
    update();
    finishDialog("crop");
    closeActiveModal();
  });
  clearAreaButton.addEventListener("click", () => {
    crop = undefined;
    update();
  });
  selectAll.addEventListener("click", () => {
    for (const layer of layers) {
      if (!layer.visible) continue;
      selectedLayers.add(layer.id);
      const input = layerInputs.get(layer.id);
      if (input) input.checked = true;
    }
    update();
  });
  clearAll.addEventListener("click", () => {
    selectedLayers.clear();
    for (const input of layerInputs.values()) input.checked = false;
    update();
  });

  let finishDialog: (value: string | null) => void = () => undefined;
  const result = new Promise<DrawingExportDialogResult | null>((resolve) => {
    finishDialog = (value) => {
      if (value === "export" || value === "crop") {
        resolve({ action: value, options: collect() });
      } else {
        resolve(null);
      }
    };
  });

  void showModal({
    title: "Export drawing PDF",
    subtitle: "Pages, area and visible content",
    body,
    wide: true,
    actions: [
      { label: "Cancel", value: "__cancel__" },
      { label: "Export", value: "export", primary: true },
    ],
    onMount: (modal) => {
      primary = modal.querySelector<HTMLButtonElement>(".modal-footer .btn-primary");
      update();
    },
  }).then((value) => {
    if (value === "export") {
      finishDialog(value);
    } else {
      finishDialog(null);
    }
  });

  update();
  return result;
}

function exportRadio(name: string, label: string, checked: boolean): {
  row: HTMLElement;
  input: HTMLInputElement;
} {
  const row = el("label", "check-row export-radio");
  const input = el("input");
  input.type = "radio";
  input.name = name;
  input.checked = checked;
  row.append(input, el("span", "", label));
  return { row, input };
}

function exportCheckbox(label: string, note: string, checked: boolean): {
  row: HTMLElement;
  input: HTMLInputElement;
} {
  const row = el("label", "check-row export-check");
  const input = el("input");
  input.type = "checkbox";
  input.checked = checked;
  const text = el("span", "export-check-text");
  text.append(el("strong", "", label), el("span", "export-check-note", note));
  row.append(input, text);
  return { row, input };
}

export function recoveryDialog(projectName: string, savedAt: string): Promise<"restore" | "discard"> {
  const body = el("div", "form-stack");
  body.append(
    el(
      "p",
      "modal-message",
      `GridScalr found an autosaved copy of “${projectName}” from ${new Date(savedAt).toLocaleString()}. Restore it?`,
    ),
  );
  return showModal({
    title: "Recover unsaved work",
    body,
    actions: [
      { label: "Discard", value: "discard" },
      { label: "Restore", value: "restore", primary: true },
    ],
  }).then((value) => (value === "restore" ? "restore" : "discard"));
}

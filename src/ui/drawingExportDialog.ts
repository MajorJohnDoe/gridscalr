import { t } from "../i18n";
import {
  cropAreaPercent,
  formatPageList,
  parsePageRange,
  type DrawingExportOptions,
  type NormalizedCrop,
} from "../model/export";
import type { LayerKind } from "../model/types";
import { formatNumber } from "../model/units";
import { closeActiveModal, showModal } from "./dialogs";
import { el } from "./dom";
import { exportCheckbox, exportRadio } from "./exportControls";

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
    layers
      .filter((layer) => layer.visible && initial.layerIds.includes(layer.id))
      .map((layer) => layer.id),
  );
  let includeLabels = initial.includeLabels;
  let includeCalibration = initial.includeCalibration;
  let includeLegend = initial.includeLegend;
  let primary: HTMLButtonElement | null = null;

  const body = el("div", "form-stack export-form");

  const areaSection = el("section", "export-section");
  areaSection.append(el("h3", "export-section-title", t("dialogs.export.area")));
  const areaRadios = el("div", "export-radio-group");
  const radioName = `drawing-export-area-${Date.now()}`;
  const wholeRadio = exportRadio(radioName, t("dialogs.export.whole"), areaMode === "whole");
  const cropRadio = exportRadio(radioName, t("dialogs.export.crop"), areaMode === "crop");
  areaRadios.append(wholeRadio.row, cropRadio.row);
  areaSection.append(areaRadios);

  const cropDetail = el("p", "export-note");
  const cropButtons = el("div", "field-row export-actions-row");
  const drawAreaButton = el("button", "btn btn-small", t("dialogs.export.drawArea"));
  drawAreaButton.type = "button";
  drawAreaButton.dataset.exportCrop = "true";
  const clearAreaButton = el("button", "btn btn-small btn-ghost", t("common.clear"));
  clearAreaButton.type = "button";
  cropButtons.append(drawAreaButton, clearAreaButton);
  areaSection.append(cropDetail, cropButtons);
  body.append(areaSection);

  const pagesSection = el("section", "export-section");
  pagesSection.append(el("h3", "export-section-title", t("dialogs.export.pages")));
  const pageRadios = el("div", "export-radio-group");
  const currentRadio = exportRadio(
    radioName + "-pages",
    t("dialogs.export.currentPage", { page: currentPage }),
    pageMode === "current",
  );
  const allRadio = exportRadio(
    radioName + "-pages",
    t("dialogs.export.allPages", { count: pageCount }),
    pageMode === "all",
  );
  const rangeRadio = exportRadio(
    radioName + "-pages",
    t("dialogs.export.range"),
    pageMode === "range",
  );
  pageRadios.append(currentRadio.row, allRadio.row, rangeRadio.row);
  pagesSection.append(pageRadios);

  const rangeField = el("label", "field export-range-field");
  rangeField.append(el("span", "field-label", t("dialogs.export.pageRange")));
  const rangeInput = el("input", "input");
  rangeInput.type = "text";
  rangeInput.placeholder = t("dialogs.export.rangePlaceholder");
  rangeInput.value = rangeText;
  rangeField.append(rangeInput);
  const rangeError = el("p", "form-error");
  rangeField.append(rangeError);
  pagesSection.append(rangeField);
  body.append(pagesSection);

  const layerSection = el("section", "export-section");
  const layerHead = el("div", "export-section-head");
  layerHead.append(el("h3", "export-section-title", t("dialogs.export.layers")));
  const layerActions = el("div", "field-row export-actions-row");
  const selectAll = el("button", "btn btn-small btn-ghost", t("dialogs.export.selectAll"));
  selectAll.type = "button";
  const clearAll = el("button", "btn btn-small btn-ghost", t("common.clear"));
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
    if (!layer.visible) row.append(el("span", "export-hidden-tag", t("common.hidden")));
    layerList.append(row);
  }
  layerSection.append(layerList);
  layerSection.append(el("p", "export-note", t("dialogs.export.layersNote")));
  let includeOcg = initial.includeOcg === true;
  const ocgCheck = exportCheckbox(t("dialogs.export.ocg"), t("dialogs.export.ocgNote"), includeOcg);
  ocgCheck.input.addEventListener("change", () => {
    includeOcg = ocgCheck.input.checked;
    update();
  });
  layerSection.append(ocgCheck.row);
  body.append(layerSection);

  const optionsSection = el("section", "export-section");
  optionsSection.append(el("h3", "export-section-title", t("dialogs.export.content")));
  const labelsCheck = exportCheckbox(
    t("dialogs.export.labels"),
    t("dialogs.export.labelsNote"),
    includeLabels,
  );
  const calibrationCheck = exportCheckbox(
    t("dialogs.export.calibration"),
    t("dialogs.export.calibrationNote"),
    includeCalibration,
  );
  const legendCheck = exportCheckbox(
    t("dialogs.export.legend"),
    t("dialogs.export.legendNote"),
    includeLegend,
  );
  let includeAnnotations = initial.includeAnnotations === true;
  const annotationsCheck = exportCheckbox(
    t("dialogs.export.annotations"),
    t("dialogs.export.annotationsNote"),
    includeAnnotations,
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
  annotationsCheck.input.addEventListener("change", () => {
    includeAnnotations = annotationsCheck.input.checked;
    update();
  });
  optionsSection.append(
    labelsCheck.row,
    calibrationCheck.row,
    legendCheck.row,
    annotationsCheck.row,
  );
  body.append(optionsSection);

  const syncAreaRadios = () => {
    wholeRadio.input.checked = areaMode === "whole";
    cropRadio.input.checked = areaMode === "crop";
    cropDetail.textContent = crop
      ? t("dialogs.export.cropPercent", {
          width: formatNumber(crop.width * 100, 1),
          height: formatNumber(crop.height * 100, 1),
          page: options.cropReferencePage,
          area: formatNumber(cropAreaPercent(crop), 1),
        })
      : t("dialogs.export.noArea");
    clearAreaButton.disabled = !crop;
    drawAreaButton.textContent = crop
      ? t("dialogs.export.redrawArea")
      : t("dialogs.export.drawArea");
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
    includeOcg,
    includeAnnotations,
  });

  const validation = (): string | null => {
    const range = rangeValidation();
    if (range) return range;
    const pages = selectedPageNumbers();
    if (!pages.length) return t("dialogs.export.validation.noPages");
    if (areaMode === "crop" && !crop) return t("dialogs.export.validation.noArea");
    if (!collect().layerIds.length) return t("dialogs.export.validation.noLayers");
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
      primary.title = error ?? t("dialogs.export.primaryTitle");
    }
    legendCheck.row.title = "";
    const legendNote = legendCheck.row.querySelector<HTMLElement>(".export-check-note");
    if (legendNote) {
      legendNote.textContent = includeLegend
        ? t("dialogs.export.legendWithPages", { count: selectedPageNumbers().length })
        : t("dialogs.export.legendNote");
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
    title: t("dialogs.export.title"),
    subtitle: t("dialogs.export.subtitle"),
    body,
    wide: true,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("common.export"), value: "export", primary: true },
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

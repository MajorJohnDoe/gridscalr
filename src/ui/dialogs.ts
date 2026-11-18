import { formatDate } from "../i18n/format";
import type { LengthUnit } from "../model/types";
import { manualPointsPerMeter } from "../model/calibration";

import { formatNumber, LENGTH_UNITS, lengthUnitLabel } from "../model/units";
import { el, option } from "./dom";
import { t } from "../i18n";
import { openDialog } from "../features/dialogHost";

/**
 * Project-specific dialogs built on the shared movable, non-modal window shell.
 * The shell, its stacking rules and the small shared prompts live in
 * `src/features/dialogHost`; this file only owns the scale and recovery content.
 */

export { openDialog as showModal } from "../features/dialogHost";
export {
  closeAllDialogs,
  closeTopDialog as closeActiveModal,
  dialogCount,
  topDialogId,
} from "../features/dialogHost";
export {
  checkDialogTarget,
  confirmDialog,
  messageDialog,
  revalidateTarget,
  revalidateTargetNow,
  targetIdentity,
  textDialog,
  unsavedChangesDialog,
  depthDialog,
  passwordDialog,
  type ConfirmOptions,
  type DialogOptions,
  type UnsavedChangesChoice,
  type DialogTarget,
  type TargetKind,
} from "../features/dialogHost";

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
      editing ? t("dialogs.calibration.editMessage") : t("dialogs.calibration.newMessage"),
    ),
  );

  const lengthField = el("label", "field");
  lengthField.append(el("span", "field-label", t("dialogs.calibration.knownLength")));
  const inputWrap = el("div", "input-row");
  const lengthInput = el("input", "input");
  lengthInput.type = "number";
  lengthInput.min = "0.0001";
  lengthInput.step = "any";
  lengthInput.placeholder = t("dialogs.calibration.placeholder");
  if (options.initialKnownLength && options.initialKnownLength > 0) {
    lengthInput.value = String(options.initialKnownLength);
  }
  const unitSelect = el("select", "input input-unit");
  const selectedUnit = options.initialUnit ?? options.defaultUnit;
  for (const unit of LENGTH_UNITS) {
    unitSelect.append(option(unit.id, lengthUnitLabel(unit.id), unit.id === selectedUnit));
  }
  inputWrap.append(lengthInput, unitSelect);
  lengthField.append(inputWrap);
  body.append(lengthField);

  const allCheck = el("input");
  allCheck.type = "checkbox";
  if (!editing) {
    const allLabel = el("label", "check-row");
    allLabel.append(
      allCheck,
      el("span", "", t("dialogs.calibration.applyAll", { count: options.pageCount })),
    );
    body.append(allLabel);
  }

  const updateCheck = el("input");
  updateCheck.type = "checkbox";
  updateCheck.checked = true;
  if (options.hasMeasurements) {
    const updateLabel = el("label", "check-row");
    updateLabel.append(updateCheck, el("span", "", t("dialogs.calibration.updateMeasurements")));
    body.append(updateLabel);
  }

  return openDialog({
    title: editing
      ? t("dialogs.calibration.editTitle", { page: options.currentPage })
      : t("dialogs.calibration.newTitle", { page: options.currentPage }),
    subtitle: editing ? t("dialogs.calibration.editSubtitle") : t("dialogs.calibration.subtitle"),
    body,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      {
        label: editing ? t("dialogs.calibration.updateScale") : t("dialogs.calibration.setScale"),
        value: "apply",
        primary: true,
      },
    ],
    onValidate: () => {
      const value = Number(lengthInput.value);
      if (!Number.isFinite(value) || value <= 0) return t("dialogs.calibration.invalid");
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
  body.append(el("p", "modal-message", t("dialogs.manual.message")));

  const field = el("label", "field");
  field.append(el("span", "field-label", t("dialogs.manual.ratioLabel")));
  const ratioInput = el("input", "input");
  ratioInput.type = "number";
  ratioInput.min = "0.0001";
  ratioInput.step = "any";
  ratioInput.placeholder = t("dialogs.manual.ratioPlaceholder");
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
      preview.textContent = t("dialogs.manual.invalidRatio");
      return;
    }
    const points = manualPointsPerMeter(ratio);
    preview.textContent = t("dialogs.manual.preview", {
      ratio: formatNumber(ratio, 6),
      points: formatNumber(points, 3),
    });
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
    allLabel.append(
      allCheck,
      el("span", "", t("dialogs.calibration.applyAll", { count: options.pageCount })),
    );
    body.append(allLabel);
  }

  const updateCheck = el("input");
  updateCheck.type = "checkbox";
  updateCheck.checked = true;
  if (options.hasMeasurements) {
    const updateLabel = el("label", "check-row");
    updateLabel.append(updateCheck, el("span", "", t("dialogs.calibration.updateMeasurements")));
    body.append(updateLabel);
  }

  return openDialog({
    title: t("dialogs.manual.title", { page: options.currentPage }),
    subtitle: t("dialogs.manual.subtitle"),
    body,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("dialogs.calibration.setScale"), value: "apply", primary: true },
    ],
    onValidate: () => {
      const ratio = Number(ratioInput.value);
      if (!Number.isFinite(ratio) || ratio <= 0) return t("dialogs.manual.invalid");
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

export function recoveryDialog(
  projectName: string,
  savedAt: string,
): Promise<"restore" | "discard"> {
  const body = el("div", "form-stack");
  body.append(
    el(
      "p",
      "modal-message",
      t("dialogs.recovery.message", {
        name: projectName,
        time: formatDate(savedAt),
      }),
    ),
  );
  return openDialog({
    title: t("dialogs.recovery.title"),
    body,
    actions: [
      { label: t("common.discard"), value: "discard" },
      { label: t("common.restore"), value: "restore", primary: true },
    ],
  }).then((value) => (value === "restore" ? "restore" : "discard"));
}

import { formatDate } from "../i18n/format";
import type { LengthUnit } from "../model/types";
import { manualPointsPerMeter } from "../model/calibration";

import { formatNumber, LENGTH_UNITS, lengthUnitLabel } from "../model/units";
import { el, option } from "./dom";
import { icon } from "./icons";
import { t } from "../i18n";

let activeModal: { close: () => void } | null = null;

interface ModalAction {
  label: string;
  value: string;
  primary?: boolean;
  danger?: boolean;
}

export function closeActiveModal(): void {
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
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
    close.title = t("common.close");
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
      const btn = el(
        "button",
        `btn${action.primary ? " btn-primary" : ""}${action.danger ? " btn-danger" : ""}`,
        action.label,
      );
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

    const input = [...modal.querySelectorAll<HTMLElement>("input, textarea, select")].find(
      (element) => !element.hasAttribute("disabled"),
    );
    const primary = footer.querySelector<HTMLButtonElement>("button.btn-primary:not([disabled])");
    const safe = [...footer.querySelectorAll<HTMLButtonElement>("button.btn:not([disabled])")].find(
      (button) => !button.classList.contains("btn-danger"),
    );
    // Destructive primary actions must not receive focus by default.
    const target =
      input ?? (primary && !primary.classList.contains("btn-danger") ? primary : safe) ?? primary;
    requestAnimationFrame(() => target?.focus());
  });
}

export type UnsavedChangesChoice = "save" | "discard" | "cancel";

export function unsavedChangesDialog(message: string): Promise<UnsavedChangesChoice> {
  const body = el("div");
  body.append(el("p", "modal-message", message));
  return showModal({
    title: t("dialogs.unsavedTitle"),
    body,
    actions: [
      { label: t("common.cancel"), value: "cancel" },
      { label: t("dialogs.discardChanges"), value: "discard", danger: true },
      { label: t("common.save"), value: "save", primary: true },
    ],
  }).then((value) => (value === "save" || value === "discard" ? value : "cancel"));
}

export function confirmDialog(
  title: string,
  message: string,
  confirmLabel = t("common.confirm"),
  options: { danger?: boolean } = {},
): Promise<boolean> {
  const body = el("div");
  body.append(el("p", "modal-message", message));
  return showModal({
    title,
    body,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: confirmLabel, value: "confirm", primary: true, danger: options.danger },
    ],
  }).then((value) => value === "confirm");
}

export function messageDialog(
  title: string,
  message: string,
  kind: "info" | "warning" = "info",
): Promise<void> {
  const body = el("div", "modal-message-row");
  const iconWrap = el("div", `modal-callout ${kind}`);
  iconWrap.innerHTML = icon(kind === "warning" ? "warning" : "info", 20);
  const text = el("div", "modal-message-text");
  for (const paragraph of message.split(/\n{2,}/)) {
    text.append(el("p", "modal-message", paragraph));
  }
  body.append(iconWrap, text);
  return showModal({
    title,
    body,
    actions: [{ label: t("common.ok"), value: "ok", primary: true }],
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
  field.append(el("span", "field-label", t("dialogs.textLabel")));
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
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("common.apply"), value: "apply", primary: true },
    ],
    onValidate: () => (input.value.trim() ? null : t("dialogs.textRequired")),
  }).then((value) => (value === "apply" ? input.value.trim() : null));
}

export function depthDialog(unit: LengthUnit, initial = 1): Promise<number | null> {
  const body = el("div", "form-stack");
  body.append(el("p", "modal-message", t("dialogs.depth.message")));
  const field = el("label", "field");
  field.append(el("span", "field-label", t("dialogs.depth.label")));
  const wrap = el("div", "input-row");
  const input = el("input", "input");
  input.type = "number";
  input.min = "0.001";
  input.step = "0.01";
  input.value = String(initial);
  input.setAttribute("aria-label", t("dialogs.depth.aria"));
  wrap.append(input, el("span", "context-unit", unit));
  field.append(wrap);
  body.append(field);
  return showModal({
    title: t("dialogs.depth.title"),
    body,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("common.apply"), value: "apply", primary: true },
    ],
    onValidate: () => {
      const value = Number(input.value);
      return Number.isFinite(value) && value > 0 ? null : t("dialogs.depth.invalid");
    },
  }).then((value) => (value === "apply" ? Number(input.value) : null));
}

export function passwordDialog(filename: string): Promise<string | null> {
  const body = el("div", "form-stack");
  body.append(el("p", "modal-message", t("dialogs.password.message", { filename })));
  const field = el("label", "field");
  field.append(el("span", "field-label", t("dialogs.password.label")));
  const input = el("input", "input");
  input.type = "password";
  input.autocomplete = "off";
  field.append(input);
  body.append(field);
  return showModal({
    title: t("dialogs.password.title"),
    body,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("common.unlock"), value: "unlock", primary: true },
    ],
    onValidate: () => (input.value ? null : t("dialogs.password.invalid")),
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

  return showModal({
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

  return showModal({
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
  return showModal({
    title: t("dialogs.recovery.title"),
    body,
    actions: [
      { label: t("common.discard"), value: "discard" },
      { label: t("common.restore"), value: "restore", primary: true },
    ],
  }).then((value) => (value === "restore" ? "restore" : "discard"));
}

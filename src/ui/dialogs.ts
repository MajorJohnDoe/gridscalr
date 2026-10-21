import type { LengthUnit } from "../model/types";
import { LENGTH_UNITS } from "../model/units";
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
  wide?: boolean;
}): Promise<string | null> {
  closeActiveModal();
  return new Promise((resolve) => {
    const backdrop = el("div", "modal-backdrop");
    const modal = el("div", `modal${options.wide ? " modal-wide" : ""}`);
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "modal-title");

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

    const finish = (value: string | null) => {
      document.removeEventListener("keydown", onKeyDown);
      backdrop.remove();
      if (activeModal?.close === closeModal) activeModal = null;
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

    close.addEventListener("click", closeModal);
    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) closeModal();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeModal();
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

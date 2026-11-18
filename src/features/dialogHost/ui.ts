import { t, type MessageKey } from "../../i18n";
import { el } from "../../ui/dom";
import { appendSanitizedCopy } from "../../ui/errorDetails";
import { icon } from "../../ui/icons";
import type { LengthUnit } from "../../model/types";
import { mountDialog } from "./controller";
import {
  checkDialogTarget,
  targetProblem,
  type DialogAction,
  type DialogTarget,
  type ResolvedTarget,
  type TargetProblem,
} from "./model";

/**
 * The dialog window shell and the small shared prompts. Every dialog built here
 * is movable, non-modal and closes with Escape; the window behaviour itself
 * lives in `controller.ts`.
 */

export interface DialogOptions {
  title: string;
  subtitle?: string;
  body: HTMLElement;
  actions: DialogAction[];
  /** Returns a message to show and keep the dialog open instead of finishing. */
  onValidate?: (value: string) => string | null | Promise<string | null>;
  /** Called after the dialog is mounted, for dynamic button and field state. */
  onMount?: (modal: HTMLElement, close: () => void) => void;
  onClose?: () => void;
  wide?: boolean;
  className?: string;
  /**
   * Controls placed beside the close button in the header. Phase 4 uses this
   * for the table editor actions; the dialog shell owns no action of its own.
   */
  headerActions?: readonly HTMLElement[];
}

let titleSequence = 0;

export function openDialog(options: DialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    let result: string | null = null;
    titleSequence += 1;

    const layer = el("div", "dialog-layer");
    const modal = el(
      "div",
      `modal${options.wide ? " modal-wide" : ""}${options.className ? ` ${options.className}` : ""}`,
    );
    modal.setAttribute("role", "dialog");
    // Non-modal by product decision: the drawing behind the dialog stays
    // interactive, so assistive technology must not treat it as inert.
    modal.setAttribute("aria-modal", "false");
    modal.tabIndex = -1;

    const header = el("div", "modal-header");
    const titles = el("div", "modal-titles");
    const title = el("h2", "", options.title);
    title.id = `dialog-title-${titleSequence}`;
    modal.setAttribute("aria-labelledby", title.id);
    titles.append(title);
    if (options.subtitle) titles.append(el("p", "modal-subtitle", options.subtitle));

    const close = el("button", "icon-btn modal-close");
    close.type = "button";
    close.title = t("common.close");
    close.setAttribute("aria-label", t("common.close"));
    close.innerHTML = icon("close", 16);

    header.append(titles);
    if (options.headerActions?.length) {
      const actions = el("div", "modal-header-actions");
      for (const node of options.headerActions) actions.append(node);
      header.append(actions);
    }
    header.append(close);

    const body = el("div", "modal-body");
    body.append(options.body);

    const footer = el("div", "modal-footer");
    let busy = false;
    let error: HTMLElement | null = null;

    const showError = (message: string): void => {
      if (!error) {
        error = el("p", "form-error");
        error.setAttribute("role", "alert");
        body.append(error);
      }
      error.textContent = message;
    };

    const mounted = mountDialog(
      { layer, modal, dragHandle: header },
      () => {
        options.onClose?.();
        resolve(result);
      },
      {
        initialFocus: () => {
          const marked = modal.querySelector<HTMLElement>("[data-dialog-autofocus]");
          if (marked) return marked;
          const input = [...modal.querySelectorAll<HTMLElement>("input, textarea, select")].find(
            (element) => !element.hasAttribute("disabled"),
          );
          const primary = footer.querySelector<HTMLButtonElement>(
            "button.btn-primary:not([disabled])",
          );
          const safe = [
            ...footer.querySelectorAll<HTMLButtonElement>("button.btn:not([disabled])"),
          ].find((button) => !button.classList.contains("btn-danger"));
          // Destructive primary actions must not receive focus by default.
          return (
            input ??
            (primary && !primary.classList.contains("btn-danger") ? primary : safe) ??
            primary
          );
        },
      },
    );

    const finish = (value: string | null): void => {
      result = value;
      mounted.close();
    };

    const runAction = async (action: DialogAction): Promise<void> => {
      if (action.value === "__cancel__") {
        finish(null);
        return;
      }
      if (busy) return;
      busy = true;
      try {
        const validation = await options.onValidate?.(action.value);
        if (validation) {
          showError(validation);
          return;
        }
        finish(action.value);
      } finally {
        busy = false;
      }
    };

    for (const action of options.actions) {
      const btn = el(
        "button",
        `btn${action.primary ? " btn-primary" : ""}${action.danger ? " btn-danger" : ""}`,
        action.label,
      );
      btn.type = "button";
      btn.addEventListener("click", () => void runAction(action));
      footer.append(btn);
    }

    modal.append(header, body, footer);
    layer.append(modal);
    close.addEventListener("click", () => finish(null));
    options.onMount?.(modal, () => finish(null));
  });
}

export type UnsavedChangesChoice = "save" | "discard" | "cancel";

export function unsavedChangesDialog(message: string): Promise<UnsavedChangesChoice> {
  const body = el("div");
  body.append(el("p", "modal-message", message));
  return openDialog({
    title: t("dialogs.unsavedTitle"),
    body,
    actions: [
      { label: t("common.cancel"), value: "cancel" },
      { label: t("dialogs.discardChanges"), value: "discard", danger: true },
      { label: t("common.save"), value: "save", primary: true },
    ],
  }).then((value) => (value === "save" || value === "discard" ? value : "cancel"));
}

/** The localized refusal shown when a destructive target changed or vanished. */
export async function revalidateTarget(target: DialogTarget): Promise<string | null> {
  const problem = await checkDialogTarget(target);
  if (!problem) return null;
  return targetRefusalText(problem, target);
}

function targetRefusalText(problem: TargetProblem, target: DialogTarget): string {
  return t(problem === "missing" ? "dialogs.target.missing" : "dialogs.target.changed", {
    kind: t(`dialogs.targetKind.${target.kind}` as MessageKey),
    name: target.name,
  });
}

/**
 * Synchronous form of `revalidateTarget` for an inline confirmation, which
 * deletes in the same task as the click. The target must resolve synchronously;
 * a Promise result means the caller should use `revalidateTarget` instead.
 */
export function revalidateTargetNow(target: ResolvedTarget): string | null {
  const problem = targetProblem(target.id, target.resolve());
  return problem ? targetRefusalText(problem, target) : null;
}

export interface ConfirmOptions {
  danger?: boolean;
  /**
   * The object the confirmation will act on. It is re-resolved by stable id at
   * confirm time, so a change behind the dialog cannot apply the action to a
   * different object.
   */
  target?: DialogTarget;
}

export function confirmDialog(
  title: string,
  message: string,
  confirmLabel = t("common.confirm"),
  options: ConfirmOptions = {},
): Promise<boolean> {
  const body = el("div");
  body.append(el("p", "modal-message", message));
  const target = options.target;
  return openDialog({
    title,
    body,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: confirmLabel, value: "confirm", primary: true, danger: options.danger },
    ],
    onValidate: target ? () => revalidateTarget(target) : undefined,
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
  // Absolute paths stay on screen because they help troubleshooting, but the
  // copy action writes a sanitized version (F-042).
  appendSanitizedCopy(body, message);
  return openDialog({
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
  return openDialog({
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
  return openDialog({
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
  return openDialog({
    title: t("dialogs.password.title"),
    body,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("common.unlock"), value: "unlock", primary: true },
    ],
    onValidate: () => (input.value ? null : t("dialogs.password.invalid")),
  }).then((value) => (value === "unlock" ? input.value : null));
}

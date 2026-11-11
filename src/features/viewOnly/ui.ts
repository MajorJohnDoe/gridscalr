import { t } from "../../i18n";

/**
 * Disables every form control inside a panel while leaving the panel readable
 * and scrollable. View-only is a true inspection mode, so editing controls must
 * look disabled instead of silently failing when clicked.
 */
export function disableEditingControls(root: HTMLElement, viewOnly: boolean): void {
  root.classList.toggle("is-view-only", viewOnly);
  if (!viewOnly) return;
  for (const control of root.querySelectorAll<HTMLInputElement>(
    "input, select, textarea, button",
  )) {
    control.disabled = true;
  }
}

/** A small inline note for a panel whose controls are disabled. */
export function viewOnlyPanelNote(): HTMLElement {
  const note = document.createElement("div");
  note.className = "empty-note small view-only-note";
  note.textContent = t("viewOnly.panelNote");
  return note;
}

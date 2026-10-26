import { el } from "./dom";
import { showModal } from "./dialogs";
import type { DuplicatePageOptions } from "../model/documents";

interface DuplicatePageDialogInput {
  page: number;
  newPage: number;
  defaultName: string;
  hasScale: boolean;
}

function checkRow(label: string, checked: boolean, onChange: (checked: boolean) => void) {
  const row = el("label", "check-row");
  const input = el("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  row.append(input, el("span", "", label));
  return { row, input };
}

export function duplicatePageDialog(
  input: DuplicatePageDialogInput,
): Promise<DuplicatePageOptions | null> {
  const body = el("div", "form-stack");
  const note = el(
    "p",
    "settings-note",
    `Page ${input.page} will be copied to the end of the project as Page ${input.newPage}. The source drawing is not modified. Duplicating is structural and cannot be undone.`,
  );

  const nameField = el("label", "field");
  nameField.append(el("span", "field-label", "Page name"));
  const nameInput = el("input", "input");
  nameInput.type = "text";
  nameInput.maxLength = 80;
  nameInput.value = input.defaultName;
  nameInput.setAttribute("aria-label", "Page name for the duplicate");
  nameField.append(nameInput);

  let copyName = true;
  const nameToggle = checkRow("Copy page name", true, (checked) => {
    copyName = checked;
    nameInput.disabled = !checked;
  });

  let copyScale = input.hasScale;
  const scaleToggle = checkRow("Copy page scale", input.hasScale, (checked) => {
    copyScale = checked;
  });
  scaleToggle.input.disabled = !input.hasScale;
  if (!input.hasScale) scaleToggle.input.title = "This page has no scale.";

  let copyMarkups = false;
  const markupToggle = checkRow("Copy markups and drawings", false, (checked) => {
    copyMarkups = checked;
  });

  body.append(
    note,
    nameField,
    nameToggle.row,
    scaleToggle.row,
    markupToggle.row,
    el(
      "p",
      "settings-note",
      "The new page keeps the source calibration when Copy page scale is on. Page-specific layer visibility and lock settings are copied so the sheet looks the same.",
    ),
  );

  return showModal({
    title: "Duplicate page",
    subtitle: `Page ${input.page} → Page ${input.newPage}`,
    body,
    actions: [
      { label: "Cancel", value: "cancel" },
      { label: "Duplicate page", value: "duplicate", primary: true },
    ],
    onMount: () => {
      nameInput.focus();
      nameInput.select();
    },
  }).then((value) => {
    if (value !== "duplicate") return null;
    return {
      copyMarkups,
      copyScale,
      copyName,
      name: copyName ? nameInput.value : "",
    };
  });
}

import { el } from "./dom";
import { showModal } from "./dialogs";
import type { DuplicatePageOptions } from "../model/documents";
import { t } from "../i18n";

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
    t("duplicate.copyNote", { page: input.page, newPage: input.newPage }),
  );

  const nameField = el("label", "field");
  nameField.append(el("span", "field-label", t("duplicate.pageName")));
  const nameInput = el("input", "input");
  nameInput.type = "text";
  nameInput.maxLength = 80;
  nameInput.value = input.defaultName;
  nameInput.setAttribute("aria-label", t("duplicate.nameAria"));
  nameField.append(nameInput);

  let copyName = true;
  const nameToggle = checkRow(t("duplicate.copyName"), true, (checked) => {
    copyName = checked;
    nameInput.disabled = !checked;
  });

  let copyScale = input.hasScale;
  const scaleToggle = checkRow(t("duplicate.copyScale"), input.hasScale, (checked) => {
    copyScale = checked;
  });
  scaleToggle.input.disabled = !input.hasScale;
  if (!input.hasScale) scaleToggle.input.title = t("duplicate.noScale");

  let copyMarkups = false;
  const markupToggle = checkRow(t("duplicate.copyMarkups"), false, (checked) => {
    copyMarkups = checked;
  });

  body.append(
    note,
    nameField,
    nameToggle.row,
    scaleToggle.row,
    markupToggle.row,
    el("p", "settings-note", t("duplicate.note")),
  );

  return showModal({
    title: t("duplicate.title"),
    subtitle: t("duplicate.subtitle", { page: input.page, newPage: input.newPage }),
    body,
    actions: [
      { label: t("common.cancel"), value: "cancel" },
      { label: t("duplicate.title"), value: "duplicate", primary: true },
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

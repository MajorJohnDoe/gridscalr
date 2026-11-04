import { t } from "../../../i18n";
import { showModal } from "../../../ui/dialogs";
import { el } from "../../../ui/dom";
import { SHEET_TEMPLATES, type PaperSize } from "../model/sheetTemplate";

export interface SheetSourceChoice {
  kind: "sheet";
  templateId: string;
  paper: PaperSize;
  name: string;
}

export type ProjectSourceChoice = { kind: "pdf" } | SheetSourceChoice;

export type SheetSourceMode = "new" | "add";

/**
 * Chooses between a PDF/TIF import and a template sheet. The same dialog serves
 * both "New project" and "Add page".
 */
export async function chooseProjectSource(
  mode: SheetSourceMode,
): Promise<ProjectSourceChoice | null> {
  let source: "pdf" | "sheet" = "pdf";

  const body = el("div", "form-stack");
  body.append(el("p", "modal-message", t("sheet.source.note")));

  const sourceGroup = el("div", "form-stack");
  const pdfRow = el("label", "check-row");
  const pdfInput = el("input");
  pdfInput.type = "radio";
  pdfInput.name = "sheet-source";
  pdfInput.checked = true;
  pdfRow.append(pdfInput, el("span", "", t("sheet.source.pdf")));

  const sheetRow = el("label", "check-row");
  const sheetInput = el("input");
  sheetInput.type = "radio";
  sheetInput.name = "sheet-source";
  sheetRow.append(sheetInput, el("span", "", t("sheet.source.sheet")));
  sourceGroup.append(pdfRow, sheetRow);

  const options = el("div", "form-stack");
  options.hidden = true;

  const templateField = el("label", "field");
  templateField.append(el("span", "field-label", t("sheet.source.template")));
  const templateSelect = el("select", "input");
  for (const template of SHEET_TEMPLATES) {
    const item = el("option");
    item.value = template.id;
    item.textContent = t(template.nameKey);
    templateSelect.append(item);
  }
  templateField.append(templateSelect);

  const paperField = el("label", "field");
  paperField.append(el("span", "field-label", t("sheet.source.paper")));
  const paperSelect = el("select", "input");
  for (const paper of ["A3", "A2"] as const) {
    const item = el("option");
    item.value = paper;
    item.textContent = paper;
    paperSelect.append(item);
  }
  paperField.append(paperSelect);

  const nameField = el("label", "field");
  nameField.append(
    el("span", "field-label", t(mode === "new" ? "sheet.source.name" : "sheet.source.sheetName")),
  );
  const nameInput = el("input", "input");
  nameInput.type = "text";
  nameInput.maxLength = 80;
  nameInput.value = t("sheet.untitled");
  nameField.append(nameInput);

  options.append(templateField, paperField, nameField);
  body.append(sourceGroup, options);

  const update = () => {
    source = sheetInput.checked ? "sheet" : "pdf";
    options.hidden = source !== "sheet";
  };
  pdfInput.addEventListener("change", update);
  sheetInput.addEventListener("change", update);

  const result = await showModal({
    title: t(mode === "new" ? "sheet.source.title.new" : "sheet.source.title.add"),
    body,
    wide: true,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("sheet.source.continue"), value: "continue", primary: true },
    ],
    onValidate: () => {
      if (source === "sheet" && !nameInput.value.trim()) {
        return t("sheet.source.nameRequired");
      }
      return null;
    },
  });

  if (result !== "continue") return null;
  if (source === "pdf") return { kind: "pdf" };

  return {
    kind: "sheet",
    templateId: templateSelect.value,
    paper: paperSelect.value === "A2" ? "A2" : "A3",
    name: nameInput.value.trim().slice(0, 80) || t("sheet.untitled"),
  };
}

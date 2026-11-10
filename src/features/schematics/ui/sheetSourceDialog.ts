import { t } from "../../../i18n";
import { showModal } from "../../../ui/dialogs";
import { el } from "../../../ui/dom";
import { BLANK_TEMPLATE_ID, SHEET_TEMPLATES, type PaperSize } from "../model/sheetTemplate";

export interface SheetSourceChoice {
  kind: "sheet";
  templateId: string;
  paper: PaperSize;
  name: string;
}

export type ProjectSourceChoice = { kind: "pdf" } | { kind: "empty" } | SheetSourceChoice;

export type SheetSourceMode = "new" | "add";

type SourceKind = "pdf" | "sheet" | "blank" | "empty";

interface SourceOption {
  kind: SourceKind;
  row: HTMLLabelElement;
  input: HTMLInputElement;
}

/**
 * Chooses between a PDF/TIF import, a template sheet and a blank page in A3 or
 * A2. The same dialog serves both "New project" and "Add page".
 */
export async function chooseProjectSource(
  mode: SheetSourceMode,
): Promise<ProjectSourceChoice | null> {
  let source: SourceKind = "pdf";
  let primary: HTMLButtonElement | null = null;

  const body = el("div", "form-stack");

  const sourceSection = el("div", "form-stack");
  sourceSection.append(el("span", "field-label", t("sheet.source.kind")));
  const sourceList = el("div", "source-options");
  const options: SourceOption[] = [
    sourceOption("sheet-source", "pdf", t("sheet.source.pdf"), t("sheet.source.pdfNote"), true),
    sourceOption("sheet-source", "sheet", t("sheet.source.sheet"), t("sheet.source.sheetNote")),
    sourceOption("sheet-source", "blank", t("sheet.source.blank"), t("sheet.source.blankNote")),
  ];
  if (mode === "new") {
    options.push(
      sourceOption(
        "sheet-source",
        "empty",
        t("sheet.source.emptyProject"),
        t("sheet.source.emptyProjectNote"),
      ),
    );
  }
  for (const option of options) sourceList.append(option.row);
  sourceSection.append(sourceList);
  body.append(sourceSection);

  const fields = el("div", "form-stack source-fields");
  fields.hidden = true;

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

  const nameLabel = el("span", "field-label", t("sheet.source.sheetName"));
  const nameField = el("label", "field");
  nameField.append(nameLabel);
  const nameInput = el("input", "input");
  nameInput.type = "text";
  nameInput.maxLength = 80;
  nameInput.value = t("sheet.untitled");
  nameField.append(nameInput);

  fields.append(templateField, paperField, nameField);
  body.append(fields);

  const note = el("p", "export-note");
  body.append(note);

  const update = () => {
    source = options.find((option) => option.input.checked)?.kind ?? "pdf";
    for (const option of options) {
      option.row.classList.toggle("is-selected", option.input.checked);
    }
    fields.hidden = source === "pdf" || source === "empty";
    templateField.hidden = source !== "sheet";
    nameLabel.textContent =
      mode === "new"
        ? t("sheet.source.name")
        : source === "blank"
          ? t("sheet.source.pageName")
          : t("sheet.source.sheetName");
    note.textContent =
      source === "pdf"
        ? t("sheet.source.notePdf")
        : source === "empty"
          ? t("sheet.source.noteEmptyProject")
          : source === "blank"
            ? t("sheet.source.noteBlank")
            : t("sheet.source.noteSheet");
    if (primary) {
      primary.textContent =
        source === "pdf"
          ? t("sheet.source.chooseFile")
          : source === "empty"
            ? t("sheet.source.createProject")
            : mode === "new"
              ? t("sheet.source.createProject")
              : source === "blank"
                ? t("sheet.source.addBlank")
                : t("sheet.source.addSheet");
    }
  };
  for (const option of options) option.input.addEventListener("change", update);
  update();

  const result = await showModal({
    title: t(mode === "new" ? "sheet.source.title.new" : "sheet.source.title.add"),
    subtitle: t(mode === "new" ? "sheet.source.subtitle.new" : "sheet.source.subtitle.add"),
    body,
    wide: true,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("sheet.source.continue"), value: "continue", primary: true },
    ],
    onValidate: () => {
      if (source !== "pdf" && !nameInput.value.trim()) {
        return t("sheet.source.nameRequired");
      }
      return null;
    },
    onMount: (modal) => {
      primary = modal.querySelector<HTMLButtonElement>(".modal-footer .btn-primary");
      update();
    },
  });

  if (result !== "continue") return null;
  if (source === "pdf") return { kind: "pdf" };
  if (source === "empty") return { kind: "empty" };

  return {
    kind: "sheet",
    templateId: source === "blank" ? BLANK_TEMPLATE_ID : templateSelect.value,
    paper: paperSelect.value === "A2" ? "A2" : "A3",
    name: nameInput.value.trim().slice(0, 80) || t("sheet.untitled"),
  };
}

function sourceOption(
  name: string,
  kind: SourceKind,
  title: string,
  note: string,
  checked = false,
): SourceOption {
  const row = el("label", "source-option");
  const input = el("input");
  input.type = "radio";
  input.name = name;
  input.value = kind;
  input.checked = checked;
  const text = el("span", "source-option-text");
  text.append(el("strong", "source-option-title", title), el("span", "source-option-note", note));
  row.append(input, text);
  return { kind, row, input };
}

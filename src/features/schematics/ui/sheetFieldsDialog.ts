import { t } from "../../../i18n";
import { store } from "../../../state/store";
import { showModal } from "../../../ui/dialogs";
import { el } from "../../../ui/dom";
import { toast } from "../../../ui/toast";
import { templateDocumentForPage } from "../model/sheetDocument";
import {
  resolveSheetLabels,
  revisionFieldId,
  SHEET_FIELD,
  sheetTemplateFor,
  type RevisionColumn,
  type SheetLabels,
} from "../model/sheetTemplate";

function labels(): SheetLabels {
  return resolveSheetLabels((key) => t(key));
}

function fieldRow(
  body: HTMLElement,
  inputs: Map<string, HTMLInputElement>,
  label: string,
  id: string,
  value: string,
): void {
  const wrapper = el("label", "field");
  wrapper.append(el("span", "field-label", label));
  const input = el("input", "input");
  input.type = "text";
  input.maxLength = 500;
  input.value = value;
  input.dataset.fieldId = id;
  wrapper.append(input);
  inputs.set(id, input);
  body.append(wrapper);
}

function revisionGrid(
  body: HTMLElement,
  inputs: Map<string, HTMLInputElement>,
  values: Record<string, string>,
  sheetLabels: SheetLabels,
): void {
  const grid = el("div", "sheet-field-grid");
  grid.style.display = "grid";
  grid.style.gridTemplateColumns = "auto repeat(4, minmax(0, 1fr))";
  grid.style.gap = "6px";
  grid.style.alignItems = "center";

  grid.append(el("span"));
  for (const label of [sheetLabels.bet, sheetLabels.rev, sheetLabels.date, sheetLabels.sign]) {
    grid.append(el("span", "field-label", label));
  }

  const columns: RevisionColumn[] = ["bet", "rev", "date", "sign"];
  for (let row = 1; row <= 4; row += 1) {
    grid.append(el("span", "field-label", String(row)));
    for (const column of columns) {
      const id = revisionFieldId(row, column);
      const input = el("input", "input");
      input.type = "text";
      input.maxLength = 500;
      input.value = values[id] ?? "";
      input.dataset.fieldId = id;
      inputs.set(id, input);
      grid.append(input);
    }
  }

  body.append(grid);
}

/** Opens the editable field form for one template sheet. */
export async function openSheetFieldsDialog(page: number): Promise<void> {
  const project = store.project;
  if (!project) return;
  const document = templateDocumentForPage(project, page);
  if (!document?.template) return;
  const sheetLabels = labels();
  const spec = sheetTemplateFor(document.template.id, document.template.paper, sheetLabels);
  if (!spec) {
    toast(t("sheet.template.unknown"), "warning");
    return;
  }

  const values = { ...document.template.fields };
  const inputs = new Map<string, HTMLInputElement>();
  const body = el("div", "form-stack");
  body.append(el("p", "modal-message", t("sheet.dialog.note")));

  body.append(el("h3", "", t("sheet.dialog.project")));
  fieldRow(
    body,
    inputs,
    t("sheet.field.projectName"),
    SHEET_FIELD.projectName,
    values[SHEET_FIELD.projectName] ?? "",
  );
  fieldRow(
    body,
    inputs,
    t("sheet.field.projectLogo"),
    SHEET_FIELD.projectLogo,
    values[SHEET_FIELD.projectLogo] ?? "",
  );

  body.append(el("h3", "", t("sheet.dialog.titleBlock")));
  for (const [field, label] of [
    [SHEET_FIELD.handledBy, t("sheet.field.handledBy")],
    [SHEET_FIELD.card, t("sheet.field.card")],
    [SHEET_FIELD.date, t("sheet.field.date")],
    [SHEET_FIELD.system, t("sheet.field.system")],
    [SHEET_FIELD.assignment, t("sheet.field.assignment")],
    [SHEET_FIELD.page, t("sheet.field.page")],
  ] as const) {
    fieldRow(body, inputs, label, field, values[field] ?? "");
  }

  body.append(el("h3", "", t("sheet.dialog.revisions")));
  revisionGrid(body, inputs, values, sheetLabels);

  const result = await showModal({
    title: t("sheet.dialog.title"),
    subtitle: t("sheet.dialog.subtitle", { page }),
    body,
    wide: true,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("common.apply"), value: "apply", primary: true },
    ],
  });
  if (result !== "apply") return;

  const next = { ...values };
  for (const [id, input] of inputs) next[id] = input.value;
  store.mutate((current) => {
    const target = templateDocumentForPage(current, page);
    if (target?.template) target.template.fields = next;
  }, "change");
}

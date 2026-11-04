import { store } from "../state/store";
import { el } from "./dom";
import { icon } from "./icons";
import { showModal } from "./dialogs";
import type { PanelActions } from "./panels";
import { mountQuantities, unmountQuantities } from "./quantityPanel";
import { t } from "../i18n";

export function openQuantitiesDialog(actions: PanelActions): void {
  if (!store.project) return;
  const body = el("div", "quantity-dialog");
  const toolbar = el("div", "quantity-dialog-toolbar");
  const exportCsv = el("button", "btn btn-small", t("quantityDialog.csv"));
  exportCsv.type = "button";
  exportCsv.innerHTML = `${icon("csv", 13)}<span>${t("quantityDialog.csv")}</span>`;
  exportCsv.title = t("quantityDialog.csvTitle");
  exportCsv.addEventListener("click", () => actions.exportAs("quantity-csv"));
  const exportExcel = el("button", "btn btn-small", t("quantityDialog.excel"));
  exportExcel.type = "button";
  exportExcel.innerHTML = `${icon("file", 13)}<span>${t("quantityDialog.excel")}</span>`;
  exportExcel.title = t("quantityDialog.excelTitle");
  exportExcel.addEventListener("click", () => actions.exportAs("quantity-xlsx"));
  const exportPdf = el("button", "btn btn-small", t("quantityDialog.pdf"));
  exportPdf.type = "button";
  exportPdf.innerHTML = `${icon("file", 13)}<span>${t("quantityDialog.pdf")}</span>`;
  exportPdf.title = t("quantityDialog.pdfTitle");
  exportPdf.addEventListener("click", () => actions.exportAs("quantity-pdf"));
  toolbar.append(exportCsv, exportExcel, exportPdf);

  const host = el("div", "quantity-dialog-body");
  body.append(toolbar, host);
  mountQuantities(host);

  void showModal({
    title: t("quantityDialog.title"),
    subtitle: t("quantityDialog.subtitle"),
    body,
    wide: true,
    className: "modal-quantities",
    actions: [{ label: t("common.close"), value: "close", primary: true }],
    onClose: unmountQuantities,
  });
}

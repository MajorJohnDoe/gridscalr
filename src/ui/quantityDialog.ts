import { store } from "../state/store";
import { el } from "./dom";
import { icon } from "./icons";
import { showModal } from "./dialogs";
import type { PanelActions } from "./panels";
import { mountQuantities, unmountQuantities } from "./quantityPanel";

export function openQuantitiesDialog(actions: PanelActions): void {
  if (!store.project) return;
  const body = el("div", "quantity-dialog");
  const toolbar = el("div", "quantity-dialog-toolbar");
  const exportCsv = el("button", "btn btn-small", "Quantities CSV");
  exportCsv.type = "button";
  exportCsv.innerHTML = `${icon("csv", 13)}<span>Quantities CSV</span>`;
  exportCsv.title = "Export the quantity report as CSV";
  exportCsv.addEventListener("click", () => actions.exportAs("quantity-csv"));
  const exportPdf = el("button", "btn btn-small", "Quantity PDF");
  exportPdf.type = "button";
  exportPdf.innerHTML = `${icon("file", 13)}<span>Quantity PDF</span>`;
  exportPdf.title = "Export a print-friendly quantity report as PDF";
  exportPdf.addEventListener("click", () => actions.exportAs("quantity-pdf"));
  toolbar.append(exportCsv, exportPdf);

  const host = el("div", "quantity-dialog-body");
  body.append(toolbar, host);
  mountQuantities(host);

  void showModal({
    title: "Quantities",
    subtitle: "Live procurement summary from the current measurements.",
    body,
    wide: true,
    className: "modal-quantities",
    actions: [{ label: "Close", value: "close", primary: true }],
    onClose: unmountQuantities,
  });
}


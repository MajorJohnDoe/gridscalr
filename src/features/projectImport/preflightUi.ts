import { t } from "../../i18n";
import { showModal } from "../../ui/dialogs";
import { el } from "../../ui/dom";
import type { ImportPreflight } from "./preflight";

function countRow(label: string, count: number): HTMLElement {
  const row = el("div", "settings-note");
  row.append(el("strong", "", label), el("span", "", `: ${count}`));
  return row;
}

/** Lists page, item, merge and source-file facts before an import mutates anything. */
export async function projectImportPreflightDialog(preflight: ImportPreflight): Promise<boolean> {
  const body = el("div", "form-stack");
  body.append(el("p", "modal-message", t("projectImport.preflight.intro")));
  body.append(
    countRow(t("projectImport.preflight.pages"), preflight.pages),
    countRow(t("projectImport.preflight.items"), preflight.items),
    countRow(t("projectImport.preflight.documents"), preflight.documents),
    countRow(t("projectImport.preflight.categories"), preflight.categories),
    countRow(t("projectImport.preflight.countTypes"), preflight.countTypes),
    countRow(t("projectImport.preflight.lineTypes"), preflight.lineTypes),
    countRow(t("projectImport.preflight.assets"), preflight.assets),
  );
  if (preflight.missingDocuments.length) {
    body.append(
      el(
        "p",
        "settings-note",
        t("projectImport.preflight.missing", {
          names: preflight.missingDocuments
            .map((name) => name || t("projectImport.unknownDocument"))
            .join(", "),
        }),
      ),
    );
  }
  if (preflight.skippedPages.length) {
    body.append(
      el(
        "p",
        "settings-note",
        t("projectImport.preflight.skippedPages", {
          pages: preflight.skippedPages.join(", "),
        }),
      ),
    );
  }
  if (preflight.checksumDocuments.length) {
    body.append(
      el(
        "p",
        "settings-note",
        t("projectImport.preflight.checksum", {
          names: preflight.checksumDocuments.join(", "),
        }),
      ),
    );
  }
  for (const change of preflight.pageCountChanges) {
    body.append(
      el(
        "p",
        "settings-note",
        t("projectImport.preflight.pageCount", {
          name: change.name || t("projectImport.unknownDocument"),
          expected: change.expected,
          actual: change.actual,
        }),
      ),
    );
  }
  if (preflight.warnings.length) {
    body.append(
      el(
        "p",
        "settings-note",
        t("projectImport.preflight.importWarnings", { count: preflight.warnings.length }),
      ),
    );
  }
  const value = await showModal({
    title: t("projectImport.preflight.title"),
    subtitle: preflight.sourceName,
    body,
    actions: [
      { label: t("common.cancel"), value: "cancel" },
      { label: t("projectImport.preflight.import"), value: "import", primary: true },
    ],
  });
  return value === "import";
}

import { t } from "../../i18n";
import { el } from "../../ui/dom";
import { showModal } from "../../ui/dialogs";
import type { PageId } from "../../model/types";
import { replacementWarnings, type PageRemap, type ReplacementWarningCode } from "./replacement";

export interface ReplacementPageRow {
  pageId: PageId;
  /** 1-based display page in the current project. */
  page: number;
  localPage: number;
  name?: string;
  calibrated: boolean;
  scaleLocked: boolean;
}

export interface ReplacementDialogInput {
  documentName: string;
  newFileName: string;
  newPageCount: number;
  rows: readonly ReplacementPageRow[];
  defaultMappings: readonly PageRemap[];
  /** Warning codes from `replacementWarnings`; rendered as localized notes. */
  warnings?: readonly ReplacementWarningCode[];
  requestThumbnail?: (page: number) => Promise<string | null>;
}

export interface ReplacementDialogResult {
  mappings: PageRemap[];
}

function warningText(code: ReplacementWarningCode, input: ReplacementDialogInput): string {
  switch (code) {
    case "pageCount":
      return t("replace.warningPageCount", {
        old: input.rows.length,
        new: input.newPageCount,
      });
    case "pageSize":
      return t("replace.warningPageSize");
    case "calibration":
      return t("replace.warningCalibration", {
        count: input.rows.filter((row) => row.calibrated).length,
      });
    case "scaleLocked":
      return t("replace.warningScaleLocked", {
        count: input.rows.filter((row) => row.scaleLocked).length,
      });
  }
}

/**
 * Old page → new page mapping. Previews are loaded lazily for the selected new
 * page; unmapped pages keep their old document as superseded.
 */
export async function sourceReplacementDialog(
  input: ReplacementDialogInput,
): Promise<ReplacementDialogResult | null> {
  const body = el("div", "form-stack replace-source");
  body.append(el("p", "modal-message", t("replace.note", { document: input.documentName })));
  const head = el("div", "replace-head");
  head.append(
    el("span", "field-label", t("replace.oldPage")),
    el("span", "field-label", t("replace.newPage")),
  );
  body.append(head);

  const placements = new Map<PageId, number>();
  for (const mapping of input.defaultMappings) {
    placements.set(mapping.pageId, mapping.newLocalPage);
  }
  const previews = new Map<PageId, HTMLImageElement>();
  const thumbnails = new Map<number, string | null>();

  const list = el("div", "replace-list");
  for (const row of input.rows) {
    const line = el("div", "replace-row");
    const label = el("div", "replace-old");
    const title = row.name ?? t("page.titleFallback", { page: row.page });
    label.append(
      el("strong", "", title),
      el(
        "span",
        "replace-old-meta",
        t("replace.oldPageMeta", { page: row.page, localPage: row.localPage }),
      ),
    );
    if (row.calibrated) label.append(el("span", "page-badge", t("page.calibrated")));
    if (row.scaleLocked) label.append(el("span", "page-badge", t("page.scaleLocked")));

    const select = el("select", "select");
    const keep = el("option");
    keep.value = "keep";
    keep.textContent = t("replace.keepSuperseded");
    select.append(keep);
    for (let page = 1; page <= input.newPageCount; page += 1) {
      const option = el("option");
      option.value = String(page);
      option.textContent = t("replace.newPageOption", { page });
      select.append(option);
    }
    const current = placements.get(row.pageId);
    select.value = current ? String(current) : "keep";
    const preview = el("img", "replace-preview");
    preview.alt = "";
    preview.hidden = true;
    previews.set(row.pageId, preview);

    const loadPreview = async (page: number) => {
      if (!input.requestThumbnail) return;
      let url = thumbnails.get(page);
      if (url === undefined) {
        url = await input.requestThumbnail(page);
        thumbnails.set(page, url);
      }
      if (!url || !select.isConnected) return;
      preview.src = url;
      preview.hidden = false;
    };
    select.addEventListener("change", () => {
      if (select.value === "keep") {
        placements.delete(row.pageId);
        preview.hidden = true;
        return;
      }
      const page = Number(select.value);
      if (!Number.isFinite(page) || page < 1) return;
      placements.set(row.pageId, page);
      void loadPreview(page);
    });
    if (current) void loadPreview(current);
    line.append(label, select, preview);
    list.append(line);
  }
  body.append(list);
  const warnings =
    input.warnings ??
    replacementWarnings({
      oldPageCount: input.rows.length,
      newPageCount: input.newPageCount,
      calibratedPages: input.rows.filter((row) => row.calibrated).length,
      scaleLockedPages: input.rows.filter((row) => row.scaleLocked).length,
    });
  for (const warning of warnings) {
    body.append(el("p", "export-note replace-warning", warningText(warning, input)));
  }
  body.append(el("p", "export-note", t("replace.warning")));

  const result = await showModal({
    title: t("replace.title"),
    subtitle: t("replace.subtitle", {
      document: input.documentName,
      file: input.newFileName,
      pages: input.newPageCount,
    }),
    body,
    wide: true,
    actions: [
      { label: t("common.cancel"), value: "__cancel__" },
      { label: t("replace.apply"), value: "replace", primary: true },
    ],
  });
  if (result !== "replace") return null;
  return {
    mappings: [...placements.entries()].map(([pageId, newLocalPage]) => ({
      pageId,
      newLocalPage,
    })),
  };
}

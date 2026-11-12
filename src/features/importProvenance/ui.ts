import { t } from "../../i18n";
import { formatDate, formatNumber } from "../../i18n/format";
import type { MarkupsColumnId, PageId, Project } from "../../model/types";
import { el } from "../../ui/dom";
import { pageProvenanceSummary, type ProvenanceSummary } from "./model";

/** UI-only Markups column appended when a visible row has provenance. */
export const PROVENANCE_COLUMN = "provenance" as const;
export const PROVENANCE_COLUMN_WIDTH = 9;

export type MarkupsDisplayColumn = MarkupsColumnId | typeof PROVENANCE_COLUMN;

/**
 * The provenance column is derived from the current rows, never stored in a
 * saved Markups view, so a project without imported pages shows no empty
 * column and existing views keep their exact column list.
 */
export function withProvenanceColumn(
  columns: readonly MarkupsColumnId[],
  show: boolean,
): MarkupsDisplayColumn[] {
  return show ? [...columns, PROVENANCE_COLUMN] : [...columns];
}

/** Locale-aware date and time, or the localized "unknown" fallback. */
export function formatProvenanceDate(value: string | null): string {
  if (!value) return t("provenance.unknown");
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" });
}

function formatRevisionSize(bytes: number): string {
  if (bytes < 1024) return t("provenance.sizeBytes", { value: formatNumber(bytes, 0) });
  if (bytes < 1024 * 1024) {
    return t("provenance.sizeKilobytes", { value: formatNumber(bytes / 1024, 1) });
  }
  return t("provenance.sizeMegabytes", { value: formatNumber(bytes / (1024 * 1024), 1) });
}

function appendRow(
  list: HTMLElement,
  label: string,
  value: string,
  title?: string,
  note?: string,
): void {
  const row = el("div", "provenance-row");
  const term = el("dt", "", label);
  const detail = el("dd");
  const main = el("span", "provenance-value", value);
  if (title) main.title = title;
  detail.append(main);
  if (note) detail.append(el("span", "provenance-note", note));
  row.append(term, detail);
  list.append(row);
}

/**
 * Read-only Properties block for the current page. Returns null for a normal
 * page, so the inspector adds no heading and no empty section.
 */
export function pageProvenanceSection(project: Project, pageId: PageId): HTMLElement | null {
  const summary = pageProvenanceSummary(project, pageId);
  if (!summary) return null;

  const section = el("section", "inspector-section provenance-section");
  const head = el("div", "section-head");
  head.append(el("h3", "", t("provenance.title")));
  section.append(head);

  const list = el("dl", "provenance-list");
  appendRow(
    list,
    t("provenance.sourceProject"),
    summary.sourceProjectShort,
    summary.sourceProjectId,
  );
  appendRow(
    list,
    t("provenance.sourceRevision"),
    summary.revisionShort,
    summary.sourceRevisionSha256,
    formatRevisionSize(summary.sourceRevisionSize),
  );
  appendRow(
    list,
    t("provenance.revisionModified"),
    formatProvenanceDate(summary.sourceRevisionModifiedAt),
    summary.sourceRevisionModifiedAt ?? undefined,
  );
  appendRow(
    list,
    t("provenance.sourcePage"),
    summary.sourcePageNumber === null
      ? summary.sourcePageShort
      : t("provenance.pageNumber", { page: summary.sourcePageNumber }),
    summary.sourcePageId,
  );
  appendRow(
    list,
    t("provenance.importedAt"),
    formatProvenanceDate(summary.importedAt),
    summary.importedAt,
    t("provenance.appVersion", { version: summary.appVersion }),
  );
  section.append(list);
  return section;
}

/**
 * Compact Markups cell. A normal page keeps an empty cell so the conditional
 * column stays aligned; it never renders a path or free text from the source.
 */
export function markupsProvenanceCell(summary: ProvenanceSummary | null): HTMLTableCellElement {
  const cell = el("td", "markups-provenance");
  if (!summary) {
    cell.textContent = "–";
    return cell;
  }
  cell.textContent = summary.sourceProjectShort;
  cell.title = t("provenance.markupsTitle", {
    project: summary.sourceProjectShort,
    revision: summary.revisionShort,
    date: formatProvenanceDate(summary.importedAt),
  });
  return cell;
}

import { documentForPageRecord } from "../../model/pages";
import { ocrMatchesSource } from "../../model/ocrStatus";
import type { DocumentKind, PageId, Project } from "../../model/types";
import { isBlankSheet } from "../schematics/model/sheetDocument";

/**
 * Pure page-status derivation for the Pages panel.
 *
 * Every badge and every filter is computed from project data, the source-file
 * monitor result and the stored OCR revision. Nothing here is stored, cached or
 * written back, so a badge cannot drift from the state that produced it.
 */

export type PageSourceState = "ok" | "missing" | "changed" | "unchecked";

export type PageStatusBadgeId =
  | "sourceChanged"
  | "superseded"
  | "ocrStale"
  | "ocrMissing"
  | "scaleLocked"
  | "calibrated"
  | "blank"
  | "template"
  | "itemCount";

export interface PageStatusBadge {
  id: PageStatusBadgeId;
  /** Only the item-count badge carries a value; it is formatted by the UI. */
  count?: number;
}

export interface PageStatusRow {
  /** 1-based display page number from the current page order. */
  page: number;
  pageId: PageId;
  documentId: string | null;
  badges: PageStatusBadge[];
}

export type PageStatusFilter =
  "all" | "changedSource" | "superseded" | "missingOcr" | "lockedScale";

/** Filter order in the Pages panel. `all` is always first. */
export const PAGE_STATUS_FILTERS: readonly PageStatusFilter[] = [
  "all",
  "changedSource",
  "superseded",
  "missingOcr",
  "lockedScale",
];

export interface PageStatusFacts {
  documentKind: DocumentKind | null;
  sourceState: PageSourceState;
  superseded: boolean;
  calibrated: boolean;
  scaleLocked: boolean;
  blank: boolean;
  template: boolean;
  /** Stored OCR still matches the page's current source revision. */
  ocrCurrent: boolean;
  /** A stored OCR result exists for the page, current or not. */
  ocrStored: boolean;
  itemCount: number;
}

/**
 * Badges for one page, in display order: problems first, then page kind and
 * finally the item count. The order is stable so the panel does not flicker
 * between renders.
 */
export function pageStatusBadges(facts: PageStatusFacts): PageStatusBadge[] {
  const badges: PageStatusBadge[] = [];
  if (facts.sourceState === "changed") badges.push({ id: "sourceChanged" });
  if (facts.superseded) badges.push({ id: "superseded" });
  if (facts.ocrStored && !facts.ocrCurrent) badges.push({ id: "ocrStale" });
  // A TIF page is always a scan, so missing OCR is a fact rather than a guess.
  if (!facts.ocrStored && facts.documentKind === "tiff") badges.push({ id: "ocrMissing" });
  if (facts.scaleLocked) badges.push({ id: "scaleLocked" });
  if (facts.calibrated) badges.push({ id: "calibrated" });
  if (facts.blank) badges.push({ id: "blank" });
  else if (facts.template) badges.push({ id: "template" });
  if (facts.itemCount > 0) badges.push({ id: "itemCount", count: facts.itemCount });
  return badges;
}

/** Item count per page, computed in one pass over every layer. */
export function pageItemCounts(project: Project): Map<PageId, number> {
  const counts = new Map<PageId, number>();
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (!item.pageId) continue;
      counts.set(item.pageId, (counts.get(item.pageId) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * One row per project page. `sourceStates` comes from the source-file monitor
 * and defaults to "unchecked", so a page is never badged as changed without a
 * completed check.
 */
export function pageStatusRows(
  project: Project,
  sourceStates: ReadonlyMap<string, PageSourceState> = new Map(),
): PageStatusRow[] {
  const documents = new Map(project.documents.map((document) => [document.id, document]));
  const itemCounts = pageItemCounts(project);
  return project.pages.map((record, index) => {
    const document =
      documents.get(record.documentId ?? "") ?? documentForPageRecord(project, record);
    const ocr = record.state?.ocr;
    const facts: PageStatusFacts = {
      documentKind: document?.kind ?? null,
      sourceState: document ? (sourceStates.get(document.id) ?? "unchecked") : "unchecked",
      superseded: Boolean(document?.superseded),
      calibrated: Boolean(record.state?.calibration),
      scaleLocked: Boolean(record.state?.scaleLocked),
      blank: isBlankSheet(document),
      template: document?.kind === "template",
      ocrCurrent: document ? ocrMatchesSource(ocr, document.sha256, record.localPage) : false,
      ocrStored: Boolean(ocr),
      itemCount: itemCounts.get(record.id) ?? 0,
    };
    return {
      page: index + 1,
      pageId: record.id,
      documentId: record.documentId ?? null,
      badges: pageStatusBadges(facts),
    };
  });
}

function hasBadge(badges: readonly PageStatusBadge[], id: PageStatusBadgeId): boolean {
  return badges.some((badge) => badge.id === id);
}

/** Whether one page row satisfies a filter. `all` never filters anything out. */
export function matchesPageStatusFilter(
  badges: readonly PageStatusBadge[],
  filter: PageStatusFilter,
): boolean {
  switch (filter) {
    case "changedSource":
      return hasBadge(badges, "sourceChanged");
    case "superseded":
      return hasBadge(badges, "superseded");
    case "missingOcr":
      return hasBadge(badges, "ocrMissing") || hasBadge(badges, "ocrStale");
    case "lockedScale":
      return hasBadge(badges, "scaleLocked");
    case "all":
    default:
      return true;
  }
}

export function filterPageStatusRows(
  rows: readonly PageStatusRow[],
  filter: PageStatusFilter,
): PageStatusRow[] {
  if (filter === "all") return [...rows];
  return rows.filter((row) => matchesPageStatusFilter(row.badges, filter));
}

/** Matching page count for every filter, shown next to each filter button. */
export function pageStatusFilterCounts(
  rows: readonly PageStatusRow[],
): Record<PageStatusFilter, number> {
  const counts = { all: rows.length } as Record<PageStatusFilter, number>;
  for (const filter of PAGE_STATUS_FILTERS) {
    if (filter === "all") continue;
    counts[filter] = rows.filter((row) => matchesPageStatusFilter(row.badges, filter)).length;
  }
  return counts;
}

import {
  pageBuilding,
  pageDisplayName,
  pageFloor,
  pageNumber,
  pageRecordById,
} from "../model/pages";
import { itemBounds, itemCenter, type Bounds } from "../model/geometry";
import { itemKindLabel } from "../model/measure";
import { pageCalibration } from "../model/calibration";
import { countTypeLabel } from "../features/countTypes/model";
import { inspectionStatusLabel } from "../model/symbols";
import { formatScale } from "../model/units";
import type { Layer, MarkupItem, Point, Project } from "../model/types";
import { t, type MessageKey } from "../i18n";

export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

export interface DiffChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface DiffItem {
  status: DiffStatus;
  /** Current (or reference-only) page ID. */
  pageId: string;
  /** Page identity key: document id plus source-local page. */
  pageKey: string;
  /** Display number derived from the current page order. */
  page: number;
  kind: MarkupItem["kind"];
  kindLabel: string;
  label: string;
  layerName: string;
  current?: { layer: Layer; item: MarkupItem };
  reference?: { layer: Layer; item: MarkupItem };
  changes: DiffChange[];
  bounds: Bounds;
}

export interface DiffPage {
  page: number;
  pageName: string;
  building: string;
  floor: string;
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
}

export interface RevisionDiff {
  items: DiffItem[];
  pages: DiffPage[];
  summary: {
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
    pages: number;
  };
  warnings: string[];
}

export interface RevisionDiffOptions {
  /** Distance in PDF points for matching an item that moved. Defaults to 12. */
  moveTolerance?: number;
}

interface Entry {
  layer: Layer;
  item: MarkupItem;
  pageKey: string;
}

function pageKeyOf(project: Project, pageId: string, sharedIds: ReadonlySet<string>): string {
  if (sharedIds.has(pageId)) return `id:${pageId}`;
  const record = pageRecordById(project, pageId);
  if (!record) return "";
  const document = project.documents.find((entry) => entry.id === record.documentId);
  if (document) return `${document.name}\u0000${record.localPage}`;
  return `n:${pageNumber(project, pageId)}`;
}

function samePage(a: Entry, b: Entry): boolean {
  return a.item.pageId === b.item.pageId || (Boolean(a.pageKey) && a.pageKey === b.pageKey);
}

const DEFAULT_MOVE_TOLERANCE = 12;

function fieldLabel(field: string): string {
  return t(`diff.field.${field}` as MessageKey);
}

function round(value: number, step = 0.01): number {
  return Math.round(value / step) * step;
}

function pointKey(point: Point): string {
  return `${round(point.x, 0.5)},${round(point.y, 0.5)}`;
}

function geometryKey(item: MarkupItem, pageKey: string): string {
  return JSON.stringify({
    kind: item.kind,
    page: pageKey,
    points: item.points.map(pointKey),
    symbolId: item.symbolId ?? "",
    assetId: item.image?.assetId ?? "",
  });
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) <= 0.01 && Math.abs(a.y - b.y) <= 0.01;
}

function samePoints(a: Point[], b: Point[]): boolean {
  return a.length === b.length && a.every((point, index) => samePoint(point, b[index]));
}

function geometrySummary(item: MarkupItem): string {
  if (!item.points.length) return t("diff.value.noPoints");
  if (item.kind === "count" || item.kind === "stamp" || item.kind === "symbol") {
    return t("diff.points", { count: item.points.length });
  }
  return t("diff.points", { count: item.points.length });
}

function categoryName(project: Project, item: MarkupItem): string {
  return project.categories.find((category) => category.id === item.categoryId)?.name ?? "";
}

function assetName(project: Project, item: MarkupItem): string {
  return (item.image && project.assets[item.image.assetId]?.name) || "";
}

function displayPointOffset(value: Point | undefined): string {
  return value ? `${round(value.x, 0.1)}, ${round(value.y, 0.1)}` : t("diff.value.none");
}

function displayValue(project: Project, item: MarkupItem, field: string, page: number): string {
  const record = item as unknown as Record<string, unknown>;
  switch (field) {
    case "kind":
      return itemKindLabel(item.kind);
    case "page":
      return t("diff.page", { page });
    case "points":
      return geometrySummary(item);
    case "categoryId":
      return categoryName(project, item) || t("diff.value.noCategory");
    case "countType":
      return countTypeLabel(project, item.countType);
    case "status":
      return inspectionStatusLabel(item.status);
    case "scale":
      if (!item.scale) return t("diff.value.unscaled");
      return item.scale.sourceUnit
        ? `${round(item.scale.pointsPerMeter, 0.01)} pt/m`
        : `${round(item.scale.pointsPerMeter, 0.01)} pt/m`;
    case "image":
      return assetName(project, item) || t("diff.value.image");
    case "textOffset":
    case "labelOffset":
    case "labelAnchor":
      return displayPointOffset(item[field]);
    case "visible":
      return item.visible === false ? t("diff.value.hidden") : t("diff.value.visible");
    case "locked":
      return item.locked ? t("diff.value.locked") : t("diff.value.unlocked");
    case "textBold":
      return item.textBold ? t("diff.value.bold") : t("diff.value.regular");
    case "textUnderline":
      return item.textUnderline ? t("diff.value.underlined") : t("diff.value.notUnderlined");
    case "opacity":
      return item.opacity === undefined
        ? t("diff.value.default")
        : `${Math.round(item.opacity * 100)}%`;
    case "rotation":
      return `${round(item.rotation ?? 0, 0.1)}°`;
    case "strokeWidth":
    case "fontSize":
    case "symbolSize":
    case "labelSize":
    case "cloudRadius":
    case "textBoxWidth":
    case "textBoxHeight":
      return record[field] === undefined
        ? t("diff.value.default")
        : String(round(record[field] as number, 0.1));
    default:
      return record[field] === undefined ? t("diff.value.default") : String(record[field]);
  }
}

const COMPARED_FIELDS: Array<keyof MarkupItem> = [
  "kind",
  "points",
  "color",
  "fillColor",
  "strokeWidth",
  "opacity",
  "text",
  "label",
  "fontSize",
  "rotation",
  "visible",
  "locked",
  "scale",
  "categoryId",
  "room",
  "areaMode",
  "areaShape",
  "countType",
  "countQuantity",
  "symbolId",
  "symbolSize",
  "status",
  "lineStyle",
  "arrowHeads",
  "depth",
  "textOffset",
  "labelOffset",
  "labelAnchor",
  "labelSize",
  "labelFit",
  "cloudRadius",
  "textBoxWidth",
  "textBoxHeight",
  "textColor",
  "textBold",
  "textUnderline",
  "textAlign",
  "image",
];

function fieldChanged(a: MarkupItem, b: MarkupItem, field: keyof MarkupItem): boolean {
  if (field === "points") return !samePoints(a.points, b.points);
  if (field === "scale") return JSON.stringify(a.scale ?? null) !== JSON.stringify(b.scale ?? null);
  if (field === "image") return JSON.stringify(a.image ?? null) !== JSON.stringify(b.image ?? null);
  if (field === "textOffset" || field === "labelOffset" || field === "labelAnchor") {
    const left = a[field];
    const right = b[field];
    if (!left || !right) return Boolean(left) !== Boolean(right);
    return !samePoint(left, right);
  }
  return JSON.stringify(a[field] ?? null) !== JSON.stringify(b[field] ?? null);
}

function changesFor(
  current: { layer: Layer; item: MarkupItem },
  reference: { layer: Layer; item: MarkupItem },
  currentProject: Project,
  referenceProject: Project,
  currentPage: number,
  referencePage: number,
): DiffChange[] {
  const changes: DiffChange[] = [];
  if (currentPage && referencePage && currentPage !== referencePage) {
    changes.push({
      field: "page",
      label: fieldLabel("page"),
      before: displayValue(referenceProject, reference.item, "page", referencePage),
      after: displayValue(currentProject, current.item, "page", currentPage),
    });
  }
  for (const field of COMPARED_FIELDS) {
    if (!fieldChanged(current.item, reference.item, field)) continue;
    changes.push({
      field,
      label: fieldLabel(field),
      before: displayValue(referenceProject, reference.item, field, referencePage),
      after: displayValue(currentProject, current.item, field, currentPage),
    });
  }
  if (current.layer.id !== reference.layer.id && current.layer.name !== reference.layer.name) {
    changes.push({
      field: "layer",
      label: fieldLabel("layer"),
      before: reference.layer.name,
      after: current.layer.name,
    });
  }
  return changes;
}

function collect(project: Project, sharedIds: ReadonlySet<string>): Entry[] {
  const entries: Entry[] = [];
  for (const layer of project.layers) {
    for (const item of layer.items) {
      entries.push({ layer, item, pageKey: pageKeyOf(project, item.pageId, sharedIds) });
    }
  }
  return entries;
}

function calibrationLabel(calibration: NonNullable<ReturnType<typeof pageCalibration>>): string {
  return formatScale(
    {
      pointsPerMeter: calibration.pointsPerMeter,
      sourceUnit: calibration.source === "manual" ? "m" : calibration.unit,
    },
    calibration,
  );
}

function itemLabel(item: MarkupItem): string {
  return item.label?.trim() || item.text?.trim() || itemKindLabel(item.kind);
}

function distanceBetween(a: MarkupItem, b: MarkupItem): number {
  const left = itemCenter(a);
  const right = itemCenter(b);
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function nearestCandidate(
  current: Entry,
  candidates: Entry[],
  used: Set<Entry>,
  tolerance: number,
): Entry | null {
  let best: Entry | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (used.has(candidate)) continue;
    if (!samePage(candidate, current)) continue;
    if (candidate.item.kind !== current.item.kind) continue;
    const distance = distanceBetween(current.item, candidate.item);
    if (distance > tolerance || distance >= bestDistance) continue;
    best = candidate;
    bestDistance = distance;
  }
  return best;
}

/**
 * Compares the current takeoff with a reference revision. Matching is stable
 * across files: item ids first, then geometry, then the nearest same-kind item
 * inside the move tolerance.
 */
export function compareRevisions(
  current: Project,
  reference: Project,
  options: RevisionDiffOptions = {},
): RevisionDiff {
  const tolerance = Math.max(0, options.moveTolerance ?? DEFAULT_MOVE_TOLERANCE);
  const referenceIds = new Set(reference.pages.map((record) => record.id));
  const sharedIds = new Set(
    current.pages.map((record) => record.id).filter((id) => referenceIds.has(id)),
  );
  const currentEntries = collect(current, sharedIds);
  const referenceEntries = collect(reference, sharedIds);
  const used = new Set<Entry>();
  const items: DiffItem[] = [];

  for (const entry of currentEntries) {
    const idMatch = referenceEntries.find(
      (candidate) => !used.has(candidate) && candidate.item.id === entry.item.id,
    );
    const signatureMatch = idMatch
      ? null
      : referenceEntries.find(
          (candidate) =>
            !used.has(candidate) &&
            samePage(candidate, entry) &&
            geometryKey(candidate.item, candidate.pageKey) ===
              geometryKey(entry.item, entry.pageKey),
        );
    const nearest =
      idMatch ?? signatureMatch ?? nearestCandidate(entry, referenceEntries, used, tolerance);
    if (!nearest) {
      items.push({
        status: "added",
        pageId: entry.item.pageId,
        pageKey: entry.pageKey,
        page: pageNumber(current, entry.item.pageId),
        kind: entry.item.kind,
        kindLabel: itemKindLabel(entry.item.kind),
        label: itemLabel(entry.item),
        layerName: entry.layer.name,
        current: entry,
        changes: [],
        bounds: itemBounds(entry.item),
      });
      continue;
    }
    used.add(nearest);
    const changes = changesFor(
      entry,
      nearest,
      current,
      reference,
      pageNumber(current, entry.item.pageId),
      pageNumber(reference, nearest.item.pageId),
    );
    items.push({
      status: changes.length ? "changed" : "unchanged",
      pageId: entry.item.pageId,
      pageKey: entry.pageKey,
      page: pageNumber(current, entry.item.pageId),
      kind: entry.item.kind,
      kindLabel: itemKindLabel(entry.item.kind),
      label: itemLabel(entry.item),
      layerName: entry.layer.name,
      current: entry,
      reference: nearest,
      changes,
      bounds: itemBounds(entry.item),
    });
  }

  for (const entry of referenceEntries) {
    if (used.has(entry)) continue;
    items.push({
      status: "removed",
      pageId: entry.item.pageId,
      pageKey: entry.pageKey,
      page: pageNumber(reference, entry.item.pageId),
      kind: entry.item.kind,
      kindLabel: itemKindLabel(entry.item.kind),
      label: itemLabel(entry.item),
      layerName: entry.layer.name,
      reference: entry,
      changes: [],
      bounds: itemBounds(entry.item),
    });
  }

  items.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    const order: Record<DiffStatus, number> = { changed: 0, added: 1, removed: 2, unchanged: 3 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    if (a.layerName !== b.layerName) return a.layerName.localeCompare(b.layerName);
    return a.label.localeCompare(b.label);
  });

  const pageRows: Array<{
    key: string;
    currentId: string | null;
    referenceId: string | null;
  }> = [];
  const usedReference = new Set<string>();
  current.pages.forEach((record, index) => {
    const key = pageKeyOf(current, record.id, sharedIds);
    let match = reference.pages.find(
      (candidate) =>
        !usedReference.has(candidate.id) && pageKeyOf(reference, candidate.id, sharedIds) === key,
    );
    // A renamed source document still describes the same sheet position.
    if (!match) match = reference.pages[index];
    if (match && !usedReference.has(match.id)) usedReference.add(match.id);
    pageRows.push({
      key,
      currentId: record.id,
      referenceId: match?.id ?? null,
    });
  });
  for (const record of reference.pages) {
    if (usedReference.has(record.id)) continue;
    pageRows.push({
      key: pageKeyOf(reference, record.id, sharedIds),
      currentId: null,
      referenceId: record.id,
    });
  }
  const pages: DiffPage[] = pageRows.map((row) => {
    const page = row.currentId
      ? pageNumber(current, row.currentId)
      : pageNumber(reference, row.referenceId);
    const pageItems = items.filter((item) => item.pageKey === row.key);
    return {
      page,
      pageName:
        pageDisplayName(current, row.currentId) ??
        pageDisplayName(reference, row.referenceId) ??
        t("compare.pageLabel", { page }),
      building:
        pageBuilding(current, row.currentId) ?? pageBuilding(reference, row.referenceId) ?? "",
      floor: pageFloor(current, row.currentId) ?? pageFloor(reference, row.referenceId) ?? "",
      added: pageItems.filter((item) => item.status === "added").length,
      removed: pageItems.filter((item) => item.status === "removed").length,
      changed: pageItems.filter((item) => item.status === "changed").length,
      unchanged: pageItems.filter((item) => item.status === "unchanged").length,
    };
  });

  const warnings: string[] = [];
  const currentPages = current.pages.length;
  const referencePages = reference.pages.length;
  if (currentPages !== referencePages) {
    warnings.push(
      t("compare.pageCountsDiffer", { current: currentPages, reference: referencePages }),
    );
  }
  const currentNames = new Set(current.documents.map((document) => document.name));
  const referenceNames = new Set(reference.documents.map((document) => document.name));
  if (
    currentNames.size !== referenceNames.size ||
    [...currentNames].some((name) => !referenceNames.has(name))
  ) {
    warnings.push(t("diff.differentFiles"));
  }
  for (const row of pageRows) {
    if (!row.currentId || !row.referenceId) continue;
    const left = pageCalibration(current, row.currentId);
    const right = pageCalibration(reference, row.referenceId);
    if (!left || !right) continue;
    const delta =
      Math.abs(left.pointsPerMeter - right.pointsPerMeter) / Math.max(left.pointsPerMeter, 1);
    if (delta < 0.001) continue;
    warnings.push(
      t("compare.pageScalesDiffer", {
        page: pageNumber(current, row.currentId),
        left: calibrationLabel(left),
        right: calibrationLabel(right),
      }),
    );
  }

  const summary = {
    added: items.filter((item) => item.status === "added").length,
    removed: items.filter((item) => item.status === "removed").length,
    changed: items.filter((item) => item.status === "changed").length,
    unchanged: items.filter((item) => item.status === "unchanged").length,
    pages: pages.length,
  };
  return { items, pages, summary, warnings };
}

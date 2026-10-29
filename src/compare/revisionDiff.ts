import { pageBuilding, pageDisplayName, pageFloor, totalPageCount } from "../model/documents";
import { itemBounds, itemCenter, type Bounds } from "../model/geometry";
import { itemKindLabel } from "../model/measure";
import { pageCalibration } from "../model/calibration";
import { COUNT_TYPE_LABELS } from "../model/countSymbols";
import { inspectionStatusLabel } from "../model/symbols";
import { formatScale } from "../model/units";
import type { Layer, MarkupItem, Point, Project } from "../model/types";

export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

export interface DiffChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface DiffItem {
  status: DiffStatus;
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
}

const DEFAULT_MOVE_TOLERANCE = 12;

const FIELD_LABELS: Record<string, string> = {
  kind: "Type",
  page: "Page",
  points: "Geometry",
  color: "Colour",
  fillColor: "Fill colour",
  strokeWidth: "Stroke width",
  opacity: "Opacity",
  text: "Text",
  label: "Label",
  fontSize: "Font size",
  rotation: "Rotation",
  visible: "Visible",
  locked: "Locked",
  scale: "Scale",
  categoryId: "Category",
  room: "Room",
  areaMode: "Area mode",
  areaShape: "Area shape",
  countType: "Count type",
  symbolId: "Symbol",
  symbolSize: "Symbol size",
  status: "Status",
  lineStyle: "Line style",
  arrowHeads: "Arrow heads",
  textOffset: "Text offset",
  labelOffset: "Label offset",
  labelAnchor: "Label anchor",
  labelSize: "Label size",
  labelFit: "Label fit",
  cloudRadius: "Cloud radius",
  textBoxWidth: "Text box width",
  textBoxHeight: "Text box height",
  textColor: "Text colour",
  textBold: "Bold",
  textUnderline: "Underline",
  textAlign: "Text alignment",
  image: "Image",
  layer: "Layer",
};

function round(value: number, step = 0.01): number {
  return Math.round(value / step) * step;
}

function pointKey(point: Point): string {
  return `${round(point.x, 0.5)},${round(point.y, 0.5)}`;
}

function geometryKey(item: MarkupItem): string {
  return JSON.stringify({
    kind: item.kind,
    page: item.page,
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
  if (!item.points.length) return "No points";
  if (item.kind === "count" || item.kind === "stamp" || item.kind === "symbol") {
    return `${item.points.length} point${item.points.length === 1 ? "" : "s"}`;
  }
  return `${item.points.length} point${item.points.length === 1 ? "" : "s"}`;
}

function categoryName(project: Project, item: MarkupItem): string {
  return project.categories.find((category) => category.id === item.categoryId)?.name ?? "";
}

function assetName(project: Project, item: MarkupItem): string {
  return (item.image && project.assets[item.image.assetId]?.name) || "";
}

function displayPointOffset(value: Point | undefined): string {
  return value ? `${round(value.x, 0.1)}, ${round(value.y, 0.1)}` : "None";
}

function displayValue(project: Project, item: MarkupItem, field: string): string {
  const record = item as unknown as Record<string, unknown>;
  switch (field) {
    case "kind":
      return itemKindLabel(item.kind);
    case "page":
      return `Page ${item.page}`;
    case "points":
      return geometrySummary(item);
    case "categoryId":
      return categoryName(project, item) || "No category";
    case "countType":
      return item.countType ? COUNT_TYPE_LABELS[item.countType] : "Other";
    case "status":
      return inspectionStatusLabel(item.status);
    case "scale":
      if (!item.scale) return "Unscaled";
      return item.scale.sourceUnit
        ? `${round(item.scale.pointsPerMeter, 0.01)} pt/m`
        : `${round(item.scale.pointsPerMeter, 0.01)} pt/m`;
    case "image":
      return assetName(project, item) || "Image";
    case "textOffset":
    case "labelOffset":
    case "labelAnchor":
      return displayPointOffset(item[field]);
    case "visible":
      return item.visible === false ? "Hidden" : "Visible";
    case "locked":
      return item.locked ? "Locked" : "Unlocked";
    case "textBold":
      return item.textBold ? "Bold" : "Regular";
    case "textUnderline":
      return item.textUnderline ? "Underlined" : "Not underlined";
    case "opacity":
      return item.opacity === undefined ? "Default" : `${Math.round(item.opacity * 100)}%`;
    case "rotation":
      return `${round(item.rotation ?? 0, 0.1)}°`;
    case "strokeWidth":
    case "fontSize":
    case "symbolSize":
    case "labelSize":
    case "cloudRadius":
    case "textBoxWidth":
    case "textBoxHeight":
      return record[field] === undefined ? "Default" : String(round(record[field] as number, 0.1));
    default:
      return record[field] === undefined ? "Default" : String(record[field]);
  }
}

const COMPARED_FIELDS: Array<keyof MarkupItem> = [
  "kind",
  "page",
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
  "symbolId",
  "symbolSize",
  "status",
  "lineStyle",
  "arrowHeads",
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
): DiffChange[] {
  const changes: DiffChange[] = [];
  for (const field of COMPARED_FIELDS) {
    if (!fieldChanged(current.item, reference.item, field)) continue;
    changes.push({
      field,
      label: FIELD_LABELS[field] ?? field,
      before: displayValue(referenceProject, reference.item, field),
      after: displayValue(currentProject, current.item, field),
    });
  }
  if (current.layer.id !== reference.layer.id && current.layer.name !== reference.layer.name) {
    changes.push({
      field: "layer",
      label: FIELD_LABELS.layer,
      before: reference.layer.name,
      after: current.layer.name,
    });
  }
  return changes;
}

function collect(project: Project): Entry[] {
  const entries: Entry[] = [];
  for (const layer of project.layers) {
    for (const item of layer.items) entries.push({ layer, item });
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
    if (candidate.item.page !== current.item.page) continue;
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
  const currentEntries = collect(current);
  const referenceEntries = collect(reference);
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
            candidate.item.page === entry.item.page &&
            geometryKey(candidate.item) === geometryKey(entry.item),
        );
    const nearest =
      idMatch ?? signatureMatch ?? nearestCandidate(entry, referenceEntries, used, tolerance);
    if (!nearest) {
      items.push({
        status: "added",
        page: entry.item.page,
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
    const changes = changesFor(entry, nearest, current, reference);
    items.push({
      status: changes.length ? "changed" : "unchanged",
      page: entry.item.page,
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
      page: entry.item.page,
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

  const pageCount = Math.max(
    totalPageCount(current.documents),
    totalPageCount(reference.documents),
  );
  const pages: DiffPage[] = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const pageItems = items.filter((item) => item.page === page);
    pages.push({
      page,
      pageName:
        pageDisplayName(current, page) ?? pageDisplayName(reference, page) ?? `Page ${page}`,
      building: pageBuilding(current, page) ?? pageBuilding(reference, page) ?? "",
      floor: pageFloor(current, page) ?? pageFloor(reference, page) ?? "",
      added: pageItems.filter((item) => item.status === "added").length,
      removed: pageItems.filter((item) => item.status === "removed").length,
      changed: pageItems.filter((item) => item.status === "changed").length,
      unchanged: pageItems.filter((item) => item.status === "unchanged").length,
    });
  }

  const warnings: string[] = [];
  const currentPages = totalPageCount(current.documents);
  const referencePages = totalPageCount(reference.documents);
  if (currentPages !== referencePages) {
    warnings.push(`Page counts differ: current ${currentPages}, reference ${referencePages}.`);
  }
  const currentNames = new Set(current.documents.map((document) => document.name));
  const referenceNames = new Set(reference.documents.map((document) => document.name));
  if (
    currentNames.size !== referenceNames.size ||
    [...currentNames].some((name) => !referenceNames.has(name))
  ) {
    warnings.push("The projects reference different drawing files.");
  }
  for (let page = 1; page <= Math.min(currentPages, referencePages); page += 1) {
    const left = pageCalibration(current, page);
    const right = pageCalibration(reference, page);
    if (!left || !right) continue;
    const delta =
      Math.abs(left.pointsPerMeter - right.pointsPerMeter) / Math.max(left.pointsPerMeter, 1);
    if (delta < 0.001) continue;
    warnings.push(
      `Page ${page} scales differ: ${calibrationLabel(left)} versus ${calibrationLabel(right)}.`,
    );
  }

  const summary = {
    added: items.filter((item) => item.status === "added").length,
    removed: items.filter((item) => item.status === "removed").length,
    changed: items.filter((item) => item.status === "changed").length,
    unchanged: items.filter((item) => item.status === "unchanged").length,
    pages: pageCount,
  };
  return { items, pages, summary, warnings };
}

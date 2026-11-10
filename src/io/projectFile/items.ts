import { canonicalColor, normalizeColor } from "../../model/color";
import { clampLabelSize } from "../../model/label";
import { isLabelFitPosition } from "../../model/labelLayout";
import { defaultColorForItem, isMeasurementKind, layerKindForItem } from "../../model/layers";
import { stampStatusColor } from "../../model/stamps";
import { SYMBOL_MAX_SIZE, SYMBOL_MIN_SIZE, isInspectionStatus } from "../../model/symbols";
import type {
  AreaMode,
  ArrowHeads,
  LayerKind,
  LengthUnit,
  MarkupItem,
  PageId,
  TextAlign,
} from "../../model/types";
import {
  ITEM_KINDS,
  LENGTH_UNITS,
  isPoint,
  normalizeHighlightShape,
  normalizeAreaShape,
  normalizeImageMode,
  normalizeTextRuns,
} from "./shared";
import { normalizeRailRows } from "./rail";

export function normalizeItem(
  value: unknown,
  layerKind: LayerKind,
  layerColor: string,
  categoryIds: ReadonlySet<string>,
  fallbackCategoryId: string,
  assetIds: ReadonlySet<string>,
  countTypeIds: ReadonlySet<string>,
  pageIds: ReadonlySet<PageId>,
  fallbackPageId: PageId | null,
  report?: (code: string) => void,
): MarkupItem | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<MarkupItem>;
  if (!raw.kind || !ITEM_KINDS.has(raw.kind)) return null;
  if (layerKindForItem(raw.kind) !== layerKind) return null;
  if (typeof raw.pageId === "string" && !pageIds.has(raw.pageId)) report?.("repairedItemPage");
  const pageId =
    typeof raw.pageId === "string" && pageIds.has(raw.pageId) ? raw.pageId : fallbackPageId;
  if (!pageId) return null;
  if (!Array.isArray(raw.points) || !raw.points.every(isPoint)) return null;
  if (raw.points.length === 0) return null;
  const now = new Date().toISOString();
  const scale = raw.scale;
  const isMeasure = isMeasurementKind(raw.kind);
  const room = typeof raw.room === "string" ? raw.room.trim() : "";
  const points =
    raw.kind === "count"
      ? [{ x: raw.points[0].x, y: raw.points[0].y }]
      : raw.points.map((p) => ({ x: p.x, y: p.y }));
  let image: MarkupItem["image"];
  if (raw.kind === "image") {
    if (!raw.image || typeof raw.image.assetId !== "string" || !assetIds.has(raw.image.assetId)) {
      report?.("droppedImageAsset");
      return null;
    }
    if (points.length < 2) {
      report?.("droppedImageGeometry");
      return null;
    }
    if (points.length > 2) points.length = 2;
    const width = Math.abs(points[1].x - points[0].x);
    const height = Math.abs(points[1].y - points[0].y);
    if (width < 0.5 || height < 0.5) {
      report?.("droppedImageGeometry");
      return null;
    }
    image = {
      assetId: raw.image.assetId,
      mode: normalizeImageMode(raw.image.mode),
    };
  }
  const areaShape = raw.kind === "area" ? normalizeAreaShape(raw.areaShape) : undefined;
  if (areaShape === "rectangle" || areaShape === "ellipse") {
    // Quick areas are defined by exactly two opposite points. Trim malformed
    // legacy data instead of inventing a different shape or geometry.
    if (points.length < 2) return null;
    if (points.length > 2) points.length = 2;
  }
  if (raw.kind === "radius" || raw.kind === "diameter" || raw.kind === "slope") {
    if (points.length < 2) return null;
    points.length = 2;
  }
  if (raw.kind === "textbox") {
    if (points.length < 2) {
      report?.("droppedTextboxGeometry");
      return null;
    }
    if (points.length > 2) points.length = 2;
    const width = Math.abs(points[1].x - points[0].x);
    const height = Math.abs(points[1].y - points[0].y);
    if (width < 2 || height < 2) {
      report?.("droppedTextboxGeometry");
      return null;
    }
  }
  if (raw.kind === "polyline") {
    if (points.length < 2) return null;
    if (points.length > 500) points.length = 500;
  }
  if (raw.kind === "rail") {
    if (points.length < 2) return null;
    if (points.length > 2) points.length = 2;
    if (Math.abs(points[1].x - points[0].x) < 1) return null;
  }
  if (raw.kind === "arc" || raw.kind === "angle") {
    if (points.length < 3) return null;
    points.length = 3;
  }
  if (raw.kind === "volume" && points.length < 3) return null;
  if (raw.kind === "cloud" && points.length < 3) return null;
  if (raw.kind === "callout") {
    if (points.length < 2) return null;
    points.length = 2;
  }
  if (raw.kind === "stamp" || raw.kind === "delta") points.length = 1;
  const highlightShape =
    raw.kind === "highlight" ? normalizeHighlightShape(raw.highlightShape) : undefined;
  const arrowHeads: ArrowHeads | undefined =
    raw.kind === "arrow" ? (raw.arrowHeads === "both" ? "both" : "end") : undefined;
  const textOffset =
    raw.kind === "cloud" && isPoint(raw.textOffset) ? { ...raw.textOffset } : undefined;
  const labelOffset = isMeasure && isPoint(raw.labelOffset) ? { ...raw.labelOffset } : undefined;
  const labelAnchor = isMeasure && isPoint(raw.labelAnchor) ? { ...raw.labelAnchor } : undefined;
  const labelSize =
    isMeasure && typeof raw.labelSize === "number" && Number.isFinite(raw.labelSize)
      ? clampLabelSize(raw.labelSize)
      : undefined;
  const labelFit =
    raw.kind === "area" && isLabelFitPosition(raw.labelFit) ? raw.labelFit : undefined;
  const lineStyle: MarkupItem["lineStyle"] =
    (raw.kind === "length" ||
      raw.kind === "radius" ||
      raw.kind === "diameter" ||
      raw.kind === "arc" ||
      raw.kind === "polyline") &&
    raw.lineStyle === "dashed"
      ? "dashed"
      : undefined;
  const cloudRadius =
    raw.kind === "cloud" &&
    typeof raw.cloudRadius === "number" &&
    Number.isFinite(raw.cloudRadius) &&
    raw.cloudRadius > 0
      ? Math.max(2, Math.min(40, raw.cloudRadius))
      : undefined;
  const textBoxWidth =
    (raw.kind === "callout" || raw.kind === "cloud") &&
    typeof raw.textBoxWidth === "number" &&
    Number.isFinite(raw.textBoxWidth) &&
    raw.textBoxWidth > 0
      ? Math.max(20, Math.min(2000, raw.textBoxWidth))
      : undefined;
  const textBoxHeight =
    (raw.kind === "callout" || raw.kind === "cloud") &&
    typeof raw.textBoxHeight === "number" &&
    Number.isFinite(raw.textBoxHeight) &&
    raw.textBoxHeight > 0
      ? Math.max(15, Math.min(2000, raw.textBoxHeight))
      : undefined;
  const depth =
    raw.kind === "volume" &&
    typeof raw.depth === "number" &&
    Number.isFinite(raw.depth) &&
    raw.depth > 0
      ? Math.max(0.001, Math.min(1_000_000, raw.depth))
      : raw.kind === "volume"
        ? 1
        : undefined;
  const textColor =
    raw.kind === "cloud" ||
    raw.kind === "callout" ||
    raw.kind === "stamp" ||
    raw.kind === "delta" ||
    raw.kind === "textbox"
      ? (canonicalColor(raw.textColor) ?? undefined)
      : undefined;
  const textBackground =
    raw.kind === "textbox" && raw.textBackground === "white" ? ("white" as const) : undefined;
  const padding =
    raw.kind === "textbox" &&
    typeof raw.padding === "number" &&
    Number.isFinite(raw.padding) &&
    raw.padding >= 0
      ? Math.min(40, raw.padding)
      : undefined;
  const supportsTextStyle =
    raw.kind === "text" || raw.kind === "cloud" || raw.kind === "callout" || raw.kind === "textbox";
  const textBold = supportsTextStyle && raw.textBold === true ? true : undefined;
  const textItalic = supportsTextStyle && raw.textItalic === true ? true : undefined;
  const textUnderline = supportsTextStyle && raw.textUnderline === true ? true : undefined;
  const textAlign: TextAlign | undefined =
    supportsTextStyle &&
    (raw.textAlign === "left" || raw.textAlign === "center" || raw.textAlign === "right")
      ? raw.textAlign
      : undefined;
  const runs = raw.kind === "textbox" ? normalizeTextRuns(raw.runs) : undefined;
  const text =
    runs && runs.length
      ? runs.map((run) => run.text).join("")
      : typeof raw.text === "string"
        ? raw.text
        : raw.kind === "stamp"
          ? "APPROVED"
          : raw.kind === "callout"
            ? "Callout"
            : raw.kind === "delta"
              ? "A"
              : undefined;
  const fallbackColor = normalizeColor(layerColor, defaultColorForItem(raw.kind));
  const colorFallback =
    raw.kind === "image" ? "#7aa2f7" : raw.kind === "textbox" ? "#1a2024" : fallbackColor;
  const lineTypeId =
    raw.kind === "polyline" && typeof raw.lineTypeId === "string" ? raw.lineTypeId : undefined;
  const rows = raw.kind === "rail" ? normalizeRailRows(raw.rows) : undefined;
  const rowSpacing =
    raw.kind === "rail" && typeof raw.rowSpacing === "number" && Number.isFinite(raw.rowSpacing)
      ? Math.max(2, Math.min(60, raw.rowSpacing))
      : undefined;
  const showBadges = raw.kind === "rail" && raw.showBadges === false ? false : undefined;
  const showLegend = raw.kind === "rail" && raw.showLegend === false ? false : undefined;
  const fontSize =
    typeof raw.fontSize === "number" && Number.isFinite(raw.fontSize) && raw.fontSize > 0
      ? Math.max(0.5, Math.min(300, raw.fontSize))
      : raw.kind === "callout" ||
          raw.kind === "cloud" ||
          raw.kind === "stamp" ||
          raw.kind === "textbox"
        ? 12
        : raw.kind === "delta"
          ? 14
          : undefined;
  const categoryValid = typeof raw.categoryId === "string" && categoryIds.has(raw.categoryId);
  if (isMeasure && !categoryValid) report?.("repairedItemCategory");
  const countTypeValid = typeof raw.countType === "string" && countTypeIds.has(raw.countType);
  if (raw.kind === "count" && !countTypeValid) report?.("repairedItemCountType");
  return {
    id:
      typeof raw.id === "string"
        ? raw.id
        : `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    pageId,
    kind: raw.kind,
    points,
    color:
      raw.kind === "stamp"
        ? stampStatusColor(text, normalizeColor(raw.color, colorFallback))
        : normalizeColor(raw.color, colorFallback),
    strokeWidth: typeof raw.strokeWidth === "number" && raw.strokeWidth > 0 ? raw.strokeWidth : 2,
    fillColor: canonicalColor(raw.fillColor) ?? undefined,
    opacity: typeof raw.opacity === "number" ? Math.max(0, Math.min(1, raw.opacity)) : undefined,
    text,
    label: typeof raw.label === "string" ? raw.label : undefined,
    fontSize,
    rotation:
      typeof raw.rotation === "number" && Number.isFinite(raw.rotation)
        ? ((raw.rotation % 360) + 360) % 360
        : undefined,
    visible: raw.visible !== false,
    locked: raw.locked === true,
    depth,
    scale:
      scale === undefined
        ? undefined
        : scale &&
            typeof scale === "object" &&
            typeof (scale as { pointsPerMeter?: unknown }).pointsPerMeter === "number" &&
            (scale as { pointsPerMeter: number }).pointsPerMeter > 0
          ? {
              pointsPerMeter: (scale as { pointsPerMeter: number }).pointsPerMeter,
              sourceUnit: LENGTH_UNITS.has(
                (scale as { sourceUnit?: LengthUnit }).sourceUnit as LengthUnit,
              )
                ? (scale as { sourceUnit: LengthUnit }).sourceUnit
                : "mm",
            }
          : null,
    categoryId: isMeasure ? (categoryValid ? raw.categoryId : fallbackCategoryId) : undefined,
    room: isMeasure && room ? room : undefined,
    areaMode:
      raw.kind === "area"
        ? raw.areaMode === "subtract"
          ? ("subtract" as AreaMode)
          : "add"
        : undefined,
    areaShape,
    highlightShape,
    arrowHeads,
    textOffset,
    labelOffset,
    labelAnchor,
    labelSize,
    labelFit,
    lineStyle,
    cloudRadius,
    textBoxWidth,
    textBoxHeight,
    textColor,
    textBackground,
    padding,
    textBold,
    textItalic,
    textUnderline,
    textAlign,
    runs,
    lineTypeId,
    rows,
    rowSpacing,
    showBadges,
    showLegend,
    countType: raw.kind === "count" ? (countTypeValid ? raw.countType : "other") : undefined,
    countQuantity:
      raw.kind === "count" &&
      typeof raw.countQuantity === "number" &&
      Number.isFinite(raw.countQuantity)
        ? Math.max(1, Math.min(100000, Math.round(raw.countQuantity))) > 1
          ? Math.max(1, Math.min(100000, Math.round(raw.countQuantity)))
          : undefined
        : undefined,
    symbolId:
      raw.kind === "symbol"
        ? typeof raw.symbolId === "string" && raw.symbolId.trim()
          ? raw.symbolId.trim().slice(0, 120)
          : "unknown"
        : undefined,
    symbolSize:
      raw.kind === "symbol" && typeof raw.symbolSize === "number" && Number.isFinite(raw.symbolSize)
        ? Math.max(SYMBOL_MIN_SIZE, Math.min(SYMBOL_MAX_SIZE, raw.symbolSize))
        : undefined,
    status: raw.kind === "symbol" && isInspectionStatus(raw.status) ? raw.status : undefined,
    tag:
      raw.kind === "symbol" && typeof raw.tag === "string"
        ? raw.tag.replace(/\s+/g, " ").trim().slice(0, 40) || undefined
        : undefined,
    tagOffset:
      raw.kind === "symbol" &&
      raw.tagOffset &&
      typeof raw.tagOffset === "object" &&
      typeof (raw.tagOffset as { x?: unknown }).x === "number" &&
      typeof (raw.tagOffset as { y?: unknown }).y === "number" &&
      Number.isFinite((raw.tagOffset as { x: number }).x) &&
      Number.isFinite((raw.tagOffset as { y: number }).y)
        ? {
            x: Math.max(-2000, Math.min(2000, (raw.tagOffset as { x: number }).x)),
            y: Math.max(-2000, Math.min(2000, (raw.tagOffset as { y: number }).y)),
          }
        : undefined,
    image,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
}

import { measurementCategory, normalizeRoom } from "../../model/categories";
import { pageScale, makeId } from "../../model/calibration";
import { CLOUD_FILL_OPACITY, cloudFillColor } from "../../model/cloud";
import { normalizeColor } from "../../model/color";
import {
  DEFAULT_DRAW_COLOR,
  DEFAULT_MEASURE_COLOR,
  addItem,
  ensureActiveLayer,
  layerKindForItem,
  layerLockedOnPage,
  layerVisibleOnPage,
} from "../../model/layers";
import { defaultRailRows, RAIL_ROW_SPACING } from "../../model/rail";
import { DEFAULT_MEASUREMENT_STROKE_WIDTH } from "../../model/style";
import { stampStatusColor } from "../../model/stamps";
import type {
  AreaShape,
  InspectionStatus,
  ItemKind,
  MarkupItem,
  PageId,
  Point,
} from "../../model/types";
import {
  symbolCategoryColor,
  symbolCategoryOf,
  symbolDefaultSize,
} from "../../features/schematics/symbols/registry";
import { store } from "../../state/store";
import { t } from "../../i18n";
import { toast } from "../../ui/toast";

export interface ItemOptions {
  text?: string;
  areaShape?: AreaShape;
  highlightShape?: "stroke" | "rectangle" | "polygon";
  symbolId?: string;
  status?: InspectionStatus;
}

export interface CreatedItemRef {
  layerId: string;
  itemId: string;
}

export function createItemInStore(
  kind: ItemKind,
  points: Point[],
  options: ItemOptions,
  pageId: PageId,
): CreatedItemRef | null {
  const project = store.project;
  if (!project) return null;
  const layerKind = layerKindForItem(kind);
  const active = project.layers.find(
    (layer) => layer.id === project.activeLayerId && layer.kind === layerKind,
  );
  if (active && (!layerVisibleOnPage(active, pageId) || layerLockedOnPage(active, pageId))) {
    toast(
      t("canvas.layerUnavailable", {
        name: active.name,
        state: layerLockedOnPage(active, pageId)
          ? t("canvas.stateLocked")
          : t("canvas.stateHidden"),
      }),
      "warning",
    );
    return null;
  }
  let layerId = "";
  let itemId = "";
  const scale = pageScale(project, pageId);
  store.mutate((project) => {
    const layer = ensureActiveLayer(project, layerKind, pageId);
    const now = new Date().toISOString();
    const style = store.ui.style;
    const isMeasure = layerKind === "measure";
    const category = isMeasure
      ? measurementCategory(project, store.ui.measureCategoryId)
      : undefined;
    const highlightShape = kind === "highlight" ? (options.highlightShape ?? "stroke") : undefined;
    const shapeLike = kind === "rect" || kind === "ellipse";
    const filledShape = !isMeasure && shapeLike && style.shapeFill === "filled";
    const filled =
      !isMeasure &&
      (filledShape ||
        kind === "stamp" ||
        kind === "delta" ||
        (kind === "highlight" && highlightShape !== "stroke"));
    const textLike =
      kind === "text" ||
      kind === "textbox" ||
      kind === "cloud" ||
      kind === "callout" ||
      kind === "stamp" ||
      kind === "delta";
    const cloudPreset = kind === "cloud" ? cloudFillColor(store.ui.cloudFill) : null;
    const lineLike = kind === "polyline" || kind === "line";
    const lineStyle = lineLike ? store.ui.lineStyle : undefined;
    const drawColor = normalizeColor(style.color, DEFAULT_DRAW_COLOR);
    const measureColor = normalizeColor(layer.color, DEFAULT_MEASURE_COLOR);
    const lineColor = normalizeColor(lineStyle?.color, drawColor);
    const item: MarkupItem = {
      id: makeId("item"),
      pageId,
      kind,
      points: points.map((p) => ({ ...p })),
      color: isMeasure
        ? measureColor
        : kind === "textbox"
          ? "#1a2024"
          : lineLike
            ? lineColor
            : kind === "rail"
              ? "#4a4a4a"
              : kind === "symbol"
                ? symbolCategoryColor(symbolCategoryOf(options.symbolId ?? store.ui.symbolId))
                : kind === "stamp"
                  ? stampStatusColor(options.text ?? store.ui.stampText, drawColor)
                  : (cloudPreset ?? drawColor),
      strokeWidth: isMeasure
        ? DEFAULT_MEASUREMENT_STROKE_WIDTH
        : lineLike
          ? (lineStyle?.widthPt ?? style.strokeWidth)
          : kind === "rail"
            ? 0.6
            : style.strokeWidth,
      fillColor: cloudPreset ?? (filled ? drawColor : undefined),
      opacity:
        !isMeasure &&
        (filledShape ||
          kind === "stamp" ||
          kind === "delta" ||
          cloudPreset !== null ||
          (kind === "highlight" && highlightShape !== "stroke"))
          ? kind === "highlight"
            ? Math.max(0.18, style.fillOpacity)
            : kind === "cloud"
              ? CLOUD_FILL_OPACITY
              : style.fillOpacity
          : kind === "highlight"
            ? 0.35
            : undefined,
      text: options.text,
      textColor: kind === "textbox" ? "#1a2024" : undefined,
      padding: kind === "textbox" ? 4 : undefined,
      lineTypeId: kind === "polyline" ? store.ui.lineTypeId : undefined,
      lineStyle:
        (lineLike && lineStyle?.dashed) || (shapeLike && style.dashed) ? "dashed" : undefined,
      rows: kind === "rail" ? defaultRailRows("plc") : undefined,
      rowSpacing: kind === "rail" ? RAIL_ROW_SPACING : undefined,
      fontSize: textLike ? style.fontSize : undefined,
      highlightShape,
      arrowHeads: kind === "arrow" ? store.ui.arrowHeads : undefined,
      scale: isMeasure && scale ? { ...scale } : null,
      categoryId: category?.id,
      room: isMeasure ? normalizeRoom(store.ui.measureRoom) : undefined,
      depth: kind === "volume" ? 1 : undefined,
      areaMode: kind === "area" ? store.ui.measureAreaMode : undefined,
      areaShape:
        kind === "area" || kind === "volume" ? (options.areaShape ?? "polygon") : undefined,
      countType: kind === "count" ? store.ui.measureCountType : undefined,
      countQuantity:
        kind === "count" && store.ui.measureCountQuantity > 1
          ? store.ui.measureCountQuantity
          : undefined,
      symbolId: kind === "symbol" ? (options.symbolId ?? store.ui.symbolId) : undefined,
      symbolSize:
        kind === "symbol" ? symbolDefaultSize(options.symbolId ?? store.ui.symbolId) : undefined,
      status: kind === "symbol" ? options.status : undefined,
      createdAt: now,
      updatedAt: now,
    };
    addItem(project, layer.id, item);
    layerId = layer.id;
    itemId = item.id;
  }, "change");
  if (!layerId || !itemId) return null;
  store.setSelection({ layerId, itemId });
  return { layerId, itemId };
}

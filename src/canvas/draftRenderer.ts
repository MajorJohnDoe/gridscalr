import { areaCentroid, areaOutline, areaValue, rectangleCorners } from "../model/area";
import { pageScale } from "../model/calibration";
import { cloudFillColor, type CloudFillPreset } from "../model/cloud";
import {
  angleArcPolyline,
  angleValue,
  arcPolyline,
  arrowHeadGeometry,
  distance,
  expandRect,
  measurementValue,
  midpoint,
  polylineLength,
  slopeDegrees,
  slopeValue,
} from "../model/geometry";
import {
  labelBox,
  labelMetrics,
  labelScaleForSize,
  LABEL_CALIBRATION_OFFSET,
  LABEL_LINE_OFFSET,
  LABEL_PRIMARY_SIZE,
} from "../model/label";
import { measureLabelText } from "../model/labelFont";
import { previewLabelLayout, type LabelLayout } from "../model/labelLayout";
import { measurementLayerColor } from "../model/layers";
import { TEXT_FONT_STACK } from "../model/text";
import type { AreaShape, ArrowHeads, MarkupItem, PageSize, Point, Project } from "../model/types";
import {
  formatArea,
  formatLength,
  formatNumber,
  volumeInUnit,
  volumeUnitLabel,
} from "../model/units";
import { drawArrowHead, hexAlpha } from "./geometry";

export const CALIBRATION_COLOR = "#a78bfa";

export type Draft =
  | { kind: "calibrate"; points: Point[]; cursor: Point }
  | { kind: "length"; points: Point[]; cursor: Point }
  | { kind: "radius" | "diameter" | "slope"; points: Point[]; cursor: Point }
  | { kind: "arc" | "angle"; points: Point[]; cursor: Point }
  | { kind: "volume"; points: Point[]; cursor: Point }
  | { kind: "area"; points: Point[]; cursor: Point }
  | { kind: "pen"; points: Point[]; cursor: Point }
  | { kind: "highlight"; points: Point[]; cursor: Point }
  | { kind: "highlight-polygon"; points: Point[]; cursor: Point }
  | { kind: "cloud"; points: Point[]; cursor: Point }
  | { kind: "callout"; start: Point; current: Point }
  | { kind: "line"; start: Point; current: Point }
  | { kind: "arrow"; start: Point; current: Point }
  | { kind: "rect"; start: Point; current: Point }
  | { kind: "ellipse"; start: Point; current: Point }
  | { kind: "highlight-rect"; start: Point; current: Point }
  | { kind: "area-rect"; start: Point; current: Point }
  | { kind: "area-ellipse"; start: Point; current: Point };

export interface DraftStyle {
  color: string;
  strokeWidth: number;
  fillOpacity: number;
  fontSize: number;
}

export interface DraftColorInput {
  measureColor: string;
  calibrationColor: string;
  cloudFill: CloudFillPreset;
  styleColor: string;
}

export interface DraftColors {
  stroke: string;
  fill: string;
}

/** Palette decisions for a draft, shared by the canvas and direct tests. */
export function draftColors(draft: Draft, input: DraftColorInput): DraftColors {
  const stroke =
    draft.kind === "calibrate"
      ? input.calibrationColor
      : draft.kind === "cloud"
        ? (cloudFillColor(input.cloudFill) ?? input.styleColor)
        : draft.kind === "highlight-polygon"
          ? input.styleColor
          : input.measureColor;
  const fill = draft.kind === "highlight-polygon" ? input.styleColor : input.measureColor;
  return { stroke, fill };
}

export interface DraftScene {
  draft: Draft;
  project: Project;
  viewPage: number;
  zoom: number;
  pageSize: PageSize | undefined;
  toScreen: (point: Point) => Point;
  style: DraftStyle;
  cloudFill: CloudFillPreset;
  arrowHeads: ArrowHeads;
  paintLabel: (layout: LabelLayout) => void;
}

function drawPreviewLabel(
  scene: DraftScene,
  text: string,
  anchor: Point,
  color: string,
  secondary?: string,
): void {
  const scale = labelScaleForSize(scene.project.settings.labelSize ?? LABEL_PRIMARY_SIZE);
  const metrics = labelMetrics(scale);
  const primaryWidth = measureLabelText(text, metrics.primarySize, "bold");
  const secondaryWidth = secondary
    ? measureLabelText(secondary, metrics.secondarySize, "regular")
    : 0;
  scene.paintLabel({
    id: "preview",
    text,
    secondary,
    color,
    box: labelBox(anchor, primaryWidth, secondaryWidth, secondary, scale),
    metrics,
    placement: "center",
  });
}

/**
 * Draws a measurement preview through the same layout rules as the saved
 * label. The item points are page-space, never screen-space.
 */
function drawMeasurePreviewLabel(
  scene: DraftScene,
  item: MarkupItem,
  text: string,
  color: string,
  secondary?: string,
): void {
  if (!scene.pageSize) return;
  scene.paintLabel(
    previewLabelLayout(
      item,
      text,
      {
        pageSize: scene.pageSize,
        measure: measureLabelText,
        labelSize: scene.project.settings.labelSize,
      },
      color,
      secondary,
    ),
  );
}

/** Paints every draft kind in screen space. Pointer state stays in CanvasView. */
export function drawDraft(ctx: CanvasRenderingContext2D, scene: DraftScene): void {
  const draft = scene.draft;
  const zoom = scene.zoom;
  const project = scene.project;
  const scale = pageScale(project, scene.viewPage);
  const unit = project.settings.lengthUnit;
  const areaUnit = project.settings.areaUnit;
  const measureColor = measurementLayerColor(project, scene.viewPage);
  const colors = draftColors(draft, {
    measureColor,
    calibrationColor: CALIBRATION_COLOR,
    cloudFill: scene.cloudFill,
    styleColor: scene.style.color,
  });

  if (
    draft.kind === "calibrate" ||
    draft.kind === "length" ||
    draft.kind === "area" ||
    draft.kind === "volume" ||
    draft.kind === "cloud" ||
    draft.kind === "highlight-polygon"
  ) {
    const points = draft.points.map((p) => scene.toScreen(p));
    const cursor = scene.toScreen(draft.cursor);
    ctx.save();
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    if (points.length > 1) {
      ctx.beginPath();
      points.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      if (
        (draft.kind === "area" ||
          draft.kind === "volume" ||
          draft.kind === "cloud" ||
          draft.kind === "highlight-polygon") &&
        points.length >= 3
      ) {
        ctx.closePath();
      }
      ctx.stroke();
    }
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    const last = points[points.length - 1];
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(cursor.x, cursor.y);
    ctx.stroke();
    ctx.setLineDash([]);

    if (
      (draft.kind === "area" || draft.kind === "volume" || draft.kind === "highlight-polygon") &&
      points.length >= 2
    ) {
      const pagePoints = draft.points;
      const preview = [...pagePoints, draft.cursor];
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = colors.fill;
      ctx.beginPath();
      preview.forEach((p, index) => {
        const s = scene.toScreen(p);
        if (index === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      if (preview.length >= 3 && draft.kind === "area") {
        drawPreviewLabel(
          scene,
          formatArea(areaValue(preview, "polygon"), scale, areaUnit),
          areaCentroid(preview, "polygon"),
          measureColor,
        );
      } else if (preview.length >= 3 && draft.kind === "volume") {
        const volume = volumeInUnit(
          areaValue(preview, "polygon"),
          scale?.pointsPerMeter ?? 1,
          areaUnit,
          1,
          unit,
        );
        drawPreviewLabel(
          scene,
          `${formatNumber(volume, 2)} ${volumeUnitLabel(areaUnit)}`,
          areaCentroid(preview, "polygon"),
          measureColor,
        );
      }
    } else if (draft.kind === "length" && points.length >= 1) {
      const preview = [...draft.points, draft.cursor];
      const a = preview[preview.length - 2];
      const b = preview[preview.length - 1];
      const mid = midpoint(a, b);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      drawPreviewLabel(
        scene,
        formatLength(polylineLength(preview), scale, unit, project.settings.smartLengthUnits),
        {
          x: mid.x - (dy / length) * LABEL_LINE_OFFSET,
          y: mid.y + (dx / length) * LABEL_LINE_OFFSET,
        },
        measureColor,
      );
    } else if (draft.kind === "calibrate") {
      const a = draft.points[0];
      const b = draft.cursor;
      const mid = midpoint(a, b);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy) || 1;
      drawPreviewLabel(
        scene,
        `${formatNumber(distance(a, b), 1)} pt`,
        {
          x: mid.x + (dy / length) * LABEL_CALIBRATION_OFFSET,
          y: mid.y - (dx / length) * LABEL_CALIBRATION_OFFSET,
        },
        CALIBRATION_COLOR,
      );
    }

    ctx.fillStyle = "#f7fbfc";
    ctx.strokeStyle = colors.stroke;
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (draft.kind === "radius" || draft.kind === "diameter" || draft.kind === "arc") {
    const points = draft.points.map((point) => scene.toScreen(point));
    const cursor = scene.toScreen(draft.cursor);
    const fake = {
      kind: draft.kind,
      points: [...draft.points, draft.cursor],
    } as MarkupItem;
    ctx.save();
    ctx.strokeStyle = measureColor;
    ctx.lineWidth = 1.6;
    if (draft.kind === "arc") {
      const curve = arcPolyline(fake).map((point) => scene.toScreen(point));
      ctx.beginPath();
      curve.forEach((point, index) =>
        index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
      );
      ctx.stroke();
    } else {
      const center = points[0];
      const radius = Math.hypot(cursor.x - center.x, cursor.y - center.y);
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(cursor.x, cursor.y);
      ctx.stroke();
    }
    const value = measurementValue(fake);
    if (value !== null) {
      const prefix = draft.kind === "radius" ? "R " : draft.kind === "diameter" ? "Ø " : "Arc ";
      drawMeasurePreviewLabel(
        scene,
        fake,
        `${prefix}${formatLength(value, scale, unit, project.settings.smartLengthUnits)}`,
        measureColor,
      );
    }
    ctx.fillStyle = "#f7fbfc";
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (draft.kind === "slope" || draft.kind === "angle") {
    const start = scene.toScreen(draft.points[0]);
    const cursor = scene.toScreen(draft.cursor);
    const fake = {
      kind: draft.kind,
      points: [...draft.points, draft.cursor],
    } as MarkupItem;
    ctx.save();
    ctx.strokeStyle = measureColor;
    ctx.lineWidth = 1.6;
    if (draft.kind === "slope") {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(cursor.x, cursor.y);
      ctx.stroke();
      drawMeasurePreviewLabel(
        scene,
        fake,
        `${formatNumber(slopeValue(fake) ?? 0, 1)}%`,
        measureColor,
        `${formatNumber(slopeDegrees(fake) ?? 0, 1)}°`,
      );
    } else {
      const vertex = draft.points[1] !== undefined ? scene.toScreen(draft.points[1]) : cursor;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(vertex.x, vertex.y);
      ctx.stroke();
      if (draft.points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(vertex.x, vertex.y);
        ctx.lineTo(cursor.x, cursor.y);
        ctx.stroke();
        const curve = angleArcPolyline({
          kind: "angle",
          points: [draft.points[0], draft.points[1], draft.cursor],
        } as MarkupItem).map((point) => scene.toScreen(point));
        if (curve.length > 1) {
          ctx.beginPath();
          curve.forEach((point, index) =>
            index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
          );
          ctx.stroke();
        }
        drawMeasurePreviewLabel(
          scene,
          fake,
          `${formatNumber(angleValue(fake) ?? 0, 1)}°`,
          measureColor,
        );
      }
    }
    ctx.fillStyle = "#f7fbfc";
    for (const point of [start, cursor]) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  if (draft.kind === "area-rect" || draft.kind === "area-ellipse") {
    const shape: AreaShape = draft.kind === "area-rect" ? "rectangle" : "ellipse";
    const pagePoints = [draft.start, draft.current];
    const outline = areaOutline(pagePoints, shape).map((point) => scene.toScreen(point));
    ctx.save();
    ctx.strokeStyle = measureColor;
    ctx.fillStyle = hexAlpha(measureColor, 0.1);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    outline.forEach((point, index) =>
      index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    if (shape !== "ellipse") {
      const corners = rectangleCorners(pagePoints).map((point) => scene.toScreen(point));
      ctx.fillStyle = "#f7fbfc";
      for (const point of corners) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    drawPreviewLabel(
      scene,
      formatArea(areaValue(pagePoints, shape), scale, areaUnit),
      areaCentroid(pagePoints, shape),
      measureColor,
    );
    ctx.restore();
    return;
  }

  if (draft.kind === "pen" || draft.kind === "highlight") {
    const points = draft.points.map((p) => scene.toScreen(p));
    ctx.save();
    ctx.strokeStyle =
      draft.kind === "highlight" ? hexAlpha(scene.style.color, 0.4) : scene.style.color;
    ctx.lineWidth =
      draft.kind === "highlight"
        ? scene.style.strokeWidth * zoom * 4
        : scene.style.strokeWidth * zoom;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    points.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();
    return;
  }

  const shapeDraft = draft as Extract<Draft, { start: Point; current: Point }>;
  const start = scene.toScreen(shapeDraft.start);
  const current = scene.toScreen(shapeDraft.current);
  ctx.save();
  ctx.strokeStyle = scene.style.color;
  ctx.fillStyle = hexAlpha(scene.style.color, scene.style.fillOpacity);
  ctx.lineWidth = Math.max(1, scene.style.strokeWidth * zoom);
  ctx.lineCap = "round";
  if (draft.kind === "line" || draft.kind === "arrow") {
    const head = draft.kind === "arrow" ? arrowHeadGeometry(start, current, 10) : null;
    const startHead =
      draft.kind === "arrow" && scene.arrowHeads === "both"
        ? arrowHeadGeometry(current, start, 10)
        : null;
    ctx.beginPath();
    ctx.moveTo(
      startHead ? startHead.shaftEnd.x : start.x,
      startHead ? startHead.shaftEnd.y : start.y,
    );
    ctx.lineTo(head ? head.shaftEnd.x : current.x, head ? head.shaftEnd.y : current.y);
    ctx.stroke();
    if (startHead) drawArrowHead(ctx, start, startHead, scene.style.color);
    if (head) drawArrowHead(ctx, current, head, scene.style.color);
  } else if (draft.kind === "rect" || draft.kind === "highlight-rect") {
    const rect = expandRect(start, current);
    if (draft.kind === "highlight-rect") {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
    } else {
      if (scene.style.fillOpacity > 0) ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }
  } else if (draft.kind === "ellipse") {
    const rect = expandRect(start, current);
    ctx.beginPath();
    ctx.ellipse(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      Math.max(0.5, rect.width / 2),
      Math.max(0.5, rect.height / 2),
      0,
      0,
      Math.PI * 2,
    );
    if (scene.style.fillOpacity > 0) ctx.fill();
    ctx.stroke();
  } else if (draft.kind === "callout") {
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(current.x, current.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const width = 76;
    const height = 24;
    ctx.fillStyle = "rgba(12, 16, 18, 0.9)";
    ctx.fillRect(current.x - width / 2, current.y - height / 2, width, height);
    ctx.strokeRect(current.x - width / 2, current.y - height / 2, width, height);
    ctx.fillStyle = scene.style.color;
    ctx.font = `600 ${Math.max(9, scene.style.fontSize * zoom)}px ${TEXT_FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Callout", current.x, current.y);
  }
  ctx.restore();
}

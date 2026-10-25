import { closestPointOnPolygon } from "../model/annotations";
import { arrowHeadGeometry } from "../model/geometry";
import type { LabelBox, LabelMetrics } from "../model/label";
import type { LabelLayout } from "../model/labelLayout";
import { LABEL_FONT_STACK } from "../model/labelFont";
import {
  TEXT_FONT_STACK,
  TEXT_UNDERLINE_OFFSET,
  TEXT_UNDERLINE_WIDTH,
  textLineX,
} from "../model/text";
import type { MarkupItem, Point } from "../model/types";
import { closestPointOnBox, drawArrowHead, hexAlpha, roundRect } from "./geometry";

const FONT_STACK = TEXT_FONT_STACK;

type ToScreen = (point: Point) => Point;

export function drawTrackedLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  tracking: number,
): void {
  const characters = [...text];
  const widths = characters.map((character) => ctx.measureText(character).width);
  const total =
    widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(0, characters.length - 1);
  let x = centerX - total / 2;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  characters.forEach((character, index) => {
    ctx.fillText(character, x, centerY);
    x += widths[index] + tracking;
  });
  ctx.textAlign = "center";
}

export function drawAnnotationPanel(
  ctx: CanvasRenderingContext2D,
  layout: {
    center: Point;
    width: number;
    height: number;
    lines: string[];
    fontSize: number;
    lineHeight: number;
    padding: number;
  },
  item: MarkupItem,
  fill: string,
  textColor: string,
  leader: boolean,
  style: "text" | "stamp",
  toScreen: ToScreen,
  zoom: number,
): void {
  const center = toScreen(layout.center);
  const width = layout.width * zoom;
  const height = layout.height * zoom;
  const x = center.x - width / 2;
  const y = center.y - height / 2;
  const isStamp = style === "stamp";
  const bold = isStamp || item.textBold === true;
  const align = isStamp ? "center" : (item.textAlign ?? "center");
  const padding = layout.padding * zoom;
  const contentLeft = x + padding;
  const contentWidth = Math.max(0, width - padding * 2);
  ctx.save();
  if (leader && item.kind === "cloud" && item.points.length) {
    const targetPage = closestPointOnPolygon(item.points, layout.center);
    const boxPage = {
      x: layout.center.x - layout.width / 2,
      y: layout.center.y - layout.height / 2,
      width: layout.width,
      height: layout.height,
    };
    const edgePage = closestPointOnBox(boxPage, targetPage);
    const target = toScreen(targetPage);
    const edge = toScreen(edgePage);
    const head = arrowHeadGeometry(edge, target, 6);
    ctx.strokeStyle = item.color;
    ctx.lineWidth = Math.max(0.6, item.strokeWidth * zoom);
    ctx.beginPath();
    ctx.moveTo(edge.x, edge.y);
    ctx.lineTo(head.shaftEnd.x, head.shaftEnd.y);
    ctx.stroke();
    drawArrowHead(ctx, target, head, item.color);
  }
  ctx.fillStyle = fill;
  ctx.strokeStyle = item.color;
  ctx.lineWidth = Math.max(0.8, item.strokeWidth * zoom);
  roundRect(ctx, x, y, width, height, Math.min(5, height / 4));
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = textColor;
  const fontSize = Math.max(6, layout.fontSize * zoom);
  ctx.font = `${bold ? 700 : 400} ${fontSize}px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const lineHeight = layout.lineHeight * zoom;
  const startY = center.y - ((layout.lines.length - 1) * lineHeight) / 2;
  layout.lines.forEach((line, index) => {
    const lineY = startY + index * lineHeight;
    if (isStamp) {
      drawTrackedLine(ctx, line, center.x, lineY, fontSize * 0.08);
      return;
    }
    const lineWidth = ctx.measureText(line).width;
    const lineX = contentLeft + textLineX(align, 0, contentWidth, lineWidth);
    ctx.fillText(line, lineX, lineY);
    if (item.textUnderline) {
      ctx.strokeStyle = textColor;
      ctx.lineWidth = Math.max(0.5, fontSize * TEXT_UNDERLINE_WIDTH);
      const underlineY = lineY + fontSize * (0.35 + TEXT_UNDERLINE_OFFSET);
      ctx.beginPath();
      ctx.moveTo(lineX, underlineY);
      ctx.lineTo(lineX + lineWidth, underlineY);
      ctx.stroke();
    }
  });
  ctx.restore();
}

export function drawEndpoints(ctx: CanvasRenderingContext2D, points: Point[], color: string): void {
  if (points.length > 26) return;
  ctx.save();
  ctx.fillStyle = "#101518";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function drawLabelLayout(
  ctx: CanvasRenderingContext2D,
  layout: LabelLayout,
  toScreen: ToScreen,
  labelScreenScale: (metrics: LabelMetrics) => number,
  screenLabelBox: (box: LabelBox, metrics: LabelMetrics) => LabelBox,
): void {
  const screenScale = labelScreenScale(layout.metrics);
  const box = screenLabelBox(layout.box, layout.metrics);
  const borderWidth = Math.max(0.5, Math.min(1, layout.metrics.borderWidth * screenScale));
  const leaderWidth = Math.max(0.5, Math.min(1, layout.metrics.leaderWidth * screenScale));
  ctx.save();

  if (layout.leader) {
    const to = toScreen(layout.leader.to);
    const from = closestPointOnBox(box, to);
    ctx.strokeStyle = hexAlpha(layout.color, 0.5);
    ctx.lineWidth = leaderWidth;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(12, 16, 18, 0.82)";
  ctx.strokeStyle = hexAlpha(layout.color, 0.55);
  ctx.lineWidth = borderWidth;
  roundRect(
    ctx,
    box.x,
    box.y,
    box.width,
    box.height,
    Math.max(0.5, layout.metrics.radius * screenScale),
  );
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#edf3f5";
  ctx.font = `700 ${Math.max(0.1, layout.metrics.primarySize * screenScale)}px ${LABEL_FONT_STACK}`;
  ctx.fillText(layout.text, box.x + box.width / 2, box.primaryCenterY);
  if (layout.secondary) {
    ctx.fillStyle = "rgba(210, 222, 227, 0.68)";
    ctx.font = `400 ${Math.max(0.1, layout.metrics.secondarySize * screenScale)}px ${LABEL_FONT_STACK}`;
    ctx.fillText(
      layout.secondary,
      box.x + box.width / 2,
      box.secondaryCenterY ?? box.primaryCenterY,
    );
  }
  ctx.restore();
}

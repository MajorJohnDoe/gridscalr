import { countTypeGlyph } from "../features/countTypes/model";
import {
  inspectionStatusColor,
  symbolCategoryColor,
  symbolFor,
  symbolRenderPlan,
  symbolShapeStrokeWidth,
  symbolSizeOf,
} from "../features/schematics/symbols/registry";
import { calloutLayout, cloudLabelLayout, deltaLayout, stampLayout } from "../model/annotations";
import { rectangleCorners } from "../model/area";
import { cloudCurves, cloudRadiusForPoints } from "../model/cloud";
import { countSymbol } from "../model/countSymbols";
import { arrowHeadGeometry, expandRect } from "../model/geometry";
import { imageAssetForItem, imageOpacity } from "../model/images";
import { railGeometry, railLegendY } from "../model/rail";
import { layoutRichText, runsText, textRunDefaults } from "../model/richText";
import {
  TEXT_FONT_STACK,
  TEXT_UNDERLINE_OFFSET,
  TEXT_UNDERLINE_WIDTH,
  clampTextSize,
  textItemLayout,
  textLineX,
  wrapText,
} from "../model/text";
import type { MarkupItem } from "../model/types";
import { drawEndpoints } from "./annotationDraw";
import { drawArrowHead, hexAlpha, roundRect } from "./geometry";
import { symbolPath } from "./symbolPath";
import { FONT_STACK, type ItemRenderState } from "./items/context";

/**
 * Temporary holder for the item families that have not been moved into
 * `src/canvas/items/` yet. Removed by item-renderer step I6.
 */
export function drawRemainingItem(
  ctx: CanvasRenderingContext2D,
  item: MarkupItem,
  state: ItemRenderState,
): void {
  const { context, points, zoom, lineWidth, drawPanel } = state;

  // Temporary partial switch while the remaining families are extracted.
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- partial family switch
  switch (item.kind) {
    case "count": {
      const anchorPage = item.points[0];
      if (!anchorPage) break;
      const project = context.project;
      if (!project) break;
      const symbol = countSymbol(countTypeGlyph(project, item.countType));
      for (const path of symbol.paths) {
        ctx.beginPath();
        path.points.forEach((point, index) => {
          const screen = context.toScreen({ x: anchorPage.x + point.x, y: anchorPage.y + point.y });
          if (index === 0) ctx.moveTo(screen.x, screen.y);
          else ctx.lineTo(screen.x, screen.y);
        });
        if (path.closed) ctx.closePath();
        ctx.stroke();
      }
      for (const dot of symbol.dots) {
        const center = context.toScreen({
          x: anchorPage.x + dot.center.x,
          y: anchorPage.y + dot.center.y,
        });
        ctx.beginPath();
        ctx.arc(center.x, center.y, Math.max(0.6, dot.radius * zoom), 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "symbol": {
      const anchor = points[0];
      if (!anchor) break;
      const definition = symbolFor(item.symbolId);
      const accent =
        definition.style === "schematic"
          ? "#111111"
          : definition.id === "unknown"
            ? item.color
            : symbolCategoryColor(definition.category);
      const plan = symbolRenderPlan(definition, accent);
      const size = symbolSizeOf(item);
      const scale = (size * zoom) / plan.viewBox;
      const half = plan.viewBox / 2;
      ctx.save();
      ctx.translate(anchor.x, anchor.y);
      ctx.scale(scale, scale);
      ctx.translate(-half, -half);
      for (const shape of plan.shapes) {
        ctx.save();
        if (shape.scale !== 1) {
          ctx.translate(half, half);
          ctx.scale(shape.scale, shape.scale);
          ctx.translate(-half, -half);
        }
        const path = symbolPath(shape.d);
        if (shape.fill) {
          ctx.fillStyle = shape.fill;
          ctx.fill(path, shape.fillRule);
        }
        if (shape.stroke) {
          ctx.strokeStyle = shape.stroke;
          // Page-space width converted to local units: the stroke scales with
          // zoom exactly like the PDF export and the rest of the canvas.
          ctx.lineWidth = (symbolShapeStrokeWidth(plan, shape, size) * plan.viewBox) / size;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.stroke(path);
        }
        ctx.restore();
      }
      if (item.status) {
        ctx.beginPath();
        ctx.arc(plan.badge.x, plan.badge.y, plan.badge.r + 1.4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(15, 19, 21, 0.85)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(plan.badge.x, plan.badge.y, plan.badge.r + 0.7, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(plan.badge.x, plan.badge.y, plan.badge.r, 0, Math.PI * 2);
        ctx.fillStyle = inspectionStatusColor(item.status);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case "pen": {
      ctx.beginPath();
      points.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      break;
    }
    case "highlight": {
      if (item.highlightShape && item.highlightShape !== "stroke") {
        const outline =
          item.highlightShape === "rectangle" ? rectangleCorners([points[0], points[1]]) : points;
        ctx.save();
        ctx.globalAlpha *= item.opacity ?? 0.3;
        ctx.fillStyle = item.color;
        ctx.beginPath();
        outline.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      ctx.save();
      ctx.globalAlpha *= 0.38;
      ctx.lineWidth = lineWidth * 4.2;
      ctx.lineCap = "butt";
      ctx.beginPath();
      points.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
      break;
    }
    case "line": {
      if (points.length < 2) break;
      if (item.lineStyle === "dashed") {
        ctx.setLineDash([Math.max(3, lineWidth * 3), Math.max(2, lineWidth * 2)]);
      }
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
      ctx.setLineDash([]);
      drawEndpoints(ctx, points, item.color, lineWidth);
      break;
    }
    case "arrow": {
      if (points.length < 2) break;
      const size = Math.max(8, lineWidth * 3.6);
      const head = arrowHeadGeometry(points[0], points[1], size);
      const startHead =
        item.arrowHeads === "both" ? arrowHeadGeometry(points[1], points[0], size) : null;
      ctx.save();
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo((startHead?.shaftEnd ?? points[0]).x, (startHead?.shaftEnd ?? points[0]).y);
      ctx.lineTo(head.shaftEnd.x, head.shaftEnd.y);
      ctx.stroke();
      ctx.restore();
      if (startHead) drawArrowHead(ctx, points[0], startHead, item.color);
      drawArrowHead(ctx, points[1], head, item.color);
      break;
    }
    case "rect": {
      if (points.length < 2) break;
      const rect = expandRect(points[0], points[1]);
      if (item.fillColor) {
        ctx.save();
        ctx.globalAlpha *= item.opacity ?? 0.15;
        ctx.fillStyle = item.fillColor;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.restore();
      }
      if (item.lineStyle === "dashed") {
        ctx.setLineDash([Math.max(4, lineWidth * 3), Math.max(3, lineWidth * 2)]);
      }
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      ctx.setLineDash([]);
      break;
    }
    case "ellipse": {
      if (points.length < 2) break;
      const rect = expandRect(points[0], points[1]);
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
      if (item.fillColor) {
        ctx.save();
        ctx.globalAlpha *= item.opacity ?? 0.15;
        ctx.fillStyle = item.fillColor;
        ctx.fill();
        ctx.restore();
      }
      if (item.lineStyle === "dashed") {
        ctx.setLineDash([Math.max(4, lineWidth * 3), Math.max(3, lineWidth * 2)]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "cloud": {
      const curves = cloudCurves(
        item.points,
        item.cloudRadius ?? cloudRadiusForPoints(item.points),
      );
      if (!curves.length) break;
      const pathStart = context.toScreen(curves[0].start);
      ctx.save();
      if (item.fillColor) {
        ctx.save();
        ctx.globalAlpha *= item.opacity ?? 0.12;
        ctx.fillStyle = item.fillColor;
        ctx.beginPath();
        ctx.moveTo(pathStart.x, pathStart.y);
        for (const curve of curves) {
          const cp1 = context.toScreen(curve.cp1);
          const cp2 = context.toScreen(curve.cp2);
          const end = context.toScreen(curve.end);
          ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.moveTo(pathStart.x, pathStart.y);
      for (const curve of curves) {
        const cp1 = context.toScreen(curve.cp1);
        const cp2 = context.toScreen(curve.cp2);
        const end = context.toScreen(curve.end);
        ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
      const label = cloudLabelLayout(item);
      if (label && context.editors.editingItemId !== item.id) {
        drawPanel(ctx, label, item, "rgba(12, 16, 18, 0.9)", item.textColor ?? "#f7fbfc", true);
      }
      break;
    }
    case "callout": {
      const liveCallout =
        context.editors.textSession &&
        context.editors.textSession.itemId === item.id &&
        context.editors.textSession.mode === "callout"
          ? {
              ...item,
              text: context.editors.textSession.text,
              fontSize: context.editors.textSession.fontSize,
              textBoxWidth: context.editors.textSession.boxWidth,
              textBoxHeight: context.editors.textSession.boxHeight,
            }
          : item;
      const layout = calloutLayout(liveCallout);
      const anchor = context.toScreen(layout.anchor);
      const leaderStart = context.toScreen(layout.leaderStart);
      const size = Math.max(8, lineWidth * 3.6);
      const head = arrowHeadGeometry(leaderStart, anchor, size);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(leaderStart.x, leaderStart.y);
      ctx.lineTo(head.shaftEnd.x, head.shaftEnd.y);
      ctx.stroke();
      drawArrowHead(ctx, anchor, head, item.color);
      ctx.restore();
      if (context.editors.editingItemId !== item.id) {
        drawPanel(
          ctx,
          {
            ...layout,
            center: {
              x: layout.box.x + layout.box.width / 2,
              y: layout.box.y + layout.box.height / 2,
            },
          },
          item,
          "rgba(12, 16, 18, 0.92)",
          item.textColor ?? "#f7fbfc",
          false,
        );
      }
      break;
    }
    case "stamp": {
      const layout = stampLayout(item);
      drawPanel(
        ctx,
        layout,
        item,
        hexAlpha(item.color, Math.max(0.12, item.opacity ?? 0.12)),
        item.textColor ?? item.color,
        true,
        "stamp",
      );
      break;
    }
    case "delta": {
      const layout = deltaLayout(item);
      const size = layout.size * zoom;
      const center = context.toScreen(layout.center);
      ctx.save();
      ctx.save();
      ctx.globalAlpha *= item.opacity ?? 0.16;
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - size / 2);
      ctx.lineTo(center.x + size / 2, center.y + size / 2);
      ctx.lineTo(center.x - size / 2, center.y + size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(center.x, center.y - size / 2);
      ctx.lineTo(center.x + size / 2, center.y + size / 2);
      ctx.lineTo(center.x - size / 2, center.y + size / 2);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = item.textColor ?? item.color;
      ctx.font = `700 ${Math.max(7, (item.fontSize ?? 14) * zoom * 0.7)}px ${TEXT_FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.text || "", center.x, center.y + size * 0.12);
      if (item.label) {
        ctx.font = `500 ${Math.max(6, (item.fontSize ?? 14) * zoom * 0.38)}px ${TEXT_FONT_STACK}`;
        ctx.fillText(item.label, center.x, center.y + size * 0.62);
      }
      ctx.restore();
      break;
    }
    case "polyline": {
      ctx.beginPath();
      points.forEach((point, index) =>
        index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
      );
      if (item.lineStyle === "dashed") {
        ctx.setLineDash([Math.max(4, lineWidth * 3), Math.max(3, lineWidth * 2)]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    case "rail": {
      const geometry = railGeometry(item);
      if (!geometry) break;
      const left = context.toScreen({ x: geometry.left, y: geometry.top });
      const right = context.toScreen({ x: geometry.right, y: geometry.top });
      const width = Math.max(0.5, item.strokeWidth * zoom);
      ctx.strokeStyle = item.color;
      ctx.lineWidth = width;

      for (const row of geometry.rows) {
        const y = context.toScreen({ x: geometry.left, y: row.y }).y;
        ctx.beginPath();
        ctx.moveTo(left.x, y);
        ctx.lineTo(right.x, y);
        ctx.stroke();

        if (item.showBadges !== false) {
          const fontSize = Math.max(5, 6.5 * zoom);
          const badgeHeight = Math.max(8, geometry.rowSpacing * zoom * 0.82);
          const padding = Math.max(2, 3 * zoom);
          ctx.font = `600 ${fontSize}px ${FONT_STACK}`;
          const textWidth = ctx.measureText(row.label).width;
          const badgeWidth = textWidth + padding * 2;
          ctx.save();
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = item.color;
          ctx.lineWidth = Math.max(0.6, 0.8 * zoom);
          roundRect(ctx, left.x, y - badgeHeight / 2, badgeWidth, badgeHeight, badgeHeight / 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          ctx.fillStyle = "#1a2024";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(row.label, left.x + padding, y);
        }
      }

      const legends = geometry.rows.filter((row) => row.legend?.trim());
      if (item.showLegend !== false && legends.length) {
        const y = context.toScreen({ x: geometry.left, y: railLegendY(geometry) }).y;
        const step = (right.x - left.x) / Math.max(1, legends.length);
        const fontSize = Math.max(5, 6 * zoom);
        ctx.font = `400 ${fontSize}px ${FONT_STACK}`;
        ctx.fillStyle = "#1a2024";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        legends.forEach((row, index) => {
          ctx.fillText(`${row.label}= ${row.legend}`, left.x + index * step, y);
        });
      }
      break;
    }
    case "textbox": {
      if (points.length < 2) break;
      const rect = expandRect(points[0], points[1]);
      const fontSize = Math.max(0.3, clampTextSize(item.fontSize ?? 12) * zoom);
      const padding = Math.max(0, (item.padding ?? 4) * zoom);
      const lineHeight = fontSize * 1.28;
      const color = item.textColor ?? item.color;
      ctx.font = `${item.textItalic ? "italic " : ""}${item.textBold ? 700 : 400} ${fontSize}px ${FONT_STACK}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      if (item.textBackground === "white") {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      }

      const innerWidth = Math.max(1, rect.width - padding * 2);
      const richRuns =
        item.runs?.length && runsText(item.runs) === (item.text ?? "") ? item.runs : null;
      let usedHeight: number;
      if (richRuns) {
        const measure = (text: string, run: { size: number; bold: boolean; italic: boolean }) => {
          ctx.font = `${run.italic ? "italic " : ""}${run.bold ? 700 : 400} ${Math.max(0.3, run.size * zoom)}px ${FONT_STACK}`;
          return ctx.measureText(text).width;
        };
        const layout = layoutRichText(richRuns, innerWidth, measure, textRunDefaults(item));
        const richLineHeight = layout.lineHeight * zoom;
        layout.lines.forEach((line, index) => {
          let x = rect.x + padding + textLineX(item.textAlign ?? "left", 0, innerWidth, line.width);
          const y = rect.y + padding + index * richLineHeight;
          for (const segment of line.segments) {
            if (!segment.text) continue;
            const size = Math.max(0.3, segment.run.size * zoom);
            ctx.font = `${segment.run.italic ? "italic " : ""}${segment.run.bold ? 700 : 400} ${size}px ${FONT_STACK}`;
            ctx.fillStyle = segment.run.color;
            ctx.fillText(segment.text, x, y);
            if (segment.run.underline) {
              ctx.strokeStyle = segment.run.color;
              ctx.lineWidth = Math.max(0.5, size * TEXT_UNDERLINE_WIDTH);
              const underlineY = y + size * (0.86 + TEXT_UNDERLINE_OFFSET);
              ctx.beginPath();
              ctx.moveTo(x, underlineY);
              ctx.lineTo(x + segment.width, underlineY);
              ctx.stroke();
            }
            x += segment.width;
          }
        });
        usedHeight = layout.lines.length * richLineHeight;
      } else {
        const lines = wrapText(item.text ?? "", innerWidth, (line) => ctx.measureText(line).width);
        ctx.fillStyle = color;
        lines.forEach((line, index) => {
          if (!line) return;
          const lineWidth = ctx.measureText(line).width;
          const x =
            rect.x + padding + textLineX(item.textAlign ?? "left", 0, innerWidth, lineWidth);
          const y = rect.y + padding + index * lineHeight;
          ctx.fillText(line, x, y);
          if (item.textUnderline) {
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(0.5, fontSize * TEXT_UNDERLINE_WIDTH);
            const underlineY = y + fontSize * (0.86 + TEXT_UNDERLINE_OFFSET);
            ctx.beginPath();
            ctx.moveTo(x, underlineY);
            ctx.lineTo(x + lineWidth, underlineY);
            ctx.stroke();
          }
        });
        usedHeight = lines.length * lineHeight;
      }

      if (usedHeight + padding * 2 > rect.height) {
        ctx.save();
        ctx.strokeStyle = "#d3202a";
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        ctx.restore();
      }
      break;
    }
    case "text": {
      const layout = textItemLayout(item);
      const fontSize = Math.max(0.3, layout.fontSize * zoom);
      const lineHeight = layout.lineHeight * zoom;
      const align = item.textAlign ?? "left";
      ctx.font = `${item.textItalic ? "italic " : ""}${item.textBold ? 700 : 400} ${fontSize}px ${FONT_STACK}`;
      ctx.fillStyle = item.color;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const lineWidths = layout.lines.map((line) => ctx.measureText(line).width);
      const blockWidth = Math.max(0, ...lineWidths);
      layout.lines.forEach((line, index) => {
        const lineWidth = lineWidths[index];
        const x = points[0].x + textLineX(align, 0, blockWidth, lineWidth);
        const y = points[0].y + index * lineHeight;
        ctx.fillText(line, x, y);
        if (item.textUnderline) {
          ctx.strokeStyle = item.color;
          ctx.lineWidth = Math.max(0.5, fontSize * TEXT_UNDERLINE_WIDTH);
          const underlineY = y + fontSize * (0.86 + TEXT_UNDERLINE_OFFSET);
          ctx.beginPath();
          ctx.moveTo(x, underlineY);
          ctx.lineTo(x + lineWidth, underlineY);
          ctx.stroke();
        }
      });
      break;
    }
    case "image": {
      if (points.length < 2) break;
      const project = context.project;
      const asset = project ? imageAssetForItem(project, item) : undefined;
      if (!asset) break;
      const image = context.imageElement(asset);
      if (!image) break;
      const rect = expandRect(points[0], points[1]);
      ctx.save();
      ctx.globalAlpha *= imageOpacity(item);
      ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
      break;
    }
  }
}

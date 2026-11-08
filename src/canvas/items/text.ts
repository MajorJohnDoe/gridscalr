import { normalizeColor } from "../../model/color";
import { expandRect } from "../../model/geometry";
import { layoutRichText, runsText, textRunDefaults } from "../../model/richText";
import {
  TEXT_UNDERLINE_OFFSET,
  TEXT_UNDERLINE_WIDTH,
  clampTextSize,
  textItemLayout,
  textLineX,
  wrapText,
} from "../../model/text";
import type { MarkupItem } from "../../model/types";
import { FONT_STACK, type ItemRenderState } from "./context";

export function drawTextItem(
  ctx: CanvasRenderingContext2D,
  item: MarkupItem,
  state: ItemRenderState,
): void {
  const { points, zoom, color: itemColor } = state;

  // Text cases only; other item kinds are handled by their own family module.
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- partial family switch
  switch (item.kind) {
    case "textbox": {
      if (points.length < 2) break;
      const rect = expandRect(points[0], points[1]);
      const fontSize = Math.max(0.3, clampTextSize(item.fontSize ?? 12) * zoom);
      const padding = Math.max(0, (item.padding ?? 4) * zoom);
      const lineHeight = fontSize * 1.28;
      const color = normalizeColor(item.textColor, itemColor);
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
      ctx.fillStyle = itemColor;
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
          ctx.strokeStyle = itemColor;
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
    default:
      break;
  }
}

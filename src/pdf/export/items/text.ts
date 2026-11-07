import { degrees } from "pdf-lib";
import { expandRect, itemCenter, rotatePoint } from "../../../model/geometry";
import { layoutRichText, runsText, textRunDefaults } from "../../../model/richText";
import {
  TEXT_LINE_HEIGHT,
  TEXT_UNDERLINE_OFFSET,
  TEXT_UNDERLINE_WIDTH,
  clampTextSize,
  textItemLayout,
  textLineX,
  wrapText,
} from "../../../model/text";
import type { MarkupItem } from "../../../model/types";
import { runFont } from "../fonts";
import {
  clamp,
  itemRectCorners,
  pdfAngle,
  pdfColor,
  pdfRectFromCorners,
  toPdfPoint,
} from "../geometry";
import type { ItemContext } from "./context";

/** Text notes, text boxes and rich text runs. */
export function drawTextFamilyItem(
  context: ItemContext,
  item: MarkupItem,
  layerOpacity: number,
): void {
  if (item.kind === "text") drawTextItem(context, item, layerOpacity);
  else if (item.kind === "textbox") drawTextBoxItem(context, item, layerOpacity);
}

function drawTextItem(context: ItemContext, item: MarkupItem, layerOpacity: number): void {
  const { page, viewport, fonts } = context;
  const layout = textItemLayout(item);
  const anchor = item.points[0];
  if (!anchor || !item.text) return;
  const rotation = item.rotation ?? 0;
  const center = itemCenter(item);
  const angle = pdfAngle(viewport, rotation);
  const font = runFont(fonts, { bold: item.textBold === true, italic: item.textItalic === true });
  const align = item.textAlign ?? "left";
  const baseline = font.heightAtSize(layout.fontSize, { descender: false });
  const color = pdfColor(item.color);
  const opacity = clamp(layerOpacity, 0, 1);
  const lineWidths = layout.lines.map((line) => font.widthOfTextAtSize(line, layout.fontSize));
  // Align lines against the block width, matching the canvas layout.
  const blockWidth = Math.max(0, ...lineWidths);

  layout.lines.forEach((line, index) => {
    if (!line) return;
    const lineWidth = lineWidths[index];
    const offsetX = textLineX(align, 0, blockWidth, lineWidth);
    const baselineY = anchor.y + baseline + index * layout.lineHeight;
    const start = rotatePoint(
      {
        x: anchor.x + offsetX,
        y: baselineY,
      },
      center,
      rotation,
    );
    const pdfPoint = toPdfPoint(viewport, start);
    page.drawText(line, {
      x: pdfPoint.x,
      y: pdfPoint.y,
      size: layout.fontSize,
      font,
      color,
      opacity,
      rotate: degrees(angle),
    });
    if (item.textUnderline) {
      const underlineY = baselineY + layout.fontSize * TEXT_UNDERLINE_OFFSET;
      const from = rotatePoint({ x: anchor.x + offsetX, y: underlineY }, center, rotation);
      const to = rotatePoint(
        { x: anchor.x + offsetX + lineWidth, y: underlineY },
        center,
        rotation,
      );
      page.drawLine({
        start: toPdfPoint(viewport, from),
        end: toPdfPoint(viewport, to),
        thickness: Math.max(0.35, layout.fontSize * TEXT_UNDERLINE_WIDTH),
        color,
        opacity,
      });
    }
  });
}

function drawTextBoxItem(context: ItemContext, item: MarkupItem, layerOpacity: number): void {
  const { page, viewport, fonts } = context;
  if (item.points.length < 2) return;
  const rect = expandRect(item.points[0], item.points[1]);
  const fontSize = clampTextSize(item.fontSize ?? 12);
  const padding = Math.max(0, item.padding ?? 4);
  const maxWidth = Math.max(1, rect.width - padding * 2);
  const opacity = clamp(layerOpacity, 0, 1);
  const center = itemCenter(item);
  const rotation = item.rotation ?? 0;
  const angle = pdfAngle(viewport, rotation);
  const align = item.textAlign ?? "left";

  if (item.textBackground === "white") {
    const background = pdfRectFromCorners(viewport, itemRectCorners(item));
    page.drawRectangle({
      x: background.x,
      y: background.y,
      width: background.width,
      height: background.height,
      rotate: degrees(background.angle),
      color: pdfColor("#ffffff"),
      opacity,
    });
  }

  const richRuns =
    item.runs?.length && runsText(item.runs) === (item.text ?? "") ? item.runs : null;
  if (richRuns) {
    const layout = layoutRichText(
      richRuns,
      maxWidth,
      (text, run) => runFont(fonts, run).widthOfTextAtSize(text, run.size),
      textRunDefaults(item),
    );
    layout.lines.forEach((line, index) => {
      const top = rect.y + padding + index * layout.lineHeight;
      let x = rect.x + padding + textLineX(align, 0, maxWidth, line.width);
      for (const segment of line.segments) {
        const font = runFont(fonts, segment.run);
        const baselineY = top + font.heightAtSize(segment.run.size, { descender: false });
        const start = rotatePoint({ x, y: baselineY }, center, rotation);
        const point = toPdfPoint(viewport, start);
        page.drawText(segment.text, {
          x: point.x,
          y: point.y,
          size: segment.run.size,
          font,
          color: pdfColor(segment.run.color),
          opacity,
          rotate: degrees(angle),
        });
        if (segment.run.underline) {
          const underlineY = baselineY + segment.run.size * TEXT_UNDERLINE_OFFSET;
          const from = rotatePoint({ x, y: underlineY }, center, rotation);
          const to = rotatePoint({ x: x + segment.width, y: underlineY }, center, rotation);
          page.drawLine({
            start: toPdfPoint(viewport, from),
            end: toPdfPoint(viewport, to),
            thickness: Math.max(0.35, segment.run.size * TEXT_UNDERLINE_WIDTH),
            color: pdfColor(segment.run.color),
            opacity,
          });
        }
        x += segment.width;
      }
    });
    return;
  }

  const font = runFont(fonts, { bold: item.textBold === true, italic: item.textItalic === true });
  const lines = wrapText(item.text ?? "", maxWidth, (line) =>
    font.widthOfTextAtSize(line, fontSize),
  );
  const lineHeight = fontSize * TEXT_LINE_HEIGHT;
  const color = pdfColor(item.textColor ?? item.color);
  const baseline = font.heightAtSize(fontSize, { descender: false });
  lines.forEach((line, index) => {
    if (!line) return;
    const lineWidth = font.widthOfTextAtSize(line, fontSize);
    const offsetX = textLineX(align, 0, maxWidth, lineWidth);
    const baselineY = rect.y + padding + baseline + index * lineHeight;
    const start = rotatePoint({ x: rect.x + padding + offsetX, y: baselineY }, center, rotation);
    const pdfPoint = toPdfPoint(viewport, start);
    page.drawText(line, {
      x: pdfPoint.x,
      y: pdfPoint.y,
      size: fontSize,
      font,
      color,
      opacity,
      rotate: degrees(angle),
    });
    if (item.textUnderline) {
      const underlineY = baselineY + fontSize * TEXT_UNDERLINE_OFFSET;
      const from = rotatePoint({ x: rect.x + padding + offsetX, y: underlineY }, center, rotation);
      const to = rotatePoint(
        { x: rect.x + padding + offsetX + lineWidth, y: underlineY },
        center,
        rotation,
      );
      page.drawLine({
        start: toPdfPoint(viewport, from),
        end: toPdfPoint(viewport, to),
        thickness: Math.max(0.35, fontSize * TEXT_UNDERLINE_WIDTH),
        color,
        opacity,
      });
    }
  });
}

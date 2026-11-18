import { degrees } from "pdf-lib";
import { itemCenter, rotatePoint } from "../../../model/geometry";
import { resolveItemColor } from "../../../model/layers";
import type { MarkupItem } from "../../../model/types";
import {
  bandColorRole,
  documentScheduleTableStyle,
  ellipsizeText,
  findSchedule,
  inkColorRole,
  layoutForItem,
  placementBox,
  ruleColorRole,
  type MeasureText,
  type ScheduleResult,
  type ScheduleTableLayout,
} from "../../../features/schedules";
import { computeSchedule } from "../../../features/schedules";
import { t } from "../../../i18n";
import {
  clamp,
  itemRectCorners,
  pdfAngle,
  pdfColor,
  pdfRectFromCorners,
  toPdfPoint,
} from "../geometry";
import type { ItemContext } from "./context";

/**
 * A placed schedule table in the flattened PDF export. The table is vector
 * text and lines from the same layout function the canvas uses, so columns,
 * rows, subtotals and totals match the screen. Page, crop, layer and visibility
 * rules are applied by the exporter before this function is called.
 */

export function pdfScheduleLayout(
  result: ScheduleResult,
  item: MarkupItem,
  measure: MeasureText,
): ScheduleTableLayout {
  return layoutForItem(result, item, measure);
}

function fontMeasure(context: ItemContext): MeasureText {
  const { fonts } = context;
  return (text, size, bold) => (bold ? fonts.bold : fonts.regular).widthOfTextAtSize(text, size);
}

export function drawScheduleItem(
  context: ItemContext,
  item: MarkupItem,
  layerOpacity: number,
): void {
  const { page, viewport, project, fonts } = context;
  if (item.points.length < 2) return;
  const opacity = clamp(layerOpacity, 0, 1);
  const color = pdfColor(resolveItemColor(item));
  const box = placementBox(item);
  const center = itemCenter(item);
  const rotation = item.rotation ?? 0;
  const angle = pdfAngle(viewport, rotation);
  const toPdf = (x: number, y: number) =>
    toPdfPoint(
      viewport,
      rotatePoint({ x: box.origin.x + x, y: box.origin.y + y }, center, rotation),
    );

  const background = pdfRectFromCorners(viewport, itemRectCorners(item));
  // An explicit item fill is the table paper, so a legacy or imported fill
  // still tints the rows instead of being overpainted by the bands.
  const base = documentScheduleTableStyle();
  const style = item.fillColor ? { ...base, paper: item.fillColor } : base;
  const fillOpacity = opacity * (item.opacity ?? 0.94);
  page.drawRectangle({
    x: background.x,
    y: background.y,
    width: background.width,
    height: background.height,
    rotate: degrees(background.angle),
    color: pdfColor(style.paper),
    opacity: fillOpacity,
  });

  const schedule = findSchedule(project, item.scheduleId);
  if (!schedule) {
    const placeholderSize = Math.min(10, Math.max(5, box.height / 4));
    const text = ellipsizeText(
      t("schedules.placement.missing"),
      box.width - 12,
      placeholderSize,
      false,
      fontMeasure(context),
    );
    const point = toPdf(6, box.height / 2 + placeholderSize * 0.35);
    page.drawText(text, {
      x: point.x,
      y: point.y,
      size: placeholderSize,
      font: fonts.regular,
      color,
      opacity,
      rotate: degrees(angle),
    });
    page.drawRectangle({
      x: background.x,
      y: background.y,
      width: background.width,
      height: background.height,
      rotate: degrees(background.angle),
      borderColor: color,
      borderWidth: Math.max(0.5, item.strokeWidth),
      borderOpacity: opacity,
    });
    return;
  }

  const measure = fontMeasure(context);
  const layout = pdfScheduleLayout(computeSchedule(project, schedule), item, measure);
  const bandCorners = (band: { x: number; y: number; width: number; height: number }) =>
    [
      { x: band.x, y: band.y },
      { x: band.x + band.width, y: band.y },
      { x: band.x + band.width, y: band.y + band.height },
      { x: band.x, y: band.y + band.height },
    ].map((point) =>
      rotatePoint({ x: box.origin.x + point.x, y: box.origin.y + point.y }, center, rotation),
    );

  for (const band of layout.bands) {
    const rect = pdfRectFromCorners(viewport, bandCorners(band));
    page.drawRectangle({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      rotate: degrees(rect.angle),
      color: pdfColor(style[bandColorRole(band.role)]),
      opacity: fillOpacity,
    });
  }

  for (const line of layout.lines) {
    const start = toPdf(line.x1, line.y1);
    const end = toPdf(line.x2, line.y2);
    const rule = ruleColorRole(line.role);
    page.drawLine({
      start,
      end,
      thickness: Math.max(0.2, line.width),
      color: rule ? pdfColor(style[rule]) : color,
      opacity,
    });
  }

  for (const cell of [...layout.header, ...layout.cells]) {
    if (!cell.text) continue;
    const font = cell.bold ? fonts.bold : fonts.regular;
    const size = layout.fontSize;
    const width = font.widthOfTextAtSize(cell.text, size);
    const startX =
      cell.align === "right"
        ? cell.x + cell.width - layout.padding - width
        : cell.x + layout.padding;
    const point = toPdf(startX, cell.y + cell.height / 2 + size * 0.35);
    page.drawText(cell.text, {
      x: point.x,
      y: point.y,
      size,
      font,
      color: pdfColor(style[inkColorRole(cell.role)]),
      opacity,
      rotate: degrees(angle),
    });
  }
}

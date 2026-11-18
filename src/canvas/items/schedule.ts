import { resolveItemColor } from "../../model/layers";
import type { MarkupItem } from "../../model/types";
import {
  bandColorRole,
  cachedSchedule,
  findSchedule,
  inkColorRole,
  layoutForItem,
  ruleColorRole,
} from "../../features/schedules";
import type { ScheduleResult, ScheduleTableLayout, MeasureText } from "../../features/schedules";
import { store } from "../../state/store";
import { t } from "../../i18n";
import { FONT_STACK } from "./context";
import type { ItemRenderState } from "./context";
import { canvasScheduleStyle } from "./scheduleStyle";

/**
 * A placed schedule table on the canvas. Content is computed at render time
 * from the schedule definition through the shared layout function; nothing is
 * copied onto the item. The table is drawn only for its visible box.
 */

export function canvasScheduleLayout(
  result: ScheduleResult,
  item: MarkupItem,
  measure: MeasureText,
): ScheduleTableLayout {
  return layoutForItem(result, item, measure);
}

function screenMeasure(ctx: CanvasRenderingContext2D, zoom: number): MeasureText {
  let key = "";
  return (text, size, bold) => {
    const next = `${bold ? 700 : 500}:${size}`;
    if (next !== key) {
      key = next;
      ctx.font = `${bold ? 700 : 500} ${Math.max(0.5, size * zoom)}px ${FONT_STACK}`;
    }
    return ctx.measureText(text).width / zoom;
  };
}

function drawMissingSchedule(ctx: CanvasRenderingContext2D, state: ItemRenderState): void {
  const { points, zoom, color } = state;
  const a = points[0];
  const b = points[1] ?? a;
  if (!a || !b) return;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.max(1, Math.abs(b.x - a.x));
  const height = Math.max(1, Math.abs(b.y - a.y));
  ctx.save();
  ctx.setLineDash([Math.max(3, 5 * zoom), Math.max(2, 3 * zoom)]);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.75, 1.2 * zoom);
  ctx.strokeRect(x, y, width, height);
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = `600 ${Math.max(7, 9 * zoom)}px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    t("schedules.placement.missing"),
    x + width / 2,
    y + height / 2,
    Math.max(8, width - 10),
  );
  ctx.restore();
}

export function drawScheduleItem(
  ctx: CanvasRenderingContext2D,
  item: MarkupItem,
  state: ItemRenderState,
): void {
  const project = state.context.project;
  const a = state.points[0];
  const b = state.points[1] ?? a;
  if (!project || !a || !b) return;
  const schedule = findSchedule(project, item.scheduleId);
  if (!schedule) {
    drawMissingSchedule(ctx, state);
    return;
  }
  const zoom = state.zoom;
  const measure = screenMeasure(ctx, zoom);
  const result = cachedSchedule(store.revision, project, schedule);
  const layout = canvasScheduleLayout(result, item, measure);
  const style = canvasScheduleStyle();
  // An explicit item fill is the table paper, so a legacy or imported fill
  // still tints the rows instead of being overpainted by the bands.
  const table = item.fillColor ? { ...style, paper: item.fillColor } : style;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.max(1, Math.abs(b.x - a.x));
  const height = Math.max(1, Math.abs(b.y - a.y));
  const color = resolveItemColor(item);
  const padding = layout.padding;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();

  ctx.save();
  ctx.globalAlpha *= item.opacity ?? 0.94;
  ctx.fillStyle = table.paper;
  ctx.fillRect(x, y, width, height);
  for (const band of layout.bands) {
    ctx.fillStyle = table[bandColorRole(band.role)];
    ctx.fillRect(
      x + band.x * zoom,
      y + band.y * zoom,
      Math.max(0.5, band.width * zoom),
      Math.max(0.5, band.height * zoom),
    );
  }
  ctx.restore();

  ctx.lineCap = "butt";
  for (const line of layout.lines) {
    const role = ruleColorRole(line.role);
    ctx.strokeStyle = role ? table[role] : color;
    ctx.lineWidth = Math.max(0.35, line.width * zoom);
    ctx.beginPath();
    ctx.moveTo(x + line.x1 * zoom, y + line.y1 * zoom);
    ctx.lineTo(x + line.x2 * zoom, y + line.y2 * zoom);
    ctx.stroke();
  }

  ctx.textBaseline = "middle";
  for (const cell of [...layout.header, ...layout.cells]) {
    if (!cell.text) continue;
    const size = Math.max(0.5, layout.fontSize * zoom);
    ctx.font = `${cell.bold ? 700 : 500} ${size}px ${FONT_STACK}`;
    ctx.fillStyle = table[inkColorRole(cell.role)];
    ctx.textAlign = cell.align === "right" ? "right" : "left";
    const textX =
      cell.align === "right"
        ? x + (cell.x + cell.width - padding) * zoom
        : x + (cell.x + padding) * zoom;
    ctx.fillText(
      cell.text,
      textX,
      y + (cell.y + cell.height / 2) * zoom,
      Math.max(1, (cell.width - padding * 2) * zoom),
    );
  }
  ctx.restore();
}

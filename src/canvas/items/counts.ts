import { countTypeGlyph } from "../../features/countTypes/model";
import { countSymbol } from "../../model/countSymbols";
import type { MarkupItem } from "../../model/types";
import type { ItemRenderState } from "./context";

export function drawCountItem(
  ctx: CanvasRenderingContext2D,
  item: MarkupItem,
  state: ItemRenderState,
): void {
  if (item.kind !== "count") return;
  const { context, zoom } = state;
  const anchorPage = item.points[0];
  if (!anchorPage) return;
  const project = context.project;
  if (!project) return;
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
}

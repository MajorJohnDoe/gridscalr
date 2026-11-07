import type { RGB } from "pdf-lib";
import { countSymbol } from "../../../model/countSymbols";
import type { MarkupItem, Project } from "../../../model/types";
import { countTypeGlyph } from "../../../features/countTypes/model";
import { clamp, drawPolyline, toPdfPoint } from "../geometry";
import type { ItemContext } from "./context";

/** Count placements, drawn with the active page's count-type glyph. */
export function drawCountItem(
  context: ItemContext,
  item: MarkupItem,
  project: Project,
  color: RGB,
  width: number,
  opacity: number,
): void {
  const { page, viewport } = context;
  const anchor = item.points[0];
  if (!anchor) return;
  const symbol = countSymbol(countTypeGlyph(project, item.countType));
  for (const path of symbol.paths) {
    const points = path.points.map((point) => ({
      x: anchor.x + point.x,
      y: anchor.y + point.y,
    }));
    drawPolyline(page, viewport, points, color, width, opacity, path.closed);
  }
  for (const dot of symbol.dots) {
    const center = toPdfPoint(viewport, {
      x: anchor.x + dot.center.x,
      y: anchor.y + dot.center.y,
    });
    page.drawCircle({
      x: center.x,
      y: center.y,
      size: dot.radius,
      color,
      opacity: clamp(opacity, 0, 1),
    });
  }
}

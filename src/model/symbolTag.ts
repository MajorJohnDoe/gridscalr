import type { MarkupItem, Point } from "./types";
import { symbolSizeOf } from "./symbols";

/** Tag text size in PDF points. */
export const SYMBOL_TAG_FONT_SIZE = 8;

/**
 * The tag offset is stored in PDF points relative to the symbol anchor, so the
 * text follows the symbol when it is moved, resized or rotated on the page.
 * Missing offsets place the tag just above the symbol's top-right corner.
 */
export function symbolTagOffset(item: Pick<MarkupItem, "tagOffset" | "symbolSize">): Point {
  if (item.tagOffset) return item.tagOffset;
  const half = symbolSizeOf(item) / 2;
  return { x: half + 3, y: -half };
}

export function symbolTagPosition(
  item: Pick<MarkupItem, "points" | "tagOffset" | "symbolSize">,
): Point | null {
  const anchor = item.points[0];
  if (!anchor) return null;
  const offset = symbolTagOffset(item);
  return { x: anchor.x + offset.x, y: anchor.y + offset.y };
}

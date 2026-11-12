import { itemBounds, type Bounds } from "../../model/geometry";
import { imageModeOf } from "../../model/images";
import type { LabelLayout } from "../../model/labelLayout";
import { itemIsVisible, layerVisibleOnPage } from "../../model/layers";
import { buildLayerHierarchy } from "../../model/layerHierarchy";
import { symbolTagPosition, SYMBOL_TAG_FONT_SIZE } from "../../model/symbolTag";
import type { MarkupItem, PageId, Project } from "../../model/types";
import type { ItemRenderContext } from "./context";
import { dispatchItem } from "./dispatch";

/** Two axis-aligned page rectangles overlap, including touching edges. */
export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.min.x <= b.max.x && a.max.x >= b.min.x && a.min.y <= b.max.y && a.max.y >= b.min.y;
}

/**
 * Conservative page-space bounds for culling: the item artwork, its
 * measurement label and the free-text tag drawn just outside a symbol.
 */
export function itemRenderBounds(item: MarkupItem, label?: LabelLayout): Bounds {
  const bounds = itemBounds(item);
  if (label) {
    bounds.min.x = Math.min(bounds.min.x, label.box.x);
    bounds.min.y = Math.min(bounds.min.y, label.box.y);
    bounds.max.x = Math.max(bounds.max.x, label.box.x + label.box.width);
    bounds.max.y = Math.max(bounds.max.y, label.box.y + label.box.height);
  }
  if (item.kind === "symbol" && item.tag) {
    const position = symbolTagPosition(item);
    if (position) {
      const width = Math.max(12, item.tag.length * SYMBOL_TAG_FONT_SIZE * 0.7);
      bounds.min.x = Math.min(bounds.min.x, position.x - width);
      bounds.min.y = Math.min(bounds.min.y, position.y - SYMBOL_TAG_FONT_SIZE);
      bounds.max.x = Math.max(bounds.max.x, position.x + width);
      bounds.max.y = Math.max(bounds.max.y, position.y + SYMBOL_TAG_FONT_SIZE * 2);
    }
  }
  return bounds;
}

/**
 * Draws the visible items of one page. Background images render below the sheet
 * fields and every other item above them; both passes share this visibility,
 * layer and viewport filter so culling cannot change the result.
 */
export function drawVisibleItems(
  ctx: CanvasRenderingContext2D,
  project: Project,
  pageId: PageId,
  labels: Map<string, LabelLayout>,
  context: ItemRenderContext,
  visible: Bounds,
  background: boolean,
): void {
  const hierarchy = buildLayerHierarchy(project.layers);
  for (const layer of project.layers) {
    if (!layerVisibleOnPage(layer, pageId, hierarchy) || layer.opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    for (const item of layer.items) {
      if (item.pageId !== pageId || !itemIsVisible(item, layer, hierarchy)) continue;
      const isBackground = item.kind === "image" && imageModeOf(item) === "background";
      if (isBackground !== background) continue;
      if (!boundsIntersect(itemRenderBounds(item, labels.get(item.id)), visible)) continue;
      dispatchItem(ctx, item, labels, context);
    }
    ctx.restore();
  }
}

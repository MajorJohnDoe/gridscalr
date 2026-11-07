import { expandRect } from "../../model/geometry";
import { imageAssetForItem, imageOpacity } from "../../model/images";
import type { MarkupItem } from "../../model/types";
import type { ItemRenderState } from "./context";

export function drawImageItem(
  ctx: CanvasRenderingContext2D,
  item: MarkupItem,
  state: ItemRenderState,
): void {
  if (item.kind !== "image") return;
  const { context, points } = state;
  if (points.length < 2) return;
  const project = context.project;
  const asset = project ? imageAssetForItem(project, item) : undefined;
  if (!asset) return;
  const image = context.imageElement(asset);
  if (!image) return;
  const rect = expandRect(points[0], points[1]);
  ctx.save();
  ctx.globalAlpha *= imageOpacity(item);
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

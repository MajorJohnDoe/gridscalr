import type { LabelLayout } from "../model/labelLayout";
import type { MarkupItem } from "../model/types";
import type { ItemRenderContext } from "./items/context";
import { dispatchItem } from "./items/dispatch";

export type { ItemRenderContext } from "./items/context";

export function drawItem(
  ctx: CanvasRenderingContext2D,
  item: MarkupItem,
  labels: Map<string, LabelLayout>,
  context: ItemRenderContext,
): void {
  return dispatchItem(ctx, item, labels, context);
}

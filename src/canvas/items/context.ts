import type { LabelBox, LabelMetrics } from "../../model/label";
import type { LabelLayout } from "../../model/labelLayout";
import { TEXT_FONT_STACK } from "../../model/text";
import type { ImageAsset, MarkupItem, Point, Project } from "../../model/types";
import { drawAnnotationPanel, drawLabelLayout } from "../annotationDraw";

export const FONT_STACK = TEXT_FONT_STACK;

export interface ItemRenderContext {
  zoom: number;
  project: Project | null;
  toScreen: (point: Point) => Point;
  imageElement: (asset: ImageAsset) => HTMLImageElement | null;
  screenLabelBox: (box: LabelBox, metrics: LabelMetrics) => LabelBox;
  editors: {
    editingItemId: string | null;
    editingLabelId: string | null;
    textSession: {
      itemId: string | null;
      mode: string;
      text: string;
      fontSize: number;
      boxWidth?: number;
      boxHeight?: number;
    } | null;
  };
}

export interface PanelLayout {
  center: Point;
  width: number;
  height: number;
  lines: string[];
  fontSize: number;
  lineHeight: number;
  padding: number;
}

export type DrawPanel = (
  ctx: CanvasRenderingContext2D,
  layout: PanelLayout,
  panelItem: MarkupItem,
  fill: string,
  textColor: string,
  leader: boolean,
  style?: "text" | "stamp",
) => void;

export interface ItemRenderState {
  context: ItemRenderContext;
  zoom: number;
  points: Point[];
  lineWidth: number;
  drawPanel: DrawPanel;
}

/** Panel drawing needs the live screen transform, so it is bound to the render context. */
export function createDrawPanel(context: ItemRenderContext): DrawPanel {
  return (ctx, layout, panelItem, fill, textColor, leader, style = "text") => {
    drawAnnotationPanel(
      ctx,
      layout,
      panelItem,
      fill,
      textColor,
      leader,
      style,
      context.toScreen,
      context.zoom,
    );
  };
}

export function drawLabel(
  ctx: CanvasRenderingContext2D,
  layout: LabelLayout,
  context: ItemRenderContext,
): void {
  drawLabelLayout(
    ctx,
    layout,
    (point) => context.toScreen(point),
    () => context.zoom,
    (box, metrics) => context.screenLabelBox(box, metrics),
  );
}

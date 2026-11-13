import {
  appendBezierCurve,
  closePath,
  LineCapStyle,
  LineJoinStyle,
  lineTo,
  moveTo,
  PDFOperator,
  PDFOperatorNames,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFillingColor,
  setGraphicsState,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingColor,
} from "pdf-lib";
import {
  inspectionStatusColor,
  symbolCategoryColor,
  symbolFor,
  symbolRenderPlan,
  symbolShapeStrokeWidth,
  symbolSizeOf,
  type SymbolRenderShape,
} from "../../../features/schematics";
import { resolveItemColor } from "../../../model/layers";
import { parseSymbolPath, transformSymbolCommands } from "../../../model/symbolPaths";
import { SYMBOL_TAG_FONT_SIZE, symbolTagPosition } from "../../../model/symbolTag";
import type { MarkupItem, Point } from "../../../model/types";
import { rotatePoint } from "../../../model/geometry";
import { clamp, pdfColor, toPdfPoint } from "../geometry";
import type { ItemContext } from "./context";

/** Built-in facility signs and schematic symbols, including tags and badges. */
export function drawSymbolItem(context: ItemContext, item: MarkupItem, opacity: number): void {
  const { page, viewport, fonts } = context;
  const anchor = item.points[0];
  if (!anchor) return;
  const definition = symbolFor(item.symbolId);
  const accentHex =
    definition.style === "schematic"
      ? "#111111"
      : definition.id === "unknown"
        ? resolveItemColor(item)
        : symbolCategoryColor(definition.category);
  const rotation = item.rotation ?? 0;
  const plan = symbolRenderPlan(definition, accentHex);
  const size = symbolSizeOf(item);
  const scale = size / plan.viewBox;
  const half = plan.viewBox / 2;
  const toPage = (point: Point): Point =>
    rotatePoint(
      {
        x: anchor.x + (point.x - half) * scale,
        y: anchor.y + (point.y - half) * scale,
      },
      anchor,
      rotation,
    );
  const gsKey =
    opacity < 0.999
      ? page.node.newExtGState(
          "GS",
          page.doc.context.obj({ Type: "ExtGState", ca: opacity, CA: opacity }),
        )
      : undefined;
  const fillOpcode = (shape: SymbolRenderShape): PDFOperatorNames => {
    if (shape.fill && shape.stroke) {
      return shape.fillRule === "evenodd"
        ? PDFOperatorNames.FillEvenOddAndStroke
        : PDFOperatorNames.FillNonZeroAndStroke;
    }
    if (shape.fill) {
      return shape.fillRule === "evenodd"
        ? PDFOperatorNames.FillEvenOdd
        : PDFOperatorNames.FillNonZero;
    }
    return PDFOperatorNames.StrokePath;
  };
  for (const shape of plan.shapes) {
    const operators: PDFOperator[] = [pushGraphicsState()];
    if (gsKey) operators.push(setGraphicsState(gsKey));
    if (shape.fill) operators.push(setFillingColor(pdfColor(shape.fill)));
    if (shape.stroke) {
      operators.push(
        setStrokingColor(pdfColor(shape.stroke)),
        setLineWidth(Math.max(0.2, symbolShapeStrokeWidth(plan, shape, size))),
        setLineCap(LineCapStyle.Round),
        setLineJoin(LineJoinStyle.Round),
      );
    }
    operators.push(...symbolCommandsToPdfOps(shape, toPage, viewport));
    operators.push(PDFOperator.of(fillOpcode(shape)), popGraphicsState());
    page.pushOperators(...operators);
  }
  if (item.status) {
    const marker = toPdfPoint(viewport, toPage(plan.badge));
    const markerSize = plan.badge.r * scale;
    page.drawCircle({
      x: marker.x,
      y: marker.y,
      size: markerSize + 1.4 * scale,
      color: rgb(0.059, 0.075, 0.082),
      opacity: clamp(opacity * 0.85, 0, 1),
    });
    page.drawCircle({
      x: marker.x,
      y: marker.y,
      size: markerSize + 0.7 * scale,
      color: rgb(1, 1, 1),
      opacity: clamp(opacity, 0, 1),
    });
    page.drawCircle({
      x: marker.x,
      y: marker.y,
      size: markerSize,
      color: pdfColor(inspectionStatusColor(item.status)),
      opacity: clamp(opacity, 0, 1),
    });
  }
  if (item.tag) {
    const tagPosition = symbolTagPosition(item);
    if (tagPosition) {
      const rotated = rotation === 0 ? tagPosition : rotatePoint(tagPosition, anchor, rotation);
      const point = toPdfPoint(viewport, rotated);
      page.drawText(item.tag, {
        x: point.x,
        y: point.y - SYMBOL_TAG_FONT_SIZE,
        size: SYMBOL_TAG_FONT_SIZE,
        font: fonts.regular,
        color: rgb(0.067, 0.075, 0.082),
        opacity: clamp(opacity, 0, 1),
      });
    }
  }
}

function symbolCommandsToPdfOps(
  shape: SymbolRenderShape,
  toPage: (point: Point) => Point,
  viewport: ItemContext["viewport"],
): PDFOperator[] {
  // pdf-lib's drawSvgPath only fills with the non-zero rule and rotates around
  // the path origin. Symbol artwork needs even-odd holes and rotation around the
  // item anchor, so the shared parsed commands are emitted directly instead.
  const commands = transformSymbolCommands(parseSymbolPath(shape.d), (point) => {
    const scaled = {
      x: 32 + (point.x - 32) * shape.scale,
      y: 32 + (point.y - 32) * shape.scale,
    };
    return toPdfPoint(viewport, toPage(scaled));
  });
  const ops: PDFOperator[] = [];
  for (const command of commands) {
    switch (command.type) {
      case "M":
        ops.push(moveTo(command.x, command.y));
        break;
      case "L":
        ops.push(lineTo(command.x, command.y));
        break;
      case "C":
        ops.push(
          appendBezierCurve(command.x1, command.y1, command.x2, command.y2, command.x, command.y),
        );
        break;
      case "Z":
        ops.push(closePath());
        break;
    }
  }
  return ops;
}

import {
  SCHEMATIC_STROKE_WIDTH,
  SYMBOL_SIZE,
  SYMBOL_STYLE,
  SYMBOL_VIEWBOX,
  type SymbolStyle,
} from "./constants";
import { GLYPH_BADGE, SIGN_BADGE } from "./signArtHelpers";
import { parseSymbolPath, roundedRectPathData, symbolCommandBounds } from "../symbolPaths";
import type { SymbolArt, SymbolDefinition, SymbolRenderPlan, SymbolRenderShape } from "./types";

/** Bounding box of the visible pictogram, including stroke widths. */
export function symbolArtBounds(art: SymbolArt): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  for (const shape of art.shapes) {
    const shapeBounds = symbolCommandBounds(parseSymbolPath(shape.d));
    const pad = shape.stroke ? (shape.strokeWidth ?? 4) / 2 : 0;
    bounds.minX = Math.min(bounds.minX, shapeBounds.minX - pad);
    bounds.minY = Math.min(bounds.minY, shapeBounds.minY - pad);
    bounds.maxX = Math.max(bounds.maxX, shapeBounds.maxX + pad);
    bounds.maxY = Math.max(bounds.maxY, shapeBounds.maxY + pad);
  }
  return bounds;
}

/** Shared render plan for the canvas, the library markup and the PDF export. */
export function symbolRenderPlan(
  symbol: SymbolDefinition,
  accent: string,
  style: SymbolStyle = symbol.style ?? SYMBOL_STYLE,
): SymbolRenderPlan {
  const shapes: SymbolRenderShape[] = [];
  const isSign = style === "sign";
  const isSchematic = style === "schematic";
  const schematicStrokeWidth = symbol.fixedStrokeWidth ?? SCHEMATIC_STROKE_WIDTH;
  if (isSign) {
    shapes.push({
      d: roundedRectPathData(2, 2, 60, 60, 3),
      fill: symbol.art.plateColor ?? accent,
      stroke: null,
      strokeWidth: 0,
      fillRule: "nonzero",
      scale: 1,
    });
  }
  const glyphColor = isSign ? (symbol.art.glyphColor ?? "#ffffff") : accent;
  for (const entry of symbol.art.shapes) {
    shapes.push({
      d: entry.d,
      fill: entry.stroke ? null : glyphColor,
      stroke: entry.stroke ? glyphColor : null,
      strokeWidth: entry.stroke
        ? isSchematic
          ? schematicStrokeWidth
          : (entry.strokeWidth ?? 4)
        : 0,
      fillRule: entry.fillRule ?? "nonzero",
      scale: 1,
    });
  }
  return {
    shapes,
    badge: symbol.art.badge ?? (isSign ? SIGN_BADGE : GLYPH_BADGE),
    viewBox: SYMBOL_VIEWBOX,
    fixedStrokeWidth: isSchematic ? schematicStrokeWidth : undefined,
  };
}

/**
 * Stroke width in page points for one rendered shape at a given symbol size.
 * The canvas converts this to local units, so a schematic symbol keeps its
 * printed weight at every zoom and matches the PDF export exactly.
 */
export function symbolShapeStrokeWidth(
  plan: SymbolRenderPlan,
  shape: SymbolRenderShape,
  size: number,
): number {
  const resolved = Number.isFinite(size) && size > 0 ? size : SYMBOL_SIZE;
  return plan.fixedStrokeWidth ?? shape.strokeWidth * shape.scale * (resolved / plan.viewBox);
}

/** SVG markup for the symbol library and help screenshots. */
export function symbolSvgMarkup(
  symbol: SymbolDefinition,
  size = 24,
  color = "#e8eef1",
  style: SymbolStyle = symbol.style ?? SYMBOL_STYLE,
): string {
  const plan = symbolRenderPlan(symbol, color, style);
  const fixedWidth =
    plan.fixedStrokeWidth && symbol.defaultSize
      ? (plan.fixedStrokeWidth * plan.viewBox) / symbol.defaultSize
      : undefined;
  const pathMarkup = plan.shapes
    .map((shape) => {
      const transform =
        shape.scale === 1
          ? ""
          : ` transform="translate(32 32) scale(${shape.scale}) translate(-32 -32)"`;
      const fill = shape.fill ?? "none";
      const stroke = shape.stroke ?? "none";
      const fillRule = shape.fill ? ` fill-rule="${shape.fillRule}"` : "";
      const strokeAttrs = shape.stroke
        ? ` stroke-width="${fixedWidth ?? shape.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
        : "";
      return `<path d="${shape.d}" fill="${fill}"${fillRule} stroke="${stroke}"${strokeAttrs}${transform}/>`;
    })
    .join("");
  return `<svg class="symbol-glyph" width="${size}" height="${size}" viewBox="0 0 ${SYMBOL_VIEWBOX} ${SYMBOL_VIEWBOX}" aria-hidden="true">${pathMarkup}</svg>`;
}

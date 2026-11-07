import type { SymbolCategory, SymbolSet } from "../types";
import type { SymbolStyle } from "./constants";

export interface SymbolPort {
  id: string;
  x: number;
  y: number;
  /** Optional hint for snapping and the catalogue arrows. */
  direction?: "in" | "out" | "both";
}

export interface SymbolArtShape {
  /** SVG path data in the 64-unit symbol view box. */
  d: string;
  fillRule?: "nonzero" | "evenodd";
  /** Draw the path as a round-capped stroke instead of a fill. */
  stroke?: boolean;
  /** Stroke width in view-box units. */
  strokeWidth?: number;
}

export interface SymbolArt {
  shapes: SymbolArtShape[];
  /** Override the category colour for signs whose standard colour differs. */
  plateColor?: string;
  /** Override the pictogram colour, for example black on a warning sign. */
  glyphColor?: string;
  /** Status badge anchor and radius in the 64-unit view box. */
  badge?: { x: number; y: number; r: number };
}

export interface SymbolDefinition {
  id: string;
  name: string;
  category: SymbolCategory;
  keywords: string[];
  /** Filled vector artwork rendered by the canvas, library and PDF. */
  art: SymbolArt;
  /** Missing means the facility-sign set, kept for older definitions. */
  set?: SymbolSet;
  /** Missing means the classic sign plate. */
  style?: SymbolStyle;
  /** Connection anchors for schematic symbols. */
  ports?: SymbolPort[];
  /** Suggested free-text tag prefix, for example "FF". Never numbered automatically. */
  tagPrefix?: string;
  /** Default item size in PDF points. Missing means SYMBOL_SIZE. */
  defaultSize?: number;
  /** Schematic symbols only: fixed stroke width in PDF points. Missing uses SCHEMATIC_STROKE_WIDTH. */
  fixedStrokeWidth?: number;
}

export interface SymbolRenderShape {
  d: string;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  fillRule: "nonzero" | "evenodd";
  /** Uniform scale around the centre of the 64-unit view box. */
  scale: number;
}

export interface SymbolRenderPlan {
  shapes: SymbolRenderShape[];
  badge: { x: number; y: number; r: number };
  viewBox: number;
  /** When set, renderers keep the stroke at this many PDF points regardless of size. */
  fixedStrokeWidth?: number;
}

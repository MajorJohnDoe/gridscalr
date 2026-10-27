import {
  circlePathData,
  parseSymbolPath,
  roundedRectPathData,
  serializeSymbolPath,
  symbolCommandBounds,
  transformSymbolCommands,
} from "./symbolPaths";
import type { InspectionStatus, SymbolCategory } from "./types";

/**
 * Built-in facility symbols are paper-space classic sign plates. Each pictogram
 * is authored as filled SVG paths in a 64-unit view box and uses even-odd holes
 * so the canvas, the symbol library and the flattened PDF export draw exactly
 * the same geometry. Plates are centred on the 32,32 plate centre and follow
 * the category colour system.
 */
export const SYMBOL_SIZE = 24;
export const SYMBOL_MIN_SIZE = 6;
export const SYMBOL_MAX_SIZE = 300;
export const SYMBOL_VIEWBOX = 64;
export const DEFAULT_SYMBOL_ID = "fire.extinguisher";

export function clampSymbolSize(value: number): number {
  if (!Number.isFinite(value)) return SYMBOL_SIZE;
  return Math.max(SYMBOL_MIN_SIZE, Math.min(SYMBOL_MAX_SIZE, value));
}

/** Plate size in PDF points for a symbol item, clamped to the supported range. */
export function symbolSizeOf(item: { symbolSize?: number }): number {
  const value = item.symbolSize;
  if (typeof value !== "number") return SYMBOL_SIZE;
  return clampSymbolSize(value);
}

export type SymbolStyle = "sign" | "glyph";

/** Classic facility sign plates with a white or black pictogram. */
export const SYMBOL_STYLE: SymbolStyle = "sign";

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
}

export const SYMBOL_CATEGORIES: SymbolCategory[] = [
  "fire",
  "egress",
  "hvac",
  "electrical",
  "building",
  "waste",
];

export const SYMBOL_CATEGORY_LABELS: Record<SymbolCategory, string> = {
  fire: "Fire protection",
  egress: "Evacuation & safety",
  hvac: "HVAC & plumbing",
  electrical: "Electrical & controls",
  building: "Building elements",
  waste: "Waste & environment",
};

export const SYMBOL_CATEGORY_COLORS: Record<SymbolCategory, string> = {
  fire: "#d3202a",
  egress: "#009b48",
  hvac: "#005eb8",
  electrical: "#f2a900",
  building: "#6b4fa0",
  waste: "#6e7b3a",
};

export const INSPECTION_STATUSES: InspectionStatus[] = [
  "approved",
  "not-approved",
  "action-required",
  "missing",
];

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  approved: "Approved",
  "not-approved": "Not approved",
  "action-required": "Action required",
  missing: "Missing",
};

export const INSPECTION_STATUS_COLORS: Record<InspectionStatus, string> = {
  approved: "#2fa573",
  "not-approved": "#d64545",
  "action-required": "#c08a12",
  missing: "#7a888e",
};

const SIGN_BADGE = { x: 57, y: 9, r: 5 };
const GLYPH_BADGE = { x: 52.5, y: 11.5, r: 5.5 };

const filled = (d: string, fillRule: "nonzero" | "evenodd" = "nonzero"): SymbolArtShape => ({
  d,
  fillRule,
});

const stroked = (d: string, strokeWidth = 4): SymbolArtShape => ({
  d,
  stroke: true,
  strokeWidth,
});

function rotateD(data: string, degrees: number, cx = 32, cy = 32): string {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return serializeSymbolPath(
    transformSymbolCommands(parseSymbolPath(data), (point) => ({
      x: cx + (point.x - cx) * cos - (point.y - cy) * sin,
      y: cy + (point.x - cx) * sin + (point.y - cy) * cos,
    })),
  );
}

function bandBetween(ax: number, ay: number, bx: number, by: number, thickness: number): string {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  const nx = (-dy / length) * (thickness / 2);
  const ny = (dx / length) * (thickness / 2);
  return `M ${(ax + nx).toFixed(3)} ${(ay + ny).toFixed(3)} L ${(bx + nx).toFixed(3)} ${(by + ny).toFixed(3)} L ${(bx - nx).toFixed(3)} ${(by - ny).toFixed(3)} L ${(ax - nx).toFixed(3)} ${(ay - ny).toFixed(3)} Z`;
}

function headBetween(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  length: number,
): string {
  const dx = bx - ax;
  const dy = by - ay;
  const distance = Math.hypot(dx, dy);
  const ux = dx / distance;
  const uy = dy / distance;
  const nx = (-uy * width) / 2;
  const ny = (ux * width) / 2;
  const tip = { x: bx + ux * length, y: by + uy * length };
  const base = { x: bx - ux * 2, y: by - uy * 2 };
  return `M ${tip.x.toFixed(3)} ${tip.y.toFixed(3)} L ${(base.x + nx).toFixed(3)} ${(base.y + ny).toFixed(3)} L ${(base.x - nx).toFixed(3)} ${(base.y - ny).toFixed(3)} Z`;
}

const RECYCLING_ARM = bandBetween(35.3, 19, 48, 39, 7);
const RECYCLING_HEAD = headBetween(35.3, 19, 48, 39, 16, 11);

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

/** Center the pictogram's combined bounds on the 32,32 plate centre. */
function centerArt(art: SymbolArt): SymbolArt {
  const bounds = symbolArtBounds(art);
  if (!Number.isFinite(bounds.minX)) return art;
  const dx = 32 - (bounds.minX + bounds.maxX) / 2;
  const dy = 32 - (bounds.minY + bounds.maxY) / 2;
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return art;
  return {
    ...art,
    shapes: art.shapes.map((shape) => ({
      ...shape,
      d: serializeSymbolPath(
        transformSymbolCommands(parseSymbolPath(shape.d), (point) => ({
          x: point.x + dx,
          y: point.y + dy,
        })),
      ),
    })),
  };
}

/**
 * Pilot artwork for the most-used safety signs. The shapes follow the familiar
 * sign-board grammar (a coloured plate with a white pictogram) but are original
 * drawings for GridScalr, not traced from an external sign or icon set.
 */
const SIGN_ART: Record<string, SymbolArt> = {
  "fire.extinguisher": {
    shapes: [
      filled(
        [roundedRectPathData(22, 22, 20, 30, 5), roundedRectPathData(27, 28, 10, 5, 2)].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(27, 17, 10, 8, 2)),
      filled(roundedRectPathData(25, 13, 14, 6, 2)),
      filled(roundedRectPathData(20, 7, 28, 6, 3)),
      filled(roundedRectPathData(31, 12, 6, 7, 2)),
      stroked("M 40 16 C 50 17 54 24 54 33 C 54 38 53 41 52 44", 4.2),
      filled(roundedRectPathData(47, 42, 9, 5, 2.5)),
      filled("M 48 47 H 55 L 51.5 52 Z"),
      filled(roundedRectPathData(20, 50, 24, 5, 2.5)),
    ],
  },
  "fire.hose": {
    shapes: [
      filled([circlePathData(31, 30, 18), circlePathData(31, 30, 12)].join(" "), "evenodd"),
      stroked("M 31 30 L 45 20", 3),
      filled(circlePathData(31, 30, 5)),
      filled(circlePathData(31, 30, 2)),
      stroked("M 45 24 L 50 19", 4),
      filled(roundedRectPathData(47, 15, 4, 4, 1.5)),
      filled(roundedRectPathData(28, 44, 6, 10, 1.5)),
    ],
  },
  "fire.blanket": {
    shapes: [
      filled(
        [roundedRectPathData(18, 8, 26, 40, 4), roundedRectPathData(23, 24, 16, 7, 2)].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(26, 46, 10, 11, 2)),
    ],
  },
  "fire.call-point": {
    shapes: [
      filled(
        [
          roundedRectPathData(12, 11, 36, 38, 5),
          roundedRectPathData(17, 16, 26, 28, 3),
          circlePathData(30, 30, 6),
          roundedRectPathData(28, 20, 4, 6, 2),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "fire.smoke-detector": {
    shapes: [
      filled([circlePathData(31, 36, 11), circlePathData(31, 36, 4)].join(" "), "evenodd"),
      stroked("M 16 26 Q 20 22 24 26", 3),
      stroked("M 28 19 Q 32 15 36 19", 3),
      stroked("M 40 12 Q 44 8 48 12", 3),
    ],
  },
  "egress.exit": {
    shapes: [
      filled(roundedRectPathData(4, 10, 12, 44, 2)),
      filled("M 38 28 H 30 V 22 L 18 31 L 30 40 V 34 H 38 Z"),
      filled(circlePathData(46, 18, 5)),
      stroked("M 46 24 L 42 37", 6.5),
      stroked("M 44 28 L 34 32", 5.5),
      stroked("M 44 28 L 52 34", 5),
      stroked("M 42 37 L 34 49", 6),
      stroked("M 42 37 L 50 46", 6),
    ],
  },
  "egress.assembly": {
    shapes: [
      filled(circlePathData(31, 13, 5)),
      stroked("M 31 19 L 31 34", 7),
      stroked("M 31 23 L 21 30", 4.5),
      stroked("M 31 23 L 41 30", 4.5),
      stroked("M 31 34 L 25 48", 5.5),
      stroked("M 31 34 L 37 48", 5.5),
      filled(circlePathData(15, 22, 4)),
      stroked("M 15 27 L 15 38", 5.5),
      stroked("M 15 30 L 10 35", 4),
      stroked("M 15 30 L 20 35", 4),
      stroked("M 15 38 L 11 48", 4.5),
      stroked("M 15 38 L 19 48", 4.5),
      filled(circlePathData(45, 22, 4)),
      stroked("M 45 27 L 45 38", 5.5),
      stroked("M 45 30 L 40 35", 4),
      stroked("M 45 30 L 50 35", 4),
      stroked("M 45 38 L 41 48", 4.5),
      stroked("M 45 38 L 49 48", 4.5),
    ],
  },
  "egress.aed": {
    shapes: [
      filled(
        [
          "M 31 52 C 19 44 12 36 12 27 C 12 19 17 14 24 14 C 28 14 30 16 31 19 C 32 16 34 14 38 14 C 45 14 50 19 50 27 C 50 36 43 44 31 52 Z",
          "M 34 20 L 25 35 L 31 35 L 28 45 L 38 30 L 32 30 Z",
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "egress.first-aid": {
    shapes: [filled("M 27 12 H 35 V 27 H 50 V 35 H 35 V 50 H 27 V 35 H 12 V 27 H 27 Z")],
  },
  "electrical.emergency-light": {
    shapes: [
      filled(roundedRectPathData(18, 12, 24, 10, 2.5)),
      stroked("M 22 27 L 20 35", 3),
      stroked("M 30 27 L 30 37", 3),
      stroked("M 38 27 L 40 35", 3),
      filled("M 18 44 H 36 V 38 L 50 47 L 36 56 V 50 H 18 Z"),
    ],
  },
  "hvac.supply": {
    shapes: [
      filled(
        [roundedRectPathData(8, 10, 42, 40, 4), roundedRectPathData(16, 18, 26, 24, 3)].join(" "),
        "evenodd",
      ),
      filled("M 26 30 H 32 V 22 H 37 L 29 12 L 21 22 H 26 Z"),
      filled("M 26 30 H 32 V 38 H 37 L 29 48 L 21 38 H 26 Z"),
      filled("M 29 27 V 33 H 21 V 38 L 11 30 L 21 22 V 27 Z"),
      filled("M 29 27 V 33 H 37 V 38 L 47 30 L 37 22 V 27 Z"),
    ],
  },
  "hvac.extract": {
    shapes: [
      filled(
        [roundedRectPathData(8, 10, 42, 40, 4), roundedRectPathData(16, 18, 26, 24, 3)].join(" "),
        "evenodd",
      ),
      filled("M 26 12 H 32 V 22 H 37 L 29 30 L 21 22 H 26 Z"),
      filled("M 26 48 H 32 V 38 H 37 L 29 30 L 21 38 H 26 Z"),
      filled("M 11 27 V 33 H 21 V 38 L 29 30 L 21 22 V 27 Z"),
      filled("M 47 27 V 33 H 37 V 38 L 29 30 L 37 22 V 27 Z"),
    ],
  },
  "hvac.valve": {
    shapes: [
      filled("M 8 18 L 29 30 L 8 42 Z"),
      filled("M 50 18 L 29 30 L 50 42 Z"),
      filled(roundedRectPathData(26, 14, 6, 18, 2)),
      filled(roundedRectPathData(18, 8, 22, 6, 3)),
    ],
  },
  "hvac.radiator": {
    shapes: [
      filled(
        [
          roundedRectPathData(8, 20, 42, 24, 3),
          roundedRectPathData(14, 24, 4, 16, 1.5),
          roundedRectPathData(21, 24, 4, 16, 1.5),
          roundedRectPathData(28, 24, 4, 16, 1.5),
          roundedRectPathData(35, 24, 4, 16, 1.5),
          roundedRectPathData(42, 24, 4, 16, 1.5),
        ].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(14, 44, 5, 5, 1.5)),
      filled(roundedRectPathData(39, 44, 5, 5, 1.5)),
    ],
  },
  "hvac.ahu": {
    shapes: [
      filled(
        [roundedRectPathData(8, 18, 42, 28, 4), roundedRectPathData(13, 23, 32, 18, 3)].join(" "),
        "evenodd",
      ),
      filled(
        [
          circlePathData(21, 32, 6),
          circlePathData(21, 32, 1.8),
          circlePathData(37, 32, 6),
          circlePathData(37, 32, 1.8),
        ].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(3, 29, 6, 6, 2)),
      filled(roundedRectPathData(49, 29, 6, 6, 2)),
    ],
  },
  "hvac.pump": {
    shapes: [
      filled([circlePathData(27, 30, 14), "M 18 21 L 37 30 L 18 39 Z"].join(" "), "evenodd"),
      filled(roundedRectPathData(41, 27, 10, 6, 2)),
    ],
  },
  "hvac.water-meter": {
    shapes: [
      filled([circlePathData(28, 30, 16), circlePathData(28, 30, 9)].join(" "), "evenodd"),
      filled(circlePathData(28, 30, 3.5)),
      stroked("M 28 30 L 38 22", 3.5),
      filled(roundedRectPathData(4, 27, 8, 6, 2)),
      filled(roundedRectPathData(44, 27, 8, 6, 2)),
    ],
  },
  "electrical.main-panel": {
    glyphColor: "#111111",
    shapes: [
      filled(
        [roundedRectPathData(8, 4, 43, 56, 6), roundedRectPathData(14, 10, 31, 44, 3)].join(" "),
        "evenodd",
      ),
      filled("M 33 15 L 22 34 L 29 34 L 26 49 L 39 29 L 31 29 Z"),
      filled(roundedRectPathData(41, 28, 3, 10, 1.5)),
    ],
  },
  "electrical.light": {
    glyphColor: "#111111",
    shapes: [
      filled([circlePathData(30, 30, 9), circlePathData(30, 30, 4)].join(" "), "evenodd"),
      stroked("M 30 18 L 30 12", 4),
      stroked("M 38.5 21.5 L 42.7 17.3", 4),
      stroked("M 42 30 L 48 30", 4),
      stroked("M 38.5 38.5 L 42.7 42.7", 4),
      stroked("M 30 42 L 30 48", 4),
      stroked("M 21.5 38.5 L 17.3 42.7", 4),
      stroked("M 18 30 L 12 30", 4),
      stroked("M 21.5 21.5 L 17.3 17.3", 4),
    ],
  },
  "electrical.access": {
    glyphColor: "#111111",
    shapes: [
      filled(
        [
          roundedRectPathData(18, 8, 24, 44, 4),
          circlePathData(24, 17, 1.6),
          circlePathData(30, 17, 1.6),
          circlePathData(36, 17, 1.6),
          circlePathData(24, 24, 1.6),
          circlePathData(30, 24, 1.6),
          circlePathData(36, 24, 1.6),
          circlePathData(24, 31, 1.6),
          circlePathData(30, 31, 1.6),
          circlePathData(36, 31, 1.6),
          roundedRectPathData(23, 40, 14, 4, 1.5),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "electrical.cctv": {
    glyphColor: "#111111",
    shapes: [
      filled(
        ["M 10 20 H 33 L 41 25 V 35 L 33 40 H 10 Z", circlePathData(34, 30, 4)].join(" "),
        "evenodd",
      ),
      filled(circlePathData(34, 30, 1.5)),
      filled(roundedRectPathData(18, 40, 5, 8, 1.5)),
      filled(roundedRectPathData(12, 48, 17, 4, 2)),
    ],
  },
  "building.window": {
    shapes: [
      filled(
        [
          roundedRectPathData(8, 10, 42, 40, 3),
          roundedRectPathData(13, 15, 14, 30, 2),
          roundedRectPathData(29, 15, 14, 30, 2),
        ].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(5, 50, 48, 6, 2)),
    ],
  },
  "building.door": {
    shapes: [
      filled(roundedRectPathData(14, 4, 36, 50, 3)),
      filled(
        [
          roundedRectPathData(14, 4, 36, 50, 3),
          roundedRectPathData(18, 10, 4, 38, 2),
          circlePathData(43, 32, 2.5),
        ].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(10, 54, 44, 4, 2)),
    ],
  },
  "building.damage": {
    shapes: [
      filled(
        [
          "M 30 6 Q 34 6 37 11 L 51 44 Q 54 49 48 52 L 12 52 Q 6 49 9 44 L 23 11 Q 26 6 30 6 Z",
          roundedRectPathData(27, 19, 6, 18, 3),
          circlePathData(30, 45, 3.5),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "building.elevator": {
    shapes: [
      filled(
        [roundedRectPathData(10, 4, 40, 52, 3), roundedRectPathData(16, 10, 28, 40, 2)].join(" "),
        "evenodd",
      ),
      filled("M 30 16 L 22 26 H 27 V 30 H 33 V 26 H 38 Z"),
      filled("M 30 44 L 22 34 H 27 V 30 H 33 V 34 H 38 Z"),
    ],
  },
  "waste.recycling": {
    shapes: [
      filled(RECYCLING_ARM),
      filled(RECYCLING_HEAD),
      filled(rotateD(RECYCLING_ARM, 120)),
      filled(rotateD(RECYCLING_HEAD, 120)),
      filled(rotateD(RECYCLING_ARM, 240)),
      filled(rotateD(RECYCLING_HEAD, 240)),
    ],
  },
  "waste.bins": {
    shapes: [
      filled(roundedRectPathData(7, 18, 14, 6, 2)),
      filled(roundedRectPathData(8, 24, 12, 24, 2)),
      filled(roundedRectPathData(23, 12, 14, 6, 2)),
      filled(roundedRectPathData(24, 18, 12, 30, 2)),
      filled(roundedRectPathData(39, 16, 14, 6, 2)),
      filled(roundedRectPathData(40, 22, 12, 26, 2)),
    ],
  },
  "waste.hazardous": {
    shapes: [
      filled(
        [
          "M 16 28 C 16 16 23 10 30 10 C 37 10 44 16 44 28 C 44 34 41 38 36 40 V 48 H 24 V 40 C 19 38 16 34 16 28 Z",
          circlePathData(23, 27, 4),
          circlePathData(37, 27, 4),
          "M 30 32 L 26 38 H 34 Z",
          roundedRectPathData(26, 43, 3, 5, 1),
          roundedRectPathData(31, 43, 3, 5, 1),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "waste.grease": {
    shapes: [
      filled(
        [roundedRectPathData(6, 14, 46, 28, 6), roundedRectPathData(12, 20, 34, 16, 3)].join(" "),
        "evenodd",
      ),
      stroked("M 14 28 Q 19 24 24 28 Q 29 32 34 28 Q 39 24 44 28", 4),
      filled("M 28 42 H 34 V 50 H 41 L 31 59 L 21 50 H 28 Z"),
    ],
  },
  "fire.door": {
    shapes: [
      filled(
        [
          roundedRectPathData(14, 4, 36, 52, 3),
          "M 30 14 C 25 21 24 28 28 33 C 24 32 24 37 27 41 C 29 45 34 47 37 43 C 40 39 39 33 36 29 C 37 34 34 36 33 33 C 35 27 33 20 30 14 Z",
          circlePathData(43, 32, 2.5),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "fire.heat-detector": {
    shapes: [
      filled(roundedRectPathData(27, 8, 6, 30, 3)),
      filled(circlePathData(30, 42, 7)),
      filled(roundedRectPathData(36, 16, 5, 3, 1.5)),
      filled(roundedRectPathData(36, 23, 5, 3, 1.5)),
      filled(roundedRectPathData(36, 30, 5, 3, 1.5)),
    ],
  },
  "fire.smoke-vent": {
    shapes: [
      filled(
        [roundedRectPathData(8, 40, 44, 12, 3), roundedRectPathData(14, 44, 32, 4, 2)].join(" "),
        "evenodd",
      ),
      filled("M 13 38 H 19 V 24 H 24 L 16 14 L 8 24 H 13 Z"),
      filled("M 27 38 H 33 V 24 H 38 L 30 14 L 22 24 H 27 Z"),
      filled("M 41 38 H 47 V 24 H 52 L 44 14 L 36 24 H 41 Z"),
    ],
  },
  "hvac.transfer": {
    shapes: [
      filled(
        [roundedRectPathData(8, 18, 44, 28, 4), roundedRectPathData(14, 24, 32, 16, 2)].join(" "),
        "evenodd",
      ),
      filled("M 18 25 H 32 V 23 L 38 28 L 32 33 V 31 H 18 Z"),
      filled("M 42 35 H 28 V 33 L 22 37 L 28 41 V 39 H 42 Z"),
    ],
  },
  "hvac.convector": {
    shapes: [
      filled(
        [
          roundedRectPathData(8, 22, 44, 20, 3),
          roundedRectPathData(14, 27, 32, 3, 1.5),
          roundedRectPathData(14, 33, 32, 3, 1.5),
          roundedRectPathData(14, 39, 32, 3, 1.5),
        ].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(14, 42, 5, 6, 1.5)),
      filled(roundedRectPathData(41, 42, 5, 6, 1.5)),
    ],
  },
  "hvac.cooling": {
    shapes: [
      filled(
        [roundedRectPathData(8, 18, 44, 28, 4), circlePathData(30, 32, 10)].join(" "),
        "evenodd",
      ),
      stroked("M 30 23 L 30 41", 3),
      stroked("M 22 27 L 38 37", 3),
      stroked("M 22 37 L 38 27", 3),
    ],
  },
  "hvac.heat-exchanger": {
    shapes: [
      filled(
        [roundedRectPathData(8, 18, 44, 28, 4), roundedRectPathData(14, 24, 32, 16, 2)].join(" "),
        "evenodd",
      ),
      stroked("M 15 32 L 21 25 L 27 39 L 33 25 L 39 39 L 45 32", 4),
    ],
  },
  "hvac.energy-meter": {
    shapes: [
      filled(
        [circlePathData(28, 30, 16), "M 33 18 L 24 31 L 30 31 L 27 42 L 38 27 L 31 27 Z"].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(4, 27, 8, 6, 2)),
      filled(roundedRectPathData(44, 27, 8, 6, 2)),
    ],
  },
  "hvac.expansion-vessel": {
    shapes: [
      filled(
        [roundedRectPathData(18, 8, 24, 40, 12), roundedRectPathData(22, 28, 16, 4, 2)].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(28, 48, 4, 8, 2)),
      filled(roundedRectPathData(20, 54, 20, 4, 2)),
    ],
  },
  "hvac.floor-drain": {
    shapes: [
      filled(
        [
          roundedRectPathData(10, 10, 40, 40, 3),
          roundedRectPathData(16, 16, 28, 3, 1.5),
          roundedRectPathData(16, 22, 28, 3, 1.5),
          roundedRectPathData(16, 37, 28, 3, 1.5),
          roundedRectPathData(16, 43, 28, 3, 1.5),
          circlePathData(30, 30, 4),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "hvac.oil-separator": {
    shapes: [
      filled(
        [roundedRectPathData(6, 14, 46, 28, 6), roundedRectPathData(12, 20, 34, 16, 3)].join(" "),
        "evenodd",
      ),
      filled("M 30 22 C 26 27 23 31 24 35 C 25 39 30 41 34 38 C 38 35 36 29 32 24 L 30 22 Z"),
      filled("M 28 42 H 34 V 50 H 41 L 31 59 L 21 50 H 28 Z"),
    ],
  },
  "electrical.fuse-cabinet": {
    glyphColor: "#111111",
    shapes: [
      filled(
        [roundedRectPathData(8, 4, 43, 56, 6), roundedRectPathData(14, 10, 31, 44, 3)].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(18, 16, 10, 5, 1.5)),
      filled(roundedRectPathData(31, 16, 10, 5, 1.5)),
      filled(roundedRectPathData(18, 24, 10, 5, 1.5)),
      filled(roundedRectPathData(31, 24, 10, 5, 1.5)),
      filled(roundedRectPathData(18, 32, 10, 5, 1.5)),
      filled(roundedRectPathData(31, 32, 10, 5, 1.5)),
      filled(roundedRectPathData(18, 40, 10, 5, 1.5)),
      filled(roundedRectPathData(31, 40, 10, 5, 1.5)),
      filled(roundedRectPathData(42, 28, 3, 10, 1.5)),
    ],
  },
  "electrical.outlet-230": {
    glyphColor: "#111111",
    shapes: [
      filled(
        [
          roundedRectPathData(16, 10, 28, 40, 5),
          roundedRectPathData(22, 20, 4, 10, 2),
          roundedRectPathData(34, 20, 4, 10, 2),
          roundedRectPathData(28, 38, 4, 6, 2),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "electrical.outlet-400": {
    glyphColor: "#111111",
    shapes: [
      filled(
        [
          roundedRectPathData(14, 10, 32, 40, 5),
          roundedRectPathData(20, 20, 4, 10, 2),
          roundedRectPathData(28, 20, 4, 10, 2),
          roundedRectPathData(36, 20, 4, 10, 2),
          roundedRectPathData(27, 38, 6, 6, 2),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "electrical.data-outlet": {
    glyphColor: "#111111",
    shapes: [
      filled(
        [
          roundedRectPathData(16, 10, 28, 40, 5),
          roundedRectPathData(22, 20, 16, 10, 1.5),
          roundedRectPathData(27, 30, 6, 4, 1.5),
          roundedRectPathData(22, 38, 16, 3, 1.5),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "electrical.temperature": {
    glyphColor: "#111111",
    shapes: [
      filled(roundedRectPathData(27, 10, 6, 28, 3)),
      filled([circlePathData(30, 43, 7), circlePathData(30, 43, 3.5)].join(" "), "evenodd"),
      filled(roundedRectPathData(36, 16, 5, 3, 1.5)),
      filled(roundedRectPathData(36, 23, 5, 3, 1.5)),
      filled(roundedRectPathData(36, 30, 5, 3, 1.5)),
    ],
  },
  "electrical.co2": {
    glyphColor: "#111111",
    shapes: [
      filled([circlePathData(30, 30, 16), circlePathData(30, 30, 12)].join(" "), "evenodd"),
      stroked("M 22 34 L 30 30 L 36 22", 3),
      filled(circlePathData(22, 34, 4)),
      filled(circlePathData(30, 30, 4)),
      filled(circlePathData(36, 22, 4)),
    ],
  },
  "electrical.humidity": {
    glyphColor: "#111111",
    shapes: [
      filled(
        [
          "M 30 8 C 24 18 18 26 18 34 C 18 42 23 48 30 48 C 37 48 42 42 42 34 C 42 26 36 18 30 8 Z",
          circlePathData(30, 36, 4),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "electrical.wifi": {
    glyphColor: "#111111",
    shapes: [
      stroked("M 14 32 Q 30 14 46 32", 5),
      stroked("M 20 38 Q 30 26 40 38", 5),
      filled(circlePathData(30, 45, 4)),
    ],
  },
  "building.stair-lift": {
    shapes: [
      stroked("M 6 54 H 16 V 46 H 26 V 38 H 36 V 30 H 46 V 22 H 56", 5),
      filled(roundedRectPathData(24, 26, 14, 5, 2)),
      filled(roundedRectPathData(24, 16, 5, 14, 2)),
      filled(roundedRectPathData(30, 31, 5, 7, 2)),
      filled(circlePathData(35, 38, 2.5)),
    ],
  },
  "building.dock": {
    shapes: [
      filled(roundedRectPathData(12, 18, 28, 14, 2)),
      filled(roundedRectPathData(40, 22, 10, 10, 2)),
      filled([circlePathData(20, 34, 4), circlePathData(20, 34, 1.5)].join(" "), "evenodd"),
      filled([circlePathData(42, 34, 4), circlePathData(42, 34, 1.5)].join(" "), "evenodd"),
      filled(roundedRectPathData(6, 40, 48, 6, 2)),
      filled(roundedRectPathData(10, 46, 4, 6, 1.5)),
      filled(roundedRectPathData(46, 46, 4, 6, 1.5)),
    ],
  },
  "waste.battery": {
    shapes: [
      filled(
        [
          roundedRectPathData(8, 24, 36, 24, 4),
          "M 17 34 H 21 V 30 H 25 V 34 H 29 V 38 H 25 V 42 H 21 V 38 H 17 Z",
          roundedRectPathData(32, 34, 8, 4, 1.5),
        ].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(44, 30, 8, 12, 2)),
    ],
  },
  "waste.chemical": {
    shapes: [
      filled(
        [
          roundedRectPathData(14, 8, 36, 46, 4),
          "M 27 16 H 33 V 24 L 40 40 Q 42 46 35 46 H 25 Q 18 46 20 40 L 27 24 Z",
          roundedRectPathData(44, 28, 2, 10, 1),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
};

/** Build a symbol definition from its stable metadata and its artwork. */
function meta(
  id: string,
  name: string,
  category: SymbolCategory,
  keywords: string[],
): SymbolDefinition {
  const art = SIGN_ART[id];
  if (!art) throw new Error(`Missing symbol artwork for ${id}`);
  return { id, name, category, keywords, art: centerArt(art) };
}

export const SYMBOLS: SymbolDefinition[] = [
  meta("fire.extinguisher", "Fire extinguisher", "fire", [
    "brandsläckare",
    "släckare",
    "pulver",
    "skum",
    "co2",
  ]),
  meta("fire.hose", "Fire hose reel", "fire", [
    "brandpost",
    "brandslang",
    "slangvinda",
    "inomhusbrandpost",
  ]),
  meta("fire.blanket", "Fire blanket", "fire", ["brandfilt", "filt", "släckfilt"]),
  meta("fire.call-point", "Manual call point", "fire", [
    "brandlarm",
    "larmknapp",
    "manuell larmknapp",
    "tryckknapp",
  ]),
  meta("fire.smoke-detector", "Smoke detector", "fire", [
    "rökdetektor",
    "brandvarnare",
    "detektor",
    "rök",
  ]),
  meta("fire.heat-detector", "Heat detector", "fire", [
    "värmdetektor",
    "termisk detektor",
    "värme",
  ]),
  meta("fire.door", "Fire door", "fire", ["branddörr", "dörr", "brandcellsgräns"]),
  meta("fire.smoke-vent", "Smoke vent", "fire", [
    "brandgasventilator",
    "rökventilation",
    "brandgas",
    "ventilator",
  ]),
  meta("egress.exit", "Emergency exit", "egress", [
    "utrymningsväg",
    "nödutgång",
    "utrymning",
    "grön gubbe",
    "exit",
  ]),
  meta("egress.assembly", "Assembly point", "egress", [
    "uppsamlingsplats",
    "samlingsplats",
    "mötesplats",
    "utrymning",
  ]),
  meta("egress.aed", "AED", "egress", ["hjärtstartare", "defibrillator", "aed", "första hjälpen"]),
  meta("egress.first-aid", "First aid", "egress", [
    "första hjälpen",
    "förband",
    "sjukvård",
    "kors",
  ]),
  meta("hvac.supply", "Supply air diffuser", "hvac", [
    "tilluftsdon",
    "tilluft",
    "don",
    "diffuser",
    "ftx",
  ]),
  meta("hvac.extract", "Extract air diffuser", "hvac", [
    "frånluftsdon",
    "frånluft",
    "don",
    "diffuser",
    "ftx",
  ]),
  meta("hvac.transfer", "Transfer air diffuser", "hvac", [
    "överluftsdon",
    "överluft",
    "transfer",
    "don",
  ]),
  meta("hvac.ahu", "Air handling unit", "hvac", [
    "ventilationsaggregat",
    "ftx",
    "aggregat",
    "ahu",
    "fläkt",
  ]),
  meta("hvac.valve", "Shut-off valve", "hvac", [
    "stängningsventil",
    "avstängningsventil",
    "ventil",
    "vatten",
    "värme",
    "gas",
  ]),
  meta("hvac.radiator", "Radiator", "hvac", ["radiator", "element", "värme"]),
  meta("hvac.convector", "Convector", "hvac", ["konvektor", "konvektionsbatteri", "värme"]),
  meta("hvac.cooling", "Cooling unit", "hvac", ["luftkylare", "kylbatteri", "kyla", "kylaggregat"]),
  meta("hvac.pump", "Circulation pump", "hvac", ["cirkulationspump", "pump", "vatten", "värme"]),
  meta("hvac.heat-exchanger", "Heat exchanger", "hvac", ["värmeväxlare", "värme", "växlare"]),
  meta("hvac.water-meter", "Water meter", "hvac", ["vattenmätare", "mätare", "vatten"]),
  meta("hvac.energy-meter", "Energy meter", "hvac", [
    "energimätare",
    "elmätare",
    "mätare",
    "energi",
  ]),
  meta("hvac.expansion-vessel", "Expansion vessel", "hvac", [
    "expansionskärl",
    "kärl",
    "värme",
    "vatten",
  ]),
  meta("hvac.floor-drain", "Floor drain", "hvac", ["golvbrunn", "brunn", "avlopp", "dränering"]),
  meta("hvac.oil-separator", "Oil separator", "hvac", [
    "oljeavskiljare",
    "olja",
    "avskiljare",
    "avlopp",
  ]),
  meta("electrical.main-panel", "Main electrical panel", "electrical", [
    "elcentral",
    "huvudcentral",
    "plc",
    "duc",
    "el",
  ]),
  meta("electrical.fuse-cabinet", "Fuse cabinet", "electrical", [
    "säkringsskåp",
    "gruppcentral",
    "säkring",
    "el",
  ]),
  meta("electrical.outlet-230", "Wall outlet 230 V", "electrical", [
    "vägguttag",
    "uttag",
    "230v",
    "eluttag",
  ]),
  meta("electrical.outlet-400", "Wall outlet 400 V", "electrical", [
    "vägguttag",
    "uttag",
    "400v",
    "kraftuttag",
    "eluttag",
  ]),
  meta("electrical.data-outlet", "Data outlet", "electrical", [
    "datauttag",
    "nätverk",
    "rj45",
    "uttag",
    "tele",
  ]),
  meta("electrical.light", "Lighting fixture", "electrical", [
    "belysning",
    "armatur",
    "lampa",
    "standard",
  ]),
  meta("electrical.emergency-light", "Emergency lighting", "egress", [
    "nödbelysning",
    "nödljus",
    "belysning",
    "säkerhet",
  ]),
  meta("electrical.access", "Access control", "electrical", [
    "passagekontroll",
    "kortläsare",
    "porttelefon",
    "passage",
  ]),
  meta("electrical.cctv", "CCTV camera", "electrical", [
    "kamera",
    "cctv",
    "övervakning",
    "kameraövervakning",
  ]),
  meta("electrical.temperature", "Temperature sensor", "electrical", [
    "temperaturgivare",
    "temperatur",
    "givare",
    "termometer",
  ]),
  meta("electrical.co2", "CO₂ sensor", "electrical", [
    "co2-givare",
    "koldioxid",
    "co2",
    "givare",
    "ventilation",
  ]),
  meta("electrical.humidity", "Humidity sensor", "electrical", [
    "fuktgivare",
    "fukt",
    "luftfuktighet",
    "givare",
  ]),
  meta("electrical.wifi", "Wi-Fi access point", "electrical", [
    "wifi",
    "accesspunkt",
    "ap",
    "nätverk",
    "trådlös",
  ]),
  meta("building.window", "Window", "building", ["fönster", "fönsterbåge", "glas", "skadad"]),
  meta("building.door", "Door", "building", ["dörr", "dörrblad", "kräver justering", "tröskel"]),
  meta("building.damage", "Damage marker", "building", [
    "skada",
    "anmärkning",
    "fukt",
    "spricka",
    "slitage",
    "varning",
  ]),
  meta("building.elevator", "Elevator", "building", ["hiss", "personhiss", "transport"]),
  meta("building.stair-lift", "Stair lift", "building", [
    "trapphiss",
    "stolhiss",
    "trappa",
    "tillgänglighet",
  ]),
  meta("building.dock", "Loading dock", "building", ["lastbrygga", "lastkaj", "dock", "lastning"]),
  meta("waste.recycling", "Recycling", "waste", [
    "återvinning",
    "miljörum",
    "källsortering",
    "sortering",
  ]),
  meta("waste.bins", "Sorting bins", "waste", [
    "källsorteringskärl",
    "sortering",
    "kärl",
    "avfall",
    "miljörum",
  ]),
  meta("waste.hazardous", "Hazardous waste", "waste", [
    "farligt avfall",
    "miljöfarligt",
    "avfall",
    "varning",
  ]),
  meta("waste.battery", "Battery collection", "waste", [
    "batteri",
    "batteriholk",
    "farligt avfall",
    "återvinning",
  ]),
  meta("waste.chemical", "Chemical cabinet", "waste", [
    "kemikalieskåp",
    "kemikalier",
    "förvaring",
    "farligt avfall",
  ]),
  meta("waste.grease", "Grease separator", "waste", [
    "fettavskiljare",
    "fett",
    "avskiljare",
    "avlopp",
    "miljö",
  ]),
];

const SYMBOL_MAP = new Map(SYMBOLS.map((symbol) => [symbol.id, symbol]));

export const UNKNOWN_SYMBOL: SymbolDefinition = {
  id: "unknown",
  name: "Unknown symbol",
  category: "building",
  keywords: ["unknown", "missing"],
  art: centerArt({
    shapes: [
      filled(
        [roundedRectPathData(8, 8, 48, 48, 7), roundedRectPathData(15, 15, 34, 34, 4)].join(" "),
        "evenodd",
      ),
      stroked("M 23 23 L 41 41", 6),
      stroked("M 41 23 L 23 41", 6),
    ],
    badge: SIGN_BADGE,
  }),
};

export function symbolFor(id: string | undefined): SymbolDefinition {
  return (id ? SYMBOL_MAP.get(id) : undefined) ?? UNKNOWN_SYMBOL;
}

export function hasSymbol(id: string | undefined): boolean {
  return Boolean(id && SYMBOL_MAP.has(id));
}

export function symbolName(id: string | undefined): string {
  return symbolFor(id).name;
}

export function symbolCategoryOf(id: string | undefined): SymbolCategory {
  return symbolFor(id).category;
}

export function symbolCategoryLabel(category: SymbolCategory | undefined): string {
  return category ? SYMBOL_CATEGORY_LABELS[category] : "Uncategorized";
}

export function symbolCategoryColor(category: SymbolCategory | undefined): string {
  return category ? SYMBOL_CATEGORY_COLORS[category] : "#9aa8ae";
}

export function inspectionStatusLabel(status: InspectionStatus | undefined): string {
  return status ? INSPECTION_STATUS_LABELS[status] : "Not assessed";
}

export function inspectionStatusColor(status: InspectionStatus | undefined): string {
  return status ? INSPECTION_STATUS_COLORS[status] : "#9aa8ae";
}

export function isInspectionStatus(value: unknown): value is InspectionStatus {
  return typeof value === "string" && INSPECTION_STATUSES.includes(value as InspectionStatus);
}

/** Shared render plan for the canvas, the library markup and the PDF export. */
export function symbolRenderPlan(
  symbol: SymbolDefinition,
  accent: string,
  style: SymbolStyle = SYMBOL_STYLE,
): SymbolRenderPlan {
  const shapes: SymbolRenderShape[] = [];
  const isSign = style === "sign";
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
      strokeWidth: entry.stroke ? (entry.strokeWidth ?? 4) : 0,
      fillRule: entry.fillRule ?? "nonzero",
      scale: 1,
    });
  }
  return {
    shapes,
    badge: symbol.art.badge ?? (isSign ? SIGN_BADGE : GLYPH_BADGE),
    viewBox: SYMBOL_VIEWBOX,
  };
}

/** SVG markup for the symbol library and help screenshots. */
export function symbolSvgMarkup(
  symbol: SymbolDefinition,
  size = 24,
  color = "#e8eef1",
  style: SymbolStyle = SYMBOL_STYLE,
): string {
  const plan = symbolRenderPlan(symbol, color, style);
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
        ? ` stroke-width="${shape.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
        : "";
      return `<path d="${shape.d}" fill="${fill}"${fillRule} stroke="${stroke}"${strokeAttrs}${transform}/>`;
    })
    .join("");
  return `<svg class="symbol-glyph" width="${size}" height="${size}" viewBox="0 0 ${SYMBOL_VIEWBOX} ${SYMBOL_VIEWBOX}" aria-hidden="true">${pathMarkup}</svg>`;
}

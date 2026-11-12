import type { SymbolDefinition } from "../../types";
import {
  stroke,
  fill,
  joinPaths,
  linePath,
  polyPath,
  rectPath,
  smallCircle,
  schematicSymbol,
  inlinePorts,
} from "../primitives";

/**
 * Reference-aligned general symbols, split out by category.
 */

export const GENERAL_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.resistor",
    category: "general",
    keywords: ["resistans", "resistor", "motstånd", "r"],
    tagPrefix: "R",
    ports: [
      { id: "top", x: 32, y: 2, direction: "in" },
      { id: "bottom", x: 32, y: 62, direction: "out" },
    ],
    shapes: [
      stroke(joinPaths(rectPath(28, 18, 8, 24), linePath(32, 2, 32, 18), linePath(32, 42, 32, 62))),
    ],
  }),
  schematicSymbol({
    id: "schematic.potentiometer",
    category: "general",
    keywords: ["potentiometer", "pot", "motstånd", "rp"],
    tagPrefix: "RP",
    ports: inlinePorts(),
    shapes: [
      stroke(joinPaths(rectPath(20, 30, 24, 8), linePath(2, 34, 20, 34), linePath(44, 34, 62, 34))),
      stroke(joinPaths(linePath(32, 12, 32, 30), polyPath([27, 24, 32, 31, 37, 24], true))),
      fill(smallCircle(20, 34, 2.2)),
      fill(smallCircle(44, 34, 2.2)),
    ],
  }),
  schematicSymbol({
    id: "schematic.lamp",
    category: "general",
    keywords: ["lampa", "lamp", "belysning", "l"],
    tagPrefix: "L",
    ports: inlinePorts(),
    shapes: [
      stroke(joinPaths(smallCircle(32, 32, 9), linePath(26, 26, 38, 38), linePath(38, 26, 26, 38))),
      stroke(joinPaths(linePath(2, 32, 23, 32), linePath(41, 32, 62, 32))),
    ],
  }),
  schematicSymbol({
    id: "schematic.timer",
    category: "general",
    keywords: ["tidur", "timer", "tid", "t"],
    tagPrefix: "T",
    ports: [
      { id: "top", x: 32, y: 2, direction: "in" },
      { id: "bottom", x: 32, y: 62, direction: "out" },
    ],
    shapes: [
      stroke(
        joinPaths(rectPath(20, 24, 24, 16), linePath(32, 2, 32, 24), linePath(32, 40, 32, 62)),
      ),
      stroke(smallCircle(32, 32, 5)),
    ],
  }),
  schematicSymbol({
    id: "schematic.signal-converter",
    category: "general",
    keywords: ["signalomvandlare", "signal converter", "signal", "omvandlare"],
    tagPrefix: "SO",
    ports: inlinePorts(),
    shapes: [stroke(joinPaths(rectPath(20, 20, 24, 24), linePath(20, 44, 44, 20)))],
  }),

  // --- Flow direction ----------------------------------------------------
  schematicSymbol({
    id: "schematic.flow-arrow",
    category: "general",
    keywords: ["flödespil", "flöde", "riktning", "flow arrow", "flow", "direction", "pil"],
    tagPrefix: "FL",
    defaultSize: 24,
    ports: [{ id: "flow", x: 32, y: 32, direction: "out" }],
    shapes: [stroke("M 22 18 L 42 32 L 22 46")],
  }),
  schematicSymbol({
    id: "schematic.flow-arrow-thick",
    category: "general",
    keywords: [
      "flödespil",
      "tjock",
      "flöde",
      "riktning",
      "flow arrow",
      "thick",
      "flow",
      "direction",
      "pil",
    ],
    tagPrefix: "FL",
    defaultSize: 24,
    fixedStrokeWidth: 1.2,
    ports: [{ id: "flow", x: 32, y: 32, direction: "out" }],
    shapes: [stroke("M 22 18 L 42 32 L 22 46")],
  }),
];

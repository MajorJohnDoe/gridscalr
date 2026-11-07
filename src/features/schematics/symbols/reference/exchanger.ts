import type { SymbolDefinition } from "../../../../model/symbols";
import { stroke, joinPaths, rectPath, schematicSymbol } from "../primitives";

/**
 * Reference-aligned exchanger symbols, split out by category.
 */

export const EXCHANGER_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.cross-flow-recovery",
    category: "exchanger",
    keywords: [
      "korsströmsvärmeväxlare",
      "cross-flow heat exchanger",
      "återvinning",
      "värmeväxlare",
    ],
    tagPrefix: "VVX",
    ports: [
      { id: "in", x: 22, y: 2, direction: "in" },
      { id: "out", x: 42, y: 62, direction: "out" },
    ],
    shapes: [
      stroke(rectPath(22, 10, 20, 44)),
      stroke(joinPaths("M 22 16 L 42 24 L 22 32 L 42 40 L 22 48")),
      stroke(joinPaths("M 42 16 L 22 24 L 42 32 L 22 40 L 42 48")),
    ],
  }),
];

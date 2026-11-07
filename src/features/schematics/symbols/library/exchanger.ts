import type { SymbolDefinition } from "../../../../model/symbols";
import {
  stroke,
  joinPaths,
  linePath,
  rectPath,
  ductCasing,
  coilPath,
  schematicSymbol,
  inlinePorts,
} from "../primitives";

/**
 * exchanger symbols, split out of the schematic library by category.
 */

export const EXCHANGER_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.plate-heat-exchanger",
    category: "exchanger",
    keywords: ["plattvärmeväxlare", "plate heat exchanger", "värmeväxlare", "platt", "pvx"],
    tagPrefix: "PVX",
    ports: [
      { id: "primaryIn", x: 24, y: 8, direction: "in" },
      { id: "primaryOut", x: 40, y: 56, direction: "out" },
      { id: "secondaryIn", x: 40, y: 8, direction: "in" },
      { id: "secondaryOut", x: 24, y: 56, direction: "out" },
    ],
    shapes: [
      stroke(rectPath(24, 8, 16, 48)),
      stroke(joinPaths("M 24 8 L 40 56", "M 40 8 L 24 56")),
    ],
  }),
  schematicSymbol({
    id: "schematic.rotary-recovery",
    category: "exchanger",
    keywords: ["roterande återvinning", "rotary recovery", "återvinning", "roterande", "rx"],
    tagPrefix: "RX",
    ports: [
      { id: "primaryIn", x: 24, y: 8, direction: "in" },
      { id: "primaryOut", x: 40, y: 56, direction: "out" },
      { id: "secondaryIn", x: 40, y: 8, direction: "in" },
      { id: "secondaryOut", x: 24, y: 56, direction: "out" },
    ],
    shapes: [
      stroke(rectPath(24, 8, 16, 48)),
      stroke(
        "M 32 18 C 36.418 18 40 24.268 40 32 C 40 39.732 36.418 46 32 46 C 27.582 46 24 39.732 24 32 C 24 24.268 27.582 18 32 18 Z",
      ),
      stroke(joinPaths("M 25 25 C 25 12 39 12 39 25", "M 39 25 L 34 22 M 39 25 L 36 30")),
    ],
  }),
  schematicSymbol({
    id: "schematic.battery-recovery",
    category: "exchanger",
    keywords: ["batteriåtervinning", "battery recovery", "återvinning", "batteri", "bx"],
    tagPrefix: "BX",
    ports: inlinePorts(),
    shapes: [
      stroke(ductCasing(16, 32)),
      stroke(
        joinPaths(
          coilPath(21, 43, 9, 27),
          coilPath(21, 43, 37, 55),
          linePath(2, 32, 9, 32),
          linePath(55, 32, 62, 32),
        ),
      ),
    ],
  }),

  // --- Ventilation -------------------------------------------------------
];

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
      stroke(rectPath(22, 4, 20, 56)),
      stroke(
        joinPaths(
          "M 38 40 C 38 50 35.5 57 32 57 C 28.5 57 26 50 26 36 C 26 22 28.5 9 32 9 C 35.5 9 38 22 38 32",
          "M 34.5 25 L 38 32 L 41.5 25",
        ),
      ),
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

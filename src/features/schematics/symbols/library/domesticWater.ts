import type { SymbolDefinition } from "../../../../model/symbols";
import {
  stroke,
  fill,
  joinPaths,
  linePath,
  polyPath,
  smallCircle,
  coilPath,
  schematicSymbol,
} from "../primitives";
import { roundedRectPathData } from "../../../../model/symbolPaths";
import { INLINE_PORTS, pumpBody } from "./parts";

/**
 * domestic water symbols, split out of the schematic library by category.
 */

export const DOMESTIC_WATER_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.water-heater",
    category: "domestic-water",
    keywords: ["varmvattenberedare", "water heater", "beredare", "tappvatten", "vvb"],
    tagPrefix: "VVB",
    ports: [
      { id: "coldIn", x: 22, y: 62, direction: "in" },
      { id: "hotOut", x: 42, y: 62, direction: "out" },
    ],
    shapes: [
      stroke(roundedRectPathData(16, 8, 32, 46, 8)),
      stroke(coilPath(18, 44, 20, 44)),
      stroke(joinPaths(linePath(22, 54, 22, 62), linePath(42, 54, 42, 62))),
    ],
  }),
  schematicSymbol({
    id: "schematic.mixing-valve",
    category: "domestic-water",
    keywords: ["blandningsventil", "mixing valve", "blandning", "tappvatten", "mbv"],
    tagPrefix: "MBV",
    ports: [
      { id: "hot", x: 20, y: 20, direction: "in" },
      { id: "cold", x: 20, y: 44, direction: "in" },
      { id: "mixed", x: 46, y: 32, direction: "out" },
    ],
    shapes: [stroke(joinPaths(polyPath([20, 18, 46, 32, 20, 46], true), linePath(28, 20, 28, 44)))],
  }),
  schematicSymbol({
    id: "schematic.single-lever-mixer",
    category: "domestic-water",
    keywords: [
      "enspaksblandare",
      "blandare",
      "kran",
      "mixer",
      "single lever mixer",
      "tap",
      "faucet",
      "tappvatten",
    ],
    tagPrefix: "K",
    ports: [
      { id: "hot", x: 24.5, y: 52, direction: "in" },
      { id: "cold", x: 39.5, y: 52, direction: "in" },
    ],
    shapes: [
      stroke(
        joinPaths(
          roundedRectPathData(16, 40, 32, 7, 2),
          roundedRectPathData(21, 47, 7, 5, 1),
          roundedRectPathData(36, 47, 7, 5, 1),
          "M 32 40 V 20 C 32 12 46 12 48 18 L 48 27",
          "M 45 27 H 52",
          linePath(32, 38, 38, 33),
        ),
      ),
      fill(smallCircle(32, 38, 2.2)),
    ],
  }),
  schematicSymbol({
    id: "schematic.domestic-water-pump",
    category: "domestic-water",
    keywords: ["tappvattenpump", "domestic water pump", "pump", "tappvatten", "tp"],
    tagPrefix: "TP",
    ports: INLINE_PORTS(),
    shapes: [
      stroke(pumpBody()),
      stroke(
        joinPaths(
          "M 22 26 C 26 22 30 30 34 26 C 38 22 42 30 44 26",
          "M 22 38 C 26 34 30 42 34 38 C 38 34 42 42 44 38",
        ),
      ),
    ],
  }),

  // --- Control and electrical -------------------------------------------
];

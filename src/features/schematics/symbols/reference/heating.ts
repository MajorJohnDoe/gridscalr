import type { SymbolDefinition } from "../../../../model/symbols";
import {
  stroke,
  joinPaths,
  linePath,
  polyPath,
  rectPath,
  smallCircle,
  schematicSymbol,
  inlinePorts,
} from "../primitives";

/**
 * Reference-aligned heating symbols, split out by category.
 */

export const HEATING_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.electric-air-heater",
    category: "heating",
    keywords: ["elektrisk luftvärmare", "electric air heater", "elvärmare", "värme"],
    tagPrefix: "EVB",
    ports: inlinePorts(),
    shapes: [
      stroke(rectPath(14, 14, 36, 36)),
      stroke(polyPath([32, 18, 38, 18, 30, 31, 38, 31, 26, 46, 30, 34, 24, 34, 32, 18])),
    ],
  }),
  schematicSymbol({
    id: "schematic.combined-coil",
    category: "heating",
    keywords: ["kombinerat värme- och kylbatteri", "combined heat and cooling coil", "batteri"],
    tagPrefix: "KVB",
    ports: inlinePorts(),
    shapes: [
      stroke(rectPath(14, 14, 36, 36)),
      stroke(joinPaths(smallCircle(23, 23, 5), linePath(19, 23, 27, 23), linePath(23, 19, 23, 27))),
      stroke(joinPaths(smallCircle(41, 41, 5), linePath(37, 41, 45, 41))),
    ],
  }),
  schematicSymbol({
    id: "schematic.boiler",
    category: "heating",
    keywords: ["panna", "boiler", "värme", "p"],
    tagPrefix: "P",
    ports: inlinePorts(),
    shapes: [stroke(rectPath(22, 22, 20, 20))],
  }),
];

import type { SymbolDefinition } from "../../types";
import {
  stroke,
  joinPaths,
  linePath,
  rectPath,
  smallCircle,
  schematicSymbol,
  inlinePorts,
} from "../primitives";

/**
 * cooling symbols, split out of the schematic library by category.
 */

export const COOLING_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.chiller",
    category: "cooling",
    keywords: ["kylmaskin", "chiller", "kyla", "kylaggregat", "km"],
    tagPrefix: "KM",
    ports: inlinePorts(),
    shapes: [
      stroke(rectPath(10, 14, 44, 36)),
      stroke(joinPaths(smallCircle(30, 28, 8), linePath(30, 28, 36, 22))),
      stroke(
        joinPaths(
          linePath(14, 42, 50, 42),
          linePath(18, 38, 18, 46),
          linePath(26, 38, 26, 46),
          linePath(34, 38, 34, 46),
          linePath(42, 38, 42, 46),
          linePath(2, 34, 10, 34),
          linePath(54, 34, 62, 34),
        ),
      ),
    ],
  }),

  // --- Domestic water ----------------------------------------------------
];

import type { SymbolDefinition } from "../../../../model/symbols";
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
 * Reference-aligned ventilation symbols, split out by category.
 */

export const VENTILATION_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.compressor",
    category: "ventilation",
    keywords: ["kompressor", "compressor", "kyla", "kom"],
    tagPrefix: "KOM",
    ports: inlinePorts(),
    shapes: [
      stroke(rectPath(10, 20, 44, 24)),
      stroke(smallCircle(32, 32, 10)),
      stroke(joinPaths(linePath(14, 26, 26, 26), linePath(38, 38, 50, 38))),
    ],
  }),
  schematicSymbol({
    id: "schematic.humidifier",
    category: "ventilation",
    keywords: ["fuktare", "humidifier", "fukt", "ventilation"],
    tagPrefix: "BEF",
    ports: inlinePorts(),
    shapes: [
      stroke(rectPath(14, 14, 36, 36)),
      stroke(joinPaths(linePath(44, 20, 34, 34), polyPath([30, 30, 34, 40, 40, 32], true))),
    ],
  }),
  schematicSymbol({
    id: "schematic.damper-actuator",
    category: "ventilation",
    keywords: ["spjäll med ställdon", "damper with actuator", "spjäll", "ställdon"],
    tagPrefix: "SP",
    ports: inlinePorts(),
    shapes: [
      stroke(rectPath(14, 14, 36, 24)),
      stroke(linePath(32, 20, 32, 32)),
      fill(smallCircle(32, 32, 2.4)),
      stroke(joinPaths(linePath(32, 38, 32, 46), smallCircle(32, 50, 4))),
    ],
  }),
  schematicSymbol({
    id: "schematic.modulating-damper",
    category: "ventilation",
    keywords: ["modulerande spjäll", "modulating damper", "spjäll", "ställdon"],
    tagPrefix: "SP",
    ports: inlinePorts(),
    shapes: [
      stroke(rectPath(14, 14, 36, 24)),
      stroke(linePath(20, 38, 44, 16)),
      stroke(joinPaths(linePath(32, 38, 32, 46), smallCircle(32, 50, 4))),
    ],
  }),

  // --- Electrical contacts ----------------------------------------------
];

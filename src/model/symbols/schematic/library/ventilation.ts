import type { SymbolDefinition } from "../../types";
import {
  stroke,
  joinPaths,
  linePath,
  polyPath,
  rectPath,
  smallCircle,
  ductCasing,
  ductPorts,
  schematicSymbol,
  inlinePorts,
} from "../primitives";

/**
 * ventilation symbols, split out of the schematic library by category.
 */

export const VENTILATION_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.drain-silencer",
    category: "ventilation",
    keywords: ["dränljuddämpare", "drain silencer", "ljuddämpare", "drän", "dld"],
    tagPrefix: "DLD",
    ports: ductPorts(32),
    shapes: [
      stroke(
        joinPaths(rectPath(14, 14, 36, 36), linePath(26, 14, 26, 50), linePath(38, 14, 38, 50)),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.exhaust-silencer",
    category: "ventilation",
    keywords: ["frånluftsljuddämpare", "exhaust silencer", "ljuddämpare", "frånluft", "eld"],
    tagPrefix: "ELD",
    ports: ductPorts(32),
    shapes: [
      stroke(
        joinPaths(
          rectPath(14, 14, 36, 36),
          linePath(26, 14, 26, 30),
          linePath(26, 34, 26, 50),
          linePath(38, 14, 38, 30),
          linePath(38, 34, 38, 50),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.compressor-vacuum-pump",
    category: "ventilation",
    keywords: ["kompressor", "vakuumpump", "compressor", "vacuum pump", "vakuum", "kvp"],
    tagPrefix: "KVP",
    ports: inlinePorts(),
    shapes: [
      stroke(
        joinPaths(smallCircle(32, 32, 16), linePath(20, 22, 48, 29), linePath(19, 41, 47, 36)),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.axial-fan",
    category: "ventilation",
    keywords: ["axialfläkt", "axial fan", "fläkt", "axial", "af"],
    tagPrefix: "AF",
    ports: ductPorts(32),
    shapes: [
      stroke(ductCasing(20, 24)),
      stroke(smallCircle(32, 32, 13)),
      stroke(
        joinPaths(
          linePath(32, 19, 32, 45),
          linePath(21, 38, 43, 26),
          linePath(21, 26, 43, 38),
          smallCircle(32, 32, 3),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.radial-fan",
    category: "ventilation",
    keywords: ["radialfläkt", "radial fan", "fläkt", "radial", "rf"],
    tagPrefix: "RF",
    ports: [
      { id: "in", x: 12, y: 38, direction: "in" },
      { id: "out", x: 50, y: 20, direction: "out" },
    ],
    shapes: [
      stroke(smallCircle(28, 38, 16)),
      stroke(joinPaths(rectPath(40, 20, 20, 12), linePath(40, 26, 28, 30))),
      stroke(joinPaths(linePath(31, 38, 46, 38), linePath(46, 38, 46, 26))),
    ],
  }),
  schematicSymbol({
    id: "schematic.duct",
    category: "ventilation",
    keywords: ["kanal", "duct", "ventilationskanal", "kan"],
    tagPrefix: "KAN",
    ports: ductPorts(32),
    shapes: [
      stroke(joinPaths(linePath(4, 24, 60, 24), linePath(4, 40, 60, 40))),
      stroke(joinPaths(linePath(4, 24, 4, 40), linePath(60, 24, 60, 40))),
      stroke(joinPaths(linePath(20, 32, 44, 32), polyPath([39, 28, 45, 32, 39, 36], true))),
    ],
  }),
  schematicSymbol({
    id: "schematic.roof-hood",
    category: "ventilation",
    keywords: ["takhuv", "roof hood", "tak", "huv", "th"],
    tagPrefix: "TH",
    ports: [{ id: "duct", x: 32, y: 60, direction: "in" }],
    shapes: [
      stroke(joinPaths(linePath(28, 60, 28, 40), linePath(36, 60, 36, 40))),
      stroke(polyPath([16, 40, 32, 18, 48, 40], true)),
      stroke(linePath(12, 40, 52, 40)),
    ],
  }),
  schematicSymbol({
    id: "schematic.outdoor-intake",
    category: "ventilation",
    keywords: ["uteluftsintag", "outdoor air intake", "uteluft", "intag", "ui"],
    tagPrefix: "UI",
    ports: [{ id: "out", x: 50, y: 32, direction: "out" }],
    shapes: [
      stroke(rectPath(10, 18, 40, 28)),
      stroke(
        joinPaths(
          linePath(18, 20, 18, 44),
          linePath(26, 20, 26, 44),
          linePath(34, 20, 34, 44),
          linePath(42, 20, 42, 44),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.exhaust-air",
    category: "ventilation",
    keywords: ["avluft", "exhaust air", "avluftning", "utlopp", "al"],
    tagPrefix: "AL",
    ports: [{ id: "in", x: 2, y: 36, direction: "in" }],
    shapes: [
      stroke(ductCasing(26, 20)),
      stroke(
        joinPaths(
          linePath(2, 36, 10, 36),
          linePath(32, 24, 32, 6),
          polyPath([26, 12, 32, 4, 38, 12], true),
          linePath(46, 24, 46, 12),
          polyPath([42, 16, 46, 10, 50, 16], true),
        ),
      ),
    ],
  }),

  // --- Heating -----------------------------------------------------------
];

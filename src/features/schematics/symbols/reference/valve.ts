import type { SymbolDefinition } from "../../../../model/symbols";
import {
  stroke,
  joinPaths,
  linePath,
  polyPath,
  smallCircle,
  valvePorts,
  schematicSymbol,
} from "../primitives";

/**
 * Reference-aligned valve symbols, split out by category.
 */

function valveBody(): string {
  return joinPaths(
    polyPath([18, 22, 32, 32, 18, 42], true),
    polyPath([46, 22, 32, 32, 46, 42], true),
  );
}

export const VALVE_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.four-way-valve",
    category: "valve",
    keywords: ["fyravägsventil", "four-way valve", "4-väg", "ventil", "4v"],
    tagPrefix: "4V",
    ports: [
      { id: "top", x: 32, y: 20, direction: "both" },
      { id: "bottom", x: 32, y: 44, direction: "both" },
      { id: "left", x: 20, y: 32, direction: "both" },
      { id: "right", x: 44, y: 32, direction: "both" },
    ],
    shapes: [
      stroke(
        joinPaths(
          polyPath([20, 24, 32, 32, 20, 40], true),
          polyPath([44, 24, 32, 32, 44, 40], true),
          polyPath([24, 20, 32, 32, 40, 20], true),
          polyPath([24, 44, 32, 32, 40, 44], true),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.water-tap",
    category: "valve",
    keywords: ["tappställe vatten", "water tap", "tappställe", "vatten"],
    tagPrefix: "TAP",
    ports: [{ id: "pipe", x: 32, y: 56, direction: "both" }],
    shapes: [stroke(joinPaths(linePath(32, 56, 32, 18), smallCircle(32, 14, 3)))],
  }),
  schematicSymbol({
    id: "schematic.hand-valve",
    category: "valve",
    keywords: ["handmanövrerad ventil", "hand valve", "ventil", "hand"],
    tagPrefix: "HV",
    ports: valvePorts(),
    shapes: [
      stroke(valveBody()),
      stroke(joinPaths(linePath(32, 32, 32, 12), linePath(24, 12, 40, 12))),
    ],
  }),
  schematicSymbol({
    id: "schematic.solenoid-valve",
    category: "valve",
    keywords: ["magnetventil", "solenoid valve", "ventil", "magnet", "mv"],
    tagPrefix: "MV",
    ports: valvePorts(),
    shapes: [
      stroke(valveBody()),
      stroke(joinPaths(linePath(32, 32, 32, 16), smallCircle(32, 10, 5))),
      stroke(polyPath([27, 13, 37, 8, 31, 7, 37, 4])),
    ],
  }),
  schematicSymbol({
    id: "schematic.self-acting-valve",
    category: "valve",
    keywords: ["självverkande ventil", "self-acting valve", "ventil", "självverkande"],
    tagPrefix: "SV",
    ports: valvePorts(),
    shapes: [
      stroke(valveBody()),
      stroke(joinPaths(linePath(32, 32, 32, 16), smallCircle(32, 10, 5))),
      stroke(linePath(26, 15, 38, 5)),
    ],
  }),

  // --- Control central ---------------------------------------------------
];

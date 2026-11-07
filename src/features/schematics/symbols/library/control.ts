import type { SymbolDefinition } from "../../../../model/symbols";
import { stroke, joinPaths, linePath, rectPath, smallCircle, schematicSymbol } from "../primitives";
import { INLINE_PORTS } from "./parts";

/**
 * control symbols, split out of the schematic library by category.
 */

export const CONTROL_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.control-cabinet",
    category: "control",
    keywords: ["styrskåp", "control cabinet", "skåp", "styr", "sk"],
    tagPrefix: "SK",
    ports: [{ id: "supply", x: 32, y: 62, direction: "both" }],
    shapes: [
      stroke(rectPath(14, 8, 36, 48)),
      stroke(
        joinPaths(
          linePath(32, 8, 32, 56),
          linePath(38, 18, 44, 18),
          smallCircle(41, 26, 2),
          smallCircle(41, 34, 2),
          smallCircle(41, 42, 2),
          linePath(32, 56, 32, 62),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.plc",
    category: "control",
    keywords: ["plc", "duc", "programmerbar", "styr", "plc/duc"],
    tagPrefix: "PLC",
    ports: [
      { id: "in", x: 2, y: 32, direction: "in" },
      { id: "out", x: 62, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(rectPath(10, 14, 44, 36)),
      stroke(
        joinPaths(
          linePath(18, 22, 18, 42),
          linePath(26, 22, 26, 42),
          linePath(34, 22, 34, 42),
          linePath(42, 22, 42, 42),
          linePath(2, 32, 10, 32),
          linePath(54, 32, 62, 32),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.relay",
    category: "control",
    keywords: ["relä", "relay", "styr", "kontaktor", "re"],
    tagPrefix: "RE",
    ports: [
      { id: "top", x: 32, y: 2, direction: "in" },
      { id: "bottom", x: 32, y: 62, direction: "out" },
    ],
    shapes: [
      stroke(
        joinPaths(rectPath(22, 24, 20, 16), linePath(32, 2, 32, 24), linePath(32, 40, 32, 62)),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.fuse",
    category: "control",
    keywords: ["säkring", "fuse", "el", "skydd", "sä"],
    tagPrefix: "SÄ",
    ports: [
      { id: "top", x: 32, y: 2, direction: "in" },
      { id: "bottom", x: 32, y: 62, direction: "out" },
    ],
    shapes: [
      stroke(
        joinPaths(
          rectPath(28, 14, 8, 36),
          linePath(32, 2, 32, 14),
          linePath(32, 50, 32, 62),
          linePath(32, 14, 32, 50),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.vfd",
    category: "control",
    keywords: ["frekvensomriktare", "variable frequency drive", "vfd", "motorstyrning", "fi"],
    tagPrefix: "FI",
    ports: INLINE_PORTS(),
    shapes: [
      stroke(rectPath(10, 14, 44, 36)),
      stroke(
        joinPaths(
          "M 16 32 C 20 22 24 42 28 32 C 32 22 36 42 40 32 C 44 22 48 42 52 32",
          linePath(2, 32, 10, 32),
          linePath(54, 32, 62, 32),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.actuator",
    category: "control",
    keywords: ["ställdon", "actuator", "motor", "ventil", "st"],
    tagPrefix: "ST",
    ports: [{ id: "stem", x: 32, y: 62, direction: "both" }],
    shapes: [stroke(joinPaths(smallCircle(32, 22, 12), linePath(32, 34, 32, 62)))],
  }),

  // --- General -----------------------------------------------------------
];

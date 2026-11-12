import type { SymbolDefinition } from "../../types";
import {
  stroke,
  fill,
  joinPaths,
  linePath,
  polyPath,
  smallCircle,
  schematicSymbol,
} from "../primitives";
import { PUMP_PORTS, pumpBody } from "./parts";

/**
 * pump symbols, split out of the schematic library by category.
 */

/** The pump circle with a slightly smaller upright flow triangle, nudged up. */
function pumpBodyUp(): string {
  return joinPaths(smallCircle(32, 32, 16), polyPath([32, 18, 43, 37, 21, 37], true));
}

/** The filled upper half of the upright pump triangle. */
const PUMP_TOP_HALF = polyPath([32, 18, 37.5, 27.5, 26.5, 27.5], true);

export const PUMP_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.circulation-pump",
    category: "pump",
    keywords: ["cirkulationspump", "circulation pump", "pump", "cp"],
    tagPrefix: "CP",
    ports: PUMP_PORTS(),
    shapes: [
      stroke(pumpBodyUp()),
      // The solid top half reads as flow direction at any size and matches the
      // orientation of the drawing.
      fill(PUMP_TOP_HALF),
    ],
  }),
  schematicSymbol({
    id: "schematic.heating-pump",
    category: "pump",
    keywords: ["värmepump", "heating pump", "pump", "värme", "vp"],
    tagPrefix: "VP",
    ports: PUMP_PORTS(),
    shapes: [
      stroke(pumpBody()),
      stroke(
        joinPaths(linePath(24, 26, 28, 20), linePath(30, 26, 34, 20), linePath(36, 26, 40, 20)),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.cooling-pump",
    category: "pump",
    keywords: ["kylpump", "cooling pump", "pump", "kyla", "kp"],
    tagPrefix: "KP",
    ports: PUMP_PORTS(),
    shapes: [
      stroke(pumpBody()),
      stroke(
        joinPaths(linePath(32, 18, 32, 26), linePath(28, 19, 36, 25), linePath(36, 19, 28, 25)),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.brine-pump",
    category: "pump",
    keywords: ["brinepump", "brine pump", "pump", "brine", "bp"],
    tagPrefix: "BP",
    ports: PUMP_PORTS(),
    shapes: [
      stroke(pumpBody()),
      stroke(
        joinPaths(linePath(24, 38, 31, 25), linePath(30, 39, 37, 26), linePath(36, 38, 40, 30)),
      ),
    ],
  }),

  // --- Heat exchangers ---------------------------------------------------
];

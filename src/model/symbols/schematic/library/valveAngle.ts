import type { SymbolDefinition } from "../../types";
import {
  stroke,
  fill,
  joinPaths,
  linePath,
  polyPath,
  smallCircle,
  valvePorts,
  schematicSymbol,
  valveBody,
} from "../primitives";
import {
  RIGHT_SEAT_BAND,
  BOTTOM_SEAT_BAND,
  ANGLE_VALVE_BODY,
  RELIEF_SPRING,
  ANGLE_BLOWDOWN_BRANCH,
} from "./valveParts";

/**
 * Plug, flanged, angle, three-way, balancing and drain valves, split out of the
 * schematic library by category.
 */
export const VALVE_ANGLE_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.plug-cock-valve",
    category: "valve",
    keywords: ["kikventil", "plug valve", "cock valve", "kran", "ventil", "kv"],
    tagPrefix: "KV",
    ports: valvePorts(),
    shapes: [stroke(joinPaths(valveBody(), linePath(32, 32, 32, 10), linePath(32, 10, 40, 10)))],
  }),
  schematicSymbol({
    id: "schematic.flanged-valve",
    category: "valve",
    keywords: ["flänsad ventil", "flanged valve", "fläns", "ventil", "fv"],
    tagPrefix: "FV",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(
        joinPaths(
          polyPath([12, 22, 32, 32, 12, 42], true),
          polyPath([52, 22, 32, 32, 52, 42], true),
          linePath(8, 24, 8, 40),
          linePath(12, 24, 12, 40),
          linePath(52, 24, 52, 40),
          linePath(56, 24, 56, 40),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.flanged-valve-2",
    category: "valve",
    keywords: ["flänsad ventil 2", "flanged valve 2", "fläns", "ventil", "fv2"],
    tagPrefix: "FV2",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(
        joinPaths(
          polyPath([12, 22, 32, 32, 12, 42], true),
          polyPath([52, 22, 32, 32, 52, 42], true),
          linePath(8, 24, 8, 40),
          linePath(12, 24, 12, 40),
          linePath(52, 24, 52, 40),
          linePath(56, 24, 56, 40),
        ),
      ),
      fill(smallCircle(32, 32, 3)),
    ],
  }),
  schematicSymbol({
    id: "schematic.angle-valve-hand",
    category: "valve",
    keywords: [
      "vinkelventil handmanövrerad",
      "angle valve hand-operated",
      "vinkelventil",
      "ventil",
      "vh",
    ],
    tagPrefix: "VH",
    ports: [
      { id: "in", x: 18, y: 32, direction: "in" },
      { id: "out", x: 32, y: 46, direction: "out" },
    ],
    shapes: [
      stroke(
        joinPaths(
          polyPath([18, 22, 32, 32, 18, 42], true),
          polyPath([22, 46, 42, 46, 32, 32], true),
          linePath(32, 32, 32, 12),
          linePath(24, 12, 40, 12),
        ),
      ),
      fill(smallCircle(32, 32, 3)),
    ],
  }),
  schematicSymbol({
    id: "schematic.angle-globe-valve",
    category: "valve",
    keywords: ["vinkelsätesventil", "angle globe valve", "vinkelventil", "sätesventil", "agv"],
    tagPrefix: "AGV",
    ports: [
      { id: "in", x: 18, y: 32, direction: "in" },
      { id: "out", x: 32, y: 46, direction: "out" },
    ],
    shapes: [stroke(ANGLE_VALVE_BODY), fill(smallCircle(32, 32, 3))],
  }),
  schematicSymbol({
    id: "schematic.relief-valve",
    category: "valve",
    keywords: ["avlastningsventil", "relief valve", "avlastning", "fjäder", "ventil", "rl"],
    tagPrefix: "RL",
    ports: [
      { id: "in", x: 18, y: 32, direction: "in" },
      { id: "out", x: 32, y: 46, direction: "out" },
    ],
    shapes: [stroke(joinPaths(ANGLE_VALVE_BODY, RELIEF_SPRING)), fill(smallCircle(32, 32, 3))],
  }),
  schematicSymbol({
    id: "schematic.angle-valve",
    category: "valve",
    keywords: ["vinkelventil", "angle valve", "vinkel", "ventil", "vv"],
    tagPrefix: "VV",
    ports: [
      { id: "in", x: 18, y: 32, direction: "in" },
      { id: "out", x: 32, y: 46, direction: "out" },
    ],
    shapes: [stroke(ANGLE_VALVE_BODY)],
  }),
  schematicSymbol({
    id: "schematic.angle-blowdown-valve",
    category: "valve",
    keywords: [
      "avblåsningsventil",
      "angle blowdown valve",
      "avblåsning",
      "blowdown",
      "ventil",
      "ab",
    ],
    tagPrefix: "AB",
    ports: [
      { id: "in", x: 18, y: 32, direction: "in" },
      { id: "out", x: 46, y: 32, direction: "out" },
      { id: "blowdown", x: 48, y: 16, direction: "out" },
    ],
    shapes: [stroke(joinPaths(valveBody(), ANGLE_BLOWDOWN_BRANCH))],
  }),
  schematicSymbol({
    id: "schematic.three-way-valve",
    category: "valve",
    keywords: ["trevägsventil", "three-way valve", "3-väg", "ventil", "3v"],
    tagPrefix: "3V",
    // The third branch is the same triangle rotated 90°: apex at the junction
    // and a 20-unit base at y = 46, so all three branches read as equals.
    ports: [
      { id: "in", x: 18, y: 32, direction: "in" },
      { id: "out", x: 46, y: 32, direction: "out" },
      { id: "branch", x: 32, y: 46, direction: "both" },
    ],
    shapes: [stroke(joinPaths(valveBody(), polyPath([32, 32, 22, 46, 42, 46], true)))],
  }),
  schematicSymbol({
    id: "schematic.three-way-check-valve",
    category: "valve",
    keywords: ["trevägs backventil", "three-way check valve", "backventil", "3vägs", "3bv"],
    tagPrefix: "3BV",
    // Three-way body where the right and bottom outlets each carry the same
    // filled seat band as the check valve; the left inlet is free.
    ports: [
      { id: "in", x: 18, y: 32, direction: "in" },
      { id: "out", x: 46, y: 32, direction: "out" },
      { id: "branch", x: 32, y: 46, direction: "both" },
    ],
    shapes: [
      stroke(joinPaths(valveBody(), polyPath([32, 32, 22, 46, 42, 46], true))),
      fill(RIGHT_SEAT_BAND),
      fill(BOTTOM_SEAT_BAND),
    ],
  }),
  schematicSymbol({
    id: "schematic.balancing-valve",
    category: "valve",
    keywords: ["injusteringsventil", "balancing valve", "injustering", "ventil", "iv"],
    tagPrefix: "IV",
    ports: valvePorts(),
    shapes: [
      stroke(valveBody()),
      stroke(joinPaths(linePath(26, 22, 26, 12), linePath(38, 22, 38, 12))),
      fill(smallCircle(26, 10, 2.2)),
      fill(smallCircle(38, 10, 2.2)),
    ],
  }),
  schematicSymbol({
    id: "schematic.drain-valve",
    category: "valve",
    keywords: ["avtappningsventil", "drain valve", "avtappning", "ventil", "at"],
    tagPrefix: "AT",
    ports: [
      { id: "in", x: 18, y: 32, direction: "in" },
      { id: "out", x: 46, y: 32, direction: "out" },
      { id: "drain", x: 32, y: 62, direction: "out" },
    ],
    shapes: [
      stroke(valveBody()),
      stroke(joinPaths(linePath(32, 42, 32, 54), smallCircle(32, 58, 3))),
    ],
  }),

  // --- Pumps -------------------------------------------------------------
];

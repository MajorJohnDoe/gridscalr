import type { SymbolDefinition } from "../../types";
import {
  stroke,
  joinPaths,
  linePath,
  polyPath,
  rectPath,
  smallCircle,
  schematicSymbol,
} from "../primitives";
import { roundedRectPathData } from "../../../symbolPaths";

/**
 * heating symbols, split out of the schematic library by category.
 */

/** Eleven evenly spaced fins between the radiator headers. */
const RADIATOR_FINS = Array.from({ length: 11 }, (_, index) =>
  linePath(12 + index * 4, 20, 12 + index * 4, 44),
);

/** Four tank outlines shared by the heating tank symbols. */
const TANK_2_BODY = joinPaths(
  linePath(14, 18, 14, 50),
  linePath(14, 50, 50, 50),
  linePath(50, 50, 50, 18),
  linePath(14, 18, 32, 10),
  linePath(32, 10, 50, 18),
);

const TANK_3_BODY = joinPaths(
  linePath(14, 18, 14, 50),
  linePath(14, 50, 40, 50),
  linePath(40, 50, 40, 54),
  linePath(40, 54, 50, 54),
  linePath(50, 54, 50, 18),
  linePath(14, 18, 20, 18),
  linePath(44, 18, 50, 18),
);

const TANK_4_BODY = joinPaths(
  linePath(14, 26, 14, 54),
  linePath(14, 54, 40, 54),
  linePath(40, 54, 40, 58),
  linePath(40, 58, 50, 58),
  linePath(50, 58, 50, 26),
  linePath(50, 26, 14, 26),
  linePath(29, 26, 29, 18),
  linePath(35, 26, 35, 18),
  linePath(26, 15, 38, 15),
);

const OPEN_TANK_BODY = joinPaths(
  linePath(14, 18, 14, 54),
  linePath(14, 54, 50, 54),
  linePath(50, 54, 50, 18),
  linePath(10, 18, 14, 18),
  linePath(50, 18, 54, 18),
);

const VERTICAL_VESSEL_BODY = "M 20 16 Q 32 8 44 16 L 44 48 Q 32 56 20 48 Z";
const DISHED_ENDS_VESSEL_BODY = joinPaths(
  "M 22 16 Q 32 8 42 16 L 42 50 Q 32 44 22 50 Z",
  linePath(22, 50, 22, 58),
  linePath(42, 50, 42, 58),
);

interface VesselGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Standard, large and small expansion vessels with different proportions. */
const EXPANSION_VESSEL: VesselGeometry = { x: 20, y: 8, width: 24, height: 38 };
const EXPANSION_VESSEL_LARGE: VesselGeometry = { x: 21, y: 4, width: 22, height: 46 };
const EXPANSION_VESSEL_SMALL: VesselGeometry = { x: 21, y: 16, width: 22, height: 26 };

/** A vertical expansion vessel with a domed shell, top cap and bottom neck. */
function expansionVesselShapes(vessel: VesselGeometry) {
  const centerX = vessel.x + vessel.width / 2;
  const neckTop = vessel.y + vessel.height;
  return [
    stroke(
      joinPaths(
        roundedRectPathData(vessel.x, vessel.y, vessel.width, vessel.height, 9),
        linePath(centerX - 6, vessel.y + 3, centerX + 6, vessel.y + 3),
        linePath(centerX, neckTop, centerX, neckTop + 8),
      ),
    ),
  ];
}

function expansionVesselPorts(vessel: VesselGeometry) {
  return [
    {
      id: "connection",
      x: vessel.x + vessel.width / 2,
      y: vessel.y + vessel.height + 10,
      direction: "both" as const,
    },
  ];
}

export const HEATING_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.radiator",
    category: "heating",
    keywords: ["radiator", "element", "värme", "rad"],
    tagPrefix: "RAD",
    // Supply enters at the top-left and returns at the bottom-left. Both ports
    // sit on the header edge so the symbol has no protruding connection stubs.
    ports: [
      { id: "in", x: 4, y: 17, direction: "in" },
      { id: "out", x: 4, y: 47, direction: "out" },
    ],
    shapes: [
      stroke(
        joinPaths(
          // Stepped headers that overhang the fin block, as on a panel radiator.
          rectPath(4, 14, 56, 6),
          rectPath(4, 44, 56, 6),
          rectPath(8, 20, 48, 24),
          ...RADIATOR_FINS,
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.convector",
    category: "heating",
    keywords: ["konvektor", "convector", "värme", "kon"],
    tagPrefix: "KON",
    ports: [
      { id: "in", x: 2, y: 42, direction: "in" },
      { id: "out", x: 62, y: 42, direction: "out" },
    ],
    shapes: [
      stroke(rectPath(12, 22, 40, 20)),
      stroke(
        joinPaths(
          linePath(18, 42, 26, 22),
          linePath(26, 42, 34, 22),
          linePath(34, 42, 42, 22),
          linePath(42, 42, 50, 22),
          linePath(2, 42, 12, 42),
          linePath(52, 42, 62, 42),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.floor-heating",
    category: "heating",
    keywords: ["golvvärme", "floor heating", "golv", "värme", "gv"],
    tagPrefix: "GV",
    // One continuous loop: supply enters at the top-left, the coil snakes down
    // and up, and the return leaves at the bottom-left. Ports sit on the edge.
    // Rounded turns use quadratic corners, the same curve family as the rest of
    // the schematic set, so canvas, hit testing and PDF export share one geometry.
    ports: [
      { id: "in", x: 2, y: 14, direction: "in" },
      { id: "out", x: 2, y: 50, direction: "out" },
    ],
    shapes: [
      stroke(
        joinPaths(
          linePath(2, 14, 14, 14),
          linePath(14, 14, 14, 40),
          "Q 14 45 19 45",
          "Q 24 45 24 40",
          linePath(24, 40, 24, 20),
          "Q 24 15 29 15",
          "Q 34 15 34 20",
          linePath(34, 20, 34, 40),
          "Q 34 45 39 45",
          "Q 44 45 44 40",
          linePath(44, 40, 44, 20),
          "Q 44 15 49 15",
          "Q 54 15 54 20",
          linePath(54, 20, 54, 45),
          "Q 54 50 49 50",
          linePath(49, 50, 2, 50),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.expansion-vessel",
    category: "heating",
    keywords: ["expansionskärl", "expansion vessel", "kärl", "expansion", "ek"],
    tagPrefix: "EK",
    ports: expansionVesselPorts(EXPANSION_VESSEL),
    shapes: expansionVesselShapes(EXPANSION_VESSEL),
  }),
  schematicSymbol({
    id: "schematic.expansion-vessel-large",
    category: "heating",
    keywords: ["expansionskärl stort", "large expansion vessel", "kärl", "expansion", "ek"],
    tagPrefix: "EK",
    defaultSize: 56,
    ports: expansionVesselPorts(EXPANSION_VESSEL_LARGE),
    shapes: expansionVesselShapes(EXPANSION_VESSEL_LARGE),
  }),
  schematicSymbol({
    id: "schematic.expansion-vessel-small",
    category: "heating",
    keywords: ["expansionskärl litet", "small expansion vessel", "kärl", "expansion", "ek"],
    tagPrefix: "EK",
    defaultSize: 26,
    ports: expansionVesselPorts(EXPANSION_VESSEL_SMALL),
    shapes: expansionVesselShapes(EXPANSION_VESSEL_SMALL),
  }),
  schematicSymbol({
    id: "schematic.tank-2",
    category: "heating",
    keywords: ["tank 2", "tank", "sluten tank", "closed tank", "kärl", "t2"],
    tagPrefix: "T2",
    ports: [{ id: "connect", x: 32, y: 50, direction: "both" }],
    shapes: [stroke(TANK_2_BODY)],
  }),
  schematicSymbol({
    id: "schematic.tank-3",
    category: "heating",
    keywords: ["tank 3", "tank", "öppen tank", "open tank", "kärl", "t3"],
    tagPrefix: "T3",
    ports: [{ id: "connect", x: 45, y: 54, direction: "both" }],
    shapes: [stroke(TANK_3_BODY)],
  }),
  schematicSymbol({
    id: "schematic.tank-4",
    category: "heating",
    keywords: ["tank 4", "tank", "sluten tank", "closed tank", "kärl", "t4"],
    tagPrefix: "T4",
    ports: [{ id: "connect", x: 45, y: 58, direction: "both" }],
    shapes: [stroke(TANK_4_BODY)],
  }),
  schematicSymbol({
    id: "schematic.open-tank",
    category: "heating",
    keywords: ["öppen tank", "open tank", "tank", "kärl", "tö"],
    tagPrefix: "TÖ",
    ports: [{ id: "connect", x: 32, y: 54, direction: "both" }],
    shapes: [stroke(OPEN_TANK_BODY)],
  }),
  schematicSymbol({
    id: "schematic.vertical-vessel",
    category: "heating",
    keywords: ["stående kärl", "vertical vessel", "kärl", "behållare", "ves"],
    tagPrefix: "VES",
    ports: [{ id: "connect", x: 32, y: 52, direction: "both" }],
    shapes: [stroke(VERTICAL_VESSEL_BODY)],
  }),
  schematicSymbol({
    id: "schematic.dished-ends-vessel",
    category: "heating",
    keywords: ["kärl med kupade gavlar", "dished ends vessel", "kärl", "gavel", "dev"],
    tagPrefix: "DEV",
    ports: [{ id: "connect", x: 32, y: 58, direction: "both" }],
    shapes: [stroke(DISHED_ENDS_VESSEL_BODY)],
  }),
  schematicSymbol({
    id: "schematic.pressure-holding",
    category: "heating",
    keywords: ["tryckhållning", "pressure holding", "tryck", "pump", "pht"],
    tagPrefix: "PHT",
    ports: [
      { id: "in", x: 2, y: 34, direction: "in" },
      { id: "out", x: 62, y: 34, direction: "out" },
    ],
    shapes: [
      stroke(rectPath(10, 14, 44, 36)),
      stroke(joinPaths(smallCircle(28, 32, 9), polyPath([23, 27, 33, 32, 23, 37], true))),
      stroke(
        joinPaths(linePath(2, 34, 19, 34), linePath(37, 34, 62, 34), linePath(48, 22, 48, 28)),
      ),
    ],
  }),

  // --- District heating --------------------------------------------------
];

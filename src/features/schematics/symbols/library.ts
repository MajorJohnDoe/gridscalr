import type { SymbolDefinition } from "../../../model/symbols";
import { roundedRectPathData } from "../../../model/symbolPaths";
import { REFERENCE_SYMBOLS } from "./referenceSymbols";
import {
  FIRST_VENTILATION_SYMBOLS,
  arcPath,
  coilPath,
  ductCasing,
  ductPorts,
  fill,
  joinPaths,
  linePath,
  polyPath,
  rectPath,
  schematicSymbol,
  sensorFunnel,
  smallCircle,
  stroke,
  valvePorts,
} from "./definitions";

/**
 * The full schematic equipment library. The first ten ventilation symbols were
 * reviewed in issue #93 and are kept unchanged; everything below extends them
 * with the categories from the operation-card plan.
 */

const INLINE_PORTS = (y = 32) => [
  { id: "in", x: 2, y, direction: "in" as const },
  { id: "out", x: 62, y, direction: "out" as const },
];

const PUMP_PORTS = () => [
  { id: "in", x: 16, y: 32, direction: "in" as const },
  { id: "out", x: 48, y: 32, direction: "out" as const },
];

const SENSOR_PORTS = (x = 32) => [{ id: "process", x, y: 58, direction: "both" as const }];

/** Eleven evenly spaced fins between the radiator headers. */
const RADIATOR_FINS = Array.from({ length: 11 }, (_, index) =>
  linePath(12 + index * 4, 20, 12 + index * 4, 44),
);

function valveBody(): string {
  return joinPaths(
    polyPath([18, 22, 32, 32, 18, 42], true),
    polyPath([46, 22, 32, 32, 46, 42], true),
  );
}

function pumpBody(): string {
  return joinPaths(smallCircle(32, 32, 16), polyPath([32, 20, 44, 40, 20, 40], true));
}

function meterBody(): string {
  return joinPaths(rectPath(12, 16, 40, 32), smallCircle(32, 30, 9), linePath(26, 38, 38, 38));
}

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

export const SCHEMATIC_LIBRARY_SYMBOLS: SymbolDefinition[] = [
  // --- Instruments -------------------------------------------------------
  schematicSymbol({
    id: "schematic.pressure-sensor",
    category: "instrument",
    keywords: ["tryckgivare", "pressure sensor", "tryck", "givare", "gp"],
    tagPrefix: "GP",
    ports: SENSOR_PORTS(),
    shapes: [
      stroke(sensorFunnel()),
      stroke(joinPaths(linePath(24, 18, 24, 24), linePath(40, 18, 40, 24))),
    ],
  }),
  schematicSymbol({
    id: "schematic.flow-sensor",
    category: "instrument",
    keywords: ["flödesgivare", "flow sensor", "flöde", "givare", "gq"],
    tagPrefix: "GQ",
    ports: INLINE_PORTS(),
    shapes: [
      stroke(sensorFunnel()),
      stroke(joinPaths(linePath(24, 20, 40, 20), polyPath([36, 15, 42, 20, 36, 25], true))),
    ],
  }),
  schematicSymbol({
    id: "schematic.level-sensor",
    category: "instrument",
    keywords: ["nivågivare", "level sensor", "nivå", "givare", "gl"],
    tagPrefix: "GL",
    ports: [{ id: "process", x: 32, y: 58, direction: "both" }],
    shapes: [
      stroke(sensorFunnel()),
      stroke(joinPaths(linePath(24, 20, 40, 20), linePath(24, 26, 40, 26))),
    ],
  }),
  schematicSymbol({
    id: "schematic.pressure-switch",
    category: "instrument",
    keywords: ["tryckvakt", "pressure switch", "vakt", "tryck", "ps"],
    tagPrefix: "PS",
    ports: SENSOR_PORTS(),
    shapes: [
      stroke(smallCircle(32, 26, 11)),
      stroke(
        joinPaths(
          linePath(32, 37, 32, 58),
          linePath(25, 26, 30, 26),
          linePath(34, 22, 39, 30),
          linePath(34, 22, 39, 22),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.flow-switch",
    category: "instrument",
    keywords: ["flödesvakt", "flow switch", "vakt", "flöde", "fs"],
    tagPrefix: "FS",
    ports: [
      { id: "in", x: 19, y: 32, direction: "in" },
      { id: "out", x: 45, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(smallCircle(32, 32, 13)),
      stroke(
        joinPaths(
          polyPath([25, 27, 31, 32, 25, 37], true),
          linePath(34, 27, 40, 32),
          linePath(35, 36, 41, 32),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.thermometer",
    category: "instrument",
    keywords: ["termometer", "thermometer", "temperatur", "mätare", "tg"],
    tagPrefix: "TG",
    ports: SENSOR_PORTS(),
    shapes: [
      stroke(
        joinPaths(
          linePath(32, 8, 32, 46),
          smallCircle(32, 50, 6),
          linePath(36, 16, 40, 16),
          linePath(36, 24, 40, 24),
          linePath(36, 32, 40, 32),
        ),
      ),
      stroke(linePath(32, 46, 32, 58)),
    ],
  }),
  schematicSymbol({
    id: "schematic.manometer",
    category: "instrument",
    keywords: ["manometer", "tryckmätare", "tryck", "mätare", "pg"],
    tagPrefix: "PG",
    ports: SENSOR_PORTS(),
    shapes: [
      stroke(joinPaths(smallCircle(32, 28, 13), linePath(32, 41, 32, 58))),
      stroke(
        joinPaths(
          linePath(32, 28, 39, 20),
          linePath(24, 17, 24, 20),
          linePath(32, 15, 32, 18),
          linePath(40, 17, 40, 20),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.energy-meter",
    category: "instrument",
    keywords: ["energimätare", "energy meter", "energi", "mätare", "em"],
    tagPrefix: "EM",
    ports: INLINE_PORTS(),
    shapes: [stroke(meterBody()), stroke(polyPath([27, 30, 32, 22, 31, 29, 37, 25, 32, 38]))],
  }),

  // --- Valves ------------------------------------------------------------
  schematicSymbol({
    id: "schematic.valve",
    category: "valve",
    keywords: ["ventil", "valve", "v"],
    tagPrefix: "V",
    ports: valvePorts(),
    shapes: [stroke(valveBody())],
  }),
  schematicSymbol({
    id: "schematic.shutoff-valve",
    category: "valve",
    keywords: ["avstängningsventil", "shut-off valve", "ventil", "avstängning", "av"],
    tagPrefix: "AV",
    ports: valvePorts(),
    shapes: [
      stroke(valveBody()),
      stroke(joinPaths(linePath(32, 22, 32, 12), linePath(25, 12, 39, 12))),
    ],
  }),
  schematicSymbol({
    id: "schematic.control-valve",
    category: "valve",
    keywords: ["reglerventil", "control valve", "ventil", "ställdon", "regler", "rv"],
    tagPrefix: "RV",
    ports: valvePorts(),
    shapes: [
      stroke(valveBody()),
      stroke(joinPaths(linePath(32, 22, 32, 14), smallCircle(32, 10, 4))),
    ],
  }),
  schematicSymbol({
    id: "schematic.check-valve",
    category: "valve",
    keywords: ["backventil", "check valve", "back", "ventil", "bv"],
    tagPrefix: "BV",
    // ISO-style body: the usual two triangles plus a solid seat band along the
    // outlet edge. The filled band is what separates a check valve from an
    // ordinary valve body at small sizes.
    ports: valvePorts(),
    shapes: [stroke(valveBody()), fill(polyPath([46, 22, 42, 24.8571, 42, 39.1429, 46, 42], true))],
  }),
  schematicSymbol({
    id: "schematic.safety-valve",
    category: "valve",
    keywords: ["säkerhetsventil", "safety valve", "säkerhet", "ventil", "sv"],
    tagPrefix: "SV",
    ports: [
      { id: "in", x: 18, y: 32, direction: "in" },
      { id: "out", x: 46, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(valveBody()),
      stroke(joinPaths(linePath(32, 22, 32, 10), polyPath([26, 14, 32, 5, 38, 14]))),
    ],
  }),
  schematicSymbol({
    id: "schematic.motor-valve",
    category: "valve",
    keywords: ["motorventil", "motorized valve", "motor", "ventil", "mv"],
    tagPrefix: "MV",
    ports: valvePorts(),
    shapes: [
      stroke(valveBody()),
      stroke(
        joinPaths(linePath(32, 22, 32, 16), rectPath(24, 6, 16, 10), smallCircle(32, 11, 2.4)),
      ),
    ],
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
  schematicSymbol({
    id: "schematic.circulation-pump",
    category: "pump",
    keywords: ["cirkulationspump", "circulation pump", "pump", "cp"],
    tagPrefix: "CP",
    ports: PUMP_PORTS(),
    shapes: [stroke(pumpBody())],
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
  schematicSymbol({
    id: "schematic.plate-heat-exchanger",
    category: "exchanger",
    keywords: ["plattvärmeväxlare", "plate heat exchanger", "värmeväxlare", "platt", "pvx"],
    tagPrefix: "PVX",
    ports: [
      { id: "primaryIn", x: 24, y: 8, direction: "in" },
      { id: "primaryOut", x: 40, y: 56, direction: "out" },
      { id: "secondaryIn", x: 40, y: 8, direction: "in" },
      { id: "secondaryOut", x: 24, y: 56, direction: "out" },
    ],
    shapes: [
      stroke(rectPath(24, 8, 16, 48)),
      stroke(joinPaths("M 24 8 L 40 56", "M 40 8 L 24 56")),
    ],
  }),
  schematicSymbol({
    id: "schematic.rotary-recovery",
    category: "exchanger",
    keywords: ["roterande återvinning", "rotary recovery", "återvinning", "roterande", "rx"],
    tagPrefix: "RX",
    ports: [
      { id: "primaryIn", x: 24, y: 8, direction: "in" },
      { id: "primaryOut", x: 40, y: 56, direction: "out" },
      { id: "secondaryIn", x: 40, y: 8, direction: "in" },
      { id: "secondaryOut", x: 24, y: 56, direction: "out" },
    ],
    shapes: [
      stroke(rectPath(24, 8, 16, 48)),
      stroke(
        "M 32 18 C 36.418 18 40 24.268 40 32 C 40 39.732 36.418 46 32 46 C 27.582 46 24 39.732 24 32 C 24 24.268 27.582 18 32 18 Z",
      ),
      stroke(joinPaths("M 25 25 C 25 12 39 12 39 25", "M 39 25 L 34 22 M 39 25 L 36 30")),
    ],
  }),
  schematicSymbol({
    id: "schematic.battery-recovery",
    category: "exchanger",
    keywords: ["batteriåtervinning", "battery recovery", "återvinning", "batteri", "bx"],
    tagPrefix: "BX",
    ports: INLINE_PORTS(),
    shapes: [
      stroke(ductCasing(16, 32)),
      stroke(
        joinPaths(
          coilPath(21, 43, 9, 27),
          coilPath(21, 43, 37, 55),
          linePath(2, 32, 9, 32),
          linePath(55, 32, 62, 32),
        ),
      ),
    ],
  }),

  // --- Ventilation -------------------------------------------------------
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
    ports: [
      { id: "in", x: 2, y: 14, direction: "in" },
      { id: "out", x: 2, y: 50, direction: "out" },
    ],
    shapes: [
      stroke(
        joinPaths(
          linePath(2, 14, 14, 14),
          linePath(14, 14, 14, 40),
          arcPath(5, 24, 40, 0),
          linePath(24, 40, 24, 20),
          arcPath(5, 34, 20, 1),
          linePath(34, 20, 34, 40),
          arcPath(5, 44, 40, 0),
          linePath(44, 40, 44, 20),
          arcPath(5, 54, 20, 1),
          linePath(54, 20, 54, 45),
          arcPath(5, 49, 50, 1),
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
  schematicSymbol({
    id: "schematic.substation",
    category: "district-heating",
    keywords: ["undercentral", "substation", "fjärrvärme", "växlare", "uc"],
    tagPrefix: "UC",
    ports: [
      { id: "primaryIn", x: 2, y: 20, direction: "in" },
      { id: "primaryOut", x: 2, y: 46, direction: "out" },
      { id: "secondaryIn", x: 62, y: 20, direction: "in" },
      { id: "secondaryOut", x: 62, y: 46, direction: "out" },
    ],
    shapes: [
      stroke(rectPath(8, 8, 48, 48)),
      stroke(linePath(32, 8, 32, 56)),
      stroke(joinPaths(smallCircle(22, 24, 6), smallCircle(22, 40, 6))),
      stroke(joinPaths(smallCircle(42, 24, 6), smallCircle(42, 40, 6))),
      stroke(
        joinPaths(
          linePath(2, 20, 16, 20),
          linePath(28, 24, 36, 24),
          linePath(48, 40, 62, 40),
          linePath(2, 46, 16, 46),
          linePath(48, 24, 62, 24),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.district-energy-meter",
    category: "district-heating",
    keywords: ["fjärrvärmemätare", "district heating meter", "energimätare", "fjärrvärme", "fem"],
    tagPrefix: "FEM",
    ports: INLINE_PORTS(),
    shapes: [
      stroke(meterBody()),
      stroke(joinPaths(linePath(2, 32, 12, 32), linePath(52, 32, 62, 32))),
      stroke(polyPath([26, 34, 31, 26, 30, 32, 36, 28, 31, 40])),
    ],
  }),

  // --- Cooling -----------------------------------------------------------
  schematicSymbol({
    id: "schematic.chiller",
    category: "cooling",
    keywords: ["kylmaskin", "chiller", "kyla", "kylaggregat", "km"],
    tagPrefix: "KM",
    ports: INLINE_PORTS(),
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
  schematicSymbol({
    id: "schematic.connection-dot",
    category: "general",
    keywords: ["anslutningsprick", "connection dot", "prick", "anslutning", "dot"],
    tagPrefix: "DOT",
    ports: [{ id: "connection", x: 32, y: 32, direction: "both" }],
    defaultSize: 10,
    shapes: [fill(smallCircle(32, 32, 5))],
  }),
  schematicSymbol({
    id: "schematic.arrow",
    category: "general",
    keywords: ["pil", "arrow", "riktning", "flöde", "pil"],
    tagPrefix: "PIL",
    ports: [
      { id: "start", x: 8, y: 32, direction: "in" },
      { id: "end", x: 56, y: 32, direction: "out" },
    ],
    shapes: [stroke(linePath(8, 32, 48, 32)), fill(polyPath([44, 24, 56, 32, 44, 40], true))],
  }),
  schematicSymbol({
    id: "schematic.reference",
    category: "general",
    keywords: ["hänvisning", "reference", "referens", "länk", "ref"],
    tagPrefix: "REF",
    ports: [{ id: "link", x: 62, y: 32, direction: "out" }],
    shapes: [
      stroke(rectPath(8, 18, 40, 28)),
      stroke(joinPaths(linePath(18, 38, 42, 22), polyPath([34, 22, 44, 21, 42, 31], true))),
      stroke(joinPaths(linePath(48, 34, 62, 34))),
    ],
  }),
  schematicSymbol({
    id: "schematic.tag-holder",
    category: "general",
    keywords: ["beteckningshållare", "tag holder", "beteckning", "text", "bet"],
    tagPrefix: "BET",
    ports: [
      { id: "in", x: 2, y: 32, direction: "in" },
      { id: "out", x: 62, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(roundedRectPathData(10, 22, 44, 20, 5)),
      stroke(
        joinPaths(linePath(2, 32, 10, 32), linePath(54, 32, 62, 32), linePath(20, 32, 44, 32)),
      ),
    ],
  }),
];

export const SCHEMATIC_SYMBOLS: SymbolDefinition[] = [
  ...FIRST_VENTILATION_SYMBOLS,
  ...SCHEMATIC_LIBRARY_SYMBOLS,
  ...REFERENCE_SYMBOLS,
];

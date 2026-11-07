import type { SymbolDefinition } from "../../../model/symbols";
import { roundedRectPathData } from "../../../model/symbolPaths";
import { REFERENCE_SYMBOLS } from "./referenceSymbols";
import {
  FIRST_VENTILATION_SYMBOLS,
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

/** Filled seat band along the right-hand outlet of a valve triangle. */
const RIGHT_SEAT_BAND = polyPath([46, 22, 42, 24.8571, 42, 39.1429, 46, 42], true);

/** The same band along the base of the downward-facing third branch. */
const BOTTOM_SEAT_BAND = polyPath([24.8571, 42, 39.1429, 42, 42, 46, 22, 46], true);

function valveBody(): string {
  return joinPaths(
    polyPath([18, 22, 32, 32, 18, 42], true),
    polyPath([46, 22, 32, 32, 46, 42], true),
  );
}

/** Stem and square actuator box above a valve body. */
function valveActuatorBody(): string {
  return joinPaths(linePath(32, 15, 32, 32), rectPath(23, 3, 18, 12));
}

/** The letter M drawn as stroke paths inside the actuator box. */
function motorLetter(): string {
  return joinPaths(
    linePath(27, 13, 27, 6),
    linePath(27, 6, 32, 10),
    linePath(32, 10, 37, 6),
    linePath(37, 6, 37, 13),
  );
}

/** The letter H drawn as stroke paths inside the actuator box. */
function hydraulicLetter(): string {
  return joinPaths(linePath(27, 6, 27, 13), linePath(37, 6, 37, 13), linePath(27, 9.5, 37, 9.5));
}

/** Block-letter S for a solenoid actuator box. */
function solenoidLetter(): string {
  return joinPaths(
    linePath(36.5, 7.5, 28, 7.5),
    linePath(28, 7.5, 28, 9.5),
    linePath(28, 9.5, 36, 9.5),
    linePath(36, 9.5, 36, 12),
    linePath(36, 12, 27.5, 12),
  );
}

/** Block-letter P for a pilot actuator box. */
function pilotLetter(): string {
  return joinPaths(
    linePath(28, 6, 28, 13),
    linePath(28, 6, 36, 6),
    linePath(36, 6, 36, 9.5),
    linePath(36, 9.5, 28, 9.5),
  );
}

/** Block-letter W for a weight actuator box. */
function weightLetter(): string {
  return joinPaths(
    linePath(27, 6, 29, 13),
    linePath(29, 13, 32, 8),
    linePath(32, 8, 35, 13),
    linePath(35, 13, 37, 6),
  );
}

const SELF_DRAINING_HEAD = polyPath([27, 48, 32, 56, 37, 48], true);

const ANGLE_VALVE_BODY = joinPaths(
  polyPath([18, 22, 32, 32, 18, 42], true),
  polyPath([22, 46, 42, 46, 32, 32], true),
);

const RELIEF_SPRING = joinPaths(
  linePath(32, 32, 32, 14),
  linePath(24, 13, 40, 13),
  linePath(26, 10, 38, 10),
  linePath(24, 7, 40, 7),
  linePath(26, 4, 38, 4),
);

const ANGLE_BLOWDOWN_BRANCH = joinPaths(linePath(32, 32, 48, 16), linePath(42, 10, 54, 22));

const SPRING_GATE_SPRING = joinPaths(
  linePath(32, 32, 32, 14),
  linePath(26, 13, 38, 13),
  linePath(28, 10, 36, 10),
  linePath(26, 7, 38, 7),
  linePath(28, 4, 36, 4),
);

const SELF_OPERATING_RELEASE_FILL = polyPath(
  Array.from({ length: 33 }, (_, index) => {
    const angle = ((135 - (180 * index) / 32) * Math.PI) / 180;
    return [32 + Math.cos(angle) * 14, 32 + Math.sin(angle) * 14];
  }).flat(),
  true,
);

const STRAINER_FLANGES = joinPaths(
  linePath(8, 24, 8, 40),
  linePath(56, 24, 56, 40),
  linePath(8, 32, 56, 32),
);

const Y_STRAINER_BODY = joinPaths(
  STRAINER_FLANGES,
  linePath(32, 32, 50, 54),
  linePath(45, 42, 39, 47),
  linePath(47.5, 45, 41.5, 50),
  polyPath([45.2, 52.8, 49.8, 49, 50, 54], true),
  polyPath([50.2, 59, 54.8, 55.2, 50, 54], true),
);

const Y_TYPE_STRAINER_BODY = joinPaths(
  STRAINER_FLANGES,
  linePath(32, 32, 50, 54),
  linePath(42, 54, 58, 54),
);

const DIVERTER_VALVE_BODY = joinPaths(
  linePath(8, 24, 8, 40),
  linePath(56, 24, 56, 40),
  linePath(8, 32, 56, 32),
  smallCircle(32, 32, 10),
  linePath(39, 39, 50, 54),
  linePath(42, 54, 58, 54),
);

function pumpBody(): string {
  return joinPaths(smallCircle(32, 32, 16), polyPath([32, 20, 44, 40, 20, 40], true));
}

/** The pump circle with a slightly smaller upright flow triangle, nudged up. */
function pumpBodyUp(): string {
  return joinPaths(smallCircle(32, 32, 16), polyPath([32, 18, 43, 37, 21, 37], true));
}

/** The filled upper half of the upright pump triangle. */
const PUMP_TOP_HALF = polyPath([32, 18, 37.5, 27.5, 26.5, 27.5], true);

function meterBody(): string {
  return joinPaths(rectPath(12, 16, 40, 32), smallCircle(32, 30, 9), linePath(26, 38, 38, 38));
}

/** A district-heating meter panel with a bezelled display and two indicator dots. */
function meterPanelBody(): string {
  return joinPaths(
    roundedRectPathData(10, 8, 44, 48, 3),
    roundedRectPathData(15, 13, 34, 17, 3),
    roundedRectPathData(18, 16, 28, 11, 1.5),
  );
}

const METER_PANEL_DOTS = joinPaths(smallCircle(41, 38, 1.5), smallCircle(47, 38, 1.5));

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
      stroke(joinPaths(linePath(32, 32, 32, 12), linePath(25, 12, 39, 12))),
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
      stroke(joinPaths(linePath(32, 32, 32, 14), smallCircle(32, 10, 4))),
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
    shapes: [stroke(valveBody()), fill(RIGHT_SEAT_BAND)],
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
      // Discharge arrow pointing down to the body: long shaft, wide open head
      // whose tip sits level with the body's top corners.
      stroke(joinPaths(linePath(32, 2, 32, 17), polyPath([25, 12, 32, 22, 39, 12]))),
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
    id: "schematic.valve-motor-actuator",
    category: "valve",
    keywords: ["motorventil", "motorställdon", "motor actuator", "motor", "ventil", "mv"],
    tagPrefix: "MV",
    ports: valvePorts(),
    shapes: [stroke(joinPaths(valveBody(), valveActuatorBody(), motorLetter()))],
  }),
  schematicSymbol({
    id: "schematic.valve-hydraulic-actuator",
    category: "valve",
    keywords: [
      "hydraulventil",
      "hydrauliskt ställdon",
      "hydraulic actuator",
      "hydraulik",
      "ventil",
      "hv",
    ],
    tagPrefix: "HV",
    ports: valvePorts(),
    shapes: [stroke(joinPaths(valveBody(), valveActuatorBody(), hydraulicLetter()))],
  }),
  schematicSymbol({
    id: "schematic.y-strainer",
    category: "valve",
    keywords: ["y-sil", "y-strainer", "sil", "filter", "strainer", "ys"],
    tagPrefix: "YS",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
      { id: "blowdown", x: 50, y: 54, direction: "out" },
    ],
    shapes: [stroke(Y_STRAINER_BODY)],
  }),
  schematicSymbol({
    id: "schematic.diverter-valve",
    category: "valve",
    keywords: ["fördelarventil", "diverter valve", "diverter", "ventil", "dv"],
    tagPrefix: "DV",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
      { id: "branch", x: 50, y: 54, direction: "out" },
    ],
    shapes: [stroke(DIVERTER_VALVE_BODY)],
  }),
  schematicSymbol({
    id: "schematic.y-type-strainer",
    category: "valve",
    keywords: ["y-sil typ y", "y-type strainer", "sil", "filter", "strainer", "yts"],
    tagPrefix: "YTS",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
    ],
    shapes: [stroke(Y_TYPE_STRAINER_BODY)],
  }),
  schematicSymbol({
    id: "schematic.solenoid-valve-s",
    category: "valve",
    keywords: ["magnetventil s-ruta", "solenoid valve s box", "magnetventil", "ventil", "s"],
    tagPrefix: "S",
    ports: valvePorts(),
    shapes: [stroke(joinPaths(valveBody(), valveActuatorBody(), solenoidLetter()))],
  }),
  schematicSymbol({
    id: "schematic.pilot-gate-valve",
    category: "valve",
    keywords: ["pilotstyrd ventil", "pilot gate valve", "pilot", "ventil", "p"],
    tagPrefix: "P",
    ports: valvePorts(),
    shapes: [stroke(joinPaths(valveBody(), valveActuatorBody(), pilotLetter()))],
  }),
  schematicSymbol({
    id: "schematic.weight-gate-valve",
    category: "valve",
    keywords: ["viktstyrd ventil", "weight gate valve", "vikt", "ventil", "w"],
    tagPrefix: "W",
    ports: valvePorts(),
    shapes: [stroke(joinPaths(valveBody(), valveActuatorBody(), weightLetter()))],
  }),
  schematicSymbol({
    id: "schematic.powered-valve",
    category: "valve",
    keywords: ["driven ventil", "powered valve", "ställdon", "ventil", "pv"],
    tagPrefix: "PV",
    ports: valvePorts(),
    shapes: [stroke(joinPaths(valveBody(), valveActuatorBody()))],
  }),
  schematicSymbol({
    id: "schematic.self-draining-valve",
    category: "valve",
    keywords: [
      "självavtappande ventil",
      "self-draining valve",
      "självdränning",
      "avtappning",
      "ventil",
      "sd",
    ],
    tagPrefix: "SD",
    ports: [
      { id: "in", x: 18, y: 32, direction: "in" },
      { id: "out", x: 46, y: 32, direction: "out" },
      { id: "drain", x: 32, y: 58, direction: "out" },
    ],
    shapes: [stroke(joinPaths(valveBody(), linePath(32, 32, 32, 48))), fill(SELF_DRAINING_HEAD)],
  }),
  schematicSymbol({
    id: "schematic.spring-gate-valve",
    category: "valve",
    keywords: [
      "fjäderbelastad slussventil",
      "spring gate valve",
      "fjäder",
      "slussventil",
      "ventil",
      "spg",
    ],
    tagPrefix: "SPG",
    ports: valvePorts(),
    shapes: [stroke(joinPaths(valveBody(), SPRING_GATE_SPRING))],
  }),
  schematicSymbol({
    id: "schematic.self-operating-release-valve",
    category: "valve",
    keywords: [
      "självverkande avlastningsventil",
      "self-operating release valve",
      "avlastning",
      "självverkande",
      "ventil",
      "sor",
    ],
    tagPrefix: "SOR",
    ports: [{ id: "process", x: 32, y: 46, direction: "both" }],
    shapes: [
      stroke(joinPaths(smallCircle(32, 32, 14), linePath(42, 22, 22, 42))),
      fill(SELF_OPERATING_RELEASE_FILL),
    ],
  }),
  schematicSymbol({
    id: "schematic.closed-gate-valve",
    category: "valve",
    keywords: ["stängd slussventil", "closed gate valve", "slussventil", "gate", "ventil", "sgv"],
    tagPrefix: "SGV",
    ports: valvePorts(),
    shapes: [fill(valveBody())],
  }),
  schematicSymbol({
    id: "schematic.hand-globe-valve",
    category: "valve",
    keywords: [
      "handmanövrerad sätesventil",
      "hand-operated globe valve",
      "sätesventil",
      "hand",
      "ventil",
      "hgv",
    ],
    tagPrefix: "HGV",
    ports: valvePorts(),
    shapes: [
      stroke(joinPaths(valveBody(), linePath(32, 32, 32, 12), linePath(24, 12, 40, 12))),
      fill(smallCircle(32, 32, 3)),
    ],
  }),
  schematicSymbol({
    id: "schematic.globe-valve",
    category: "valve",
    keywords: ["sätesventil", "globe valve", "ventil", "säte", "gv"],
    tagPrefix: "GV",
    ports: valvePorts(),
    shapes: [stroke(valveBody()), fill(smallCircle(32, 32, 3))],
  }),
  schematicSymbol({
    id: "schematic.rotary-valve",
    category: "valve",
    keywords: ["vridventil", "rotary valve", "vrid", "rotary", "ventil", "vr"],
    tagPrefix: "VR",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(
        joinPaths(
          linePath(8, 24, 8, 40),
          linePath(56, 24, 56, 40),
          linePath(8, 32, 56, 32),
          smallCircle(32, 32, 10),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.needle-valve",
    category: "valve",
    keywords: ["nålventil", "needle valve", "nål", "ventil", "nv"],
    tagPrefix: "NV",
    ports: valvePorts(),
    shapes: [
      stroke(
        joinPaths(
          valveBody(),
          linePath(32, 16, 32, 48),
          linePath(28, 16, 36, 16),
          linePath(28, 48, 36, 48),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.control-valve-diaphragm",
    category: "valve",
    keywords: [
      "reglerventil med membranställdon",
      "control valve with diaphragm actuator",
      "reglerventil",
      "membran",
      "ventil",
      "rm",
    ],
    tagPrefix: "RM",
    ports: valvePorts(),
    shapes: [
      stroke(
        joinPaths(
          valveBody(),
          linePath(32, 32, 32, 14),
          linePath(24, 14, 40, 14),
          "M 24 14 Q 32 2 40 14",
        ),
      ),
    ],
  }),
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
  schematicSymbol({
    id: "schematic.district-energy-meter-panel",
    category: "district-heating",
    keywords: [
      "fjärrvärmemätare",
      "panel",
      "display",
      "fjärrvärme",
      "mätare",
      "district heating meter",
      "meter panel",
    ],
    tagPrefix: "FEM",
    ports: [],
    shapes: [stroke(meterPanelBody()), fill(METER_PANEL_DOTS)],
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

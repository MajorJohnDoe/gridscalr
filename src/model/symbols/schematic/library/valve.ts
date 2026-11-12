import type { SymbolDefinition } from "../../types";
import {
  stroke,
  fill,
  joinPaths,
  linePath,
  polyPath,
  rectPath,
  smallCircle,
  valvePorts,
  schematicSymbol,
  valveBody,
} from "../primitives";
import {
  RIGHT_SEAT_BAND,
  valveActuatorBody,
  motorLetter,
  hydraulicLetter,
  solenoidLetter,
  pilotLetter,
  weightLetter,
  SELF_DRAINING_HEAD,
  SPRING_GATE_SPRING,
  SELF_OPERATING_RELEASE_FILL,
  Y_STRAINER_BODY,
  Y_TYPE_STRAINER_BODY,
  DIVERTER_VALVE_BODY,
} from "./valveParts";

/**
 * Core valve bodies, actuators and strainers, split out of the schematic
 * library by category.
 */
export const VALVE_SYMBOLS: SymbolDefinition[] = [
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
];

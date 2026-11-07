import type { SymbolDefinition } from "../../../../model/symbols";
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
  BOTTOM_SEAT_BAND,
  valveActuatorBody,
  motorLetter,
  hydraulicLetter,
  solenoidLetter,
  pilotLetter,
  weightLetter,
  SELF_DRAINING_HEAD,
  ANGLE_VALVE_BODY,
  RELIEF_SPRING,
  ANGLE_BLOWDOWN_BRANCH,
  SPRING_GATE_SPRING,
  SELF_OPERATING_RELEASE_FILL,
  Y_STRAINER_BODY,
  Y_TYPE_STRAINER_BODY,
  DIVERTER_VALVE_BODY,
} from "./valveParts";

/**
 * valve symbols, split out of the schematic library by category.
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

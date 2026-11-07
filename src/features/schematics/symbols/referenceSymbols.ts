import type { SymbolDefinition } from "../../../model/symbols";
import {
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
 * Additional symbols redrawn as original stroke artwork from the conventions
 * shown in the operation-card reference pages. They follow common SS/ISO
 * schematic practice but are not certified reproductions.
 */

const PORTS_INLINE = () => [
  { id: "in", x: 2, y: 32, direction: "in" as const },
  { id: "out", x: 62, y: 32, direction: "out" as const },
];

function valveBody(): string {
  return joinPaths(
    polyPath([18, 22, 32, 32, 18, 42], true),
    polyPath([46, 22, 32, 32, 46, 42], true),
  );
}

function contactBlade(closed: boolean): string {
  return closed
    ? joinPaths(linePath(8, 32, 24, 32), linePath(24, 32, 44, 32), linePath(44, 32, 56, 32))
    : joinPaths(linePath(8, 32, 24, 32), linePath(24, 32, 44, 20), linePath(44, 32, 56, 32));
}

function fuseBody(): string {
  return joinPaths(
    rectPath(28, 14, 8, 36),
    linePath(32, 2, 32, 14),
    linePath(32, 50, 32, 62),
    linePath(32, 14, 32, 50),
  );
}

function coilBody(): string {
  return joinPaths(rectPath(22, 24, 20, 16), linePath(32, 2, 32, 24), linePath(32, 40, 32, 62));
}

export const REFERENCE_SYMBOLS: SymbolDefinition[] = [
  // --- Sensors and actuators --------------------------------------------
  schematicSymbol({
    id: "schematic.sensor",
    category: "instrument",
    keywords: ["givare", "sensor", "termostat", "g", "allmän givare"],
    tagPrefix: "G",
    ports: [{ id: "process", x: 32, y: 58, direction: "both" }],
    shapes: [stroke(sensorFunnel())],
  }),
  schematicSymbol({
    id: "schematic.sensor-external",
    category: "instrument",
    keywords: ["givare yttre mätställe", "sensor external", "givare", "g"],
    tagPrefix: "G",
    ports: [{ id: "process", x: 32, y: 40, direction: "both" }],
    shapes: [
      stroke(sensorFunnel(40)),
      stroke(joinPaths(linePath(32, 38, 14, 38), linePath(14, 38, 14, 48))),
      stroke(smallCircle(14, 52, 3)),
    ],
  }),
  schematicSymbol({
    id: "schematic.sensor-internal",
    category: "instrument",
    keywords: ["givare inre mätställe", "sensor internal", "givare", "g"],
    tagPrefix: "G",
    ports: [{ id: "process", x: 32, y: 58, direction: "both" }],
    shapes: [stroke(sensorFunnel()), stroke(linePath(32, 16, 32, 34))],
  }),
  schematicSymbol({
    id: "schematic.sensor-differential",
    category: "instrument",
    keywords: ["differensgivare", "differential sensor", "givare", "g"],
    tagPrefix: "G",
    ports: [
      { id: "high", x: 12, y: 48, direction: "both" },
      { id: "low", x: 52, y: 48, direction: "both" },
    ],
    shapes: [
      stroke(sensorFunnel(40)),
      stroke(joinPaths(linePath(32, 38, 12, 38), linePath(12, 38, 12, 46))),
      stroke(joinPaths(linePath(32, 38, 52, 38), linePath(52, 38, 52, 46))),
      stroke(smallCircle(12, 50, 2.4)),
      stroke(smallCircle(52, 50, 2.4)),
    ],
  }),
  schematicSymbol({
    id: "schematic.meter",
    category: "instrument",
    keywords: ["mätinstrument", "meter", "mätare", "g"],
    tagPrefix: "G",
    ports: PORTS_INLINE(),
    shapes: [stroke(smallCircle(32, 32, 15))],
  }),
  schematicSymbol({
    id: "schematic.meter-indicating",
    category: "instrument",
    keywords: ["mätinstrument indikering", "meter indicating", "mätare", "g"],
    tagPrefix: "G",
    ports: PORTS_INLINE(),
    shapes: [
      stroke(joinPaths(smallCircle(32, 32, 15), linePath(32, 32, 40, 20))),
      stroke(
        joinPaths(linePath(23, 20, 23, 24), linePath(32, 17, 32, 21), linePath(41, 20, 41, 24)),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.actuator-latching",
    category: "instrument",
    keywords: ["ställdon behåller läge", "actuator latching", "ställdon", "st"],
    tagPrefix: "ST",
    ports: [{ id: "stem", x: 32, y: 62, direction: "both" }],
    shapes: [
      stroke(joinPaths(smallCircle(32, 22, 11), linePath(32, 33, 32, 48))),
      stroke(
        joinPaths(linePath(24, 44, 40, 44), linePath(28, 40, 28, 48), linePath(36, 40, 36, 48)),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.actuator-close",
    category: "instrument",
    keywords: ["ställdon stänger energibortfall", "actuator close", "ställdon", "st"],
    tagPrefix: "ST",
    ports: [{ id: "stem", x: 32, y: 62, direction: "both" }],
    shapes: [
      stroke(joinPaths(smallCircle(32, 22, 11), linePath(32, 33, 32, 50))),
      stroke(polyPath([26, 46, 32, 55, 38, 46])),
    ],
  }),
  schematicSymbol({
    id: "schematic.actuator-open",
    category: "instrument",
    keywords: ["ställdon öppnar energibortfall", "actuator open", "ställdon", "st"],
    tagPrefix: "ST",
    ports: [{ id: "stem", x: 32, y: 62, direction: "both" }],
    shapes: [
      stroke(joinPaths(smallCircle(32, 22, 11), linePath(32, 33, 32, 50))),
      stroke(polyPath([26, 46, 32, 37, 38, 46])),
    ],
  }),
  schematicSymbol({
    id: "schematic.actuator-solenoid",
    category: "instrument",
    keywords: ["ställdon elektromagnet", "actuator solenoid", "ställdon", "st"],
    tagPrefix: "ST",
    ports: [{ id: "stem", x: 32, y: 62, direction: "both" }],
    shapes: [
      stroke(joinPaths(smallCircle(32, 22, 11), linePath(32, 33, 32, 62))),
      stroke(polyPath([25, 26, 35, 21, 29, 20, 39, 15])),
    ],
  }),
  schematicSymbol({
    id: "schematic.actuator-self",
    category: "instrument",
    keywords: ["ställdon självverkande", "actuator self acting", "ställdon", "st"],
    tagPrefix: "ST",
    ports: [{ id: "stem", x: 32, y: 62, direction: "both" }],
    shapes: [
      stroke(joinPaths(smallCircle(32, 22, 11), linePath(32, 33, 32, 62))),
      stroke(linePath(22, 30, 42, 14)),
    ],
  }),

  // --- Valves ------------------------------------------------------------
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
  schematicSymbol({
    id: "schematic.control-central",
    category: "control",
    keywords: ["reglercentral", "control central", "rc", "styr"],
    tagPrefix: "RC",
    ports: [{ id: "bus", x: 32, y: 62, direction: "both" }],
    shapes: [
      stroke(rectPath(12, 18, 40, 28)),
      stroke(
        joinPaths(linePath(24, 32, 40, 32), linePath(28, 24, 28, 40), linePath(36, 24, 36, 40)),
      ),
      stroke(linePath(32, 46, 32, 62)),
    ],
  }),

  // --- Ventilation and heat ---------------------------------------------
  schematicSymbol({
    id: "schematic.compressor",
    category: "ventilation",
    keywords: ["kompressor", "compressor", "kyla", "kom"],
    tagPrefix: "KOM",
    ports: PORTS_INLINE(),
    shapes: [
      stroke(rectPath(10, 20, 44, 24)),
      stroke(smallCircle(32, 32, 10)),
      stroke(joinPaths(linePath(14, 26, 26, 26), linePath(38, 38, 50, 38))),
    ],
  }),
  schematicSymbol({
    id: "schematic.electric-air-heater",
    category: "heating",
    keywords: ["elektrisk luftvärmare", "electric air heater", "elvärmare", "värme"],
    tagPrefix: "EVB",
    ports: PORTS_INLINE(),
    shapes: [
      stroke(rectPath(14, 14, 36, 36)),
      stroke(polyPath([32, 18, 38, 18, 30, 31, 38, 31, 26, 46, 30, 34, 24, 34, 32, 18])),
    ],
  }),
  schematicSymbol({
    id: "schematic.combined-coil",
    category: "heating",
    keywords: ["kombinerat värme- och kylbatteri", "combined heat and cooling coil", "batteri"],
    tagPrefix: "KVB",
    ports: PORTS_INLINE(),
    shapes: [
      stroke(rectPath(14, 14, 36, 36)),
      stroke(joinPaths(smallCircle(23, 23, 5), linePath(19, 23, 27, 23), linePath(23, 19, 23, 27))),
      stroke(joinPaths(smallCircle(41, 41, 5), linePath(37, 41, 45, 41))),
    ],
  }),
  schematicSymbol({
    id: "schematic.humidifier",
    category: "ventilation",
    keywords: ["fuktare", "humidifier", "fukt", "ventilation"],
    tagPrefix: "BEF",
    ports: PORTS_INLINE(),
    shapes: [
      stroke(rectPath(14, 14, 36, 36)),
      stroke(joinPaths(linePath(44, 20, 34, 34), polyPath([30, 30, 34, 40, 40, 32], true))),
    ],
  }),
  schematicSymbol({
    id: "schematic.boiler",
    category: "heating",
    keywords: ["panna", "boiler", "värme", "p"],
    tagPrefix: "P",
    ports: PORTS_INLINE(),
    shapes: [stroke(rectPath(22, 22, 20, 20))],
  }),
  schematicSymbol({
    id: "schematic.cross-flow-recovery",
    category: "exchanger",
    keywords: [
      "korsströmsvärmeväxlare",
      "cross-flow heat exchanger",
      "återvinning",
      "värmeväxlare",
    ],
    tagPrefix: "VVX",
    ports: [
      { id: "in", x: 22, y: 2, direction: "in" },
      { id: "out", x: 42, y: 62, direction: "out" },
    ],
    shapes: [
      stroke(rectPath(22, 10, 20, 44)),
      stroke(joinPaths("M 22 16 L 42 24 L 22 32 L 42 40 L 22 48")),
      stroke(joinPaths("M 42 16 L 22 24 L 42 32 L 22 40 L 42 48")),
    ],
  }),
  schematicSymbol({
    id: "schematic.damper-actuator",
    category: "ventilation",
    keywords: ["spjäll med ställdon", "damper with actuator", "spjäll", "ställdon"],
    tagPrefix: "SP",
    ports: PORTS_INLINE(),
    shapes: [
      stroke(rectPath(14, 14, 36, 24)),
      stroke(linePath(32, 20, 32, 32)),
      fill(smallCircle(32, 32, 2.4)),
      stroke(joinPaths(linePath(32, 38, 32, 46), smallCircle(32, 50, 4))),
    ],
  }),
  schematicSymbol({
    id: "schematic.modulating-damper",
    category: "ventilation",
    keywords: ["modulerande spjäll", "modulating damper", "spjäll", "ställdon"],
    tagPrefix: "SP",
    ports: PORTS_INLINE(),
    shapes: [
      stroke(rectPath(14, 14, 36, 24)),
      stroke(linePath(20, 38, 44, 16)),
      stroke(joinPaths(linePath(32, 38, 32, 46), smallCircle(32, 50, 4))),
    ],
  }),

  // --- Electrical contacts ----------------------------------------------
  schematicSymbol({
    id: "schematic.contact-no",
    category: "control",
    keywords: ["slutande kontakt", "normally open contact", "kontakt", "k"],
    tagPrefix: "K",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
    ],
    shapes: [stroke(contactBlade(false))],
  }),
  schematicSymbol({
    id: "schematic.contact-nc",
    category: "control",
    keywords: ["brytande kontakt", "normally closed contact", "kontakt", "k"],
    tagPrefix: "K",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(contactBlade(true)),
      stroke(linePath(24, 32, 44, 16)),
      stroke(smallCircle(24, 32, 2.2)),
    ],
  }),
  schematicSymbol({
    id: "schematic.contact-changeover",
    category: "control",
    keywords: ["växlande kontakt", "changeover contact", "kontakt", "k"],
    tagPrefix: "K",
    ports: [
      { id: "common", x: 8, y: 32, direction: "in" },
      { id: "no", x: 56, y: 20, direction: "out" },
      { id: "nc", x: 56, y: 44, direction: "out" },
    ],
    shapes: [
      stroke(
        joinPaths(linePath(8, 32, 24, 32), linePath(24, 32, 46, 20), linePath(46, 20, 56, 20)),
      ),
      stroke(joinPaths(linePath(46, 44, 56, 44), linePath(24, 32, 46, 44))),
      stroke(smallCircle(24, 32, 2.2)),
    ],
  }),
  schematicSymbol({
    id: "schematic.contact-no-delayed",
    category: "control",
    keywords: ["slutande kontakt fördröjd", "delayed closing contact", "kontakt", "k"],
    tagPrefix: "K",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(contactBlade(false)),
      stroke("M 32 22 Q 40 14 48 22"),
      stroke(polyPath([45, 18, 51, 24, 43, 26], true)),
    ],
  }),
  schematicSymbol({
    id: "schematic.contact-nc-delayed",
    category: "control",
    keywords: ["brytande kontakt fördröjd", "delayed opening contact", "kontakt", "k"],
    tagPrefix: "K",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(contactBlade(true)),
      stroke(linePath(24, 32, 44, 16)),
      stroke("M 32 22 Q 40 14 48 22"),
      stroke(polyPath([45, 18, 51, 24, 43, 26], true)),
    ],
  }),
  schematicSymbol({
    id: "schematic.switch-manual",
    category: "control",
    keywords: ["elkopplare handmanövrerad", "manual switch", "brytare", "s"],
    tagPrefix: "S",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(contactBlade(false)),
      stroke(joinPaths(linePath(24, 36, 32, 48), linePath(26, 48, 38, 48))),
    ],
  }),
  schematicSymbol({
    id: "schematic.switch-1p",
    category: "control",
    keywords: ["strömbrytare", "switch", "1-pol", "single-pole", "brytare", "s1"],
    tagPrefix: "S1",
    // Terminal circle with a lever and one contact bar at the top.
    ports: [
      { id: "in", x: 11, y: 46, direction: "in" },
      { id: "out", x: 47, y: 26, direction: "out" },
    ],
    shapes: [
      stroke(smallCircle(18, 46, 7)),
      stroke(linePath(22.95, 41.05, 40, 20)),
      stroke(linePath(40, 20, 47, 25.7)),
    ],
  }),
  schematicSymbol({
    id: "schematic.switch-3p",
    category: "control",
    keywords: ["strömbrytare", "switch", "3-pol", "three-pole", "brytare", "s3"],
    tagPrefix: "S3",
    // Terminal circle with a lever and three contact bars along its upper part.
    ports: [
      { id: "in", x: 11, y: 46, direction: "in" },
      { id: "out", x: 47, y: 26, direction: "out" },
    ],
    shapes: [
      stroke(smallCircle(18, 46, 7)),
      stroke(linePath(22.95, 41.05, 40, 20)),
      stroke(
        joinPaths(
          linePath(40, 20, 47, 25.7),
          linePath(36.85, 23.9, 43.85, 29.6),
          linePath(33.7, 27.8, 40.7, 33.5),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.pushbutton",
    category: "control",
    keywords: ["tryckknapp", "pushbutton", "knapp", "sb"],
    tagPrefix: "SB",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(contactBlade(false)),
      stroke(
        joinPaths(linePath(24, 36, 32, 46), linePath(26, 46, 38, 46), linePath(32, 46, 32, 52)),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.main-contact",
    category: "control",
    keywords: ["huvudkontakt", "main contact", "kontaktor", "hk"],
    tagPrefix: "HK",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
    ],
    shapes: [stroke(contactBlade(false)), stroke(linePath(24, 18, 44, 18))],
  }),

  // --- Fuses and safety breakers ----------------------------------------
  schematicSymbol({
    id: "schematic.fuse-feed",
    category: "control",
    keywords: ["säkring matningssida", "fuse feed side", "säkring", "sä"],
    tagPrefix: "SÄ",
    ports: [
      { id: "top", x: 32, y: 2, direction: "in" },
      { id: "bottom", x: 32, y: 62, direction: "out" },
    ],
    shapes: [stroke(fuseBody()), fill(rectPath(28, 10, 8, 4))],
  }),
  schematicSymbol({
    id: "schematic.fuse-1p-n",
    category: "control",
    keywords: ["säkring enfas nolla", "fuse single phase neutral", "säkring", "sä"],
    tagPrefix: "SÄ",
    ports: [
      { id: "l", x: 24, y: 2, direction: "in" },
      { id: "n", x: 40, y: 2, direction: "in" },
    ],
    shapes: [
      stroke(joinPaths(rectPath(20, 16, 8, 30), linePath(24, 2, 24, 16), linePath(24, 46, 24, 62))),
      stroke(joinPaths(rectPath(36, 16, 8, 30), linePath(40, 2, 40, 16), linePath(40, 46, 40, 62))),
      fill(smallCircle(24, 10, 2.2)),
      fill(smallCircle(40, 10, 2.2)),
    ],
  }),
  schematicSymbol({
    id: "schematic.fuse-group-3p",
    category: "control",
    keywords: ["säkringsgrupp trefas", "three phase fuse group", "säkring", "sä"],
    tagPrefix: "SÄ",
    ports: [
      { id: "l1", x: 18, y: 2, direction: "in" },
      { id: "l2", x: 32, y: 2, direction: "in" },
      { id: "l3", x: 46, y: 2, direction: "in" },
    ],
    shapes: [
      stroke(joinPaths(rectPath(14, 16, 8, 30), linePath(18, 2, 18, 16), linePath(18, 46, 18, 62))),
      stroke(joinPaths(rectPath(28, 16, 8, 30), linePath(32, 2, 32, 16), linePath(32, 46, 32, 62))),
      stroke(joinPaths(rectPath(42, 16, 8, 30), linePath(46, 2, 46, 16), linePath(46, 46, 46, 62))),
      fill(smallCircle(18, 10, 2.2)),
      fill(smallCircle(32, 10, 2.2)),
      fill(smallCircle(46, 10, 2.2)),
    ],
  }),
  schematicSymbol({
    id: "schematic.auto-fuse",
    category: "control",
    keywords: ["automatsäkring", "automatic fuse", "säkring", "sä"],
    tagPrefix: "SÄ",
    ports: PORTS_INLINE(),
    shapes: [
      stroke(contactBlade(false)),
      stroke(joinPaths(linePath(14, 46, 50, 46), polyPath([44, 42, 52, 46, 44, 50], true))),
    ],
  }),
  schematicSymbol({
    id: "schematic.safety-breaker",
    category: "control",
    keywords: ["säkerhetsbrytare", "safety breaker", "brytare", "sä"],
    tagPrefix: "SÄ",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
    ],
    shapes: [stroke(contactBlade(false)), stroke(polyPath([40, 18, 48, 12, 48, 24]))],
  }),
  schematicSymbol({
    id: "schematic.thermal-relay-contact",
    category: "control",
    keywords: ["brytkontakt termiskt relä", "thermal relay contact", "relä", "termisk"],
    tagPrefix: "F",
    ports: [
      { id: "in", x: 8, y: 32, direction: "in" },
      { id: "out", x: 56, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(contactBlade(true)),
      stroke(joinPaths(linePath(24, 32, 44, 16), "M 42 20 Q 48 24 50 32")),
    ],
  }),
  schematicSymbol({
    id: "schematic.motor-protection",
    category: "control",
    keywords: ["motorskyddsbrytare", "motor protection", "motor", "skydd"],
    tagPrefix: "MS",
    ports: PORTS_INLINE(),
    shapes: [
      stroke(joinPaths(linePath(2, 18, 62, 18), linePath(2, 46, 62, 46))),
      stroke(
        joinPaths(rectPath(12, 18, 12, 28), rectPath(26, 18, 12, 28), rectPath(40, 18, 12, 28)),
      ),
      stroke(joinPaths(rectPath(16, 26, 4, 10), rectPath(30, 26, 4, 10), rectPath(44, 26, 4, 10))),
    ],
  }),
  schematicSymbol({
    id: "schematic.safety-breaker-3p",
    category: "control",
    keywords: ["säkerhetsbrytare trefas", "three phase safety breaker", "brytare", "motor"],
    tagPrefix: "SÄ",
    ports: PORTS_INLINE(),
    shapes: [
      stroke(joinPaths(linePath(2, 18, 62, 18), linePath(2, 46, 62, 46))),
      stroke(
        joinPaths(rectPath(14, 18, 10, 28), rectPath(28, 18, 10, 28), rectPath(42, 18, 10, 28)),
      ),
      stroke(joinPaths(smallCircle(32, 54, 7), linePath(27, 54, 37, 54), linePath(32, 50, 32, 58))),
    ],
  }),

  // --- Relays and transformers ------------------------------------------
  schematicSymbol({
    id: "schematic.relay-delay-on",
    category: "control",
    keywords: ["relä tillslagsfördröjt", "relay delay on", "relä", "re"],
    tagPrefix: "RE",
    ports: [
      { id: "top", x: 32, y: 2, direction: "in" },
      { id: "bottom", x: 32, y: 62, direction: "out" },
    ],
    shapes: [
      stroke(coilBody()),
      stroke(joinPaths(rectPath(8, 24, 12, 16), linePath(8, 24, 20, 40), linePath(20, 24, 8, 40))),
    ],
  }),
  schematicSymbol({
    id: "schematic.relay-delay-off",
    category: "control",
    keywords: ["relä frånslagsfördröjt", "relay delay off", "relä", "re"],
    tagPrefix: "RE",
    ports: [
      { id: "top", x: 32, y: 2, direction: "in" },
      { id: "bottom", x: 32, y: 62, direction: "out" },
    ],
    shapes: [stroke(coilBody()), fill(rectPath(8, 24, 12, 16))],
  }),
  schematicSymbol({
    id: "schematic.transformer",
    category: "control",
    keywords: ["transformator", "transformer", "trafo", "tr"],
    tagPrefix: "TR",
    ports: PORTS_INLINE(),
    shapes: [
      stroke(rectPath(16, 24, 32, 16)),
      stroke(joinPaths(smallCircle(27, 32, 6), smallCircle(37, 32, 6))),
    ],
  }),
  schematicSymbol({
    id: "schematic.transformer-1f-1fuse",
    category: "control",
    keywords: ["transformator enfas en säkring", "transformer single phase one fuse", "trafo"],
    tagPrefix: "TR",
    ports: [
      { id: "top", x: 28, y: 2, direction: "in" },
      { id: "bottom", x: 28, y: 62, direction: "out" },
    ],
    shapes: [
      stroke(joinPaths("M 20 14 L 28 10 L 20 22 L 28 18 L 20 30 L 28 26", linePath(24, 2, 24, 14))),
      stroke(fuseBody()),
    ],
  }),
  schematicSymbol({
    id: "schematic.transformer-1f-2fuse",
    category: "control",
    keywords: ["transformator enfas två säkringar", "transformer single phase two fuses", "trafo"],
    tagPrefix: "TR",
    ports: [
      { id: "top", x: 24, y: 2, direction: "in" },
      { id: "bottom", x: 40, y: 62, direction: "out" },
    ],
    shapes: [
      stroke(joinPaths("M 18 12 L 26 8 L 18 20 L 26 16 L 18 28 L 26 24", linePath(22, 2, 22, 12))),
      stroke(joinPaths("M 34 12 L 42 8 L 34 20 L 42 16 L 34 28 L 42 24", linePath(38, 2, 38, 12))),
      stroke(joinPaths(rectPath(12, 44, 8, 18), rectPath(30, 44, 8, 18))),
      stroke(joinPaths(linePath(16, 36, 16, 44), linePath(34, 36, 34, 44))),
    ],
  }),

  // --- Other electrical --------------------------------------------------
  schematicSymbol({
    id: "schematic.resistor",
    category: "general",
    keywords: ["resistans", "resistor", "motstånd", "r"],
    tagPrefix: "R",
    ports: [
      { id: "top", x: 32, y: 2, direction: "in" },
      { id: "bottom", x: 32, y: 62, direction: "out" },
    ],
    shapes: [
      stroke(joinPaths(rectPath(28, 18, 8, 24), linePath(32, 2, 32, 18), linePath(32, 42, 32, 62))),
    ],
  }),
  schematicSymbol({
    id: "schematic.potentiometer",
    category: "general",
    keywords: ["potentiometer", "pot", "motstånd", "rp"],
    tagPrefix: "RP",
    ports: PORTS_INLINE(),
    shapes: [
      stroke(joinPaths(rectPath(20, 30, 24, 8), linePath(2, 34, 20, 34), linePath(44, 34, 62, 34))),
      stroke(joinPaths(linePath(32, 12, 32, 30), polyPath([27, 24, 32, 31, 37, 24], true))),
      fill(smallCircle(20, 34, 2.2)),
      fill(smallCircle(44, 34, 2.2)),
    ],
  }),
  schematicSymbol({
    id: "schematic.lamp",
    category: "general",
    keywords: ["lampa", "lamp", "belysning", "l"],
    tagPrefix: "L",
    ports: PORTS_INLINE(),
    shapes: [
      stroke(joinPaths(smallCircle(32, 32, 9), linePath(26, 26, 38, 38), linePath(38, 26, 26, 38))),
      stroke(joinPaths(linePath(2, 32, 23, 32), linePath(41, 32, 62, 32))),
    ],
  }),
  schematicSymbol({
    id: "schematic.timer",
    category: "general",
    keywords: ["tidur", "timer", "tid", "t"],
    tagPrefix: "T",
    ports: [
      { id: "top", x: 32, y: 2, direction: "in" },
      { id: "bottom", x: 32, y: 62, direction: "out" },
    ],
    shapes: [
      stroke(
        joinPaths(rectPath(20, 24, 24, 16), linePath(32, 2, 32, 24), linePath(32, 40, 32, 62)),
      ),
      stroke(smallCircle(32, 32, 5)),
    ],
  }),
  schematicSymbol({
    id: "schematic.signal-converter",
    category: "general",
    keywords: ["signalomvandlare", "signal converter", "signal", "omvandlare"],
    tagPrefix: "SO",
    ports: PORTS_INLINE(),
    shapes: [stroke(joinPaths(rectPath(20, 20, 24, 24), linePath(20, 44, 44, 20)))],
  }),

  // --- Flow direction ----------------------------------------------------
  schematicSymbol({
    id: "schematic.flow-arrow",
    category: "general",
    keywords: ["flödespil", "flöde", "riktning", "flow arrow", "flow", "direction", "pil"],
    tagPrefix: "FL",
    defaultSize: 24,
    ports: [{ id: "flow", x: 32, y: 32, direction: "out" }],
    shapes: [stroke("M 22 18 L 42 32 L 22 46")],
  }),
  schematicSymbol({
    id: "schematic.flow-arrow-thick",
    category: "general",
    keywords: [
      "flödespil",
      "tjock",
      "flöde",
      "riktning",
      "flow arrow",
      "thick",
      "flow",
      "direction",
      "pil",
    ],
    tagPrefix: "FL",
    defaultSize: 24,
    fixedStrokeWidth: 1.2,
    ports: [{ id: "flow", x: 32, y: 32, direction: "out" }],
    shapes: [stroke("M 22 18 L 42 32 L 22 46")],
  }),
];

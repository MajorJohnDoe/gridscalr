import type { SymbolDefinition } from "../../types";
import {
  stroke,
  fill,
  joinPaths,
  linePath,
  polyPath,
  rectPath,
  smallCircle,
  schematicSymbol,
  inlinePorts,
} from "../primitives";

/**
 * Reference-aligned control symbols, split out by category.
 */

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

export const CONTROL_SYMBOLS: SymbolDefinition[] = [
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
    ports: inlinePorts(),
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
    ports: inlinePorts(),
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
    ports: inlinePorts(),
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
    ports: inlinePorts(),
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
];

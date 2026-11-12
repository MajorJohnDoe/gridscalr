import type { SymbolDefinition } from "../../types";
import {
  stroke,
  joinPaths,
  linePath,
  polyPath,
  smallCircle,
  sensorFunnel,
  schematicSymbol,
  inlinePorts,
} from "../primitives";
import { SENSOR_PORTS, meterBody } from "./parts";

/**
 * instrument symbols, split out of the schematic library by category.
 */

export const INSTRUMENT_SYMBOLS: SymbolDefinition[] = [
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
    ports: inlinePorts(),
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
    ports: inlinePorts(),
    shapes: [stroke(meterBody()), stroke(polyPath([27, 30, 32, 22, 31, 29, 37, 25, 32, 38]))],
  }),

  // --- Valves ------------------------------------------------------------
];

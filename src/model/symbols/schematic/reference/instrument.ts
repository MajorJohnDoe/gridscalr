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

/**
 * Reference-aligned instrument symbols, split out by category.
 */

export const INSTRUMENT_SYMBOLS: SymbolDefinition[] = [
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
    ports: inlinePorts(),
    shapes: [stroke(smallCircle(32, 32, 15))],
  }),
  schematicSymbol({
    id: "schematic.meter-indicating",
    category: "instrument",
    keywords: ["mätinstrument indikering", "meter indicating", "mätare", "g"],
    tagPrefix: "G",
    ports: inlinePorts(),
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
];

import type { SymbolDefinition, SymbolPort } from "../types";
import { roundedRectPathData } from "../../symbolPaths";
import {
  ductPorts,
  fill,
  joinPaths,
  linePath,
  pathNumber,
  polyPath,
  rectPath,
  schematicSymbol,
  sensorFunnel,
  smallCircle,
  stroke,
} from "./primitives";

/**
 * The first ten ventilation symbols were reviewed in issue #93 and are kept
 * unchanged. They stay in their own batch so later library additions cannot
 * silently alter the reviewed artwork or its order.
 */

const VENTILATION_PORTS = (): SymbolPort[] => ductPorts(32);

/** Four water-side connection blocks on a tall heating/cooling coil. */
const BATTERY_PORTS = (): SymbolPort[] => [
  { id: "in", x: 19, y: 16.5, direction: "in" },
  { id: "out", x: 45, y: 16.5, direction: "out" },
  { id: "in2", x: 19, y: 47.5, direction: "in" },
  { id: "out2", x: 45, y: 47.5, direction: "out" },
];

function batteryShapes(plus: boolean): string {
  return joinPaths(
    roundedRectPathData(20, 6, 24, 52, 2),
    smallCircle(32, 32, 12),
    linePath(20, 32, 44, 32),
    ...(plus ? [linePath(32, 20, 32, 44)] : []),
  );
}

/** Number of zigzag folds per media path in the heat-exchanger symbol. */
const HEAT_EXCHANGER_FOLDS = 5;

/**
 * One counter-flow media path for the heat exchanger. The path enters at
 * `startX`, zigzags between `outerX` and `innerX` and leaves on the same side.
 */
function heatExchangerMedia(startX: number, outerX: number, innerX: number): string {
  const top = 16;
  const bottom = 48;
  const step = (bottom - top) / HEAT_EXCHANGER_FOLDS;
  const parts = [`M ${pathNumber(startX)} ${pathNumber(top)} H ${pathNumber(innerX)}`];
  for (let fold = 1; fold <= HEAT_EXCHANGER_FOLDS; fold += 1) {
    const x = fold % 2 === 1 ? outerX : innerX;
    parts.push(`L ${pathNumber(x)} ${pathNumber(top + step * fold)}`);
  }
  parts.push(`H ${pathNumber(startX)}`);
  return parts.join(" ");
}

export const FIRST_VENTILATION_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.fan",
    category: "ventilation",
    keywords: ["fläkt", "fan", "ventilation", "fläktaggregat", "ff"],
    tagPrefix: "FF",
    ports: [
      { id: "in", x: 15, y: 32, direction: "in" },
      { id: "out", x: 49, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(smallCircle(32, 32, 17)),
      stroke(polyPath([24, 19, 42, 32, 24, 45], true)),
      stroke(linePath(24, 19, 24, 45)),
    ],
  }),
  schematicSymbol({
    id: "schematic.filter",
    category: "ventilation",
    keywords: ["filter", "luftfilter", "filtrering", "ventilation", "f"],
    tagPrefix: "F",
    // Portrait body with a vertical zigzag element. The medium enters on the
    // left wall and leaves on the right wall, so the flow crosses the filter.
    ports: [
      { id: "in", x: 14, y: 32, direction: "in" },
      { id: "out", x: 50, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(rectPath(14, 10, 36, 44)),
      stroke(
        joinPaths(
          linePath(18, 10, 50, 21),
          linePath(50, 21, 14, 32),
          linePath(14, 32, 50, 43),
          linePath(50, 43, 18, 54),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.heating-coil",
    category: "heating",
    keywords: ["värmebatteri", "heating coil", "värme", "batteri", "eftervärmare", "vb"],
    tagPrefix: "VB",
    ports: BATTERY_PORTS(),
    shapes: [stroke(batteryShapes(true))],
  }),
  schematicSymbol({
    id: "schematic.cooling-coil",
    category: "cooling",
    keywords: ["kylbatteri", "cooling coil", "kyla", "batteri", "kylare", "kb"],
    tagPrefix: "KB",
    ports: BATTERY_PORTS(),
    shapes: [stroke(batteryShapes(false))],
  }),
  schematicSymbol({
    id: "schematic.heat-exchanger",
    category: "exchanger",
    keywords: [
      "värmeväxlare",
      "heat exchanger",
      "växlare",
      "vatten",
      "vattenväxlare",
      "återvinning",
      "vvx",
    ],
    tagPrefix: "VVX",
    // A water-to-water exchanger: two counter-flow media drawn as a close
    // parallel zigzag through the shell, so the plates read as one double line.
    // The pipe connections are left to the user; the ports are snap anchors on
    // the shell edges.
    ports: [
      { id: "primaryIn", x: 18, y: 16, direction: "in" },
      { id: "primaryOut", x: 18, y: 48, direction: "out" },
      { id: "secondaryIn", x: 46, y: 16, direction: "in" },
      { id: "secondaryOut", x: 46, y: 48, direction: "out" },
    ],
    shapes: [
      stroke(rectPath(18, 8, 28, 48)),
      stroke(heatExchangerMedia(18, 35, 23)),
      stroke(heatExchangerMedia(46, 40, 28)),
    ],
  }),
  schematicSymbol({
    id: "schematic.damper",
    category: "ventilation",
    keywords: ["spjäll", "damper", "reglerspjäll", "avstängning", "sp"],
    tagPrefix: "SP",
    ports: VENTILATION_PORTS(),
    shapes: [
      stroke(rectPath(14, 14, 36, 36)),
      stroke(linePath(32, 20, 32, 44)),
      fill(smallCircle(32, 32, 2.6)),
    ],
  }),
  schematicSymbol({
    id: "schematic.silencer",
    category: "ventilation",
    keywords: ["ljuddämpare", "silencer", "ljud", "dämpare", "ventilation", "ld"],
    tagPrefix: "LD",
    ports: VENTILATION_PORTS(),
    shapes: [
      stroke(rectPath(14, 14, 36, 36)),
      stroke(
        joinPaths(linePath(24, 20, 24, 44), linePath(32, 20, 32, 44), linePath(40, 20, 40, 44)),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.supply-diffuser",
    category: "ventilation",
    keywords: ["tilluftsdon", "supply air diffuser", "tilluft", "don", "diffuser", "td"],
    tagPrefix: "TD",
    ports: [
      { id: "duct", x: 32, y: 4, direction: "in" },
      { id: "room", x: 32, y: 60, direction: "out" },
    ],
    defaultSize: 36,
    shapes: [
      stroke(rectPath(12, 12, 40, 40)),
      stroke(rectPath(19, 19, 26, 26)),
      stroke(
        joinPaths(
          "M 24 28 L 32 36 L 40 28",
          "M 24 36 L 32 44 L 40 36",
          linePath(32, 4, 32, 12),
          linePath(32, 52, 32, 60),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.extract-diffuser",
    category: "ventilation",
    keywords: ["frånluftsdon", "extract air diffuser", "frånluft", "don", "diffuser", "fd"],
    tagPrefix: "FD",
    ports: [
      { id: "room", x: 32, y: 60, direction: "in" },
      { id: "duct", x: 32, y: 4, direction: "out" },
    ],
    defaultSize: 36,
    shapes: [
      stroke(rectPath(12, 12, 40, 40)),
      stroke(rectPath(19, 19, 26, 26)),
      stroke(
        joinPaths(
          "M 24 36 L 32 28 L 40 36",
          "M 24 44 L 32 36 L 40 44",
          linePath(32, 4, 32, 12),
          linePath(32, 52, 32, 60),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.duct-sensor",
    category: "instrument",
    keywords: ["kanalgivare", "duct sensor", "givare", "temperatur", "kanal", "gt"],
    tagPrefix: "GT",
    ports: [
      { id: "in", x: 4, y: 50, direction: "in" },
      { id: "out", x: 60, y: 50, direction: "out" },
    ],
    shapes: [stroke(linePath(4, 50, 60, 50)), stroke(sensorFunnel(50))],
  }),
];

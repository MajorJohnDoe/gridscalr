import { translate, type MessageKey } from "../../../i18n";
import type { SymbolArtShape, SymbolDefinition, SymbolPort } from "../../../model/symbols";
import { SCHEMATIC_SYMBOL_SIZE } from "../../../model/symbols";
import { circlePathData, roundedRectPathData } from "../../../model/symbolPaths";
import type { SchematicSymbolCategory } from "../../../model/types";

/**
 * Original stroke-only artwork for the schematic equipment set. Every path is
 * authored in the shared 64-unit view box. The catalogue, canvas and PDF export
 * all read these definitions, so the artwork can never drift between them.
 *
 * These are generic interpretations, not reproductions of a published standard.
 */

const n = (value: number): string => String(Number(value.toFixed(4)));

/** A straight line segment. */
export function linePath(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${n(x1)} ${n(y1)} L ${n(x2)} ${n(y2)}`;
}

/** A rectangle outlined as a closed path. */
export function rectPath(x: number, y: number, width: number, height: number): string {
  return `M ${n(x)} ${n(y)} H ${n(x + width)} V ${n(y + height)} H ${n(x)} Z`;
}

/** A polygon from alternating x/y values, optionally closed. */
export function polyPath(values: number[], closed = false): string {
  if (values.length < 4 || values.length % 2 !== 0) return "";
  const parts = [`M ${n(values[0])} ${n(values[1])}`];
  for (let index = 2; index < values.length; index += 2) {
    parts.push(`L ${n(values[index])} ${n(values[index + 1])}`);
  }
  if (closed) parts.push("Z");
  return parts.join(" ");
}

/** Several path fragments joined into one shape. */
export function joinPaths(...paths: string[]): string {
  return paths.filter(Boolean).join(" ");
}

export const stroke = (d: string): SymbolArtShape => ({ d, stroke: true });
export const fill = (d: string): SymbolArtShape => ({ d });

/** A duct casing with open ends at the left and right page edges. */
export function ductCasing(y = 22, height = 20): string {
  return rectPath(2, y, 60, height);
}

/** Ports on the left and right duct edges. */
export function ductPorts(y = 32): SymbolPort[] {
  return [
    { id: "in", x: 2, y, direction: "in" },
    { id: "out", x: 62, y, direction: "out" },
  ];
}

/** Inline ports on the visible valve body edges, without connection stubs. */
export function valvePorts(): SymbolPort[] {
  return [
    { id: "in", x: 18, y: 32, direction: "in" },
    { id: "out", x: 46, y: 32, direction: "out" },
  ];
}

interface SchematicDefinitionInput {
  id: string;
  category: SchematicSymbolCategory;
  keywords: string[];
  tagPrefix: string;
  ports: SymbolPort[];
  shapes: SymbolArtShape[];
  defaultSize?: number;
}

/**
 * Registers one schematic symbol. The localized name is read from the message
 * catalog under `symbol.<id>`, with an explicit English fallback while the
 * catalogue is generated outside the app.
 */
export function schematicSymbol(input: SchematicDefinitionInput): SymbolDefinition {
  return {
    id: input.id,
    name: translate("en", `symbol.${input.id}` as MessageKey),
    category: input.category,
    keywords: input.keywords,
    art: { shapes: input.shapes },
    set: "schematic",
    style: "schematic",
    ports: input.ports,
    tagPrefix: input.tagPrefix,
    defaultSize: input.defaultSize ?? SCHEMATIC_SYMBOL_SIZE,
  };
}

/** A small open circle used by sensors and actuators. */
export function smallCircle(cx: number, cy: number, radius: number): string {
  return circlePathData(cx, cy, radius);
}

/**
 * The closed funnel shared by the sensor symbols: an arc mouth, two sides that
 * meet at the stem and a stem down to `stemEnd`. Process connection lines are
 * deliberately not part of the artwork; they are drawn by the user.
 */
export function sensorFunnel(stemEnd = 54): string {
  return `M 18 16 Q 32 8 46 16 L 32 34 Z M 32 34 L 32 ${n(stemEnd)}`;
}

/** Number of zigzag folds per media path in the heat-exchanger symbol. */
const HEAT_EXCHANGER_FOLDS = 7;

/**
 * One counter-flow media path for the heat exchanger. The path enters at
 * `startX`, zigzags between `outerX` and `innerX` and leaves on the same side.
 */
function heatExchangerMedia(startX: number, outerX: number, innerX: number): string {
  const top = 16;
  const bottom = 48;
  const step = (bottom - top) / HEAT_EXCHANGER_FOLDS;
  const parts = [`M ${n(startX)} ${n(top)} H ${n(innerX)}`];
  for (let fold = 1; fold <= HEAT_EXCHANGER_FOLDS; fold += 1) {
    const x = fold % 2 === 1 ? outerX : innerX;
    parts.push(`L ${n(x)} ${n(top + step * fold)}`);
  }
  parts.push(`H ${n(startX)}`);
  return parts.join(" ");
}

/** A coil or battery drawn inside a duct casing. */
export function coilPath(yTop: number, yBottom: number, left = 10, right = 54): string {
  const step = (right - left) / 4;
  return joinPaths(
    `M ${n(left)} ${n(yTop)} H ${n(right)}`,
    `M ${n(left)} ${n((yTop + yBottom) / 2)} H ${n(right)}`,
    `M ${n(left)} ${n(yBottom)} H ${n(right)}`,
    `M ${n(left + step)} ${n(yTop)} V ${n(yBottom)}`,
    `M ${n(left + step * 2)} ${n(yTop)} V ${n(yBottom)}`,
    `M ${n(left + step * 3)} ${n(yTop)} V ${n(yBottom)}`,
  );
}

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
    // A water-to-water exchanger: two counter-flow media drawn as mirrored
    // zigzags inside a rectangular shell. The pipe connections are left to the
    // user; the ports are snap anchors on the shell edges.
    ports: [
      { id: "primaryIn", x: 18, y: 16, direction: "in" },
      { id: "primaryOut", x: 18, y: 48, direction: "out" },
      { id: "secondaryIn", x: 46, y: 16, direction: "in" },
      { id: "secondaryOut", x: 46, y: 48, direction: "out" },
    ],
    shapes: [
      stroke(rectPath(18, 8, 28, 48)),
      stroke(heatExchangerMedia(18, 20, 31)),
      stroke(heatExchangerMedia(46, 44, 33)),
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

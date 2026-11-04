import { translate, type MessageKey } from "../../../i18n";
import type { SymbolArtShape, SymbolDefinition, SymbolPort } from "../../../model/symbols";
import { SCHEMATIC_SYMBOL_SIZE } from "../../../model/symbols";
import { circlePathData } from "../../../model/symbolPaths";
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

export const FIRST_VENTILATION_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.fan",
    category: "ventilation",
    keywords: ["fläkt", "fan", "ventilation", "fläktaggregat", "ff"],
    tagPrefix: "FF",
    ports: VENTILATION_PORTS(),
    shapes: [
      stroke(ductCasing(22, 20)),
      stroke(smallCircle(32, 32, 12)),
      stroke(joinPaths(linePath(32, 20, 32, 32), linePath(32, 32, 44, 32))),
      stroke(joinPaths(linePath(32, 32, 26, 22), linePath(32, 32, 24, 43))),
    ],
  }),
  schematicSymbol({
    id: "schematic.filter",
    category: "ventilation",
    keywords: ["filter", "luftfilter", "filtrering", "ventilation", "f"],
    tagPrefix: "F",
    ports: VENTILATION_PORTS(),
    shapes: [
      stroke(ductCasing(22, 20)),
      stroke(
        joinPaths(
          "M 6 22 L 14 42 M 14 22 L 22 42 M 22 22 L 30 42 M 30 22 L 38 42 M 38 22 L 46 42 M 46 22 L 54 42 M 54 22 L 60 38",
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.heating-coil",
    category: "heating",
    keywords: ["värmebatteri", "heating coil", "värme", "batteri", "eftervärmare", "vb"],
    tagPrefix: "VB",
    ports: VENTILATION_PORTS(),
    shapes: [stroke(ductCasing(18, 28)), stroke(coilPath(23, 41, 9, 55))],
  }),
  schematicSymbol({
    id: "schematic.cooling-coil",
    category: "cooling",
    keywords: ["kylbatteri", "cooling coil", "kyla", "batteri", "kylare", "kb"],
    tagPrefix: "KB",
    ports: VENTILATION_PORTS(),
    shapes: [
      stroke(ductCasing(18, 28)),
      stroke(
        joinPaths(
          "M 10 23 V 41 M 17 23 V 41 M 24 23 V 41 M 31 23 V 41 M 38 23 V 41 M 45 23 V 41 M 52 23 V 41",
          linePath(8, 41, 56, 23),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.heat-exchanger",
    category: "exchanger",
    keywords: ["värmeväxlare", "heat exchanger", "växlare", "återvinning", "vvx"],
    tagPrefix: "VVX",
    ports: VENTILATION_PORTS(),
    shapes: [
      stroke(rectPath(4, 16, 56, 32)),
      stroke("M 4 16 L 60 48"),
      stroke(joinPaths("M 10 22 H 24 V 34 H 38 V 26", "M 54 42 H 40 V 30 H 26 V 38")),
    ],
  }),
  schematicSymbol({
    id: "schematic.damper",
    category: "ventilation",
    keywords: ["spjäll", "damper", "reglerspjäll", "avstängning", "sp"],
    tagPrefix: "SP",
    ports: VENTILATION_PORTS(),
    shapes: [
      stroke(ductCasing(22, 20)),
      stroke(linePath(8, 42, 56, 22)),
      stroke(joinPaths(linePath(32, 22, 32, 12), smallCircle(32, 9, 3.4))),
    ],
  }),
  schematicSymbol({
    id: "schematic.silencer",
    category: "ventilation",
    keywords: ["ljuddämpare", "silencer", "ljud", "dämpare", "ventilation", "ld"],
    tagPrefix: "LD",
    ports: VENTILATION_PORTS(),
    shapes: [
      stroke(ductCasing(18, 28)),
      stroke(joinPaths(rectPath(11, 24, 6, 16), rectPath(29, 24, 6, 16), rectPath(47, 24, 6, 16))),
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
    ports: VENTILATION_PORTS(),
    shapes: [
      stroke(ductCasing(22, 20)),
      stroke(joinPaths(linePath(32, 42, 32, 52), smallCircle(32, 55, 4.2))),
      stroke(joinPaths(linePath(26, 55, 38, 55))),
    ],
  }),
];

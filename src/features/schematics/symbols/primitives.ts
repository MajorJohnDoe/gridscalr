import { translate, type MessageKey } from "../../../i18n";
import type { SymbolArtShape, SymbolDefinition, SymbolPort } from "../../../model/symbols";
import { SCHEMATIC_SYMBOL_SIZE } from "../../../model/symbols";
import { circlePathData } from "../../../model/symbolPaths";
import type { SchematicSymbolCategory } from "../../../model/types";

/**
 * Shared drawing primitives for the stroke-only schematic set. Every path is
 * authored in the shared 64-unit view box. The catalogue, canvas and PDF export
 * all read the symbol definitions, so the artwork can never drift between them.
 *
 * This module must not define symbols; it only provides geometry, shape builders,
 * ports and the catalogue entry helper used by the symbol batches.
 */

export const pathNumber = (value: number): string => String(Number(value.toFixed(4)));

/** A straight line segment. */
export function linePath(x1: number, y1: number, x2: number, y2: number): string {
  return `M ${pathNumber(x1)} ${pathNumber(y1)} L ${pathNumber(x2)} ${pathNumber(y2)}`;
}

/** A rectangle outlined as a closed path. */
export function rectPath(x: number, y: number, width: number, height: number): string {
  return `M ${pathNumber(x)} ${pathNumber(y)} H ${pathNumber(x + width)} V ${pathNumber(y + height)} H ${pathNumber(x)} Z`;
}

/** A polygon from alternating x/y values, optionally closed. */
export function polyPath(values: number[], closed = false): string {
  if (values.length < 4 || values.length % 2 !== 0) return "";
  const parts = [`M ${pathNumber(values[0])} ${pathNumber(values[1])}`];
  for (let index = 2; index < values.length; index += 2) {
    parts.push(`L ${pathNumber(values[index])} ${pathNumber(values[index + 1])}`);
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

/** Inline ports on the left and right symbol edges, without connection stubs. */
export function inlinePorts(y = 32): SymbolPort[] {
  return [
    { id: "in", x: 2, y, direction: "in" },
    { id: "out", x: 62, y, direction: "out" },
  ];
}

/** The twin-triangle body shared by the schematic valve symbols. */
export function valveBody(): string {
  return joinPaths(
    polyPath([18, 22, 32, 32, 18, 42], true),
    polyPath([46, 22, 32, 32, 46, 42], true),
  );
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
  fixedStrokeWidth?: number;
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
    fixedStrokeWidth: input.fixedStrokeWidth,
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
  return `M 18 16 Q 32 8 46 16 L 32 34 Z M 32 34 L 32 ${pathNumber(stemEnd)}`;
}

/** A coil or battery drawn inside a duct casing. */
export function coilPath(yTop: number, yBottom: number, left = 10, right = 54): string {
  const step = (right - left) / 4;
  return joinPaths(
    `M ${pathNumber(left)} ${pathNumber(yTop)} H ${pathNumber(right)}`,
    `M ${pathNumber(left)} ${pathNumber((yTop + yBottom) / 2)} H ${pathNumber(right)}`,
    `M ${pathNumber(left)} ${pathNumber(yBottom)} H ${pathNumber(right)}`,
    `M ${pathNumber(left + step)} ${pathNumber(yTop)} V ${pathNumber(yBottom)}`,
    `M ${pathNumber(left + step * 2)} ${pathNumber(yTop)} V ${pathNumber(yBottom)}`,
    `M ${pathNumber(left + step * 3)} ${pathNumber(yTop)} V ${pathNumber(yBottom)}`,
  );
}

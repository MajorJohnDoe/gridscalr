import type { Point } from "./types";

/**
 * A small, dependency-free subset of the SVG path grammar used by the built-in
 * facility symbols. Keeping the same parsed commands for canvas, the symbol
 * library and the PDF export guarantees that a symbol looks identical on screen
 * and in print.
 *
 * Supported commands: M/m, L/l, H/h, V/v, C/c, S/s, Q/q, T/t and Z/z. Arcs are
 * intentionally unsupported; the symbol artwork uses cubic and quadratic curves
 * for circles and rounded corners so every renderer gets the same geometry.
 */
export type SymbolCommand =
  | { type: "M"; x: number; y: number }
  | { type: "L"; x: number; y: number }
  | { type: "C"; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: "Z" };

const TOKEN = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const COMMANDS = new Set(["M", "L", "H", "V", "C", "S", "Q", "T", "Z"]);

function isCommand(token: string | undefined): token is string {
  return Boolean(token && /^[a-zA-Z]$/.test(token));
}

export function parseSymbolPath(data: string): SymbolCommand[] {
  const tokens = data.match(TOKEN) ?? [];
  const commands: SymbolCommand[] = [];
  let index = 0;
  let command = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastCubicControl: Point | null = null;
  let lastQuadControl: Point | null = null;

  const number = (): number => {
    const token = tokens[index];
    if (token === undefined || isCommand(token)) {
      throw new Error(`Expected a number in symbol path near "${command}"`);
    }
    index += 1;
    return Number(token);
  };

  const point = (relative: boolean): Point => ({
    x: number() + (relative ? x : 0),
    y: number() + (relative ? y : 0),
  });

  const quadraticToCubic = (
    from: Point,
    control: Point,
    to: Point,
  ): { x1: number; y1: number; x2: number; y2: number; x: number; y: number } => ({
    x1: from.x + (2 / 3) * (control.x - from.x),
    y1: from.y + (2 / 3) * (control.y - from.y),
    x2: to.x + (2 / 3) * (control.x - to.x),
    y2: to.y + (2 / 3) * (control.y - to.y),
    x: to.x,
    y: to.y,
  });

  while (index < tokens.length) {
    const next = tokens[index];
    if (isCommand(next)) {
      command = next;
      index += 1;
    } else if (!command) {
      throw new Error("Symbol path must start with a command");
    }

    const upper = command.toUpperCase();
    const relative = command !== upper;
    if (!COMMANDS.has(upper)) {
      throw new Error(`Unsupported symbol path command "${command}"`);
    }

    if (upper === "Z") {
      commands.push({ type: "Z" });
      x = startX;
      y = startY;
      lastCubicControl = null;
      lastQuadControl = null;
      command = "";
      continue;
    }

    const hadNumber = index < tokens.length && !isCommand(tokens[index]);
    if (!hadNumber) {
      throw new Error(`Command "${command}" is missing coordinates`);
    }

    switch (upper) {
      case "M": {
        let first = true;
        while (index < tokens.length && !isCommand(tokens[index])) {
          const nextPoint = point(relative && !first ? true : relative);
          x = nextPoint.x;
          y = nextPoint.y;
          if (first) {
            commands.push({ type: "M", x, y });
            startX = x;
            startY = y;
            first = false;
          } else {
            commands.push({ type: "L", x, y });
          }
          lastCubicControl = null;
          lastQuadControl = null;
        }
        // Additional pairs after a move are implicit line-to commands.
        command = relative ? "l" : "L";
        break;
      }
      case "L": {
        while (index < tokens.length && !isCommand(tokens[index])) {
          const nextPoint = point(relative);
          x = nextPoint.x;
          y = nextPoint.y;
          commands.push({ type: "L", x, y });
          lastCubicControl = null;
          lastQuadControl = null;
        }
        break;
      }
      case "H": {
        while (index < tokens.length && !isCommand(tokens[index])) {
          x = number() + (relative ? x : 0);
          commands.push({ type: "L", x, y });
          lastCubicControl = null;
          lastQuadControl = null;
        }
        break;
      }
      case "V": {
        while (index < tokens.length && !isCommand(tokens[index])) {
          y = number() + (relative ? y : 0);
          commands.push({ type: "L", x, y });
          lastCubicControl = null;
          lastQuadControl = null;
        }
        break;
      }
      case "C": {
        while (index < tokens.length && !isCommand(tokens[index])) {
          const control1 = point(relative);
          const control2 = point(relative);
          const end = point(relative);
          commands.push({
            type: "C",
            x1: control1.x,
            y1: control1.y,
            x2: control2.x,
            y2: control2.y,
            x: end.x,
            y: end.y,
          });
          x = end.x;
          y = end.y;
          lastCubicControl = control2;
          lastQuadControl = null;
        }
        break;
      }
      case "S": {
        while (index < tokens.length && !isCommand(tokens[index])) {
          const control1 = lastCubicControl
            ? { x: 2 * x - lastCubicControl.x, y: 2 * y - lastCubicControl.y }
            : { x, y };
          const control2 = point(relative);
          const end = point(relative);
          commands.push({
            type: "C",
            x1: control1.x,
            y1: control1.y,
            x2: control2.x,
            y2: control2.y,
            x: end.x,
            y: end.y,
          });
          x = end.x;
          y = end.y;
          lastCubicControl = control2;
          lastQuadControl = null;
        }
        break;
      }
      case "Q": {
        while (index < tokens.length && !isCommand(tokens[index])) {
          const control = point(relative);
          const end = point(relative);
          const cubic = quadraticToCubic({ x, y }, control, end);
          commands.push({ type: "C", ...cubic });
          x = end.x;
          y = end.y;
          lastQuadControl = control;
          lastCubicControl = null;
        }
        break;
      }
      case "T": {
        while (index < tokens.length && !isCommand(tokens[index])) {
          const control: Point = lastQuadControl
            ? { x: 2 * x - lastQuadControl.x, y: 2 * y - lastQuadControl.y }
            : { x, y };
          const end = point(relative);
          const cubic = quadraticToCubic({ x, y }, control, end);
          commands.push({ type: "C", ...cubic });
          x = end.x;
          y = end.y;
          lastQuadControl = control;
          lastCubicControl = null;
        }
        break;
      }
    }
  }

  return commands;
}

export interface SymbolCommandBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bounding box of all path points, including Bézier control points. */
export function symbolCommandBounds(commands: SymbolCommand[]): SymbolCommandBounds {
  const bounds: SymbolCommandBounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  const include = (x: number, y: number) => {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  };
  for (const command of commands) {
    switch (command.type) {
      case "M":
      case "L":
        include(command.x, command.y);
        break;
      case "C":
        include(command.x1, command.y1);
        include(command.x2, command.y2);
        include(command.x, command.y);
        break;
      case "Z":
        break;
    }
  }
  return bounds;
}

export function transformSymbolCommands(
  commands: SymbolCommand[],
  transform: (point: Point) => Point,
): SymbolCommand[] {
  return commands.map((command) => {
    switch (command.type) {
      case "M": {
        const point = transform({ x: command.x, y: command.y });
        return { type: "M", x: point.x, y: point.y };
      }
      case "L": {
        const point = transform({ x: command.x, y: command.y });
        return { type: "L", x: point.x, y: point.y };
      }
      case "C": {
        const control1 = transform({ x: command.x1, y: command.y1 });
        const control2 = transform({ x: command.x2, y: command.y2 });
        const end = transform({ x: command.x, y: command.y });
        return {
          type: "C",
          x1: control1.x,
          y1: control1.y,
          x2: control2.x,
          y2: control2.y,
          x: end.x,
          y: end.y,
        };
      }
      case "Z":
        return command;
    }
  });
}

function format(value: number): string {
  return String(Number(value.toFixed(4)));
}

/** Serialize parsed commands back to compact SVG path data. */
export function serializeSymbolPath(commands: SymbolCommand[]): string {
  const parts: string[] = [];
  for (const command of commands) {
    switch (command.type) {
      case "M":
        parts.push(`M ${format(command.x)} ${format(command.y)}`);
        break;
      case "L":
        parts.push(`L ${format(command.x)} ${format(command.y)}`);
        break;
      case "C":
        parts.push(
          `C ${format(command.x1)} ${format(command.y1)} ${format(command.x2)} ${format(command.y2)} ${format(command.x)} ${format(command.y)}`,
        );
        break;
      case "Z":
        parts.push("Z");
        break;
    }
  }
  return parts.join(" ");
}

/** A full circle as four cubic segments, centered on (cx, cy). */
export function circlePathData(cx: number, cy: number, radius: number): string {
  const k = radius * 0.5522847498307936;
  return [
    `M ${format(cx)} ${format(cy - radius)}`,
    `C ${format(cx + k)} ${format(cy - radius)} ${format(cx + radius)} ${format(cy - k)} ${format(cx + radius)} ${format(cy)}`,
    `C ${format(cx + radius)} ${format(cy + k)} ${format(cx + k)} ${format(cy + radius)} ${format(cx)} ${format(cy + radius)}`,
    `C ${format(cx - k)} ${format(cy + radius)} ${format(cx - radius)} ${format(cy + k)} ${format(cx - radius)} ${format(cy)}`,
    `C ${format(cx - radius)} ${format(cy - k)} ${format(cx - k)} ${format(cy - radius)} ${format(cx)} ${format(cy - radius)}`,
    "Z",
  ].join(" ");
}

/** A rounded rectangle using quadratic corners. */
export function roundedRectPathData(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  const right = x + width;
  const bottom = y + height;
  return [
    `M ${format(x + r)} ${format(y)}`,
    `H ${format(right - r)}`,
    `Q ${format(right)} ${format(y)} ${format(right)} ${format(y + r)}`,
    `V ${format(bottom - r)}`,
    `Q ${format(right)} ${format(bottom)} ${format(right - r)} ${format(bottom)}`,
    `H ${format(x + r)}`,
    `Q ${format(x)} ${format(bottom)} ${format(x)} ${format(bottom - r)}`,
    `V ${format(y + r)}`,
    `Q ${format(x)} ${format(y)} ${format(x + r)} ${format(y)}`,
    "Z",
  ].join(" ");
}

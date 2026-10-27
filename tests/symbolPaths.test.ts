import { describe, expect, it } from "vitest";
import {
  parseSymbolPath,
  serializeSymbolPath,
  transformSymbolCommands,
} from "../src/model/symbolPaths";

describe("symbol path geometry", () => {
  it("parses absolute and relative lines into one command stream", () => {
    expect(parseSymbolPath("M 10 10 h 5 v 5 z")).toEqual([
      { type: "M", x: 10, y: 10 },
      { type: "L", x: 15, y: 10 },
      { type: "L", x: 15, y: 15 },
      { type: "Z" },
    ]);
    expect(parseSymbolPath("m 10 10 5 0 0 5 z")).toEqual([
      { type: "M", x: 10, y: 10 },
      { type: "L", x: 15, y: 10 },
      { type: "L", x: 15, y: 15 },
      { type: "Z" },
    ]);
  });

  it("expands smooth cubic and quadratic commands", () => {
    const cubic = parseSymbolPath("M 0 0 C 1 1 2 2 3 3 S 4 4 5 5");
    expect(cubic[2]).toEqual({
      type: "C",
      x1: 4,
      y1: 4,
      x2: 4,
      y2: 4,
      x: 5,
      y: 5,
    });
    const quadratic = parseSymbolPath("M 0 0 Q 2 4 4 0 T 8 0");
    expect(quadratic).toHaveLength(3);
    expect(quadratic[1]).toMatchObject({ type: "C", x: 4, y: 0 });
    expect(quadratic[2]).toMatchObject({ type: "C", x: 8, y: 0 });
  });

  it("transforms every control point and round-trips through SVG data", () => {
    const commands = parseSymbolPath("M 10 10 C 12 10 14 12 14 14 Z");
    const rotated = transformSymbolCommands(commands, (point) => ({
      x: 32 + (point.x - 32) * -1,
      y: 32 + (point.y - 32) * -1,
    }));
    expect(rotated[0]).toMatchObject({ type: "M", x: 54, y: 54 });
    expect(serializeSymbolPath(rotated)).toContain("C 52 54 50 52 50 50");
    expect(parseSymbolPath(serializeSymbolPath(rotated))).toEqual(rotated);
  });

  it("rejects unsupported arc commands instead of guessing", () => {
    expect(() => parseSymbolPath("M 0 0 A 1 1 0 0 0 2 2")).toThrow(/Unsupported/);
    expect(() => parseSymbolPath("M 0 0 L")).toThrow(/missing coordinates/);
  });
});

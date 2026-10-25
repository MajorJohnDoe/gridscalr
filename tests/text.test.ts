import { describe, expect, it } from "vitest";
import { clampTextSize, TEXT_UNDERLINE_OFFSET, textItemLayout, textLineX } from "../src/model/text";

describe("text layout", () => {
  it("keeps single-line text at its measured width", () => {
    const layout = textItemLayout({ text: "Hello", fontSize: 12 }, () => 30);
    expect(layout.width).toBe(30);
    expect(layout.height).toBeCloseTo(12 * 1.28, 5);
    expect(layout.lines).toEqual(["Hello"]);
  });

  it("measures the widest line of a multi-line note", () => {
    const layout = textItemLayout({ text: "AB\nABCD", fontSize: 10 }, (text) => text.length * 6);
    expect(layout.width).toBe(24);
    expect(layout.lines).toEqual(["AB", "ABCD"]);
  });

  it("aligns lines inside the block width", () => {
    expect(textLineX("left", 10, 100, 40)).toBe(10);
    expect(textLineX("center", 10, 100, 40)).toBe(40);
    expect(textLineX("right", 10, 100, 40)).toBe(70);
    expect(textLineX(undefined, 10, 100, 40)).toBe(10);
  });

  it("does not push lines outside the block when they are wider than it", () => {
    expect(textLineX("center", 10, 20, 40)).toBe(10);
    expect(textLineX("right", 10, 20, 40)).toBe(10);
  });

  it("uses a small underline offset below the baseline", () => {
    expect(TEXT_UNDERLINE_OFFSET).toBeGreaterThan(0);
    expect(TEXT_UNDERLINE_OFFSET).toBeLessThan(0.3);
  });

  it("clamps text sizes to the supported range", () => {
    expect(clampTextSize(Number.NaN)).toBe(12);
    expect(clampTextSize(0.01)).toBe(0.5);
    expect(clampTextSize(1000)).toBe(300);
  });
});

import { describe, expect, it } from "vitest";
import {
  labelBox,
  LABEL_EXPORT_SCALE,
  LABEL_PADDING_X,
  LABEL_PRIMARY_SIZE,
  LABEL_SECONDARY_SIZE,
} from "../src/model/label";

describe("measurement label geometry", () => {
  it("keeps the on-screen label box unchanged", () => {
    const box = labelBox({ x: 100, y: 100 }, 40, 80, "secondary");

    expect(box.width).toBe(80 + LABEL_PADDING_X * 2);
    expect(box.height).toBe(34);
    expect(box.primaryY).toBe(box.y + 11);
    expect(box.secondaryY).toBe(box.y + 24);
  });

  it("scales text, padding, and line spacing for PDF export", () => {
    const box = labelBox(
      { x: 100, y: 100 },
      40 * LABEL_EXPORT_SCALE,
      80 * LABEL_EXPORT_SCALE,
      "secondary",
      LABEL_EXPORT_SCALE,
    );

    expect(box.width).toBeCloseTo((80 + LABEL_PADDING_X * 2) * LABEL_EXPORT_SCALE);
    expect(box.height).toBeCloseTo(34 * LABEL_EXPORT_SCALE);
    expect(box.primaryY).toBeCloseTo(box.y + 11 * LABEL_EXPORT_SCALE);
    expect(box.secondaryY).toBeCloseTo(box.y + 24 * LABEL_EXPORT_SCALE);
    expect(LABEL_PRIMARY_SIZE * LABEL_EXPORT_SCALE).toBeLessThan(LABEL_PRIMARY_SIZE);
    expect(LABEL_SECONDARY_SIZE * LABEL_EXPORT_SCALE).toBeLessThan(LABEL_SECONDARY_SIZE);
  });

  it("scales single-line labels without a secondary row", () => {
    const box = labelBox(
      { x: 100, y: 100 },
      40 * LABEL_EXPORT_SCALE,
      0,
      undefined,
      LABEL_EXPORT_SCALE,
    );

    expect(box.height).toBeCloseTo(20 * LABEL_EXPORT_SCALE);
    expect(box.primaryY).toBeCloseTo(100 + 0.5 * LABEL_EXPORT_SCALE);
    expect(box.secondaryY).toBeUndefined();
  });
});

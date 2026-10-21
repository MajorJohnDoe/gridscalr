import { describe, expect, it } from "vitest";
import {
  labelBox,
  labelMetrics,
  LABEL_MIN_PRIMARY_SIZE,
  LABEL_PADDING_X,
  LABEL_PRIMARY_SIZE,
  LABEL_SECONDARY_SIZE,
} from "../src/model/label";

describe("measurement label geometry", () => {
  it("uses paper-space metrics for a two-line label", () => {
    const box = labelBox({ x: 100, y: 100 }, 40, 80, "secondary");
    const metrics = labelMetrics(1);

    expect(box.width).toBeCloseTo(80 + LABEL_PADDING_X * 2);
    expect(box.height).toBeCloseTo(
      metrics.paddingY * 2 + metrics.primaryLine + metrics.rowGap + metrics.secondaryLine,
    );
    expect(box.primaryCenterY).toBeCloseTo(
      box.y + metrics.paddingY + metrics.primaryLine / 2,
    );
    expect(box.secondaryCenterY).toBeCloseTo(
      box.primaryCenterY + metrics.primaryLine / 2 + metrics.rowGap + metrics.secondaryLine / 2,
    );
  });

  it("scales text, padding, and line spacing together", () => {
    const scale = 0.9;
    const box = labelBox(
      { x: 100, y: 100 },
      40 * scale,
      80 * scale,
      "secondary",
      scale,
    );
    const metrics = labelMetrics(scale);

    expect(box.width).toBeCloseTo((80 + LABEL_PADDING_X * 2) * scale);
    expect(box.height).toBeCloseTo(
      metrics.paddingY * 2 + metrics.primaryLine + metrics.rowGap + metrics.secondaryLine,
    );
    expect(metrics.primarySize).toBeCloseTo(LABEL_PRIMARY_SIZE * scale);
    expect(metrics.secondarySize).toBeCloseTo(LABEL_SECONDARY_SIZE * scale);
    expect(metrics.primarySize).toBeGreaterThanOrEqual(LABEL_MIN_PRIMARY_SIZE);
  });

  it("lays out a single-line label without reserving space for the second row", () => {
    const scale = 0.8;
    const box = labelBox({ x: 100, y: 100 }, 40 * scale, 0, undefined, scale);
    const metrics = labelMetrics(scale);

    expect(box.height).toBeCloseTo(metrics.paddingY * 2 + metrics.primaryLine);
    expect(box.secondaryCenterY).toBeUndefined();
  });
});

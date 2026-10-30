import { describe, expect, it } from "vitest";
import { cloudFillColor } from "../src/model/cloud";
import { draftColors, type Draft } from "../src/canvas/draftRenderer";

const point = { x: 0, y: 0 };

function draft(kind: Draft["kind"]): Draft {
  return { kind, points: [point], cursor: point } as Draft;
}

const input = {
  measureColor: "#f70808",
  calibrationColor: "#a78bfa",
  cloudFill: "none" as const,
  styleColor: "#f2a93b",
};

describe("draft preview colours", () => {
  it("uses the calibration colour while calibrating", () => {
    expect(draftColors(draft("calibrate"), input)).toEqual({
      stroke: "#a78bfa",
      fill: "#f70808",
    });
  });

  it("uses the target measurement layer colour for measurements", () => {
    expect(draftColors(draft("area"), input)).toEqual({
      stroke: "#f70808",
      fill: "#f70808",
    });
  });

  it("uses the cloud fill preset when one is set", () => {
    expect(
      draftColors(draft("cloud"), {
        ...input,
        cloudFill: "blue",
      }),
    ).toEqual({
      stroke: cloudFillColor("blue"),
      fill: "#f70808",
    });
  });

  it("falls back to the draw colour for an unfilled cloud", () => {
    expect(draftColors(draft("cloud"), input)).toEqual({
      stroke: "#f2a93b",
      fill: "#f70808",
    });
  });

  it("uses the draw colour for both stroke and fill of a highlight polygon", () => {
    expect(draftColors(draft("highlight-polygon"), input)).toEqual({
      stroke: "#f2a93b",
      fill: "#f2a93b",
    });
  });
});

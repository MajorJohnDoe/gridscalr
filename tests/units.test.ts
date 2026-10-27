import { describe, expect, it } from "vitest";
import {
  areaInUnit,
  areaUnitToSquareMeters,
  calibrationToScale,
  formatArea,
  formatCoordinate,
  displayedLengthUnit,
  formatLength,
  formatLengthCompact,
  formatNumber,
  formatScale,
  formatScaleRatio,
  lengthInUnit,
  unitLabel,
  unitToMeters,
} from "../src/model/units";
import type { Calibration } from "../src/model/types";

const calibration: Calibration = {
  id: "cal_test",
  p1: { x: 0, y: 0 },
  p2: { x: 1000, y: 0 },
  knownLength: 10,
  unit: "m",
  pointsPerMeter: 100,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("units", () => {
  it("converts real-world length and area units", () => {
    expect(unitToMeters("mm")).toBe(0.001);
    expect(unitToMeters("ft")).toBeCloseTo(0.3048);
    expect(areaUnitToSquareMeters("m2")).toBe(1);
    expect(areaUnitToSquareMeters("ft2")).toBeCloseTo(0.09290304);
    expect(areaUnitToSquareMeters("yd2")).toBeCloseTo(0.83612736);
  });

  it("converts points into project units using a scale", () => {
    expect(lengthInUnit(1000, 100, "m")).toBe(10);
    expect(lengthInUnit(1000, 100, "cm")).toBe(1000);
    expect(areaInUnit(10_000, 100, "m2")).toBe(1);
    expect(areaInUnit(10_000, 100, "ft2")).toBeCloseTo(10.7639, 4);
  });

  it("formats calibrated and uncalibrated values", () => {
    const scale = calibrationToScale(calibration);
    expect(formatLength(1000, scale, "m")).toBe("10 m");
    expect(formatLength(123, null, "m")).toBe("123 pt");
    expect(formatLengthCompact(1001, scale, "mm")).toBe("10,010 mm");
    expect(formatLengthCompact(1001, scale, "cm")).toBe("1,001 cm");
    expect(formatLengthCompact(1001, scale, "m")).toBe("10.01 m");
    expect(formatLengthCompact(123, null, "m")).toBe("123 pt");
    expect(formatArea(10_000, scale, "m2")).toBe("1 m²");
    expect(formatArea(10_000, scale, "yd2")).toBe("1.2 yd²");
    expect(formatArea(10_000, null, "m2")).toBe("10,000 pt²");
  });

  it("switches metric lengths to metres above one metre", () => {
    const scale = calibrationToScale(calibration);
    expect(displayedLengthUnit(1000, scale, "cm", true)).toBe("m");
    expect(displayedLengthUnit(50, scale, "cm", true)).toBe("cm");
    expect(displayedLengthUnit(1000, scale, "in", true)).toBe("in");
    expect(formatLength(1000, scale, "cm", true)).toBe("10 m");
    expect(formatLength(50, scale, "cm", true)).toBe("50 cm");
    expect(formatLength(42.55, scale, "cm", true)).toBe("42.6 cm");
    expect(formatLength(42.55, scale, "cm")).toBe("42.55 cm");
    expect(formatLength(100, scale, "mm", true)).toBe("1 m");
    expect(formatLengthCompact(1000, scale, "cm", true)).toBe("10 m");
    expect(formatLength(1000, scale, "in", true)).toBe("393.7 in");
  });

  it("formats scale and cursor coordinates", () => {
    const scale = calibrationToScale(calibration);
    expect(formatScale(scale)).toBe("1 pt = 10 mm");
    expect(formatScale(null)).toBe("Not calibrated");
    expect(formatCoordinate(500, scale, "m")).toBe("5");
    expect(formatCoordinate(500, null, "m")).toBe("500");
  });

  it("formats a compact 1:N ratio for the status bar", () => {
    expect(formatScaleRatio(201.5)).toBe("1:202");
    expect(formatScaleRatio(204)).toBe("1:204");
    expect(formatScaleRatio(0.5)).toBe("1:0.5");
    expect(formatScaleRatio(null)).toBe("Not calibrated");
    expect(formatScaleRatio(Number.NaN)).toBe("Not calibrated");
  });

  it("formats numbers compactly and labels area units", () => {
    expect(formatNumber(1234.567, 1)).toBe("1,234.6");
    expect(formatNumber(Number.NaN)).toBe("–");
    expect(unitLabel("m2")).toBe("m²");
    expect(unitLabel("yd2")).toBe("yd²");
  });
});

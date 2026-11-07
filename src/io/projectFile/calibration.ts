import { isValidManualRatio, makeId, manualPointsPerMeter } from "../../model/calibration";
import type { Calibration, LengthUnit } from "../../model/types";
import { LENGTH_UNITS, isPoint } from "./shared";

export function normalizeCalibration(value: unknown): Calibration | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const cal = value as Record<string, unknown>;
  const id = typeof cal.id === "string" && cal.id ? cal.id : makeId("cal");
  const createdAt = typeof cal.createdAt === "string" ? cal.createdAt : new Date().toISOString();

  if (cal.source === "manual") {
    const ratio = typeof cal.ratio === "number" ? cal.ratio : NaN;
    if (!isValidManualRatio(ratio)) return undefined;
    if (
      typeof cal.pointsPerMeter !== "number" ||
      !Number.isFinite(cal.pointsPerMeter) ||
      cal.pointsPerMeter <= 0
    ) {
      return undefined;
    }
    return {
      id,
      source: "manual",
      ratio,
      pointsPerMeter: manualPointsPerMeter(ratio),
      createdAt,
    };
  }

  if (!isPoint(cal.p1) || !isPoint(cal.p2)) return undefined;
  if (typeof cal.knownLength !== "number" || cal.knownLength <= 0) return undefined;
  if (
    typeof cal.pointsPerMeter !== "number" ||
    !Number.isFinite(cal.pointsPerMeter) ||
    cal.pointsPerMeter <= 0
  ) {
    return undefined;
  }
  return {
    id,
    source: "reference",
    p1: cal.p1,
    p2: cal.p2,
    knownLength: cal.knownLength,
    unit: LENGTH_UNITS.has(cal.unit as LengthUnit) ? (cal.unit as LengthUnit) : "mm",
    pointsPerMeter: cal.pointsPerMeter,
    createdAt,
  };
}

import type { AreaUnit, Calibration, LengthUnit, ScaleSnapshot } from "./types";

export const LENGTH_UNITS: ReadonlyArray<{
  id: LengthUnit;
  label: string;
  meters: number;
}> = [
  { id: "mm", label: "Millimetres (mm)", meters: 0.001 },
  { id: "cm", label: "Centimetres (cm)", meters: 0.01 },
  { id: "m", label: "Metres (m)", meters: 1 },
  { id: "in", label: "Inches (in)", meters: 0.0254 },
  { id: "ft", label: "Feet (ft)", meters: 0.3048 },
  { id: "yd", label: "Yards (yd)", meters: 0.9144 },
];

export const AREA_UNITS: ReadonlyArray<{
  id: AreaUnit;
  label: string;
  squareMeters: number;
}> = [
  { id: "mm2", label: "mm²", squareMeters: 0.001 * 0.001 },
  { id: "cm2", label: "cm²", squareMeters: 0.01 * 0.01 },
  { id: "m2", label: "m²", squareMeters: 1 },
  { id: "in2", label: "in²", squareMeters: 0.0254 * 0.0254 },
  { id: "ft2", label: "ft²", squareMeters: 0.3048 * 0.3048 },
];

export function unitToMeters(unit: LengthUnit): number {
  return LENGTH_UNITS.find((u) => u.id === unit)?.meters ?? 1;
}

export function areaUnitToSquareMeters(unit: AreaUnit): number {
  return AREA_UNITS.find((u) => u.id === unit)?.squareMeters ?? 1;
}

export function calibrationToScale(cal: Calibration): ScaleSnapshot {
  return {
    pointsPerMeter: cal.pointsPerMeter,
    sourceUnit: cal.unit,
  };
}

export function formatNumber(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return "–";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e9 || abs < 1e-4)) {
    return value.toExponential(2);
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  }).format(value);
}

export function lengthInUnit(points: number, ppm: number, unit: LengthUnit): number {
  return points / ppm / unitToMeters(unit);
}

export function areaInUnit(pointArea: number, ppm: number, unit: AreaUnit): number {
  return pointArea / (ppm * ppm) / areaUnitToSquareMeters(unit);
}

export function formatLength(
  points: number,
  scale: ScaleSnapshot | null | undefined,
  unit: LengthUnit,
): string {
  if (!scale) return `${formatNumber(points, 1)} pt`;
  return `${formatNumber(lengthInUnit(points, scale.pointsPerMeter, unit), 2)} ${unit}`;
}

export function formatArea(
  pointArea: number,
  scale: ScaleSnapshot | null | undefined,
  unit: AreaUnit,
): string {
  if (!scale) return `${formatNumber(pointArea, 1)} pt²`;
  return `${formatNumber(areaInUnit(pointArea, scale.pointsPerMeter, unit), 2)} ${unitLabel(unit)}`;
}

export function unitLabel(unit: AreaUnit): string {
  return AREA_UNITS.find((u) => u.id === unit)?.label ?? unit;
}

export function formatScale(scale: ScaleSnapshot | null | undefined): string {
  if (!scale) return "Not calibrated";
  const mmPerPoint = (1 / scale.pointsPerMeter) * 1000;
  return `1 pt = ${formatNumber(mmPerPoint, 3)} mm`;
}

export function formatCoordinate(value: number, scale: ScaleSnapshot | null, unit: LengthUnit): string {
  if (!scale) return `${formatNumber(value, 1)}`;
  return formatNumber(lengthInUnit(value, scale.pointsPerMeter, unit), 2);
}

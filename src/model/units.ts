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
  { id: "yd2", label: "yd²", squareMeters: 0.9144 * 0.9144 },
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
    sourceUnit: cal.source === "manual" ? "m" : cal.unit,
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

export function volumeUnitLabel(unit: AreaUnit): string {
  switch (unit) {
    case "mm2":
      return "mm³";
    case "cm2":
      return "cm³";
    case "in2":
      return "in³";
    case "ft2":
      return "ft³";
    case "yd2":
      return "yd³";
    default:
      return "m³";
  }
}

/** Volume in the area unit's matching cubic unit. Depth is in the project length unit. */
export function volumeInUnit(
  pointArea: number,
  ppm: number,
  areaUnit: AreaUnit,
  depth: number,
  depthUnit: LengthUnit,
): number {
  const area = areaInUnit(pointArea, ppm, areaUnit);
  const baseLengthMeters = Math.sqrt(areaUnitToSquareMeters(areaUnit));
  const depthInAreaUnit = (depth * unitToMeters(depthUnit)) / baseLengthMeters;
  return area * depthInAreaUnit;
}

function usesSmartMetric(unit: LengthUnit): boolean {
  return unit === "mm" || unit === "cm";
}

/**
 * Unit used for a smart length label. Metric lengths shorter than one metre
 * keep the project unit (cm or mm); longer values switch to metres so a wall
 * does not read as 4,352.07 cm.
 */
export function displayedLengthUnit(
  points: number,
  scale: ScaleSnapshot | null | undefined,
  unit: LengthUnit,
  smart: boolean,
): LengthUnit {
  if (!smart || !scale || !usesSmartMetric(unit)) return unit;
  return Math.abs(points / scale.pointsPerMeter) >= 0.9995 ? "m" : unit;
}

export function formatLength(
  points: number,
  scale: ScaleSnapshot | null | undefined,
  unit: LengthUnit,
  smart = false,
): string {
  if (!scale) return `${formatNumber(points, 1)} pt`;
  const displayUnit = displayedLengthUnit(points, scale, unit, smart);
  if (displayUnit === "m" && displayUnit !== unit) {
    return `${formatNumber(points / scale.pointsPerMeter, 2)} m`;
  }
  const decimals = smart ? (unit === "mm" ? 0 : unit === "cm" ? 1 : 2) : 2;
  return `${formatNumber(lengthInUnit(points, scale.pointsPerMeter, displayUnit), decimals)} ${displayUnit}`;
}

/**
 * Compact length for secondary label text. Millimetres do not need hundredths
 * of a millimetre on a drawing annotation, and fewer digits keep the label
 * from stretching across the plan.
 */
export function formatLengthCompact(
  points: number,
  scale: ScaleSnapshot | null | undefined,
  unit: LengthUnit,
  smart = false,
): string {
  if (!scale) return `${formatNumber(points, 1)} pt`;
  const displayUnit = displayedLengthUnit(points, scale, unit, smart);
  if (displayUnit === "m" && displayUnit !== unit) {
    return `${formatNumber(points / scale.pointsPerMeter, 2)} m`;
  }
  const decimals = unit === "mm" ? 0 : unit === "cm" ? 1 : 2;
  return `${formatNumber(lengthInUnit(points, scale.pointsPerMeter, displayUnit), decimals)} ${displayUnit}`;
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

export function formatScale(
  scale: ScaleSnapshot | null | undefined,
  calibration?: Calibration | null,
): string {
  if (!scale) return "Not calibrated";
  if (calibration?.source === "manual") {
    return `1:${formatNumber(calibration.ratio, 6)}`;
  }
  const mmPerPoint = (1 / scale.pointsPerMeter) * 1000;
  return `1 pt = ${formatNumber(mmPerPoint, 3)} mm`;
}

/**
 * Compact 1:N label for the status bar. Real drawings round to whole ratios and
 * the exact mm/pt value stays in the tooltip.
 */
export function formatScaleRatio(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio) || ratio <= 0) {
    return "Not calibrated";
  }
  return `1:${formatNumber(ratio, ratio >= 10 ? 0 : 1)}`;
}

export function formatCoordinate(
  value: number,
  scale: ScaleSnapshot | null,
  unit: LengthUnit,
): string {
  if (!scale) return `${formatNumber(value, 1)}`;
  return formatNumber(lengthInUnit(value, scale.pointsPerMeter, unit), 2);
}

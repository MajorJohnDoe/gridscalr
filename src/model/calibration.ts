import { distance } from "./geometry";
import type {
  Calibration,
  LengthUnit,
  ManualCalibration,
  MarkupItem,
  Point,
  Project,
  ReferenceCalibration,
  ScaleSnapshot,
} from "./types";
import { unitToMeters } from "./units";

/** One metre in PDF points at physical paper size (72 pt/in / 0.0254 m/in). */
export const MANUAL_SCALE_POINTS_PER_METER = 2834.645669;

export function makeId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createCalibration(
  p1: Point,
  p2: Point,
  knownLength: number,
  unit: LengthUnit,
): ReferenceCalibration {
  const points = Math.max(distance(p1, p2), 1e-6);
  const meters = knownLength * unitToMeters(unit);
  const pointsPerMeter = points / Math.max(meters, 1e-9);
  return {
    id: makeId("cal"),
    source: "reference",
    p1: { ...p1 },
    p2: { ...p2 },
    knownLength,
    unit,
    pointsPerMeter,
    createdAt: new Date().toISOString(),
  };
}

export function isValidManualRatio(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function manualPointsPerMeter(ratio: number): number {
  if (!isValidManualRatio(ratio)) throw new Error("Manual scale ratio must be greater than zero.");
  return MANUAL_SCALE_POINTS_PER_METER / ratio;
}

export function createManualCalibration(ratio: number): ManualCalibration {
  return {
    id: makeId("cal"),
    source: "manual",
    ratio,
    pointsPerMeter: manualPointsPerMeter(ratio),
    createdAt: new Date().toISOString(),
  };
}

export function isReferenceCalibration(cal: Calibration): cal is ReferenceCalibration {
  return cal.source !== "manual";
}

export function isManualCalibration(cal: Calibration): cal is ManualCalibration {
  return cal.source === "manual";
}

export function calibrationSourceUnit(cal: Calibration): LengthUnit {
  return isManualCalibration(cal) ? "m" : cal.unit;
}

export function calibrationScaleSnapshot(cal: Calibration): ScaleSnapshot {
  return {
    pointsPerMeter: cal.pointsPerMeter,
    sourceUnit: calibrationSourceUnit(cal),
  };
}

export function pageCalibration(project: Project | null, page: number): Calibration | undefined {
  return project?.pages[String(page)]?.calibration;
}

export function pageScaleLocked(project: Project | null, page: number): boolean {
  return project?.pages[String(page)]?.scaleLocked === true;
}

export function pageScale(project: Project | null, page: number): ScaleSnapshot | null {
  const cal = pageCalibration(project, page);
  if (!cal) return null;
  return calibrationScaleSnapshot(cal);
}

export function itemScale(item: MarkupItem, project: Project | null): ScaleSnapshot | null {
  // undefined means the item predates scale snapshots and follows the page;
  // null means it was explicitly created uncalibrated and should stay that way.
  if (item.scale === null) return null;
  return item.scale ?? pageScale(project, item.page);
}

function cloneCalibration(calibration: Calibration): Calibration {
  if (isManualCalibration(calibration)) return { ...calibration };
  return {
    ...calibration,
    p1: { ...calibration.p1 },
    p2: { ...calibration.p2 },
  };
}

/** Sets a scale and returns the page numbers that were actually changed. */
export function setPageCalibration(
  project: Project,
  page: number,
  calibration: Calibration,
  options: { applyToAll?: boolean; updateMeasurements?: boolean; pageCount: number },
): number[] {
  const pages = options.applyToAll
    ? Array.from({ length: options.pageCount }, (_, i) => i + 1)
    : [page];
  const changed: number[] = [];

  for (const pageNumber of pages) {
    const key = String(pageNumber);
    const state = project.pages[key] ?? {};
    // A locked page keeps its current scale even when another page applies a
    // calibration to all pages.
    if (state.scaleLocked) continue;
    project.pages[key] = { ...state, calibration: cloneCalibration(calibration) };
    changed.push(pageNumber);
  }

  if (options.updateMeasurements) {
    const scale = calibrationScaleSnapshot(calibration);
    for (const layer of project.layers) {
      if (layer.kind !== "measure") continue;
      for (const item of layer.items) {
        if (changed.includes(item.page)) item.scale = { ...scale };
      }
    }
  }

  return changed;
}

export function setPageScaleLocked(project: Project, page: number, locked: boolean): boolean {
  const key = String(page);
  const state = project.pages[key];
  if (!state?.calibration) return false;
  if (locked) state.scaleLocked = true;
  else delete state.scaleLocked;
  return true;
}

/** Clears a page scale. Locked pages must be unlocked first. */
export function clearPageCalibration(project: Project, page: number): boolean {
  const key = String(page);
  const state = project.pages[key];
  if (!state || state.scaleLocked) return false;
  delete state.calibration;
  delete state.scaleLocked;
  if (!Object.keys(state).length) delete project.pages[key];
  return true;
}

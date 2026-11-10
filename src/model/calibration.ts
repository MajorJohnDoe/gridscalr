import { distance } from "./geometry";
import type {
  Calibration,
  LengthUnit,
  ManualCalibration,
  MarkupItem,
  PageId,
  Point,
  Project,
  ReferenceCalibration,
  ScaleSnapshot,
} from "./types";
import { ensurePageState, pageStateOf } from "./pages";
import { unitToMeters } from "./units";
import { t } from "../i18n";

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
  if (!isValidManualRatio(ratio)) throw new Error(t("calibration.manualRatioInvalid"));
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

export function pageCalibration(
  project: Project | null,
  pageId: PageId | null | undefined,
): Calibration | undefined {
  return pageStateOf(project, pageId)?.calibration;
}

export function pageScaleLocked(
  project: Project | null,
  pageId: PageId | null | undefined,
): boolean {
  return pageStateOf(project, pageId)?.scaleLocked === true;
}

export function pageScale(
  project: Project | null,
  pageId: PageId | null | undefined,
): ScaleSnapshot | null {
  const cal = pageCalibration(project, pageId);
  if (!cal) return null;
  return calibrationScaleSnapshot(cal);
}

export function itemScale(item: MarkupItem, project: Project | null): ScaleSnapshot | null {
  // undefined means the item predates scale snapshots and follows the page;
  // null means it was explicitly created uncalibrated and should stay that way.
  if (item.scale === null) return null;
  return item.scale ?? pageScale(project, item.pageId);
}

/** The drawing ratio (the N in 1:N) implied by a scale snapshot. */
export function scaleRatio(scale: ScaleSnapshot | null | undefined): number | null {
  if (!scale || !Number.isFinite(scale.pointsPerMeter) || scale.pointsPerMeter <= 0) return null;
  return MANUAL_SCALE_POINTS_PER_METER / scale.pointsPerMeter;
}

function cloneCalibration(calibration: Calibration): Calibration {
  if (isManualCalibration(calibration)) return { ...calibration };
  return {
    ...calibration,
    p1: { ...calibration.p1 },
    p2: { ...calibration.p2 },
  };
}

/** Sets a scale and returns the stable page IDs that were actually changed. */
export function setPageCalibration(
  project: Project,
  pageId: PageId,
  calibration: Calibration,
  options: { applyToAll?: boolean; updateMeasurements?: boolean },
): PageId[] {
  const targets = options.applyToAll ? project.pages.map((record) => record.id) : [pageId];
  const changed: PageId[] = [];

  for (const targetId of targets) {
    const state = ensurePageState(project, targetId);
    if (!state) continue;
    // A locked page keeps its current scale even when another page applies a
    // calibration to all pages.
    if (state.scaleLocked) continue;
    state.calibration = cloneCalibration(calibration);
    changed.push(targetId);
  }

  if (options.updateMeasurements) {
    const scale = calibrationScaleSnapshot(calibration);
    for (const layer of project.layers) {
      if (layer.kind !== "measure") continue;
      for (const item of layer.items) {
        if (changed.includes(item.pageId)) item.scale = { ...scale };
      }
    }
  }

  return changed;
}

export function setPageScaleLocked(project: Project, pageId: PageId, locked: boolean): boolean {
  const state = pageStateOf(project, pageId);
  if (!state?.calibration) return false;
  if (locked) state.scaleLocked = true;
  else delete state.scaleLocked;
  return true;
}

/** Clears a page scale. Locked pages must be unlocked first. */
export function clearPageCalibration(project: Project, pageId: PageId): boolean {
  const state = pageStateOf(project, pageId);
  if (!state || state.scaleLocked) return false;
  delete state.calibration;
  delete state.scaleLocked;
  return true;
}

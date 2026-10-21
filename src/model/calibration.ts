import { distance } from "./geometry";
import type { Calibration, LengthUnit, MarkupItem, Point, Project, ScaleSnapshot } from "./types";
import { unitToMeters } from "./units";

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
): Calibration {
  const points = Math.max(distance(p1, p2), 1e-6);
  const meters = knownLength * unitToMeters(unit);
  const pointsPerMeter = points / Math.max(meters, 1e-9);
  return {
    id: makeId("cal"),
    p1: { ...p1 },
    p2: { ...p2 },
    knownLength,
    unit,
    pointsPerMeter,
    createdAt: new Date().toISOString(),
  };
}

export function pageCalibration(project: Project | null, page: number): Calibration | undefined {
  return project?.pages[String(page)]?.calibration;
}

export function pageScale(project: Project | null, page: number): ScaleSnapshot | null {
  const cal = pageCalibration(project, page);
  if (!cal) return null;
  return { pointsPerMeter: cal.pointsPerMeter, sourceUnit: cal.unit };
}

export function itemScale(item: MarkupItem, project: Project | null): ScaleSnapshot | null {
  // undefined means the item predates scale snapshots and follows the page;
  // null means it was explicitly created uncalibrated and should stay that way.
  if (item.scale === null) return null;
  return item.scale ?? pageScale(project, item.page);
}

export function setPageCalibration(
  project: Project,
  page: number,
  calibration: Calibration,
  options: { applyToAll?: boolean; updateMeasurements?: boolean; pageCount: number },
): void {
  const pages = options.applyToAll
    ? Array.from({ length: options.pageCount }, (_, i) => i + 1)
    : [page];

  for (const pageNumber of pages) {
    const key = String(pageNumber);
    project.pages[key] = { ...(project.pages[key] ?? {}), calibration: { ...calibration } };
  }

  if (options.updateMeasurements) {
    const scale: ScaleSnapshot = {
      pointsPerMeter: calibration.pointsPerMeter,
      sourceUnit: calibration.unit,
    };
    for (const layer of project.layers) {
      if (layer.kind !== "measure") continue;
      for (const item of layer.items) {
        if (pages.includes(item.page)) item.scale = { ...scale };
      }
    }
  }
}

export function clearPageCalibration(project: Project, page: number): void {
  const state = project.pages[String(page)];
  if (state) delete state.calibration;
}

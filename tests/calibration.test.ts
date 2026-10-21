import { describe, expect, it } from "vitest";
import {
  clearPageCalibration,
  createCalibration,
  itemScale,
  pageCalibration,
  pageScale,
  setPageCalibration,
} from "../src/model/calibration";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import type { MarkupItem } from "../src/model/types";

function makeProject(pageCount = 3) {
  return createProject(defaultDocument("Plan.pdf", pageCount), createDefaultLayers());
}

function makeMeasurement(page: number): MarkupItem {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: `item_${page}`,
    page,
    kind: "length",
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: now,
    updatedAt: now,
  };
}

describe("calibration", () => {
  it("creates a scale from a known length", () => {
    const calibration = createCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, "m");
    expect(calibration.pointsPerMeter).toBe(10);
    expect(calibration.knownLength).toBe(10);
    expect(calibration.unit).toBe("m");
    expect(calibration.id).toMatch(/^cal_/);
  });

  it("returns null scales for uncalibrated pages", () => {
    const project = makeProject();
    expect(pageCalibration(project, 1)).toBeUndefined();
    expect(pageScale(project, 1)).toBeNull();
  });

  it("applies a calibration to all pages and can update measurements", () => {
    const project = makeProject(3);
    const measureLayer = project.layers.find((layer) => layer.kind === "measure")!;
    const item = makeMeasurement(2);
    measureLayer.items.push(item);
    const calibration = createCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, "m");

    setPageCalibration(project, 2, calibration, {
      applyToAll: true,
      updateMeasurements: true,
      pageCount: 3,
    });

    expect(pageCalibration(project, 1)?.pointsPerMeter).toBe(20);
    expect(pageCalibration(project, 2)?.pointsPerMeter).toBe(20);
    expect(pageCalibration(project, 3)?.pointsPerMeter).toBe(20);
    expect(item.scale).toEqual({ pointsPerMeter: 20, sourceUnit: "m" });
    expect(pageScale(project, 3)).toEqual({ pointsPerMeter: 20, sourceUnit: "m" });
  });

  it("keeps existing measurement snapshots unless updating is requested", () => {
    const project = makeProject(1);
    const measureLayer = project.layers.find((layer) => layer.kind === "measure")!;
    const item = makeMeasurement(1);
    item.scale = { pointsPerMeter: 4, sourceUnit: "m" };
    measureLayer.items.push(item);
    const calibration = createCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, "m");

    setPageCalibration(project, 1, calibration, {
      updateMeasurements: false,
      pageCount: 1,
    });

    expect(item.scale).toEqual({ pointsPerMeter: 4, sourceUnit: "m" });
    expect(itemScale(item, project)).toEqual({ pointsPerMeter: 4, sourceUnit: "m" });
  });

  it("falls back to the page scale when an item predates scale snapshots", () => {
    const project = makeProject(1);
    const item = makeMeasurement(1);
    const calibration = createCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, "m");
    setPageCalibration(project, 1, calibration, { pageCount: 1 });

    expect(item.scale).toBeUndefined();
    expect(itemScale(item, project)).toEqual({ pointsPerMeter: 20, sourceUnit: "m" });
  });

  it("keeps an explicitly uncalibrated measurement uncalibrated until updating", () => {
    const project = makeProject(1);
    const measureLayer = project.layers.find((layer) => layer.kind === "measure")!;
    const item = makeMeasurement(1);
    item.scale = null;
    measureLayer.items.push(item);
    setPageCalibration(
      project,
      1,
      createCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, "m"),
      { updateMeasurements: false, pageCount: 1 },
    );
    expect(itemScale(item, project)).toBeNull();

    setPageCalibration(
      project,
      1,
      createCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, "m"),
      { updateMeasurements: true, pageCount: 1 },
    );
    expect(item.scale).toEqual({ pointsPerMeter: 10, sourceUnit: "m" });
  });

  it("clears calibration without deleting measurements", () => {
    const project = makeProject(1);
    const measureLayer = project.layers.find((layer) => layer.kind === "measure")!;
    const item = makeMeasurement(1);
    measureLayer.items.push(item);
    setPageCalibration(
      project,
      1,
      createCalibration({ x: 0, y: 0 }, { x: 100, y: 0 }, 5, "m"),
      { pageCount: 1 },
    );

    clearPageCalibration(project, 1);

    expect(pageCalibration(project, 1)).toBeUndefined();
    expect(measureLayer.items).toHaveLength(1);
    expect(itemScale(item, project)).toBeNull();
  });
});

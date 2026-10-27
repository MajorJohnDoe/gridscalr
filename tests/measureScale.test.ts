import { describe, expect, it } from "vitest";
import {
  createManualCalibration,
  manualPointsPerMeter,
  setPageCalibration,
} from "../src/model/calibration";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import { itemScaleWarning } from "../src/model/measure";
import type { MarkupItem, Project } from "../src/model/types";

const now = "2026-01-01T00:00:00.000Z";

function makeProject(ratio: number | null): Project {
  const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
  if (ratio !== null) {
    setPageCalibration(project, 1, createManualCalibration(ratio), { pageCount: 1 });
  }
  return project;
}

function makeArea(scale: MarkupItem["scale"]): MarkupItem {
  return {
    id: "item_area",
    page: 1,
    kind: "area",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    scale,
    createdAt: now,
    updatedAt: now,
  };
}

describe("measurement scale warnings", () => {
  it("stays quiet when the measurement uses the page scale", () => {
    const project = makeProject(100);
    const item = makeArea({ pointsPerMeter: manualPointsPerMeter(100), sourceUnit: "mm" });
    expect(itemScaleWarning(item, project)).toBeNull();
  });

  it("explains an older scale after recalibration", () => {
    const project = makeProject(200);
    const item = makeArea({ pointsPerMeter: manualPointsPerMeter(100), sourceUnit: "mm" });
    const warning = itemScaleWarning(item, project);
    expect(warning).toContain("1:100");
    expect(warning).toContain("1:200");
  });

  it("flags measurements drawn before the page was calibrated", () => {
    const project = makeProject(100);
    const warning = itemScaleWarning(makeArea(null), project);
    expect(warning).toContain("PDF points");
  });

  it("flags measurements that keep a scale after the page scale is cleared", () => {
    const project = makeProject(null);
    const item = makeArea({ pointsPerMeter: manualPointsPerMeter(100), sourceUnit: "mm" });
    expect(itemScaleWarning(item, project)).toContain("scale was cleared");
  });

  it("treats a missing snapshot as following the page, and skips other kinds", () => {
    const project = makeProject(100);
    expect(itemScaleWarning(makeArea(undefined), project)).toBeNull();
    const count: MarkupItem = { ...makeArea(undefined), kind: "count", points: [{ x: 0, y: 0 }] };
    expect(itemScaleWarning(count, project)).toBeNull();
  });
});

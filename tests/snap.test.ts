import { describe, expect, it } from "vitest";
import { createCalibration, createManualCalibration } from "../src/model/calibration";
import {
  addItem,
  createDefaultLayers,
  createProject,
  defaultDocument,
  layersForKind,
} from "../src/model/layers";
import { collectSnapCandidates, findSnap, type SnapCandidate } from "../src/model/snap";
import type { MarkupItem, Project } from "../src/model/types";

const NOW = "2026-01-01T00:00:00.000Z";

function makeItem(overrides: Partial<MarkupItem>): MarkupItem {
  return {
    id: "item",
    page: 1,
    kind: "length",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeProject(): Project {
  const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
  const measure = layersForKind(project, "measure")[0];
  addItem(
    project,
    measure.id,
    makeItem({
      id: "horizontal",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
    }),
  );
  addItem(
    project,
    measure.id,
    makeItem({
      id: "vertical",
      points: [
        { x: 30, y: -50 },
        { x: 30, y: 40 },
      ],
    }),
  );
  addItem(
    project,
    measure.id,
    makeItem({
      id: "rectangle",
      kind: "area",
      areaShape: "rectangle",
      points: [
        { x: 200, y: 200 },
        { x: 300, y: 250 },
      ],
    }),
  );
  addItem(
    project,
    measure.id,
    makeItem({
      id: "ellipse",
      kind: "area",
      areaShape: "ellipse",
      points: [
        { x: 400, y: 400 },
        { x: 500, y: 450 },
      ],
    }),
  );
  return project;
}

function has(
  candidates: SnapCandidate[],
  kind: SnapCandidate["kind"],
  x: number,
  y: number,
): boolean {
  return candidates.some(
    (candidate) =>
      candidate.kind === kind &&
      Math.abs(candidate.point.x - x) < 1e-6 &&
      Math.abs(candidate.point.y - y) < 1e-6,
  );
}

describe("markup snapping", () => {
  it("collects endpoints, midpoints, intersections, and rectangle corners", () => {
    const candidates = collectSnapCandidates(makeProject(), 1);
    expect(has(candidates, "endpoint", 0, 0)).toBe(true);
    expect(has(candidates, "endpoint", 100, 0)).toBe(true);
    expect(has(candidates, "midpoint", 50, 0)).toBe(true);
    expect(has(candidates, "intersection", 30, 0)).toBe(true);
    expect(has(candidates, "endpoint", 200, 200)).toBe(true);
    expect(has(candidates, "endpoint", 300, 200)).toBe(true);
    expect(has(candidates, "endpoint", 300, 250)).toBe(true);
    expect(has(candidates, "endpoint", 200, 250)).toBe(true);
  });

  it("does not add midpoints or intersections for ellipses", () => {
    const candidates = collectSnapCandidates(makeProject(), 1);
    const fromEllipse = candidates.filter((candidate) => candidate.itemIds?.includes("ellipse"));
    expect(fromEllipse.length).toBeGreaterThan(0);
    expect(fromEllipse.every((candidate) => candidate.kind === "endpoint")).toBe(true);
  });

  it("picks the nearest candidate within the screen-pixel threshold", () => {
    const candidates = collectSnapCandidates(makeProject(), 1);
    expect(findSnap({ x: 98, y: 0 }, candidates, 8, 1)).toMatchObject({
      kind: "endpoint",
      point: { x: 100, y: 0 },
    });
    expect(findSnap({ x: 52, y: 0 }, candidates, 8, 1)).toMatchObject({
      kind: "midpoint",
      point: { x: 50, y: 0 },
    });
    expect(findSnap({ x: 31, y: 0 }, candidates, 8, 1)).toMatchObject({
      kind: "intersection",
      point: { x: 30, y: 0 },
    });
    // The threshold is screen pixels, so zooming in halves the page-space radius.
    expect(findSnap({ x: 95, y: 0 }, candidates, 8, 2)).toBeNull();
  });

  it("ignores hidden items and hidden layers but keeps locked items", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    const hidden = makeItem({
      id: "hidden",
      visible: false,
      points: [
        { x: 700, y: 700 },
        { x: 800, y: 700 },
      ],
    });
    const locked = makeItem({
      id: "locked",
      locked: true,
      points: [
        { x: 900, y: 900 },
        { x: 1000, y: 900 },
      ],
    });
    addItem(project, measure.id, hidden);
    addItem(project, measure.id, locked);
    let candidates = collectSnapCandidates(project, 1);
    expect(has(candidates, "endpoint", 700, 700)).toBe(false);
    expect(has(candidates, "endpoint", 900, 900)).toBe(true);

    measure.visible = false;
    candidates = collectSnapCandidates(project, 1);
    expect(candidates).toHaveLength(0);
  });

  it("includes visible reference calibration endpoints and ignores manual scales", () => {
    const project = makeProject();
    project.pages["1"] = {
      calibration: createCalibration({ x: 500, y: 500 }, { x: 600, y: 500 }, 10, "m"),
    };
    let candidates = collectSnapCandidates(project, 1);
    expect(has(candidates, "endpoint", 500, 500)).toBe(true);

    project.settings.showCalibration = false;
    candidates = collectSnapCandidates(project, 1);
    expect(has(candidates, "endpoint", 500, 500)).toBe(false);

    project.settings.showCalibration = true;
    project.pages["1"] = { calibration: createManualCalibration(100) };
    candidates = collectSnapCandidates(project, 1);
    expect(has(candidates, "endpoint", 500, 500)).toBe(false);
  });
});

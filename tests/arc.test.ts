import { describe, expect, it } from "vitest";
import { createManualCalibration } from "../src/model/calibration";
import { arcGeometry, arcPolyline, itemBounds, measurementValue } from "../src/model/geometry";
import {
  addItem,
  createDefaultLayers,
  createProject,
  defaultDocument,
  layersForKind,
} from "../src/model/layers";
import { calculateQuantities } from "../src/model/quantity";
import type { MarkupItem } from "../src/model/types";
import { parseProject, serializeProject } from "../src/io/projectFile";

const NOW = "2026-01-01T00:00:00.000Z";

function item(kind: MarkupItem["kind"], points: MarkupItem["points"]): MarkupItem {
  return {
    id: `item_${kind}`,
    page: 1,
    kind,
    points,
    color: "#4cc9f0",
    strokeWidth: 1,
    scale: { pointsPerMeter: 100, sourceUnit: "m" },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe("radius, diameter and arc geometry", () => {
  it("measures radius and diameter from the centre and edge", () => {
    const radius = item("radius", [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    const diameter = { ...radius, kind: "diameter" as const };
    expect(measurementValue(radius)).toBeCloseTo(10);
    expect(measurementValue(diameter)).toBeCloseTo(20);
    expect(itemBounds(radius)).toEqual({
      min: { x: -10, y: -10 },
      max: { x: 10, y: 10 },
    });
  });

  it("computes the arc through three points", () => {
    const arc = item("arc", [
      { x: 10, y: 0 },
      { x: 7.0710678, y: 7.0710678 },
      { x: 0, y: 10 },
    ]);
    const geometry = arcGeometry(arc);
    expect(geometry).not.toBeNull();
    expect(geometry!.radius).toBeCloseTo(10);
    expect(geometry!.length).toBeCloseTo((Math.PI * 10) / 2, 4);
    expect(arcPolyline(arc).length).toBeGreaterThan(4);
    expect(itemBounds(arc).max.y).toBeCloseTo(10);
  });

  it("ignores collinear arc points", () => {
    const arc = item("arc", [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ]);
    expect(arcGeometry(arc)).toBeNull();
    expect(measurementValue(arc)).toBeNull();
  });

  it("round-trips the new measurement kinds through the project file", () => {
    const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
    const layer = layersForKind(project, "measure")[0];
    addItem(
      project,
      layer.id,
      item("radius", [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    );
    addItem(
      project,
      layer.id,
      item("diameter", [
        { x: 0, y: 20 },
        { x: 10, y: 20 },
      ]),
    );
    addItem(
      project,
      layer.id,
      item("arc", [
        { x: 10, y: 0 },
        { x: 7.0710678, y: 7.0710678 },
        { x: 0, y: 10 },
      ]),
    );

    const parsed = parseProject(serializeProject(project));
    expect(parsed.schemaVersion).toBe(19);
    expect(parsed.layers.flatMap((entry) => entry.items.map((entry) => entry.kind))).toEqual(
      expect.arrayContaining(["radius", "diameter", "arc"]),
    );
  });

  it("reports radius and arc measurements as length quantities", () => {
    const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
    project.pages["1"] = { calibration: createManualCalibration(100) };
    const layer = layersForKind(project, "measure")[0];
    addItem(
      project,
      layer.id,
      item("radius", [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ]),
    );
    addItem(
      project,
      layer.id,
      item("arc", [
        { x: 10, y: 0 },
        { x: 7.0710678, y: 7.0710678 },
        { x: 0, y: 10 },
      ]),
    );

    const summary = calculateQuantities(project, { page: "all" });
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].type).toBe("length");
    expect(summary.rows[0].gross).toBeCloseTo(257.0796, 3);
    expect(summary.rows[0].items).toBe(2);
  });
});

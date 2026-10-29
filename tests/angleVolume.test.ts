import { describe, expect, it } from "vitest";
import { createManualCalibration } from "../src/model/calibration";
import { angleGeometry, angleValue, slopeDegrees, slopeValue } from "../src/model/geometry";
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

function item(
  kind: MarkupItem["kind"],
  points: MarkupItem["points"],
  extra: Partial<MarkupItem> = {},
): MarkupItem {
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
    ...extra,
  };
}

describe("angle, slope and volume", () => {
  it("measures the angle between two rays", () => {
    const angle = item("angle", [
      { x: 10, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 10 },
    ]);
    expect(angleValue(angle)).toBeCloseTo(90);
    expect(angleGeometry(angle)?.sweep).toBeCloseTo(Math.PI / 2);
  });

  it("measures slope as grade and degrees", () => {
    const slope = item("slope", [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
    ]);
    expect(slopeValue(slope)).toBeCloseTo(50);
    expect(slopeDegrees(slope)).toBeCloseTo(26.565, 2);
  });

  it("reports angle, slope and volume quantities in their own units", () => {
    const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
    project.settings.lengthUnit = "m";
    project.settings.areaUnit = "m2";
    project.pages["1"] = { calibration: createManualCalibration(100) };
    const layer = layersForKind(project, "measure")[0];
    addItem(
      project,
      layer.id,
      item("angle", [
        { x: 10, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 10 },
      ]),
    );
    addItem(
      project,
      layer.id,
      item("slope", [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
      ]),
    );
    addItem(
      project,
      layer.id,
      item(
        "volume",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        { depth: 2 },
      ),
    );

    const summary = calculateQuantities(project, { page: "all" });
    expect(summary.rows.map((row) => [row.type, row.unit])).toEqual([
      ["angle", "°"],
      ["slope", "%"],
      ["volume", "m³"],
    ]);
    expect(summary.rows.find((row) => row.type === "angle")?.gross).toBeCloseTo(90);
    expect(summary.rows.find((row) => row.type === "slope")?.gross).toBeCloseTo(50);
    expect(summary.rows.find((row) => row.type === "volume")?.gross).toBeCloseTo(2);
  });

  it("round-trips depth and the new kinds through schema 19", () => {
    const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
    const layer = layersForKind(project, "measure")[0];
    addItem(
      project,
      layer.id,
      item(
        "volume",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        { depth: 2.5 },
      ),
    );
    const parsed = parseProject(serializeProject(project));
    expect(parsed.schemaVersion).toBe(19);
    expect(
      parsed.layers.flatMap((entry) => entry.items).find((entry) => entry.kind === "volume")?.depth,
    ).toBe(2.5);
  });
});

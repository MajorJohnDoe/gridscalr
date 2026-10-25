import { describe, expect, it } from "vitest";
import {
  cloneItem,
  createDefaultLayers,
  createProject,
  defaultDocument,
} from "../src/model/layers";
import { itemMetrics } from "../src/model/measure";
import { measurementLabelParts } from "../src/model/label";
import type { MarkupItem, Project } from "../src/model/types";

const NOW = "2026-01-01T00:00:00.000Z";

function makeProject(): Project {
  return createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
}

function makeArea(overrides: Partial<MarkupItem> = {}): MarkupItem {
  return {
    id: "item_area",
    page: 1,
    kind: "area",
    points: [
      { x: 10, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 40 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    areaMode: "add",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("deduction areas", () => {
  it("labels additions and deductions differently", () => {
    const project = makeProject();
    const add = itemMetrics(makeArea(), project);
    const subtract = itemMetrics(makeArea({ areaMode: "subtract" }), project);

    expect(add?.secondary).toMatch(/^Perimeter /);
    expect(add?.secondary).not.toContain("Deduction");
    expect(subtract?.secondary).toMatch(/^Deduction · Perimeter /);
    expect(subtract?.primary).toBe(add?.primary);
  });

  it("carries the deduction marker into the measurement label", () => {
    const project = makeProject();
    const parts = measurementLabelParts(makeArea({ areaMode: "subtract" }), project);
    expect(parts?.secondary).toMatch(/^Deduction · Perimeter /);
  });

  it("keeps the area mode when copied", () => {
    expect(cloneItem(makeArea({ areaMode: "subtract" })).areaMode).toBe("subtract");
  });
});

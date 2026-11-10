import { describe, expect, it } from "vitest";
import { pageIdFor, withTestPageIds } from "./helpers/pages";
import { createProject, defaultDocument } from "../src/model/layers";
import { hitTest } from "../src/model/hitTest";
import { defaultLineTypes } from "../src/model/lineTypes";
import { defaultRailRows, railGeometry, RAIL_ROW_SPACING } from "../src/model/rail";
import { collectSnapCandidates } from "../src/model/snap";
import { parseProject, serializeProject } from "../src/io/projectFile";
import type { MarkupItem, Project } from "../src/model/types";

const now = "2026-11-04T00:00:00.000Z";

function item(overrides: Partial<MarkupItem>): MarkupItem {
  return {
    id: "item",
    pageId: pageIdFor(1),
    kind: "polyline",
    points: [],
    color: "#e30613",
    strokeWidth: 2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function withItems(items: MarkupItem[]): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
  const draw = project.layers.find((layer) => layer.kind === "draw")!;
  draw.items.push(...items);
  return project;
}

describe("schematic line types", () => {
  it("creates the default media classes", () => {
    const types = defaultLineTypes();
    expect(types.map((entry) => entry.id)).toContain("supply");
    expect(types.map((entry) => entry.id)).toContain("control");
    expect(types.find((entry) => entry.id === "control")?.style).toBe("dashed");
  });

  it("round-trips project line types and restores defaults when missing", () => {
    const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
    project.lineTypes = [
      { id: "custom", name: "Custom", color: "#123456", widthPt: 3, style: "dashed" },
    ];
    const parsed = parseProject(serializeProject(project));
    expect(parsed.lineTypes).toEqual(project.lineTypes);

    const raw = JSON.parse(serializeProject(project));
    delete raw.lineTypes;
    const restored = parseProject(JSON.stringify(raw));
    expect(restored.lineTypes.map((entry) => entry.id)).toContain("supply");
  });
});

describe("rails", () => {
  it("derives row positions and hits a row", () => {
    const rail = item({
      id: "rail",
      kind: "rail",
      points: [
        { x: 30, y: 40 },
        { x: 200, y: 40 },
      ],
      color: "#4a4a4a",
      strokeWidth: 0.6,
      rows: defaultRailRows("plc"),
      rowSpacing: 10,
    });
    const project = withItems([rail]);
    const geometry = railGeometry(rail)!;
    expect(geometry.left).toBe(30);
    expect(geometry.right).toBe(200);
    expect(geometry.rows[0].y).toBe(40);
    expect(geometry.rows[4].y).toBe(80);

    const hit = hitTest(project, pageIdFor(1), { x: 100, y: 60 }, 1);
    expect(hit?.item.id).toBe("rail");
  });

  it("uses 5 mm spacing by default", () => {
    const rail = item({
      kind: "rail",
      points: [
        { x: 0, y: 10 },
        { x: 100, y: 10 },
      ],
    });
    expect(railGeometry(rail)!.rowSpacing).toBeCloseTo(RAIL_ROW_SPACING, 5);
  });

  it("contributes row endpoints, midpoints and segments to snapping", () => {
    const rail = item({
      id: "rail",
      kind: "rail",
      points: [
        { x: 30, y: 40 },
        { x: 200, y: 40 },
      ],
      rows: defaultRailRows("plc"),
      rowSpacing: 10,
    });
    const candidates = collectSnapCandidates(withItems([rail]), pageIdFor(1));
    expect(candidates.some((entry) => entry.point.x === 30 && entry.point.y === 40)).toBe(true);
    expect(candidates.some((entry) => entry.point.x === 115 && entry.point.y === 40)).toBe(true);
  });
});

describe("polylines", () => {
  it("is hit along its open segments", () => {
    const polyline = item({
      id: "polyline",
      points: [
        { x: 10, y: 10 },
        { x: 100, y: 10 },
        { x: 100, y: 80 },
      ],
    });
    const project = withItems([polyline]);
    expect(hitTest(project, pageIdFor(1), { x: 50, y: 10 }, 2)?.item.id).toBe("polyline");
    expect(hitTest(project, pageIdFor(1), { x: 100, y: 50 }, 2)?.item.id).toBe("polyline");
    expect(hitTest(project, pageIdFor(1), { x: 50, y: 50 }, 2)).toBeNull();
  });

  it("round-trips line type and style", () => {
    const polyline = item({
      id: "polyline",
      points: [
        { x: 10, y: 10 },
        { x: 100, y: 10 },
      ],
      lineTypeId: "control",
      lineStyle: "dashed",
    });
    const project = withItems([polyline]);
    const parsed = parseProject(serializeProject(project));
    const found = parsed.layers
      .flatMap((layer) => layer.items)
      .find((entry) => entry.id === "polyline")!;
    expect(found).toMatchObject({ kind: "polyline", lineTypeId: "control", lineStyle: "dashed" });
  });
});

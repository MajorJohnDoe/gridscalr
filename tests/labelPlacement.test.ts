import { describe, expect, it } from "vitest";
import { createManualCalibration, setPageCalibration } from "../src/model/calibration";
import { itemNeedsPageScale } from "../src/model/measure";
import {
  addItem,
  createDefaultLayers,
  createProject,
  defaultDocument,
  layersForKind,
} from "../src/model/layers";
import type { LabelMeasure } from "../src/model/label";
import {
  layoutPageLabels,
  pageLabelSources,
  previewLabelLayout,
  type LabelLayout,
} from "../src/model/labelLayout";
import { arcPolyline, angleGeometry } from "../src/model/geometry";
import type { MarkupItem, PageSize, Point, Project } from "../src/model/types";

const NOW = "2026-01-01T00:00:00.000Z";
const PAGE: PageSize = { width: 800, height: 600 };
const measure: LabelMeasure = (text, size) => text.length * size * 0.55;

function projectWith(items: Array<Partial<MarkupItem> & Pick<MarkupItem, "kind">>) {
  const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
  setPageCalibration(project, 1, createManualCalibration(100), { pageCount: 1 });
  const layer = layersForKind(project, "measure")[0];
  const created = items.map((item, index) => {
    const entry: MarkupItem = {
      id: item.id ?? `item_${index}`,
      page: 1,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      color: "#4cc9f0",
      strokeWidth: 2,
      scale: { pointsPerMeter: 100, sourceUnit: "m" },
      createdAt: NOW,
      updatedAt: NOW,
      ...item,
    };
    addItem(project, layer.id, entry);
    return entry;
  });
  return { project, items: created };
}

function layoutFor(project: Project, item: MarkupItem): LabelLayout {
  const sources = pageLabelSources(project, 1);
  const layout = layoutPageLabels(sources, { pageSize: PAGE, measure }).get(item.id);
  if (!layout) throw new Error("label layout missing");
  return layout;
}

function boxBounds(layout: LabelLayout) {
  return {
    min: { x: layout.box.x, y: layout.box.y },
    max: { x: layout.box.x + layout.box.width, y: layout.box.y + layout.box.height },
  };
}

function pointToBoxDistance(point: Point, layout: LabelLayout): number {
  const dx = Math.max(layout.box.x - point.x, 0, point.x - (layout.box.x + layout.box.width));
  const dy = Math.max(layout.box.y - point.y, 0, point.y - (layout.box.y + layout.box.height));
  return Math.hypot(dx, dy);
}

function segmentIntersectsBox(a: Point, b: Point, layout: LabelLayout): boolean {
  const minX = layout.box.x;
  const minY = layout.box.y;
  const maxX = layout.box.x + layout.box.width;
  const maxY = layout.box.y + layout.box.height;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x - minX, maxX - a.x, a.y - minY, maxY - a.y];
  for (let index = 0; index < 4; index += 1) {
    const denominator = p[index];
    const numerator = q[index];
    if (denominator === 0) {
      if (numerator < 0) return false;
      continue;
    }
    const ratio = numerator / denominator;
    if (denominator < 0) {
      if (ratio > t1) return false;
      if (ratio > t0) t0 = ratio;
    } else {
      if (ratio < t0) return false;
      if (ratio < t1) t1 = ratio;
    }
  }
  return true;
}

function polylineTouchesBox(points: Point[], layout: LabelLayout): boolean {
  for (let index = 0; index < points.length - 1; index += 1) {
    if (segmentIntersectsBox(points[index], points[index + 1], layout)) return true;
  }
  return false;
}

describe("curve, angle and slope label placement", () => {
  it("puts radius and diameter labels outside the circle on the radius side", () => {
    for (const kind of ["radius", "diameter"] as const) {
      const center = { x: 400, y: 300 };
      const edge = { x: 480, y: 300 };
      const { project, items } = projectWith([{ kind, points: [center, edge] }]);
      const layout = layoutFor(project, items[0]);

      expect(layout.placement).toBe("outside");
      expect(layout.leader).toBeDefined();
      expect(pointToBoxDistance(center, layout)).toBeGreaterThanOrEqual(80);
      expect(layout.box.x).toBeGreaterThan(edge.x);
      expect(layout.leader!.to.x).toBeCloseTo(edge.x, 3);
      expect(layout.leader!.to.y).toBeCloseTo(edge.y, 3);
    }
  });

  it("puts an arc label outside the convex side and connects it to the arc", () => {
    const { project, items } = projectWith([
      {
        kind: "arc",
        points: [
          { x: 200, y: 300 },
          { x: 300, y: 200 },
          { x: 400, y: 300 },
        ],
      },
    ]);
    const item = items[0];
    const layout = layoutFor(project, item);
    const arc = arcPolyline(item);

    expect(layout.placement).toBe("outside");
    expect(layout.leader).toBeDefined();
    expect(polylineTouchesBox(arc, layout)).toBe(false);
    expect(layout.box.y + layout.box.height).toBeLessThan(200);
    expect(polylineTouchesBox(arc, layout)).toBe(false);
  });

  it("puts an angle label on the outer bisector, clear of both rays", () => {
    const start = { x: 500, y: 300 };
    const vertex = { x: 300, y: 300 };
    const end = { x: 300, y: 120 };
    const { project, items } = projectWith([{ kind: "angle", points: [start, vertex, end] }]);
    const item = items[0];
    const layout = layoutFor(project, item);
    const centerX = layout.box.x + layout.box.width / 2;
    const centerY = layout.box.y + layout.box.height / 2;

    expect(layout.placement).toBe("outside");
    expect(centerX).toBeLessThan(vertex.x);
    expect(centerY).toBeGreaterThan(vertex.y);
    expect(segmentIntersectsBox(vertex, start, layout)).toBe(false);
    expect(segmentIntersectsBox(vertex, end, layout)).toBe(false);
  });

  it("keeps a slope label beside the line with a perpendicular offset", () => {
    const start = { x: 200, y: 300 };
    const end = { x: 500, y: 300 };
    const { project, items } = projectWith([{ kind: "slope", points: [start, end] }]);
    const layout = layoutFor(project, items[0]);
    const box = boxBounds(layout);
    const clearAbove = box.max.y <= start.y;
    const clearBelow = box.min.y >= start.y;

    expect(layout.placement).toBe("outside");
    expect(clearAbove || clearBelow).toBe(true);
    expect(segmentIntersectsBox(start, end, layout)).toBe(false);
  });

  it("places slope and angle previews near the geometry after the first click", () => {
    const slopeItem = {
      kind: "slope",
      points: [
        { x: 200, y: 300 },
        { x: 500, y: 320 },
      ],
    } as MarkupItem;
    const slope = previewLabelLayout(slopeItem, "10.0%", { pageSize: PAGE, measure });
    expect(
      Math.hypot(slope.box.x + slope.box.width / 2 - 350, slope.box.y + slope.box.height / 2 - 310),
    ).toBeLessThan(80);

    const angleItem = {
      kind: "angle",
      points: [
        { x: 500, y: 300 },
        { x: 300, y: 300 },
        { x: 300, y: 120 },
      ],
    } as MarkupItem;
    const angle = previewLabelLayout(angleItem, "90.0°", { pageSize: PAGE, measure });
    expect(
      Math.hypot(angle.box.x + angle.box.width / 2 - 300, angle.box.y + angle.box.height / 2 - 300),
    ).toBeLessThan(140);
    const geometry = angleGeometry(angleItem)!;
    expect(segmentIntersectsBox(geometry.vertex, geometry.start, angle)).toBe(false);
    expect(segmentIntersectsBox(geometry.vertex, geometry.end, angle)).toBe(false);
  });

  it("does not ask for a page scale on dimensionless measurements", () => {
    expect(itemNeedsPageScale({ kind: "angle" } as MarkupItem)).toBe(false);
    expect(itemNeedsPageScale({ kind: "slope" } as MarkupItem)).toBe(false);
    expect(itemNeedsPageScale({ kind: "count" } as MarkupItem)).toBe(false);
    expect(itemNeedsPageScale({ kind: "length" } as MarkupItem)).toBe(true);
    expect(itemNeedsPageScale({ kind: "area" } as MarkupItem)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { layoutPageLabels, type LabelSource } from "../src/model/labelLayout";
import type { Bounds } from "../src/model/geometry";
import { LABEL_MIN_PRIMARY_SIZE, LABEL_PRIMARY_SIZE, type LabelMeasure } from "../src/model/label";
import type { PageSize } from "../src/model/types";

const page: PageSize = { width: 300, height: 200 };
const measure: LabelMeasure = (text, size) => text.length * size * 0.55;

function areaSource(
  id: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): LabelSource {
  return {
    id,
    kind: "area",
    parts: { text: "10 m²", secondary: "Perimeter 14 m" },
    anchor: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    obstacle: {
      min: { x: minX, y: minY },
      max: { x: maxX, y: maxY },
    } satisfies Bounds,
    color: "#35c2a1",
  };
}

function layoutOne(source: LabelSource) {
  return layoutPageLabels([source], { pageSize: page, measure }).get(source.id)!;
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.min.x < b.max.x && a.max.x > b.min.x && a.min.y < b.max.y && a.max.y > b.min.y;
}

function boxBounds(box: { x: number; y: number; width: number; height: number }): Bounds {
  return {
    min: { x: box.x, y: box.y },
    max: { x: box.x + box.width, y: box.y + box.height },
  };
}

describe("measurement label placement", () => {
  it("centers a full-size label in a large area", () => {
    const layout = layoutOne(areaSource("large", 100, 70, 200, 130));

    expect(layout.placement).toBe("center");
    expect(layout.leader).toBeUndefined();
    expect(layout.metrics.primarySize).toBe(LABEL_PRIMARY_SIZE);
    expect(layout.box.x).toBeGreaterThanOrEqual(100);
    expect(layout.box.y).toBeGreaterThanOrEqual(70);
    expect(layout.box.x + layout.box.width).toBeLessThanOrEqual(200);
    expect(layout.box.y + layout.box.height).toBeLessThanOrEqual(130);
  });

  it("shrinks a label before moving it outside a smaller area", () => {
    const layout = layoutOne(areaSource("medium", 100, 94, 145, 116));

    expect(layout.placement).toBe("center");
    expect(layout.metrics.primarySize).toBeLessThan(LABEL_PRIMARY_SIZE);
    expect(layout.metrics.primarySize).toBeGreaterThanOrEqual(LABEL_MIN_PRIMARY_SIZE);
    expect(layout.leader).toBeUndefined();
    expect(layout.box.x).toBeGreaterThanOrEqual(100);
    expect(layout.box.x + layout.box.width).toBeLessThanOrEqual(160);
  });

  it("moves a label outside a tiny area with a leader line", () => {
    const source = areaSource("tiny", 100, 90, 120, 110);
    const layout = layoutOne(source);

    expect(layout.placement).toBe("outside");
    expect(layout.leader).toBeDefined();
    expect(overlaps(boxBounds(layout.box), source.obstacle)).toBe(false);
    expect(layout.leader!.to.x).toBeGreaterThanOrEqual(100);
    expect(layout.leader!.to.x).toBeLessThanOrEqual(120);
    expect(layout.leader!.to.y).toBe(90);
  });

  it("keeps an outside label inside the page near the top edge", () => {
    const source = areaSource("edge", 100, 0, 120, 20);
    const layout = layoutOne(source);

    expect(layout.placement).toBe("outside");
    expect(layout.box.y).toBeGreaterThanOrEqual(1.5);
    expect(layout.box.y + layout.box.height).toBeLessThanOrEqual(page.height - 1.5);
    expect(layout.box.x).toBeGreaterThanOrEqual(1.5);
    expect(layout.box.x + layout.box.width).toBeLessThanOrEqual(page.width - 1.5);
  });

  it("resolves collisions by using another side", () => {
    const first = areaSource("first", 100, 90, 120, 110);
    const second = areaSource("second", 125, 90, 145, 110);
    const layouts = layoutPageLabels([first, second], { pageSize: page, measure });
    const a = layouts.get("first")!;
    const b = layouts.get("second")!;

    expect(overlaps(boxBounds(a.box), boxBounds(b.box))).toBe(false);
    expect(b.placement).toBe("outside");
  });

  it("does not center a label in the empty part of a concave area", () => {
    const source = areaSource("concave", 100, 70, 200, 130);
    source.polygon = [
      { x: 100, y: 70 },
      { x: 200, y: 70 },
      { x: 200, y: 85 },
      { x: 115, y: 85 },
      { x: 115, y: 130 },
      { x: 100, y: 130 },
    ];
    const layout = layoutOne(source);

    expect(layout.placement).toBe("outside");
    expect(layout.leader).toBeDefined();
  });

  it("keeps length labels next to the line without a leader", () => {
    const source: LabelSource = {
      id: "length",
      kind: "length",
      parts: { text: "10 m" },
      anchor: { x: 150, y: 100 },
      obstacle: {
        min: { x: 100, y: 100 },
        max: { x: 200, y: 100 },
      },
      color: "#35c2a1",
    };
    const layout = layoutOne(source);

    expect(layout.placement).toBe("line");
    expect(layout.leader).toBeUndefined();
    expect(layout.metrics.primarySize).toBe(LABEL_PRIMARY_SIZE);
  });
});

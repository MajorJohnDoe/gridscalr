import { describe, expect, it } from "vitest";
import {
  itemBounds,
  itemCenter,
  itemCorners,
  itemLocalBounds,
  itemLocalToPage,
  rotatePoint,
} from "../src/model/geometry";
import { hitTest } from "../src/model/hitTest";
import { textItemLayout, clampTextSize } from "../src/model/text";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import type { MarkupItem } from "../src/model/types";

function textItem(overrides: Partial<MarkupItem> = {}): MarkupItem {
  return {
    id: "item_text",
    page: 1,
    kind: "text",
    points: [{ x: 100, y: 100 }],
    color: "#f2a93b",
    strokeWidth: 2,
    text: "Hello plan",
    fontSize: 12,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("text layout and rotated item geometry", () => {
  it("clamps arbitrary text sizes while preserving small values", () => {
    expect(clampTextSize(0.5)).toBe(0.5);
    expect(clampTextSize(6)).toBe(6);
    expect(clampTextSize(500)).toBe(300);
  });

  it("measures multi-line text and supports sizes below 8 pt", () => {
    const layout = textItemLayout({ text: "A\nB", fontSize: 6 });
    expect(layout.lines).toEqual(["A", "B"]);
    expect(layout.fontSize).toBe(6);
    expect(layout.height).toBeCloseTo(6 * 1.28 * 2);
    expect(layout.width).toBeGreaterThan(0);
  });

  it("rotates text bounds around the measured text centre", () => {
    const item = textItem({ rotation: 90 });
    const local = itemLocalBounds(item);
    const center = itemCenter(item);
    const rotatedBounds = itemBounds(item);

    expect(local.max.x).toBeGreaterThan(local.min.x);
    expect(itemCorners(item)[0]).not.toEqual(local.min);
    expect(rotatedBounds.max.x - rotatedBounds.min.x).toBeCloseTo(
      local.max.y - local.min.y,
      5,
    );
    expect(rotatePoint(local.min, center, 90)).toEqual(itemCorners(item)[0]);
  });

  it("hit-tests the rotated text area rather than its unrotated box", () => {
    const item = textItem({ rotation: 90 });
    const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
    project.layers[0].items.push(item);

    const local = itemLocalBounds(item);
    const center = itemCenter(item);
    const insideLocal = {
      x: local.min.x + (local.max.x - local.min.x) * 0.8,
      y: center.y,
    };
    const inside = itemLocalToPage(item, insideLocal);
    expect(hitTest(project, 1, inside, 1)).not.toBeNull();

    const outsideLocal = {
      x: local.max.x + 5,
      y: center.y,
    };
    const outside = itemLocalToPage(item, outsideLocal);
    expect(hitTest(project, 1, outside, 1)).toBeNull();
  });
});

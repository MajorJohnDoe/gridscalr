import { describe, expect, it } from "vitest";
import { boundsIntersect, itemRenderBounds } from "../src/canvas/items/visible";
import { visiblePageBounds, type Viewport } from "../src/canvas/viewport";
import type { LabelLayout } from "../src/model/labelLayout";
import type { MarkupItem } from "../src/model/types";

const view: Viewport = { page: 1, zoom: 2, panX: -100, panY: 50 };

function line(overrides: Partial<MarkupItem> = {}): MarkupItem {
  return {
    id: "item_line",
    page: 1,
    kind: "length",
    points: [
      { x: 1000, y: 1000 },
      { x: 1100, y: 1000 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("viewport culling", () => {
  it("maps the visible screen rectangle back to page space", () => {
    const bounds = visiblePageBounds(view, 800, 600);
    expect(bounds.min).toEqual({ x: 50, y: -25 });
    expect(bounds.max).toEqual({ x: 450, y: 275 });
  });

  it("expands the visible rectangle by the screen margin", () => {
    const bounds = visiblePageBounds(view, 800, 600, 20);
    expect(bounds.min).toEqual({ x: 40, y: -35 });
    expect(bounds.max).toEqual({ x: 460, y: 285 });
  });

  it("only reports overlap for rectangles that actually touch", () => {
    const visible = visiblePageBounds(view, 800, 600);
    expect(boundsIntersect({ min: { x: 100, y: 100 }, max: { x: 120, y: 120 } }, visible)).toBe(
      true,
    );
    expect(boundsIntersect({ min: { x: 900, y: 900 }, max: { x: 920, y: 920 } }, visible)).toBe(
      false,
    );
  });

  it("includes the measurement label box in the render bounds", () => {
    const item = line();
    const label: LabelLayout = {
      id: item.id,
      text: "1.00 m",
      color: "#ffffff",
      box: { x: 2000, y: 2000, width: 50, height: 20, primaryCenterY: 2010 },
      metrics: {
        primarySize: 6,
        secondarySize: 5,
        paddingX: 2,
        paddingY: 1,
        primaryLine: 7,
        secondaryLine: 6,
        rowGap: 1,
        radius: 2,
        borderWidth: 1,
        leaderWidth: 1,
        gap: 4,
      },
      placement: "outside",
    };
    const bounds = itemRenderBounds(item, label);
    expect(bounds.max.x).toBeGreaterThanOrEqual(2050);
    expect(bounds.max.y).toBeGreaterThanOrEqual(2020);
  });
});

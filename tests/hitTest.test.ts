import { describe, expect, it } from "vitest";
import {
  addItem,
  createDefaultLayers,
  createProject,
  defaultDocument,
  layersForKind,
} from "../src/model/layers";
import { hitTest, itemIntersectsBounds } from "../src/model/hitTest";
import type { MarkupItem } from "../src/model/types";

function makeProject() {
  return createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
}

function makeItem(overrides: Partial<MarkupItem> = {}): MarkupItem {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "item_a",
    page: 1,
    kind: "length",
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("hit testing", () => {
  it("selects marquee items by geometry, not their bounding box", () => {
    const diagonal = makeItem({
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
    });
    // A tiny box inside the diagonal's bounds but far from the line.
    expect(itemIntersectsBounds(diagonal, { x: 5, y: 95 }, { x: 8, y: 98 })).toBe(false);
    // A box that crosses the line.
    expect(itemIntersectsBounds(diagonal, { x: 45, y: 45 }, { x: 55, y: 55 })).toBe(true);

    const area = makeItem({
      kind: "area",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
    });
    // A marquee fully inside a filled area still selects it.
    expect(itemIntersectsBounds(area, { x: 40, y: 40 }, { x: 60, y: 60 })).toBe(true);
    expect(itemIntersectsBounds(area, { x: 200, y: 200 }, { x: 210, y: 210 })).toBe(false);
  });

  it("ignores hidden items", () => {
    const project = makeProject();
    const layer = layersForKind(project, "measure")[0];
    addItem(project, layer.id, makeItem({ visible: false }));
    expect(hitTest(project, 1, { x: 50, y: 10 }, 5)).toBeNull();
  });

  it("ignores locked items unless explicitly included", () => {
    const project = makeProject();
    const layer = layersForKind(project, "measure")[0];
    addItem(project, layer.id, makeItem({ locked: true }));
    expect(hitTest(project, 1, { x: 50, y: 10 }, 5)).toBeNull();
    expect(hitTest(project, 1, { x: 50, y: 10 }, 5, { includeLocked: true })?.item.id).toBe(
      "item_a",
    );
  });

  it("ignores locked layers unless explicitly included", () => {
    const project = makeProject();
    const layer = layersForKind(project, "measure")[0];
    layer.locked = true;
    addItem(project, layer.id, makeItem());
    expect(hitTest(project, 1, { x: 50, y: 10 }, 5)).toBeNull();
    expect(hitTest(project, 1, { x: 50, y: 10 }, 5, { includeLocked: true })?.item.id).toBe(
      "item_a",
    );
  });

  it("hit-tests rectangle and ellipse quick areas by their shape", () => {
    const project = makeProject();
    const layer = layersForKind(project, "measure")[0];
    addItem(
      project,
      layer.id,
      makeItem({
        id: "rect_area",
        kind: "area",
        areaShape: "rectangle",
        points: [
          { x: 10, y: 10 },
          { x: 110, y: 60 },
        ],
      }),
    );
    addItem(
      project,
      layer.id,
      makeItem({
        id: "ellipse_area",
        kind: "area",
        areaShape: "ellipse",
        points: [
          { x: 200, y: 10 },
          { x: 300, y: 60 },
        ],
      }),
    );

    expect(hitTest(project, 1, { x: 60, y: 35 }, 2)?.item.id).toBe("rect_area");
    expect(hitTest(project, 1, { x: 10, y: 10 }, 2, { includeLocked: true })?.item.id).toBe(
      "rect_area",
    );
    expect(hitTest(project, 1, { x: 250, y: 35 }, 2)?.item.id).toBe("ellipse_area");
    expect(hitTest(project, 1, { x: 202, y: 12 }, 1)).toBeNull();
  });

  it("keeps unfilled rectangles and ellipses click-through inside", () => {
    const project = makeProject();
    const layer = layersForKind(project, "draw")[0];
    const outlineRect = makeItem({
      id: "outline_rect",
      kind: "rect",
      points: [
        { x: 10, y: 10 },
        { x: 110, y: 60 },
      ],
    });
    const outlineEllipse = makeItem({
      id: "outline_ellipse",
      kind: "ellipse",
      points: [
        { x: 200, y: 10 },
        { x: 300, y: 60 },
      ],
    });
    const filledRect = makeItem({
      id: "filled_rect",
      kind: "rect",
      points: [
        { x: 400, y: 10 },
        { x: 500, y: 60 },
      ],
      fillColor: "#4cc9f0",
      opacity: 0.2,
    });
    addItem(project, layer.id, outlineRect);
    addItem(project, layer.id, outlineEllipse);
    addItem(project, layer.id, filledRect);

    // The inside of an outline shape belongs to the drawing beneath it.
    expect(hitTest(project, 1, { x: 60, y: 35 }, 2)).toBeNull();
    expect(hitTest(project, 1, { x: 250, y: 35 }, 2)).toBeNull();
    expect(hitTest(project, 1, { x: 450, y: 35 }, 2)?.item.id).toBe("filled_rect");

    // The outline itself still selects.
    expect(hitTest(project, 1, { x: 10, y: 35 }, 2)?.item.id).toBe("outline_rect");
    expect(hitTest(project, 1, { x: 250, y: 10 }, 2)?.item.id).toBe("outline_ellipse");

    // A marquee inside the empty box does not grab it, unlike a filled box.
    expect(itemIntersectsBounds(outlineRect, { x: 40, y: 30 }, { x: 60, y: 40 })).toBe(false);
    expect(itemIntersectsBounds(outlineRect, { x: 5, y: 30 }, { x: 15, y: 40 })).toBe(true);
    expect(itemIntersectsBounds(filledRect, { x: 440, y: 30 }, { x: 460, y: 40 })).toBe(true);
  });
});

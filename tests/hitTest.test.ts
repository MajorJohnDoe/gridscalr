import { describe, expect, it } from "vitest";
import {
  addItem,
  createDefaultLayers,
  createProject,
  defaultDocument,
  layersForKind,
} from "../src/model/layers";
import { hitTest } from "../src/model/hitTest";
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
    points: [{ x: 10, y: 10 }, { x: 110, y: 10 }],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("hit testing", () => {
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
    expect(
      hitTest(project, 1, { x: 50, y: 10 }, 5, { includeLocked: true })?.item.id,
    ).toBe("item_a");
  });

  it("ignores locked layers unless explicitly included", () => {
    const project = makeProject();
    const layer = layersForKind(project, "measure")[0];
    layer.locked = true;
    addItem(project, layer.id, makeItem());
    expect(hitTest(project, 1, { x: 50, y: 10 }, 5)).toBeNull();
    expect(
      hitTest(project, 1, { x: 50, y: 10 }, 5, { includeLocked: true })?.item.id,
    ).toBe("item_a");
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { clearClipboard, copyItems, duplicateItems, pasteItems } from "../src/model/clipboard";
import {
  addItem,
  addLayer,
  createDefaultLayers,
  createProject,
  defaultDocument,
  findItem,
  itemIsLocked,
  itemIsVisible,
  layersForKind,
  moveItemsToLayer,
} from "../src/model/layers";
import { resolveSelection, selectionKind, uniqueSelectionRefs } from "../src/model/selection";
import type { MarkupItem } from "../src/model/types";

function makeProject() {
  return createProject(defaultDocument("Plan.pdf", 2), createDefaultLayers());
}

function makeItem(id: string, page = 1, kind: MarkupItem["kind"] = "length"): MarkupItem {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    page,
    kind,
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: now,
    updatedAt: now,
  };
}

describe("selection helpers", () => {
  it("deduplicates selection refs and resolves only the matching layer", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    addItem(project, measure.id, makeItem("item_a"));
    const refs = uniqueSelectionRefs([
      { layerId: measure.id, itemId: "item_a" },
      { layerId: measure.id, itemId: "item_a" },
      { layerId: "missing", itemId: "item_a" },
    ]);
    expect(refs).toHaveLength(2);
    const resolved = resolveSelection(project, refs);
    expect(resolved.map((entry) => entry.ref)).toEqual([{ layerId: measure.id, itemId: "item_a" }]);
    expect(selectionKind(project, refs)).toBe("measure");
  });

  it("reports mixed layer kinds", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    const draw = layersForKind(project, "draw")[0];
    addItem(project, measure.id, makeItem("measure_a"));
    addItem(project, draw.id, makeItem("draw_a", 1, "text"));
    expect(
      selectionKind(project, [
        { layerId: measure.id, itemId: "measure_a" },
        { layerId: draw.id, itemId: "draw_a" },
      ]),
    ).toBeNull();
  });

  it("respects item and layer visibility and locking", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    addItem(project, measure.id, makeItem("item_a"));
    const item = findItem(project, "item_a")!.item;
    expect(itemIsVisible(item, measure)).toBe(true);
    expect(itemIsLocked(item, measure)).toBe(false);
    item.visible = false;
    item.locked = true;
    expect(itemIsVisible(item, measure)).toBe(false);
    expect(itemIsLocked(item, measure)).toBe(true);
    item.visible = true;
    item.locked = false;
    measure.visible = false;
    expect(itemIsVisible(item, measure)).toBe(false);
    measure.visible = true;
    measure.locked = true;
    expect(itemIsLocked(item, measure)).toBe(true);
  });
});

describe("bulk layer movement", () => {
  it("moves unlocked items and skips locked items", () => {
    const project = makeProject();
    const source = layersForKind(project, "measure")[0];
    const target = addLayer(project, "measure");
    addItem(project, source.id, makeItem("item_a"));
    addItem(project, source.id, { ...makeItem("item_b"), locked: true });
    const result = moveItemsToLayer(
      project,
      [
        { layerId: source.id, itemId: "item_a" },
        { layerId: source.id, itemId: "item_b" },
      ],
      target.id,
    );
    expect(result).toEqual({ moved: 1, skipped: 1, mixedKinds: false });
    expect(findItem(project, "item_a")?.layer.id).toBe(target.id);
    expect(findItem(project, "item_b")?.layer.id).toBe(source.id);
  });

  it("refuses to mix measurements and drawings", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    const draw = layersForKind(project, "draw")[0];
    addItem(project, measure.id, makeItem("measure_a"));
    addItem(project, draw.id, makeItem("draw_a", 1, "text"));
    const result = moveItemsToLayer(
      project,
      [
        { layerId: measure.id, itemId: "measure_a" },
        { layerId: draw.id, itemId: "draw_a" },
      ],
      measure.id,
    );
    expect(result.mixedKinds).toBe(true);
    expect(result.moved).toBe(0);
  });
});

describe("internal clipboard", () => {
  beforeEach(() => clearClipboard());

  it("pastes on another page with the same coordinates and new ids", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    addItem(project, measure.id, makeItem("item_a"));
    const source = findItem(project, "item_a")!;
    expect(copyItems(project, [{ layerId: measure.id, itemId: "item_a" }])).toBe(1);
    const refs = pasteItems(project, 2);
    expect(refs).toHaveLength(1);
    const pasted = findItem(project, refs[0].itemId)!;
    expect(pasted.item.id).not.toBe(source.item.id);
    expect(pasted.item.page).toBe(2);
    expect(pasted.item.points).toEqual(source.item.points);
    expect(pasted.layer.id).toBe(measure.id);
  });

  it("offsets a pasted copy on the same page", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    addItem(project, measure.id, makeItem("item_a"));
    copyItems(project, [{ layerId: measure.id, itemId: "item_a" }]);
    const refs = pasteItems(project, 1);
    const pasted = findItem(project, refs[0].itemId)!;
    expect(pasted.item.points[0]).toEqual({ x: 22, y: 22 });
  });

  it("duplicates only unlocked items and places them in the same layer", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    addItem(project, measure.id, makeItem("item_a"));
    addItem(project, measure.id, { ...makeItem("item_b"), locked: true });
    const refs = duplicateItems(project, [
      { layerId: measure.id, itemId: "item_a" },
      { layerId: measure.id, itemId: "item_b" },
    ]);
    expect(refs).toHaveLength(1);
    const copy = findItem(project, refs[0].itemId)!;
    expect(copy.layer.id).toBe(measure.id);
    expect(copy.item.locked).toBe(false);
    expect(copy.item.points[0]).toEqual({ x: 22, y: 22 });
  });
});

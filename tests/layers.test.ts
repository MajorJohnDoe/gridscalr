import { describe, expect, it } from "vitest";
import {
  addItem,
  addLayer,
  createDefaultLayers,
  createProject,
  defaultDocument,
  duplicateLayer,
  ensureActiveLayer,
  findItem,
  itemCountForPage,
  layerKindForItem,
  layersForKind,
  moveItemToLayer,
  moveLayer,
  normalizeLayerOrder,
  removeItem,
  removeLayer,
  swapLayers,
} from "../src/model/layers";
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
    points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: now,
    updatedAt: now,
  };
}

describe("layers", () => {
  it("creates projects with separate drawing and measurement layers", () => {
    const project = makeProject();
    expect(project.layers.map((layer) => layer.kind)).toEqual(["draw", "measure"]);
    expect(layersForKind(project, "draw")).toHaveLength(1);
    expect(layersForKind(project, "measure")).toHaveLength(1);
    expect(project.layers.find((layer) => layer.id === project.activeLayerId)?.kind).toBe("measure");
  });

  it("maps item kinds to the right layer kind", () => {
    expect(layerKindForItem("length")).toBe("measure");
    expect(layerKindForItem("area")).toBe("measure");
    expect(layerKindForItem("pen")).toBe("draw");
    expect(layerKindForItem("text")).toBe("draw");
  });

  it("keeps drawing layers below measurement layers", () => {
    const project = makeProject();
    addLayer(project, "draw");
    addLayer(project, "measure");
    const kinds = project.layers.map((layer) => layer.kind);
    const firstMeasure = kinds.indexOf("measure");
    expect(kinds.slice(0, firstMeasure)).toEqual(["draw", "draw"]);
    expect(kinds.slice(firstMeasure)).toEqual(["measure", "measure"]);
    expect(normalizeLayerOrder(project.layers)).toEqual(project.layers);
  });

  it("selects or creates an active layer for a tool kind", () => {
    const project = makeProject();
    project.activeLayerId = layersForKind(project, "measure")[0].id;
    const draw = ensureActiveLayer(project, "draw");
    expect(draw.kind).toBe("draw");
    expect(project.activeLayerId).toBe(draw.id);
  });

  it("skips hidden or locked layers when choosing an active target", () => {
    const project = makeProject();
    const [hidden, editable] = [layersForKind(project, "draw")[0], addLayer(project, "draw")];
    hidden.visible = false;
    project.activeLayerId = hidden.id;
    expect(ensureActiveLayer(project, "draw").id).toBe(editable.id);

    hidden.visible = true;
    hidden.locked = true;
    editable.visible = false;
    project.activeLayerId = hidden.id;
    const created = ensureActiveLayer(project, "draw");
    expect(created.id).not.toBe(hidden.id);
    expect(created.visible).toBe(true);
    expect(created.locked).toBe(false);
    expect(created.name).not.toBe(hidden.name);
    expect(created.name).not.toBe(editable.name);
  });

  it("duplicates a layer and its items", () => {
    const project = makeProject();
    const source = layersForKind(project, "measure")[0];
    addItem(project, source.id, makeItem("item_a"));
    const copy = duplicateLayer(project, source.id);
    expect(copy).toBeDefined();
    expect(copy!.id).not.toBe(source.id);
    expect(copy!.items).toHaveLength(1);
    expect(copy!.items[0].id).not.toBe("item_a");
    expect(project.activeLayerId).toBe(copy!.id);
  });

  it("removes a layer and keeps a replacement of the same kind", () => {
    const project = makeProject();
    const source = layersForKind(project, "draw")[0];
    expect(removeLayer(project, source.id)).toBe(true);
    expect(layersForKind(project, "draw")).toHaveLength(1);
    expect(layersForKind(project, "draw")[0].id).not.toBe(source.id);
  });

  it("reorders and swaps layers only within a kind", () => {
    const project = makeProject();
    addLayer(project, "draw");
    addLayer(project, "draw");
    const [first, second, third] = layersForKind(project, "draw");
    expect(moveLayer(project, first.id, 1)).toBe(true);
    expect(layersForKind(project, "draw").map((layer) => layer.id)).toEqual([
      second.id,
      first.id,
      third.id,
    ]);
    expect(swapLayers(project, second.id, third.id)).toBe(true);
    expect(layersForKind(project, "draw").map((layer) => layer.id)).toEqual([
      third.id,
      first.id,
      second.id,
    ]);
    const measure = layersForKind(project, "measure")[0];
    expect(swapLayers(project, third.id, measure.id)).toBe(false);
  });

  it("adds, finds, moves, and removes items", () => {
    const project = makeProject();
    const measureA = layersForKind(project, "measure")[0];
    const measureB = addLayer(project, "measure");
    addItem(project, measureA.id, makeItem("item_a", 1));
    addItem(project, measureA.id, makeItem("item_b", 2));

    expect(findItem(project, "item_a")?.layer.id).toBe(measureA.id);
    expect(itemCountForPage(project, 2)).toBe(1);
    expect(moveItemToLayer(project, measureA.id, "item_a", measureB.id)).toBe(true);
    expect(findItem(project, "item_a")?.layer.id).toBe(measureB.id);
    expect(removeItem(project, measureB.id, "item_a")?.id).toBe("item_a");
    expect(findItem(project, "item_a")).toBeUndefined();
  });

  it("does not move items between measurement and drawing layers", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    const draw = layersForKind(project, "draw")[0];
    addItem(project, measure.id, makeItem("item_a"));
    expect(moveItemToLayer(project, measure.id, "item_a", draw.id)).toBe(false);
    expect(findItem(project, "item_a")?.layer.id).toBe(measure.id);
  });
});

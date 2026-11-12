import { describe, expect, it } from "vitest";
import {
  buildLayerTree,
  duplicateLayerSubtree,
  layerTreeDisplayOrder,
  layerDropPreview,
  layerMoveRejection,
  layerSubtreeSize,
  moveLayerOutOfGroup,
  moveLayersInTree,
  planLayerDeletion,
} from "../src/features/layerTree";
import { createProject, defaultDocument } from "../src/model/layers";
import type { Layer, MarkupItem, Project } from "../src/model/types";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

function makeProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
  project.layers[0].id = "layer_draw";
  project.layers[1].id = "layer_measure";
  project.activeLayerId = "layer_measure";
  return project;
}

function makeLayer(id: string, kind: Layer["kind"] = "measure"): Layer {
  return {
    id,
    name: id,
    kind,
    visible: true,
    locked: false,
    opacity: 1,
    color: kind === "measure" ? "#e30613" : "#f2a93b",
    items: [],
  };
}

function makeItem(id: string, page = 1): MarkupItem {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    pageId: pageIdFor(page),
    kind: "length",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    color: "#e30613",
    strokeWidth: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * `[draw, group, childA, grand, childB, rootA, rootB]` in array order.
 * `rootA` and `rootB` are loose roots that a move can pick up.
 */
function makeTree(): {
  project: Project;
  group: Layer;
  childA: Layer;
  childB: Layer;
  grand: Layer;
  rootA: Layer;
  rootB: Layer;
} {
  const project = makeProject();
  const group = makeLayer("layer_group");
  const childA = makeLayer("layer_a");
  const childB = makeLayer("layer_b");
  const grand = makeLayer("layer_grand");
  const rootA = makeLayer("layer_root_a");
  const rootB = makeLayer("layer_root_b");
  childA.parentId = group.id;
  childB.parentId = group.id;
  grand.parentId = childA.id;
  project.layers = [project.layers[0], group, childA, grand, childB, rootA, rootB];
  project.activeLayerId = group.id;
  return { project, group, childA, childB, grand, rootA, rootB };
}

function parentLinks(project: Project): Record<string, string | undefined> {
  return Object.fromEntries(project.layers.map((layer) => [layer.id, layer.parentId]));
}

describe("layer tree moves", () => {
  it("nests a layer without restacking it", () => {
    const { project, group, rootA } = makeTree();
    const before = project.layers.map((layer) => layer.id);
    expect(moveLayersInTree(project, [rootA.id], { mode: "inside", targetId: group.id })).toBe(
      true,
    );
    expect(parentLinks(project)[rootA.id]).toBe(group.id);
    // Grouping never moves a layer in front of or behind its siblings.
    expect(project.layers.map((layer) => layer.id)).toEqual(before);
  });

  it("refuses a self drop, a cycle and a cross-kind drop", () => {
    const { project, group, childA, grand } = makeTree();
    expect(layerMoveRejection(project, [group.id], { mode: "inside", targetId: group.id })).toBe(
      "self",
    );
    expect(layerMoveRejection(project, [group.id], { mode: "inside", targetId: grand.id })).toBe(
      "cycle",
    );
    expect(layerMoveRejection(project, [group.id], { mode: "above", targetId: grand.id })).toBe(
      "cycle",
    );
    // A drawing layer cannot become the parent of a measurement layer.
    expect(
      layerMoveRejection(project, [childA.id], { mode: "inside", targetId: "layer_draw" }),
    ).toBe("kind");
    expect(moveLayersInTree(project, [group.id], { mode: "inside", targetId: grand.id })).toBe(
      false,
    );
    expect(parentLinks(project)[group.id]).toBeUndefined();
  });

  it("reorders and reparents on an above or below drop", () => {
    const { project, childA, childB } = makeTree();
    expect(moveLayersInTree(project, [childB.id], { mode: "below", targetId: childA.id })).toBe(
      true,
    );
    expect(parentLinks(project)[childB.id]).toBe(childA.parentId);
    expect(project.layers.map((layer) => layer.id)).toEqual([
      "layer_draw",
      "layer_group",
      "layer_b",
      "layer_a",
      "layer_grand",
      "layer_root_a",
      "layer_root_b",
    ]);
  });

  it("moves a layer out of its group as a sibling after the former parent", () => {
    const { project, childA } = makeTree();
    expect(moveLayerOutOfGroup(project, childA.id)).toBe(true);
    expect(parentLinks(project)[childA.id]).toBeUndefined();
    const tree = buildLayerTree(project);
    expect(tree.byId.get(childA.id)?.parentId).toBeNull();
    // The panel shows it below its former parent's subtree, as a root.
    const display = layerTreeDisplayOrder(project);
    expect(display.indexOf(childA.id)).toBeGreaterThan(display.indexOf("layer_group"));
  });

  it("keeps page scope untouched when a layer is nested or reordered", () => {
    const { project, group, childB } = makeTree();
    childB.homePageId = pageIdFor(1);
    childB.pageState = { [pageIdFor(1)]: { visible: false } };
    moveLayersInTree(project, [childB.id], { mode: "inside", targetId: group.id });
    moveLayersInTree(project, [childB.id], { mode: "below", targetId: group.id });
    const moved = project.layers.find((layer) => layer.id === childB.id)!;
    expect(moved.homePageId).toBe(pageIdFor(1));
    expect(moved.pageState).toEqual({ [pageIdFor(1)]: { visible: false } });
  });

  it("moves several layers in one call and reports no change for a no-op", () => {
    const { project, group, childA, rootA, rootB } = makeTree();
    expect(
      moveLayersInTree(project, [rootA.id, rootB.id], { mode: "inside", targetId: group.id }),
    ).toBe(true);
    expect(parentLinks(project)[rootA.id]).toBe(group.id);
    expect(parentLinks(project)[rootB.id]).toBe(group.id);
    // The existing nesting is untouched.
    expect(parentLinks(project)[childA.id]).toBe(group.id);
    // Repeating the same nesting changes nothing, so the caller adds no undo step.
    expect(
      moveLayersInTree(project, [rootA.id, rootB.id], { mode: "inside", targetId: group.id }),
    ).toBe(false);
  });
});

describe("layer subtree duplication", () => {
  it("copies the subtree with fresh ids and remapped parents", () => {
    const { project, group, childA, grand, childB } = makeTree();
    grand.items.push(makeItem("item_grand"));
    const sourceIds = [group.id, childA.id, grand.id, childB.id];
    const copy = duplicateLayerSubtree(project, group.id)!;
    expect(copy.root.name).toBe("layer_group copy");
    const copies = copy.layers;
    expect(copies).toHaveLength(sourceIds.length);
    expect(new Set(copies.map((layer) => layer.id)).size).toBe(sourceIds.length);
    for (const original of sourceIds) {
      expect(copies.some((layer) => layer.id === original)).toBe(false);
    }
    // The copy root keeps the source's parent; every copied child points inside
    // the copy, never back at the original subtree.
    expect(copies[0].parentId).toBeUndefined();
    for (const layer of copies.slice(1)) {
      expect(layer.parentId).toBeDefined();
      expect(copies.some((entry) => entry.id === layer.parentId)).toBe(true);
    }
    const copiedGrand = copies.find(
      (layer) => layer.parentId !== copies[0].id && layer.items.length,
    );
    expect(copiedGrand?.items).toHaveLength(1);
    expect(copiedGrand?.items[0].id).not.toBe("item_grand");
    expect(project.activeLayerId).toBe(copies[0].id);
    // The source subtree is untouched and the copies sit next to it.
    expect(project.layers.filter((layer) => sourceIds.includes(layer.id))).toHaveLength(
      sourceIds.length,
    );
    expect(project.layers.map((layer) => layer.id).slice(1, 5)).toEqual(sourceIds);
  });

  it("reports the subtree size that a delete would remove", () => {
    const { project, group, childA, grand, childB } = makeTree();
    group.items.push(makeItem("item_group"));
    childA.items.push(makeItem("item_a"), makeItem("item_a2", 2));
    grand.items.push(makeItem("item_grand"));
    const size = layerSubtreeSize(project, group.id);
    const plan = planLayerDeletion(project, group.id)!;
    expect(size).toEqual({ layers: plan.layerIds.length, items: plan.itemCount });
    expect(size.layers).toBe(4);
    expect(size.items).toBe(4);
    expect(plan.layerIds).toEqual([group.id, childA.id, grand.id, childB.id]);
  });
});

describe("layer drop preview", () => {
  const rows = [
    { id: "layer_a", top: 0, bottom: 20 },
    { id: "layer_b", top: 20, bottom: 40 },
  ];

  it("splits one row into before, nest and after zones", () => {
    const { project, childB } = makeTree();
    const before = layerDropPreview(project, [childB.id], rows, 3)!;
    expect(before.plan).toEqual({ mode: "above", targetId: "layer_a" });
    expect(before.feedback).toBe("move");
    expect(before.insertionIndex).toBe(0);

    const inside = layerDropPreview(project, [childB.id], rows, 10)!;
    expect(inside.plan).toEqual({ mode: "inside", targetId: "layer_a" });
    expect(inside.feedback).toBe("nest");
    expect(inside.highlightId).toBe("layer_a");

    const after = layerDropPreview(project, [childB.id], rows, 18)!;
    expect(after.plan).toEqual({ mode: "below", targetId: "layer_a" });
    expect(after.insertionIndex).toBe(1);
  });

  it("marks a rejected drop instead of planning it", () => {
    const { project, grand } = makeTree();
    const unknown = layerDropPreview(
      project,
      ["layer_group"],
      [{ id: "layer_missing", top: 0, bottom: 20 }],
      10,
    )!;
    expect(unknown.feedback).toBe("reject");
    expect(unknown.rejection).toBe("unknown");
    const preview = layerDropPreview(project, ["layer_group"], rows, 10)!;
    expect(preview.feedback).toBe("reject");
    expect(preview.rejection).toBe("cycle");
    const cycle = layerDropPreview(
      project,
      ["layer_group"],
      [{ id: grand.id, top: 0, bottom: 20 }],
      10,
    )!;
    expect(cycle.feedback).toBe("reject");
    expect(cycle.rejection).toBe("cycle");
  });
});

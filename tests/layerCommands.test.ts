// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  clearLayerItemsOnPage,
  deleteLayer,
  moveLayerWithinKind,
  renameLayer,
  setLayerColor,
  setLayersLockedOnPage,
  setLayersVisibleOnPage,
  setLayerLockedOnPage,
  setLayerVisibleOnPage,
} from "../src/model/commands/layers";
import { buildLayerHierarchy, layerEffectiveState } from "../src/model/layerHierarchy";
import {
  addLayer,
  createProject,
  defaultDocument,
  layerLockedOnPage,
  layerVisibleOnPage,
  layersForKind,
} from "../src/model/layers";
import type { Layer, MarkupItem, Project } from "../src/model/types";
import { Store } from "../src/state/store";
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

describe("layer rename and colour", () => {
  it("renames a layer and ignores empty or unchanged names", () => {
    const project = makeProject();
    const layer = project.layers[1];
    expect(renameLayer(project, layer.id, "  Ground floor  ")).toBe(true);
    expect(layer.name).toBe("Ground floor");
    expect(renameLayer(project, layer.id, "Ground floor")).toBe(false);
    expect(renameLayer(project, layer.id, "   ")).toBe(false);
    expect(layer.name).toBe("Ground floor");
    expect(renameLayer(project, "missing", "Other")).toBe(false);
  });

  it("applies a canonical colour to the layer and all its items", () => {
    const project = makeProject();
    const layer = project.layers[1];
    layer.items.push(makeItem("item_a"), makeItem("item_b"));
    expect(setLayerColor(project, layer.id, "#ABC")).toBe(true);
    expect(layer.color).toBe("#aabbcc");
    expect(layer.items.map((item) => item.color)).toEqual(["#aabbcc", "#aabbcc"]);
  });

  it("rejects an invalid colour instead of storing black", () => {
    const project = makeProject();
    const layer = project.layers[1];
    const original = layer.color;
    expect(setLayerColor(project, layer.id, "not-a-colour")).toBe(false);
    expect(layer.color).toBe(original);
    expect(setLayerColor(project, "missing", "#ffffff")).toBe(false);
  });
});

describe("page-scoped layer state", () => {
  it("sets and clears visibility and locking on one page only", () => {
    const project = makeProject();
    const layer = project.layers[1];

    expect(setLayerVisibleOnPage(project, layer.id, pageIdFor(2), false)).toBe(true);
    expect(setLayerLockedOnPage(project, layer.id, pageIdFor(2), true)).toBe(true);
    expect(layerVisibleOnPage(layer, pageIdFor(1))).toBe(true);
    expect(layerVisibleOnPage(layer, pageIdFor(2))).toBe(false);
    expect(layerLockedOnPage(layer, pageIdFor(1))).toBe(false);
    expect(layerLockedOnPage(layer, pageIdFor(2))).toBe(true);

    expect(setLayerVisibleOnPage(project, layer.id, pageIdFor(2), true)).toBe(true);
    expect(setLayerLockedOnPage(project, layer.id, pageIdFor(2), false)).toBe(true);
    expect(layer.pageState).toBeUndefined();
    expect(setLayerVisibleOnPage(project, "missing", pageIdFor(2), false)).toBe(false);
    expect(setLayerLockedOnPage(project, "missing", pageIdFor(2), true)).toBe(false);
  });

  it("resolves inherited visibility through the group", () => {
    const project = makeProject();
    const group = makeLayer("layer_group");
    const child = makeLayer("layer_child");
    child.parentId = group.id;
    project.layers = [project.layers[0], group, child];
    const hierarchy = buildLayerHierarchy(project.layers);

    group.visible = false;
    // Revealing the child on the page cannot bypass a hidden group.
    expect(setLayerVisibleOnPage(project, child.id, pageIdFor(1), true)).toBe(true);
    expect(layerVisibleOnPage(child, pageIdFor(1), hierarchy)).toBe(false);
    expect(layerEffectiveState(hierarchy, child.id, pageIdFor(1))?.hiddenBy).toBe(group.id);

    group.visible = true;
    expect(layerVisibleOnPage(child, pageIdFor(1), hierarchy)).toBe(true);
  });

  it("resolves inherited locking through the group", () => {
    const project = makeProject();
    const group = makeLayer("layer_group");
    const child = makeLayer("layer_child");
    child.parentId = group.id;
    project.layers = [project.layers[0], group, child];
    const hierarchy = buildLayerHierarchy(project.layers);

    group.locked = true;
    // A child cannot unlock itself while an ancestor is locked.
    expect(setLayerLockedOnPage(project, child.id, pageIdFor(1), false)).toBe(true);
    expect(layerLockedOnPage(child, pageIdFor(1), hierarchy)).toBe(true);
    expect(layerEffectiveState(hierarchy, child.id, pageIdFor(1))?.lockedBy).toBe(group.id);

    group.locked = false;
    expect(layerLockedOnPage(child, pageIdFor(1), hierarchy)).toBe(false);
  });

  it("applies one batch visibility and locking edit to every selected layer", () => {
    const project = makeProject();
    const first = addLayer(project, "measure");
    const second = addLayer(project, "measure");
    const ids = [first.id, second.id];

    expect(setLayersVisibleOnPage(project, ids, pageIdFor(2), false)).toBe(2);
    expect(
      ids.map((id) =>
        layerVisibleOnPage(
          project.layers.find((l) => l.id === id)!,
          pageIdFor(2),
        ),
      ),
    ).toEqual([false, false]);
    expect(setLayersLockedOnPage(project, ids, pageIdFor(2), true)).toBe(2);
    expect(
      ids.map((id) =>
        layerLockedOnPage(
          project.layers.find((l) => l.id === id)!,
          pageIdFor(2),
        ),
      ),
    ).toEqual([true, true]);
    expect(setLayersVisibleOnPage(project, ["missing"], pageIdFor(2), false)).toBe(0);
  });
});

describe("layer item clearing and deletion", () => {
  it("clears only the items of one page", () => {
    const project = makeProject();
    const layer = project.layers[1];
    layer.items.push(makeItem("page_one", 1), makeItem("page_two_a", 2), makeItem("page_two_b", 2));

    expect(clearLayerItemsOnPage(project, layer.id, pageIdFor(2))).toBe(2);
    expect(layer.items.map((item) => item.id)).toEqual(["page_one"]);
    expect(clearLayerItemsOnPage(project, layer.id, pageIdFor(2))).toBe(0);
    expect(clearLayerItemsOnPage(project, "missing", pageIdFor(2))).toBe(0);
  });

  it("deletes a layer subtree and keeps an unrelated sibling", () => {
    const project = makeProject();
    const group = makeLayer("layer_group");
    const child = makeLayer("layer_child");
    child.parentId = group.id;
    child.items.push(makeItem("item_child"));
    const sibling = makeLayer("layer_sibling");
    project.layers = [project.layers[0], group, child, sibling];
    project.activeLayerId = child.id;

    expect(deleteLayer(project, group.id)).toBe(true);
    expect(project.layers.map((layer) => layer.id)).toEqual([project.layers[0].id, sibling.id]);
    expect(project.layers.some((layer) => layer.id === child.id)).toBe(false);
    expect(project.activeLayerId).toBe(sibling.id);
    expect(deleteLayer(project, group.id)).toBe(false);
  });
});

describe("layer order", () => {
  it("moves a layer within its kind and stops at the boundary", () => {
    const project = makeProject();
    const second = addLayer(project, "measure");
    const third = addLayer(project, "measure");
    const order = () => layersForKind(project, "measure").map((layer) => layer.id);
    const before = order();

    expect(moveLayerWithinKind(project, before[0], 1)).toBe(true);
    expect(order()).toEqual([before[1], before[0], before[2]]);
    expect(moveLayerWithinKind(project, third.id, 1)).toBe(false);
    expect(moveLayerWithinKind(project, second.id, -1)).toBe(false);

    const kinds = project.layers.map((layer) => layer.kind);
    expect(kinds.indexOf("measure")).toBe(kinds.lastIndexOf("draw") + 1);
  });
});

describe("one layer action is one undo step", () => {
  it("restores a bulk visibility edit with one undo", () => {
    const project = makeProject();
    const first = addLayer(project, "measure");
    const second = addLayer(project, "measure");
    const ids = [first.id, second.id];
    const store = new Store();
    store.setProject(project, null);

    store.mutate((current) => {
      setLayersVisibleOnPage(current, ids, pageIdFor(2), false);
    }, "layers");
    const hidden = (id: string) =>
      layerVisibleOnPage(
        store.project!.layers.find((l) => l.id === id)!,
        pageIdFor(2),
      );
    expect(ids.map(hidden)).toEqual([false, false]);

    store.undo();
    expect(ids.map(hidden)).toEqual([true, true]);
    expect(store.canUndo).toBe(false);
  });
});

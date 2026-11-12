import { describe, expect, it } from "vitest";
import { deleteItems, setItemsLocked, setItemsVisible } from "../src/model/commands";
import { validateProject } from "../src/model/integrity";
import {
  buildLayerHierarchy,
  layerAncestorIds,
  layerDescendantIds,
  layerEffectiveState,
  layerIdsKeptAfterPageRemoval,
  layerTreeDepth,
} from "../src/model/layerHierarchy";
import {
  addItem,
  createProject,
  defaultDocument,
  duplicateLayer,
  findItem,
  layerLockedOnPage,
  layerVisibleOnPage,
  removeLayer,
} from "../src/model/layers";
import { serializeProject } from "../src/io/projectFile";
import type { Layer, MarkupItem, Project } from "../src/model/types";
import { deletePage } from "../src/features/pageModel";
import {
  buildLayerTree,
  deleteLayerSubtree,
  layersAfterPageRemoval,
  layerTreeState,
  planLayerDeletion,
} from "../src/features/layerTree";
import { planRepair } from "../src/features/projectIntegrity/repairPlan";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

function makeProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
  const [draw, measure] = project.layers;
  draw.id = "layer_draw";
  measure.id = "layer_measure";
  project.activeLayerId = measure.id;
  return project;
}

function makeItem(project: Project, id: string, page = 1): MarkupItem {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    pageId: pageIdFor(page),
    kind: "length",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    categoryId: project.settings.quantity.defaultCategoryId,
    createdAt: now,
    updatedAt: now,
  };
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

/** Three-level tree: group -> c1 -> gc, and group -> c2. */
function makeTree(): { project: Project; group: Layer; c1: Layer; gc: Layer; c2: Layer } {
  const project = makeProject();
  const group = makeLayer("layer_group");
  const c1 = makeLayer("layer_c1");
  const c2 = makeLayer("layer_c2");
  const gc = makeLayer("layer_gc");
  c1.parentId = group.id;
  c2.parentId = group.id;
  gc.parentId = c1.id;
  project.layers = [project.layers[0], group, c1, gc, c2];
  project.activeLayerId = group.id;
  return { project, group, c1, gc, c2 };
}

function errorCodes(project: Project): string[] {
  return validateProject(project)
    .filter((entry) => entry.severity === "error")
    .map((entry) => entry.code);
}

describe("layer hierarchy", () => {
  it("keeps a flat project flat: array order, own state, no parentId", () => {
    const project = makeProject();
    const hierarchy = buildLayerHierarchy(project.layers);
    expect(hierarchy.treeOrderIds).toEqual(project.layers.map((layer) => layer.id));
    expect(hierarchy.rootIds).toEqual(project.layers.map((layer) => layer.id));
    expect(hierarchy.issues).toEqual([]);
    for (const layer of project.layers) {
      expect(layerTreeDepth(hierarchy, layer.id)).toBe(0);
      const state = layerEffectiveState(hierarchy, layer.id, pageIdFor(1))!;
      expect(state.visible).toBe(layerVisibleOnPage(layer, pageIdFor(1)));
      expect(state.locked).toBe(layerLockedOnPage(layer, pageIdFor(1)));
      expect(state.hiddenBy).toBeNull();
      expect(state.lockedBy).toBeNull();
    }
    expect(serializeProject(project)).not.toContain("parentId");
  });

  it("walks tree order depth-first with siblings in array order", () => {
    const { project } = makeTree();
    const hierarchy = buildLayerHierarchy(project.layers);
    expect(hierarchy.treeOrderIds).toEqual([
      "layer_draw",
      "layer_group",
      "layer_c1",
      "layer_gc",
      "layer_c2",
    ]);
    expect(layerAncestorIds(hierarchy, "layer_gc")).toEqual(["layer_c1", "layer_group"]);
    expect(layerDescendantIds(hierarchy, "layer_group")).toEqual([
      "layer_c1",
      "layer_gc",
      "layer_c2",
    ]);
    expect(layerTreeDepth(hierarchy, "layer_gc")).toBe(2);
    expect(buildLayerTree(project).order).toEqual(hierarchy.treeOrderIds);
  });

  it("hides a subtree when an ancestor is hidden", () => {
    const { project, group, gc } = makeTree();
    group.visible = false;
    const hierarchy = buildLayerHierarchy(project.layers);
    const state = layerEffectiveState(hierarchy, gc.id, pageIdFor(1))!;
    expect(state.visible).toBe(false);
    expect(state.hiddenBy).toBe(group.id);
    // The layer's own flag did not change.
    expect(gc.visible).toBe(true);
    // Showing the child's own flag cannot override the hidden ancestor.
    gc.visible = true;
    expect(layerEffectiveState(hierarchy, gc.id, pageIdFor(1))!.visible).toBe(false);
  });

  it("locks a subtree when any ancestor is locked, without hiding it", () => {
    const { project, group, c1, gc } = makeTree();
    c1.locked = true;
    const hierarchy = buildLayerHierarchy(project.layers);
    expect(layerEffectiveState(hierarchy, gc.id, pageIdFor(1))).toMatchObject({
      visible: true,
      locked: true,
      lockedBy: c1.id,
    });
    expect(layerEffectiveState(hierarchy, group.id, pageIdFor(1))!.locked).toBe(false);
    expect(layerEffectiveState(hierarchy, c1.id, pageIdFor(1))!.lockedBy).toBe(c1.id);
  });

  it("applies page overrides per page through the whole chain", () => {
    const { project, group, gc } = makeTree();
    group.pageState = { [pageIdFor(2)]: { visible: false } };
    const hierarchy = buildLayerHierarchy(project.layers);
    expect(layerEffectiveState(hierarchy, gc.id, pageIdFor(1))!.visible).toBe(true);
    expect(layerEffectiveState(hierarchy, gc.id, pageIdFor(2))!.visible).toBe(false);
    expect(layerEffectiveState(hierarchy, gc.id, pageIdFor(2))!.hiddenBy).toBe(group.id);
    // A page scope is not a visibility signal by itself.
    expect(layerTreeState(project, gc.id, pageIdFor(2))!.visible).toBe(false);
    expect(layerTreeState(project, gc.id, pageIdFor(1))!.visible).toBe(true);
  });

  it("resolves a group's own items against its own and ancestor state", () => {
    const { project, group } = makeTree();
    const root = makeLayer("layer_root");
    root.visible = false;
    group.parentId = root.id;
    group.items.push(makeItem(project, "item_group"));
    project.layers = [root, ...project.layers];
    const hierarchy = buildLayerHierarchy(project.layers);
    const state = layerEffectiveState(hierarchy, group.id, pageIdFor(1))!;
    expect(state.visible).toBe(false);
    expect(state.hiddenBy).toBe(root.id);
  });

  it("reports a missing parent, a cross-kind parent, a self parent and a cycle", () => {
    const cases: Array<{ mutate: (layers: Layer[]) => void; code: string; ids: string[] }> = [
      {
        code: "missingLayerParent",
        ids: ["layer_measure"],
        mutate: (layers) => {
          layers.find((layer) => layer.id === "layer_measure")!.parentId = "layer_missing";
        },
      },
      {
        code: "layerParentKindMismatch",
        ids: ["layer_measure"],
        mutate: (layers) => {
          layers.find((layer) => layer.id === "layer_measure")!.parentId = "layer_draw";
        },
      },
      {
        code: "layerParentCycle",
        ids: ["layer_measure"],
        mutate: (layers) => {
          layers.find((layer) => layer.id === "layer_measure")!.parentId = "layer_measure";
        },
      },
    ];
    for (const entry of cases) {
      const project = makeProject();
      entry.mutate(project.layers);
      const hierarchy = buildLayerHierarchy(project.layers);
      expect(hierarchy.issues.map((issue) => [issue.code, issue.layerId])).toContainEqual([
        entry.code,
        entry.ids[0],
      ]);
      // Every layer survives and the broken link resolves to a root.
      expect(hierarchy.treeOrderIds).toHaveLength(project.layers.length);
      expect(hierarchy.parentOfId.get(entry.ids[0])).toBeNull();
      expect(errorCodes(project)).toContain(entry.code);
    }
  });

  it("cuts a two-layer cycle into roots and still resolves state", () => {
    const { project, group, c1 } = makeTree();
    c1.parentId = group.id;
    group.parentId = c1.id;
    const hierarchy = buildLayerHierarchy(project.layers);
    expect(hierarchy.issues.filter((issue) => issue.code === "layerParentCycle")).toEqual([
      { code: "layerParentCycle", layerId: group.id },
      { code: "layerParentCycle", layerId: c1.id },
    ]);
    expect(hierarchy.rootIds).toContain(group.id);
    expect(hierarchy.rootIds).toContain(c1.id);
    expect(layerEffectiveState(hierarchy, "layer_gc", pageIdFor(1))!.visible).toBe(true);
    expect(errorCodes(project)).toEqual(
      expect.arrayContaining(["layerParentCycle", "layerParentCycle"]),
    );
  });

  it("keeps inherited locking and hiding effective for item commands", () => {
    const { project, group, c1 } = makeTree();
    const item = makeItem(project, "item_a");
    addItem(project, c1.id, item);
    group.locked = true;
    expect(deleteItems(project, [{ layerId: c1.id, itemId: item.id }]).skippedLocked).toBe(1);
    expect(findItem(project, item.id)).toBeDefined();
    expect(
      setItemsLocked(project, [{ layerId: c1.id, itemId: item.id }], false).skippedLayerLocked,
    ).toBe(1);

    group.locked = false;
    group.visible = false;
    expect(
      setItemsVisible(project, [{ layerId: c1.id, itemId: item.id }], true).skippedLayerHidden,
    ).toBe(1);
  });

  it("plans and deletes a whole subtree", () => {
    const { project, group, c1, gc, c2 } = makeTree();
    addItem(project, group.id, makeItem(project, "item_group"));
    addItem(project, c1.id, makeItem(project, "item_c1"));
    addItem(project, gc.id, makeItem(project, "item_gc"));
    addItem(project, c2.id, makeItem(project, "item_c2"));
    project.activeLayerId = gc.id;

    const plan = planLayerDeletion(project, group.id)!;
    expect(plan.layerIds).toEqual([group.id, c1.id, gc.id, c2.id]);
    expect(plan.childCount).toBe(3);
    expect(plan.itemCount).toBe(4);

    expect(deleteLayerSubtree(project, group.id)).toEqual(plan);
    expect(project.layers[0].id).toBe("layer_draw");
    expect(project.layers).toHaveLength(2);
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    expect(measure.id).not.toBe(group.id);
    expect(measure.parentId).toBeUndefined();
    expect(findItem(project, "item_gc")).toBeUndefined();
    expect(project.activeLayerId).toBe(measure.id);
  });

  it("cascades a direct removeLayer call so no child is orphaned", () => {
    const { project, group, c1, gc } = makeTree();
    removeLayer(project, group.id);
    expect(project.layers.some((layer) => [group.id, c1.id, gc.id].includes(layer.id))).toBe(false);
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    expect(measure).toBeDefined();
    expect(project.activeLayerId).toBe(measure.id);
  });

  it("keeps duplicateLayer a sibling of its source", () => {
    const { project, group, c1 } = makeTree();
    const copy = duplicateLayer(project, c1.id)!;
    expect(copy.parentId).toBe(group.id);
    expect(copy.id).not.toBe(c1.id);
  });

  it("keeps a group alive while any descendant is referenced", () => {
    const { project, group, c1, c2 } = makeTree();
    const hierarchy = buildLayerHierarchy(project.layers);
    const referenced = new Set([c2.id]);
    const kept = layerIdsKeptAfterPageRemoval(hierarchy, referenced);
    expect(kept.has(group.id)).toBe(true);
    expect(kept.has(c1.id)).toBe(false);
    const layers = layersAfterPageRemoval(project.layers, (layer) => referenced.has(layer.id));
    expect(layers.map((layer) => layer.id)).toEqual([group.id, c2.id]);
  });

  it("cascades a page delete through page-scoped children without orphaning", () => {
    const { project, group, c1, c2 } = makeTree();
    group.homePageId = pageIdFor(1);
    c1.homePageId = pageIdFor(1);
    c2.homePageId = pageIdFor(2);
    addItem(project, c1.id, makeItem(project, "item_page_1", 1));
    addItem(project, c2.id, makeItem(project, "item_page_2", 2));

    deletePage(project, pageIdFor(1));

    expect(findItem(project, "item_page_1")).toBeUndefined();
    expect(findItem(project, "item_page_2")).toBeDefined();
    const surviving = project.layers.map((layer) => layer.id);
    expect(surviving).toContain(group.id);
    expect(surviving).toContain(c2.id);
    expect(surviving).not.toContain(c1.id);
    for (const layer of project.layers) {
      if (layer.parentId) expect(surviving).toContain(layer.parentId);
    }
    expect(project.layers.find((layer) => layer.id === group.id)?.homePageId).toBeUndefined();
  });

  it("removes an unreferenced subtree with its last page reference", () => {
    const { project, group, c1, c2 } = makeTree();
    group.homePageId = pageIdFor(1);
    c1.homePageId = pageIdFor(1);
    c2.homePageId = pageIdFor(1);
    addItem(project, c1.id, makeItem(project, "item_page_1", 1));

    deletePage(project, pageIdFor(1));

    const surviving = project.layers.map((layer) => layer.id);
    expect(surviving).not.toContain(group.id);
    expect(surviving).not.toContain(c1.id);
    expect(surviving).not.toContain(c2.id);
    expect(project.layers.every((layer) => layer.parentId === undefined)).toBe(true);
  });
});

describe("layer hierarchy repair", () => {
  it("clears a broken parent link without deleting the layer", () => {
    const project = makeProject();
    const measure = project.layers.find((layer) => layer.id === "layer_measure")!;
    measure.parentId = "layer_missing";
    expect(errorCodes(project)).toContain("missingLayerParent");

    const run = planRepair(project, ["danglingReferences"]);
    expect(run.plan.changes).toContainEqual(
      expect.objectContaining({
        scope: "layer",
        id: "layer_measure",
        reason: "missingLayerParent",
      }),
    );
    expect(run.project.layers).toHaveLength(project.layers.length);
    expect(run.project.layers.find((layer) => layer.id === "layer_measure")?.parentId).toBe(
      undefined,
    );
    expect(errorCodes(run.project)).not.toContain("missingLayerParent");
  });

  it("cuts a cycle deterministically", () => {
    const project = makeProject();
    const measure = project.layers.find((layer) => layer.id === "layer_measure")!;
    const draw = project.layers.find((layer) => layer.id === "layer_draw")!;
    measure.parentId = draw.id;
    draw.parentId = measure.id;
    const first = planRepair(project, ["danglingReferences"]);
    const second = planRepair(project, ["danglingReferences"]);
    expect(first.plan).toEqual(second.plan);
    expect(first.project.layers.map((layer) => layer.parentId)).toEqual([undefined, undefined]);
    expect(errorCodes(first.project)).not.toContain("layerParentCycle");
  });
});

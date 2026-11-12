import { describe, expect, it } from "vitest";
import {
  buildLayerTreeRows,
  layerAncestorRowIds,
  layerRowsWithChildren,
  layerSiblingIds,
  layerTreeDisplayOrder,
} from "../src/features/layerTree";
import { createProject, defaultDocument, layerAppliesToPage } from "../src/model/layers";
import type { Layer, MarkupItem, Project } from "../src/model/types";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

function makeProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 3)));
  const [draw, measure] = project.layers;
  draw.id = "layer_draw";
  measure.id = "layer_measure";
  project.activeLayerId = measure.id;
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

/** Array order is bottom to top: draw first, then measure layers. */
function makeTree(): {
  project: Project;
  group: Layer;
  childA: Layer;
  childB: Layer;
  grand: Layer;
} {
  const project = makeProject();
  const group = makeLayer("layer_group");
  const childA = makeLayer("layer_a");
  const childB = makeLayer("layer_b");
  const grand = makeLayer("layer_grand");
  childA.parentId = group.id;
  childB.parentId = group.id;
  grand.parentId = childA.id;
  project.layers = [project.layers[0], group, childA, grand, childB];
  project.activeLayerId = group.id;
  return { project, group, childA, childB, grand };
}

describe("layer tree view", () => {
  it("shows a flat project top to bottom, exactly like the flat list did", () => {
    const project = makeProject();
    expect(layerTreeDisplayOrder(project)).toEqual(["layer_measure", "layer_draw"]);
    const rows = buildLayerTreeRows(project, {
      scope: "all",
      pageId: pageIdFor(1),
      expanded: new Set(),
    });
    expect(rows.map((row) => row.id)).toEqual(["layer_measure", "layer_draw"]);
    expect(rows.every((row) => row.depth === 0)).toBe(true);
  });

  it("puts every parent above its children, siblings top to bottom", () => {
    const { project } = makeTree();
    expect(layerTreeDisplayOrder(project)).toEqual([
      "layer_group",
      "layer_b",
      "layer_a",
      "layer_grand",
      "layer_draw",
    ]);
    const rows = buildLayerTreeRows(project, {
      scope: "all",
      pageId: pageIdFor(1),
      expanded: new Set(["layer_group", "layer_a"]),
    });
    expect(rows.map((row) => row.id)).toEqual([
      "layer_group",
      "layer_b",
      "layer_a",
      "layer_grand",
      "layer_draw",
    ]);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 1, 2, 0]);
    expect(rows[0].childCount).toBe(2);
    expect(rows[0].descendantCount).toBe(3);
  });

  it("hides the subtree of a closed group and keeps the collapse state", () => {
    const { project } = makeTree();
    const closed = buildLayerTreeRows(project, {
      scope: "all",
      pageId: pageIdFor(1),
      expanded: new Set(),
    });
    expect(closed.map((row) => row.id)).toEqual(["layer_group", "layer_draw"]);
    expect(closed[0].expanded).toBe(false);
    expect(layerRowsWithChildren(closed)).toEqual(["layer_group"]);
    expect(layerRowsWithChildren(closed)).not.toContain("layer_a");
  });

  it("reports inherited hidden and locked state with the ancestor that causes it", () => {
    const { project, group, childA, grand } = makeTree();
    group.visible = false;
    group.locked = true;
    childA.visible = false;
    const rows = buildLayerTreeRows(project, {
      scope: "all",
      pageId: pageIdFor(1),
      expanded: new Set(["layer_group", "layer_a"]),
    });
    const groupRow = rows.find((row) => row.id === group.id)!;
    expect(groupRow.visible).toBe(false);
    expect(groupRow.inheritedHiddenBy).toBeNull();

    const childRow = rows.find((row) => row.id === childA.id)!;
    expect(childRow.visible).toBe(false);
    expect(childRow.locked).toBe(true);
    // The child is hidden by itself and locked by the group.
    expect(childRow.inheritedHiddenBy).toBeNull();
    expect(childRow.inheritedLockedBy).toBe(group.id);

    const grandRow = rows.find((row) => row.id === grand.id)!;
    expect(grandRow.visible).toBe(false);
    // The nearest hider is reported, so the panel names the direct reason.
    expect(grandRow.inheritedHiddenBy).toBe(childA.id);
    expect(grandRow.inheritedLockedBy).toBe(group.id);
  });

  it("resolves inherited state per page", () => {
    const { project, group, childB } = makeTree();
    group.homePageId = pageIdFor(1);
    group.items.push(makeItem("item_group", 2));
    childB.homePageId = pageIdFor(1);
    childB.items.push(makeItem("item_b", 2));
    group.pageState = { [pageIdFor(1)]: { visible: false } };
    const page = buildLayerTreeRows(project, {
      scope: "page",
      pageId: pageIdFor(1),
      expanded: new Set(["layer_group"]),
    });
    const child = page.find((row) => row.id === childB.id)!;
    expect(child.visible).toBe(false);
    expect(child.inheritedHiddenBy).toBe(group.id);

    const other = buildLayerTreeRows(project, {
      scope: "page",
      pageId: pageIdFor(2),
      expanded: new Set(["layer_group"]),
    });
    expect(other.find((row) => row.id === childB.id)?.visible).toBe(true);
  });

  it("keeps a group visible in page scope while a nested layer has page content", () => {
    const { project, group, childA } = makeTree();
    // The group has no items and no home page on page 2; its child does.
    group.homePageId = undefined;
    group.items = [];
    childA.items.push(makeItem("item_a", 2));
    expect(layerAppliesToPage(group, pageIdFor(2))).toBe(false);
    const rows = buildLayerTreeRows(project, {
      scope: "page",
      pageId: pageIdFor(2),
      expanded: new Set(["layer_group"]),
    });
    expect(rows.map((row) => row.id)).toContain(group.id);
    expect(rows.map((row) => row.id)).toContain(childA.id);
  });

  it("keeps the ancestor path of a search hit reachable", () => {
    const { project, grand } = makeTree();
    grand.name = "Radiator";
    const rows = buildLayerTreeRows(project, {
      scope: "all",
      pageId: pageIdFor(1),
      query: "radiator",
      matches: (layer) => layer.name.toLowerCase().includes("radiator"),
      expanded: new Set(),
    });
    expect(rows.map((row) => row.id)).toEqual(["layer_group", "layer_a", "layer_grand"]);
    // Search forces the path open without writing the collapse state.
    expect(rows.every((row) => row.expanded || !row.hasChildren)).toBe(true);
  });

  it("lists siblings in panel order and ancestors deepest first", () => {
    const { project, group, childA, childB } = makeTree();
    expect(layerSiblingIds(project, group.id)).toEqual(["layer_group", "layer_draw"]);
    expect(layerSiblingIds(project, childA.id)).toEqual(["layer_b", "layer_a"]);
    expect(layerSiblingIds(project, childB.id)).toEqual(["layer_b", "layer_a"]);
    expect(layerAncestorRowIds(project, "layer_grand")).toEqual(["layer_a", "layer_group"]);
  });
});

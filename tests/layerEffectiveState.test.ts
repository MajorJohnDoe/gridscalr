import { describe, expect, it } from "vitest";
import { hitTest } from "../src/model/hitTest";
import { calculateQuantities } from "../src/model/quantity";
import { markupTable } from "../src/report/rows";
import { createProject, defaultDocument, itemIsLocked, itemIsVisible } from "../src/model/layers";
import { buildLayerHierarchy } from "../src/model/layerHierarchy";
import type { Layer, MarkupItem, Project } from "../src/model/types";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

/**
 * Effective state in the paths that must respect a hierarchy: hit-testing,
 * quantities and the Markups CSV. ADR 0014 says a hidden group must not render,
 * hit-test or export, and a locked group stays visible and exportable but cannot
 * be edited.
 */

function makeProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
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
    color: "#e30613",
    items: [],
  };
}

function makeItem(project: Project, id: string, x: number): MarkupItem {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    pageId: pageIdFor(1),
    kind: "count",
    points: [{ x, y: 50 }],
    countType: "door",
    categoryId: project.settings.quantity.defaultCategoryId,
    color: "#e30613",
    strokeWidth: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function makeTree(): { project: Project; group: Layer; child: Layer; item: MarkupItem } {
  const project = makeProject();
  const group = makeLayer("layer_group");
  const child = makeLayer("layer_child");
  child.parentId = group.id;
  const item = makeItem(project, "item_child", 40);
  child.items.push(item);
  project.layers = [project.layers[0], group, child];
  return { project, group, child, item };
}

describe("effective layer state outside the panel", () => {
  it("does not hit-test items inside a hidden group", () => {
    const { project, group, item } = makeTree();
    expect(hitTest(project, pageIdFor(1), { x: 40, y: 50 }, 6)).toBeTruthy();
    group.visible = false;
    expect(hitTest(project, pageIdFor(1), { x: 40, y: 50 }, 6)).toBeNull();
    // The explicit include flags still see it, as they do for a hidden layer.
    expect(
      hitTest(project, pageIdFor(1), { x: 40, y: 50 }, 6, { includeHidden: true })?.item.id,
    ).toBe(item.id);
  });

  it("does not hit-test or edit items inside a locked group", () => {
    const { project, group, item, child } = makeTree();
    group.locked = true;
    expect(hitTest(project, pageIdFor(1), { x: 40, y: 50 }, 6)).toBeNull();
    expect(
      hitTest(project, pageIdFor(1), { x: 40, y: 50 }, 6, { includeLocked: true })?.item.id,
    ).toBe(item.id);
    const hierarchy = buildLayerHierarchy(project.layers);
    expect(itemIsLocked(item, child, hierarchy)).toBe(true);
    expect(itemIsVisible(item, child, hierarchy)).toBe(true);
  });

  it("excludes a hidden group's items from quantities and the markup table", () => {
    const { project, group } = makeTree();
    const countTotal = (project: Project): number =>
      calculateQuantities(project, { page: "all" }).totals.find((entry) => entry.type === "count")
        ?.net ?? 0;
    expect(countTotal(project)).toBeGreaterThan(0);
    expect(markupTable(project).length).toBeGreaterThan(1);

    group.visible = false;
    const hidden = calculateQuantities(project, { page: "all" });
    expect(countTotal(project)).toBe(0);
    expect(markupTable(project)).toHaveLength(1);
    // Quantities report the exclusion instead of silently dropping data.
    expect(hidden.hiddenExcluded).toBeGreaterThan(0);

    const included = calculateQuantities(project, { page: "all", includeHidden: true });
    expect(included.totals.find((entry) => entry.type === "count")?.net ?? 0).toBeGreaterThan(0);
  });
});

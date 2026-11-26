import { describe, expect, it } from "vitest";
import { createProject, defaultDocument } from "../src/model/layers";
import type { MarkupItem, Project } from "../src/model/types";
import { Store } from "../src/state/store";
import { withTestPageIds } from "./helpers/pages";

function makeProject(): Project {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
}

function makeStore(project = makeProject()): Store {
  const store = new Store();
  store.setProject(project, "/tmp/project-taxonomy/Plan.gridscalr", false);
  return store;
}

function measurement(pageId: string, categoryId: string): MarkupItem {
  return {
    id: "item_category",
    pageId,
    kind: "length",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    categoryId,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("category commands", () => {
  it("adds valid names as one undo step and refuses invalid ones", () => {
    const store = makeStore();
    const before = store.project!.categories.length;

    const created = store.addCategory("  External walls  ");

    expect(created).not.toBeNull();
    expect(created!.name).toBe("External walls");
    expect(store.project!.categories).toHaveLength(before + 1);
    expect(store.canUndo).toBe(true);

    const revision = store.revision;
    expect(store.addCategory("External walls")).toBeNull();
    expect(store.addCategory("   ")).toBeNull();
    expect(store.addCategory(store.project!.categories[0].name)).toBeNull();
    expect(store.revision).toBe(revision);

    store.undo();
    expect(store.project!.categories).toHaveLength(before);
  });

  it("renames, moves and bounds a category", () => {
    const store = makeStore();
    const [first, second] = store.project!.categories;

    expect(store.renameCategory(first.id, "  Basement  ")).toBe(true);
    expect(first.name).toBe("Basement");
    expect(store.canUndo).toBe(true);

    expect(store.renameCategory("cat_missing", "Nope")).toBe(false);
    expect(store.renameCategory(first.id, second.name)).toBe(false);

    expect(store.moveCategory(first.id, -1)).toBe(false);
    expect(store.moveCategory("cat_missing", 1)).toBe(false);
    expect(store.moveCategory(first.id, 1)).toBe(true);
    expect(store.project!.categories[1].id).toBe(first.id);

    const last = store.project!.categories[store.project!.categories.length - 1];
    expect(store.moveCategory(last.id, 1)).toBe(false);
  });

  it("removes a category, relocates items and refuses the last one", () => {
    const store = makeStore();
    const [first, second] = store.project!.categories;
    const measure = store.project!.layers.find((layer) => layer.kind === "measure")!;
    store.mutate((project) => {
      project.layers
        .find((layer) => layer.id === measure.id)!
        .items.push(measurement("page_1", first.id));
    });
    expect(store.categoryItemCount(first.id)).toBe(1);

    const result = store.removeCategory(first.id, second.id);
    expect(result.removed).toBe(true);
    expect(result.moved).toBe(1);
    expect(store.project!.categories.map((category) => category.id)).not.toContain(first.id);
    expect(store.categoryItemCount(second.id)).toBe(1);
    expect(store.categoryItemCount(first.id)).toBe(0);

    expect(store.removeCategory("cat_missing").reason).toBe("missing");

    store.project!.categories = [store.project!.categories[0]];
    expect(store.removeCategory(store.project!.categories[0].id).reason).toBe("last");
  });

  it("sets the default category without an empty undo step", () => {
    const store = makeStore();
    const [first, second] = store.project!.categories;
    store.setDefaultCategory(first.id);
    const revision = store.revision;

    expect(store.setDefaultCategory(first.id)).toBe(true);
    expect(store.revision).toBe(revision);
    expect(store.setDefaultCategory("cat_missing")).toBe(false);

    expect(store.setDefaultCategory(second.id)).toBe(true);
    expect(store.project!.settings.quantity.defaultCategoryId).toBe(second.id);
    expect(store.revision).toBe(revision + 1);
  });
});

describe("quantity settings commands", () => {
  it("clamps project defaults, refuses non-finite values and adds no no-op step", () => {
    const store = makeStore();

    expect(store.setQuantityDefaults({ wastePercent: Number.NaN })).toBe(false);
    expect(store.setQuantityDefaults({ roundingStep: Number.POSITIVE_INFINITY })).toBe(false);

    expect(store.setQuantityDefaults({ wastePercent: 150, roundingStep: -5 })).toBe(true);
    expect(store.project!.settings.quantity.wastePercent).toBe(100);
    expect(store.project!.settings.quantity.roundingStep).toBe(0);
    expect(store.canUndo).toBe(true);

    const revision = store.revision;
    expect(store.setQuantityDefaults({ wastePercent: 100, roundingStep: 0 })).toBe(true);
    expect(store.revision).toBe(revision);
  });

  it("clamps, clears and validates a category override", () => {
    const store = makeStore();
    const id = store.project!.categories[0].id;

    expect(store.setCategoryQuantityOverride(id, "wastePercent", 150)).toBe(true);
    expect(store.project!.categories[0].wastePercent).toBe(100);
    expect(store.setCategoryQuantityOverride(id, "roundingStep", -2)).toBe(true);
    expect(store.project!.categories[0].roundingStep).toBe(0);

    const revision = store.revision;
    expect(store.setCategoryQuantityOverride(id, "wastePercent", 100)).toBe(true);
    expect(store.revision).toBe(revision);

    expect(store.setCategoryQuantityOverride(id, "wastePercent", null)).toBe(true);
    expect(store.project!.categories[0].wastePercent).toBeUndefined();
    expect(store.setCategoryQuantityOverride("cat_missing", "wastePercent", 5)).toBe(false);
    expect(store.setCategoryQuantityOverride(id, "wastePercent", Number.NaN)).toBe(false);
  });

  it("adds one undo step for a changed facade edit and none for a no-op", () => {
    const store = makeStore();
    const categoryId = store.project!.categories[0].id;
    const before = store.revision;

    expect(store.setQuantityDefaults({ wastePercent: 0 })).toBe(true);
    expect(store.setCategoryQuantityOverride(categoryId, "wastePercent", 25)).toBe(true);
    expect(store.revision).toBe(before + 1);
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(store.project!.categories[0].wastePercent).toBeUndefined();
    expect(store.canUndo).toBe(false);
  });

  it("refuses every category and quantity edit while view-only", () => {
    const store = makeStore();
    store.setReadOnly(true);
    const categories = store.project!.categories.length;

    const firstName = store.project!.categories[0].name;
    expect(store.addCategory("New category")).toBeNull();
    // The facade reports a valid edit; the read-only guard is in the store write.
    expect(store.renameCategory(store.project!.categories[0].id, "Renamed")).toBe(true);
    expect(store.project!.categories[0].name).toBe(firstName);
    expect(store.setQuantityDefaults({ wastePercent: 20 })).toBe(true);
    expect(store.project!.settings.quantity.wastePercent).toBe(0);
    expect(store.project!.categories).toHaveLength(categories);
    expect(store.canUndo).toBe(false);
  });
});

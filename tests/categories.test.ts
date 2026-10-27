import { describe, expect, it } from "vitest";
import {
  addCategory,
  allRooms,
  categoryForItem,
  categoryNameError,
  countCategoryItems,
  createDefaultCategories,
  createDefaultQuantitySettings,
  defaultCategory,
  findCategory,
  measurementCategory,
  moveCategory,
  normalizeCategoryName,
  normalizeRoom,
  removeCategory,
  renameCategory,
  setDefaultCategory,
} from "../src/model/categories";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import type { ItemKind, MarkupItem, Project } from "../src/model/types";

const NOW = "2026-01-01T00:00:00.000Z";

function makeProject(): Project {
  return createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
}

function categoryId(project: Project, name: string): string {
  const category = project.categories.find((entry) => entry.name === name);
  if (!category) throw new Error(`Missing category ${name}`);
  return category.id;
}

function addItem(project: Project, kind: ItemKind, extra: Partial<MarkupItem> = {}): MarkupItem {
  const measureKinds = new Set<ItemKind>(["length", "area", "count"]);
  const layer = project.layers.find((entry) =>
    measureKinds.has(kind) ? entry.kind === "measure" : entry.kind === "draw",
  );
  if (!layer) throw new Error("Missing target layer");
  const item: MarkupItem = {
    id: `item_${layer.items.length + 1}`,
    page: 1,
    kind,
    points: [
      { x: 10, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
  layer.items.push(item);
  return item;
}

describe("categories", () => {
  it("creates the default category set with Other as project default", () => {
    const project = makeProject();
    expect(project.categories.map((entry) => entry.name)).toEqual([
      "Floor",
      "Wall",
      "Ceiling",
      "Facade",
      "Roof",
      "Ground",
      "Other",
    ]);
    expect(new Set(project.categories.map((entry) => entry.id)).size).toBe(7);
    expect(defaultCategory(project)?.name).toBe("Other");
    expect(project.settings.quantity).toEqual({
      defaultCategoryId: categoryId(project, "Other"),
      wastePercent: 0,
      roundingStep: 0,
    });
  });

  it("builds default quantity settings from any category list", () => {
    const categories = createDefaultCategories();
    const settings = createDefaultQuantitySettings(categories);
    expect(settings.defaultCategoryId).toBe(categories[categories.length - 1].id);
    expect(createDefaultQuantitySettings([{ id: "a", name: "Only" }]).defaultCategoryId).toBe("a");
  });

  it("trims and collapses category names", () => {
    expect(normalizeCategoryName("  Wet   rooms ")).toBe("Wet rooms");
    expect(normalizeCategoryName("\t\n")).toBe("");
  });

  it("validates names case-insensitively and allows the current name", () => {
    const project = makeProject();
    const floorId = categoryId(project, "Floor");
    expect(categoryNameError(project.categories, "")).toBe("Enter a category name.");
    expect(categoryNameError(project.categories, "x".repeat(41))).toMatch(/40 characters/);
    expect(categoryNameError(project.categories, "floor")).toMatch(/already exists/);
    expect(categoryNameError(project.categories, "  FLOOR ")).toMatch(/already exists/);
    expect(categoryNameError(project.categories, "Floor", floorId)).toBeNull();
    expect(categoryNameError(project.categories, "Wet rooms")).toBeNull();
  });

  it("adds and renames categories without changing ids", () => {
    const project = makeProject();
    const added = addCategory(project, "  Wet   rooms ");
    expect(added?.name).toBe("Wet rooms");
    expect(addCategory(project, "wet rooms")).toBeNull();

    const item = addItem(project, "area", { categoryId: added?.id, areaMode: "add" });
    const renamed = renameCategory(project, added!.id, "Bathrooms");
    expect(renamed).toBe(true);
    expect(findCategory(project, added!.id)?.name).toBe("Bathrooms");
    expect(item.categoryId).toBe(added!.id);

    expect(renameCategory(project, added!.id, "Floor")).toBe(false);
    expect(renameCategory(project, "missing", "Anything")).toBe(false);
  });

  it("reorders categories and stops at the edges", () => {
    const project = makeProject();
    const floorId = categoryId(project, "Floor");
    expect(moveCategory(project, floorId, -1)).toBe(false);
    expect(moveCategory(project, "missing", 1)).toBe(false);
    expect(moveCategory(project, floorId, 1)).toBe(true);
    expect(project.categories.slice(0, 2).map((entry) => entry.name)).toEqual(["Wall", "Floor"]);
  });

  it("moves the default when its category is deleted", () => {
    const project = makeProject();
    const otherId = categoryId(project, "Other");
    const groundId = categoryId(project, "Ground");
    const result = removeCategory(project, otherId, groundId);
    expect(result).toEqual({ removed: true, moved: 0 });
    expect(project.settings.quantity.defaultCategoryId).toBe(groundId);
    expect(findCategory(project, otherId)).toBeUndefined();
  });

  it("falls back to the first remaining category when no target is given", () => {
    const project = makeProject();
    const otherId = categoryId(project, "Other");
    const result = removeCategory(project, otherId);
    expect(result.removed).toBe(true);
    expect(project.settings.quantity.defaultCategoryId).toBe(project.categories[0].id);
  });

  it("reassigns measurements and leaves drawings alone when a category is deleted", () => {
    const project = makeProject();
    const wallId = categoryId(project, "Wall");
    const floorId = categoryId(project, "Floor");
    const measure = addItem(project, "area", { categoryId: wallId, areaMode: "add" });
    const count = addItem(project, "count", { categoryId: wallId, countType: "door" });
    const drawing = addItem(project, "rect", { categoryId: wallId });

    expect(countCategoryItems(project, wallId)).toBe(2);
    const result = removeCategory(project, wallId, floorId);
    expect(result).toEqual({ removed: true, moved: 2 });
    expect(measure.categoryId).toBe(floorId);
    expect(count.categoryId).toBe(floorId);
    expect(drawing.categoryId).toBe(wallId);
  });

  it("clears deleted categories from saved Markups views", () => {
    const project = makeProject();
    const wallId = categoryId(project, "Wall");
    const floorId = categoryId(project, "Floor");
    project.markupsViews = [
      {
        id: "view_wall",
        name: "Walls",
        columns: ["name", "room"],
        pageFilter: "all",
        typeFilter: "measure",
        categoryId: wallId,
        symbolCategory: null,
        search: "",
        groupBy: ["category"],
        sort: null,
      },
    ];
    removeCategory(project, wallId, floorId);
    expect(project.markupsViews[0].categoryId).toBeNull();
  });

  it("keeps at least one category", () => {
    const project = makeProject();
    project.categories = [project.categories[0]];
    project.settings.quantity.defaultCategoryId = project.categories[0].id;
    expect(removeCategory(project, project.categories[0].id)).toEqual({
      removed: false,
      moved: 0,
      reason: "last",
    });
    expect(removeCategory(project, "missing")).toEqual({
      removed: false,
      moved: 0,
      reason: "missing",
    });
  });

  it("resolves item categories with a fallback to the project default", () => {
    const project = makeProject();
    const item = addItem(project, "length", { categoryId: "deleted" });
    expect(categoryForItem(project, item)?.name).toBe("Other");
    item.categoryId = categoryId(project, "Roof");
    expect(categoryForItem(project, item)?.name).toBe("Roof");
  });

  it("resolves the next measurement category and falls back when it is gone", () => {
    const project = makeProject();
    const roofId = categoryId(project, "Roof");
    expect(measurementCategory(project)?.name).toBe("Other");
    expect(measurementCategory(project, null)?.name).toBe("Other");
    expect(measurementCategory(project, roofId)?.name).toBe("Roof");
    expect(measurementCategory(project, "deleted")?.name).toBe("Other");

    removeCategory(project, roofId);
    expect(measurementCategory(project, roofId)?.name).toBe("Other");
  });

  it("trims room names and treats an empty room as undefined", () => {
    expect(normalizeRoom("  Room 101 ")).toBe("Room 101");
    expect(normalizeRoom("Room  101")).toBe("Room  101");
    expect(normalizeRoom("   ")).toBeUndefined();
    expect(normalizeRoom("")).toBeUndefined();
  });

  it("only accepts real categories as the default", () => {
    const project = makeProject();
    expect(setDefaultCategory(project, "missing")).toBe(false);
    const roofId = categoryId(project, "Roof");
    expect(setDefaultCategory(project, roofId)).toBe(true);
    expect(project.settings.quantity.defaultCategoryId).toBe(roofId);
  });

  it("collects distinct rooms from measurements only, sorted", () => {
    const project = makeProject();
    const otherId = categoryId(project, "Other");
    addItem(project, "length", { categoryId: otherId, room: "Room 102" });
    addItem(project, "area", { categoryId: otherId, room: "room 101", areaMode: "add" });
    addItem(project, "length", { categoryId: otherId, room: "ROOM 101 " });
    addItem(project, "length", { categoryId: otherId });
    addItem(project, "text", { room: "Not a measurement", text: "Note" });
    expect(allRooms(project)).toEqual(["room 101", "Room 102"]);
  });
});

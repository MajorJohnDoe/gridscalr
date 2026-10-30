import { describe, expect, it } from "vitest";
import {
  addItem,
  createDefaultLayers,
  createProject,
  defaultDocument,
  layersForKind,
} from "../src/model/layers";
import { calculateQuantities } from "../src/model/quantity";
import { itemMetrics } from "../src/model/measure";
import {
  addCountType,
  countQuantityOf,
  countTypeItemCount,
  countTypeLabel,
  defaultCountTypes,
  normalizeCountTypes,
  removeCountType,
  renameCountType,
} from "../src/features/countTypes/model";
import type { MarkupItem, Project } from "../src/model/types";

const NOW = "2026-01-01T00:00:00.000Z";

function makeProject(): Project {
  return createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
}

function countItem(project: Project, overrides: Partial<MarkupItem> = {}): MarkupItem {
  const item: MarkupItem = {
    id: `item_${Math.random().toString(36).slice(2)}`,
    page: 1,
    kind: "count",
    points: [{ x: 30, y: 30 }],
    color: "#f70808",
    strokeWidth: 2,
    countType: "door",
    categoryId: project.categories[0].id,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
  addItem(project, layersForKind(project, "measure")[0].id, item);
  return item;
}

describe("count type model", () => {
  it("starts with the five built-ins and an other fallback", () => {
    const project = makeProject();
    expect(project.countTypes.map((entry) => entry.id)).toEqual([
      "door",
      "window",
      "radiator",
      "fixture",
      "other",
    ]);
    expect(countTypeLabel(project, "window")).toBe("Window");
    expect(countTypeLabel(project, "missing")).toBe("Other");
  });

  it("adds, renames and removes custom types", () => {
    const project = makeProject();
    const type = addCountType(project, "Socket", "fixture");
    expect(type).not.toBeNull();
    expect(countTypeLabel(project, type!.id)).toBe("Socket");

    expect(renameCountType(project, type!.id, "Power socket")).toBe(true);
    expect(countTypeLabel(project, type!.id)).toBe("Power socket");
    expect(renameCountType(project, type!.id, "Door")).toBe(false);

    const item = countItem(project, { countType: type!.id });
    expect(countTypeItemCount(project, type!.id)).toBe(1);
    const result = removeCountType(project, type!.id);
    expect(result).toEqual({ removed: true, reassigned: 1 });
    expect(item.countType).toBe("other");
    expect(project.countTypes.some((entry) => entry.id === type!.id)).toBe(false);
  });

  it("protects built-in types from deletion", () => {
    const project = makeProject();
    expect(removeCountType(project, "door")).toEqual({ removed: false, reason: "builtin" });
    expect(removeCountType(project, "other")).toEqual({ removed: false, reason: "builtin" });
  });

  it("repairs duplicate ids, duplicate labels and invalid glyphs", () => {
    const types = normalizeCountTypes([
      { id: "door", label: "Door", glyph: "door" },
      { id: "door", label: "Duplicate", glyph: "door" },
      { id: "socket", label: "Door", glyph: "spaceship" },
      { id: "bad id", label: "Bad", glyph: "other" },
    ]);
    expect(types.map((entry) => entry.id)).toEqual(["door", "socket", "other"]);
    expect(types.find((entry) => entry.id === "socket")).toMatchObject({
      label: "Door 2",
      glyph: "other",
    });
  });

  it("falls back to the built-ins when the list is empty", () => {
    expect(normalizeCountTypes(undefined)).toEqual(defaultCountTypes());
    expect(normalizeCountTypes([])).toEqual(defaultCountTypes());
  });
});

describe("count quantities", () => {
  it("defaults to one and clamps invalid values", () => {
    expect(countQuantityOf({})).toBe(1);
    expect(countQuantityOf({ countQuantity: 0 })).toBe(1);
    expect(countQuantityOf({ countQuantity: -3 })).toBe(1);
    expect(countQuantityOf({ countQuantity: 2.4 })).toBe(2);
    expect(countQuantityOf({ countQuantity: Number.NaN })).toBe(1);
  });

  it("uses the quantity in item metrics and quantity rows", () => {
    const project = makeProject();
    const item = countItem(project, { countType: "window", countQuantity: 3 });
    expect(itemMetrics(item, project)).toMatchObject({
      primary: "3 pcs",
      secondary: "Window",
      rawPoints: 3,
      unit: "pcs",
    });

    const summary = calculateQuantities(project, { page: "all" });
    const row = summary.rows.find((entry) => entry.type === "count");
    expect(row).toMatchObject({ gross: 3, net: 3, orderQuantity: 3, items: 1 });
  });
});

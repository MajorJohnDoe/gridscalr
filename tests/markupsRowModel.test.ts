import { describe, expect, it } from "vitest";
import { defaultMarkupsViewSettings, type MarkupsViewSettings } from "../src/model/markups";
import { addItem, createProject, defaultDocument, layersForKind } from "../src/model/layers";
import type { MarkupItem, Project } from "../src/model/types";
import { t } from "../src/i18n";
import {
  compareRows,
  filteredRows,
  groupValue,
  sortValue,
  type MarkupRow,
} from "../src/ui/markups/rowModel";
import { pageIdFor, pageStateAt, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";

function makeProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 3)));
  pageStateAt(project, 1)!.name = "Ground floor";
  pageStateAt(project, 2)!.name = "First floor";
  layersForKind(project, "draw")[0].name = "Drawings";
  layersForKind(project, "measure")[0].name = "Measurements";
  return project;
}

function settings(patch: Partial<MarkupsViewSettings> = {}): MarkupsViewSettings {
  return { ...defaultMarkupsViewSettings(), ...patch };
}

function add(
  project: Project,
  layerId: string,
  item: Partial<MarkupItem> & Pick<MarkupItem, "kind">,
): MarkupItem {
  const created: MarkupItem = {
    id: "item",
    pageId: pageIdFor(1),
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: NOW,
    updatedAt: NOW,
    ...item,
  };
  addItem(project, layerId, created);
  return created;
}

function lengthPoints(value: number): Array<{ x: number; y: number }> {
  return [
    { x: 0, y: 0 },
    { x: value, y: 0 },
  ];
}

function rowOf(rows: MarkupRow[], id: string): MarkupRow {
  const row = rows.find((entry) => entry.item.id === id);
  if (!row) throw new Error(`Missing row ${id}`);
  return row;
}

describe("markups row model filters", () => {
  it("filters by search across the label, layer and category", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    const draw = layersForKind(project, "draw")[0];
    const wall = project.categories[1];
    add(project, measure.id, { id: "pump-length", kind: "length", label: "Pump A" });
    add(project, measure.id, { id: "valve-length", kind: "length", label: "Valve B" });
    add(project, draw.id, { id: "pump-outline", kind: "rect", label: "Pump outline" });
    add(project, measure.id, {
      id: "wall-length",
      kind: "length",
      label: "Partition",
      categoryId: wall.id,
    });

    const byLabel = filteredRows(project, settings({ search: "pump" }), null);
    expect(byLabel.map((row) => row.item.id)).toEqual(["pump-outline", "pump-length"]);

    const byLayer = filteredRows(project, settings({ search: "measurements" }), null);
    expect(byLayer.map((row) => row.item.id)).toEqual([
      "wall-length",
      "pump-length",
      "valve-length",
    ]);

    const byCategory = filteredRows(project, settings({ search: wall.name }), null);
    expect(byCategory.map((row) => row.item.id)).toEqual(["wall-length"]);
  });

  it("filters to the current page only when the page filter is set", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    add(project, measure.id, { id: "page-one", kind: "length" });
    add(project, measure.id, { id: "page-two", kind: "length", pageId: pageIdFor(2) });

    const current = filteredRows(project, settings({ pageFilter: "current" }), pageIdFor(1));
    expect(current.map((row) => row.item.id)).toEqual(["page-one"]);

    const all = filteredRows(project, settings({ pageFilter: "all" }), pageIdFor(1));
    expect(all.map((row) => row.item.id)).toEqual(["page-one", "page-two"]);
  });

  it("filters by category and never matches drawings", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    const draw = layersForKind(project, "draw")[0];
    const floor = project.categories[0];
    const wall = project.categories[1];
    add(project, measure.id, { id: "floor-length", kind: "length", categoryId: floor.id });
    add(project, measure.id, {
      id: "wall-length",
      kind: "length",
      label: "Wall length",
      categoryId: wall.id,
    });
    add(project, measure.id, {
      id: "wall-count",
      kind: "count",
      label: "Wall count",
      categoryId: wall.id,
      countType: "door",
    });
    add(project, draw.id, { id: "drawing", kind: "rect" });

    const wallRows = filteredRows(project, settings({ categoryId: wall.id }), null);
    expect(wallRows.map((row) => row.item.id)).toEqual(["wall-count", "wall-length"]);

    const floorRows = filteredRows(project, settings({ categoryId: floor.id }), null);
    expect(floorRows.map((row) => row.item.id)).toEqual(["floor-length"]);
  });

  it("filters by type, count type and symbol category", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    const draw = layersForKind(project, "draw")[0];
    add(project, measure.id, { id: "length-measure", kind: "length" });
    add(project, measure.id, {
      id: "count-door",
      kind: "count",
      countType: "door",
    });
    add(project, measure.id, {
      id: "count-window",
      kind: "count",
      countType: "window",
    });
    add(project, draw.id, { id: "drawing", kind: "rect" });
    add(project, draw.id, {
      id: "fire-symbol",
      kind: "symbol",
      symbolId: "fire.extinguisher",
    });

    expect(
      filteredRows(project, settings({ typeFilter: "draw" }), null).map((row) => row.item.id),
    ).toEqual(["drawing"]);
    expect(
      filteredRows(project, settings({ typeFilter: "symbol" }), null).map((row) => row.item.id),
    ).toEqual(["fire-symbol"]);
    expect(
      filteredRows(project, settings({ typeFilter: "measure" }), null).map((row) => row.item.id),
    ).toEqual(["length-measure", "count-door", "count-window"]);
    expect(
      filteredRows(project, settings({ typeFilter: "count" }), null).map((row) => row.item.id),
    ).toEqual(["count-door", "count-window"]);
    expect(
      filteredRows(project, settings({ typeFilter: "count", countType: "window" }), null).map(
        (row) => row.item.id,
      ),
    ).toEqual(["count-window"]);
    expect(
      filteredRows(project, settings({ symbolCategory: "fire" }), null).map((row) => row.item.id),
    ).toEqual(["fire-symbol"]);
  });
});

describe("markups row model sorting", () => {
  it("sorts by name ascending and descending", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    add(project, measure.id, { id: "charlie", kind: "length", label: "Charlie" });
    add(project, measure.id, { id: "alpha", kind: "length", label: "Alpha" });
    add(project, measure.id, { id: "bravo", kind: "length", label: "Bravo" });

    const ascending = filteredRows(
      project,
      settings({ sort: { column: "name", direction: "asc" } }),
      null,
    );
    expect(ascending.map((row) => row.item.id)).toEqual(["alpha", "bravo", "charlie"]);

    const descending = filteredRows(
      project,
      settings({ sort: { column: "name", direction: "desc" } }),
      null,
    );
    expect(descending.map((row) => row.item.id)).toEqual(["charlie", "bravo", "alpha"]);
  });

  it("sorts by value ascending and descending", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    add(project, measure.id, {
      id: "heavy",
      kind: "length",
      label: "Heavy",
      points: lengthPoints(300),
    });
    add(project, measure.id, {
      id: "light",
      kind: "length",
      label: "Light",
      points: lengthPoints(100),
    });
    add(project, measure.id, {
      id: "medium",
      kind: "length",
      label: "Medium",
      points: lengthPoints(200),
    });

    const ascending = filteredRows(
      project,
      settings({ sort: { column: "value", direction: "asc" } }),
      null,
    );
    expect(ascending.map((row) => row.item.id)).toEqual(["light", "medium", "heavy"]);

    const descending = filteredRows(
      project,
      settings({ sort: { column: "value", direction: "desc" } }),
      null,
    );
    expect(descending.map((row) => row.item.id)).toEqual(["heavy", "medium", "light"]);

    const rows = filteredRows(project, settings(), null);
    expect(sortValue(rowOf(rows, "medium"), "value", project)).toBe(200);
    expect(sortValue(rowOf(rows, "medium"), "name", project)).toBe("medium");
    expect(sortValue(rowOf(rows, "medium"), "layer", project)).toBe("measurements");
    expect(sortValue(rowOf(rows, "medium"), "page", project)).toBe(1);
  });

  it("keeps the page, layer and name fallback when sort values are equal", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    add(project, measure.id, {
      id: "beta",
      kind: "length",
      label: "Beta",
      points: lengthPoints(100),
    });
    add(project, measure.id, {
      id: "alpha",
      kind: "length",
      label: "Alpha",
      points: lengthPoints(100),
    });

    const ascending = filteredRows(
      project,
      settings({ sort: { column: "value", direction: "asc" } }),
      null,
    );
    expect(ascending.map((row) => row.item.id)).toEqual(["alpha", "beta"]);

    const descending = filteredRows(
      project,
      settings({ sort: { column: "value", direction: "desc" } }),
      null,
    );
    // Equal values keep the ascending fallback even for a descending sort.
    expect(descending.map((row) => row.item.id)).toEqual(["alpha", "beta"]);

    const rows = filteredRows(project, settings(), null);
    expect(compareRows(rows[0], rows[1], project, null)).toBeLessThan(0);
  });
});

describe("markups row model grouping", () => {
  it("labels page, category, count-type, layer and room groups", () => {
    const project = makeProject();
    const measure = layersForKind(project, "measure")[0];
    const draw = layersForKind(project, "draw")[0];
    const floor = project.categories[0];
    add(project, measure.id, {
      id: "floor-length",
      kind: "length",
      categoryId: floor.id,
      room: "Office",
    });
    add(project, draw.id, { id: "drawing", kind: "rect" });
    add(project, measure.id, {
      id: "door-count",
      kind: "count",
      countType: "door",
    });
    add(project, measure.id, {
      id: "page-three",
      kind: "length",
      pageId: pageIdFor(3),
    });
    add(project, draw.id, {
      id: "fire-symbol",
      kind: "symbol",
      symbolId: "fire.extinguisher",
    });

    const rows = filteredRows(project, settings(), null);
    const floorRow = rowOf(rows, "floor-length");
    const drawing = rowOf(rows, "drawing");
    const count = rowOf(rows, "door-count");
    const pageThree = rowOf(rows, "page-three");
    const symbol = rowOf(rows, "fire-symbol");

    expect(groupValue(floorRow, "page", project)).toBe(
      t("markups.pageWithName", { page: 1, name: "Ground floor" }),
    );
    expect(groupValue(pageThree, "page", project)).toBe(t("markups.pageOnly", { page: 3 }));
    expect(groupValue(floorRow, "category", project)).toBe(floor.name);
    expect(groupValue(drawing, "category", project)).toBe(t("markups.uncategorized"));
    expect(groupValue(symbol, "category", project)).toBe(t("symbolCategory.fire"));
    expect(groupValue(count, "countType", project)).toBe(t("countType.door"));
    expect(groupValue(floorRow, "countType", project)).toBe(t("markups.other"));
    expect(groupValue(floorRow, "layer", project)).toBe("Measurements");
    expect(groupValue(floorRow, "room", project)).toBe("Office");
    expect(groupValue(drawing, "room", project)).toBe(t("markups.unassigned"));
  });
});

import { describe, expect, it } from "vitest";
import {
  defaultMarkupsViewSettings,
  groupMarkupRows,
  markupsGroupPresetFor,
  markupsSettingsEqual,
  normalizeMarkupsColumns,
  normalizeMarkupsViews,
  settingsForView,
  uniqueMarkupsViewName,
  viewFromSettings,
} from "../src/model/markups";
import type { MarkupsView } from "../src/model/types";

const view = (patch: Partial<MarkupsView> = {}): MarkupsView => ({
  id: "view_1",
  name: "Ventilation",
  columns: ["name", "room", "value"],
  pageFilter: "all",
  typeFilter: "measure",
  categoryId: "cat_hvac",
  symbolCategory: null,
  search: "",
  groupBy: ["building", "floor", "room"],
  sort: null,
  ...patch,
});

describe("Markups views", () => {
  it("normalizes stored views and drops duplicates and stale references", () => {
    const views = normalizeMarkupsViews(
      [
        view({
          columns: ["name", "room", "bogus", "room"] as unknown as MarkupsView["columns"],
          pageFilter: "current",
          search: "  AHU  ",
          groupBy: ["building", "room", "building"],
          sort: { column: "value", direction: "desc" },
        }),
        view({ id: "view_2", name: " ventilation " }),
        view({ id: "view_3", name: "Electrical", categoryId: "deleted" }),
        view({ id: "view_4", name: "" }),
      ],
      new Set(["cat_hvac"]),
    );
    expect(views).toHaveLength(2);
    expect(views[0]).toMatchObject({
      id: "view_1",
      name: "Ventilation",
      columns: ["name", "room"],
      pageFilter: "current",
      search: "AHU",
      groupBy: ["building", "room"],
      sort: { column: "value", direction: "desc" },
    });
    expect(views[1].categoryId).toBeNull();
  });

  it("normalizes symbol views and validates symbol categories", () => {
    const views = normalizeMarkupsViews(
      [
        view({
          id: "view_symbols",
          name: "Fire symbols",
          typeFilter: "symbol",
          categoryId: null,
          symbolCategory: "fire",
        }),
        view({
          id: "view_bad",
          name: "Bad symbols",
          typeFilter: "symbol",
          categoryId: "cat_hvac",
          symbolCategory: "not-a-category" as never,
        }),
      ],
      new Set(["cat_hvac"]),
    );
    expect(views[0]).toMatchObject({
      typeFilter: "symbol",
      categoryId: null,
      symbolCategory: "fire",
    });
    expect(views[1].symbolCategory).toBeNull();
    expect(views[1].categoryId).toBe("cat_hvac");
  });

  it("always keeps Name visible and ignores unknown columns", () => {
    expect(normalizeMarkupsColumns(["value", "bogus", "value"])).toEqual(["name", "value"]);
    expect(normalizeMarkupsColumns(undefined)).toEqual([
      "name",
      "type",
      "page",
      "layer",
      "value",
      "category",
      "room",
      "status",
      "created",
      "modified",
      "visible",
      "locked",
    ]);
  });

  it("round-trips settings and creates unique view names", () => {
    const settings = defaultMarkupsViewSettings();
    settings.columns = ["name", "room"];
    settings.search = "pump";
    const source = viewFromSettings("view_9", "Ventilation", settings);
    expect(settingsForView(source)).toEqual(settings);
    expect(markupsSettingsEqual(settings, settingsForView(source))).toBe(true);

    const names = uniqueMarkupsViewName([view({ name: "Ventilation" })], "Ventilation");
    expect(names).toBe("Ventilation (2)");
    expect(markupsGroupPresetFor(["building", "floor", "room"])?.id).toBe("building-floor-room");
  });

  it("groups rows hierarchically and keeps duplicate floor values separate", () => {
    const rows = [
      { id: "a", building: "A", floor: "1", room: "Office" },
      { id: "b", building: "A", floor: "2", room: "Office" },
      { id: "c", building: "A", floor: "2", room: "" },
      { id: "d", building: "", floor: "1", room: "Store" },
    ];
    const groups = groupMarkupRows(rows, ["building", "floor", "room"], (row, field) =>
      field === "building" ? row.building : field === "floor" ? row.floor : row.room,
    );
    expect(groups.map((group) => group.value)).toEqual(["A", "Unassigned"]);
    expect(groups[0].children.map((group) => group.value)).toEqual(["1", "2"]);
    expect(groups[0].children[0].key).not.toBe(groups[0].children[1].key);
    expect(groups[0].children[1].children.map((group) => group.value)).toEqual([
      "Office",
      "Unassigned",
    ]);
    expect(groups[0].count).toBe(3);
  });
});

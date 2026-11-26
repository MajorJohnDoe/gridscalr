// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { pageIdFor, withTestPageIds } from "./helpers/pages";
import { createProject, defaultDocument } from "../src/model/layers";
import { setCountTypeGlyph } from "../src/model/countTypes";
import { normalizeLineTypes, setLineTypes } from "../src/model/lineTypes";
import { setRailItemOptions } from "../src/model/rail";
import { addImageItem, createImageItem } from "../src/model/images";
import { setItemLabel } from "../src/model/commands/editorLabels";
import {
  addMarkupsView,
  replaceMarkupsViews,
  upsertMarkupsView,
} from "../src/model/commands/views";
import { setSummaryCardVisible } from "../src/features/takeoffSettings/model";
import {
  createTemplateDocument,
  setSheetFields,
} from "../src/features/schematics/model/sheetDocument";
import { continuePolyline } from "../src/features/lineContinuation";
import { markupsState } from "../src/ui/markups/state";
import { syncProject } from "../src/ui/markups/views";
import type {
  CountGlyph,
  ImageAsset,
  LineType,
  MarkupItem,
  MarkupsView,
  Project,
  RailRow,
} from "../src/model/types";

const NOW = "2026-01-01T00:00:00.000Z";

function project(pages = 1): Project {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", pages)));
}

function item(patch: Partial<MarkupItem> = {}): MarkupItem {
  return {
    id: "item_1",
    pageId: pageIdFor(1),
    kind: "text",
    points: [{ x: 10, y: 10 }],
    color: "#4cc9f0",
    strokeWidth: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...patch,
  };
}

function view(patch: Partial<MarkupsView> = {}): MarkupsView {
  return {
    id: "view_1",
    name: "Ventilation",
    columns: ["name", "room"],
    pageFilter: "all",
    typeFilter: "measure",
    categoryId: null,
    symbolCategory: null,
    countType: null,
    search: "",
    groupBy: ["room"],
    sort: null,
    ...patch,
  };
}

describe("count type glyph command", () => {
  it("changes only the target glyph and ignores an invalid glyph", () => {
    const value = project();
    const before = value.countTypes.find((type) => type.id === "window")!.glyph;

    expect(setCountTypeGlyph(value, "door", "window")).toBe(true);
    expect(value.countTypes.find((type) => type.id === "door")!.glyph).toBe("window");
    expect(value.countTypes.find((type) => type.id === "window")!.glyph).toBe(before);
    expect(setCountTypeGlyph(value, "door", "window")).toBe(false);
    expect(setCountTypeGlyph(value, "missing", "door")).toBe(false);
    expect(setCountTypeGlyph(value, "door", "bogus" as CountGlyph)).toBe(false);
  });
});

describe("line type command", () => {
  it("normalizes colour, width and duplicate ids", () => {
    const input: LineType[] = [
      { id: "same", name: "  Supply  ", color: "not-a-colour", widthPt: 99, style: "solid" },
      { id: "same", name: "Return", color: "#00FF00", widthPt: 0.1, style: "dashed" },
    ];
    const next = normalizeLineTypes(input);
    expect(next).toHaveLength(2);
    expect(next[0]).toMatchObject({ name: "Supply", color: "#4cc9f0", widthPt: 20 });
    expect(next[1]).toMatchObject({ name: "Return", color: "#00FF00", widthPt: 0.3 });
    expect(next[0].id).not.toBe(next[1].id);
  });

  it("replaces the stored list and refuses an empty list", () => {
    const value = project();
    const next = setLineTypes(value, [
      { id: "only", name: "Only", color: "#123456", widthPt: 2, style: "solid" },
    ]);
    expect(next).toHaveLength(1);
    expect(value.lineTypes.map((entry) => entry.id)).toEqual(["only"]);

    const before = value.lineTypes;
    expect(setLineTypes(value, [])).toBeNull();
    expect(value.lineTypes).toBe(before);
  });
});

describe("rail item command", () => {
  it("drops blank labels and stores explicit display switches", () => {
    const value = project();
    const layer = value.layers.find((entry) => entry.kind === "draw")!;
    const rail = item({ kind: "rail", id: "rail_1" });
    layer.items.push(rail);
    const rows: RailRow[] = [
      { id: "plc", label: "  PLC  ", legend: "  Controller  " },
      { id: "blank", label: "   " },
      { id: "plc", label: "DI" },
    ];

    expect(setRailItemOptions(value, rail.id, { rows, showBadges: false, showLegend: true })).toBe(
      true,
    );
    expect(rail.rows).toHaveLength(2);
    expect(rail.rows![0]).toEqual({ id: "plc", label: "PLC", legend: "Controller" });
    expect(rail.rows![1].label).toBe("DI");
    expect(rail.rows![1].id).not.toBe("plc");
    expect(rail.showBadges).toBe(false);
    expect(rail.showLegend).toBeUndefined();
    expect(rail.updatedAt).not.toBe(NOW);

    expect(setRailItemOptions(value, rail.id, { rows, showBadges: true, showLegend: false })).toBe(
      true,
    );
    expect(rail.showBadges).toBeUndefined();
    expect(rail.showLegend).toBe(false);
    expect(setRailItemOptions(value, "missing", { rows, showBadges: true, showLegend: true })).toBe(
      false,
    );
    expect(
      setRailItemOptions(value, rail.id, {
        rows: [{ id: "blank", label: "" }],
        showBadges: true,
        showLegend: true,
      }),
    ).toBe(false);
  });
});

describe("sheet field command", () => {
  it("replaces only the target template document", () => {
    const value = project(2);
    const first = createTemplateDocument("gridscalr.operation-card.frame", "A3", "First");
    const second = createTemplateDocument("gridscalr.operation-card.frame", "A3", "Second");
    value.documents.push(first, second);
    value.pages.push(
      { id: "page_3", documentId: first.id, localPage: 1, state: {} },
      { id: "page_4", documentId: second.id, localPage: 1, state: {} },
    );
    second.template!.fields = { keep: "Second" };

    expect(setSheetFields(value, "page_3", { projectName: "North wing" })).toBe(true);
    expect(first.template!.fields).toEqual({ projectName: "North wing" });
    expect(second.template!.fields).toEqual({ keep: "Second" });
    expect(setSheetFields(value, "missing", { projectName: "No" })).toBe(false);
    expect(setSheetFields(value, pageIdFor(1), { projectName: "PDF" })).toBe(false);
  });
});

describe("summary card command", () => {
  it("changes one card by id and leaves the others alone", () => {
    const value = project();
    const areaBefore = value.settings.summary.cards.find((card) => card.id === "area")!.visible;
    expect(setSummaryCardVisible(value, "doors", false)).toBe(true);
    expect(value.settings.summary.cards.find((card) => card.id === "doors")!.visible).toBe(false);
    expect(value.settings.summary.cards.find((card) => card.id === "area")!.visible).toBe(
      areaBefore,
    );
    expect(setSummaryCardVisible(value, "doors", false)).toBe(false);
    expect(setSummaryCardVisible(value, "missing" as never, false)).toBe(false);
  });
});

describe("image asset command", () => {
  it("registers the asset and item together, and writes nothing for a missing layer", () => {
    const value = project();
    const layer = value.layers.find((entry) => entry.kind === "draw")!;
    const asset: ImageAsset = {
      id: "img_1",
      name: "Detail.png",
      mime: "image/png",
      width: 800,
      height: 400,
      byteSize: 1200,
      data: "data:image/png;base64,iVBORw0KGgo=",
    };
    const image = createImageItem(asset, pageIdFor(1), { width: 1000, height: 800 });

    expect(addImageItem(value, layer.id, asset, image)).toBe(true);
    expect(value.assets[asset.id]).toBe(asset);
    expect(layer.items).toContain(image);

    const other = project();
    expect(addImageItem(other, "missing", asset, image)).toBe(false);
    expect(other.assets[asset.id]).toBeUndefined();
  });

  it("rejects an image item that points at another asset", () => {
    const value = project();
    const layer = value.layers.find((entry) => entry.kind === "draw")!;
    const asset: ImageAsset = {
      id: "img_1",
      name: "Detail.png",
      mime: "image/png",
      width: 800,
      height: 400,
      byteSize: 1200,
      data: "data:image/png;base64,iVBORw0KGgo=",
    };
    const image = createImageItem({ ...asset, id: "img_other" }, pageIdFor(1), {
      width: 1000,
      height: 800,
    });
    expect(addImageItem(value, layer.id, asset, image)).toBe(false);
  });
});

describe("item label command", () => {
  it("sets, clears and ignores an unchanged label", () => {
    const value = project();
    const layer = value.layers.find((entry) => entry.kind === "draw")!;
    const target = item();
    layer.items.push(target);

    expect(setItemLabel(value, target.id, "  Pump 1  ")).toBe(true);
    expect(target.label).toBe("Pump 1");
    expect(target.updatedAt).not.toBe(NOW);
    expect(setItemLabel(value, target.id, "Pump 1")).toBe(false);
    expect(setItemLabel(value, target.id, "   ")).toBe(true);
    expect(target.label).toBeUndefined();
    expect(setItemLabel(value, "missing", "No")).toBe(false);
  });
});

describe("markups view commands", () => {
  it("adds unique ids, upserts in place and replaces in supplied order", () => {
    const value = project();
    expect(addMarkupsView(value, view())).toBe(true);
    expect(addMarkupsView(value, view({ name: "Duplicate id" }))).toBe(false);
    expect(addMarkupsView(value, view({ id: "view_2", name: "Doors" }))).toBe(true);
    expect(value.markupsViews.map((entry) => entry.id)).toEqual(["view_1", "view_2"]);

    expect(upsertMarkupsView(value, view({ name: "Ventilation revised" }))).toBe(true);
    expect(value.markupsViews.map((entry) => entry.id)).toEqual(["view_1", "view_2"]);
    expect(value.markupsViews[0].name).toBe("Ventilation revised");

    expect(
      replaceMarkupsViews(value, [
        view({ id: "view_3", name: "Third" }),
        view({ id: "view_1", name: "First" }),
        view({ id: "view_3", name: "Duplicate" }),
        view({ id: "view_4", name: "   " }),
      ]),
    ).toBe(2);
    expect(value.markupsViews.map((entry) => entry.id)).toEqual(["view_3", "view_1"]);
    expect(value.markupsViews.map((entry) => entry.name)).toEqual(["Third", "First"]);
  });

  it("clears the active view when a replacement removes it", () => {
    const value = project();
    value.markupsViews = [view()];
    markupsState.currentProjectId = value.id;
    markupsState.activeViewId = "view_1";
    markupsState.viewDirty = false;

    replaceMarkupsViews(value, [view({ id: "view_2", name: "Doors" })]);
    syncProject(value);

    expect(markupsState.activeViewId).toBeNull();
  });
});

describe("polyline continuation command", () => {
  it("appends the tail once and refuses a stale target", () => {
    const value = project();
    const layer = value.layers.find((entry) => entry.kind === "draw")!;
    const line = item({
      kind: "polyline",
      points: [
        { x: 50, y: 80 },
        { x: 90, y: 120 },
        { x: 50, y: 160 },
      ],
    });
    layer.items.push(line);

    expect(
      continuePolyline(value, { layerId: layer.id, itemId: line.id, vertexIndex: 2 }, [
        { x: 50, y: 160 },
        { x: 50, y: 200 },
      ]),
    ).toBe(true);
    expect(line.points).toHaveLength(4);
    expect(line.points[3]).toEqual({ x: 50, y: 200 });
    expect(line.updatedAt).not.toBe(NOW);

    expect(
      continuePolyline(value, { layerId: "missing", itemId: line.id, vertexIndex: 2 }, [
        { x: 50, y: 200 },
        { x: 50, y: 240 },
      ]),
    ).toBe(false);
  });
});

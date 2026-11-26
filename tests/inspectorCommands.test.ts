// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { pageIdFor, withTestPageIds } from "./helpers/pages";
import { createProject, defaultDocument, findItem } from "../src/model/layers";
import { Store } from "../src/state/store";
import {
  releaseItemLabelFit,
  setItemLabel,
  setItemLabelSize,
} from "../src/model/commands/itemLabel";
import {
  setItemAreaMode,
  setItemCategory,
  setItemCountQuantity,
  setItemCountType,
  setItemRoom,
} from "../src/model/commands/itemMeta";
import {
  setItemCloudRadius,
  setItemDepth,
  setItemFillColor,
  setItemFillEnabled,
  setItemFillOpacity,
  setItemFontSize,
  setItemHighlightShape,
  setItemLineStyle,
  setItemRotation,
  setItemTextBackground,
  setItemTextBoxDimension,
} from "../src/model/commands/itemStyle";
import { setItemSymbolTag, setItemSymbolTagOffset } from "../src/model/commands/itemSymbol";
import { renameLayer, setLayerColor, setLayerOpacity } from "../src/model/commands/layers";
import type { ItemKind, Layer, MarkupItem, Project, SelectionRef } from "../src/model/types";

const MEASUREMENT_KINDS: ReadonlySet<ItemKind> = new Set([
  "length",
  "area",
  "count",
  "radius",
  "diameter",
  "arc",
  "angle",
  "slope",
  "volume",
]);

function makeItem(id: string, kind: ItemKind, page = 1): MarkupItem {
  return {
    id,
    pageId: pageIdFor(page),
    kind,
    points: [
      { x: 10, y: 10 },
      { x: 30, y: 30 },
    ],
    color: "#4cc9f0",
    strokeWidth: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

interface Fixture {
  project: Project;
  layer: Layer;
  item: MarkupItem;
  ref: SelectionRef;
}

function setup(kind: ItemKind): Fixture {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
  const layerKind = MEASUREMENT_KINDS.has(kind) ? "measure" : "draw";
  const layer = project.layers.find((entry) => entry.kind === layerKind)!;
  const item = makeItem("item_1", kind);
  layer.items.push(item);
  return { project, layer, item, ref: { layerId: layer.id, itemId: item.id } };
}

describe("label commands", () => {
  it("trims, sets and clears the label", () => {
    const { project, item, ref } = setup("length");
    expect(setItemLabel(project, [ref], "  Wall A  ").changed).toBe(1);
    expect(item.label).toBe("Wall A");
    expect(item.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");

    setItemLabel(project, [ref], "   ");
    expect(item.label).toBeUndefined();
  });

  it("clamps a label size and clears it back to the project default", () => {
    const { project, item, ref } = setup("length");
    setItemLabelSize(project, [ref], 99);
    expect(item.labelSize).toBe(16);

    setItemLabelSize(project, [ref], 0);
    expect(item.labelSize).toBe(4);

    setItemLabelSize(project, [ref], undefined);
    expect(item).not.toHaveProperty("labelSize");
  });

  it("releases a fitted label only when one is present", () => {
    const { project, item, ref } = setup("area");
    item.labelFit = "center";
    expect(releaseItemLabelFit(project, [ref]).changed).toBe(1);
    expect(item).not.toHaveProperty("labelFit");
    expect(releaseItemLabelFit(project, [ref]).changed).toBe(0);
  });

  it("treats a missing item as a no-op", () => {
    const { project } = setup("length");
    const result = setItemLabel(project, [{ layerId: "missing", itemId: "missing" }], "x");
    expect(result.changed).toBe(0);
  });
});

describe("measurement metadata commands", () => {
  it("assigns a valid count type and ignores an unknown one", () => {
    const { project, item, ref } = setup("count");
    expect(setItemCountType(project, [ref], "door").changed).toBe(1);
    expect(item.countType).toBe("door");

    expect(setItemCountType(project, [ref], "missing_type").changed).toBe(0);
    expect(item.countType).toBe("door");
  });

  it("normalizes pieces per object and drops the default quantity", () => {
    const { project, item, ref } = setup("count");
    setItemCountQuantity(project, [ref], 3.4);
    expect(item.countQuantity).toBe(3);

    setItemCountQuantity(project, [ref], 1);
    expect(item).not.toHaveProperty("countQuantity");

    setItemCountQuantity(project, [ref], 0);
    expect(item).not.toHaveProperty("countQuantity");
  });

  it("applies count-only commands only to count items", () => {
    const { project, item, ref } = setup("length");
    expect(setItemCountQuantity(project, [ref], 3).changed).toBe(0);
    expect(item).not.toHaveProperty("countQuantity");
  });

  it("assigns a valid category and ignores a missing one", () => {
    const { project, item, ref } = setup("length");
    const category = project.categories[1];
    expect(setItemCategory(project, [ref], category.id).changed).toBe(1);
    expect(item.categoryId).toBe(category.id);

    expect(setItemCategory(project, [ref], "missing_category").changed).toBe(0);
    expect(item.categoryId).toBe(category.id);
  });

  it("normalizes the room and clears an empty one", () => {
    const { project, item, ref } = setup("area");
    setItemRoom(project, [ref], "  Living   room ");
    expect(item.room).toBe("Living   room");

    setItemRoom(project, [ref], "   ");
    expect(item).not.toHaveProperty("room");
  });

  it("changes the area mode only on areas", () => {
    const area = setup("area");
    expect(setItemAreaMode(area.project, [area.ref], "subtract").changed).toBe(1);
    expect(area.item.areaMode).toBe("subtract");

    const length = setup("length");
    expect(setItemAreaMode(length.project, [length.ref], "subtract").changed).toBe(0);
    expect(length.item).not.toHaveProperty("areaMode");
  });

  it("still edits metadata while the layer is hidden", () => {
    const { project, layer, item, ref } = setup("length");
    layer.visible = false;
    expect(setItemRoom(project, [ref], "Hall").changed).toBe(1);
    expect(item.room).toBe("Hall");
  });

  it("skips a locked item", () => {
    const { project, item, ref } = setup("length");
    item.locked = true;
    expect(setItemRoom(project, [ref], "Hall")).toMatchObject({
      changed: 0,
      skippedLocked: 1,
    });
    expect(item).not.toHaveProperty("room");
  });
});

describe("style commands", () => {
  it("clamps the font size on text items only", () => {
    const text = setup("text");
    setItemFontSize(text.project, [text.ref], 0.1);
    expect(text.item.fontSize).toBe(0.5);
    setItemFontSize(text.project, [text.ref], 999);
    expect(text.item.fontSize).toBe(300);

    const line = setup("line");
    expect(setItemFontSize(line.project, [line.ref], 12).changed).toBe(0);
  });

  it("clamps the volume depth", () => {
    const { project, item, ref } = setup("volume");
    setItemDepth(project, [ref], 0);
    expect(item.depth).toBe(0.001);
    setItemDepth(project, [ref], 2_000_000);
    expect(item.depth).toBe(1_000_000);
  });

  it("sets and clears the dashed line style", () => {
    const { project, item, ref } = setup("length");
    setItemLineStyle(project, [ref], "dashed");
    expect(item.lineStyle).toBe("dashed");
    setItemLineStyle(project, [ref], "solid");
    expect(item).not.toHaveProperty("lineStyle");
  });

  it("normalizes rotation and stores a full turn as omitted", () => {
    const { project, item, ref } = setup("rect");
    setItemRotation(project, [ref], 370);
    expect(item.rotation).toBe(10);
    setItemRotation(project, [ref], -90);
    expect(item.rotation).toBe(270);
    setItemRotation(project, [ref], 360);
    expect(item).not.toHaveProperty("rotation");
  });

  it("enables and clears a fill without losing the item colour", () => {
    const { project, item, ref } = setup("cloud");
    setItemFillEnabled(project, [ref], true, 0.22);
    expect(item.fillColor).toBe("#4cc9f0");
    expect(item.opacity).toBe(0.22);

    setItemFillEnabled(project, [ref], false, 0.22);
    expect(item).not.toHaveProperty("fillColor");
  });

  it("sets a canonical fill colour and clamps its opacity", () => {
    const { project, item, ref } = setup("rect");
    setItemFillColor(project, [ref], "#FF0000", 0.15);
    expect(item.fillColor).toBe("#ff0000");
    setItemFillOpacity(project, [ref], 2);
    expect(item.opacity).toBe(1);
    setItemFillOpacity(project, [ref], -1);
    expect(item.opacity).toBe(0);
  });

  it("toggles the white text-box background", () => {
    const { project, item, ref } = setup("textbox");
    setItemTextBackground(project, [ref], true);
    expect(item.textBackground).toBe("white");
    setItemTextBackground(project, [ref], false);
    expect(item).not.toHaveProperty("textBackground");
  });

  it("clamps and clears a fixed text-box size", () => {
    const { project, item, ref } = setup("callout");
    setItemTextBoxDimension(project, [ref], "width", 5);
    expect(item.textBoxWidth).toBe(20);
    setItemTextBoxDimension(project, [ref], "height", 9999);
    expect(item.textBoxHeight).toBe(2000);
    setItemTextBoxDimension(project, [ref], "width", undefined);
    expect(item).not.toHaveProperty("textBoxWidth");
  });

  it("clamps and clears the cloud scallop radius", () => {
    const { project, item, ref } = setup("cloud");
    setItemCloudRadius(project, [ref], 1);
    expect(item.cloudRadius).toBe(2);
    setItemCloudRadius(project, [ref], 100);
    expect(item.cloudRadius).toBe(40);
    setItemCloudRadius(project, [ref], undefined);
    expect(item).not.toHaveProperty("cloudRadius");
  });

  it("reduces a freehand highlight to a rectangle and expands it to a polygon", () => {
    const { project, item, ref } = setup("highlight");
    item.points = [
      { x: 10, y: 30 },
      { x: 40, y: 20 },
      { x: 20, y: 5 },
    ];
    setItemHighlightShape(project, [ref], "rectangle");
    expect(item.highlightShape).toBe("rectangle");
    expect(item.points).toEqual([
      { x: 10, y: 5 },
      { x: 40, y: 30 },
    ]);

    setItemHighlightShape(project, [ref], "polygon");
    expect(item.points).toEqual([
      { x: 10, y: 5 },
      { x: 40, y: 5 },
      { x: 40, y: 30 },
      { x: 10, y: 30 },
    ]);
  });
});

describe("symbol commands", () => {
  it("normalizes the symbol tag and clears it when empty", () => {
    const { project, item, ref } = setup("symbol");
    setItemSymbolTag(project, [ref], "  Fire   door  ");
    expect(item.tag).toBe("Fire door");

    setItemSymbolTag(project, [ref], "   ");
    expect(item.tag).toBeUndefined();
  });

  it("moves one tag axis and keeps the other", () => {
    const { project, item, ref } = setup("symbol");
    setItemSymbolTagOffset(project, [ref], "x", 12.4);
    expect(item.tagOffset).toEqual({ x: 12, y: 0 });
    setItemSymbolTagOffset(project, [ref], "y", -8.6);
    expect(item.tagOffset).toEqual({ x: 12, y: -9 });
  });

  it("skips a locked symbol", () => {
    const { project, item, ref } = setup("symbol");
    item.locked = true;
    expect(setItemSymbolTag(project, [ref], "A")).toMatchObject({
      changed: 0,
      skippedLocked: 1,
    });
  });
});

describe("layer commands", () => {
  it("renames a layer, ignoring an empty name", () => {
    const { project, layer } = setup("text");
    expect(renameLayer(project, layer.id, "  Markup  ")).toBe(true);
    expect(layer.name).toBe("Markup");
    expect(renameLayer(project, layer.id, "   ")).toBe(false);
    expect(renameLayer(project, "missing", "Name")).toBe(false);
  });

  it("applies a canonical layer colour to the layer and its items", () => {
    const { project, layer, item } = setup("text");
    expect(setLayerColor(project, layer.id, "#FF0000")).toBe(true);
    expect(layer.color).toBe("#ff0000");
    expect(item.color).toBe("#ff0000");
    expect(setLayerColor(project, layer.id, "not-a-colour")).toBe(false);
  });

  it("clamps layer opacity", () => {
    const { project, layer } = setup("text");
    setLayerOpacity(project, layer.id, 2);
    expect(layer.opacity).toBe(1);
    setLayerOpacity(project, layer.id, 0.25);
    expect(layer.opacity).toBe(0.25);
  });
});

describe("one undo step", () => {
  it("restores one command edit per undo", () => {
    const { project, ref } = setup("length");
    const store = new Store();
    store.setProject(project, null);

    store.mutate((current) => {
      setItemRoom(current, [ref], "Kitchen");
    }, "change");

    expect(findItem(store.project!, ref.itemId)?.item.room).toBe("Kitchen");
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(findItem(store.project!, ref.itemId)?.item).not.toHaveProperty("room");
  });
});

import { describe, expect, it } from "vitest";
import { pageIdFor, withTestPageIds } from "./helpers/pages";
import { createProject, defaultDocument } from "../src/model/layers";
import {
  deleteItems,
  resetItemLabelPlacement,
  setItemCustomValue,
  setItemsColor,
  setItemsImageMode,
  setItemsLocked,
  setItemsOpacity,
  setItemsStatus,
  setItemsStrokeWidth,
  setItemsVisible,
  translateItems,
} from "../src/model/commands";
import type { MarkupItem, Project, SelectionRef } from "../src/model/types";

function makeItem(id: string, kind: MarkupItem["kind"], page = 1): MarkupItem {
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

function setup(): {
  project: Project;
  drawRef: SelectionRef;
  measureRef: SelectionRef;
  drawItem: MarkupItem;
  measureItem: MarkupItem;
} {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
  const draw = project.layers.find((layer) => layer.kind === "draw")!;
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  const drawItem = makeItem("draw_item", "text");
  const measureItem = makeItem("measure_item", "length");
  draw.items.push(drawItem);
  measure.items.push(measureItem);
  return {
    project,
    drawRef: { layerId: draw.id, itemId: drawItem.id },
    measureRef: { layerId: measure.id, itemId: measureItem.id },
    drawItem,
    measureItem,
  };
}

describe("item commands", () => {
  it("cannot show an item through a hidden layer", () => {
    const { project, drawRef, measureRef, drawItem, measureItem } = setup();
    const draw = project.layers.find((layer) => layer.id === drawRef.layerId)!;
    draw.visible = false;
    drawItem.visible = false;

    const result = setItemsVisible(project, [drawRef, measureRef], true);
    expect(result).toMatchObject({ changed: 1, skippedLayerHidden: 1 });
    expect(drawItem.visible).toBe(false);
    expect(measureItem.visible).toBe(true);
  });

  it("allows hiding items even when their layer is hidden", () => {
    const { project, drawRef, measureRef } = setup();
    project.layers.find((layer) => layer.id === drawRef.layerId)!.visible = false;

    const result = setItemsVisible(project, [drawRef, measureRef], false);
    expect(result.changed).toBe(2);
  });

  it("cannot unlock an item on a locked layer", () => {
    const { project, drawRef, measureRef, drawItem, measureItem } = setup();
    const measure = project.layers.find((layer) => layer.id === measureRef.layerId)!;
    measure.locked = true;
    measureItem.locked = true;

    const result = setItemsLocked(project, [drawRef, measureRef], false);
    expect(result).toMatchObject({ changed: 1, skippedLayerLocked: 1 });
    expect(drawItem.locked).toBe(false);
    expect(measureItem.locked).toBe(true);

    const lockResult = setItemsLocked(project, [drawRef, measureRef], true);
    expect(lockResult.changed).toBe(2);
    expect(measureItem.locked).toBe(true);
  });

  it("deletes only unlocked items", () => {
    const { project, drawRef, measureRef } = setup();
    const measure = project.layers.find((layer) => layer.id === measureRef.layerId)!;
    measure.locked = true;

    const result = deleteItems(project, [drawRef, measureRef]);
    expect(result).toMatchObject({ changed: 1, skippedLocked: 1 });
    expect(project.layers.find((layer) => layer.id === drawRef.layerId)!.items).toHaveLength(0);
    expect(project.layers.find((layer) => layer.id === measureRef.layerId)!.items).toHaveLength(1);
  });

  it("skips locked items for style edits and movement", () => {
    const { project, drawRef, measureRef, drawItem, measureItem } = setup();
    drawItem.locked = true;

    expect(setItemsColor(project, [drawRef, measureRef], "#ff0000")).toMatchObject({
      changed: 1,
      skippedLocked: 1,
    });
    expect(setItemsStrokeWidth(project, [drawRef, measureRef], 3)).toMatchObject({
      changed: 1,
      skippedLocked: 1,
    });
    const before = { ...measureItem.points[0] };
    expect(translateItems(project, [drawRef, measureRef], 5, 7)).toMatchObject({
      changed: 1,
      skippedLocked: 1,
    });
    expect(measureItem.points[0]).toEqual({ x: before.x + 5, y: before.y + 7 });
  });

  it("updates inspection status only on symbols and respects locks", () => {
    const { project, drawRef, drawItem } = setup();
    drawItem.kind = "symbol";
    drawItem.symbolId = "fire.extinguisher";
    const result = setItemsStatus(project, [drawRef], "approved");
    expect(result.changed).toBe(1);
    expect(drawItem.status).toBe("approved");

    drawItem.locked = true;
    expect(setItemsStatus(project, [drawRef], "missing")).toMatchObject({
      changed: 0,
      skippedLocked: 1,
    });
    expect(drawItem.status).toBe("approved");
  });

  it("handles image mode and opacity without touching non-images", () => {
    const { project, drawRef, drawItem, measureRef } = setup();
    drawItem.kind = "image";
    drawItem.image = { assetId: "asset_a", mode: "background" };

    const modeResult = setItemsImageMode(project, [drawRef], "annotation");
    expect(modeResult.changed).toBe(1);
    expect(drawItem.image.mode).toBe("annotation");

    const opacityResult = setItemsOpacity(project, [drawRef], 0.4);
    expect(opacityResult.changed).toBe(1);
    expect(drawItem.opacity).toBe(0.4);

    expect(setItemsImageMode(project, [measureRef], "background").changed).toBe(0);
  });
});

describe("single item commands", () => {
  it("sets and deletes a custom value and drops the empty custom object", () => {
    const { project, measureItem } = setup();

    const setResult = setItemCustomValue(project, measureItem.id, "field_a", 12);
    expect(setResult.changed).toBe(1);
    expect(measureItem.custom).toEqual({ field_a: 12 });

    const secondResult = setItemCustomValue(project, measureItem.id, "field_b", "text");
    expect(secondResult.changed).toBe(1);
    expect(measureItem.custom).toEqual({ field_a: 12, field_b: "text" });

    const deleteResult = setItemCustomValue(project, measureItem.id, "field_a", undefined);
    expect(deleteResult.changed).toBe(1);
    expect(measureItem.custom).toEqual({ field_b: "text" });

    const clearResult = setItemCustomValue(project, measureItem.id, "field_b", undefined);
    expect(clearResult.changed).toBe(1);
    expect(measureItem.custom).toBeUndefined();
  });

  it("keeps the custom object when another field still has a value", () => {
    const { project, measureItem } = setup();
    measureItem.custom = { field_a: 1, field_b: false };

    setItemCustomValue(project, measureItem.id, "field_a", undefined);

    expect(measureItem.custom).toEqual({ field_b: false });
  });

  it("treats a missing item as a no-op for both commands", () => {
    const { project } = setup();

    expect(setItemCustomValue(project, "missing", "field_a", 1)).toEqual({
      changed: 0,
      skippedLocked: 0,
      skippedLayerHidden: 0,
      skippedLayerLocked: 0,
    });
    expect(resetItemLabelPlacement(project, "missing")).toEqual({
      changed: 0,
      skippedLocked: 0,
      skippedLayerHidden: 0,
      skippedLayerLocked: 0,
    });
  });

  it("updates updatedAt when a custom value changes", () => {
    const { project, measureItem } = setup();
    expect(measureItem.updatedAt).toBe("2026-01-01T00:00:00.000Z");

    setItemCustomValue(project, measureItem.id, "field_a", 5);
    expect(measureItem.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
  });

  it("removes offset, anchor and fit when resetting the label placement", () => {
    const { project, measureItem } = setup();
    measureItem.labelOffset = { x: 4, y: 8 };
    measureItem.labelAnchor = { x: 12, y: 16 };
    measureItem.labelFit = "center";
    expect(measureItem.updatedAt).toBe("2026-01-01T00:00:00.000Z");

    const result = resetItemLabelPlacement(project, measureItem.id);

    expect(result.changed).toBe(1);
    expect(measureItem).not.toHaveProperty("labelOffset");
    expect(measureItem).not.toHaveProperty("labelAnchor");
    expect(measureItem).not.toHaveProperty("labelFit");
    expect(measureItem.updatedAt).not.toBe("2026-01-01T00:00:00.000Z");
  });
});

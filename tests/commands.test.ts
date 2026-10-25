import { describe, expect, it } from "vitest";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import {
  deleteItems,
  setItemsColor,
  setItemsImageMode,
  setItemsLocked,
  setItemsOpacity,
  setItemsStrokeWidth,
  setItemsVisible,
  translateItems,
} from "../src/model/commands";
import type { MarkupItem, Project, SelectionRef } from "../src/model/types";

function makeItem(id: string, kind: MarkupItem["kind"], page = 1): MarkupItem {
  return {
    id,
    page,
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
  const project = createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
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

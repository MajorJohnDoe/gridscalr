import { describe, expect, it } from "vitest";
import {
  createImageItem,
  imageModeOf,
  imageOpacity,
  initialImageSize,
  naturalImageSize,
} from "../src/model/images";
import { hitTest } from "../src/model/hitTest";
import { createDefaultLayers, createProject, defaultDocument, layerKindForItem } from "../src/model/layers";
import type { ImageAsset } from "../src/model/types";

const asset: ImageAsset = {
  id: "img_a",
  name: "Detail.png",
  mime: "image/png",
  width: 800,
  height: 400,
  byteSize: 1200,
  data: "data:image/png;base64,iVBORw0KGgo=",
};

function project() {
  return createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers());
}

describe("images", () => {
  it("maps natural pixels to PDF points at 96 DPI", () => {
    expect(naturalImageSize(asset)).toEqual({ width: 600, height: 300 });
  });

  it("fits large images inside the page and keeps small images natural", () => {
    expect(initialImageSize(asset, { width: 400, height: 300 })).toEqual({
      width: 400,
      height: 200,
    });
    expect(initialImageSize(asset, { width: 1000, height: 800 })).toEqual({
      width: 600,
      height: 300,
    });
    const tall: ImageAsset = { ...asset, id: "img_tall", width: 200, height: 2000 };
    expect(initialImageSize(tall, { width: 800, height: 600 })).toEqual({
      width: 60,
      height: 600,
    });
  });

  it("creates a centered background image item with two opposite corners", () => {
    const item = createImageItem(asset, 1, { width: 400, height: 300 });
    expect(item.kind).toBe("image");
    expect(item.image).toEqual({ assetId: "img_a", mode: "background" });
    expect(item.label).toBe("Detail.png");
    expect(item.points).toEqual([{ x: 0, y: 50 }, { x: 400, y: 250 }]);
    expect(imageModeOf(item)).toBe("background");
    expect(imageOpacity(item)).toBe(1);
    expect(layerKindForItem(item.kind)).toBe("draw");
  });

  it("clamps an oversized image center to the page", () => {
    const item = createImageItem(asset, 1, { width: 400, height: 300 }, "annotation", {
      x: 9999,
      y: -50,
    });
    expect(item.points[0].x).toBe(0);
    expect(item.points[1].x).toBe(400);
    expect(item.points[0].y).toBe(0);
    expect(imageModeOf(item)).toBe("annotation");
  });

  it("hit-tests the whole image surface and respects hidden items", () => {
    const projectValue = project();
    const draw = projectValue.layers.find((layer) => layer.kind === "draw")!;
    const item = createImageItem(asset, 1, { width: 400, height: 300 });
    draw.items.push(item);

    expect(
      hitTest(projectValue, 1, { x: 200, y: 150 }, 4)?.item.id,
    ).toBe(item.id);
    item.visible = false;
    expect(hitTest(projectValue, 1, { x: 200, y: 150 }, 4)).toBeNull();
  });

  it("lets markups above a background image win the hit test", () => {
    const projectValue = project();
    const draw = projectValue.layers.find((layer) => layer.kind === "draw")!;
    const rect = {
      id: "item_over_image",
      page: 1,
      kind: "rect" as const,
      points: [{ x: 0, y: 50 }, { x: 400, y: 250 }],
      color: "#4cc9f0",
      strokeWidth: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    draw.items.push(rect, createImageItem(asset, 1, { width: 400, height: 300 }));

    expect(hitTest(projectValue, 1, { x: 200, y: 150 }, 4)?.item.id).toBe(rect.id);
  });
});

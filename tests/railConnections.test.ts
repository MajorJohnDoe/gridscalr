import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLayer, createProject, defaultDocument } from "../src/model/layers";
import type { Layer, MarkupItem, Point, Project } from "../src/model/types";
import { store } from "../src/state/store";
import {
  canConnectWireToChannel,
  connectToChannel,
  findRailCrossing,
} from "../src/features/railConnections";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const RAIL_TOP = 100;
const RAIL_LEFT = 0;
const RAIL_RIGHT = 200;
const ROW_SPACING = 10;

function markup(
  id: string,
  kind: MarkupItem["kind"],
  points: Point[],
  pageId = pageIdFor(1),
): MarkupItem {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    pageId,
    kind,
    points,
    color: "#123456",
    strokeWidth: 1.5,
    createdAt: now,
    updatedAt: now,
  };
}

function makeProject(): { project: Project; layer: Layer; wire: MarkupItem; rail: MarkupItem } {
  const project = withTestPageIds(createProject(defaultDocument("Schematic.pdf", 1)));
  const layer = project.layers.find((entry) => entry.kind === "draw");
  if (!layer) throw new Error("Expected a draw layer.");
  const wire = markup("wire", "polyline", [
    { x: 50, y: 80 },
    { x: 50, y: 160 },
  ]);
  const rail = markup("rail", "rail", [
    { x: RAIL_LEFT, y: RAIL_TOP },
    { x: RAIL_RIGHT, y: RAIL_TOP },
  ]);
  rail.rows = [
    { id: "plc", label: "PLC" },
    { id: "di", label: "DI" },
    { id: "ai", label: "AI" },
    { id: "du", label: "DU" },
    { id: "au", label: "AU" },
  ];
  rail.rowSpacing = ROW_SPACING;
  layer.items.push(wire, rail);
  return { project, layer, wire, rail };
}

beforeEach(() => {
  store.setProject(makeProject().project, null);
});

afterEach(() => {
  store.project = null;
  store.readOnly = false;
});

describe("rail connection crossing", () => {
  it("chooses the nearest rail-row crossing to the click", () => {
    const { project, layer, wire } = makeProject();
    const crossing = findRailCrossing(
      project,
      { layerId: layer.id, itemId: wire.id },
      { x: 50, y: 128 },
      1,
    );
    expect(crossing?.point).toEqual({ x: 50, y: 130 });
    expect(crossing?.railItemId).toBe("rail");
    expect(crossing?.railLayerId).toBe(layer.id);
  });

  it("returns null when the click is not near a crossing", () => {
    const { project, layer, wire } = makeProject();
    expect(
      findRailCrossing(project, { layerId: layer.id, itemId: wire.id }, { x: 900, y: 900 }, 1),
    ).toBeNull();
  });

  it("scales the tolerance by zoom", () => {
    const { project, layer, wire } = makeProject();
    const click = { x: 50, y: 128 };
    expect(
      findRailCrossing(project, { layerId: layer.id, itemId: wire.id }, click, 1),
    ).not.toBeNull();
    expect(
      findRailCrossing(project, { layerId: layer.id, itemId: wire.id }, click, 20, 12),
    ).toBeNull();
  });

  it("ignores a hidden rail layer and a hidden rail item", () => {
    const { project, layer, wire, rail } = makeProject();
    const railLayer = createLayer("draw", "Rails");
    railLayer.items.push(rail);
    project.layers.push(railLayer);
    railLayer.visible = false;
    layer.items = [wire];
    expect(
      findRailCrossing(project, { layerId: layer.id, itemId: wire.id }, { x: 50, y: 128 }, 1),
    ).toBeNull();

    railLayer.visible = true;
    rail.visible = false;
    expect(
      findRailCrossing(project, { layerId: layer.id, itemId: wire.id }, { x: 50, y: 128 }, 1),
    ).toBeNull();
  });

  it("lets a visible locked rail contribute a crossing", () => {
    const { project, layer, wire, rail } = makeProject();
    rail.locked = true;
    const crossing = findRailCrossing(
      project,
      { layerId: layer.id, itemId: wire.id },
      { x: 50, y: 128 },
      1,
    );
    expect(crossing?.point).toEqual({ x: 50, y: 130 });
  });
});

describe("wire-to-channel guards", () => {
  it("rejects hidden or locked wire layers, measure layers and non-wire kinds", () => {
    const { layer, wire } = makeProject();
    expect(canConnectWireToChannel(wire, layer)).toBe(true);

    layer.visible = false;
    expect(canConnectWireToChannel(wire, layer)).toBe(false);
    layer.visible = true;

    layer.locked = true;
    expect(canConnectWireToChannel(wire, layer)).toBe(false);
    layer.locked = false;

    const measure = createLayer("measure", "Measurements");
    expect(canConnectWireToChannel(wire, measure)).toBe(false);

    const rect = markup("rect", "rect", [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(canConnectWireToChannel(rect, layer)).toBe(false);

    wire.visible = false;
    expect(canConnectWireToChannel(wire, layer)).toBe(false);
    wire.visible = true;
    wire.locked = true;
    expect(canConnectWireToChannel(wire, layer)).toBe(false);
  });

  it("returns no crossing for a hidden or locked wire", () => {
    const { project, layer, wire } = makeProject();
    wire.visible = false;
    expect(
      findRailCrossing(project, { layerId: layer.id, itemId: wire.id }, { x: 50, y: 128 }, 1),
    ).toBeNull();
    wire.visible = true;
    wire.locked = true;
    expect(
      findRailCrossing(project, { layerId: layer.id, itemId: wire.id }, { x: 50, y: 128 }, 1),
    ).toBeNull();
  });
});

describe("connection dot insertion", () => {
  it("inserts exactly one dot on the wire layer and undo removes it", () => {
    const { project, layer, wire } = makeProject();
    store.setProject(project, null);
    const before = layer.items.length;

    const result = connectToChannel(layer.id, wire.id, { x: 50, y: 128 }, 1);

    expect(result).not.toBeNull();
    const after = store.project?.layers.find((entry) => entry.id === layer.id);
    expect(after?.items).toHaveLength(before + 1);
    const dots = after?.items.filter((item) => item.kind === "symbol") ?? [];
    expect(dots).toHaveLength(1);
    expect(dots[0].symbolId).toBe("schematic.connection-dot");
    expect(dots[0].pageId).toBe(pageIdFor(1));
    expect(dots[0].points).toEqual([{ x: 50, y: 130 }]);
    expect(store.primarySelection).toEqual({ layerId: layer.id, itemId: dots[0].id });

    store.undo();

    const restored = store.project?.layers.find((entry) => entry.id === layer.id);
    expect(restored?.items).toHaveLength(before);
    expect(restored?.items.some((item) => item.kind === "symbol")).toBe(false);
  });

  it("does nothing in a read-only or view-only session", () => {
    const { project, layer, wire } = makeProject();
    store.setProject(project, null);
    store.setReadOnly(true);
    const before = layer.items.length;

    expect(connectToChannel(layer.id, wire.id, { x: 50, y: 128 }, 1)).toBeNull();
    expect(store.project?.layers.find((entry) => entry.id === layer.id)?.items).toHaveLength(
      before,
    );
  });

  it("does nothing when the click has no nearby crossing", () => {
    const { project, layer, wire } = makeProject();
    store.setProject(project, null);
    const before = layer.items.length;

    expect(connectToChannel(layer.id, wire.id, { x: 900, y: 900 }, 1)).toBeNull();
    expect(store.project?.layers.find((entry) => entry.id === layer.id)?.items).toHaveLength(
      before,
    );
  });
});

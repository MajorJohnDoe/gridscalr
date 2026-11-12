// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { layerMatchesQuery, scopeItemsFor } from "../src/ui/layers/filter";
import { addLayer, createProject, defaultDocument, layersForKind } from "../src/model/layers";
import type { MarkupItem, Project } from "../src/model/types";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

function baseProject(): Project {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
}

function item(id: string, pageId: string, patch: Partial<MarkupItem> = {}): MarkupItem {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    pageId,
    kind: "length",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    color: "#f70808",
    strokeWidth: 0.75,
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

describe("layer list filter", () => {
  it("keeps every layer without a query", () => {
    const project = baseProject();
    const layer = layersForKind(project, "measure")[0];
    expect(layerMatchesQuery(layer, "all", pageIdFor(1), "")).toBe(true);
    expect(layerMatchesQuery(layer, "all", pageIdFor(1), "   ")).toBe(true);
  });

  it("matches the layer name case- and locale-insensitively", () => {
    const project = baseProject();
    const layer = layersForKind(project, "measure")[0];
    layer.name = "Rörelsefogar";
    expect(layerMatchesQuery(layer, "all", pageIdFor(1), "RÖRELSE")).toBe(true);
    expect(layerMatchesQuery(layer, "all", pageIdFor(1), "fogar")).toBe(true);
    expect(layerMatchesQuery(layer, "all", pageIdFor(1), "dörr")).toBe(false);
  });

  it("matches an item label or room inside the current scope", () => {
    const project = baseProject();
    const layer = addLayer(project, "measure", pageIdFor(1));
    layer.items.push(item("item_1", pageIdFor(1), { label: "Yttervägg norr", room: "Kök" }));
    layer.items.push(item("item_2", pageIdFor(2), { label: "Innervägg söder" }));
    expect(layerMatchesQuery(layer, "all", pageIdFor(1), "yttervägg")).toBe(true);
    expect(layerMatchesQuery(layer, "all", pageIdFor(1), "kök")).toBe(true);
    // Page scope hides the item that only lives on the other page.
    expect(layerMatchesQuery(layer, "page", pageIdFor(1), "innervägg")).toBe(false);
    expect(layerMatchesQuery(layer, "all", pageIdFor(1), "innervägg")).toBe(true);
  });

  it("scopes the visible items to the current page or the whole project", () => {
    const project = baseProject();
    const layer = addLayer(project, "draw", pageIdFor(1));
    layer.items.push(item("item_1", pageIdFor(1)), item("item_2", pageIdFor(2)));
    expect(scopeItemsFor(layer, "page", pageIdFor(1)).map((entry) => entry.id)).toEqual(["item_1"]);
    expect(scopeItemsFor(layer, "all", pageIdFor(1)).map((entry) => entry.id)).toEqual([
      "item_1",
      "item_2",
    ]);
  });
});

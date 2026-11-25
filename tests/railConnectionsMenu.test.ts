// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, defaultDocument } from "../src/model/layers";
import type { MarkupItem, Point, Project } from "../src/model/types";
import { store } from "../src/state/store";
import { showSelectionMenuAt } from "../src/ui/selectionMenu";
import type { PanelActions } from "../src/ui/panels";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

function markup(id: string, kind: MarkupItem["kind"], points: Point[]): MarkupItem {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id,
    pageId: pageIdFor(1),
    kind,
    points,
    color: "#123456",
    strokeWidth: 1.5,
    createdAt: now,
    updatedAt: now,
  };
}

function makeProject(): { project: Project; layerId: string; wireId: string } {
  const project = withTestPageIds(createProject(defaultDocument("Schematic.pdf", 1)));
  const layer = project.layers.find((entry) => entry.kind === "draw");
  if (!layer) throw new Error("Expected a draw layer.");
  const wire = markup("wire", "polyline", [
    { x: 50, y: 80 },
    { x: 50, y: 160 },
  ]);
  const rail = markup("rail", "rail", [
    { x: 0, y: 100 },
    { x: 200, y: 100 },
  ]);
  rail.rows = [
    { id: "plc", label: "PLC" },
    { id: "di", label: "DI" },
  ];
  rail.rowSpacing = 10;
  layer.items.push(wire, rail);
  return { project, layerId: layer.id, wireId: wire.id };
}

function actions(connect: ReturnType<typeof vi.fn>): PanelActions {
  return { connectToChannel: connect } as unknown as PanelActions;
}

function labels(): string[] {
  return [...document.querySelectorAll(".popover button")].map(
    (node) => node.textContent?.trim() ?? "",
  );
}

beforeEach(() => {
  const { project, layerId, wireId } = makeProject();
  store.setProject(project, null);
  store.setSelection({ layerId, itemId: wireId });
});

afterEach(() => {
  store.project = null;
  document.body.replaceChildren();
});

describe("Connect to channel menu action", () => {
  it("is present when the click is near a wire/rail crossing", () => {
    showSelectionMenuAt(10, 10, actions(vi.fn()), { x: 50, y: 108 });
    expect(labels()).toContain("Connect to channel");
  });

  it("is absent without a click page point and away from a crossing", () => {
    showSelectionMenuAt(10, 10, actions(vi.fn()));
    expect(labels()).not.toContain("Connect to channel");
    document.body.replaceChildren();
    showSelectionMenuAt(10, 10, actions(vi.fn()), { x: 900, y: 900 });
    expect(labels()).not.toContain("Connect to channel");
  });
});

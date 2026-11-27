// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { LayerTreeController, type LayerDropPlan } from "../src/features/layerTree";
import type { Layer, Project } from "../src/model/types";
import { dragPointer, pressAndMove, rect } from "./helpers/pointer";

/**
 * The Layers tree shares the pointer gesture with the Pages list. These tests
 * drive the same press → move → release sequence a mouse produces, so a shell
 * that owns HTML5 drag-and-drop cannot quietly break nesting again.
 */

function makeLayer(id: string, kind: Layer["kind"] = "measure"): Layer {
  return {
    id,
    name: id,
    kind,
    visible: true,
    locked: false,
    opacity: 1,
    color: kind === "measure" ? "#e30613" : "#f2a93b",
    items: [],
  };
}

interface Applied {
  ids: string[];
  plan: LayerDropPlan;
}

function mount(layers: Layer[]): {
  controller: LayerTreeController;
  list: HTMLElement;
  rows: HTMLElement[];
  applied: Applied[];
  announced: () => string | null;
} {
  document.body.innerHTML = "";
  const project = { layers } as unknown as Project;
  const applied: Applied[] = [];
  const controller = new LayerTreeController({
    project: () => project,
    canMove: () => true,
    apply: (ids, plan) => {
      applied.push({ ids: [...ids], plan });
      return true;
    },
  });
  const scroll = document.createElement("div");
  const list = document.createElement("div");
  list.className = "layer-list";
  list.getBoundingClientRect = () => rect(0, 0, 100, layers.length * 20);
  scroll.getBoundingClientRect = () => rect(0, 0, 100, layers.length * 20);
  const rows = layers.map((layer, index) => {
    // The panel renders each treeitem as a wrapper that owns the visual row.
    const node = document.createElement("div");
    node.className = "layer-node";
    node.dataset.layerId = layer.id;
    node.dataset.layerKind = layer.kind;
    node.getBoundingClientRect = () => rect(index * 20, 0, 100, 20);
    const row = document.createElement("div");
    row.className = "layer-row";
    row.dataset.layerId = layer.id;
    node.append(row);
    list.append(node);
    return node;
  });
  scroll.append(list);
  document.body.append(scroll);
  controller.bindList(list, scroll);
  return {
    controller,
    list,
    rows,
    applied,
    announced: () => document.querySelector(".layer-reorder-announcer")?.textContent ?? null,
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("layer tree pointer drag", () => {
  it("moves a row below its sibling with one applied drop", () => {
    const { rows, applied } = mount([makeLayer("a"), makeLayer("b"), makeLayer("c")]);
    // The bottom band of the third row is a sibling move, not a nest.
    const held = pressAndMove({ target: rows[0], x: 10, y: 10 }, { x: 10, y: 20 });
    expect(rows[0].classList.contains("is-dragging")).toBe(true);
    held.release({ x: 10, y: 58 });
    expect(applied).toEqual([{ ids: ["a"], plan: { mode: "below", targetId: "c" } }]);
    expect(rows[0].classList.contains("is-dragging")).toBe(false);
  });

  it("nests a row when the pointer rests in the middle of another row", () => {
    const { rows, applied } = mount([makeLayer("a"), makeLayer("b")]);
    const held = pressAndMove({ target: rows[0], x: 10, y: 10 }, { x: 10, y: 20 });
    held.release({ x: 10, y: 30 });
    expect(applied).toEqual([{ ids: ["a"], plan: { mode: "inside", targetId: "b" } }]);
  });

  it("announces a rejected cross-kind nest without applying it", () => {
    const { rows, applied, announced } = mount([
      makeLayer("draw", "draw"),
      makeLayer("measure", "measure"),
    ]);
    const held = pressAndMove({ target: rows[0], x: 10, y: 10 }, { x: 10, y: 20 });
    held.release({ x: 10, y: 30 });
    expect(applied).toHaveLength(0);
    expect(announced()).toBe("Drawing layers and measurement layers cannot be nested together.");
  });

  it("cancels on Escape and applies nothing", () => {
    const { rows, applied } = mount([makeLayer("a"), makeLayer("b")]);
    const held = pressAndMove({ target: rows[0], x: 10, y: 10 }, { x: 10, y: 20 });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    held.release({ x: 10, y: 30 });
    expect(applied).toHaveLength(0);
  });

  it("keeps a press on a row control out of the drag", () => {
    const { rows, applied } = mount([makeLayer("a"), makeLayer("b")]);
    const lock = document.createElement("button");
    rows[0].append(lock);
    dragPointer({ target: lock, x: 10, y: 10 }, { x: 10, y: 30 });
    expect(applied).toHaveLength(0);
  });
});

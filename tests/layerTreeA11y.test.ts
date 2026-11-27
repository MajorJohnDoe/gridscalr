// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { renderLayers } from "../src/ui/layerList";
import { createLayer, createProject, defaultDocument } from "../src/model/layers";
import type { MarkupItem, Project } from "../src/model/types";
import type { PanelActions } from "../src/ui/panels";
import type { ShellRefs } from "../src/ui/shell";
import { store } from "../src/state/store";
import { layerView } from "../src/ui/layers/state";
import { withTestPageIds } from "./helpers/pages";

function item(pageId: string, id: string): MarkupItem {
  return {
    id,
    pageId,
    kind: "length",
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ],
    color: "#e30613",
    strokeWidth: 2,
    categoryId: "cat_default",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function projectWithTree(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  measure.id = "layer_measure";
  measure.items.push(item(project.pages[0].id, "item_1"));
  const child = createLayer("measure", "Child layer", undefined, project.pages[0].id);
  child.id = "layer_child";
  child.parentId = measure.id;
  project.layers.push(child);
  project.activeLayerId = measure.id;
  return project;
}

function mount(): { refs: ShellRefs; actions: PanelActions } {
  const dockBody = document.createElement("div");
  document.body.append(dockBody);
  const refs = { dockBody, dockTabs: [] } as unknown as ShellRefs;
  const actions = {
    refresh: () => undefined,
    goToPage: () => undefined,
    navigateToItem: () => undefined,
  } as unknown as PanelActions;
  return { refs, actions };
}

beforeEach(() => {
  document.body.innerHTML = "";
  store.project = null;
  layerView.expanded = new Set();
  layerView.query = "";
  layerView.focusLayerId = null;
});

describe("Layers tree accessibility", () => {
  it("exposes tree and treeitem roles with level, position and selection", () => {
    const project = projectWithTree();
    store.setProject(project, "/tmp/layer-a11y.gridscalr", false);
    const { refs, actions } = mount();
    renderLayers(refs, actions);
    const parentRow = refs.dockBody.querySelector<HTMLElement>('[data-layer-id="layer_measure"]')!;
    parentRow.querySelector<HTMLButtonElement>(".layer-disclosure")?.click();
    refs.dockBody.replaceChildren();
    renderLayers(refs, actions);
    const parentRowAgain = refs.dockBody.querySelector<HTMLElement>(
      '[data-layer-id="layer_measure"]',
    )!;
    parentRowAgain.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    refs.dockBody.replaceChildren();
    renderLayers(refs, actions);

    const trees = [...refs.dockBody.querySelectorAll<HTMLElement>('[role="tree"]')];
    expect(trees).toHaveLength(2);
    const measureTree = refs.dockBody.querySelector<HTMLElement>(
      '.layer-section[data-layer-kind="measure"] [role="tree"]',
    )!;
    expect(measureTree.getAttribute("aria-multiselectable")).toBe("true");
    const rows = [...measureTree.querySelectorAll<HTMLElement>('[role="treeitem"]')];
    expect(rows.length).toBeGreaterThan(0);
    const parent = measureTree.querySelector<HTMLElement>('[data-layer-id="layer_measure"]')!;
    expect(parent.getAttribute("aria-level")).toBe("1");
    expect(parent.getAttribute("aria-expanded")).toBe("true");
    expect(parent.getAttribute("aria-posinset")).toBe("1");
    expect(parent.getAttribute("aria-setsize")).toBe("1");
    expect(parent.getAttribute("aria-selected")).toBe("true");

    // One tab stop per tree; arrow navigation moves it to the next treeitem.
    const treeStops = rows.filter((row) => row.tabIndex === 0);
    expect(treeStops).toHaveLength(1);
    parent.focus();
    parent.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    const focused = document.activeElement as HTMLElement;
    expect(focused.getAttribute("role")).toBe("treeitem");
    expect(focused).not.toBe(parent);
    expect(focused.dataset.itemId ?? focused.dataset.layerId).toBeTruthy();
    expect(focused.tabIndex).toBe(0);
    expect(
      [...measureTree.querySelectorAll<HTMLElement>('[role="treeitem"]')].filter(
        (row) => row.tabIndex === 0,
      ),
    ).toHaveLength(1);
  });

  it("wraps an expanded layer's items in a group with level and position", () => {
    const project = projectWithTree();
    store.setProject(project, "/tmp/layer-a11y.gridscalr", false);
    const { refs, actions } = mount();
    layerView.expanded = new Set(["layer_measure"]);
    renderLayers(refs, actions);
    const group = refs.dockBody.querySelector<HTMLElement>("#layer-items-layer_measure");
    expect(group?.getAttribute("role")).toBe("group");
    const itemRow = group?.querySelector<HTMLElement>('[role="treeitem"]');
    expect(itemRow?.getAttribute("aria-level")).toBe("2");
    expect(itemRow?.getAttribute("aria-posinset")).toBe("1");
    expect(itemRow?.getAttribute("aria-setsize")).toBe("1");
    expect(itemRow?.tabIndex).toBe(-1);
  });
});

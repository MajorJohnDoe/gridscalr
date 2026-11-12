// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ui/dialogs", () => ({ confirmDialog: vi.fn(async () => true) }));

import { confirmDialog } from "../src/ui/dialogs";
import { withTestPageIds } from "./helpers/pages";
import { deletePageFlow, type PageFlowHost } from "../src/app/pageFlows";
import {
  insertProjectPage,
  reorderPages,
  reorderProjectPage,
  type PageActionHost,
} from "../src/features/pageModel";
import { clearAllRecovery, listRecoveryRecords } from "../src/features/sessionRecovery";
import { validateProject } from "../src/model/integrity";
import { createProject, defaultDocument } from "../src/model/layers";
import { currentPageId, pageNumber } from "../src/model/pages";
import type { MarkupItem, PageState, Project } from "../src/model/types";
import { store } from "../src/state/store";

const PATH = "/tmp/page-history/Pages.gridscalr";
const NOW = "2026-01-01T00:00:00.000Z";

function measurement(project: Project, pageId: string, id: string): MarkupItem {
  return {
    id,
    pageId,
    kind: "length",
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    categoryId: project.settings.quantity.defaultCategoryId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function baseProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 3)));
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  for (const page of project.pages) {
    measure.items.push(measurement(project, page.id, `item_${page.id}`));
  }
  measure.pageState = { page_1: { visible: false }, page_3: { locked: true } };
  project.pages[1].state = { name: "Second sheet", scaleLocked: true };
  return project;
}

function ids(): string[] {
  return store.project!.pages.map((page) => page.id);
}

function itemPages(): Map<string, string> {
  const map = new Map<string, string>();
  for (const layer of store.project!.layers) {
    for (const item of layer.items) map.set(item.id, item.pageId);
  }
  return map;
}

function pageStates(): Map<string, PageState> {
  return new Map(store.project!.pages.map((page) => [page.id, { ...page.state }]));
}

function measureLayer(): Project["layers"][number] {
  return store.project!.layers.find((layer) => layer.kind === "measure")!;
}

function expectNoBrokenReferences(): void {
  expect(validateProject(store.project!).filter((issue) => issue.severity === "error")).toEqual([]);
  const pageIds = new Set(store.project!.pages.map((page) => page.id));
  for (const layer of store.project!.layers) {
    if (layer.homePageId) expect(pageIds.has(layer.homePageId)).toBe(true);
    for (const key of Object.keys(layer.pageState ?? {})) expect(pageIds.has(key)).toBe(true);
    for (const item of layer.items) expect(pageIds.has(item.pageId)).toBe(true);
  }
}

function actionHost(): PageActionHost {
  return {
    renderer: () => null,
    thumbnails: () => null,
    resetPageSizes: () => undefined,
    enqueuePageSize: async () => undefined,
    fitPage: () => undefined,
    invalidate: () => undefined,
    renderAll: () => undefined,
    closeSearch: () => undefined,
    closeReference: async () => undefined,
    afterStructuralChange: () => undefined,
    installProject: async () => undefined,
    detachDocument: () => undefined,
  };
}

function flowHost(): PageFlowHost {
  return {
    renderer: () => null,
    thumbnails: () => null,
    resetPageSizes: vi.fn(),
    enqueuePageSize: vi.fn(async () => undefined),
    fitPage: vi.fn(),
    focusItem: vi.fn(),
    invalidate: vi.fn(),
    renderAll: vi.fn(),
    closeSearch: vi.fn(),
    closeReference: vi.fn(async () => undefined),
    closeSplitView: vi.fn(),
    destroyRenderer: vi.fn(async () => undefined),
  };
}

beforeEach(async () => {
  store.project = null;
  store.projectPath = null;
  store.fileStamp = null;
  store.dirty = false;
  store.readOnly = false;
  localStorage.clear();
  vi.mocked(confirmDialog).mockReset();
  vi.mocked(confirmDialog).mockResolvedValue(true);
  await clearAllRecovery().catch(() => undefined);
});

describe("undoable page reorder", () => {
  it("restores the exact page order and every page's state in one undo step", async () => {
    store.setProject(baseProject(), PATH, false);
    const before = ids();
    const beforeStates = pageStates();
    const beforeItems = itemPages();

    expect(await reorderProjectPage(actionHost(), "page_1", 2)).toBe(true);
    expect(ids()).toEqual(["page_2", "page_3", "page_1"]);
    expect(store.canUndo).toBe(true);
    expectNoBrokenReferences();

    store.undo();
    expect(ids()).toEqual(before);
    expect(pageStates()).toEqual(beforeStates);
    expect(itemPages()).toEqual(beforeItems);
    expect(pageNumber(store.project!, "page_2")).toBe(2);
    expectNoBrokenReferences();

    store.redo();
    expect(ids()).toEqual(["page_2", "page_3", "page_1"]);
    expect(pageStates()).toEqual(beforeStates);
    expect(itemPages()).toEqual(beforeItems);
    expectNoBrokenReferences();
  });

  it("moves a whole multi-page selection as one undo step, not one per page", async () => {
    store.setProject(baseProject(), PATH, false);
    const before = ids();

    expect(await reorderPages(actionHost(), ["page_2", "page_3"], 0)).toBe(true);
    expect(ids()).toEqual(["page_2", "page_3", "page_1"]);

    store.undo();
    expect(ids()).toEqual(before);
    expect(store.canRedo).toBe(true);
  });

  it("keeps the visible drawing on its PageId through an order change", () => {
    store.setProject(baseProject(), PATH, false);
    store.setPage(3);
    expect(currentPageId(store.project!, store.ui.page)).toBe("page_3");

    expect(store.reorderPage("page_3", 0)).toBe(true);
    // The display position is unchanged, so the drawing under it changed.
    expect(store.ui.page).toBe(3);
    expect(currentPageId(store.project!, store.ui.page)).toBe("page_2");

    store.undo();
    expect(ids()).toEqual(["page_1", "page_2", "page_3"]);
    // Undo keeps the drawing that was on screen rather than the position.
    expect(currentPageId(store.project!, store.ui.page)).toBe("page_2");
    expect(store.ui.page).toBe(2);
  });

  it("adds no undo step for a drop that does not change the order", () => {
    store.setProject(baseProject(), PATH, false);
    const initialVisible = measureLayer().items[0].visible;
    store.mutate(() => {
      measureLayer().items[0].visible = false;
    });
    expect(store.reorderPage("page_1", 0)).toBe(false);
    expect(store.canUndo).toBe(true);
    store.undo();
    expect(measureLayer().items[0].visible).toBe(initialVisible);
  });
});

describe("undoable page insert", () => {
  it("removes and restores exactly the inserted page with its PageId", async () => {
    store.setProject(baseProject(), PATH, false);
    const before = ids();
    const beforeItems = itemPages();

    await insertProjectPage(actionHost(), "page_1", 1);
    const insertedOpen = ids();
    expect(insertedOpen).toEqual([before[0], insertedOpen[1], before[1], before[2]]);
    const insertedId = insertedOpen[1];
    expect(insertedId).not.toBe(before[0]);
    expect(pageNumber(store.project!, insertedId)).toBe(2);
    expect(store.ui.page).toBe(2);
    expect(itemPages()).toEqual(beforeItems);
    expectNoBrokenReferences();

    store.undo();
    expect(ids()).toEqual(before);
    expect(ids()).not.toContain(insertedId);
    expect(itemPages()).toEqual(beforeItems);
    // The inserted page is gone, so the display position is clamped instead.
    expect(currentPageId(store.project!, store.ui.page)).toBe("page_2");
    expectNoBrokenReferences();

    store.redo();
    expect(ids()).toEqual(insertedOpen);
    expect(pageNumber(store.project!, insertedId)).toBe(2);
    expect(store.project!.pages[1].id).toBe(insertedId);
    expectNoBrokenReferences();
  });

  it("keeps a later page state and its items after the insert is undone", async () => {
    store.setProject(baseProject(), PATH, false);
    await insertProjectPage(actionHost(), "page_2", 0);
    const insertedId = ids()[0];
    expect(insertedId).not.toBe("page_2");

    store.undo();
    expect(store.project!.pages[1].state).toEqual({
      name: "Second sheet",
      scaleLocked: true,
    });
    expect(itemPages().get("item_page_2")).toBe("page_2");
    expectNoBrokenReferences();
  });
});

describe("explicit structural boundaries", () => {
  it("keeps page delete confirmed, checkpointed and outside the undo stack", async () => {
    store.setProject(baseProject(), PATH, false);
    store.mutate(() => {
      measureLayer().items[0].visible = false;
    });
    expect(store.canUndo).toBe(true);

    vi.mocked(confirmDialog).mockResolvedValueOnce(false);
    await deletePageFlow(flowHost(), "page_2");
    expect(ids()).toEqual(["page_1", "page_2", "page_3"]);
    expect(store.canUndo).toBe(true);

    vi.mocked(confirmDialog).mockResolvedValueOnce(true);
    await deletePageFlow(flowHost(), "page_2");
    expect(ids()).toEqual(["page_1", "page_3"]);
    expect(store.canUndo, "delete clears history instead of becoming a step").toBe(false);
    expect(store.canRedo).toBe(false);
    expectNoBrokenReferences();

    const records = await listRecoveryRecords();
    expect(
      records.some(
        (record) =>
          record.kind === "checkpoint" && (record.label ?? "") === "Before deleting page 2",
      ),
    ).toBe(true);
  });

  it("keeps page duplicate an explicit boundary in this release", () => {
    store.setProject(baseProject(), PATH, false);
    store.mutate(() => {
      measureLayer().items[0].visible = false;
    });
    const copy = store.duplicatePage("page_1", {
      copyMarkups: true,
      copyScale: true,
      copyName: true,
      name: "Copy",
    });
    expect(copy).not.toBeNull();
    expect(ids()).toHaveLength(4);
    expect(store.canUndo, "duplicate stays explicit and cannot be undone").toBe(false);
    expect(store.canRedo).toBe(false);
  });

  it("keeps a bulk item action one undo step after a page reorder", () => {
    store.setProject(baseProject(), PATH, false);
    expect(store.reorderPage("page_1", 2)).toBe(true);
    const measure = store.project!.layers.find((layer) => layer.kind === "measure")!;
    const beforeVisibility = measure.items.map((item) => item.visible);

    store.mutate((project) => {
      const layer = project.layers.find((entry) => entry.id === measure.id)!;
      for (const item of layer.items) item.visible = !item.visible;
    });
    const afterVisibility = measure.items.map((item) => item.visible);
    expect(afterVisibility).not.toEqual(beforeVisibility);

    store.undo();
    const undone = store.project!.layers.find((layer) => layer.id === measure.id)!;
    expect(undone.items.map((item) => item.visible)).toEqual(beforeVisibility);
    expect(ids(), "one undo restores the bulk edit, not the reorder").toEqual([
      "page_2",
      "page_3",
      "page_1",
    ]);

    store.redo();
    const redone = store.project!.layers.find((layer) => layer.id === measure.id)!;
    expect(redone.items.map((item) => item.visible)).toEqual(afterVisibility);
  });

  it("refuses reorder and insert in a read-only session", () => {
    store.setProject(baseProject(), PATH, false);
    store.setReadOnly(true);
    expect(store.reorderPage("page_1", 2)).toBe(false);
    expect(store.insertPageRecord("page_1", 0)).toBeNull();
    expect(ids()).toEqual(["page_1", "page_2", "page_3"]);
    expect(store.canUndo).toBe(false);
  });
});

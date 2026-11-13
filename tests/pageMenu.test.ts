// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ui/dialogs", () => ({
  showModal: vi.fn(async () => "insert"),
  confirmDialog: vi.fn(async () => true),
  textDialog: vi.fn(async () => null),
}));

import { confirmDialog, showModal } from "../src/ui/dialogs";
import { withTestPageIds } from "./helpers/pages";
import { deletePageFlow, type PageFlowHost } from "../src/app/pageFlows";
import {
  insertPageNear,
  movePageToPosition,
  PAGE_MENU_KEYSHORTCUTS,
  PAGE_SHORTCUTS,
  pageInsertTarget,
  pageMenu,
  pageMenuItems,
  pageMovePositions,
  pageMovePositionsForSelection,
  pageShortcutCommand,
  moveTargets,
} from "../src/features/pageMenu";
import { pageReorder } from "../src/features/pageReorder";
import { insertProjectPage, reorderPages, type PageActionHost } from "../src/features/pageModel";
import { pageStatus } from "../src/features/pageStatus";
import { clearAllRecovery, listRecoveryRecords } from "../src/features/sessionRecovery";
import { createProject, defaultDocument } from "../src/model/layers";
import type { Project } from "../src/model/types";
import type { PanelActions } from "../src/ui/panels";
import { store } from "../src/state/store";

const PATH = "/tmp/page-menu/Pages.gridscalr";

function baseProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 5)));
  project.pages[2].state = { name: "Sheet A-101" };
  project.pages[1].state = { scaleLocked: true };
  return project;
}

function ids(): string[] {
  return store.project!.pages.map((page) => page.id);
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
    registerCreatedDocuments: async () => undefined,
    installProject: async () => undefined,
    detachDocument: () => undefined,
  };
}

function flowHost(): PageFlowHost {
  return {
    addDocumentToRenderer: vi.fn(),
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

function fakeActions(overrides: Partial<PanelActions> = {}): PanelActions {
  return {
    goToPage: vi.fn(),
    insertPage: vi.fn(),
    reorderPages: vi.fn(),
    duplicatePage: vi.fn(),
    deletePage: vi.fn(),
    ...overrides,
  } as unknown as PanelActions;
}

function keyEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
}

/** Lets the checkpoint write and the action that follows it settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

/**
 * Waits for an assertion to pass. A structural action writes a recovery
 * checkpoint before it mutates the store, so a fixed sleep races the IndexedDB
 * write on a loaded coverage worker.
 */
async function waitFor(check: () => void, timeout = 3000): Promise<void> {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() >= deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

beforeEach(async () => {
  store.project = null;
  store.projectPath = null;
  store.fileStamp = null;
  store.dirty = false;
  store.readOnly = false;
  localStorage.clear();
  pageStatus.reset();
  vi.mocked(confirmDialog).mockReset();
  vi.mocked(confirmDialog).mockResolvedValue(true);
  vi.mocked(showModal).mockReset();
  vi.mocked(showModal).mockResolvedValue("insert");
  document.querySelectorAll(".popover").forEach((node) => node.remove());
  await clearAllRecovery().catch(() => undefined);
});

describe("page insert targets", () => {
  it("computes the index from the PageId and names the target position", () => {
    const project = baseProject();
    expect(pageInsertTarget(project, "page_3", "before")).toMatchObject({
      index: 2,
      page: 3,
      name: "Sheet A-101",
      direction: "before",
    });
    expect(pageInsertTarget(project, "page_3", "after")?.index).toBe(3);
    expect(pageInsertTarget(project, "page_5", "after")?.index).toBe(5);
    expect(pageInsertTarget(project, "page_missing", "before")).toBeNull();
  });

  it("does not shift when a status filter hides pages", () => {
    const project = baseProject();
    pageStatus.setFilter("lockedScale");
    expect(pageStatus.visible(project).map((row) => row.page)).toEqual([2]);
    // Page 4 is not on screen under this filter, yet its project index is 3.
    expect(pageInsertTarget(project, "page_4", "before")?.index).toBe(3);
    expect(pageInsertTarget(project, "page_4", "after")?.index).toBe(4);
  });
});

describe("page move positions", () => {
  it("omits the positions the page already occupies and offers the end", () => {
    const project = baseProject();
    const positions = pageMovePositions(project, "page_2");
    const indexes = positions.map((position) => position.index);
    // Both the position before page 2 and the one after it leave the order as is.
    expect(indexes).not.toContain(1);
    expect(indexes).not.toContain(2);
    expect(indexes[0]).toBe(0);
    expect(indexes[indexes.length - 1]).toBe(5);
    expect(positions[positions.length - 1].pageId).toBeNull();
    expect(pageMovePositions(project, "page_1").find((item) => item.index === 2)?.name).toBe(
      "Sheet A-101",
    );
  });
});

describe("page shortcuts", () => {
  it("maps navigation, insert and editing keys without touching canvas tools", () => {
    expect(pageShortcutCommand({ key: "PageDown" })).toBe("nextPage");
    expect(pageShortcutCommand({ key: "PageUp" })).toBe("previousPage");
    expect(pageShortcutCommand({ key: "PageUp", altKey: true })).toBe("insertBefore");
    expect(pageShortcutCommand({ key: "PageDown", altKey: true })).toBe("insertAfter");
    expect(pageShortcutCommand({ key: "m", altKey: true, shiftKey: true })).toBe("movePage");
    expect(pageShortcutCommand({ key: "D", altKey: true, shiftKey: true })).toBe("duplicatePage");
    expect(pageShortcutCommand({ key: "Delete", altKey: true, shiftKey: true })).toBe("deletePage");
    // Canvas tools and their Ctrl combinations stay untouched.
    expect(pageShortcutCommand({ key: "d" })).toBeNull();
    expect(pageShortcutCommand({ key: "d", ctrlKey: true })).toBeNull();
    expect(pageShortcutCommand({ key: "PageDown", ctrlKey: true })).toBeNull();
  });

  it("matches the in-app shortcut reference and the docs table", () => {
    const registry = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/ui/shortcuts.json"), "utf8"),
    ) as { actions: Record<string, string> };
    const docs = readFileSync(resolve(process.cwd(), "docs/shortcuts.md"), "utf8");
    for (const [command, shortcut] of Object.entries(PAGE_SHORTCUTS)) {
      expect(registry.actions[command]).toBe(shortcut);
      expect(docs).toContain(`\`${shortcut}\``);
    }
    expect(docs).toContain(`\`${PAGE_MENU_KEYSHORTCUTS}\``);
  });
});

describe("page keyboard commands", () => {
  it("navigates, duplicates and deletes the current page through PanelActions", () => {
    store.setProject(baseProject(), PATH, false);
    const actions = fakeActions();
    expect(pageMenu.handleKey(keyEvent({ key: "PageDown" }), actions)).toBe(true);
    expect(actions.goToPage).toHaveBeenCalledWith(2, true);
    expect(pageMenu.handleKey(keyEvent({ key: "d", altKey: true, shiftKey: true }), actions)).toBe(
      true,
    );
    expect(actions.duplicatePage).toHaveBeenCalledWith("page_1");
    expect(
      pageMenu.handleKey(keyEvent({ key: "Delete", altKey: true, shiftKey: true }), actions),
    ).toBe(true);
    expect(actions.deletePage).toHaveBeenCalledWith("page_1");
  });

  it("keeps navigation and refuses editing in a view-only session", () => {
    store.setProject(baseProject(), PATH, false);
    store.readOnly = true;
    const actions = fakeActions();
    expect(pageMenu.handleKey(keyEvent({ key: "PageDown" }), actions)).toBe(true);
    expect(actions.goToPage).toHaveBeenCalled();
    expect(pageMenu.handleKey(keyEvent({ key: "d", altKey: true, shiftKey: true }), actions)).toBe(
      false,
    );
    expect(actions.duplicatePage).not.toHaveBeenCalled();
  });

  it("inserts at the page-ID target and undo removes exactly that page", async () => {
    store.setProject(baseProject(), PATH, false);
    const before = ids();
    const actions = fakeActions({
      insertPage: (pageId, index) => void insertProjectPage(actionHost(), pageId, index),
    });
    await insertPageNear(actions, "page_2", "after");
    await waitFor(() => expect(ids()).toHaveLength(6));
    expect(vi.mocked(showModal)).toHaveBeenCalled();
    const inserted = ids()[2];
    expect(before).not.toContain(inserted);
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(ids()).toEqual(before);
    store.redo();
    expect(ids()[2]).toBe(inserted);
  });

  it("moves through the undoable reorder action and restores the order on undo", async () => {
    store.setProject(baseProject(), PATH, false);
    const before = ids();
    const actions = fakeActions({
      reorderPages: (pageIds, index) => void reorderPages(actionHost(), pageIds, index),
    });
    vi.mocked(showModal).mockResolvedValueOnce("move");
    await movePageToPosition(actions, ["page_1"]);
    await waitFor(() => expect(ids()).toEqual(["page_2", "page_1", "page_3", "page_4", "page_5"]));
    expect(store.canUndo).toBe(true);
    store.undo();
    expect(ids()).toEqual(before);
  });

  it("keeps the delete confirmation and its recovery checkpoint", async () => {
    store.setProject(baseProject(), PATH, false);
    const actions = fakeActions({
      deletePage: (pageId) => void deletePageFlow(flowHost(), pageId),
    });
    pageMenu.handleKey(keyEvent({ key: "Delete", altKey: true, shiftKey: true }), actions);
    await waitFor(() => expect(ids()).toEqual(["page_2", "page_3", "page_4", "page_5"]));
    expect(confirmDialog).toHaveBeenCalled();
    expect(store.canUndo).toBe(false);
    const records = await listRecoveryRecords();
    expect(records.some((record) => record.kind === "checkpoint")).toBe(true);
  });
});

describe("page card menu", () => {
  it("opens with Shift+F10, moves with the arrow keys and restores focus on Escape", async () => {
    store.setProject(baseProject(), PATH, false);
    const actions = fakeActions();
    const card = document.createElement("button");
    document.body.append(card);
    pageMenu.bindCard(card, "page_3", actions);
    card.focus();

    card.dispatchEvent(keyEvent({ key: "F10", shiftKey: true }));
    const popover = document.querySelector(".popover");
    expect(popover).not.toBeNull();
    const items = [...popover!.querySelectorAll<HTMLButtonElement>(".popover-item")];
    expect(document.activeElement).toBe(items[0]);

    items[0].dispatchEvent(keyEvent({ key: "ArrowDown" }));
    expect(document.activeElement).toBe(items[1]);
    items[1].dispatchEvent(keyEvent({ key: "End" }));
    expect(document.activeElement).toBe(items[items.length - 1]);
    items[items.length - 1].dispatchEvent(keyEvent({ key: "Home" }));
    expect(document.activeElement).toBe(items[0]);

    document.dispatchEvent(keyEvent({ key: "Escape" }));
    await flush();
    expect(document.querySelector(".popover")).toBeNull();
    expect(document.activeElement).toBe(card);
  });

  it("opens on the Menu key and runs the chosen action from the keyboard", () => {
    store.setProject(baseProject(), PATH, false);
    const actions = fakeActions();
    const card = document.createElement("button");
    document.body.append(card);
    pageMenu.bindCard(card, "page_3", actions);

    card.dispatchEvent(keyEvent({ key: "ContextMenu" }));
    const first = document.querySelector<HTMLButtonElement>(".popover .popover-item");
    expect(first?.textContent).toContain("Go to page 3");
    first?.click();
    expect(actions.goToPage).toHaveBeenCalledWith(3, true);
  });

  it("names the insert target in the menu, before anything changes", () => {
    const project = baseProject();
    const items = pageMenuItems(project, "page_3", fakeActions());
    const labels = items.map((item) => item.label).filter(Boolean) as string[];
    expect(labels).toContain("Insert before page 3 — Sheet A-101");
    expect(labels).toContain("Insert after page 3 — Sheet A-101");
    expect(labels).toContain("Move page to position…");
    expect(labels).toContain("Duplicate page…");
    expect(labels).toContain("Delete page…");
  });

  it("limits a read-only page to navigation", () => {
    store.setProject(baseProject(), PATH, false);
    store.readOnly = true;
    const items = pageMenuItems(store.project!, "page_3", fakeActions());
    expect(items.map((item) => item.label)).toEqual(["Go to page 3"]);
  });
});

describe("multi-page move targets", () => {
  function mountCards(project: Project): HTMLElement[] {
    document.body.innerHTML = "";
    const scroll = document.createElement("div");
    const list = document.createElement("div");
    list.className = "page-list";
    scroll.append(list);
    document.body.append(scroll);
    const cards = project.pages.map((page, index) => {
      const card = document.createElement("button");
      card.className = "page-card";
      card.dataset.pageId = page.id;
      card.dataset.page = String(index + 1);
      card.addEventListener("click", (event) => pageReorder.handleClick(event, page.id));
      list.append(card);
      return card;
    });
    pageReorder.reset();
    pageReorder.setActions({ reorder: vi.fn(), goToPage: vi.fn() });
    pageReorder.bindList(list, scroll);
    for (const card of cards) pageReorder.decorateCard(card, card.dataset.pageId ?? "");
    return cards;
  }

  it("offers only positions that change the block order", () => {
    const project = baseProject();
    store.setProject(project, PATH, false);
    const positions = pageMovePositionsForSelection(project, ["page_1", "page_2"]);
    expect(positions.map((position) => position.index)).toEqual([3, 4, 5]);
  });

  it("moves the whole Pages-panel selection through one reorder action", async () => {
    const project = baseProject();
    store.setProject(project, PATH, false);
    const cards = mountCards(project);
    cards[0].dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    cards[1].dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(moveTargets(store.project!, "page_1")).toEqual(["page_1", "page_2"]);
    const actions = fakeActions();
    vi.mocked(showModal).mockResolvedValueOnce("move");
    await movePageToPosition(actions, ["page_1", "page_2"]);
    expect(actions.reorderPages).toHaveBeenCalledWith(["page_1", "page_2"], 3);
    pageReorder.reset();
  });

  it("falls back to the current page when it is not part of the selection", () => {
    const project = baseProject();
    store.setProject(project, PATH, false);
    const cards = mountCards(project);
    cards[0].dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    cards[1].dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(moveTargets(store.project!, "page_4")).toEqual(["page_4"]);
    pageReorder.reset();
  });
});

// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { withTestPageIds } from "./helpers/pages";
import {
  dragSet,
  documentSegments,
  insertionIndexAt,
  keyboardInsertion,
  moveOutcome,
  pageReorder,
  planDrop,
  selectionAfterClick,
  type PageReorderEntry,
} from "../src/features/pageReorder";
import { reorderPages, type PageActionHost } from "../src/features/pageModel";
import { clearAllRecovery, listRecoveryRecords } from "../src/features/sessionRecovery";
import { createProject, defaultDocument } from "../src/model/layers";
import { pageListAfterMove, pageListOrderChanges, pageNumber } from "../src/model/pages";
import type { MarkupItem, Project } from "../src/model/types";
import { store } from "../src/state/store";

const PATH = "/tmp/page-reorder/Reorder.gridscalr";
const NOW = "2026-01-01T00:00:00.000Z";

function baseProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 3)));
  const second = {
    ...defaultDocument("Upper.pdf", 2),
    id: "doc_upper",
    sha256: "b".repeat(64),
  };
  project.documents.push(second);
  project.pages.push(
    { id: "page_4", documentId: second.id, localPage: 1, state: {} },
    { id: "page_5", documentId: second.id, localPage: 2, state: {} },
  );
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  for (const page of project.pages) {
    const item: MarkupItem = {
      id: `item_${page.id}`,
      pageId: page.id,
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
    measure.items.push(item);
  }
  // A per-page layer override and page state that must follow their PageId.
  measure.pageState = { page_1: { visible: false }, page_3: { locked: true } };
  project.pages[2].state = { name: "Third sheet", scaleLocked: true };
  return project;
}

function entries(project: Project): PageReorderEntry[] {
  return project.pages.map((page) => ({ id: page.id, documentId: page.documentId }));
}

function ids(project: Project): string[] {
  return project.pages.map((page) => page.id);
}

function host(): PageActionHost {
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

beforeEach(async () => {
  store.project = null;
  store.projectPath = null;
  store.fileStamp = null;
  store.dirty = false;
  store.readOnly = false;
  localStorage.clear();
  await clearAllRecovery().catch(() => undefined);
});

describe("page order math", () => {
  it("moves one page to an insertion index and keeps every ID stable", () => {
    const pages = ["a", "b", "c", "d"].map((id) => ({ id, documentId: "doc" }));
    expect(pageListAfterMove(pages, new Set(["a"]), 2).map((page) => page.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
    expect(pageListAfterMove(pages, new Set(["a"]), 4).map((page) => page.id)).toEqual([
      "b",
      "c",
      "d",
      "a",
    ]);
    expect(pageListAfterMove(pages, new Set(["d"]), 0).map((page) => page.id)).toEqual([
      "d",
      "a",
      "b",
      "c",
    ]);
  });

  it("moves only the selected pages and keeps their relative order", () => {
    const pages = ["a", "b", "c", "d", "e"].map((id) => ({ id, documentId: "doc" }));
    const moved = pageListAfterMove(pages, new Set(["b", "d"]), 5);
    expect(moved.map((page) => page.id)).toEqual(["a", "c", "e", "b", "d"]);
    expect(moved.map((page) => page.id).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("reports a no-op insertion instead of an order change", () => {
    const pages = ["a", "b", "c"].map((id) => ({ id, documentId: "doc" }));
    expect(pageListOrderChanges(pages, new Set(["b"]), 2)).toBe(false);
    expect(pageListOrderChanges(pages, new Set(["b"]), 3)).toBe(true);
    expect(pageListOrderChanges(pages, new Set(["b"]), 0)).toBe(true);
    expect(pageListOrderChanges(pages, new Set(), 1)).toBe(false);
  });

  it("produces the same order from a mouse drop and a keyboard move", () => {
    const pages = ["a", "b", "c", "d"].map((id) => ({ id, documentId: "doc" }));
    const selected = new Set(["b", "c"]);
    // Mouse: pointer lands just below the midpoint of the third card.
    const mouseInsertion = insertionIndexAt(
      [
        { top: 0, bottom: 20 },
        { top: 20, bottom: 40 },
        { top: 40, bottom: 60 },
        { top: 60, bottom: 80 },
      ],
      71,
    );
    expect(mouseInsertion).toBe(4);
    const mouseOrder = pageListAfterMove(pages, selected, mouseInsertion).map((page) => page.id);
    // Keyboard: Alt+End on the same selection.
    const keyboardIndex = keyboardInsertion(pages, selected, "end");
    expect(keyboardIndex).toBe(4);
    const keyboardOrder = pageListAfterMove(pages, selected, keyboardIndex!).map((page) => page.id);
    expect(keyboardOrder).toEqual(mouseOrder);
    expect(keyboardOrder).toEqual(["a", "d", "b", "c"]);
  });
});

describe("keyboard reorder targets", () => {
  it("steps a block past its neighbours and clamps at the ends", () => {
    const pages = ["a", "b", "c", "d"].map((id) => ({ id, documentId: "doc" }));
    expect(keyboardInsertion(pages, new Set(["b"]), "up")).toBe(0);
    expect(keyboardInsertion(pages, new Set(["b"]), "down")).toBe(3);
    expect(keyboardInsertion(pages, new Set(["b", "c"]), "down")).toBe(4);
    expect(keyboardInsertion(pages, new Set(["b", "c"]), "up")).toBe(0);
    expect(keyboardInsertion(pages, new Set(["b"]), "home")).toBe(0);
    expect(keyboardInsertion(pages, new Set(["b"]), "end")).toBe(4);
    expect(keyboardInsertion(pages, new Set(), "down")).toBeNull();
  });

  it("treats a move at the top of the list as a no-op", () => {
    const pages = ["a", "b"].map((id) => ({ id, documentId: "doc" }));
    const selection = new Set(["a"]);
    const insertion = keyboardInsertion(pages, selection, "up");
    expect(insertion).toBe(0);
    expect(planDrop(pages, selection, insertion ?? 0).changesOrder).toBe(false);
  });
});

describe("selection and drag set", () => {
  const pages = ["a", "b", "c", "d"].map((id) => ({ id, documentId: "doc" }));

  it("replaces, toggles and ranges with anchors", () => {
    expect(selectionAfterClick(pages, ["a"], "a", "c", "replace")).toEqual({
      ids: ["c"],
      anchor: "c",
    });
    expect(selectionAfterClick(pages, ["a"], "a", "c", "toggle")).toEqual({
      ids: ["a", "c"],
      anchor: "c",
    });
    expect(selectionAfterClick(pages, ["c"], "c", "a", "range")).toEqual({
      ids: ["a", "b", "c"],
      anchor: "c",
    });
    expect(selectionAfterClick(pages, ["a"], "a", "d", "range")).toEqual({
      ids: ["a", "b", "c", "d"],
      anchor: "a",
    });
  });

  it("moves the whole selection when a selected card is grabbed", () => {
    expect(dragSet(pages, new Set(["b", "d"]), "b")).toEqual(["b", "d"]);
    expect(dragSet(pages, new Set(["b", "d"]), "c")).toEqual(["c"]);
  });
});

describe("document boundaries and cross-document drops", () => {
  it("reports one segment per consecutive document run", () => {
    const pages = [
      { id: "a", documentId: "doc_1" },
      { id: "b", documentId: "doc_1" },
      { id: "c", documentId: "doc_2" },
      { id: "d", documentId: "doc_1" },
    ];
    expect(documentSegments(pages)).toEqual([
      { documentId: "doc_1", start: 0, count: 2 },
      { documentId: "doc_2", start: 2, count: 1 },
      { documentId: "doc_1", start: 3, count: 1 },
    ]);
  });

  it("marks a drop next to another document as cross-document", () => {
    const project = baseProject();
    const list = entries(project);
    // Page 1 belongs to Plan.pdf; inserting before page 4 (Upper.pdf) crosses over.
    const plan = planDrop(list, new Set(["page_1"]), 3);
    expect(plan.targetDocumentId).toBe("doc_upper");
    expect(plan.crossDocument).toBe(true);
    expect(plan.changesOrder).toBe(true);
    // A move inside the same document run is not cross-document.
    const sameDocument = planDrop(list, new Set(["page_3"]), 0);
    expect(sameDocument.crossDocument).toBe(false);
    expect(sameDocument.targetDocumentId).toBe(project.documents[0].id);
  });

  it("reports the landing range for announcements", () => {
    const pages = ["a", "b", "c", "d"].map((id) => ({ id, documentId: "doc" }));
    expect(moveOutcome(pages, new Set(["b", "c"]), 4)).toEqual({
      startIndex: 2,
      count: 2,
      total: 4,
    });
  });
});

describe("pages panel controller", () => {
  interface ReorderCall {
    pageIds: string[];
    insertionIndex: number;
  }

  function mount(project: Project): {
    list: HTMLElement;
    cards: HTMLElement[];
    calls: ReorderCall[];
    navigations: number[];
  } {
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
      card.getBoundingClientRect = () =>
        ({
          top: index * 20,
          bottom: index * 20 + 20,
          left: 0,
          right: 100,
          height: 20,
          width: 100,
          x: 0,
          y: index * 20,
          toJSON: () => ({}),
        }) as DOMRect;
      list.append(card);
      // The panel wires the same listeners; dispatching real events keeps the
      // test on the public surface instead of the controller's internals.
      card.addEventListener("click", (event) => {
        if (pageReorder.handleClick(event, page.id)) navigations.push(index + 1);
      });
      card.addEventListener("dragstart", (event) =>
        pageReorder.handleDragStart(event, page.id, card),
      );
      card.addEventListener("dragend", () => pageReorder.handleDragEnd());
      card.addEventListener("keydown", (event) => pageReorder.handleKeyDown(event, page.id));
      return card;
    });
    const calls: ReorderCall[] = [];
    const navigations: number[] = [];
    pageReorder.setActions({
      reorder: (pageIds, insertionIndex) => calls.push({ pageIds: [...pageIds], insertionIndex }),
      goToPage: (page) => navigations.push(page),
    });
    pageReorder.bindList(list, scroll);
    for (const card of cards) pageReorder.decorateCard(card, card.dataset.pageId ?? "");
    return { list, cards, calls, navigations };
  }

  function drag(type: string, target: HTMLElement, clientY = 0): void {
    target.dispatchEvent(new MouseEvent(type, { clientY, clientX: 10, bubbles: true }));
  }

  beforeEach(() => pageReorder.reset());

  it("selects with Ctrl without navigating", () => {
    const project = baseProject();
    store.setProject(project, PATH, false);
    const { cards, navigations } = mount(project);
    cards[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(navigations).toEqual([1]);
    cards[0].dispatchEvent(new MouseEvent("click", { ctrlKey: true, bubbles: true }));
    cards[2].dispatchEvent(new MouseEvent("click", { ctrlKey: true, bubbles: true }));
    expect(navigations).toEqual([1]);
    expect(cards[0].classList.contains("is-selected")).toBe(true);
    expect(cards[2].classList.contains("is-selected")).toBe(true);
    expect(cards[0].getAttribute("aria-pressed")).toBe("true");
    expect(cards[1].getAttribute("aria-pressed")).toBeNull();
  });

  it("drags exactly the selected pages and applies one drop", () => {
    const project = baseProject();
    store.setProject(project, PATH, false);
    const { list, cards, calls } = mount(project);
    cards[0].dispatchEvent(new MouseEvent("click", { ctrlKey: true, bubbles: true }));
    cards[3].dispatchEvent(new MouseEvent("click", { ctrlKey: true, bubbles: true }));
    drag("dragstart", cards[3]);
    expect(cards[0].classList.contains("is-dragging")).toBe(true);
    expect(cards[3].classList.contains("is-dragging")).toBe(true);
    expect(cards[1].classList.contains("is-dragging")).toBe(false);
    drag("dragover", list, 200);
    drag("drop", list, 200);
    expect(calls).toHaveLength(1);
    expect(calls[0].pageIds).toEqual(["page_1", "page_4"]);
    expect(calls[0].insertionIndex).toBe(project.pages.length);
  });

  it("labels a cross-document drop in the indicator", () => {
    const project = baseProject();
    store.setProject(project, PATH, false);
    const { list, cards } = mount(project);
    drag("dragstart", cards[0]);
    // Pointer just above the midpoint of the first Upper.pdf card (index 3).
    drag("dragover", list, 62);
    const line = list.querySelector<HTMLElement>(".page-drop-line");
    expect(line?.hidden).toBe(false);
    expect(line?.classList.contains("is-cross-document")).toBe(true);
    const label = line?.querySelector<HTMLElement>(".page-drop-label");
    expect(label?.hidden).toBe(false);
    expect(label?.textContent).toBe("Move to Upper.pdf");
  });

  it("reorders from the keyboard and announces the new position", () => {
    const project = baseProject();
    store.setProject(project, PATH, false);
    const { cards, calls } = mount(project);
    cards[2].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ pageIds: ["page_3"], insertionIndex: 1 });
    const status = document.querySelector(".page-reorder-announcer");
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.textContent).toBe("Page moved to position 2 of 5.");
  });

  it("ignores the reorder keys without Alt and in a read-only session", () => {
    const project = baseProject();
    store.setProject(project, PATH, false);
    const { cards, calls } = mount(project);
    cards[2].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    store.setReadOnly(true);
    cards[2].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }),
    );
    expect(calls).toHaveLength(0);
  });
});

describe("multi-page move through the store", () => {
  it("keeps page IDs, items and layer page state attached", async () => {
    const project = baseProject();
    store.setProject(project, PATH, false);
    const before = new Map(
      project.layers.flatMap((layer) => layer.items).map((item) => [item.id, item.pageId] as const),
    );

    const moved = await reorderPages(host(), ["page_2", "page_3"], 5);
    expect(moved).toBe(true);

    const current = store.project!;
    expect(ids(current)).toEqual(["page_1", "page_4", "page_5", "page_2", "page_3"]);
    expect(pageNumber(current, "page_2")).toBe(4);
    expect(pageNumber(current, "page_3")).toBe(5);
    for (const layer of current.layers) {
      for (const item of layer.items) {
        expect(item.pageId).toBe(before.get(item.id));
      }
    }
    const measure = current.layers.find((layer) => layer.kind === "measure")!;
    expect(measure.pageState).toEqual({ page_1: { visible: false }, page_3: { locked: true } });
    expect(current.pages[4].state).toMatchObject({ name: "Third sheet", scaleLocked: true });
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(ids(store.project!)).toEqual(["page_1", "page_2", "page_3", "page_4", "page_5"]);
    expect(pageNumber(store.project!, "page_2")).toBe(2);
    store.redo();
    expect(ids(store.project!)).toEqual(["page_1", "page_4", "page_5", "page_2", "page_3"]);
  });

  it("writes exactly one structural checkpoint per drop", async () => {
    const project = baseProject();
    store.setProject(project, PATH, false);
    const before = (await listRecoveryRecords()).length;
    await reorderPages(host(), ["page_2", "page_4"], 0);
    const after = await listRecoveryRecords();
    const checkpoints = after.filter((record) => record.kind === "checkpoint");
    expect(after.length).toBe(before + 1);
    expect(checkpoints.some((record) => (record.label ?? "").includes("2 pages"))).toBe(true);
  });

  it("writes no checkpoint when the drop does not change the order", async () => {
    const project = baseProject();
    store.setProject(project, PATH, false);
    const before = (await listRecoveryRecords()).length;
    const moved = await reorderPages(host(), ["page_1"], 1);
    expect(moved).toBe(false);
    expect((await listRecoveryRecords()).length).toBe(before);
    expect(ids(store.project!)).toEqual(["page_1", "page_2", "page_3", "page_4", "page_5"]);
  });

  it("refuses every reorder in a read-only session", () => {
    const project = baseProject();
    store.setProject(project, PATH, false);
    store.setReadOnly(true);
    expect(store.reorderPages(["page_4"], 0)).toBe(false);
    expect(ids(store.project!)).toEqual(["page_1", "page_2", "page_3", "page_4", "page_5"]);
  });
});

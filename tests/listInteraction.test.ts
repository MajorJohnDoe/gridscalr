// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  ListReorderController,
  RowNavigator,
  collapseAllKeys,
  dragSet,
  expandAllKeys,
  insertionIndexAt,
  keyboardInsertion,
  matchesFilterText,
  moveChangesOrder,
  moveEntries,
  moveOutcome,
  normalizeFilterQuery,
  orderedSelection,
  pruneSelection,
  selectionAfterClick,
  toggleCollapsedKey,
  type ListEntry,
} from "../src/features/listInteraction";

const entries: ListEntry[] = ["a", "b", "c", "d", "e"].map((id) => ({ id }));

describe("shared list selection", () => {
  it("replaces, toggles and ranges with one anchor", () => {
    expect(selectionAfterClick(entries, [], null, "c", "replace")).toEqual({
      ids: ["c"],
      anchor: "c",
    });
    expect(selectionAfterClick(entries, ["a"], "a", "c", "toggle")).toEqual({
      ids: ["a", "c"],
      anchor: "c",
    });
    expect(selectionAfterClick(entries, ["a", "c"], "c", "c", "toggle")).toEqual({
      ids: ["a"],
      anchor: "c",
    });
    expect(selectionAfterClick(entries, ["a"], "a", "d", "range")).toEqual({
      ids: ["a", "b", "c", "d"],
      anchor: "a",
    });
    expect(selectionAfterClick(entries, ["d"], "d", "b", "range")).toEqual({
      ids: ["b", "c", "d"],
      anchor: "d",
    });
    // A range without an anchor behaves like a plain click.
    expect(selectionAfterClick(entries, [], null, "c", "range")).toEqual({
      ids: ["c"],
      anchor: "c",
    });
  });

  it("keeps the last row selected when a toggle would empty the list", () => {
    expect(selectionAfterClick(entries, ["c"], "c", "c", "toggle")).toEqual({
      ids: ["c"],
      anchor: "c",
    });
  });

  it("orders, prunes and drags the selection", () => {
    const selected = new Set(["d", "b"]);
    expect(orderedSelection(entries, selected)).toEqual(["b", "d"]);
    expect(dragSet(entries, selected, "d")).toEqual(["b", "d"]);
    expect(dragSet(entries, selected, "a")).toEqual(["a"]);
    expect(pruneSelection(entries, ["a", "gone", "e"])).toEqual(["a", "e"]);
  });
});

describe("shared list movement", () => {
  it("moves a block to an insertion index and preserves its order", () => {
    expect(moveEntries(entries, new Set(["a"]), 2).map((entry) => entry.id)).toEqual([
      "b",
      "a",
      "c",
      "d",
      "e",
    ]);
    expect(moveEntries(entries, new Set(["a", "c"]), 5).map((entry) => entry.id)).toEqual([
      "b",
      "d",
      "e",
      "a",
      "c",
    ]);
    expect(moveEntries(entries, new Set(["e"]), 0).map((entry) => entry.id)).toEqual([
      "e",
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("reports a no-op instead of pretending the order changed", () => {
    expect(moveChangesOrder(entries, new Set(["b"]), 1)).toBe(false);
    expect(moveChangesOrder(entries, new Set(["b"]), 2)).toBe(false);
    expect(moveChangesOrder(entries, new Set(["b"]), 0)).toBe(true);
  });

  it("steps a keyboard move past its neighbours and clamps at the ends", () => {
    expect(keyboardInsertion(entries, new Set(["c"]), "up")).toBe(1);
    expect(keyboardInsertion(entries, new Set(["c"]), "down")).toBe(4);
    expect(keyboardInsertion(entries, new Set(["b", "c"]), "up")).toBe(0);
    expect(keyboardInsertion(entries, new Set(["b", "c"]), "down")).toBe(4);
    expect(keyboardInsertion(entries, new Set(["c"]), "home")).toBe(0);
    expect(keyboardInsertion(entries, new Set(["c"]), "end")).toBe(5);
    expect(keyboardInsertion(entries, new Set(), "up")).toBeNull();
  });

  it("finds the insertion index under a pointer", () => {
    const spans = [
      { top: 0, bottom: 20 },
      { top: 20, bottom: 40 },
      { top: 40, bottom: 60 },
    ];
    expect(insertionIndexAt(spans, 5)).toBe(0);
    expect(insertionIndexAt(spans, 19)).toBe(1);
    expect(insertionIndexAt(spans, 39)).toBe(2);
    expect(insertionIndexAt(spans, 80)).toBe(3);
  });

  it("reports the landing range for an announcement", () => {
    expect(moveOutcome(entries, new Set(["a", "b"]), 3)).toEqual({
      startIndex: 1,
      count: 2,
      total: 5,
    });
  });
});

describe("shared list filters and collapse state", () => {
  it("matches case and locale-insensitively", () => {
    expect(normalizeFilterQuery("  RÖRELSE ")).toBe("rörelse");
    expect(matchesFilterText("Rörelsefog på plan 2", normalizeFilterQuery("RÖRELSE"))).toBe(true);
    expect(matchesFilterText("Rörelsefog", normalizeFilterQuery("fog"))).toBe(true);
    expect(matchesFilterText("Rörelsefog", normalizeFilterQuery("dörr"))).toBe(false);
    expect(matchesFilterText("anything", "")).toBe(true);
  });

  it("toggles one group and expands or collapses the whole set", () => {
    const collapsed = toggleCollapsedKey(new Set(), "a");
    expect([...collapsed]).toEqual(["a"]);
    expect([...toggleCollapsedKey(collapsed, "a")]).toEqual([]);
    expect([...collapseAllKeys(["a", "b", "c"])]).toEqual(["a", "b", "c"]);
    expect([...expandAllKeys()]).toEqual([]);
  });
});

describe("shared list reorder controller", () => {
  interface Call {
    ids: string[];
    index: number;
    changesOrder: boolean;
  }

  function mount(options: { canReorder?: boolean } = {}) {
    document.body.innerHTML = "";
    const scroll = document.createElement("div");
    const list = document.createElement("div");
    list.className = "test-list";
    scroll.append(list);
    document.body.append(scroll);
    const calls: Call[] = [];
    const announces: string[] = [];
    const controller = new ListReorderController<{ id: string }>({
      rowSelector: ".test-row",
      rowId: (row) => row.dataset.id ?? null,
      entries: () => entries,
      canReorder: () => options.canReorder !== false,
      dragMime: "application/x-test-order",
      onMove: (ids, index, changesOrder) => calls.push({ ids: [...ids], index, changesOrder }),
      announce: (_ids, outcome) => {
        const message = `moved ${outcome.startIndex + 1} of ${outcome.total}`;
        announces.push(message);
        return message;
      },
      dropLineClass: "test-drop-line",
      announcerClass: "test-announcer",
    });
    const rows = entries.map((entry, index) => {
      const row = document.createElement("div");
      row.className = "test-row";
      row.dataset.id = entry.id;
      row.getBoundingClientRect = () =>
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
      row.addEventListener("keydown", (event) => controller.handleKeyDown(event, entry.id));
      list.append(row);
      return row;
    });
    controller.bindList(list, scroll);
    return { controller, list, rows, calls, announces };
  }

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("drags one row and applies the drop exactly once", () => {
    const { controller, list, rows, calls } = mount();
    controller.handleDragStart(
      new MouseEvent("dragstart", { bubbles: true }) as DragEvent,
      "b",
      rows[1],
    );
    expect(rows[1].classList.contains("is-dragging")).toBe(true);
    list.dispatchEvent(new MouseEvent("dragover", { bubbles: true, clientX: 10, clientY: 85 }));
    const line = list.querySelector<HTMLElement>(".test-drop-line");
    expect(line?.hidden).toBe(false);
    list.dispatchEvent(new MouseEvent("drop", { bubbles: true, clientX: 10, clientY: 85 }));
    expect(calls).toEqual([{ ids: ["b"], index: 4, changesOrder: true }]);
    expect(rows[1].classList.contains("is-dragging")).toBe(false);
  });

  it("reports an unchanged drop without pretending it reordered", () => {
    const { controller, list, rows, calls } = mount();
    controller.handleDragStart(
      new MouseEvent("dragstart", { bubbles: true }) as DragEvent,
      "b",
      rows[1],
    );
    list.dispatchEvent(new MouseEvent("dragover", { bubbles: true, clientX: 10, clientY: 25 }));
    list.dispatchEvent(new MouseEvent("drop", { bubbles: true, clientX: 10, clientY: 25 }));
    expect(calls).toEqual([{ ids: ["b"], index: 1, changesOrder: false }]);
  });

  it("moves with Alt+Arrow and announces the new position", () => {
    const { rows, calls } = mount();
    rows[2].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }),
    );
    expect(calls).toEqual([{ ids: ["c"], index: 4, changesOrder: true }]);
    expect(document.querySelector(".test-announcer")?.textContent).toBe("moved 4 of 5");
  });

  it("ignores reorder keys without Alt and keeps a read-only list still", () => {
    const { rows, calls } = mount({ canReorder: false });
    rows[2].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    rows[2].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", altKey: true, bubbles: true }),
    );
    expect(calls).toHaveLength(0);
  });
});

describe("row focus navigation", () => {
  it("moves focus with the arrow keys and ignores nested controls", () => {
    document.body.innerHTML = "";
    const list = document.createElement("div");
    document.body.append(list);
    const rows = ["a", "b", "c"].map((id) => {
      const row = document.createElement("div");
      row.className = "nav-row";
      row.dataset.id = id;
      row.tabIndex = 0;
      row.textContent = id;
      list.append(row);
      return row;
    });
    const navigator = new RowNavigator(".nav-row");
    navigator.bind(list);
    rows[0].focus();
    rows[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(rows[1]);
    rows[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(rows[2]);
    rows[2].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(rows[0]);
    // Alt+Arrow belongs to the reorder controller, not focus navigation.
    rows[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }),
    );
    expect(document.activeElement).toBe(rows[0]);
    navigator.detach();
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { dragPointer, pointerEvent, pressAndMove, rect } from "./helpers/pointer";
import {
  ListReorderController,
  PointerRowDrag,
  RowNavigator,
  collapseAllKeys,
  dragSet,
  dropLinePlacement,
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
  rowIndexAt,
  rowMoveGuideIndex,
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

describe("windowed list selection", () => {
  it("clamps a Shift range to the mounted window instead of the full list", () => {
    const all = Array.from({ length: 300 }, (_value, index) => ({ id: `p${index + 1}` }));
    let visible = all;
    const controller = new ListReorderController({
      rowSelector: ".row",
      rowId: () => null,
      entries: () => all,
      visibleEntries: () => visible,
      canReorder: () => true,
      selectable: true,
      onMove: () => undefined,
      announce: () => "",
    });

    // Select page 1, then jump the window far away.
    controller.handleClick(new MouseEvent("click"), "p1");
    visible = all.slice(200);
    controller.handleClick(new MouseEvent("click", { shiftKey: true }), "p250");
    // The anchor is not mounted, so the range falls back to the clicked row.
    expect(controller.selectionIds()).toEqual(["p250"]);

    // A range inside the mounted window still works.
    controller.handleClick(new MouseEvent("click"), "p210");
    controller.handleClick(new MouseEvent("click", { shiftKey: true }), "p215");
    expect(controller.selectionIds()).toEqual(["p210", "p211", "p212", "p213", "p214", "p215"]);
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

  it("resolves the row under a pointer, or the nearest row", () => {
    const spans = [
      { top: 0, bottom: 20 },
      { top: 20, bottom: 40 },
      { top: 40, bottom: 60 },
    ];
    expect(rowIndexAt(spans, 5)).toBe(0);
    expect(rowIndexAt(spans, 32)).toBe(1);
    expect(rowIndexAt(spans, 55)).toBe(2);
    expect(rowIndexAt(spans, 200)).toBe(2);
    expect(rowIndexAt(spans, -20)).toBe(0);
    expect(rowIndexAt([], 0)).toBe(-1);
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

describe("shared drag feedback", () => {
  const rows = [0, 1, 2].map((index) => ({
    top: index * 20,
    bottom: index * 20 + 20,
    left: 10,
    right: 110,
  }));
  const list = { top: 0, bottom: 60, left: 0, right: 120 };
  const viewport = { top: 0, bottom: 800, left: 0, right: 1200 };

  it("places the line at the row boundary the drop will land on", () => {
    expect(dropLinePlacement(rows, 0, list, viewport)).toMatchObject({ top: 0, visible: true });
    expect(dropLinePlacement(rows, 1, list, viewport)).toMatchObject({ top: 20, visible: true });
    expect(dropLinePlacement(rows, 2, list, viewport)).toMatchObject({ top: 40, visible: true });
    // Past the end: the line sits under the last row, kept inside the list.
    expect(dropLinePlacement(rows, 3, list, viewport)).toMatchObject({ top: 57, visible: true });
    expect(dropLinePlacement(rows, 99, list, viewport)).toMatchObject({ top: 57, visible: true });
  });

  it("spans the full row width inside the panel inset", () => {
    const placement = dropLinePlacement(rows, 1, list, viewport);
    expect(placement.left).toBe(7);
    expect(placement.width).toBe(106);
  });

  it("keeps the line on screen when the boundary is scrolled out of the panel", () => {
    // The list is scrolled up so its first rows are above the viewport.
    const scrolled = { top: -200, bottom: 10, left: 0, right: 120 };
    const scrolledRows = rows.map((row) => ({
      ...row,
      top: row.top - 220,
      bottom: row.bottom - 220,
    }));
    const above = dropLinePlacement(scrolledRows, 0, scrolled, viewport);
    expect(above.visible).toBe(true);
    expect(above.top).toBe(0);
    // A long list whose drop slot is below the visible part draws at the edge.
    const long = { top: -1000, bottom: 900, left: 0, right: 120 };
    const longRows = rows.map((row) => ({
      ...row,
      top: row.top + 860,
      bottom: row.bottom + 860,
    }));
    const below = dropLinePlacement(longRows, 3, long, viewport);
    expect(below.visible).toBe(true);
    expect(below.top).toBe(797);
  });

  it("draws nothing once the list has left the viewport", () => {
    const offscreen = { top: 900, bottom: 1000, left: 0, right: 120 };
    expect(dropLinePlacement(rows, 1, offscreen, viewport).visible).toBe(false);
  });

  it("draws the line at the top of an empty list", () => {
    expect(dropLinePlacement([], 0, list, viewport)).toMatchObject({ top: 0, visible: true });
  });

  it("puts a row-onto-row drop at the position the row will take", () => {
    const spans = [
      { top: 0, bottom: 20 },
      { top: 20, bottom: 40 },
      { top: 40, bottom: 60 },
    ];
    // Moving down lands after the hovered row, moving up before it.
    expect(rowMoveGuideIndex(spans, 50, 0)).toBe(3);
    expect(rowMoveGuideIndex(spans, 30, 2)).toBe(1);
    // Hovering the grabbed row itself keeps the line at its own top edge.
    expect(rowMoveGuideIndex(spans, 25, 1)).toBe(1);
    expect(rowMoveGuideIndex([], 25, 4)).toBe(4);
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

  function mount(options: { canReorder?: boolean; selectable?: boolean } = {}) {
    document.body.innerHTML = "";
    const scroll = document.createElement("div");
    const list = document.createElement("div");
    list.className = "test-list";
    list.getBoundingClientRect = () => rect(0, 0, 100, 100);
    scroll.getBoundingClientRect = () => rect(0, 0, 100, 100);
    scroll.append(list);
    document.body.append(scroll);
    const calls: Call[] = [];
    const announces: string[] = [];
    const controller = new ListReorderController<{ id: string }>({
      rowSelector: ".test-row",
      rowId: (row) => row.dataset.id ?? null,
      entries: () => entries,
      canReorder: () => options.canReorder !== false,
      selectable: options.selectable === true,
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
    const { rows, calls } = mount();
    const press = pressAndMove({ target: rows[1], x: 10, y: 30 }, { x: 10, y: 85 });
    expect(rows[1].classList.contains("is-dragging")).toBe(true);
    const line = document.querySelector<HTMLElement>(".test-drop-line");
    expect(line?.hidden).toBe(false);
    press.release({ x: 10, y: 85 });
    expect(calls).toEqual([{ ids: ["b"], index: 4, changesOrder: true }]);
    expect(rows[1].classList.contains("is-dragging")).toBe(false);
  });

  it("shows the insertion line at the drop position while a row is held", () => {
    const { rows } = mount();
    const press = pressAndMove({ target: rows[1], x: 10, y: 30 }, { x: 10, y: 60 });
    const line = document.querySelector<HTMLElement>(".test-drop-line");
    // The line is a viewport overlay: it can never be clipped by the panel.
    expect(line).toBeTruthy();
    expect(line?.parentElement).toBe(document.body);
    expect(line?.hidden).toBe(false);
    // Insertion index 3 is the top edge of row "d" at y = 60.
    expect(line?.style.top).toBe("60px");
    expect(line?.style.left).toBe("7px");
    expect(line?.style.width).toBe("86px");
    // The held row is marked while the pointer is down.
    expect(rows[1].classList.contains("is-dragging")).toBe(true);
    press.release({ x: 10, y: 60 });
    expect(document.querySelector<HTMLElement>(".test-drop-line")?.hidden).toBe(true);
    expect(rows[1].classList.contains("is-dragging")).toBe(false);
  });

  it("holds every row of a multi-selection drag", () => {
    const { controller, rows } = mount({ selectable: true });
    controller.handleClick(new MouseEvent("click", { ctrlKey: true, bubbles: true }), "b");
    controller.handleClick(new MouseEvent("click", { ctrlKey: true, bubbles: true }), "d");
    const press = pressAndMove({ target: rows[3], x: 10, y: 70 }, { x: 10, y: 5 });
    expect(rows[1].classList.contains("is-dragging")).toBe(true);
    expect(rows[3].classList.contains("is-dragging")).toBe(true);
    expect(rows[0].classList.contains("is-dragging")).toBe(false);
    expect(rows[2].classList.contains("is-dragging")).toBe(false);
    press.release({ x: 10, y: 5 });
    expect(rows.some((row) => row.classList.contains("is-dragging"))).toBe(false);
  });

  it("draws the default line for a list that moves a row onto a row", () => {
    document.body.innerHTML = "";
    const list = document.createElement("div");
    list.getBoundingClientRect = () => rect(0, 0, 200, 110);
    document.body.append(list);
    const rows = [0, 1, 2].map((index) => {
      const row = document.createElement("div");
      row.className = "column-row";
      row.getBoundingClientRect = () => rect(index * 30, 0, 200, 30);
      list.append(row);
      return row;
    });
    // The takeoff builder columns report no guide index, so the helper falls
    // back to the row-under-pointer boundary.
    new PointerRowDrag({
      rowSelector: ".column-row",
      canStart: () => true,
      onStart: () => true,
      onMove: () => undefined,
      onDrop: () => undefined,
      onCancel: () => undefined,
    }).bind(list);
    const press = pressAndMove({ target: rows[0], x: 10, y: 10 }, { x: 10, y: 70 });
    const line = document.querySelector<HTMLElement>(".list-drop-line");
    expect(line?.hidden).toBe(false);
    // Hovering the last row while dragging the first lands the row after it.
    expect(line?.style.top).toBe("90px");
    expect(rows[0].classList.contains("is-dragging")).toBe(true);
    press.release({ x: 10, y: 70 });
  });

  it("reports an unchanged drop without pretending it reordered", () => {
    const { rows, calls } = mount();
    dragPointer({ target: rows[1], x: 10, y: 30 }, { x: 10, y: 25 });
    expect(calls).toEqual([{ ids: ["b"], index: 1, changesOrder: false }]);
  });

  it("does not start a drag before the pointer moves past the threshold", () => {
    const { rows, calls } = mount();
    const press = pressAndMove({ target: rows[1], x: 10, y: 30 }, { x: 10, y: 31 });
    expect(rows[1].classList.contains("is-dragging")).toBe(false);
    window.dispatchEvent(pointerEvent("pointermove", { clientX: 10, clientY: 85 }));
    expect(rows[1].classList.contains("is-dragging")).toBe(true);
    press.release({ x: 10, y: 85 });
    expect(calls).toEqual([{ ids: ["b"], index: 4, changesOrder: true }]);
  });

  it("keeps a finger scroll and a secondary pointer out of the drag", () => {
    const { rows, calls } = mount();
    dragPointer({ target: rows[1], x: 10, y: 30 }, { x: 10, y: 85 }, "touch");
    dragPointer({ target: rows[1], x: 10, y: 30, isPrimary: false }, { x: 10, y: 85 });
    expect(calls).toHaveLength(0);
  });

  it("leaves a press on a row control to that control", () => {
    const { rows, calls } = mount();
    const button = document.createElement("button");
    rows[1].append(button);
    dragPointer({ target: button, x: 10, y: 30 }, { x: 10, y: 85 });
    expect(rows[1].classList.contains("is-dragging")).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("cancels a held row on Escape and applies no move", () => {
    const { rows, calls } = mount();
    const press = pressAndMove({ target: rows[1], x: 10, y: 30 }, { x: 10, y: 85 });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(rows[1].classList.contains("is-dragging")).toBe(false);
    press.release({ x: 10, y: 85 });
    expect(calls).toHaveLength(0);
  });

  it("applies no move when the pointer is released outside the list", () => {
    const { rows, calls } = mount();
    dragPointer({ target: rows[1], x: 10, y: 30 }, { x: 400, y: 85 });
    expect(calls).toHaveLength(0);
  });

  it("does not start a drag in a read-only list", () => {
    const { rows, calls } = mount({ canReorder: false });
    dragPointer({ target: rows[1], x: 10, y: 30 }, { x: 10, y: 85 });
    expect(rows[1].classList.contains("is-dragging")).toBe(false);
    expect(calls).toHaveLength(0);
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

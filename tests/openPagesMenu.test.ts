import { describe, expect, it, vi } from "vitest";
import {
  closeOtherPageTabs,
  hasSinglePreview,
  makePreviewTab,
  pageCardTabMenuItems,
  pageTabInfo,
  promotePageTab,
  tabFocusIndex,
  tabKeyboardCommand,
  tabMenuItems,
  type OpenPageTabInfo,
  type OpenPagesState,
} from "../src/features/openPages";

const A = "page_a";
const B = "page_b";
const C = "page_c";

function state(
  tabs: ReadonlyArray<[string, boolean]>,
  activePageId: string | null,
): OpenPagesState {
  return { tabs: tabs.map(([pageId, pinned]) => ({ pageId, pinned })), activePageId };
}

function ids(value: OpenPagesState): string[] {
  return value.tabs.map((tab) => tab.pageId);
}

function labels(items: ReturnType<typeof tabMenuItems>): string[] {
  return items.flatMap((item) => (item.label ? [item.label] : []));
}

function byLabel(items: ReturnType<typeof tabMenuItems>, label: string) {
  const item = items.find((entry) => entry.label === label);
  if (!item) throw new Error(`missing menu item ${label}`);
  return item;
}

function handlers() {
  return {
    pin: vi.fn(),
    preview: vi.fn(),
    close: vi.fn(),
    closeOthers: vi.fn(),
  };
}

describe("tab context menu model", () => {
  it("enables Pin and disables Preview on the preview tab, with close disabled for one tab", () => {
    const items = tabMenuItems(state([[A, false]], A), A, handlers());
    expect(labels(items)).toEqual(["Pin tab", "Preview", "Close tab", "Close other tabs"]);
    expect(byLabel(items, "Pin tab").disabled).toBe(false);
    expect(byLabel(items, "Preview").disabled).toBe(true);
    expect(byLabel(items, "Close tab").disabled).toBe(true);
    expect(byLabel(items, "Close other tabs").disabled).toBe(true);
  });

  it("enables Close and Close others on a preview tab when another tab is open", () => {
    const items = tabMenuItems(
      state(
        [
          [A, true],
          [B, false],
        ],
        B,
      ),
      B,
      handlers(),
    );
    expect(byLabel(items, "Pin tab").disabled).toBe(false);
    expect(byLabel(items, "Preview").disabled).toBe(true);
    expect(byLabel(items, "Close tab").disabled).toBe(false);
    expect(byLabel(items, "Close other tabs").disabled).toBe(false);
  });

  it("disables Pin and enables Preview on a pinned tab", () => {
    const items = tabMenuItems(
      state(
        [
          [A, true],
          [B, false],
        ],
        B,
      ),
      A,
      handlers(),
    );
    expect(byLabel(items, "Pin tab").disabled).toBe(true);
    expect(byLabel(items, "Preview").disabled).toBe(false);
    expect(byLabel(items, "Close tab").disabled).toBe(false);
    expect(byLabel(items, "Close other tabs").disabled).toBe(false);
  });

  it("offers Preview on the only tab, which is pinned", () => {
    const items = tabMenuItems(state([[A, true]], A), A, handlers());
    expect(byLabel(items, "Pin tab").disabled).toBe(true);
    expect(byLabel(items, "Preview").disabled).toBe(false);
    expect(byLabel(items, "Close tab").disabled).toBe(true);
    expect(byLabel(items, "Close other tabs").disabled).toBe(true);
  });

  it("returns no menu for a page that is not open", () => {
    expect(tabMenuItems(state([[A, false]], A), B, handlers())).toEqual([]);
  });

  it("runs the chosen handler", () => {
    const spies = handlers();
    const items = tabMenuItems(
      state(
        [
          [A, true],
          [B, false],
        ],
        B,
      ),
      B,
      spies,
    );
    byLabel(items, "Pin tab").action?.();
    byLabel(items, "Close tab").action?.();
    byLabel(items, "Close other tabs").action?.();
    expect(spies.pin).toHaveBeenCalled();
    expect(spies.close).toHaveBeenCalled();
    expect(spies.closeOthers).toHaveBeenCalled();
    expect(spies.preview).not.toHaveBeenCalled();
  });
});

describe("page card tab entries", () => {
  const closed: OpenPageTabInfo = { open: false, pinned: false, preview: false };
  const preview: OpenPageTabInfo = { open: true, pinned: false, preview: true };
  const pinned: OpenPageTabInfo = { open: true, pinned: true, preview: false };
  const spies = () => ({ preview: vi.fn(), pin: vi.fn() });

  it("enables both entries for a page that is not open", () => {
    const items = pageCardTabMenuItems(closed, spies());
    expect(labels(items)).toEqual(["Preview", "Pin as tab"]);
    expect(items.map((item) => item.disabled)).toEqual([false, false]);
  });

  it("disables only Preview on the current preview tab", () => {
    const items = pageCardTabMenuItems(preview, spies());
    expect(items.map((item) => item.disabled)).toEqual([true, false]);
  });

  it("disables only Pin as tab on a pinned tab", () => {
    const items = pageCardTabMenuItems(pinned, spies());
    expect(items.map((item) => item.disabled)).toEqual([false, true]);
  });

  it("calls the page actions", () => {
    const calls = spies();
    const items = pageCardTabMenuItems(closed, calls);
    items[0].action?.();
    items[1].action?.();
    expect(calls.preview).toHaveBeenCalled();
    expect(calls.pin).toHaveBeenCalled();
  });
});

describe("preview conversion", () => {
  it("converts a pinned tab to preview and removes the previous preview", () => {
    const next = makePreviewTab(
      state(
        [
          [A, false],
          [B, true],
          [C, true],
        ],
        A,
      ),
      B,
    );
    expect(ids(next)).toEqual([B, C]);
    expect(pageTabInfo(next, B)).toEqual({ open: true, pinned: false, preview: true });
    expect(pageTabInfo(next, A).open).toBe(false);
    expect(next.activePageId).toBe(B);
    expect(hasSinglePreview(next)).toBe(true);
    expect(next.tabs.filter((tab) => !tab.pinned)).toHaveLength(1);
  });

  it("keeps the target's position and leaves every pinned tab alone", () => {
    const next = makePreviewTab(
      state(
        [
          [A, true],
          [B, false],
          [C, true],
        ],
        B,
      ),
      C,
    );
    expect(ids(next)).toEqual([A, C]);
    expect(hasSinglePreview(next)).toBe(true);
  });

  it("makes a page without a tab the single preview", () => {
    const next = makePreviewTab(
      state(
        [
          [A, true],
          [B, false],
        ],
        B,
      ),
      C,
    );
    expect(ids(next)).toEqual([A, C]);
    expect(pageTabInfo(next, C).preview).toBe(true);
    expect(next.activePageId).toBe(C);
  });

  it("is a no-op on a page that is already preview", () => {
    const original = state([[A, false]], A);
    expect(makePreviewTab(original, A)).toBe(original);
  });

  it("pins a preview in place and opens a new page as a pinned tab", () => {
    const pinnedPreview = promotePageTab(state([[A, false]], A), A);
    expect(pinnedPreview.tabs).toEqual([{ pageId: A, pinned: true }]);

    const opened = promotePageTab(
      state(
        [
          [A, true],
          [B, false],
        ],
        B,
      ),
      C,
    );
    expect(ids(opened)).toEqual([A, C]);
    expect(pageTabInfo(opened, C)).toEqual({ open: true, pinned: true, preview: false });
    expect(opened.activePageId).toBe(C);
    expect(hasSinglePreview(opened)).toBe(true);
  });
});

describe("close others", () => {
  it("keeps only the target tab and activates it", () => {
    const result = closeOtherPageTabs(
      state(
        [
          [A, true],
          [B, false],
          [C, true],
        ],
        B,
      ),
      A,
    );
    expect(result.closed).toBe(true);
    expect(ids(result.state)).toEqual([A]);
    expect(result.state.activePageId).toBe(A);
    expect(result.activatePageId).toBe(A);
  });

  it("is disabled for a single tab or an unknown page", () => {
    const single = state([[A, false]], A);
    expect(closeOtherPageTabs(single, A)).toEqual({
      state: single,
      closed: false,
      activatePageId: null,
    });
    const multi = state(
      [
        [A, true],
        [B, false],
      ],
      B,
    );
    expect(closeOtherPageTabs(multi, C).closed).toBe(false);
  });
});

describe("tab keyboard model", () => {
  it("maps activation, close and menu keys", () => {
    expect(tabKeyboardCommand({ key: "Enter" })).toBe("activate");
    expect(tabKeyboardCommand({ key: " " })).toBe("activate");
    expect(tabKeyboardCommand({ key: "Delete" })).toBe("close");
    expect(tabKeyboardCommand({ key: "Backspace" })).toBe("close");
    expect(tabKeyboardCommand({ key: "F10", shiftKey: true })).toBe("menu");
    expect(tabKeyboardCommand({ key: "ContextMenu" })).toBe("menu");
  });

  it("maps the arrows and ignores application modifiers", () => {
    expect(tabKeyboardCommand({ key: "ArrowLeft" })).toBe("focusPrevious");
    expect(tabKeyboardCommand({ key: "ArrowRight" })).toBe("focusNext");
    expect(tabKeyboardCommand({ key: "Enter", ctrlKey: true })).toBeNull();
    expect(tabKeyboardCommand({ key: "F10" })).toBeNull();
    expect(tabKeyboardCommand({ key: "Escape" })).toBeNull();
  });

  it("wraps the focused index at both ends", () => {
    expect(tabFocusIndex(0, 3, -1)).toBe(2);
    expect(tabFocusIndex(2, 3, 1)).toBe(0);
    expect(tabFocusIndex(1, 3, 1)).toBe(2);
    expect(tabFocusIndex(0, 0, 1)).toBe(-1);
  });
});

import { describe, expect, it } from "vitest";
import {
  activatePage,
  closePageTab,
  emptyOpenPages,
  hasSinglePreview,
  openPageTab,
  pinPageTab,
  previewPageTab,
  prunePageTabs,
  seedOpenPages,
  type OpenPagesState,
} from "../src/features/openPages";

const A = "page_a";
const B = "page_b";
const C = "page_c";
const D = "page_d";

function state(
  tabs: ReadonlyArray<[string, boolean]>,
  activePageId: string | null,
): OpenPagesState {
  return { tabs: tabs.map(([pageId, pinned]) => ({ pageId, pinned })), activePageId };
}

function ids(value: OpenPagesState): string[] {
  return value.tabs.map((tab) => tab.pageId);
}

describe("open-pages model", () => {
  it("seeds one preview tab for the page a project opens on", () => {
    const seeded = seedOpenPages(A);
    expect(seeded).toEqual({ tabs: [{ pageId: A, pinned: false }], activePageId: A });
    expect(previewPageTab(seeded)?.pageId).toBe(A);
    expect(hasSinglePreview(seeded)).toBe(true);
  });

  it("has no tabs for a zero-page project or a closed project", () => {
    expect(seedOpenPages(null)).toEqual(emptyOpenPages());
    expect(emptyOpenPages()).toEqual({ tabs: [], activePageId: null });
    expect(previewPageTab(emptyOpenPages())).toBeUndefined();
  });

  it("replaces the single preview when a new page is activated", () => {
    const next = activatePage(seedOpenPages(A), B);
    expect(ids(next)).toEqual([B]);
    expect(next.activePageId).toBe(B);
    expect(hasSinglePreview(next)).toBe(true);
  });

  it("replaces the preview in place, keeping the other tabs' order", () => {
    const next = activatePage(
      state(
        [
          [A, true],
          [B, false],
          [C, true],
        ],
        B,
      ),
      D,
    );
    expect(ids(next)).toEqual([A, D, C]);
    expect(openPageTab(next, D)).toEqual({ pageId: D, pinned: false });
    expect(next.activePageId).toBe(D);
  });

  it("appends a preview when every existing tab is pinned", () => {
    const next = activatePage(
      state(
        [
          [A, true],
          [B, true],
        ],
        A,
      ),
      C,
    );
    expect(ids(next)).toEqual([A, B, C]);
    expect(previewPageTab(next)?.pageId).toBe(C);
    expect(next.activePageId).toBe(C);
  });

  it("pins only the preview tab, in place", () => {
    const pinned = pinPageTab(
      state(
        [
          [A, true],
          [B, false],
          [C, true],
        ],
        B,
      ),
      B,
    );
    expect(ids(pinned)).toEqual([A, B, C]);
    expect(openPageTab(pinned, B)).toEqual({ pageId: B, pinned: true });
    expect(pinned.activePageId).toBe(B);
    expect(previewPageTab(pinned)).toBeUndefined();
    expect(hasSinglePreview(pinned)).toBe(true);
  });

  it("ignores a pin on a page that is not the preview", () => {
    const original = state(
      [
        [A, true],
        [B, false],
      ],
      A,
    );
    expect(pinPageTab(original, A)).toBe(original);
    expect(pinPageTab(original, C)).toBe(original);
  });

  it("activates an existing preview without changing the tab list", () => {
    const original = state(
      [
        [A, false],
        [B, true],
      ],
      B,
    );
    const next = activatePage(original, A);
    expect(next.tabs).toBe(original.tabs);
    expect(next.activePageId).toBe(A);
  });

  it("leaves the preview untouched when a pinned page is activated", () => {
    const original = state(
      [
        [A, false],
        [B, true],
      ],
      A,
    );
    const next = activatePage(original, B);
    expect(next.tabs).toBe(original.tabs);
    expect(next.activePageId).toBe(B);
    expect(previewPageTab(next)?.pageId).toBe(A);
  });

  it("closes a non-active tab without changing the current page", () => {
    const original = state(
      [
        [A, false],
        [B, true],
      ],
      A,
    );
    const result = closePageTab(original, B);
    expect(result.closed).toBe(true);
    expect(ids(result.state)).toEqual([A]);
    expect(result.state.activePageId).toBe(A);
  });

  it("closes the active tab onto the tab now at the same index", () => {
    const result = closePageTab(
      state(
        [
          [A, true],
          [B, false],
          [C, true],
        ],
        B,
      ),
      B,
    );
    expect(result.closed).toBe(true);
    expect(ids(result.state)).toEqual([A, C]);
    expect(result.state.activePageId).toBe(C);
  });

  it("closes the last active tab onto the tab before it", () => {
    const result = closePageTab(
      state(
        [
          [A, true],
          [B, true],
          [C, false],
        ],
        C,
      ),
      C,
    );
    expect(ids(result.state)).toEqual([A, B]);
    expect(result.state.activePageId).toBe(B);
  });

  it("never closes the last remaining tab", () => {
    const original = state([[A, false]], A);
    const result = closePageTab(original, A);
    expect(result.closed).toBe(false);
    expect(result.state).toBe(original);
  });

  it("prunes tabs whose page no longer exists and keeps the active tab", () => {
    const original = state(
      [
        [A, false],
        [B, true],
        [C, true],
      ],
      A,
    );
    const result = prunePageTabs(original, new Set([A, C]), A);
    expect(ids(result.state)).toEqual([A, C]);
    expect(result.state.activePageId).toBe(A);
    expect(result.activatePageId).toBeNull();
  });

  it("activates the nearest remaining tab when the active tab is pruned", () => {
    // B is active and removed; the tab now at index 1 is C.
    const result = prunePageTabs(
      state(
        [
          [A, true],
          [B, false],
          [C, true],
        ],
        B,
      ),
      new Set([A, C]),
      C,
    );
    expect(ids(result.state)).toEqual([A, C]);
    expect(result.state.activePageId).toBe(C);
    expect(result.activatePageId).toBe(C);
  });

  it("opens the still-selected page as preview when every tab is pruned", () => {
    const result = prunePageTabs(state([[B, false]], B), new Set([A, C]), C);
    expect(result.state).toEqual({ tabs: [{ pageId: C, pinned: false }], activePageId: C });
    expect(result.activatePageId).toBe(C);
  });

  it("clears the open set when every tab and every page is gone", () => {
    const result = prunePageTabs(state([[B, false]], B), new Set(), null);
    expect(result.state).toEqual(emptyOpenPages());
    expect(result.activatePageId).toBeNull();
  });

  it("seeds a fresh preview when the project switches", () => {
    const previous = activatePage(seedOpenPages(A), B);
    expect(ids(previous)).toEqual([B]);
    expect(seedOpenPages(C)).toEqual({ tabs: [{ pageId: C, pinned: false }], activePageId: C });
  });

  it("keeps tab order stable when pages reorder elsewhere", () => {
    // Tab order is creation order and is independent of the project page list.
    const original = state(
      [
        [C, true],
        [A, false],
        [B, true],
      ],
      A,
    );
    const unchanged = prunePageTabs(original, new Set([A, B, C]), A);
    expect(unchanged.state).toBe(original);
    expect(ids(activatePage(original, B))).toEqual([C, A, B]);
  });

  it("keeps at most one preview through every operation", () => {
    let value = seedOpenPages(A);
    value = activatePage(value, B);
    value = pinPageTab(value, B);
    value = activatePage(value, C);
    value = activatePage(value, D);
    value = closePageTab(value, C).state;
    value = prunePageTabs(value, new Set([A, B, D]), D).state;
    expect(hasSinglePreview(value)).toBe(true);
    expect(value.tabs.filter((tab) => !tab.pinned).length).toBeLessThanOrEqual(1);
  });
});

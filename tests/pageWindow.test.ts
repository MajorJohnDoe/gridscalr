import { describe, expect, it } from "vitest";
import {
  PAGE_WINDOW_SIZE,
  PageWindowController,
  clampPageWindowStart,
  pageWindow,
  pageWindowAroundIndex,
  pageWindowContains,
} from "../src/features/pageWindow";

describe("page window model", () => {
  it("clamps a window at both ends and keeps the requested size", () => {
    expect(pageWindow(1000, -20, 100)).toEqual({ start: 0, end: 100, total: 1000 });
    expect(pageWindow(1000, 950, 100)).toEqual({ start: 900, end: 1000, total: 1000 });
    expect(pageWindow(50, 900, 100)).toEqual({ start: 0, end: 50, total: 50 });
    expect(pageWindow(0, 0, 100)).toEqual({ start: 0, end: 0, total: 0 });
    expect(clampPageWindowStart(600, 1000, PAGE_WINDOW_SIZE)).toBe(600);
  });

  it("centres on a page far beyond the old 400-card cap", () => {
    const window = pageWindowAroundIndex(1200, 900, 120);
    expect(window.start).toBe(840);
    expect(window.end).toBe(960);
    expect(pageWindowContains(window, 900)).toBe(true);
    expect(pageWindowContains(window, 840 - 1)).toBe(false);
  });
});

describe("page window controller", () => {
  const ids = Array.from({ length: 1000 }, (_value, index) => `page_${index + 1}`);

  it("keeps its position while the current page stays inside the window", () => {
    const controller = new PageWindowController(100);
    const first = controller.window(ids, "page_1");
    expect(first.start).toBe(0);
    const moved = controller.window(ids, "page_50");
    expect(moved.start).toBe(0);
  });

  it("follows the current page whenever it is outside the window", () => {
    const controller = new PageWindowController(100);
    controller.window(ids, "page_1");
    // PageUp/PageDown with a selection keeps the same anchor ID, but the page
    // the editor shows still has to stay mounted.
    const followed = controller.window(ids, "page_750");
    expect(followed.start).toBe(699);
    expect(pageWindowContains(followed, 749)).toBe(true);
    const back = controller.window(ids, "page_751");
    expect(back.start).toBe(699);

    const jumped = controller.jumpToPage(ids.length, 119 + 950);
    expect(jumped.start).toBe(1000 - 100);
  });

  it("pins Previous/Next until the current page changes", () => {
    const controller = new PageWindowController(100);
    controller.window(ids, "page_1");
    controller.shift(ids.length, 500, "page_1");
    // A repaint while the drawing is unchanged keeps the shifted range.
    expect(controller.window(ids, "page_1").start).toBe(500);
    // A real page change then recentres on the new page.
    expect(controller.window(ids, "page_20").start).toBe(0);
  });

  it("reveals a moved block even when the current page did not change", () => {
    const controller = new PageWindowController(100);
    controller.window(ids, "page_50");
    controller.reveal("page_900");
    const revealed = controller.window(ids, "page_50");
    expect(revealed.start).toBe(849);
    expect(pageWindowContains(revealed, 899)).toBe(true);
    // The reveal is one-shot: the next render keeps the new range.
    expect(controller.window(ids, "page_50").start).toBe(849);
  });

  it("resets the old start when a filter changes the visible list", () => {
    const controller = new PageWindowController(100);
    controller.shift(ids.length, 500, "page_1");
    const filtered = ids.slice(0, 40);
    expect(controller.window(filtered, filtered[0]).start).toBe(0);
  });

  it("hands a one-shot focus request to the panel", () => {
    const controller = new PageWindowController(100);
    controller.requestFocus("page_42");
    expect(controller.takeFocusRequest()).toBe("page_42");
    expect(controller.takeFocusRequest()).toBeNull();
    controller.reset();
    controller.requestFocus("page_7");
    controller.reset();
    expect(controller.takeFocusRequest()).toBeNull();
  });
});

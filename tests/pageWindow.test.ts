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

  it("keeps its position while the anchor stays inside the window", () => {
    const controller = new PageWindowController(100);
    const first = controller.window(ids, "page_1");
    expect(first.start).toBe(0);
    const moved = controller.window(ids, "page_50");
    expect(moved.start).toBe(0);
  });

  it("follows navigation to an unrendered page and jumps directly", () => {
    const controller = new PageWindowController(100);
    controller.window(ids, "page_1");
    const followed = controller.window(ids, "page_750");
    expect(followed.start).toBe(699);
    expect(pageWindowContains(followed, 749)).toBe(true);
    const jumped = controller.jumpToPage(ids.length, 119 + 950);
    expect(jumped.start).toBe(1000 - 100);
  });

  it("shifts by one window without dragging the anchor back", () => {
    const controller = new PageWindowController(100);
    controller.window(ids, "page_1");
    controller.shift(ids.length, 500);
    const shifted = controller.window(ids, "page_1");
    expect(shifted.start).toBe(500);
    // A real page change then recentres on the new anchor.
    const followed = controller.window(ids, "page_20");
    expect(followed.start).toBe(0);
  });

  it("resets the old start when a filter changes the visible list", () => {
    const controller = new PageWindowController(100);
    controller.shift(ids.length, 500);
    const filtered = ids.slice(0, 40);
    expect(controller.window(filtered, filtered[0]).start).toBe(0);
  });
});

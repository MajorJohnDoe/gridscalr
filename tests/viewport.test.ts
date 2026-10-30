import { describe, expect, it } from "vitest";
import {
  clampZoom,
  fitPageViewport,
  pageToScreen,
  screenToPage,
  syncViewport,
  viewForGesture,
  viewportCenter,
  zoomAt,
  MAX_ZOOM,
  MIN_ZOOM,
  type Viewport,
} from "../src/canvas/viewport";

const view: Viewport = { page: 2, zoom: 1.5, panX: 40, panY: -20 };

describe("viewport transforms", () => {
  it("round-trips page and screen coordinates", () => {
    const page = { x: 123.25, y: 456.75 };
    const screen = pageToScreen(view, page);
    expect(screenToPage(view, screen)).toEqual(page);
  });

  it("keeps the page point under the cursor fixed while zooming", () => {
    const cursor = { x: 300, y: 200 };
    const before = screenToPage(view, cursor);
    const next = zoomAt(view, cursor, 1.25);
    const after = screenToPage(next, cursor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(next.zoom).toBeCloseTo(1.875);
    expect(next.page).toBe(view.page);
  });

  it("keeps the pinch anchor under the moving midpoint", () => {
    const anchor = screenToPage(view, { x: 200, y: 150 });
    const next = viewForGesture(view, anchor, { x: 260, y: 180 }, 2.25);
    expect(next.zoom).toBeCloseTo(2.25);
    expect(pageToScreen(next, anchor)).toEqual({ x: 260, y: 180 });
    expect(next.page).toBe(view.page);
  });

  it("clamps pinch zoom while preserving the anchor", () => {
    const anchor = screenToPage(view, { x: 100, y: 100 });
    const next = viewForGesture(view, anchor, { x: 100, y: 100 }, 1000);
    expect(next.zoom).toBe(MAX_ZOOM);
    expect(pageToScreen(next, anchor).x).toBeCloseTo(100);
    expect(pageToScreen(next, anchor).y).toBeCloseTo(100);
  });

  it("clamps zoom to the supported range", () => {
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(999)).toBe(MAX_ZOOM);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it("fits a landscape page inside a portrait viewport", () => {
    const fitted = fitPageViewport({ width: 1000, height: 500 }, 800, 1000);
    expect(fitted.zoom).toBeCloseTo((800 - 84) / 1000);
    expect(fitted.panX).toBeCloseTo(42);
    expect(fitted.panY).toBeCloseTo((1000 - 500 * fitted.zoom) / 2);
  });

  it("copies pan and zoom when the target has the same size", () => {
    const synced = syncViewport(view, { width: 900, height: 600 }, { width: 900, height: 600 });
    expect(synced).toEqual(view);
  });

  it("centres the same page point when the target pane has another size", () => {
    const sourceSize = { width: 900, height: 600 };
    const targetSize = { width: 450, height: 600 };
    const synced = syncViewport(view, sourceSize, targetSize);
    const sourceCenter = viewportCenter(view, sourceSize.width, sourceSize.height);
    const targetCenter = viewportCenter(synced, targetSize.width, targetSize.height);
    expect(targetCenter.x).toBeCloseTo(sourceCenter.x, 6);
    expect(targetCenter.y).toBeCloseTo(sourceCenter.y, 6);
    expect(synced.zoom).toBe(view.zoom);
    expect(synced.page).toBe(view.page);
  });
});

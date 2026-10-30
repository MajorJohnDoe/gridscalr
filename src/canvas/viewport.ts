import type { PageSize, Point } from "../model/types";

/** Page, zoom and pan in screen pixels. Shared by the primary and reference views. */
export interface Viewport {
  page: number;
  zoom: number;
  panX: number;
  panY: number;
}

export const MIN_ZOOM = 0.03;
export const MAX_ZOOM = 40;
export const FIT_PADDING = 42;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

export function pageToScreen(viewport: Viewport, point: Point): Point {
  return {
    x: point.x * viewport.zoom + viewport.panX,
    y: point.y * viewport.zoom + viewport.panY,
  };
}

export function screenToPage(viewport: Viewport, point: Point): Point {
  return {
    x: (point.x - viewport.panX) / viewport.zoom,
    y: (point.y - viewport.panY) / viewport.zoom,
  };
}

/** Zooms around a screen point, keeping the page point under the cursor fixed. */
export function zoomAt(viewport: Viewport, screen: Point, factor: number): Viewport {
  const zoom = clampZoom(viewport.zoom * factor);
  const page = screenToPage(viewport, screen);
  return {
    page: viewport.page,
    zoom,
    panX: screen.x - page.x * zoom,
    panY: screen.y - page.y * zoom,
  };
}

/**
 * Places a fixed page point under a moving screen point at a new zoom. Used by
 * two-finger pan and pinch gestures so the point under the fingers stays put.
 */
export function viewForGesture(
  viewport: Viewport,
  anchorPage: Point,
  screen: Point,
  zoom: number,
): Viewport {
  const nextZoom = clampZoom(zoom);
  return {
    page: viewport.page,
    zoom: nextZoom,
    panX: screen.x - anchorPage.x * nextZoom,
    panY: screen.y - anchorPage.y * nextZoom,
  };
}

/** Fits a page inside a viewport with padding, centred on both axes. */
export function fitPageViewport(
  size: PageSize,
  width: number,
  height: number,
  padding = FIT_PADDING,
): Viewport {
  const zoom = clampZoom(
    Math.min((width - padding * 2) / size.width, (height - padding * 2) / size.height),
  );
  return {
    page: 1,
    zoom,
    panX: (width - size.width * zoom) / 2,
    panY: (height - size.height * zoom) / 2,
  };
}

/** Page point at the centre of a viewport. */
export function viewportCenter(viewport: Viewport, width: number, height: number): Point {
  return {
    x: (width / 2 - viewport.panX) / viewport.zoom,
    y: (height / 2 - viewport.panY) / viewport.zoom,
  };
}

/**
 * Copies the page and zoom of one viewport and centres the same page point in a
 * second viewport. Used by the split view when the two panes have different
 * sizes.
 */
export function syncViewport(
  source: Viewport,
  sourceSize: PageSize,
  targetSize: PageSize,
): Viewport {
  const center = viewportCenter(source, sourceSize.width, sourceSize.height);
  return {
    page: source.page,
    zoom: source.zoom,
    panX: targetSize.width / 2 - center.x * source.zoom,
    panY: targetSize.height / 2 - center.y * source.zoom,
  };
}

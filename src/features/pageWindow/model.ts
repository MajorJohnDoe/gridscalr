/**
 * Pure windowing rules for the Pages panel. A window is a contiguous slice of
 * the already-filtered page order; it never changes a `PageId`, a display
 * number or the stored page order. Only the number of mounted cards changes.
 */

/** Cards mounted around the current page. Small enough for large projects. */
export const PAGE_WINDOW_SIZE = 120;

export interface PageWindow {
  /** 0-based index of the first mounted row. */
  start: number;
  /** Exclusive end index in the filtered page list. */
  end: number;
  total: number;
}

export function clampPageWindowStart(
  start: number,
  total: number,
  size = PAGE_WINDOW_SIZE,
): number {
  const count = Math.max(0, Math.round(total));
  const windowSize = Math.max(1, Math.round(size));
  const lastStart = Math.max(0, count - windowSize);
  return Math.max(0, Math.min(lastStart, Math.round(start)));
}

/** One clamped window for a filtered list of `total` pages. */
export function pageWindow(total: number, start: number, size = PAGE_WINDOW_SIZE): PageWindow {
  const count = Math.max(0, Math.round(total));
  const windowSize = Math.max(1, Math.round(size));
  const clamped = clampPageWindowStart(start, count, windowSize);
  return {
    start: clamped,
    end: Math.min(count, clamped + windowSize),
    total: count,
  };
}

/** A window centred on one page, clamped at both ends of the list. */
export function pageWindowAroundIndex(
  total: number,
  index: number,
  size = PAGE_WINDOW_SIZE,
): PageWindow {
  const windowSize = Math.max(1, Math.round(size));
  const start = Math.max(0, Math.round(index) - Math.floor(windowSize / 2));
  return pageWindow(total, start, windowSize);
}

export function pageWindowContains(window: PageWindow, index: number): boolean {
  return index >= window.start && index < window.end;
}

/**
 * Identity of the filtered list a window was computed for. A changed filter or
 * page order resets the old start instead of translating a stale position.
 */
export function pageWindowSignature(visibleIds: readonly string[]): string {
  return `${visibleIds.length}\u0000${visibleIds[0] ?? ""}\u0000${visibleIds[visibleIds.length - 1] ?? ""}`;
}

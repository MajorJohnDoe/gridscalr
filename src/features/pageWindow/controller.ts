import {
  PAGE_WINDOW_SIZE,
  clampPageWindowStart,
  pageWindow,
  pageWindowAroundIndex,
  pageWindowContains,
  pageWindowSignature,
  type PageWindow,
} from "./model";

/**
 * Session-only scroll position of the Pages window. It stores one filtered-list
 * signature and one start index; it never stores a page identity or writes to
 * the project. The panel asks for a window on every render and the controller
 * recentres only when the anchor page falls outside the mounted slice.
 */
export class PageWindowController {
  private start = 0;
  private signature: string | null = null;
  private lastAnchorId: string | null = null;

  constructor(private readonly size = PAGE_WINDOW_SIZE) {}

  /**
   * The window to mount for one filtered order. A changed filter or page list
   * clamps the previous start; an anchor outside the window recentres it so a
   * keyboard command, page navigation or jump can always reach its page.
   */
  window(visibleIds: readonly string[], anchorId: string | null): PageWindow {
    const signature = pageWindowSignature(visibleIds);
    if (signature !== this.signature) {
      this.signature = signature;
      this.start = clampPageWindowStart(this.start, visibleIds.length, this.size);
    }
    const total = visibleIds.length;
    if (!total) return pageWindow(0, 0, this.size);
    const anchorChanged = anchorId !== this.lastAnchorId;
    this.lastAnchorId = anchorId;
    const anchorIndex = anchorId ? visibleIds.indexOf(anchorId) : -1;
    if (anchorChanged && anchorIndex >= 0) {
      const current = pageWindow(total, this.start, this.size);
      if (!pageWindowContains(current, anchorIndex)) {
        const around = pageWindowAroundIndex(total, anchorIndex, this.size);
        this.start = around.start;
      }
    }
    return pageWindow(total, this.start, this.size);
  }

  /** Moves the window by one page count, clamped at both ends. */
  shift(total: number, delta: number): PageWindow {
    this.start = clampPageWindowStart(this.start + delta, total, this.size);
    return pageWindow(total, this.start, this.size);
  }

  /** Centres the window on a 0-based page index. */
  jumpToPage(total: number, index: number): PageWindow {
    this.start = pageWindowAroundIndex(total, index, this.size).start;
    return pageWindow(total, this.start, this.size);
  }

  /** Current start index; 0 when the panel has not rendered yet. */
  get startIndex(): number {
    return this.start;
  }

  reset(): void {
    this.start = 0;
    this.signature = null;
    this.lastAnchorId = null;
  }
}

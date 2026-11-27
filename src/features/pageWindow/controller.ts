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
 * the project. The panel asks for a window on every render.
 *
 * The window follows the page the editor shows whenever that page is outside
 * the mounted slice, so keyboard navigation, a jump and a bulk duplicate cannot
 * leave the current page hidden. **Previous** and **Next** deliberately pin the
 * window: they move the range without changing the drawing, and the pin is
 * dropped as soon as the current page changes.
 */
export class PageWindowController {
  private start = 0;
  private signature: string | null = null;
  private pinnedCurrentId: string | null = null;
  private revealId: string | null = null;
  private focusRequest: string | null = null;

  constructor(private readonly size = PAGE_WINDOW_SIZE) {}

  /**
   * The window to mount for one filtered order. A changed filter or page list
   * clamps the previous start. A reveal request (a moved or duplicated page)
   * wins over the current page, and a current page outside the slice recentres
   * it so a keyboard command, page navigation or duplicate can always reach it.
   */
  window(visibleIds: readonly string[], currentId: string | null): PageWindow {
    const signature = pageWindowSignature(visibleIds);
    if (signature !== this.signature) {
      this.signature = signature;
      this.start = clampPageWindowStart(this.start, visibleIds.length, this.size);
      this.pinnedCurrentId = null;
    }
    const total = visibleIds.length;
    if (!total) {
      this.pinnedCurrentId = null;
      return pageWindow(0, 0, this.size);
    }
    if (this.pinnedCurrentId !== null && this.pinnedCurrentId !== currentId) {
      this.pinnedCurrentId = null;
    }
    const reveal = this.takeRevealId();
    if (this.pinnedCurrentId === null) {
      const revealIndex = reveal ? visibleIds.indexOf(reveal) : -1;
      const currentIndex = currentId ? visibleIds.indexOf(currentId) : -1;
      const current = pageWindow(total, this.start, this.size);
      const target =
        revealIndex >= 0
          ? revealIndex
          : currentIndex >= 0 && !pageWindowContains(current, currentIndex)
            ? currentIndex
            : -1;
      if (target >= 0) this.start = pageWindowAroundIndex(total, target, this.size).start;
      // A revealed block may not contain the current page; pin the new range
      // until the user navigates so a repaint cannot scroll it away.
      if (revealIndex >= 0) this.pinnedCurrentId = currentId;
    }
    return pageWindow(total, this.start, this.size);
  }

  /**
   * Moves the window by one page count and pins it to the current page, so the
   * next render does not snap it back while the drawing is unchanged.
   */
  shift(total: number, delta: number, currentId: string | null = null): PageWindow {
    this.start = clampPageWindowStart(this.start + delta, total, this.size);
    this.pinnedCurrentId = currentId;
    return pageWindow(total, this.start, this.size);
  }

  /** Centres the window on a 0-based page index. */
  jumpToPage(total: number, index: number): PageWindow {
    this.start = pageWindowAroundIndex(total, index, this.size).start;
    this.pinnedCurrentId = null;
    return pageWindow(total, this.start, this.size);
  }

  /**
   * Asks the next window for a page that just moved, so a drop or a keyboard
   * move to the window edge stays visible even when the current page did not
   * change. Cleared when the next window is computed.
   */
  reveal(pageId: string): void {
    this.revealId = pageId;
    this.pinnedCurrentId = null;
  }

  /** Asks the panel to focus one card after the next render. */
  requestFocus(pageId: string): void {
    this.focusRequest = pageId;
  }

  /** One-shot focus request set by a flow that created the page. */
  takeFocusRequest(): string | null {
    const pageId = this.focusRequest;
    this.focusRequest = null;
    return pageId;
  }

  /** Current start index; 0 when the panel has not rendered yet. */
  get startIndex(): number {
    return this.start;
  }

  private takeRevealId(): string | null {
    const pageId = this.revealId;
    this.revealId = null;
    return pageId;
  }

  reset(): void {
    this.start = 0;
    this.signature = null;
    this.pinnedCurrentId = null;
    this.revealId = null;
    this.focusRequest = null;
  }
}

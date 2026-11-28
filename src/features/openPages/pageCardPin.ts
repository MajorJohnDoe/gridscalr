import type { PageId } from "../../model/types";

/**
 * A second unmodified click within this window is the page-card pin gesture.
 * The platform double-click interval is not exposed to the web layer; 600 ms
 * covers the 500 ms Windows default and common slower user settings.
 */
export const PAGE_CARD_PIN_MS = 600;

export interface PageCardClickInput {
  /** Identity of the open project; a new open resets the gesture. */
  project: object;
  pageId: PageId;
  /** True when the click landed on the page name, where double-click renames. */
  title: boolean;
  /** True for an unmodified left click, not a selection modifier click. */
  plain: boolean;
}

interface RecordedClick extends PageCardClickInput {
  time: number;
}

/**
 * Detects the second click that pins a page card.
 *
 * The Pages panel is rebuilt between the two clicks of a double-click because
 * the first click changes the page, so a native `dblclick` never reaches a
 * non-active card. One quick second click on the same page is therefore the pin
 * gesture; a double-click on the page name still renames and a modified click
 * never pins.
 */
export class PageCardPinGesture {
  private last: RecordedClick | null = null;

  shouldPin(input: PageCardClickInput, now = Date.now()): boolean {
    const previous = this.last;
    this.last = { ...input, time: now };
    if (
      !previous ||
      previous.project !== input.project ||
      previous.pageId !== input.pageId ||
      !previous.plain ||
      previous.title ||
      !input.plain ||
      input.title ||
      now - previous.time > PAGE_CARD_PIN_MS
    ) {
      return false;
    }
    this.last = null;
    return true;
  }

  reset(): void {
    this.last = null;
  }
}

/** One gesture for the one Pages panel. */
export const pageCardPin = new PageCardPinGesture();

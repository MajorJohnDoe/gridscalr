import { pageDisplayName, pageIndex, pageListOrderChanges, pageNumber } from "../../model/pages";
import type { PageId, Project } from "../../model/types";

/**
 * Pure page-menu rules: where an insert lands, which positions a move can take
 * and which keyboard event maps to which page command. Nothing here touches the
 * DOM, the store or the i18n catalogs, so the menu, the shortcuts and the tests
 * share one definition.
 */

export type PageInsertDirection = "before" | "after";

export interface PageInsertTarget {
  pageId: PageId;
  direction: PageInsertDirection;
  /** 0-based insertion index in the current project page list. */
  index: number;
  /** 1-based display number of the anchor page. */
  page: number;
  name?: string;
}

/**
 * Insertion target computed from the anchor `PageId`, never from a rendered
 * card position. A status filter can hide cards, but it cannot shift the index
 * a page actually has in the project list.
 */
export function pageInsertTarget(
  project: Project,
  pageId: PageId,
  direction: PageInsertDirection,
): PageInsertTarget | null {
  const index = pageIndex(project, pageId);
  if (index < 0) return null;
  return {
    pageId,
    direction,
    index: direction === "after" ? index + 1 : index,
    page: index + 1,
    name: pageDisplayName(project, pageId),
  };
}

export interface PageMovePosition {
  /** 0-based insertion index in the current page list. */
  index: number;
  /** Page that will follow the moved page, or null at the end. */
  pageId: PageId | null;
  /** 1-based display number of that page, or null at the end. */
  page: number | null;
  name?: string;
}

/**
 * Every position that actually changes the order for one page. The position the
 * page already occupies, and the position directly below it, are omitted
 * because a move there is a no-op.
 */
export function pageMovePositions(project: Project, pageId: PageId): PageMovePosition[] {
  const selected = new Set([pageId]);
  const positions: PageMovePosition[] = [];
  for (let index = 0; index <= project.pages.length; index += 1) {
    if (!pageListOrderChanges(project.pages, selected, index)) continue;
    const record = project.pages[index] ?? null;
    positions.push({
      index,
      pageId: record?.id ?? null,
      page: record ? pageNumber(project, record.id) : null,
      name: record ? pageDisplayName(project, record.id) : undefined,
    });
  }
  return positions;
}

/** Shortcut list shared with the in-app reference and the docs table. */
export const PAGE_SHORTCUTS = {
  previousPage: "PageUp",
  nextPage: "PageDown",
  insertBefore: "Alt+PageUp",
  insertAfter: "Alt+PageDown",
  movePage: "Alt+Shift+M",
  duplicatePage: "Alt+Shift+D",
  deletePage: "Alt+Shift+Delete",
} as const;

export type PageShortcutCommand = keyof typeof PAGE_SHORTCUTS;

/** `aria-keyshortcuts` value for opening a page card's menu. */
export const PAGE_MENU_KEYSHORTCUTS = "Shift+F10";

/** Stable id for the visually hidden page-menu hint. */
export const PAGE_MENU_HINT_ID = "page-menu-hint";

export interface PageShortcutEvent {
  key: string;
  altKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

/**
 * Maps one keyboard event to a page command. Bare navigation uses the page
 * keys; `Alt` inserts around the current page; `Alt+Shift` carries the page
 * editing commands. Canvas tools are single letters and Ctrl combinations, so
 * none of these collide with them.
 */
export function pageShortcutCommand(event: PageShortcutEvent): PageShortcutCommand | null {
  if (event.ctrlKey || event.metaKey) return null;
  if (!event.altKey) {
    if (event.key === "PageUp") return "previousPage";
    if (event.key === "PageDown") return "nextPage";
    return null;
  }
  if (!event.shiftKey) {
    if (event.key === "PageUp") return "insertBefore";
    if (event.key === "PageDown") return "insertAfter";
    return null;
  }
  switch (event.key.toLowerCase()) {
    case "d":
      return "duplicatePage";
    case "m":
      return "movePage";
    case "delete":
      return "deletePage";
    default:
      return null;
  }
}

/** Commands that only navigate and therefore stay available in view-only mode. */
export function pageShortcutReadsOnly(command: PageShortcutCommand): boolean {
  return command === "previousPage" || command === "nextPage";
}

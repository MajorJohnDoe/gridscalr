import type { PageId } from "../../model/types";

/**
 * Pure open-pages rules.
 *
 * Tabs are controller-owned session state: an ordered list of pages that stays
 * independent of the project page order and is never serialized. At most one
 * tab is the preview (`pinned: false`); activating a page replaces it, pinning
 * promotes it and closing removes it without touching the project's pages.
 */

export interface OpenPageTab {
  pageId: PageId;
  pinned: boolean;
}

export interface OpenPagesState {
  /** Tabs in creation order; page reorder never reorders them. */
  tabs: readonly OpenPageTab[];
  activePageId: PageId | null;
}

export interface ClosePageTabResult {
  state: OpenPagesState;
  /** False when the tab is unknown or is the last remaining tab. */
  closed: boolean;
}

export interface PrunePageTabsResult {
  state: OpenPagesState;
  /** Page to navigate to after the prune, when the active tab was removed. */
  activatePageId: PageId | null;
}

export interface CloseOtherPageTabsResult {
  state: OpenPagesState;
  /** False when the target is unknown or is the only tab. */
  closed: boolean;
  /** The surviving tab, which becomes the active page. */
  activatePageId: PageId | null;
}

/** Where one page stands in the session-only open set. */
export interface OpenPageTabInfo {
  open: boolean;
  pinned: boolean;
  preview: boolean;
}

/** Keyboard commands the tablist understands, mapped from one key event. */
export type TabKeyboardCommand =
  "activate" | "close" | "menu" | "focusNext" | "focusPrevious" | null;

export interface TabKeyEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export function emptyOpenPages(): OpenPagesState {
  return { tabs: [], activePageId: null };
}

/** One preview tab for the page a project opens on; null for a zero-page project. */
export function seedOpenPages(pageId: PageId | null): OpenPagesState {
  return pageId ? { tabs: [{ pageId, pinned: false }], activePageId: pageId } : emptyOpenPages();
}

export function openPageTab(state: OpenPagesState, pageId: PageId): OpenPageTab | undefined {
  return state.tabs.find((tab) => tab.pageId === pageId);
}

export function previewPageTab(state: OpenPagesState): OpenPageTab | undefined {
  return state.tabs.find((tab) => !tab.pinned);
}

/** The invariant every operation preserves: zero or one preview tab. */
export function hasSinglePreview(state: OpenPagesState): boolean {
  return state.tabs.filter((tab) => !tab.pinned).length <= 1;
}

/**
 * Replaces the single preview tab in place. When every tab is pinned there is
 * no preview to replace, so the new preview appends after them.
 */
function withPreview(state: OpenPagesState, pageId: PageId): OpenPagesState {
  const previewIndex = state.tabs.findIndex((tab) => !tab.pinned);
  if (previewIndex < 0) {
    return { tabs: [...state.tabs, { pageId, pinned: false }], activePageId: pageId };
  }
  const tabs = state.tabs.filter((tab, index) => tab.pinned || index === previewIndex);
  tabs[previewIndex] = { pageId, pinned: false };
  return { tabs, activePageId: pageId };
}

/**
 * Selects a page. A pinned tab keeps the preview tab untouched; a preview tab
 * only becomes active; a page with no tab replaces the preview in its place.
 */
export function activatePage(state: OpenPagesState, pageId: PageId): OpenPagesState {
  if (openPageTab(state, pageId)) {
    return state.activePageId === pageId ? state : { tabs: state.tabs, activePageId: pageId };
  }
  return withPreview(state, pageId);
}

/** Pins the preview tab in place. Only the preview tab can be pinned. */
export function pinPageTab(state: OpenPagesState, pageId: PageId): OpenPagesState {
  const preview = previewPageTab(state);
  if (!preview || preview.pageId !== pageId) return state;
  return {
    tabs: state.tabs.map((tab) => (tab.pageId === pageId ? { ...tab, pinned: true } : tab)),
    activePageId: state.activePageId,
  };
}

/**
 * Opens or promotes a page as a pinned tab and activates it. A preview tab is
 * pinned in place; a page without a tab replaces the preview (or appends after
 * every pinned tab) and is then pinned. Selecting an already pinned page only
 * activates it.
 */
export function promotePageTab(state: OpenPagesState, pageId: PageId): OpenPagesState {
  const tab = openPageTab(state, pageId);
  if (tab?.pinned) {
    return state.activePageId === pageId ? state : { tabs: state.tabs, activePageId: pageId };
  }
  const base = tab ? state : activatePage(state, pageId);
  return {
    tabs: base.tabs.map((entry) => (entry.pageId === pageId ? { ...entry, pinned: true } : entry)),
    activePageId: pageId,
  };
}

/**
 * Makes a page the single preview tab and activates it. A pinned tab keeps its
 * position and the previous preview tab is removed, so at most one preview
 * remains; a page without a tab replaces the current preview in place.
 */
export function makePreviewTab(state: OpenPagesState, pageId: PageId): OpenPagesState {
  const tab = openPageTab(state, pageId);
  if (!tab) return activatePage(state, pageId);
  if (!tab.pinned) {
    return state.activePageId === pageId ? state : { tabs: state.tabs, activePageId: pageId };
  }
  const tabs = state.tabs
    .filter((entry) => entry.pinned || entry.pageId === pageId)
    .map((entry) => (entry.pageId === pageId ? { ...entry, pinned: false } : entry));
  return { tabs, activePageId: pageId };
}

/** Session state for one page, used by the page card menu's disabled rules. */
export function pageTabInfo(state: OpenPagesState, pageId: PageId): OpenPageTabInfo {
  const tab = openPageTab(state, pageId);
  return {
    open: Boolean(tab),
    pinned: tab?.pinned ?? false,
    preview: Boolean(tab && !tab.pinned),
  };
}

/**
 * Removes one tab without touching the project. The last tab cannot close.
 * Closing the active tab activates the tab now at the same index, else the one
 * before; closing any other tab leaves the active page alone.
 */
export function closePageTab(state: OpenPagesState, pageId: PageId): ClosePageTabResult {
  const index = state.tabs.findIndex((tab) => tab.pageId === pageId);
  if (index < 0 || state.tabs.length <= 1) return { state, closed: false };
  const tabs = state.tabs.filter((_, tabIndex) => tabIndex !== index);
  if (state.activePageId !== pageId) {
    return { state: { tabs, activePageId: state.activePageId }, closed: true };
  }
  const next = tabs[Math.min(index, tabs.length - 1)];
  return { state: { tabs, activePageId: next.pageId }, closed: true };
}

/**
 * Keeps only the target tab and activates it. The project's pages are never
 * touched. A single tab has nothing to close, and an unknown page is a no-op.
 */
export function closeOtherPageTabs(
  state: OpenPagesState,
  pageId: PageId,
): CloseOtherPageTabsResult {
  const target = openPageTab(state, pageId);
  if (!target || state.tabs.length <= 1) {
    return { state, closed: false, activatePageId: null };
  }
  return { state: { tabs: [target], activePageId: pageId }, closed: true, activatePageId: pageId };
}

/** Wraps the focused tab index, so the first and last tab stay reachable. */
export function tabFocusIndex(index: number, count: number, direction: -1 | 1): number {
  if (count <= 0) return -1;
  return (index + direction + count) % count;
}

/**
 * Maps one key event to a tablist command. Enter and Space activate, Delete and
 * Backspace close, Shift+F10 and the ContextMenu key open the tab menu, and the
 * left/right arrows move focus. Modified keys belong to the application.
 */
export function tabKeyboardCommand(event: TabKeyEvent): TabKeyboardCommand {
  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) return "menu";
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  switch (event.key) {
    case "ArrowRight":
      return "focusNext";
    case "ArrowLeft":
      return "focusPrevious";
    case "Enter":
    case " ":
      return "activate";
    case "Delete":
    case "Backspace":
      return "close";
    default:
      return null;
  }
}

/**
 * Drops tabs whose page no longer exists. When the active tab was removed, the
 * tab now at its index (else the one before) becomes active. With no tabs left,
 * the still-selected page becomes the new preview; with no pages either, the
 * open set clears and the row hides.
 */
export function prunePageTabs(
  state: OpenPagesState,
  livePageIds: ReadonlySet<PageId>,
  fallbackPageId: PageId | null,
): PrunePageTabsResult {
  const tabs = state.tabs.filter((tab) => livePageIds.has(tab.pageId));
  if (tabs.length === state.tabs.length) return { state, activatePageId: null };
  if (state.activePageId && tabs.some((tab) => tab.pageId === state.activePageId)) {
    return { state: { tabs, activePageId: state.activePageId }, activatePageId: null };
  }
  if (tabs.length) {
    const previousIndex = state.tabs.findIndex((tab) => tab.pageId === state.activePageId);
    const next = tabs[Math.min(Math.max(previousIndex, 0), tabs.length - 1)];
    return { state: { tabs, activePageId: next.pageId }, activatePageId: next.pageId };
  }
  if (fallbackPageId && livePageIds.has(fallbackPageId)) {
    return { state: seedOpenPages(fallbackPageId), activatePageId: fallbackPageId };
  }
  return { state: emptyOpenPages(), activatePageId: null };
}

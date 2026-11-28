import { currentPageId, pageDisplayName, pageNumber } from "../../model/pages";
import type { PageId } from "../../model/types";
import { store, type ChangeReason } from "../../state/store";
import { LANGUAGE_CHANGED_EVENT, t } from "../../i18n";
import { showPopover, showPopoverAt } from "../../ui/popover";
import {
  activatePage,
  closeOtherPageTabs,
  closePageTab,
  emptyOpenPages,
  makePreviewTab,
  pageTabInfo,
  promotePageTab,
  prunePageTabs,
  seedOpenPages,
  type OpenPageTabInfo,
  type OpenPagesState,
} from "./model";
import { tabMenuItems } from "./menu";
import { OpenPagesRow, type OpenPagesTabMenuPoint, type OpenPagesTabView } from "./ui";

/** What the controller needs from its host: one mount point and page navigation. */
export interface OpenPagesHost {
  mount: HTMLElement;
  /** Selects a page through the existing page flow. */
  goToPage: (page: number) => void;
}

/** Store changes that can move the open set or rename a tab. */
const PAGE_REASONS: ReadonlySet<ChangeReason> = new Set<ChangeReason>([
  "project",
  "page",
  "change",
  "undo",
]);

/**
 * Owns the session-only open-page tabs. It subscribes to the store, seeds the
 * preview when a project opens, follows every page change through one rule,
 * prunes tabs whose page is gone and renders the row locally. Nothing here
 * writes to the project, so tabs are never serialized.
 */
export class OpenPagesController {
  private state: OpenPagesState = emptyOpenPages();
  /** Last project-session load id the tabs were seeded for. */
  private loadId = -1;
  private unsubscribe: (() => void) | null = null;
  private languageListener: (() => void) | null = null;
  private readonly row: OpenPagesRow;

  constructor(private readonly host: OpenPagesHost) {
    this.row = new OpenPagesRow(host.mount, {
      activate: (pageId) => this.activate(pageId),
      close: (pageId) => this.close(pageId),
      menu: (pageId, anchor, at) => this.openTabMenu(pageId, anchor, at),
      overflow: (anchor) => this.openOverflow(anchor),
    });
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = store.subscribe((reason) => {
      if (PAGE_REASONS.has(reason)) this.sync();
    });
    this.languageListener = () => this.render(true);
    window.addEventListener(LANGUAGE_CHANGED_EVENT, this.languageListener);
    this.sync();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.languageListener) {
      window.removeEventListener(LANGUAGE_CHANGED_EVENT, this.languageListener);
      this.languageListener = null;
    }
    this.row.dispose();
  }

  /** One-way teardown for the app and the controller tests. */
  dispose(): void {
    this.stop();
  }

  /** Activates a tab or a page: a new page replaces the single preview tab. */
  activate(pageId: PageId): void {
    if (!this.pageExists(pageId)) return;
    this.state = activatePage(this.state, pageId);
    this.navigateTo(pageId);
    this.render();
  }

  /**
   * Pins the preview tab after a double-click on the card body, or opens and
   * promotes a page from the page card's Pin as tab entry.
   */
  pinPage(pageId: PageId, focusTab = false): void {
    if (!this.pageExists(pageId)) return;
    const next = promotePageTab(this.state, pageId);
    if (next === this.state) return;
    this.state = next;
    this.navigateTo(pageId);
    this.render();
    if (focusTab) this.row.focusActive();
  }

  /** Converts a pinned tab to the single preview tab, or previews a new page. */
  previewPage(pageId: PageId, focusTab = false): void {
    if (!this.pageExists(pageId)) return;
    const next = makePreviewTab(this.state, pageId);
    if (next === this.state) return;
    this.state = next;
    this.navigateTo(pageId);
    this.render();
    if (focusTab) this.row.focusActive();
  }

  /** Closes a tab only; the active page follows the nearest neighbour. */
  close(pageId: PageId, focusTab = false): void {
    const result = closePageTab(this.state, pageId);
    if (!result.closed) return;
    this.state = result.state;
    const next = result.state.activePageId;
    if (next) this.navigateTo(next);
    this.render();
    if (focusTab) this.row.focusActive();
  }

  /** Keeps only one tab and activates it; the project's pages are untouched. */
  closeOthers(pageId: PageId, focusTab = false): void {
    const result = closeOtherPageTabs(this.state, pageId);
    if (!result.closed) return;
    this.state = result.state;
    if (result.activatePageId) this.navigateTo(result.activatePageId);
    this.render();
    if (focusTab) this.row.focusActive();
  }

  /** Current session state for one page, read by the page card menu. */
  tabInfo(pageId: PageId): OpenPageTabInfo {
    return pageTabInfo(this.state, pageId);
  }

  /**
   * Opens the tab menu from the current state. A pointer opens it at the
   * pointer, the keyboard at the focused tab. Every handler re-renders and then
   * puts focus back on the active tab.
   */
  private openTabMenu(pageId: PageId, anchor: HTMLElement, at?: OpenPagesTabMenuPoint): void {
    const items = tabMenuItems(this.state, pageId, {
      pin: () => this.pinPage(pageId, true),
      preview: () => this.previewPage(pageId, true),
      close: () => this.close(pageId, true),
      closeOthers: () => this.closeOthers(pageId, true),
    });
    if (!items.length) return;
    if (at) showPopoverAt(at.x, at.y, items);
    else showPopover(anchor, items);
  }

  private pageExists(pageId: PageId): boolean {
    const project = store.project;
    return Boolean(project?.pages.some((page) => page.id === pageId));
  }

  private navigateTo(pageId: PageId): void {
    const project = store.project;
    if (!project) return;
    const page = pageNumber(project, pageId);
    if (page && page !== store.ui.page) this.host.goToPage(page);
  }

  private openOverflow(anchor: HTMLElement): void {
    const project = store.project;
    if (!project) return;
    const items = this.state.tabs.flatMap((tab) => {
      const page = pageNumber(project, tab.pageId);
      if (!page) return [];
      const name = pageDisplayName(project, tab.pageId);
      return [
        {
          label: name
            ? t("openPages.overflowItem", { page, name })
            : t("page.titleFallback", { page }),
          icon: "pages",
          action: () => this.activate(tab.pageId),
        },
      ];
    });
    if (items.length) showPopover(anchor, items);
  }

  /**
   * One rule for every page change, from any path: seed a fresh open set only
   * when the project session changes, otherwise keep the tabs, prune pages that
   * no longer exist, then make the current page the single preview tab unless
   * it is already a pinned tab.
   */
  private sync(): void {
    const project = store.project;
    const loadId = store.projectLoadId;
    if (!project) {
      this.loadId = loadId;
      this.state = emptyOpenPages();
      this.render();
      return;
    }
    const current = currentPageId(project, store.ui.page);
    if (loadId !== this.loadId) {
      this.loadId = loadId;
      this.state = seedOpenPages(current);
      this.render();
      return;
    }
    const live = new Set(project.pages.map((page) => page.id));
    const pruned = prunePageTabs(this.state, live, current);
    this.state = pruned.state;
    if (pruned.activatePageId && pruned.activatePageId !== current) {
      const page = pageNumber(project, pruned.activatePageId);
      if (page) {
        queueMicrotask(() => {
          if (store.projectLoadId !== loadId) return;
          this.host.goToPage(page);
        });
      }
      this.render();
      return;
    }
    this.state = current ? activatePage(this.state, current) : emptyOpenPages();
    this.render();
  }

  private render(force = false): void {
    const project = store.project;
    const tabs: OpenPagesTabView[] = [];
    if (project) {
      for (const tab of this.state.tabs) {
        const page = pageNumber(project, tab.pageId);
        if (!page) continue;
        tabs.push({
          pageId: tab.pageId,
          page,
          name: pageDisplayName(project, tab.pageId) ?? t("page.titleFallback", { page }),
          pinned: tab.pinned,
          active: tab.pageId === this.state.activePageId,
        });
      }
    }
    this.row.render(tabs, force);
  }
}

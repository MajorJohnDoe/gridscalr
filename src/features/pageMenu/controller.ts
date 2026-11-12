import { currentPageId } from "../../model/pages";
import type { PageId } from "../../model/types";
import { store } from "../../state/store";
import type { PanelActions } from "../../ui/panels";
import { showPopoverAt } from "../../ui/popover";
import { pageMenuItems } from "./menu";
import { pageShortcutCommand, pageShortcutReadsOnly } from "./model";
import { insertPageNear, movePageToPosition } from "./operations";
import { moveTargets } from "./targets";

/** Pointer or card position the menu opens at. */
export interface PageMenuPosition {
  x: number;
  y: number;
}

/**
 * Page card menu and page keyboard commands. The controller owns no page state:
 * every command delegates to `PanelActions`, which keeps insert and move
 * undoable and duplicate and delete explicit and checkpointed.
 */
export class PageMenuController {
  /** Opens the menu for one page, for example from a pointer right-click. */
  open(pageId: PageId, actions: PanelActions, at: PageMenuPosition): void {
    const project = store.project;
    if (!project) return;
    showPopoverAt(at.x, at.y, pageMenuItems(project, pageId, actions));
  }

  /**
   * Adds the pointer menu and the standard keyboard menu keys to one card.
   * `Shift+F10` and the Menu key open the same menu at the card, so the whole
   * page workflow is reachable without a pointer.
   */
  bindCard(card: HTMLElement, pageId: PageId, actions: PanelActions): void {
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      this.open(pageId, actions, { x: event.clientX, y: event.clientY });
    });
    card.addEventListener("keydown", (event) => {
      if (!isMenuKey(event)) return;
      event.preventDefault();
      const rect = card.getBoundingClientRect();
      this.open(pageId, actions, { x: rect.left + 24, y: rect.top + Math.min(rect.height, 48) });
    });
  }

  /**
   * Handles the page keys. Returns true when the event was consumed. View-only
   * sessions keep navigation and refuse the editing commands.
   */
  handleKey(event: KeyboardEvent, actions: PanelActions): boolean {
    const command = pageShortcutCommand(event);
    if (!command) return false;
    const project = store.project;
    if (!project || !project.pages.length) return false;
    if (pageShortcutReadsOnly(command)) {
      event.preventDefault();
      actions.goToPage(store.ui.page + (command === "nextPage" ? 1 : -1), true);
      return true;
    }
    if (store.readOnly) return false;
    const pageId = currentPageId(project, store.ui.page) ?? project.pages[0]?.id;
    if (!pageId) return false;
    event.preventDefault();
    switch (command) {
      case "insertBefore":
        void insertPageNear(actions, pageId, "before");
        break;
      case "insertAfter":
        void insertPageNear(actions, pageId, "after");
        break;
      case "movePage":
        void movePageToPosition(actions, moveTargets(project, pageId));
        break;
      case "duplicatePage":
        actions.duplicatePage(pageId);
        break;
      case "deletePage":
        actions.deletePage(pageId);
        break;
      case "previousPage":
      case "nextPage":
        return false;
    }
    return true;
  }
}

/** `Shift+F10` and the dedicated Menu key both open a context menu. */
function isMenuKey(event: KeyboardEvent): boolean {
  return event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
}

/** One controller per window; the Pages panel rebinds it on every render. */
export const pageMenu = new PageMenuController();

import { t } from "../../i18n";
import type { PageId } from "../../model/types";
import type { PopoverItem } from "../../ui/popover";
import { openPageTab, type OpenPageTabInfo, type OpenPagesState } from "./model";

/**
 * Menu models for the open-page tabs.
 *
 * Every list is rebuilt from the current state on open: the tab menu disables
 * the action that would change nothing, and the page card contributions disable
 * only a page that is already preview or already pinned.
 */

export interface TabMenuHandlers {
  pin: () => void;
  preview: () => void;
  close: () => void;
  closeOthers: () => void;
}

export interface PageCardTabHandlers {
  preview: () => void;
  pin: () => void;
}

/**
 * The tab context menu. Pin applies only to the preview tab and Preview only to
 * a pinned tab, so exactly one of the pair is enabled. Close and Close others
 * need more than one tab.
 */
export function tabMenuItems(
  state: OpenPagesState,
  pageId: PageId,
  handlers: TabMenuHandlers,
): PopoverItem[] {
  const tab = openPageTab(state, pageId);
  if (!tab) return [];
  const multiple = state.tabs.length > 1;
  return [
    {
      label: t("openPages.menuPin"),
      icon: "pin",
      disabled: tab.pinned,
      action: handlers.pin,
    },
    {
      label: t("openPages.menuPreview"),
      icon: "eye",
      disabled: !tab.pinned,
      action: handlers.preview,
    },
    { separator: true },
    {
      label: t("openPages.menuClose"),
      icon: "close",
      disabled: !multiple,
      action: handlers.close,
    },
    {
      label: t("openPages.menuCloseOthers"),
      icon: "close",
      disabled: !multiple,
      action: handlers.closeOthers,
    },
  ];
}

/**
 * The two entries the page card menu contributes. Preview is a no-op on the
 * preview tab and Pin as tab is a no-op on a pinned tab; a page that is not
 * open can be opened either way.
 */
export function pageCardTabMenuItems(
  info: OpenPageTabInfo,
  handlers: PageCardTabHandlers,
): PopoverItem[] {
  return [
    {
      label: t("openPages.pageMenuPreview"),
      icon: "eye",
      disabled: info.preview,
      action: handlers.preview,
    },
    {
      label: t("openPages.pageMenuPin"),
      icon: "pin",
      disabled: info.pinned,
      action: handlers.pin,
    },
  ];
}

import { t } from "../i18n";
import { store } from "../state/store";
import { showPopoverAt } from "./popover";
import { loadPanelPreferences, savePanelPreferences } from "./preferences";

/**
 * Pages tab context menu: per-window view options for the page list. Grouping
 * is a view of the same ordered page list, never a second page structure.
 */
export function showPagesTabMenu(x: number, y: number, refresh: () => void): void {
  const prefs = loadPanelPreferences();
  const multipleSources = (store.project?.documents.length ?? 0) > 1;
  showPopoverAt(x, y, [
    {
      label: t("pagesMenu.group"),
      checked: prefs.pagesGrouped && multipleSources,
      disabled: !multipleSources,
      action: () => {
        savePanelPreferences({ pagesGrouped: !prefs.pagesGrouped });
        refresh();
      },
    },
    {
      label: t("pagesMenu.source"),
      checked: prefs.pagesShowSource && multipleSources,
      disabled: prefs.pagesGrouped || !multipleSources,
      action: () => {
        savePanelPreferences({ pagesShowSource: !prefs.pagesShowSource });
        refresh();
      },
    },
    { separator: true },
    {
      label: t("pagesMenu.numbers"),
      checked: prefs.pagesShowNumbers,
      action: () => {
        savePanelPreferences({ pagesShowNumbers: !prefs.pagesShowNumbers });
        refresh();
      },
    },
  ]);
}

/** Wires the right-click view menu on the Pages dock tab. */
export function bindPagesTabMenu(tab: HTMLElement | undefined, refresh: () => void): void {
  if (!tab) return;
  tab.title = t("pagesMenu.hint");
  tab.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showPagesTabMenu(event.clientX, event.clientY, refresh);
  });
}

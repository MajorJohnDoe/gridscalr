import { t } from "../../i18n";
import { el } from "../../ui/dom";
import { icon } from "../../ui/icons";

/**
 * DOM pieces for page reordering: the document run header and the screen-reader
 * hints. The insertion line and the live region are shared through
 * `features/listInteraction`, so this module stays layout-only.
 */

/** Stable id so every page card can describe the reorder keys. */
export const PAGE_REORDER_HINT_ID = "page-reorder-hint";

/** Stable id for the multi-selection hint referenced by every card. */
export const PAGE_SELECT_HINT_ID = "page-select-hint";

/** Visually hidden hint referenced by `aria-describedby` on every card. */
export function pageReorderHint(): HTMLElement {
  const hint = el("p", "page-reorder-hint", t("page.reorderHint"));
  hint.id = PAGE_REORDER_HINT_ID;
  return hint;
}

/** Visually hidden hint that explains Ctrl and Shift selection. */
export function pageSelectHint(): HTMLElement {
  const hint = el("p", "page-reorder-hint", t("page.selectHint"));
  hint.id = PAGE_SELECT_HINT_ID;
  return hint;
}

/** Header that makes a run of pages from another source document explicit. */
export function documentRunHeader(name: string, count: number): HTMLElement {
  const header = el("div", "page-document-run");
  header.setAttribute("role", "heading");
  header.setAttribute("aria-level", "3");
  header.setAttribute("aria-label", t("page.documentRunAria", { name, count }));
  const kind = el("span", "page-document-icon");
  kind.innerHTML = icon("file", 12);
  header.append(
    kind,
    el("span", "page-document-name", name),
    el("span", "page-document-count", t("page.documentRunCount", { count })),
  );
  return header;
}

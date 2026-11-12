import { t, type MessageKey } from "../../i18n";
import { el } from "../../ui/dom";
import {
  PAGE_STATUS_FILTERS,
  type PageStatusBadge,
  type PageStatusBadgeId,
  type PageStatusFilter,
} from "./model";

/**
 * DOM pieces for page status: the badge row on a page card, the filter bar at
 * the top of the Pages panel and the empty note. Labels come from the i18n
 * catalogs and every badge carries visible text, so no state is colour-only.
 */

const BADGE_LABEL_KEYS: Record<PageStatusBadgeId, MessageKey> = {
  sourceChanged: "page.sourceChangedBadge",
  superseded: "page.supersededBadge",
  ocrStale: "page.ocrStaleBadge",
  ocrMissing: "page.ocrMissingBadge",
  scaleLocked: "page.scaleLocked",
  calibrated: "page.calibrated",
  blank: "page.blankBadge",
  template: "page.sheetBadge",
  itemCount: "page.itemCount",
};

const BADGE_CLASSES: Record<PageStatusBadgeId, string> = {
  sourceChanged: "is-source-changed",
  superseded: "is-superseded",
  ocrStale: "is-ocr-stale",
  ocrMissing: "is-ocr-missing",
  scaleLocked: "is-scale-locked",
  calibrated: "is-calibrated",
  blank: "is-blank",
  template: "is-template",
  itemCount: "is-item-count",
};

const FILTER_LABEL_KEYS: Record<PageStatusFilter, MessageKey> = {
  all: "page.statusFilterAll",
  changedSource: "page.statusFilterChangedSource",
  superseded: "page.statusFilterSuperseded",
  missingOcr: "page.statusFilterOcr",
  lockedScale: "page.statusFilterLockedScale",
};

/** Localized label for one badge. */
export function pageStatusBadgeLabel(badge: PageStatusBadge): string {
  return t(BADGE_LABEL_KEYS[badge.id], { count: badge.count ?? 0 });
}

/** Localized label for one filter button. */
export function pageStatusFilterLabel(filter: PageStatusFilter): string {
  return t(FILTER_LABEL_KEYS[filter]);
}

/** Badge row for a page card; empty when the page has no state to show. */
export function pageStatusBadgesNode(badges: readonly PageStatusBadge[]): HTMLElement {
  const row = el("div", "page-badges");
  for (const badge of badges) {
    const node = el("span", `page-badge ${BADGE_CLASSES[badge.id]}`, pageStatusBadgeLabel(badge));
    node.dataset.badge = badge.id;
    row.append(node);
  }
  return row;
}

/**
 * Screen-reader suffix for a page card. Each badge is already visible text, but
 * a card's aria-label replaces its contents, so the states are repeated here.
 */
export function pageStatusAriaText(badges: readonly PageStatusBadge[]): string {
  if (!badges.length) return "";
  return t("page.statusAria", {
    states: badges.map((badge) => pageStatusBadgeLabel(badge)).join(", "),
  });
}

export interface PageStatusFilterBarInput {
  active: PageStatusFilter;
  counts: Record<PageStatusFilter, number>;
  /** Hides problem filters with no matching pages; "all" always stays. */
  omitEmpty?: boolean;
  /** Called with the chosen filter; the host re-renders the panel. */
  onSelect: (filter: PageStatusFilter) => void;
}

/**
 * One toggle-button group. Buttons keep the native keyboard order, `aria-pressed`
 * carries the active state and the count is visible text rather than a colour.
 */
export function pageStatusFilterBar(input: PageStatusFilterBarInput): HTMLElement {
  const bar = el("div", "page-status-filters");
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", t("page.statusFilterGroup"));
  for (const filter of PAGE_STATUS_FILTERS) {
    const count = input.counts[filter] ?? 0;
    if (input.omitEmpty && filter !== "all" && filter !== input.active && count === 0) continue;
    const label = pageStatusFilterLabel(filter);
    const button = el("button", "page-status-filter");
    button.type = "button";
    button.dataset.filter = filter;
    button.setAttribute("aria-pressed", String(filter === input.active));
    button.setAttribute("aria-label", t("page.statusFilterAria", { label, count }));
    if (filter === input.active) button.classList.add("is-active");
    button.append(
      el("span", "page-status-filter-label", label),
      el("span", "page-status-filter-count", String(count)),
    );
    button.addEventListener("click", () => input.onSelect(filter));
    bar.append(button);
  }
  if (input.active !== "all")
    bar.append(el("p", "page-status-filter-note", t("page.statusFilterReorderHint")));
  return bar;
}

/** Shown instead of the page list when the active filter matches no page. */
export function pageStatusEmptyNote(): HTMLElement {
  return el("p", "empty-note page-status-empty", t("page.statusFilterEmpty"));
}

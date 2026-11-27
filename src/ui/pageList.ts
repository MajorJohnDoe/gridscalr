import { currentPageId, pageDisplayName, pageLocationLabel } from "../model/pages";
import type { PageId, PageSize } from "../model/types";
import { store } from "../state/store";
import {
  documentRunHeader,
  documentSegments,
  pageReorder,
  PAGE_REORDER_HINT_ID,
  PAGE_REORDER_KEYSHORTCUTS,
  PAGE_SELECT_HINT_ID,
  pageReorderHint,
  pageSelectHint,
} from "../features/pageReorder";
import { RowNavigator, dragHandle } from "../features/listInteraction";
import {
  pageMenu,
  pageMenuHint,
  PAGE_MENU_HINT_ID,
  PAGE_MENU_KEYSHORTCUTS,
} from "../features/pageMenu";
import {
  PAGE_STATUS_FILTERS,
  pageStatus,
  pageStatusBadgesNode,
  pageStatusEmptyNote,
  pageStatusFilterBar,
  type PageStatusFilter,
  type PageStatusRow,
} from "../features/pageStatus";
import { pageWindowControls, pageWindowState, type PageWindowAction } from "../features/pageWindow";
import { el } from "./dom";
import { icon } from "./icons";
import { loadPanelPreferences } from "./preferences";
import { bindPagesTabMenu } from "./pagesTabMenu";
import { showPopoverAt } from "./popover";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";
import { t } from "../i18n";

interface PendingThumbnail {
  page: number;
  image: HTMLImageElement;
}

let thumbnailObserver: IntersectionObserver | null = null;

const pageNavigator = new RowNavigator(".page-card");

/** One window control keeps focus across the panel render it triggers. */
let pendingWindowFocus: PageWindowAction | null = null;

/** Stops observing page cards when the Pages tab is no longer mounted. */
export function disconnectPageThumbnails(): void {
  thumbnailObserver?.disconnect();
  thumbnailObserver = null;
}

function thumbWidth(size: PageSize | undefined): number {
  if (!size || size.height <= 0) return 60;
  const ratio = Math.max(0.55, Math.min(1.65, size.width / size.height));
  return Math.round(Math.max(58, Math.min(132, 82 * ratio)));
}

function applyThumbShape(thumb: HTMLElement, size: PageSize | undefined): void {
  if (!size || size.height <= 0) return;
  const width = thumbWidth(size);
  thumb.style.aspectRatio = `${size.width} / ${size.height}`;
  thumb.style.width = `${width}px`;
  thumb.style.flexBasis = `${width}px`;
}

function applyThumbnail(pending: PendingThumbnail, url: string): void {
  pending.image.src = url;
  pending.image.hidden = false;
}

/**
 * Names the card from the text it shows. A separate `aria-label` cannot include
 * the visible page number, size, source and status labels, which breaks WCAG
 * 2.5.3 Label in Name (axe `label-content-name-mismatch`); `aria-labelledby`
 * keeps the accessible name and the visible text in step.
 */
function refreshPageCardName(card: HTMLElement): void {
  const ids = [...card.querySelectorAll<HTMLElement>("[data-page-label]")]
    .map((node) => node.id)
    .filter(Boolean);
  if (ids.length) card.setAttribute("aria-labelledby", ids.join(" "));
  else card.removeAttribute("aria-labelledby");
}

function pageCardLabel(node: HTMLElement, pageId: PageId, suffix: string): void {
  node.id = `page-card-${pageId}-${suffix}`;
  node.setAttribute("data-page-label", "");
}

function beginPageRename(title: HTMLElement, pageId: PageId, page: number): void {
  if (store.readOnly || title.querySelector(".page-name-input")) return;
  const input = el("input", "page-name-input");
  input.value = title.textContent ?? "";
  input.maxLength = 80;
  input.setAttribute("aria-label", t("page.nameAria", { page }));
  title.replaceWith(input);
  input.focus();
  input.select();
  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    if (save) store.renamePage(pageId, input.value);
    else store.emit("change");
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      finish(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
    }
    event.stopPropagation();
  });
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("dblclick", (event) => event.stopPropagation());
}

export function updatePageSizeLabel(refs: ShellRefs, page: number, size: PageSize): void {
  const card = refs.dockBody.querySelector<HTMLElement>(`.page-card[data-page="${page}"]`);
  if (!card) return;
  const label = card.querySelector<HTMLElement>(".page-size");
  if (label)
    label.textContent = t("page.cardMeta", {
      page,
      width: Math.round(size.width),
      height: Math.round(size.height),
    });
  const thumb = card.querySelector<HTMLElement>(".page-thumb");
  if (thumb) applyThumbShape(thumb, size);
}

function renderEmptyPages(refs: ShellRefs, actions: PanelActions): void {
  pageReorder.detach();
  pageWindowState.reset();
  const empty = el("div", "page-list page-list-empty");
  empty.append(el("p", "empty-note", t("page.emptyProject")));
  const add = el("button", "btn btn-small", t("page.addPages"));
  add.type = "button";
  add.disabled = store.readOnly;
  add.addEventListener("click", () => actions.addPages());
  const importPages = el("button", "btn btn-small", t("page.importProjectPages"));
  importPages.type = "button";
  importPages.disabled = store.readOnly;
  importPages.addEventListener("click", () => actions.importProjectPages());
  empty.append(add, importPages);
  refs.dockBody.append(empty);
}

let boundTab: HTMLElement | null = null;

/** One context-menu binding per dock tab; the panel re-renders many times. */
function bindTabMenu(refs: ShellRefs, actions: PanelActions): void {
  const tab = refs.dockTabs.find((entry) => entry.dataset.tab === "pages") ?? null;
  if (!tab || tab === boundTab) return;
  boundTab = tab;
  bindPagesTabMenu(tab, actions.refresh);
}

/** The Pages status filter row, shared by a full panel render and a badge refresh. */
function pageStatusFilterBarFor(
  actions: PanelActions,
  filter: PageStatusFilter,
  counts: Record<PageStatusFilter, number>,
): HTMLElement {
  return pageStatusFilterBar({
    active: filter,
    counts,
    omitEmpty: true,
    onSelect: (next) => {
      if (pageStatus.setFilter(next)) actions.refresh();
    },
  });
}

export function renderPages(refs: ShellRefs, actions: PanelActions): void {
  bindTabMenu(refs, actions);
  disconnectPageThumbnails();
  pageNavigator.detach();
  refs.dockBody.querySelector(".page-list")?.remove();
  const project = store.project!;
  if (!project.pages.length) {
    renderEmptyPages(refs, actions);
    return;
  }
  const rows = pageStatus.rows(project);
  const filter = pageStatus.activeFilter;
  refs.dockBody.querySelector(".page-status-filters")?.remove();
  const counts = pageStatus.counts(rows);
  const hasProblemFilter = PAGE_STATUS_FILTERS.some(
    (entry) => entry !== "all" && (counts[entry] ?? 0) > 0,
  );
  const focusRequest = pageStatus.takeFocusRequest();
  // With nothing to filter, the chip row is noise rather than a control.
  if (hasProblemFilter || filter !== "all") {
    const filterBar = pageStatusFilterBarFor(actions, filter, counts);
    refs.dockBody.append(filterBar);
    if (focusRequest) {
      filterBar
        .querySelector<HTMLButtonElement>(`.page-status-filter[data-filter="${filter}"]`)
        ?.focus({ preventScroll: true });
    }
  }
  const visible = pageStatus.visibleFrom(rows);
  if (!visible.length) {
    pageReorder.detach();
    refs.dockBody.append(pageStatusEmptyNote());
    return;
  }
  const visibleIds = visible.map((row) => row.pageId);
  const selectedAnchor = pageReorder.selectionIds().find((id) => visibleIds.includes(id));
  const currentAnchor = currentPageId(project, store.ui.page);
  const anchorId =
    selectedAnchor ??
    (currentAnchor && visibleIds.includes(currentAnchor) ? currentAnchor : null) ??
    visibleIds[0] ??
    null;
  const window = pageWindowState.window(visibleIds, anchorId);
  const list = el("div", "page-list");
  // Reordering maps a drop position in the rendered list, so it stays off while
  // a filter hides pages. Viewing, renaming and page actions still work.
  const reorderEnabled = !store.readOnly && filter === "all";
  pageReorder.setWindowOffset(window.start);
  if (visible.length > window.end - window.start) {
    const anchorRow = visible.find((row) => row.pageId === anchorId);
    refs.dockBody.append(
      pageWindowControls({
        start: window.start,
        end: window.end,
        total: visible.length,
        current: anchorRow?.page,
        onNavigate: (action, page) => {
          pendingWindowFocus = action;
          if (action === "jump" && page !== undefined) {
            const target = Math.max(1, Math.min(visible.length, Math.round(page)));
            pageWindowState.jumpToPage(visible.length, target - 1);
            const displayPage = visible[target - 1]?.page ?? target;
            if (displayPage !== store.ui.page) actions.goToPage(displayPage, true);
            else actions.refresh();
          } else {
            const step = window.end - window.start;
            pageWindowState.shift(visible.length, action === "next" ? step : -step);
            actions.refresh();
          }
        },
      }),
    );
  }
  const shown = visible.slice(window.start, window.end);
  const prefs = loadPanelPreferences();
  const runs = new Map<number, { documentId: string | null; count: number }>();
  if (prefs.pagesGrouped && project.documents.length > 1) {
    const entries = shown.map((row) => ({ id: row.pageId, documentId: row.documentId }));
    for (const segment of documentSegments(entries)) runs.set(segment.start, segment);
  }
  const pendingThumbnails = new Map<Element, PendingThumbnail>();
  for (let index = 0; index < shown.length; index++) {
    const row = shown[index];
    const page = row.page;
    const record = project.pages[page - 1];
    const pageId = record.id;
    const run = runs.get(index);
    if (run) {
      const document = project.documents.find((entry) => entry.id === run.documentId);
      list.append(documentRunHeader(document?.name ?? "", run.count));
    }
    const card = el("button", "page-card");
    card.type = "button";
    card.dataset.page = String(page);
    card.dataset.pageId = pageId;
    card.classList.toggle("is-active", page === store.ui.page);
    card.setAttribute(
      "aria-keyshortcuts",
      reorderEnabled
        ? `${PAGE_MENU_KEYSHORTCUTS} ${PAGE_REORDER_KEYSHORTCUTS}`
        : PAGE_MENU_KEYSHORTCUTS,
    );
    card.setAttribute(
      "aria-describedby",
      reorderEnabled
        ? `${PAGE_MENU_HINT_ID} ${PAGE_REORDER_HINT_ID} ${PAGE_SELECT_HINT_ID}`
        : `${PAGE_MENU_HINT_ID} ${PAGE_SELECT_HINT_ID}`,
    );
    pageReorder.decorateCard(card, pageId);
    const thumb = el("div", "page-thumb");
    const size = actions.getPageSize(page);
    applyThumbShape(thumb, size);
    const image = el("img", "page-thumb-image");
    image.alt = "";
    image.draggable = false;
    image.decoding = "async";
    image.setAttribute("aria-hidden", "true");
    image.hidden = true;
    thumb.append(image);
    if (prefs.pagesShowNumbers) {
      const number = el("span", "page-thumb-number");
      // The corner number repeats the page number already in `.page-size`. It is
      // drawn with CSS content so it adds no text node that would split the
      // card's accessible name (WCAG 2.5.3, axe label-content-name-mismatch).
      number.dataset.page = String(page);
      number.setAttribute("aria-hidden", "true");
      thumb.append(number);
    }
    const cached = actions.getPageThumbnail(page);
    if (cached) applyThumbnail({ page, image }, cached);
    const info = el("div", "page-info");
    const pageName = pageDisplayName(project, pageId);
    const title = el("div", "page-title", pageName ?? t("page.titleFallback", { page }));
    pageCardLabel(title, pageId, "title");
    title.title = pageName ? `${pageName} — double-click to rename` : t("page.doubleClickRename");
    title.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      beginPageRename(title, pageId, page);
    });
    info.append(title, document.createTextNode(" "));
    const location = pageLocationLabel(project, pageId);
    if (location) {
      const locationNode = el("div", "page-location", location);
      pageCardLabel(locationNode, pageId, "location");
      locationNode.title = location;
      info.append(locationNode, document.createTextNode(" "));
    }
    const sizeText = size
      ? t("page.cardMeta", {
          page,
          width: Math.round(size.width),
          height: Math.round(size.height),
        })
      : t("page.loadingSize");
    const sizeNode = el("div", "page-size", sizeText);
    pageCardLabel(sizeNode, pageId, "size");
    info.append(sizeNode, document.createTextNode(" "));
    if (!prefs.pagesGrouped && prefs.pagesShowSource && project.documents.length > 1) {
      const sourceDocument = project.documents.find((entry) => entry.id === row.documentId);
      if (sourceDocument) {
        const source = el("div", "page-source");
        pageCardLabel(source, pageId, "source");
        const sourceIcon = el("span", "page-source-icon");
        sourceIcon.innerHTML = icon("file", 11);
        source.append(sourceIcon, el("span", "page-source-name", sourceDocument.name));
        source.title = sourceDocument.name;
        info.append(source, document.createTextNode(" "));
      }
    }
    const badges = pageStatusBadgesNode(row.badges);
    if (badges.childElementCount) {
      pageCardLabel(badges, pageId, "status");
      info.append(badges, document.createTextNode(" "));
    }
    card.append(thumb, info);
    if (reorderEnabled) card.append(dragHandle(t("page.dragHandle")));
    pendingThumbnails.set(card, { page, image });
    refreshPageCardName(card);
    card.addEventListener("click", (event) => {
      if (pageReorder.handleClick(event, pageId)) actions.goToPage(page, true);
    });
    if (reorderEnabled) {
      card.addEventListener("keydown", (event) => pageReorder.handleKeyDown(event, pageId));
    }
    pageMenu.bindCard(card, pageId, actions);
    list.append(card);
  }
  list.addEventListener("contextmenu", (event) => {
    // Cards have their own menu; this one covers the empty panel area.
    if ((event.target as HTMLElement | null)?.closest(".page-card")) return;
    event.preventDefault();
    if (store.readOnly) return;
    showPopoverAt(event.clientX, event.clientY, [
      {
        label: t("page.addPages"),
        icon: "plus",
        action: () => actions.addPages(),
      },
      {
        label: t("page.importProjectPages"),
        icon: "plus",
        action: () => actions.importProjectPages(),
      },
    ]);
  });
  pageReorder.setActions({
    reorder: (pageIds, insertionIndex) => actions.reorderPages(pageIds, insertionIndex),
    goToPage: (page) => actions.goToPage(page, true),
  });
  list.append(pageReorderHint(), pageSelectHint(), pageMenuHint());
  refs.dockBody.append(list);
  pageReorder.bindList(list, refs.dockBody);
  pageNavigator.bind(list);
  pageReorder.afterRender();
  const focusWindow = pendingWindowFocus;
  pendingWindowFocus = null;
  if (focusWindow) {
    refs.dockBody
      .querySelector<HTMLElement>(`[data-page-window-action="${focusWindow}"]`)
      ?.focus({ preventScroll: true });
  }
  observeThumbnails(refs, actions, pendingThumbnails);
}

/**
 * Refresh only the parts of the mounted Pages panel that derive from the
 * source-status summary. The project has not changed, so the cards keep their
 * thumbnails, listeners and any rename field that is open; only the badge rows,
 * the filter counts and the accessible names are updated.
 *
 * A non-default filter can change which pages match, so that case rebuilds the
 * panel instead of patching it. It is still a panel render, not a shell render.
 */
export function refreshPageStatusBadges(refs: ShellRefs, actions: PanelActions): void {
  const project = store.project;
  if (!project) return;
  if (pageStatus.activeFilter !== "all") {
    renderPages(refs, actions);
    return;
  }
  const list = refs.dockBody.querySelector<HTMLElement>(".page-list");
  if (!list) return;
  const rows = pageStatus.rows(project);
  syncPageStatusFilters(refs, actions, rows);
  const byId = new Map(rows.map((row) => [row.pageId, row]));
  for (const card of list.querySelectorAll<HTMLElement>(".page-card[data-page-id]")) {
    const row = byId.get(card.dataset.pageId ?? "");
    if (!row) continue;
    const existing = card.querySelector<HTMLElement>(".page-badges");
    const next = pageStatusBadgesNode(row.badges);
    if (next.childElementCount) {
      if (existing) existing.replaceWith(next);
      else card.querySelector(".page-info")?.append(next);
      pageCardLabel(next, card.dataset.pageId as PageId, "status");
    } else {
      existing?.remove();
    }
    refreshPageCardName(card);
  }
}

function syncPageStatusFilters(
  refs: ShellRefs,
  actions: PanelActions,
  rows: readonly PageStatusRow[],
): void {
  const filter = pageStatus.activeFilter;
  const counts = pageStatus.counts(rows);
  const hasProblemFilter = PAGE_STATUS_FILTERS.some(
    (entry) => entry !== "all" && (counts[entry] ?? 0) > 0,
  );
  const existing = refs.dockBody.querySelector<HTMLElement>(".page-status-filters");
  if (!hasProblemFilter && filter === "all") {
    existing?.remove();
    return;
  }
  const bar = pageStatusFilterBarFor(actions, filter, counts);
  if (existing) existing.replaceWith(bar);
  else refs.dockBody.querySelector(".page-list")?.before(bar);
}

/**
 * Page sizes and previews are prepared only when a card approaches the visible
 * area, rendering one preview at a time. Opening a 400-page project therefore
 * stays cheap: the panel only pays for what the user can actually see.
 */
function observeThumbnails(
  refs: ShellRefs,
  actions: PanelActions,
  pending: Map<Element, PendingThumbnail>,
): void {
  if (!pending.size || typeof IntersectionObserver === "undefined") return;
  thumbnailObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const request = pending.get(entry.target);
        if (!request) continue;
        pending.delete(entry.target);
        thumbnailObserver?.unobserve(entry.target);
        actions.ensurePageSize(request.page);
        void actions.requestPageThumbnail(request.page).then((url) => {
          if (url) applyThumbnail(request, url);
        });
      }
    },
    { root: refs.dockBody, rootMargin: "240px 0px" },
  );
  for (const card of pending.keys()) thumbnailObserver.observe(card);
}

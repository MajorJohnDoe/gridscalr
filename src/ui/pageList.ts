import { totalPageCount } from "../model/documents";
import type { PageSize } from "../model/types";
import { store } from "../state/store";
import { el } from "./dom";
import { icon } from "./icons";
import { showPopoverAt } from "./popover";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";

interface PendingThumbnail {
  page: number;
  image: HTMLImageElement;
  placeholder: HTMLElement;
}

let thumbnailObserver: IntersectionObserver | null = null;

/** Stops observing page cards when the Pages tab is no longer mounted. */
export function disconnectPageThumbnails(): void {
  thumbnailObserver?.disconnect();
  thumbnailObserver = null;
}

function applyThumbnail(pending: PendingThumbnail, url: string): void {
  pending.image.src = url;
  pending.image.hidden = false;
  pending.placeholder.hidden = true;
}

/** Updates one card when its page size arrives after the panel was rendered. */
export function updatePageSizeLabel(refs: ShellRefs, page: number, size: PageSize): void {
  const card = refs.dockBody.querySelector<HTMLElement>(`.page-card[data-page="${page}"]`);
  if (!card) return;
  const label = card.querySelector<HTMLElement>(".page-size");
  if (label) label.textContent = `${Math.round(size.width)} × ${Math.round(size.height)} pt`;
  const thumb = card.querySelector<HTMLElement>(".page-thumb");
  if (thumb) thumb.style.aspectRatio = `${size.width} / ${size.height}`;
}

export function renderPages(refs: ShellRefs, actions: PanelActions): void {
  disconnectPageThumbnails();
  const project = store.project!;
  const list = el("div", "page-list");
  const total = totalPageCount(project.documents);
  const max = Math.min(total, 400);
  const pendingThumbnails = new Map<Element, PendingThumbnail>();
  for (let page = 1; page <= max; page++) {
    const card = el("button", "page-card");
    card.type = "button";
    card.dataset.page = String(page);
    card.classList.toggle("is-active", page === store.ui.page);
    const thumb = el("div", "page-thumb");
    const size = actions.getPageSize(page);
    if (size) {
      thumb.style.aspectRatio = `${size.width} / ${size.height}`;
    }
    const thumbNumber = el("span", "page-thumb-placeholder", String(page));
    const image = el("img", "page-thumb-image");
    image.alt = "";
    image.draggable = false;
    image.decoding = "async";
    image.setAttribute("aria-hidden", "true");
    image.hidden = true;
    thumb.append(thumbNumber, image);
    const cached = actions.getPageThumbnail(page);
    if (cached) applyThumbnail({ page, image, placeholder: thumbNumber }, cached);
    const info = el("div", "page-info");
    info.append(el("div", "page-title", `Page ${page}`));
    const sizeNode = el(
      "div",
      "page-size",
      size ? `${Math.round(size.width)} × ${Math.round(size.height)} pt` : "Loading size…",
    );
    info.append(sizeNode);
    const badges = el("div", "page-badges");
    if (project.pages[String(page)]?.calibration) {
      badges.append(el("span", "page-badge is-calibrated", "Calibrated"));
    }
    if (project.pages[String(page)]?.scaleLocked) {
      badges.append(el("span", "page-badge", "Scale locked"));
    }
    const itemCount = project.layers.reduce(
      (count, layer) => count + layer.items.filter((item) => item.page === page).length,
      0,
    );
    if (itemCount) badges.append(el("span", "page-badge", `${itemCount} items`));
    if (badges.childElementCount) info.append(badges);
    card.append(thumb, info);
    pendingThumbnails.set(card, { page, image, placeholder: thumbNumber });
    card.addEventListener("click", () => actions.goToPage(page, true));
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const locked = total <= 1;
      showPopoverAt(event.clientX, event.clientY, [
        {
          label: `Go to page ${page}`,
          icon: "pages",
          action: () => actions.goToPage(page, true),
        },
        { separator: true },
        {
          label: "Delete page…",
          icon: "trash",
          danger: true,
          disabled: locked,
          action: () => actions.deletePage(page),
        },
      ]);
    });
    list.append(card);
  }
  refs.dockBody.append(list);
  if (total > max) {
    const note = el("div", "empty-note small", `Showing the first ${max} of ${total} pages.`);
    refs.dockBody.append(note);
  }
  observeThumbnails(refs, actions, pendingThumbnails);
  const footer = el("button", "btn btn-small btn-ghost", "Fit current page");
  footer.type = "button";
  footer.addEventListener("click", () => actions.goToPage(store.ui.page, true));
  const remove = el("button", "btn btn-small btn-ghost", "Delete page…");
  remove.type = "button";
  remove.disabled = total <= 1;
  remove.title =
    total <= 1
      ? "A project must keep at least one page."
      : "Delete the current page and move later pages down";
  remove.innerHTML = `${icon("trash", 13)}<span>Delete page…</span>`;
  remove.addEventListener("click", () => actions.deletePage(store.ui.page));
  refs.dockFooter.append(footer, remove);
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

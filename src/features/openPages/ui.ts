import { t } from "../../i18n";
import type { PageId } from "../../model/types";
import { el } from "../../ui/dom";
import { icon } from "../../ui/icons";

/** One rendered tab: display data only, resolved from the project by the controller. */
export interface OpenPagesTabView {
  pageId: PageId;
  /** 1-based display number, never an identity. */
  page: number;
  name: string;
  pinned: boolean;
  active: boolean;
}

export interface OpenPagesRowHandlers {
  activate: (pageId: PageId) => void;
  close: (pageId: PageId) => void;
  overflow: (anchor: HTMLElement) => void;
}

interface FocusKey {
  pageId?: string;
  kind: string;
}

/**
 * The N4 open-pages row. It owns the DOM below its mount and re-renders only
 * itself when a tab changes, so the shell, the Pages panel and the canvas are
 * never rebuilt for a tab.
 *
 * The tablist owns only `role="tab"` elements. Close controls live in a sibling
 * overlay inside the same scroll track, positioned over each tab, so the
 * tablist stays a valid accessibility parent. The overlay scrolls with the
 * tabs; focus and the list scroll position survive a render.
 */
export class OpenPagesRow {
  private readonly label: HTMLElement;
  private readonly scroll: HTMLElement;
  private readonly track: HTMLElement;
  private readonly list: HTMLElement;
  private readonly closeLayer: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly overflow: HTMLButtonElement;
  private signature = "";
  private lastActivePageId: string | null = null;
  private hoveredPageId: string | null = null;
  private readonly onPointerOver = (event: PointerEvent) => this.pointerOver(event);
  private readonly onPointerLeave = () => this.setHover(null);
  private readonly resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly mount: HTMLElement,
    private readonly handlers: OpenPagesRowHandlers,
  ) {
    this.mount.classList.add("open-pages-row");
    this.mount.setAttribute("role", "navigation");
    this.mount.hidden = true;
    this.label = el("span", "open-pages-label");
    this.scroll = el("div", "open-pages-scroll");
    this.track = el("div", "open-pages-track");
    this.list = el("div", "open-pages-tablist");
    this.list.setAttribute("role", "tablist");
    this.list.setAttribute("aria-orientation", "horizontal");
    this.closeLayer = el("div", "open-page-close-layer");
    this.track.append(this.list, this.closeLayer);
    this.scroll.append(this.track);
    this.hint = el("span", "open-pages-hint");
    this.overflow = el("button", "open-pages-overflow");
    this.overflow.type = "button";
    this.overflow.dataset.kind = "overflow";
    this.overflow.innerHTML = icon("chevronsRight", 14);
    this.overflow.addEventListener("click", () => this.handlers.overflow(this.overflow));
    this.scroll.addEventListener("pointerover", this.onPointerOver);
    this.scroll.addEventListener("pointerleave", this.onPointerLeave);
    this.mount.append(this.label, this.scroll, this.hint, this.overflow);
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.positionCloses());
      this.resizeObserver.observe(this.list);
    }
    this.relabel();
  }

  /** Drops listeners and the size observer when the controller stops. */
  dispose(): void {
    this.resizeObserver?.disconnect();
    this.scroll.removeEventListener("pointerover", this.onPointerOver);
    this.scroll.removeEventListener("pointerleave", this.onPointerLeave);
  }

  /** Re-applies the active language without rebuilding the rest of the shell. */
  relabel(): void {
    this.label.textContent = t("openPages.label");
    this.mount.setAttribute("aria-label", t("openPages.rowAria"));
    this.list.setAttribute("aria-label", t("openPages.tablistAria"));
    this.hint.textContent = t("openPages.hint");
    this.overflow.title = t("openPages.overflowHint");
    this.overflow.setAttribute("aria-label", t("openPages.overflow"));
  }

  render(tabs: readonly OpenPagesTabView[], force = false): void {
    this.relabel();
    this.mount.hidden = tabs.length === 0;
    const signature = JSON.stringify(tabs);
    if (!force && signature === this.signature) return;
    this.signature = signature;
    const scrollLeft = this.scroll.scrollLeft;
    const focus = this.captureFocus();
    if (this.hoveredPageId && !tabs.some((tab) => tab.pageId === this.hoveredPageId)) {
      this.hoveredPageId = null;
    }
    this.list.replaceChildren();
    this.closeLayer.replaceChildren();
    const closable = tabs.length > 1;
    for (const tab of tabs) this.list.append(this.tabNode(tab, closable));
    if (closable) for (const tab of tabs) this.closeLayer.append(this.closeNode(tab));
    this.scroll.scrollLeft = scrollLeft;
    this.restoreFocus(focus);
    this.positionCloses();
    const activePageId = tabs.find((tab) => tab.active)?.pageId ?? null;
    if (activePageId !== this.lastActivePageId) {
      this.lastActivePageId = activePageId;
      const active = this.list.querySelector<HTMLElement>(".open-page-tab-cell.is-active");
      if (active && typeof active.scrollIntoView === "function") {
        active.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }
  }

  private tabNode(tab: OpenPagesTabView, closable: boolean): HTMLElement {
    const cell = el(
      "div",
      `open-page-tab-cell${tab.active ? " is-active" : ""}${tab.pinned ? "" : " is-preview"}${
        closable ? " is-closable" : ""
      }`,
    );
    cell.dataset.pageId = tab.pageId;
    cell.setAttribute("role", "presentation");

    const button = el("button", "open-page-tab");
    button.type = "button";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(tab.active));
    button.tabIndex = 0;
    button.dataset.pageId = tab.pageId;
    button.dataset.kind = "tab";
    button.title = tab.name;
    button.addEventListener("click", () => this.handlers.activate(tab.pageId));

    const numeral = el("span", "open-page-numeral", String(tab.page));
    const name = el("span", "open-page-name", tab.name);
    button.append(numeral, name);
    if (!tab.pinned) {
      const pin = el("span", "open-page-pin");
      pin.innerHTML = icon("pin", 12);
      pin.setAttribute("aria-hidden", "true");
      pin.title = t("openPages.previewPin");
      button.append(pin);
    }
    cell.append(button);
    return cell;
  }

  private closeNode(tab: OpenPagesTabView): HTMLButtonElement {
    const close = el(
      "button",
      tab.pageId === this.hoveredPageId ? "open-page-close is-hover" : "open-page-close",
    );
    if (tab.active) close.classList.add("is-active");
    close.type = "button";
    close.dataset.pageId = tab.pageId;
    close.dataset.kind = "close";
    close.setAttribute("aria-label", t("openPages.closeTab", { name: tab.name }));
    close.title = t("openPages.closeTab", { name: tab.name });
    close.innerHTML = icon("close", 12);
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      this.handlers.close(tab.pageId);
    });
    return close;
  }

  /** Places each close control over the right edge of its tab in the track. */
  private positionCloses(): void {
    for (const close of this.closeLayer.querySelectorAll<HTMLElement>(".open-page-close")) {
      const cell = this.list.querySelector<HTMLElement>(
        `.open-page-tab-cell[data-page-id="${close.dataset.pageId}"]`,
      );
      if (!cell) continue;
      close.style.left = `${cell.offsetLeft + cell.offsetWidth - 26}px`;
      close.style.top = `${cell.offsetTop + (cell.offsetHeight - 24) / 2}px`;
    }
  }

  private pointerOver(event: PointerEvent): void {
    const target = event.target as HTMLElement | null;
    const owner = target?.closest<HTMLElement>("[data-page-id]");
    this.setHover(owner?.dataset.pageId ?? null);
  }

  private setHover(pageId: string | null): void {
    if (this.hoveredPageId === pageId) return;
    this.hoveredPageId = pageId;
    for (const close of this.closeLayer.querySelectorAll<HTMLElement>(".open-page-close")) {
      close.classList.toggle("is-hover", close.dataset.pageId === pageId);
    }
  }

  private captureFocus(): FocusKey | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !this.mount.contains(active)) return null;
    if (active.dataset.kind === "overflow") return { kind: "overflow" };
    return { pageId: active.dataset.pageId, kind: active.dataset.kind ?? "" };
  }

  private restoreFocus(focus: FocusKey | null): void {
    if (!focus) return;
    let target: HTMLElement | null = null;
    if (focus.kind === "overflow") target = this.overflow;
    else if (focus.pageId) {
      target = this.mount.querySelector<HTMLElement>(
        `[data-page-id="${focus.pageId}"][data-kind="${focus.kind}"]`,
      );
    }
    if (!target) target = this.list.querySelector<HTMLElement>(".open-page-tab.is-active");
    target?.focus({ preventScroll: true });
  }
}

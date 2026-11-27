import { t } from "../../i18n";
import { el } from "../../ui/dom";

export type PageWindowAction = "previous" | "next" | "jump";

export interface PageWindowControlsOptions {
  start: number;
  end: number;
  total: number;
  /** Display number of the page the window was anchored on, when inside it. */
  current?: number;
  /**
   * True when a status filter narrows the list. The range and the jump field
   * then count matching pages, not display page numbers, so the label and the
   * target never disagree.
   */
  filtered?: boolean;
  onNavigate: (action: PageWindowAction, page?: number) => void;
}

/**
 * Range label, previous/next buttons and a numeric jump field for the Pages
 * window. It is list navigation, not a second page list: no page card is
 * rendered here and no order is stored.
 */
export function pageWindowControls(options: PageWindowControlsOptions): HTMLElement {
  const bar = el("div", "page-window-bar");

  const previous = el("button", "btn btn-small page-window-btn");
  previous.type = "button";
  previous.dataset.pageWindowAction = "previous";
  previous.textContent = t("page.windowPrevious");
  previous.setAttribute("aria-label", t("page.windowPreviousAria"));
  previous.disabled = options.start <= 0;
  previous.addEventListener("click", () => options.onNavigate("previous"));

  const range = el(
    "span",
    "page-window-range",
    t(options.filtered ? "page.windowRangeFiltered" : "page.windowRange", {
      start: options.start + 1,
      end: options.end,
      total: options.total,
    }),
  );

  const jump = el("label", "page-window-jump");
  const input = el("input", "input page-window-input");
  input.type = "number";
  input.min = "1";
  input.max = String(options.total);
  input.step = "1";
  const inWindow =
    options.current !== undefined &&
    options.current >= options.start + 1 &&
    options.current <= options.end;
  const initialPage = inWindow ? options.current! : options.start + 1;
  input.value = String(initialPage);
  input.setAttribute(
    "aria-label",
    t(options.filtered ? "page.windowJumpFilteredAria" : "page.windowJumpAria"),
  );
  input.dataset.pageWindowAction = "jump";
  const go = () => {
    const page = Math.round(Number(input.value));
    if (!Number.isFinite(page)) {
      input.value = String(initialPage);
      return;
    }
    options.onNavigate("jump", page);
  };
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    go();
  });
  input.addEventListener("change", go);
  jump.append(input);

  const next = el("button", "btn btn-small page-window-btn");
  next.type = "button";
  next.dataset.pageWindowAction = "next";
  next.textContent = t("page.windowNext");
  next.setAttribute("aria-label", t("page.windowNextAria"));
  next.disabled = options.end >= options.total;
  next.addEventListener("click", () => options.onNavigate("next"));

  bar.append(previous, range, jump, next);
  return bar;
}

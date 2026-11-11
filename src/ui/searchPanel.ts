import type { SearchHit } from "../search/textIndex";
import { el } from "./dom";
import { icon } from "./icons";
import { t } from "../i18n";

export interface SearchPanelActions {
  onQuery: (query: string) => void;
  onSelect: (hit: SearchHit) => void;
  onOcr: () => void;
  /** OCR stores a rebuildable page index, so view-only keeps it disabled. */
  canRunOcr?: () => boolean;
  onClose: () => void;
}

/**
 * Floating full-text search panel. It stays open while the user navigates
 * between hits, so repeated searches do not require reopening a dialog.
 */
export class SearchPanel {
  readonly element: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly list: HTMLElement;
  private readonly note: HTMLElement;
  private readonly ocrButton: HTMLButtonElement;
  private results: SearchHit[] = [];
  private active = -1;
  private query = "";

  constructor(
    host: HTMLElement,
    private readonly actions: SearchPanelActions,
  ) {
    this.element = el("section", "search-panel");
    this.element.setAttribute("aria-label", t("search.title"));

    const header = el("header", "search-header");
    const heading = el("div", "search-heading");
    heading.append(el("span", "search-kicker", t("search.title")));
    heading.append(el("strong", "search-title", t("search.allPages")));
    const close = el("button", "icon-btn search-close");
    close.type = "button";
    close.title = t("search.close");
    close.setAttribute("aria-label", t("search.close"));
    close.innerHTML = icon("close", 15);
    close.addEventListener("click", () => this.actions.onClose());
    header.append(heading, close);

    const field = el("label", "search-field");
    const fieldIcon = el("span", "search-field-icon");
    fieldIcon.innerHTML = icon("search", 14);
    field.append(fieldIcon);
    this.input = el("input", "search-input") as HTMLInputElement;
    this.input.type = "search";
    this.input.placeholder = t("search.placeholder");
    this.input.setAttribute("aria-label", t("search.aria"));
    this.input.addEventListener("input", () => {
      this.query = this.input.value;
      this.actions.onQuery(this.query);
    });
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.actions.onClose();
        return;
      }
      if (event.key === "Enter" && this.results.length) {
        event.preventDefault();
        const index = this.active >= 0 ? this.active : 0;
        this.actions.onSelect(this.results[index]);
      }
      if (event.key === "ArrowDown" && this.results.length) {
        event.preventDefault();
        this.active = Math.min(this.results.length - 1, this.active + 1);
        this.renderResults();
      }
      if (event.key === "ArrowUp" && this.results.length) {
        event.preventDefault();
        this.active = Math.max(0, this.active - 1);
        this.renderResults();
      }
    });
    field.append(this.input);

    this.status = el("div", "search-status");
    this.status.setAttribute("aria-live", "polite");
    this.list = el("div", "search-results");
    this.note = el("p", "search-note", t("search.note"));

    const footer = el("footer", "search-footer");
    this.ocrButton = el("button", "btn btn-small", t("search.ocrScans"));
    this.ocrButton.type = "button";
    this.ocrButton.innerHTML = `${icon("target", 13)}<span>${t("search.ocrScans")}</span>`;
    const ocrAllowed = this.actions.canRunOcr?.() ?? true;
    this.ocrButton.title = ocrAllowed ? t("search.ocrTitle") : t("viewOnly.ocrDisabled");
    this.ocrButton.disabled = !ocrAllowed;
    this.ocrButton.addEventListener("click", () => this.actions.onOcr());
    footer.append(this.ocrButton);

    this.element.append(header, field, this.status, this.list, this.note, footer);
    host.append(this.element);
    this.focus();
  }

  focus(): void {
    this.input.focus();
    this.input.select();
  }

  get currentQuery(): string {
    return this.query;
  }

  setProgress(done: number, total: number): void {
    this.status.textContent = t("search.indexing", { done, total });
  }

  setStatus(message: string): void {
    this.status.textContent = message;
  }

  setOcrBusy(busy: boolean): void {
    this.ocrButton.disabled = busy;
    this.ocrButton.classList.toggle("is-busy", busy);
    this.ocrButton.innerHTML = busy
      ? `${icon("target", 13)}<span>${t("search.ocrRunning")}</span>`
      : `${icon("target", 13)}<span>${t("search.ocrScans")}</span>`;
  }

  setIndexComplete(total: number): void {
    if (!this.query.trim()) {
      this.status.textContent = t("search.indexed", { count: total });
    }
  }

  setResults(hits: SearchHit[], query: string, indexed: number, total: number): void {
    this.results = hits;
    this.query = query;
    this.active = hits.length ? 0 : -1;
    if (!query.trim()) {
      this.status.textContent = t("search.indexProgress", { indexed, total });
    } else if (!hits.length) {
      this.status.textContent = t("search.noMatches", { count: indexed });
    } else {
      const pages = new Set(hits.map((hit) => hit.page)).size;
      this.status.textContent = t("search.matches", { count: hits.length, pages });
    }
    this.renderResults();
  }

  destroy(): void {
    this.element.remove();
  }

  private renderResults(): void {
    this.list.textContent = "";
    if (!this.results.length) {
      if (this.query.trim()) {
        this.list.append(el("div", "search-empty", t("search.noText")));
      }
      return;
    }
    const fragment = document.createDocumentFragment();
    this.results.forEach((hit, index) => {
      const row = el("button", "search-result");
      row.type = "button";
      if (index === this.active) row.classList.add("is-active");
      const meta = el("span", "search-result-meta", t("search.pageLabel", { page: hit.page }));
      const text = el("span", "search-result-text");
      appendHighlighted(text, hit.snippet, this.query);
      row.append(meta, text);
      row.addEventListener("click", () => {
        this.active = index;
        this.input.blur();
        this.renderResults();
        this.actions.onSelect(hit);
      });
      fragment.append(row);
    });
    this.list.append(fragment);
  }
}

function appendHighlighted(host: HTMLElement, text: string, query: string): void {
  const needle = query.trim();
  if (!needle) {
    host.textContent = text;
    return;
  }
  const lowerText = text.toLocaleLowerCase();
  const lowerNeedle = needle.toLocaleLowerCase();
  let from = 0;
  while (from < text.length) {
    const index = lowerText.indexOf(lowerNeedle, from);
    if (index < 0) {
      host.append(document.createTextNode(text.slice(from)));
      break;
    }
    if (index > from) host.append(document.createTextNode(text.slice(from, index)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(index, index + needle.length);
    host.append(mark);
    from = index + needle.length;
  }
}

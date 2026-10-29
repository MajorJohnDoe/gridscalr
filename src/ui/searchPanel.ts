import type { SearchHit } from "../search/textIndex";
import { el } from "./dom";
import { icon } from "./icons";

export interface SearchPanelActions {
  onQuery: (query: string) => void;
  onSelect: (hit: SearchHit) => void;
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
  private results: SearchHit[] = [];
  private active = -1;
  private query = "";

  constructor(
    host: HTMLElement,
    private readonly actions: SearchPanelActions,
  ) {
    this.element = el("section", "search-panel");
    this.element.setAttribute("aria-label", "Search text");

    const header = el("header", "search-header");
    const heading = el("div", "search-heading");
    heading.append(el("span", "search-kicker", "Search text"));
    heading.append(el("strong", "search-title", "All pages"));
    const close = el("button", "icon-btn search-close");
    close.type = "button";
    close.title = "Close search";
    close.setAttribute("aria-label", "Close search");
    close.innerHTML = icon("close", 15);
    close.addEventListener("click", () => this.actions.onClose());
    header.append(heading, close);

    const field = el("label", "search-field");
    const fieldIcon = el("span", "search-field-icon");
    fieldIcon.innerHTML = icon("search", 14);
    field.append(fieldIcon);
    this.input = el("input", "search-input") as HTMLInputElement;
    this.input.type = "search";
    this.input.placeholder = "Room, equipment tag or sheet number";
    this.input.setAttribute("aria-label", "Search drawing text");
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
    this.note = el(
      "p",
      "search-note",
      "Scanned pages without a text layer are not searchable yet. OCR support is a separate step.",
    );

    this.element.append(header, field, this.status, this.list, this.note);
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
    this.status.textContent = `Indexing ${done} / ${total} page${total === 1 ? "" : "s"}…`;
  }

  setIndexComplete(total: number): void {
    if (!this.query.trim()) {
      this.status.textContent = `${total} page${total === 1 ? "" : "s"} indexed. Type to search.`;
    }
  }

  setResults(hits: SearchHit[], query: string, indexed: number, total: number): void {
    this.results = hits;
    this.query = query;
    this.active = hits.length ? 0 : -1;
    if (!query.trim()) {
      this.status.textContent = `${indexed} of ${total} page${total === 1 ? "" : "s"} indexed. Type to search.`;
    } else if (!hits.length) {
      this.status.textContent = `No matches on ${indexed} indexed page${indexed === 1 ? "" : "s"}.`;
    } else {
      const pages = new Set(hits.map((hit) => hit.page)).size;
      this.status.textContent = `${hits.length} match${hits.length === 1 ? "" : "es"} on ${pages} page${pages === 1 ? "" : "s"}.`;
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
        this.list.append(el("div", "search-empty", "No text matches on the indexed pages."));
      }
      return;
    }
    const fragment = document.createDocumentFragment();
    this.results.forEach((hit, index) => {
      const row = el("button", "search-result");
      row.type = "button";
      if (index === this.active) row.classList.add("is-active");
      const meta = el("span", "search-result-meta", `Page ${hit.page}`);
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

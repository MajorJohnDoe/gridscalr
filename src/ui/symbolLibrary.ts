import {
  SYMBOLS,
  SYMBOL_CATEGORY_COLORS,
  SYMBOL_CATEGORY_LABELS,
  SYMBOL_CATEGORIES,
  symbolCategoryOf,
  symbolSvgMarkup,
  type SymbolDefinition,
} from "../model/symbols";
import { store } from "../state/store";
import { el } from "./dom";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";

const RECENT_KEY = "gridscalr.ui.symbols.recent.v1";
const RECENT_LIMIT = 8;

let searchQuery = "";

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const known = new Set(SYMBOLS.map((symbol) => symbol.id));
    return parsed.filter((id): id is string => typeof id === "string" && known.has(id));
  } catch {
    return [];
  }
}

function rememberRecent(id: string): void {
  const next = [id, ...loadRecent().filter((entry) => entry !== id)].slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Recents are a convenience only.
  }
}

function searchText(symbol: SymbolDefinition): string {
  return [symbol.name, SYMBOL_CATEGORY_LABELS[symbol.category], ...symbol.keywords]
    .join(" ")
    .toLocaleLowerCase();
}

function symbolTile(symbol: SymbolDefinition): HTMLButtonElement {
  const category = symbolCategoryOf(symbol.id);
  const button = el("button", "symbol-tile");
  button.type = "button";
  button.dataset.symbolId = symbol.id;
  button.dataset.search = searchText(symbol);
  const active = store.ui.activeTool === "symbol" && store.ui.symbolId === symbol.id;
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
  button.title = `${symbol.name} · ${SYMBOL_CATEGORY_LABELS[category]}`;
  button.innerHTML = `<span class="symbol-tile-icon">${symbolSvgMarkup(symbol, 27, SYMBOL_CATEGORY_COLORS[category])}</span><span class="symbol-tile-label">${symbol.name}</span>`;
  button.addEventListener("click", () => {
    rememberRecent(symbol.id);
    store.selectSymbol(symbol.id);
  });
  return button;
}

function categorySection(category: SymbolDefinition["category"]): HTMLElement {
  const section = el("section", "symbol-category");
  section.dataset.category = category;
  const head = el("div", "symbol-category-head");
  const dot = el("span", "symbol-category-dot");
  dot.style.background = SYMBOL_CATEGORY_COLORS[category];
  head.append(dot, el("span", "", SYMBOL_CATEGORY_LABELS[category]));
  const grid = el("div", "symbol-grid");
  for (const symbol of SYMBOLS.filter((entry) => entry.category === category)) {
    grid.append(symbolTile(symbol));
  }
  section.append(head, grid);
  return section;
}

export function renderSymbolLibrary(refs: ShellRefs, _actions: PanelActions): void {
  const library = el("div", "symbol-library");
  const head = el("div", "symbol-library-head");
  head.append(el("span", "", "Symbols"));
  head.append(el("span", "symbol-library-count", `${SYMBOLS.length} built-in signs`));
  const searchWrap = el("label", "symbol-search");
  const search = el("input", "input");
  search.type = "search";
  search.placeholder = "Search symbols or Swedish terms…";
  search.setAttribute("aria-label", "Search symbols");
  search.value = searchQuery;
  searchWrap.append(search);
  library.append(head, searchWrap);

  const content = el("div", "symbol-library-content");
  const recent = loadRecent();
  if (recent.length && !searchQuery) {
    const section = el("section", "symbol-category symbol-recent");
    const head = el("div", "symbol-category-head");
    head.append(el("span", "", "Recently used"));
    const grid = el("div", "symbol-grid");
    for (const id of recent) {
      const symbol = SYMBOLS.find((entry) => entry.id === id);
      if (symbol) grid.append(symbolTile(symbol));
    }
    section.append(head, grid);
    content.append(section);
  }

  for (const category of SYMBOL_CATEGORIES) content.append(categorySection(category));
  const empty = el("div", "empty-note small symbol-empty", "No symbols match this search.");
  empty.hidden = true;
  content.append(empty);
  library.append(content);

  const filter = () => {
    const query = search.value.trim().toLocaleLowerCase();
    searchQuery = search.value;
    let visible = 0;
    for (const section of content.querySelectorAll<HTMLElement>(".symbol-category")) {
      let sectionVisible = 0;
      for (const tile of section.querySelectorAll<HTMLElement>(".symbol-tile")) {
        const match = !query || (tile.dataset.search ?? "").includes(query);
        tile.hidden = !match;
        if (match) {
          visible += 1;
          sectionVisible += 1;
        }
      }
      section.hidden = sectionVisible === 0;
    }
    empty.hidden = visible !== 0;
  };
  search.addEventListener("input", filter);
  if (searchQuery) filter();

  refs.dockBody.append(library);
  refs.dockFooter.append(
    el("span", "symbol-library-hint", "Choose a symbol, then click the drawing to place it."),
  );
}

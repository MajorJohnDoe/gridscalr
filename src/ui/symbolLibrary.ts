import {
  SCHEMATIC_CATEGORIES,
  SCHEMATIC_SYMBOL_COUNT,
  SIGN_CATEGORIES,
  SIGN_SYMBOL_COUNT,
  SYMBOLS,
  SYMBOL_CATEGORY_COLORS,
  symbolCategoryLabel,
  symbolCategoryOf,
  symbolName,
  symbolSearchText,
  symbolSvgMarkup,
  symbolsForSet,
  type SymbolDefinition,
} from "../features/schematics/symbols/registry";
import { store } from "../state/store";
import { el } from "./dom";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";
import { t } from "../i18n";
import type { SymbolSet } from "../model/types";

const RECENT_KEY = "gridscalr.ui.symbols.recent.v1";
const RECENT_LIMIT = 8;

let searchQuery = "";
let activeSet: SymbolSet = "sign";

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

function symbolTile(symbol: SymbolDefinition): HTMLButtonElement {
  const category = symbolCategoryOf(symbol.id);
  const button = el("button", "symbol-tile");
  button.type = "button";
  button.dataset.symbolId = symbol.id;
  button.dataset.search = symbolSearchText(symbol);
  const active = store.ui.activeTool === "symbol" && store.ui.symbolId === symbol.id;
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
  button.title = `${symbolName(symbol.id)} · ${symbolCategoryLabel(category)}`;
  const previewColor = symbol.set === "schematic" ? "#e8eef1" : SYMBOL_CATEGORY_COLORS[category];
  button.innerHTML = `<span class="symbol-tile-icon">${symbolSvgMarkup(symbol, 27, previewColor)}</span><span class="symbol-tile-label">${symbolName(symbol.id)}</span>`;
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
  head.append(dot, el("span", "", symbolCategoryLabel(category)));
  const grid = el("div", "symbol-grid");
  for (const symbol of symbolsForSet(activeSet).filter((entry) => entry.category === category)) {
    grid.append(symbolTile(symbol));
  }
  section.append(head, grid);
  return section;
}

export function renderSymbolLibrary(refs: ShellRefs, _actions: PanelActions): void {
  const library = el("div", "symbol-library");
  const head = el("div", "symbol-library-head");
  head.append(el("span", "", t("symbols.title")));
  const count = el("span", "symbol-library-count");
  head.append(count);

  const tabs = el("div", "symbol-set-tabs");
  tabs.setAttribute("role", "tablist");
  const tabButtons: Array<{ set: SymbolSet; button: HTMLButtonElement }> = [];
  for (const set of ["sign", "schematic"] as const) {
    const button = el(
      "button",
      "symbol-set-tab",
      set === "sign" ? t("symbols.setSigns") : t("symbols.setSchematic"),
    );
    button.type = "button";
    button.dataset.set = set;
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => {
      activeSet = set;
      syncTabs();
      renderContent();
    });
    tabs.append(button);
    tabButtons.push({ set, button });
  }
  const syncTabs = () => {
    for (const entry of tabButtons) {
      const active = entry.set === activeSet;
      entry.button.classList.toggle("is-active", active);
      entry.button.setAttribute("aria-selected", String(active));
    }
    count.textContent = t(activeSet === "sign" ? "symbols.countSigns" : "symbols.countSchematic", {
      count: activeSet === "sign" ? SIGN_SYMBOL_COUNT : SCHEMATIC_SYMBOL_COUNT,
    });
  };

  const searchWrap = el("label", "symbol-search");
  const search = el("input", "input");
  search.type = "search";
  search.placeholder = t("symbols.searchPlaceholder");
  search.setAttribute("aria-label", t("symbols.searchAria"));
  search.value = searchQuery;
  searchWrap.append(search);
  library.append(head, tabs, searchWrap);

  const content = el("div", "symbol-library-content");
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
    const empty = content.querySelector<HTMLElement>(".symbol-empty");
    if (empty) empty.hidden = visible !== 0;
  };

  const renderContent = () => {
    content.replaceChildren();
    const recent = loadRecent().filter((id) => {
      const symbol = SYMBOLS.find((entry) => entry.id === id);
      return symbol && (symbol.set === "schematic") === (activeSet === "schematic");
    });
    if (recent.length && !searchQuery) {
      const section = el("section", "symbol-category symbol-recent");
      const recentHead = el("div", "symbol-category-head");
      recentHead.append(el("span", "", t("symbols.recent")));
      const grid = el("div", "symbol-grid");
      for (const id of recent) {
        const symbol = SYMBOLS.find((entry) => entry.id === id);
        if (symbol) grid.append(symbolTile(symbol));
      }
      section.append(recentHead, grid);
      content.append(section);
    }

    const categories = activeSet === "schematic" ? SCHEMATIC_CATEGORIES : SIGN_CATEGORIES;
    for (const category of categories) content.append(categorySection(category));
    const empty = el("div", "empty-note small symbol-empty", t("symbols.empty"));
    empty.hidden = true;
    content.append(empty);
    filter();
  };

  search.addEventListener("input", filter);
  syncTabs();
  renderContent();

  refs.dockBody.append(library);
  refs.dockFooter.append(el("span", "symbol-library-hint", t("symbols.hint")));
}

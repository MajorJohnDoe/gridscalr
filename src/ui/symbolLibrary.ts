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
import { store, type ToolId } from "../state/store";
import { el } from "./dom";
import { icon } from "./icons";
import type { PanelActions } from "./panels";
import type { ShellRefs } from "./shell";
import { t, type MessageKey } from "../i18n";
import type { SymbolSet } from "../model/types";

const RECENT_KEY = "gridscalr.ui.symbols.recent.v1";
const RECENT_LIMIT = 8;

type LibrarySet = SymbolSet | "special";

interface SpecialEntry {
  id: string;
  tool: ToolId;
  labelKey: MessageKey;
  hintKey: MessageKey;
  icon: string;
  search: string;
}

/**
 * Operation-card tools that are not symbols but belong in the library's
 * Special tab. Each entry arms an existing tool; the item itself keeps its own
 * kind, data and editor.
 */
const SPECIAL_ENTRIES: SpecialEntry[] = [
  {
    id: "rail",
    tool: "rail",
    labelKey: "tool.rail",
    hintKey: "tool.rail.hint",
    icon: "rail",
    search: "i/o rail skena driftkort",
  },
];

let searchQuery = "";
let activeSet: LibrarySet = "sign";

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
  const previewColor =
    symbol.set === "schematic" ? "currentColor" : SYMBOL_CATEGORY_COLORS[category];
  button.innerHTML = `<span class="symbol-tile-icon">${symbolSvgMarkup(symbol, 33, previewColor)}</span><span class="symbol-tile-label">${symbolName(symbol.id)}</span>`;
  button.addEventListener("click", () => {
    rememberRecent(symbol.id);
    store.selectSymbol(symbol.id);
  });
  return button;
}

function categorySection(category: SymbolDefinition["category"], set: SymbolSet): HTMLElement {
  const section = el("section", "symbol-category");
  section.dataset.category = category;
  const head = el("div", "symbol-category-head");
  const dot = el("span", "symbol-category-dot");
  dot.style.background = SYMBOL_CATEGORY_COLORS[category];
  head.append(dot, el("span", "", symbolCategoryLabel(category)));
  const grid = el("div", "symbol-grid");
  for (const symbol of symbolsForSet(set).filter((entry) => entry.category === category)) {
    grid.append(symbolTile(symbol));
  }
  section.append(head, grid);
  return section;
}

function specialTile(entry: SpecialEntry): HTMLButtonElement {
  const button = el("button", "symbol-tile");
  button.type = "button";
  button.dataset.symbolId = `special.${entry.id}`;
  button.dataset.search = entry.search;
  const active = store.ui.activeTool === entry.tool;
  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));
  button.title = `${t(entry.labelKey)} · ${t(entry.hintKey)}`;
  button.innerHTML = `<span class="symbol-tile-icon">${icon(entry.icon, 33)}</span><span class="symbol-tile-label">${t(entry.labelKey)}</span>`;
  button.addEventListener("click", () => store.setTool(entry.tool));
  return button;
}

export function renderSymbolLibrary(refs: ShellRefs, _actions: PanelActions): void {
  const library = el("div", "symbol-library");
  const head = el("div", "symbol-library-head");
  head.append(el("span", "", t("symbols.title")));
  const count = el("span", "symbol-library-count");
  head.append(count);

  const tabs = el("div", "symbol-set-tabs");
  tabs.setAttribute("role", "tablist");
  const hint = el("span", "symbol-library-hint", t("symbols.hint"));
  const tabButtons: Array<{ set: LibrarySet; button: HTMLButtonElement }> = [];
  const setLabel = (set: LibrarySet) =>
    set === "sign"
      ? t("symbols.setSigns")
      : set === "schematic"
        ? t("symbols.setSchematic")
        : t("symbols.setSpecial");
  for (const set of ["sign", "schematic", "special"] as const) {
    const button = el("button", "symbol-set-tab", setLabel(set));
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
    count.textContent =
      activeSet === "sign"
        ? t("symbols.countSigns", { count: SIGN_SYMBOL_COUNT })
        : activeSet === "schematic"
          ? t("symbols.countSchematic", { count: SCHEMATIC_SYMBOL_COUNT })
          : t("symbols.countSpecial");
    hint.textContent = t(activeSet === "special" ? "symbols.hintSpecial" : "symbols.hint");
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
    if (activeSet === "special") {
      const section = el("section", "symbol-category");
      const specialHead = el("div", "symbol-category-head");
      specialHead.append(el("span", "", t("symbols.setSpecial")));
      const grid = el("div", "symbol-grid");
      for (const entry of SPECIAL_ENTRIES) grid.append(specialTile(entry));
      section.append(specialHead, grid);
      content.append(section);
      const empty = el("div", "empty-note small symbol-empty", t("symbols.emptySpecial"));
      empty.hidden = true;
      content.append(empty);
      filter();
      return;
    }
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
    for (const category of categories) content.append(categorySection(category, activeSet));
    const empty = el("div", "empty-note small symbol-empty", t("symbols.empty"));
    empty.hidden = true;
    content.append(empty);
    filter();
  };

  search.addEventListener("input", filter);
  syncTabs();
  renderContent();

  refs.dockBody.append(library);
  refs.dockFooter.append(hint);
}

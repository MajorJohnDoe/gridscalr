import {
  ALL_SYMBOLS as CATALOG_SYMBOLS,
  ALL_SYMBOL_CATEGORIES,
  SCHEMATIC_SYMBOLS,
  SYMBOLS as SIGN_SYMBOLS,
  symbolCategoryLabel,
  symbolFor,
  symbolRenderPlan as baseSymbolRenderPlan,
  symbolSearchText as baseSymbolSearchText,
  symbolSvgMarkup as baseSymbolSvgMarkup,
  type SymbolDefinition,
  type SymbolRenderPlan,
  type SymbolStyle,
} from "../../../model/symbols";
import type { SymbolCategory } from "../../../model/types";
import { t, type MessageKey } from "../../../i18n";

/**
 * The live catalogue, lookup, set helpers and render plan live in
 * `src/model/symbols` so model code can resolve a symbol without importing
 * this feature. This module is the schematics feature's public surface: it
 * re-exports the catalogue and keeps the localized labels and search text.
 */
export * from "../../../model/symbols";
export { SIGN_SYMBOLS, SCHEMATIC_SYMBOLS };

/** Every built-in sign and schematic symbol, in library order. */
export const SYMBOLS: SymbolDefinition[] = CATALOG_SYMBOLS;
export const ALL_SYMBOLS = CATALOG_SYMBOLS;

export function symbolName(id: string | undefined): string {
  const symbol = symbolFor(id);
  return symbol.id === "unknown" ? t("symbol.unknown") : t(`symbol.${symbol.id}` as MessageKey);
}

export function symbolCategoryLabelOf(category: SymbolCategory | undefined): string {
  return category && ALL_SYMBOL_CATEGORIES.includes(category)
    ? symbolCategoryLabel(category)
    : symbolCategoryLabel(undefined);
}

export function symbolDefaultSize(id: string | undefined): number | undefined {
  return symbolFor(id).defaultSize;
}

export function symbolTagPrefix(id: string | undefined): string | undefined {
  return symbolFor(id).tagPrefix;
}

export function symbolStyleOf(id: string | undefined): SymbolStyle | undefined {
  return symbolFor(id).style;
}

export function symbolRenderPlan(
  symbol: SymbolDefinition,
  accent: string,
  style: SymbolStyle = symbol.style ?? "sign",
): SymbolRenderPlan {
  return baseSymbolRenderPlan(symbol, accent, style);
}

export function symbolSvgMarkup(
  symbol: SymbolDefinition,
  size = 24,
  color = "currentColor",
  style: SymbolStyle = symbol.style ?? "sign",
): string {
  return baseSymbolSvgMarkup(symbol, size, color, style);
}

export function symbolSearchText(symbol: SymbolDefinition): string {
  return [
    baseSymbolSearchText(symbol),
    symbol.set === "schematic" ? "schematic driftkort schema" : "sign skylt",
    symbol.tagPrefix ?? "",
  ]
    .join(" ")
    .toLocaleLowerCase();
}

import {
  ALL_SYMBOL_CATEGORIES,
  SYMBOLS as SIGN_SYMBOLS,
  symbolCategoryLabel,
  symbolFor as signSymbolFor,
  symbolName as signSymbolName,
  symbolRenderPlan as baseSymbolRenderPlan,
  symbolSvgMarkup as baseSymbolSvgMarkup,
  symbolSearchText as baseSymbolSearchText,
  type SymbolDefinition,
  type SymbolRenderPlan,
  type SymbolStyle,
} from "../../../model/symbols";
import type { SymbolCategory, SymbolSet } from "../../../model/types";
import { t, type MessageKey } from "../../../i18n";
import { SCHEMATIC_SYMBOLS } from "./library";

export * from "../../../model/symbols";
export { SIGN_SYMBOLS };

/** Every built-in sign and schematic symbol, in library order. */
export { SCHEMATIC_SYMBOLS };

export const SYMBOLS: SymbolDefinition[] = [...SIGN_SYMBOLS, ...SCHEMATIC_SYMBOLS];
export const ALL_SYMBOLS = SYMBOLS;

const SYMBOL_MAP = new Map(SYMBOLS.map((symbol) => [symbol.id, symbol]));

export const SIGN_SYMBOL_COUNT = SIGN_SYMBOLS.length;
export const SCHEMATIC_SYMBOL_COUNT = SCHEMATIC_SYMBOLS.length;

export function symbolsForSet(set: SymbolSet): SymbolDefinition[] {
  return set === "schematic" ? SCHEMATIC_SYMBOLS : SIGN_SYMBOLS;
}

export function symbolSetOf(id: string | undefined): SymbolSet {
  const symbol = id ? SYMBOL_MAP.get(id) : undefined;
  return symbol?.set === "schematic" ? "schematic" : "sign";
}

/** True when the id belongs to the stroke-only schematic set. */
export function isSchematicSymbol(id: string | undefined): boolean {
  return symbolSetOf(id) === "schematic" && Boolean(id && SYMBOL_MAP.has(id));
}

export function symbolFor(id: string | undefined): SymbolDefinition {
  const known = id ? SYMBOL_MAP.get(id) : undefined;
  if (known) return known;
  return signSymbolFor(id);
}

export function hasSymbol(id: string | undefined): boolean {
  return Boolean(id && SYMBOL_MAP.has(id));
}

export function symbolName(id: string | undefined): string {
  const symbol = symbolFor(id);
  return symbol.id === "unknown" ? signSymbolName(id) : t(`symbol.${symbol.id}` as MessageKey);
}

export function symbolCategoryOf(id: string | undefined): SymbolCategory {
  return symbolFor(id).category;
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

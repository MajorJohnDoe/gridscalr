import type { SymbolSet } from "../types";
import { SCHEMATIC_SYMBOLS } from "./schematic";
import { SYMBOLS as SIGN_SYMBOLS } from "./signCatalog";
import type { SymbolDefinition } from "./types";

/**
 * The complete built-in catalogue: facility signs followed by the stroke-only
 * schematic library, in library order. Pure data and lookup, so model code can
 * resolve any symbol without reaching into a feature module.
 */
export const ALL_SYMBOLS: SymbolDefinition[] = [...SIGN_SYMBOLS, ...SCHEMATIC_SYMBOLS];

export const SIGN_SYMBOL_COUNT = SIGN_SYMBOLS.length;
export const SCHEMATIC_SYMBOL_COUNT = SCHEMATIC_SYMBOLS.length;

const SYMBOL_MAP = new Map(ALL_SYMBOLS.map((symbol) => [symbol.id, symbol]));

/** The definition for an id, or undefined when the catalogue has no such symbol. */
export function symbolById(id: string | undefined): SymbolDefinition | undefined {
  return id ? SYMBOL_MAP.get(id) : undefined;
}

export function symbolsForSet(set: SymbolSet): SymbolDefinition[] {
  return set === "schematic" ? SCHEMATIC_SYMBOLS : SIGN_SYMBOLS;
}

export function symbolSetOf(id: string | undefined): SymbolSet {
  return symbolById(id)?.set === "schematic" ? "schematic" : "sign";
}

/** True when the id belongs to the stroke-only schematic set. */
export function isSchematicSymbol(id: string | undefined): boolean {
  return symbolSetOf(id) === "schematic" && Boolean(symbolById(id));
}

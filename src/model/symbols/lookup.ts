import { t, translate, type MessageKey } from "../../i18n";
import type { InspectionStatus, SymbolCategory } from "../types";
import { roundedRectPathData } from "../symbolPaths";
import {
  INSPECTION_STATUSES,
  INSPECTION_STATUS_COLORS,
  SYMBOL_CATEGORY_COLORS,
  SYMBOL_CATEGORY_LABELS,
} from "./categories";
import { SYMBOLS } from "./signCatalog";
import { centerArt } from "./signArt";
import { filled, stroked, SIGN_BADGE } from "./signArtHelpers";
import type { SymbolDefinition } from "./types";

const SYMBOL_MAP = new Map(SYMBOLS.map((symbol) => [symbol.id, symbol]));

export const UNKNOWN_SYMBOL: SymbolDefinition = {
  id: "unknown",
  name: translate("en", "symbol.unknown"),
  category: "building",
  keywords: ["unknown", "missing"],
  art: centerArt({
    shapes: [
      filled(
        [roundedRectPathData(8, 8, 48, 48, 7), roundedRectPathData(15, 15, 34, 34, 4)].join(" "),
        "evenodd",
      ),
      stroked("M 23 23 L 41 41", 6),
      stroked("M 41 23 L 23 41", 6),
    ],
    badge: SIGN_BADGE,
  }),
};

export function symbolFor(id: string | undefined): SymbolDefinition {
  return (id ? SYMBOL_MAP.get(id) : undefined) ?? UNKNOWN_SYMBOL;
}

export function hasSymbol(id: string | undefined): boolean {
  return Boolean(id && SYMBOL_MAP.has(id));
}

export function symbolName(id: string | undefined): string {
  const symbol = symbolFor(id);
  return t(`symbol.${symbol.id}` as MessageKey);
}

export function symbolCategoryOf(id: string | undefined): SymbolCategory {
  return symbolFor(id).category;
}

export function symbolCategoryLabel(category: SymbolCategory | undefined): string {
  return category ? t(`symbolCategory.${category}` as MessageKey) : t("symbolCategory.none");
}

/**
 * Search text for the library. English names stay in the index, and the
 * keyword list carries the Swedish display names, so both languages match
 * regardless of the active UI language.
 */
export function symbolSearchText(symbol: SymbolDefinition): string {
  return [
    symbol.name,
    symbolName(symbol.id),
    SYMBOL_CATEGORY_LABELS[symbol.category],
    symbolCategoryLabel(symbol.category),
    ...symbol.keywords,
  ]
    .join(" ")
    .toLocaleLowerCase();
}

export function symbolCategoryColor(category: SymbolCategory | undefined): string {
  return category ? SYMBOL_CATEGORY_COLORS[category] : "#9aa8ae";
}

export function inspectionStatusLabel(status: InspectionStatus | undefined): string {
  return status ? t(`inspectionStatus.${status}` as MessageKey) : t("inspectionStatus.notAssessed");
}

export function inspectionStatusColor(status: InspectionStatus | undefined): string {
  return status ? INSPECTION_STATUS_COLORS[status] : "#9aa8ae";
}

export function isInspectionStatus(value: unknown): value is InspectionStatus {
  return typeof value === "string" && INSPECTION_STATUSES.includes(value as InspectionStatus);
}

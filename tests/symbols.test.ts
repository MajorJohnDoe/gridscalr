import { describe, expect, it } from "vitest";
import {
  DEFAULT_SYMBOL_ID,
  INSPECTION_STATUSES,
  INSPECTION_STATUS_LABELS,
  SYMBOLS,
  SYMBOL_CATEGORIES,
  SYMBOL_CATEGORY_COLORS,
  SYMBOL_CATEGORY_LABELS,
  hasSymbol,
  inspectionStatusColor,
  inspectionStatusLabel,
  symbolCategoryColor,
  symbolCategoryLabel,
  symbolCategoryOf,
  symbolFor,
  symbolName,
  symbolSvgMarkup,
} from "../src/model/symbols";

describe("symbol library", () => {
  it("has unique stable ids, names, categories and vector geometry", () => {
    expect(new Set(SYMBOLS.map((symbol) => symbol.id)).size).toBe(SYMBOLS.length);
    expect(new Set(SYMBOLS.map((symbol) => symbol.name)).size).toBe(SYMBOLS.length);
    expect(SYMBOLS.length).toBeGreaterThanOrEqual(50);
    for (const symbol of SYMBOLS) {
      expect(SYMBOL_CATEGORIES).toContain(symbol.category);
      expect(symbol.keywords.length).toBeGreaterThan(0);
      expect(symbol.paths.length + symbol.circles.length).toBeGreaterThan(0);
      expect(symbolSvgMarkup(symbol)).toContain("<svg");
    }
  });

  it("covers all Swedish facility categories and common keyword searches", () => {
    expect(Object.keys(SYMBOL_CATEGORY_LABELS).sort()).toEqual([...SYMBOL_CATEGORIES].sort());
    for (const category of SYMBOL_CATEGORIES) {
      expect(SYMBOLS.some((symbol) => symbol.category === category)).toBe(true);
      expect(SYMBOL_CATEGORY_COLORS[category]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(SYMBOLS.some((symbol) => symbol.keywords.includes("brandsläckare"))).toBe(true);
    expect(SYMBOLS.some((symbol) => symbol.keywords.includes("tilluftsdon"))).toBe(true);
    expect(SYMBOLS.some((symbol) => symbol.keywords.includes("hjärtstartare"))).toBe(true);
  });

  it("resolves known symbols and provides a safe unknown fallback", () => {
    expect(hasSymbol(DEFAULT_SYMBOL_ID)).toBe(true);
    expect(symbolName(DEFAULT_SYMBOL_ID)).toBe("Fire extinguisher");
    expect(symbolCategoryOf(DEFAULT_SYMBOL_ID)).toBe("fire");
    expect(symbolCategoryLabel("hvac")).toBe("HVAC & plumbing");
    expect(symbolCategoryColor("hvac")).toBe("#4cc9f0");

    const unknown = symbolFor("removed.symbol");
    expect(unknown.id).toBe("unknown");
    expect(symbolName("removed.symbol")).toBe("Unknown symbol");
    expect(symbolSvgMarkup(unknown)).toContain("<svg");
  });

  it("labels all inspection statuses", () => {
    expect(INSPECTION_STATUSES).toHaveLength(4);
    for (const status of INSPECTION_STATUSES) {
      expect(inspectionStatusLabel(status)).toBe(INSPECTION_STATUS_LABELS[status]);
      expect(inspectionStatusColor(status)).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(inspectionStatusLabel(undefined)).toBe("Not assessed");
  });
});

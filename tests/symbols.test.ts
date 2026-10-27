import { describe, expect, it } from "vitest";
import {
  DEFAULT_SYMBOL_ID,
  INSPECTION_STATUSES,
  INSPECTION_STATUS_LABELS,
  SYMBOLS,
  SYMBOL_CATEGORIES,
  SYMBOL_CATEGORY_COLORS,
  SYMBOL_CATEGORY_LABELS,
  SYMBOL_MAX_SIZE,
  SYMBOL_MIN_SIZE,
  SYMBOL_SIZE,
  SYMBOL_STYLE,
  SYMBOL_VIEWBOX,
  clampSymbolSize,
  hasSymbol,
  inspectionStatusColor,
  inspectionStatusLabel,
  symbolCategoryColor,
  symbolCategoryLabel,
  symbolCategoryOf,
  symbolFor,
  symbolName,
  symbolSizeOf,
  symbolArtBounds,
  symbolRenderPlan,
  symbolSvgMarkup,
} from "../src/model/symbols";
import { parseSymbolPath } from "../src/model/symbolPaths";

const STABLE_SYMBOL_IDS = [
  "fire.extinguisher",
  "fire.hose",
  "fire.blanket",
  "fire.call-point",
  "fire.smoke-detector",
  "fire.heat-detector",
  "fire.door",
  "fire.smoke-vent",
  "egress.exit",
  "egress.assembly",
  "egress.aed",
  "egress.first-aid",
  "hvac.supply",
  "hvac.extract",
  "hvac.transfer",
  "hvac.ahu",
  "hvac.valve",
  "hvac.radiator",
  "hvac.convector",
  "hvac.cooling",
  "hvac.pump",
  "hvac.heat-exchanger",
  "hvac.water-meter",
  "hvac.energy-meter",
  "hvac.expansion-vessel",
  "hvac.floor-drain",
  "hvac.oil-separator",
  "electrical.main-panel",
  "electrical.fuse-cabinet",
  "electrical.outlet-230",
  "electrical.outlet-400",
  "electrical.data-outlet",
  "electrical.light",
  "electrical.emergency-light",
  "electrical.access",
  "electrical.cctv",
  "electrical.temperature",
  "electrical.co2",
  "electrical.humidity",
  "electrical.wifi",
  "building.window",
  "building.door",
  "building.damage",
  "building.elevator",
  "building.stair-lift",
  "building.dock",
  "waste.recycling",
  "waste.bins",
  "waste.hazardous",
  "waste.battery",
  "waste.chemical",
  "waste.grease",
];

describe("symbol library", () => {
  it("has unique stable ids, names, categories and vector geometry", () => {
    expect(new Set(SYMBOLS.map((symbol) => symbol.id)).size).toBe(SYMBOLS.length);
    expect(new Set(SYMBOLS.map((symbol) => symbol.name)).size).toBe(SYMBOLS.length);
    expect(SYMBOLS).toHaveLength(52);
    for (const symbol of SYMBOLS) {
      expect(SYMBOL_CATEGORIES).toContain(symbol.category);
      expect(symbol.keywords.length).toBeGreaterThan(0);
      expect(symbol.art.shapes.length).toBeGreaterThan(0);
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
    expect(symbolCategoryColor("hvac")).toBe("#005eb8");

    const unknown = symbolFor("removed.symbol");
    expect(unknown.id).toBe("unknown");
    expect(symbolName("removed.symbol")).toBe("Unknown symbol");
    expect(symbolSvgMarkup(unknown)).toContain("<svg");
  });

  it("gives every built-in symbol filled, hole-aware artwork", () => {
    expect(SYMBOLS.map((symbol) => symbol.id)).toEqual(STABLE_SYMBOL_IDS);
    expect(SYMBOLS.every((symbol) => Boolean(symbol.art))).toBe(true);
    for (const id of STABLE_SYMBOL_IDS) {
      const symbol = symbolFor(id);
      expect(symbol.id).toBe(id);
      expect(symbol.art).toBeTruthy();
      expect(symbol.art!.shapes.length).toBeGreaterThan(0);
      for (const shape of symbol.art!.shapes) {
        expect(() => parseSymbolPath(shape.d)).not.toThrow();
      }
      const markup = symbolSvgMarkup(symbol, 64, "#e04a4f");
      expect(markup).toContain(`viewBox="0 0 ${SYMBOL_VIEWBOX} ${SYMBOL_VIEWBOX}"`);
    }
    const aed = symbolFor("egress.aed");
    expect(aed.art!.shapes.some((shape) => shape.fillRule === "evenodd")).toBe(true);
    expect(symbolSvgMarkup(aed, 64, "#009b48")).toContain('fill-rule="evenodd"');
    expect(SYMBOL_SIZE).toBeGreaterThanOrEqual(20);
  });

  it("defaults and clamps the plate size of a symbol item", () => {
    expect(symbolSizeOf({})).toBe(SYMBOL_SIZE);
    expect(symbolSizeOf({ symbolSize: Number.NaN })).toBe(SYMBOL_SIZE);
    expect(symbolSizeOf({ symbolSize: 36 })).toBe(36);
    expect(clampSymbolSize(1)).toBe(SYMBOL_MIN_SIZE);
    expect(clampSymbolSize(5000)).toBe(SYMBOL_MAX_SIZE);
  });

  it("centres every built-in pictogram on the sign plate", () => {
    for (const id of STABLE_SYMBOL_IDS) {
      const bounds = symbolArtBounds(symbolFor(id).art!);
      expect((bounds.minX + bounds.maxX) / 2).toBeCloseTo(32, 1);
      expect((bounds.minY + bounds.maxY) / 2).toBeCloseTo(32, 1);
    }
  });

  it("builds a classic sign plan and a transparent glyph plan from the same geometry", () => {
    const symbol = symbolFor("egress.aed");
    const glyph = symbolRenderPlan(symbol, "#009b48", "glyph");
    const sign = symbolRenderPlan(symbol, "#009b48", "sign");
    expect(glyph.shapes).toHaveLength(symbol.art!.shapes.length);
    expect(
      glyph.shapes.every((shape) => shape.fill === "#009b48" || shape.stroke === "#009b48"),
    ).toBe(true);
    expect(sign.shapes).toHaveLength(symbol.art!.shapes.length + 1);
    expect(sign.shapes[0].fill).toBe(SYMBOL_CATEGORY_COLORS.egress);
    expect(sign.shapes[1].fill).toBe("#ffffff");
    expect(sign.badge.r).toBeGreaterThan(4);
  });

  it("wraps pilot symbols in a classic sign plate with a white glyph", () => {
    expect(SYMBOL_STYLE).toBe("sign");
    const exit = symbolFor("egress.exit");
    const plan = symbolRenderPlan(exit, SYMBOL_CATEGORY_COLORS.egress, "sign");
    expect(plan.shapes[0].fill).toBe(SYMBOL_CATEGORY_COLORS.egress);
    expect(plan.shapes[0].fillRule).toBe("nonzero");
    expect(
      plan.shapes.slice(1).every((shape) => shape.fill === "#ffffff" || shape.stroke === "#ffffff"),
    ).toBe(true);
    const lightSymbol = symbolFor("electrical.emergency-light");
    expect(lightSymbol.category).toBe("egress");
    const light = symbolRenderPlan(
      lightSymbol,
      SYMBOL_CATEGORY_COLORS[lightSymbol.category],
      "sign",
    );
    expect(light.shapes[0].fill).toBe(SYMBOL_CATEGORY_COLORS.egress);
    expect(symbolSvgMarkup(exit, 27, SYMBOL_CATEGORY_COLORS.egress)).toContain(
      `fill="${SYMBOL_CATEGORY_COLORS.egress}"`,
    );
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

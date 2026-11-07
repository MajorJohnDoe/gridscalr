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
  symbolSearchText,
  symbolSizeOf,
  symbolArtBounds,
  symbolRenderPlan,
  symbolShapeStrokeWidth,
  symbolSvgMarkup,
} from "../src/model/symbols";
import { parseSymbolPath } from "../src/model/symbolPaths";
import {
  ALL_SYMBOLS,
  ALL_SYMBOL_CATEGORIES,
  SCHEMATIC_CATEGORIES,
  SCHEMATIC_SYMBOLS,
  SCHEMATIC_STROKE_WIDTH,
  SYMBOL_CATEGORY_COLORS as ALL_CATEGORY_COLORS,
  symbolDefaultSize,
  symbolFor as symbolForAll,
  symbolSetOf,
  symbolTagPrefix,
  symbolsForSet,
} from "../src/features/schematics/symbols/registry";
import sv from "../src/i18n/locales/sv.json";

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
    expect(Object.keys(SYMBOL_CATEGORY_LABELS).sort()).toEqual([...ALL_SYMBOL_CATEGORIES].sort());
    for (const category of SYMBOL_CATEGORIES) {
      expect(SYMBOLS.some((symbol) => symbol.category === category)).toBe(true);
      expect(SYMBOL_CATEGORY_COLORS[category]).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(SYMBOLS.some((symbol) => symbol.keywords.includes("brandsläckare"))).toBe(true);
    expect(SYMBOLS.some((symbol) => symbol.keywords.includes("tilluftsdon"))).toBe(true);
    expect(SYMBOLS.some((symbol) => symbol.keywords.includes("hjärtstartare"))).toBe(true);
  });

  it("indexes both English and Swedish names regardless of the active language", () => {
    const swedish = sv as Record<string, string>;
    for (const symbol of SYMBOLS) {
      const search = symbolSearchText(symbol);
      const swedishName = swedish[`symbol.${symbol.id}`];
      expect(swedishName, symbol.id).toBeTruthy();
      expect(search, symbol.id).toContain(symbol.name.toLowerCase());
      expect(search, symbol.id).toContain(swedishName.toLowerCase());
    }
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

describe("schematic symbol set", () => {
  it("keeps the facility signs unchanged and adds the schematic set", () => {
    expect(SYMBOLS).toHaveLength(52);
    expect(SCHEMATIC_SYMBOLS).toHaveLength(153);
    expect(ALL_SYMBOLS).toHaveLength(205);
    expect(symbolsForSet("sign")).toHaveLength(52);
    expect(symbolsForSet("schematic")).toHaveLength(153);
    expect(ALL_SYMBOLS.map((symbol) => symbol.id)).toEqual([
      ...SYMBOLS.map((symbol) => symbol.id),
      ...SCHEMATIC_SYMBOLS.map((symbol) => symbol.id),
    ]);
  });

  it("gives every schematic symbol metadata, ports and fixed-width artwork", () => {
    for (const symbol of SCHEMATIC_SYMBOLS) {
      expect(symbol.set).toBe("schematic");
      expect(symbol.style).toBe("schematic");
      expect(symbol.tagPrefix, symbol.id).toBeTruthy();
      expect(symbol.defaultSize, symbol.id).toBeGreaterThan(0);
      expect(SCHEMATIC_CATEGORIES).toContain(symbol.category);
      if (symbol.id === "schematic.district-energy-meter-panel") {
        expect(symbol.ports ?? [], symbol.id).toHaveLength(0);
      } else {
        expect(symbol.ports?.length, symbol.id).toBeGreaterThan(0);
      }
      for (const port of symbol.ports ?? []) {
        expect(port.x).toBeGreaterThanOrEqual(0);
        expect(port.x).toBeLessThanOrEqual(SYMBOL_VIEWBOX);
        expect(port.y).toBeGreaterThanOrEqual(0);
        expect(port.y).toBeLessThanOrEqual(SYMBOL_VIEWBOX);
      }
      expect(symbol.art.shapes.length).toBeGreaterThan(0);
      for (const shape of symbol.art.shapes) {
        // Every symbol path must stay inside the parser subset, because bounds,
        // hit testing and PDF export all read it. Arcs are not supported.
        expect(() => parseSymbolPath(shape.d), symbol.id).not.toThrow();
      }
      expect(
        symbol.art.shapes.every((shape) => shape.stroke === true || shape.fillRule === undefined),
      ).toBe(true);
      const plan = symbolRenderPlan(symbol, "#111111");
      expect(plan.fixedStrokeWidth).toBe(symbol.fixedStrokeWidth ?? SCHEMATIC_STROKE_WIDTH);
      expect(plan.shapes.every((shape) => shape.fill === null || shape.fill === "#111111")).toBe(
        true,
      );
      const preview = symbolRenderPlan(symbol, "#e8eef1");
      expect(
        preview.shapes.every(
          (shape) => shape.fill === null || shape.fill === "#111111" || shape.fill === "#e8eef1",
        ),
      ).toBe(true);
      if (symbol.art.shapes.some((shape) => shape.stroke)) {
        expect(symbolSvgMarkup(symbol, 27, "#e8eef1")).toContain('stroke="#e8eef1"');
      }
    }
  });

  it("offers a thicker alternative flow arrow", () => {
    const thick = symbolForAll("schematic.flow-arrow-thick");
    expect(thick.fixedStrokeWidth).toBe(1.2);
    expect(symbolRenderPlan(thick, "#111111").fixedStrokeWidth).toBe(1.2);
  });

  it("adds a standalone district heating meter panel", () => {
    const panel = symbolForAll("schematic.district-energy-meter-panel");
    expect(panel.category).toBe("district-heating");
    expect(panel.ports ?? []).toHaveLength(0);
    expect(panel.art.shapes.some((shape) => shape.stroke === true)).toBe(true);
    expect(panel.art.shapes.some((shape) => shape.stroke !== true)).toBe(true);
  });

  it("adds motor and hydraulic actuator valves", () => {
    const motor = symbolForAll("schematic.valve-motor-actuator");
    const hydraulic = symbolForAll("schematic.valve-hydraulic-actuator");
    expect(motor.category).toBe("valve");
    expect(hydraulic.category).toBe("valve");
    expect(motor.ports).toHaveLength(2);
    expect(hydraulic.ports).toHaveLength(2);
    expect(motor.art.shapes.some((shape) => shape.stroke)).toBe(true);
    expect(hydraulic.art.shapes.some((shape) => shape.stroke)).toBe(true);
  });

  it("adds four heating tank variants with a bottom port", () => {
    for (const id of [
      "schematic.tank-2",
      "schematic.tank-3",
      "schematic.tank-4",
      "schematic.open-tank",
    ]) {
      const tank = symbolForAll(id);
      expect(tank.category).toBe("heating");
      expect(tank.ports, id).toHaveLength(1);
    }
  });

  it("adds the strainer and diverter valve family", () => {
    expect(symbolForAll("schematic.y-strainer").ports).toHaveLength(3);
    expect(symbolForAll("schematic.diverter-valve").ports).toHaveLength(3);
    expect(symbolForAll("schematic.y-type-strainer").ports).toHaveLength(2);
    for (const id of [
      "schematic.y-strainer",
      "schematic.diverter-valve",
      "schematic.y-type-strainer",
    ]) {
      expect(symbolForAll(id).category).toBe("valve");
    }
  });

  it("adds actuated and self-draining valve variants", () => {
    for (const id of [
      "schematic.solenoid-valve-s",
      "schematic.pilot-gate-valve",
      "schematic.weight-gate-valve",
      "schematic.powered-valve",
    ]) {
      expect(symbolForAll(id).category).toBe("valve");
      expect(symbolForAll(id).ports, id).toHaveLength(2);
    }
    expect(symbolForAll("schematic.self-draining-valve").ports).toHaveLength(3);
  });

  it("adds gate, globe, rotary, needle and diaphragm valves", () => {
    for (const id of [
      "schematic.closed-gate-valve",
      "schematic.hand-globe-valve",
      "schematic.globe-valve",
      "schematic.rotary-valve",
      "schematic.needle-valve",
      "schematic.control-valve-diaphragm",
    ]) {
      expect(symbolForAll(id).category, id).toBe("valve");
      expect(symbolForAll(id).ports, id).toHaveLength(2);
    }
    expect(symbolForAll("schematic.closed-gate-valve").art.shapes[0].stroke).not.toBe(true);
  });

  it("adds plug, flanged and angle valve variants", () => {
    for (const id of [
      "schematic.plug-cock-valve",
      "schematic.flanged-valve",
      "schematic.flanged-valve-2",
      "schematic.angle-valve-hand",
    ]) {
      expect(symbolForAll(id).category, id).toBe("valve");
      expect(symbolForAll(id).ports, id).toHaveLength(2);
    }
  });

  it("adds angle globe, relief, angle and blowdown valves", () => {
    for (const id of [
      "schematic.angle-globe-valve",
      "schematic.relief-valve",
      "schematic.angle-valve",
    ]) {
      expect(symbolForAll(id).category, id).toBe("valve");
      expect(symbolForAll(id).ports, id).toHaveLength(2);
    }
    expect(symbolForAll("schematic.angle-blowdown-valve").ports).toHaveLength(3);
  });

  it("adds spring gate and self-operating release valves", () => {
    expect(symbolForAll("schematic.spring-gate-valve").ports).toHaveLength(2);
    expect(symbolForAll("schematic.self-operating-release-valve").ports).toHaveLength(1);
    expect(symbolForAll("schematic.spring-gate-valve").category).toBe("valve");
    expect(symbolForAll("schematic.self-operating-release-valve").category).toBe("valve");
  });

  it("adds vertical and dished-end vessels", () => {
    for (const id of ["schematic.vertical-vessel", "schematic.dished-ends-vessel"]) {
      expect(symbolForAll(id).category, id).toBe("heating");
      expect(symbolForAll(id).ports, id).toHaveLength(1);
    }
  });

  it("keeps the connection points of the redrawn operation-card symbols", () => {
    const ports = (id: string) => symbolForAll(id).ports?.map((port) => [port.id, port.x, port.y]);
    expect(ports("schematic.radiator")).toEqual([
      ["in", 4, 17],
      ["out", 4, 47],
    ]);
    expect(ports("schematic.floor-heating")).toEqual([
      ["in", 2, 14],
      ["out", 2, 50],
    ]);
    expect(ports("schematic.filter")).toEqual([
      ["in", 14, 32],
      ["out", 50, 32],
    ]);
    expect(ports("schematic.three-way-valve")).toEqual([
      ["in", 18, 32],
      ["out", 46, 32],
      ["branch", 32, 46],
    ]);
    expect(ports("schematic.circulation-pump")).toEqual([
      ["in", 16, 32],
      ["out", 48, 32],
    ]);
  });

  it("registers the added valve and switch symbols", () => {
    expect(symbolForAll("schematic.valve").category).toBe("valve");
    expect(symbolForAll("schematic.valve").tagPrefix).toBe("V");
    expect(symbolForAll("schematic.three-way-check-valve").tagPrefix).toBe("3BV");
    expect(symbolForAll("schematic.three-way-check-valve").ports).toHaveLength(3);
    expect(symbolForAll("schematic.switch-1p").category).toBe("control");
    expect(symbolForAll("schematic.switch-1p").tagPrefix).toBe("S1");
    expect(symbolForAll("schematic.switch-3p").tagPrefix).toBe("S3");
  });

  it("draws the check valve seat band as a filled shape", () => {
    const filled = (id: string) =>
      symbolForAll(id).art.shapes.some((shape) => shape.stroke !== true);
    expect(filled("schematic.check-valve")).toBe(true);
    expect(filled("schematic.three-way-check-valve")).toBe(true);
    expect(filled("schematic.valve")).toBe(false);
    expect(filled("schematic.three-way-valve")).toBe(false);
  });

  it("keeps schematic strokes at one page-space weight at every symbol size", () => {
    const plan = symbolRenderPlan(symbolForAll("schematic.sensor"), "#111111");
    const shape = plan.shapes.find((entry) => entry.stroke);
    expect(shape).toBeTruthy();
    for (const size of [20, 40, 80]) {
      expect(symbolShapeStrokeWidth(plan, shape!, size)).toBeCloseTo(SCHEMATIC_STROKE_WIDTH, 6);
    }
  });

  it("scales sign strokes with the symbol size", () => {
    const plan = symbolRenderPlan(symbolFor("fire.extinguisher"), "#d3202a", "sign");
    const shape = plan.shapes.find((entry) => entry.stroke);
    expect(shape).toBeTruthy();
    const small = symbolShapeStrokeWidth(plan, shape!, 24);
    const large = symbolShapeStrokeWidth(plan, shape!, 48);
    expect(large).toBeCloseTo(small * 2, 6);
  });

  it("draws every sensor family with the same closed funnel", () => {
    const ids = [
      "schematic.sensor",
      "schematic.sensor-internal",
      "schematic.sensor-external",
      "schematic.sensor-differential",
      "schematic.duct-sensor",
      "schematic.pressure-sensor",
      "schematic.flow-sensor",
      "schematic.level-sensor",
    ];
    for (const id of ids) {
      const shapes = symbolForAll(id).art?.shapes ?? [];
      expect(
        shapes.some((shape) => shape.d.includes("M 18 16 Q 32 8 46 16 L 32 34 Z")),
        id,
      ).toBe(true);
    }
  });

  it("offers a two-port single-lever mixer", () => {
    const mixer = symbolForAll("schematic.single-lever-mixer");
    expect(mixer.category).toBe("domestic-water");
    expect(mixer.ports).toHaveLength(2);
    expect(symbolDefaultSize("schematic.single-lever-mixer")).toBe(40);
  });

  it("offers standard, large and small expansion vessels", () => {
    expect(
      [
        "schematic.expansion-vessel",
        "schematic.expansion-vessel-large",
        "schematic.expansion-vessel-small",
      ].map((id) => symbolDefaultSize(id)),
    ).toEqual([40, 56, 26]);
  });

  it("draws the thermometer as a vertical scale with a bulb", () => {
    const shapes = symbolForAll("schematic.thermometer").art?.shapes ?? [];
    expect(shapes.some((shape) => shape.d.includes("M 32 8 L 32 46"))).toBe(true);
    expect(shapes.some((shape) => shape.d.includes("M 32 46 L 32 58"))).toBe(true);
  });

  it("resolves set membership, prefixes and defaults through the registry", () => {
    expect(ALL_SYMBOLS.every((symbol) => symbolForAll(symbol.id).id === symbol.id)).toBe(true);
    expect(symbolSetOf("schematic.fan")).toBe("schematic");
    expect(symbolSetOf("fire.extinguisher")).toBe("sign");
    expect(symbolTagPrefix("schematic.duct-sensor")).toBe("GT");
    expect(symbolDefaultSize("schematic.fan")).toBeGreaterThan(24);
    expect(ALL_CATEGORY_COLORS.instrument).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("has Swedish and English names for every schematic symbol", () => {
    const swedish = sv as Record<string, string>;
    for (const symbol of SCHEMATIC_SYMBOLS) {
      expect(swedish[`symbol.${symbol.id}`], symbol.id).toBeTruthy();
      expect(symbol.name, symbol.id).toBeTruthy();
    }
  });

  it("keeps the first ventilation ids and covers every schematic category", () => {
    expect(SCHEMATIC_SYMBOLS.slice(0, 10).map((symbol) => symbol.id)).toEqual([
      "schematic.fan",
      "schematic.filter",
      "schematic.heating-coil",
      "schematic.cooling-coil",
      "schematic.heat-exchanger",
      "schematic.damper",
      "schematic.silencer",
      "schematic.supply-diffuser",
      "schematic.extract-diffuser",
      "schematic.duct-sensor",
    ]);
    for (const category of SCHEMATIC_CATEGORIES) {
      expect(
        SCHEMATIC_SYMBOLS.some((symbol) => symbol.category === category),
        category,
      ).toBe(true);
    }
    expect(new Set(SCHEMATIC_SYMBOLS.map((symbol) => symbol.id)).size).toBe(
      SCHEMATIC_SYMBOLS.length,
    );
    expect(new Set(SCHEMATIC_SYMBOLS.map((symbol) => symbol.name)).size).toBe(
      SCHEMATIC_SYMBOLS.length,
    );
  });
});

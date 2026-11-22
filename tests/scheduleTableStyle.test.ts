// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canvasScheduleLayout, drawScheduleItem } from "../src/canvas/items/schedule";
import { resetCanvasScheduleStyle } from "../src/canvas/items/scheduleStyle";
import {
  DOCUMENT_SCHEDULE_STYLE,
  MIN_TABLE_CONTRAST,
  SCHEDULE_STYLE_TOKENS,
  computeSchedule,
  contrastRatio,
  documentScheduleTableStyle,
  inkColorRole,
  layoutScheduleTable,
  resolveScheduleTableStyle,
  type ScheduleColorRole,
  type ScheduleTableLayout,
  type ScheduleTableStyle,
  type StyleTokenReader,
} from "../src/features/schedules";
import {
  pdfScheduleLayout,
  drawScheduleItem as drawPdfScheduleItem,
} from "../src/pdf/export/items/schedule";
import { addItem, createProject, defaultDocument, layersForKind } from "../src/model/layers";
import type { MarkupItem, Project, ScheduleDefinition } from "../src/model/types";
import { store } from "../src/state/store";
import { THEMES, parseTokens } from "../scripts/theme-token-rules.mjs";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

/**
 * The placed takeoff table reads one layout for the canvas and the PDF, and one
 * palette contract for all five themes. These tests pin the band structure, the
 * canvas/PDF parity, and the guarantee that a broken palette can never produce
 * black text on a black band.
 */

const NOW = "2026-01-01T00:00:00.000Z";
const SCALE = { pointsPerMeter: 100, sourceUnit: "m" as const };
const measure = (text: string, size: number) => text.length * size * 0.5;
const root = resolve(__dirname, "..");

function readCss(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function paletteReader(theme: string): StyleTokenReader {
  const tokens = parseTokens(readCss(`src/styles/themes/${theme}.css`));
  return (token) => tokens.get(token) ?? null;
}

function paletteStyle(theme: string): ScheduleTableStyle {
  return resolveScheduleTableStyle(paletteReader(theme));
}

function makeProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 2)));
  const layer = layersForKind(project, "measure")[0];
  const [first, second] = project.categories;
  for (let index = 0; index < 6; index += 1) {
    const item: MarkupItem = {
      id: `item_${index}`,
      pageId: pageIdFor(1),
      kind: "length",
      points: [
        { x: 0, y: index * 4 },
        { x: 100, y: index * 4 },
      ],
      color: "#e30613",
      strokeWidth: 2,
      scale: { ...SCALE },
      categoryId: index % 2 === 0 ? first.id : second.id,
      createdAt: NOW,
      updatedAt: NOW,
      label: `Wall ${String.fromCharCode(65 + index)}`,
    };
    addItem(project, layer.id, item);
  }
  return project;
}

function groupedSchedule(
  project: Project,
  rowMode: ScheduleDefinition["rowMode"] = "items",
): ScheduleDefinition {
  const schedule: ScheduleDefinition = {
    id: "sched_style",
    name: "Walls",
    source: "measurements",
    rowMode,
    columns: [
      { id: "c1", field: "label", visible: true, width: 22 },
      { id: "c2", field: "value", visible: true, width: 14, format: "unit" },
      { id: "c3", field: "unit", visible: true, width: 8 },
    ],
    filters: {},
    groupBy: "category",
    totals: [{ field: "value", op: "sum" }],
    createdAt: NOW,
    updatedAt: NOW,
  };
  project.schedules.push(schedule);
  return schedule;
}

function placementItem(): MarkupItem {
  return {
    id: "item_table",
    pageId: pageIdFor(1),
    kind: "schedule",
    points: [
      { x: 24, y: 24 },
      { x: 444, y: 404 },
    ],
    color: "#f2a93b",
    strokeWidth: 1,
    scheduleId: "sched_style",
    showHeader: true,
    showTotals: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function groupedLayout(width = 420, height = 400): ScheduleTableLayout {
  const project = makeProject();
  const schedule = groupedSchedule(project);
  return layoutScheduleTable({
    result: computeSchedule(project, schedule),
    width,
    height,
    measure,
    showTotals: true,
  });
}

describe("placed takeoff table bands", () => {
  it("puts a header band, a group band, alternating rows, subtotals and a total", () => {
    const layout = groupedLayout();
    const roles = layout.bands.map((band) => band.role);
    expect(roles[0]).toBe("header");
    expect(roles.at(-1)).toBe("total");
    expect(roles.filter((role) => role === "group")).toHaveLength(2);
    expect(roles.filter((role) => role === "subtotal")).toHaveLength(2);
    expect(roles.every((role) => typeof role === "string")).toBe(true);
  });

  it("tiles the whole table without gaps or overlaps", () => {
    const layout = groupedLayout();
    expect(layout.bands[0].y).toBe(0);
    for (let index = 1; index < layout.bands.length; index += 1) {
      const previous = layout.bands[index - 1];
      expect(layout.bands[index].y).toBeCloseTo(previous.y + previous.height, 6);
    }
    const last = layout.bands.at(-1)!;
    expect(last.y + last.height).toBeLessThanOrEqual(layout.height);
    for (const band of layout.bands) {
      expect(band.x).toBe(0);
      expect(band.width).toBe(layout.width);
      expect(band.height).toBeCloseTo(layout.rowHeight, 6);
    }
  });

  it("keeps the row stripe aligned across group and subtotal rows", () => {
    const layout = groupedLayout();
    const stripes = layout.bands
      .map((band) => band.role)
      .filter((role) => role === "row" || role === "rowAlt");
    expect(stripes.length).toBe(6);
    stripes.forEach((role, index) => {
      expect(role).toBe(index % 2 === 0 ? "row" : "rowAlt");
    });
  });

  it("separates a group header and a subtotal with a section rule", () => {
    const layout = groupedLayout();
    const roles = layout.lines.map((line) => line.role);
    expect(roles.filter((role) => role === "header")).toHaveLength(1);
    // The first group header lands on the header rule, so it is not drawn twice;
    // the second group and both subtotals add their own section rule.
    expect(roles.filter((role) => role === "group").length).toBeGreaterThanOrEqual(1);
    expect(roles.filter((role) => role === "subtotal")).toHaveLength(2);
    expect(roles.filter((role) => role === "total")).toHaveLength(1);
    const groupTop = layout.bands.filter((band) => band.role === "group")[1].y;
    expect(layout.lines.some((line) => line.role === "group" && line.y1 === groupTop)).toBe(true);
    const strong = layout.lines.filter((line) => line.role !== "grid" && line.role !== "outer");
    expect(strong.every((line) => line.width > 0.4)).toBe(true);
    const grid = layout.lines.filter((line) => line.role === "grid");
    expect(grid.every((line) => line.width < 0.5)).toBe(true);
  });

  it("closes the table with an outer rule on all four edges", () => {
    const layout = groupedLayout();
    const width = 420;
    const outer = layout.lines.filter((line) => line.role === "outer");
    const right = outer.filter((line) => line.x1 === width && line.x2 === width);
    expect(right).toHaveLength(1);
    const bottom = outer.find(
      (line) => line.y1 === right[0].y2 && line.x1 === 0 && line.x2 === width,
    )!;
    expect(right[0]).toMatchObject({ y1: 0, role: "outer" });
    expect(bottom).toBeTruthy();
    // The right edge carries the same firm weight as the left edge, not the
    // faint column-divider weight that left the table open on that side.
    const left = outer.find((line) => line.x1 === 0 && line.x2 === 0)!;
    expect(right[0].width).toBe(left.width);
    expect(right[0].width).toBeGreaterThan(0.5);
    // No grid-role line sits on the right edge any more.
    expect(
      layout.lines.some((line) => line.role === "grid" && line.x1 === width && line.x2 === width),
    ).toBe(false);
    // The column dividers the layout still draws stay grid lines.
    expect(layout.lines.some((line) => line.role === "grid" && line.x1 !== width)).toBe(true);
  });

  it("gives a grouped row mode the group band instead of a subtotal band", () => {
    const project = makeProject();
    const schedule = groupedSchedule(project, "grouped");
    const layout = layoutScheduleTable({
      result: computeSchedule(project, schedule),
      width: 420,
      height: 400,
      measure,
      showTotals: true,
    });
    const roles = layout.bands.map((band) => band.role);
    expect(roles.filter((role) => role === "group")).toHaveLength(2);
    expect(roles).not.toContain("subtotal");
    expect(roles.at(-1)).toBe("total");
  });
});

describe("canvas and PDF share one table layout", () => {
  it("returns identical rows, cells, lines and bands for a grouped table", () => {
    const project = makeProject();
    const schedule = groupedSchedule(project);
    const result = computeSchedule(project, schedule);
    const item = placementItem();
    const canvas = canvasScheduleLayout(result, item, measure);
    const pdf = pdfScheduleLayout(result, item, measure);
    expect(canvas).toEqual(pdf);
    expect(canvas.bands.length).toBeGreaterThan(4);
    expect(canvas.lines.length).toBeGreaterThan(6);
    expect(canvas.bands.some((band) => band.role === "subtotal")).toBe(true);
    expect(canvas.bands.some((band) => band.role === "total")).toBe(true);
    expect(canvas.cells.some((cell) => cell.role === "subtotal")).toBe(true);
    expect(canvas.cells.some((cell) => cell.role === "total")).toBe(true);
  });

  it("differs only in measured text when the font metrics differ", () => {
    const project = makeProject();
    const schedule = groupedSchedule(project);
    const result = computeSchedule(project, schedule);
    const item = placementItem();
    const canvas = canvasScheduleLayout(result, item, measure);
    const pdf = pdfScheduleLayout(result, item, (text, size) => text.length * size * 0.62);
    expect(pdf.bands).toEqual(canvas.bands);
    expect(pdf.lines).toEqual(canvas.lines);
    expect(pdf.columns).toEqual(canvas.columns);
    expect(pdf.cells.map((cell) => ({ ...cell, text: "" }))).toEqual(
      canvas.cells.map((cell) => ({ ...cell, text: "" })),
    );
    expect(pdf.header.map((cell) => ({ ...cell, text: "" }))).toEqual(
      canvas.header.map((cell) => ({ ...cell, text: "" })),
    );
  });
});

describe("placed takeoff table colours", () => {
  it("resolves every role from the theme tokens in every palette", () => {
    for (const theme of THEMES) {
      const tokens = parseTokens(readCss(`src/styles/themes/${theme}.css`));
      const style = paletteStyle(theme);
      for (const role of Object.keys(SCHEDULE_STYLE_TOKENS) as ScheduleColorRole[]) {
        expect(style[role], `${theme}: ${SCHEDULE_STYLE_TOKENS[role]}`).toBe(
          tokens.get(SCHEDULE_STYLE_TOKENS[role]),
        );
      }
    }
  });

  it("keeps every ink readable on the band it is drawn on, in every palette", () => {
    const pairs: Array<[ScheduleColorRole, ScheduleColorRole[]]> = [
      ["ink", ["paper", "bandRowAlt", "bandSubtotal", "bandGroup"]],
      ["inkStrong", ["bandHeader", "bandGroup", "bandSubtotal"]],
      ["inkInverse", ["bandTotal"]],
      ["inkMuted", ["paper"]],
    ];
    for (const theme of THEMES) {
      const style = paletteStyle(theme);
      for (const [ink, surfaces] of pairs) {
        for (const surface of surfaces) {
          expect(
            contrastRatio(style[ink], style[surface]),
            `${theme}: ${ink} on ${surface}`,
          ).toBeGreaterThanOrEqual(MIN_TABLE_CONTRAST);
        }
      }
    }
  });

  it("reads the palette instead of a fixed colour, light and dark alike", () => {
    const light = paletteStyle("light-green");
    const navy = paletteStyle("navy");
    expect(light.bandHeader).not.toBe(navy.bandHeader);
    expect(light.ink).not.toBe(navy.ink);
    // Both keep the printed-sheet character the product asks for.
    expect(light.paper).toBe("#ffffff");
    expect(navy.paper).toBe("#ffffff");
    expect(contrastRatio(light.bandHeader, light.paper)).toBeGreaterThan(1.1);
    expect(contrastRatio(navy.bandHeader, navy.paper)).toBeGreaterThan(1.1);
  });

  it("falls back to the document palette when a token is missing", () => {
    expect(resolveScheduleTableStyle(() => undefined)).toEqual(DOCUMENT_SCHEDULE_STYLE);
    expect(documentScheduleTableStyle()).toEqual(DOCUMENT_SCHEDULE_STYLE);
  });

  it("never yields black text on a black band from an invalid palette", () => {
    const garbage = resolveScheduleTableStyle(() => "not-a-colour");
    expect(garbage).toEqual(DOCUMENT_SCHEDULE_STYLE);

    const black = resolveScheduleTableStyle(() => "#000000");
    expect(black.ink).not.toBe("#000000");
    expect(black.inkStrong).not.toBe("#000000");
    expect(contrastRatio(black.ink, black.paper)).toBeGreaterThanOrEqual(MIN_TABLE_CONTRAST);
    expect(contrastRatio(black.inkStrong, black.bandHeader)).toBeGreaterThanOrEqual(
      MIN_TABLE_CONTRAST,
    );
  });

  it("restores a band that defeats both document inks", () => {
    const reader: StyleTokenReader = (token) =>
      token === "--table-band-group" || token === "--table-ink" ? "#000000" : null;
    const style = resolveScheduleTableStyle(reader);
    for (const surface of ["paper", "bandRowAlt", "bandSubtotal", "bandGroup"] as const) {
      expect(contrastRatio(style.ink, style[surface])).toBeGreaterThanOrEqual(MIN_TABLE_CONTRAST);
    }
    expect(style.bandGroup).not.toBe("#000000");
  });

  it("maps every band and cell role to a palette role", () => {
    expect(inkColorRole("header")).toBe("inkStrong");
    expect(inkColorRole("group")).toBe("inkStrong");
    expect(inkColorRole("subtotal")).toBe("inkStrong");
    expect(inkColorRole("total")).toBe("inkInverse");
    expect(inkColorRole("row")).toBe("ink");
    expect(inkColorRole("empty")).toBe("inkMuted");
  });
});

function recordContext() {
  const fills: Array<{ color: string; x: number; y: number; width: number; height: number }> = [];
  const strokes: string[] = [];
  const texts: Array<{ text: string; color: string }> = [];
  let fillStyle = "";
  let strokeStyle = "";
  const ctx = {
    font: "",
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string) {
      fillStyle = value;
    },
    get strokeStyle() {
      return strokeStyle;
    },
    set strokeStyle(value: string) {
      strokeStyle = value;
    },
    lineWidth: 1,
    lineCap: "butt",
    textAlign: "left",
    textBaseline: "alphabetic",
    globalAlpha: 1,
    save() {},
    restore() {},
    setLineDash() {},
    beginPath() {},
    rect() {},
    clip() {},
    moveTo() {},
    lineTo() {},
    stroke() {
      strokes.push(strokeStyle);
    },
    strokeRect() {
      strokes.push(strokeStyle);
    },
    fillRect(x: number, y: number, width: number, height: number) {
      fills.push({ color: fillStyle, x, y, width, height });
    },
    measureText: (text: string) => ({ width: text.length * 4 }),
    fillText: (text: string) => texts.push({ text, color: fillStyle }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, fills, strokes, texts };
}

function renderState(project: Project, item: MarkupItem) {
  return {
    context: {
      zoom: 1,
      project,
      toScreen: (point: { x: number; y: number }) => point,
      imageElement: () => null,
      screenLabelBox: (box: unknown) => box,
      editors: { editingItemId: null, editingLabelId: null, textSession: null },
    },
    zoom: 1,
    points: item.points,
    lineWidth: 1,
    color: "#1a2024",
    drawPanel: () => undefined,
  } as unknown as Parameters<typeof drawScheduleItem>[2];
}

function stubTokens(values: Record<string, string>) {
  vi.stubGlobal("getComputedStyle", () => ({
    getPropertyValue: (token: string) => values[token] ?? "",
  }));
}

function tokensOf(theme: string): Record<string, string> {
  return Object.fromEntries(parseTokens(readCss(`src/styles/themes/${theme}.css`)));
}

describe("canvas renderer reads the theme", () => {
  beforeEach(() => {
    resetCanvasScheduleStyle();
    document.documentElement.removeAttribute("data-theme");
    vi.unstubAllGlobals();
  });

  it("paints the header, stripe and total bands from the active palette", () => {
    const project = makeProject();
    groupedSchedule(project);
    const item = placementItem();
    store.setProject(project, null);
    document.documentElement.dataset.theme = "light-green";
    stubTokens(tokensOf("light-green"));
    const { ctx, fills, texts } = recordContext();
    drawScheduleItem(ctx, item, renderState(project, item));
    const style = paletteStyle("light-green");
    const colors = fills.map((fill) => fill.color);
    expect(colors).toContain(style.bandHeader);
    expect(colors).toContain(style.bandTotal);
    expect(colors).toContain(style.bandSubtotal);
    expect(colors).toContain(style.bandRowAlt);
    expect(colors).not.toContain("#000000");
    const ink = texts.map((text) => text.color);
    expect(ink).toContain(style.ink);
    expect(ink).toContain(style.inkStrong);
    expect(ink).toContain(style.inkInverse);
  });

  it("keeps an explicit item fill as the table paper", () => {
    const project = makeProject();
    groupedSchedule(project);
    const item = placementItem();
    item.fillColor = "#fdf6e3";
    store.setProject(project, null);
    stubTokens(tokensOf("medium-grey"));
    const { ctx, fills } = recordContext();
    drawScheduleItem(ctx, item, renderState(project, item));
    const colors = fills.map((fill) => fill.color);
    expect(colors[0]).toBe("#fdf6e3");
    expect(colors).toContain("#fdf6e3");
  });

  it("re-reads the palette when the theme changes and never caches the old one", () => {
    const project = makeProject();
    groupedSchedule(project);
    const item = placementItem();
    store.setProject(project, null);

    document.documentElement.dataset.theme = "light-green";
    stubTokens(tokensOf("light-green"));
    const light = recordContext();
    drawScheduleItem(light.ctx, item, renderState(project, item));
    expect(light.fills.map((fill) => fill.color)).toContain(paletteStyle("light-green").bandHeader);

    resetCanvasScheduleStyle();
    document.documentElement.dataset.theme = "navy";
    stubTokens(tokensOf("navy"));
    const navy = recordContext();
    drawScheduleItem(navy.ctx, item, renderState(project, item));
    expect(navy.fills.map((fill) => fill.color)).toContain(paletteStyle("navy").bandHeader);
    expect(navy.fills.map((fill) => fill.color)).not.toContain(
      paletteStyle("light-green").bandHeader,
    );
  });
});

describe("PDF renderer paints the document palette", () => {
  type DrawCall =
    | { kind: "rect"; color: string; x: number; y: number; width: number; height: number }
    | { kind: "text"; color: string; text: string }
    | { kind: "line"; color: string };

  function pdfContext(project: Project, calls: DrawCall[]) {
    const height = 400;
    return {
      page: {
        drawRectangle: (options: {
          color?: { red: number; green: number; blue: number };
          x: number;
          y: number;
          width: number;
          height: number;
        }) =>
          calls.push({
            kind: "rect",
            color: rgbHex(options.color),
            x: options.x,
            y: options.y,
            width: options.width,
            height: options.height,
          }),
        drawText: (
          text: string,
          options: { color?: { red: number; green: number; blue: number } },
        ) => calls.push({ kind: "text", color: rgbHex(options.color), text }),
        drawLine: (options: { color?: { red: number; green: number; blue: number } }) =>
          calls.push({ kind: "line", color: rgbHex(options.color) }),
      },
      viewport: {
        width: 600,
        height,
        scale: 1,
        convertToPdfPoint: (x: number, y: number) => [x, height - y],
      },
      project,
      fonts: {
        regular: { widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5 },
        bold: { widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.55 },
        italic: { widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5 },
        boldItalic: {
          widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.55,
        },
      },
      labels: new Map(),
      images: { element: () => null },
    } as unknown as Parameters<typeof drawPdfScheduleItem>[0];
  }

  function rgbHex(color?: { red: number; green: number; blue: number }): string {
    if (!color) return "";
    const channel = (value: number) =>
      Math.round(Math.max(0, Math.min(1, value)) * 255)
        .toString(16)
        .padStart(2, "0");
    return `#${channel(color.red)}${channel(color.green)}${channel(color.blue)}`;
  }

  it("fills every band and inks every cell from the document palette", () => {
    const project = makeProject();
    groupedSchedule(project);
    const item = placementItem();
    const calls: DrawCall[] = [];
    drawPdfScheduleItem(pdfContext(project, calls), item, 1);
    const style = documentScheduleTableStyle();
    const fills = calls.filter((call) => call.kind === "rect").map((call) => call.color);
    expect(fills.filter((color) => color === style.bandHeader)).toHaveLength(1);
    expect(fills.filter((color) => color === style.bandTotal)).toHaveLength(1);
    expect(fills.filter((color) => color === style.bandSubtotal)).toHaveLength(2);
    expect(fills.filter((color) => color === style.bandRowAlt)).toHaveLength(3);
    expect(fills).not.toContain("#000000");
    const inks = calls.filter((call) => call.kind === "text").map((call) => call.color);
    expect(inks).toContain(style.ink);
    expect(inks).toContain(style.inkStrong);
    expect(inks).toContain(style.inkInverse);
  });

  it("keeps an explicit item fill as the table paper", () => {
    const project = makeProject();
    groupedSchedule(project);
    const item = placementItem();
    item.fillColor = "#fdf6e3";
    const calls: DrawCall[] = [];
    drawPdfScheduleItem(pdfContext(project, calls), item, 1);
    const fills = calls.filter((call) => call.kind === "rect").map((call) => call.color);
    expect(fills.filter((color) => color === "#fdf6e3")).toHaveLength(4);
  });
});

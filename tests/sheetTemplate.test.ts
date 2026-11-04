import { describe, expect, it } from "vitest";
import {
  buildDrawingFrameTemplate,
  MM_TO_PT,
  PAPER_SIZES,
  resolveSheetLabels,
  revisionFieldId,
  SHEET_FIELD,
  type SheetLabels,
} from "../src/features/schematics/model/sheetTemplate";
import { baselineY, fitText, toPdfRect } from "../src/features/schematics/render/sheetPdf";

const labels: SheetLabels = {
  handledBy: "Handled",
  card: "Card",
  date: "Date",
  system: "System",
  assignment: "Assignment",
  page: "Page",
  bet: "Bet.",
  rev: "Rev.",
  sign: "Sign",
};

describe("drawing frame template", () => {
  it("uses the A3 and A2 paper sizes in points", () => {
    const a3 = buildDrawingFrameTemplate("A3", labels);
    expect(a3.width).toBeCloseTo(PAPER_SIZES.A3.widthMm * MM_TO_PT, 5);
    expect(a3.height).toBeCloseTo(PAPER_SIZES.A3.heightMm * MM_TO_PT, 5);

    const a2 = buildDrawingFrameTemplate("A2", labels);
    expect(a2.width).toBeCloseTo(PAPER_SIZES.A2.widthMm * MM_TO_PT, 5);
    expect(a2.height).toBeCloseTo(PAPER_SIZES.A2.heightMm * MM_TO_PT, 5);
  });

  it("keeps field ids unique and stable across paper sizes", () => {
    const idsFor = (paper: "A3" | "A2") =>
      buildDrawingFrameTemplate(paper, labels)
        .fields.map((field) => field.id)
        .sort();
    const ids = idsFor("A3");
    expect(new Set(ids).size).toBe(ids.length);
    expect(idsFor("A2")).toEqual(ids);
    expect(ids).toContain(SHEET_FIELD.projectName);
    expect(ids).toContain(SHEET_FIELD.page);
    expect(ids).toContain(revisionFieldId(1, "bet"));
    expect(ids).toContain(revisionFieldId(4, "sign"));
  });

  it("keeps every field inside the page", () => {
    const template = buildDrawingFrameTemplate("A3", labels);
    for (const field of template.fields) {
      expect(field.rect.width).toBeGreaterThan(0);
      expect(field.rect.height).toBeGreaterThan(0);
      expect(field.rect.x).toBeGreaterThanOrEqual(0);
      expect(field.rect.y).toBeGreaterThanOrEqual(0);
      expect(field.rect.x + field.rect.width).toBeLessThanOrEqual(template.width + 1e-6);
      expect(field.rect.y + field.rect.height).toBeLessThanOrEqual(template.height + 1e-6);
    }
  });

  it("places the title block bottom-right and the revision table bottom-left", () => {
    const template = buildDrawingFrameTemplate("A3", labels);
    const byId = new Map(template.fields.map((field) => [field.id, field]));

    const card = byId.get(SHEET_FIELD.card);
    expect(card).toBeDefined();
    expect(card!.rect.x).toBeGreaterThan(template.width * 0.7);
    expect(card!.rect.y).toBeGreaterThan(template.height * 0.8);

    const revision = byId.get(revisionFieldId(1, "bet"));
    expect(revision).toBeDefined();
    expect(revision!.rect.x).toBeLessThan(template.width * 0.25);
    expect(revision!.rect.y).toBeGreaterThan(template.height * 0.8);
  });

  it("keeps the drawing area above the bottom band", () => {
    const template = buildDrawingFrameTemplate("A3", labels);
    expect(template.drawingArea.x).toBeGreaterThan(0);
    expect(template.drawingArea.y).toBeGreaterThan(0);
    expect(template.drawingArea.width).toBeGreaterThan(0);
    expect(template.drawingArea.height).toBeGreaterThan(0);
    expect(template.drawingArea.y + template.drawingArea.height).toBeLessThan(
      template.height - 37 * MM_TO_PT,
    );
  });

  it("keeps static primitives inside the page", () => {
    const template = buildDrawingFrameTemplate("A2", labels);
    for (const primitive of template.staticPrimitives) {
      if (primitive.kind === "rect") {
        expect(primitive.rect.x).toBeGreaterThanOrEqual(0);
        expect(primitive.rect.y).toBeGreaterThanOrEqual(0);
        expect(primitive.rect.x + primitive.rect.width).toBeLessThanOrEqual(template.width);
        expect(primitive.rect.y + primitive.rect.height).toBeLessThanOrEqual(template.height);
      } else if (primitive.kind === "line") {
        for (const coordinate of [primitive.x1, primitive.x2]) {
          expect(coordinate).toBeGreaterThanOrEqual(0);
          expect(coordinate).toBeLessThanOrEqual(template.width);
        }
        for (const coordinate of [primitive.y1, primitive.y2]) {
          expect(coordinate).toBeGreaterThanOrEqual(0);
          expect(coordinate).toBeLessThanOrEqual(template.height);
        }
      }
    }
  });

  it("resolves labels through the message catalog", () => {
    const resolved = resolveSheetLabels((key) => key);
    expect(resolved.handledBy).toBe("sheet.label.handledBy");
    expect(resolved.card).toBe("sheet.label.card");
    expect(resolved.sign).toBe("sheet.label.sign");
  });
});

describe("sheet coordinate conversion", () => {
  it("flips top-left rectangles into pdf-lib page space", () => {
    expect(toPdfRect(100, { x: 10, y: 0, width: 20, height: 20 })).toEqual({
      x: 10,
      y: 80,
      width: 20,
      height: 20,
    });
    expect(toPdfRect(100, { x: 10, y: 80, width: 20, height: 20 })).toEqual({
      x: 10,
      y: 0,
      width: 20,
      height: 20,
    });
  });

  it("places baselines for each vertical alignment", () => {
    const rect = { x: 0, y: 10, width: 20, height: 20 };
    expect(baselineY(100, rect, 10, "middle", 2)).toBeCloseTo(76.5, 5);
    expect(baselineY(100, rect, 10, "top", 2)).toBeCloseTo(80, 5);
    expect(baselineY(100, rect, 10, "bottom", 2)).toBeCloseTo(74, 5);
  });
});

describe("field text fitting", () => {
  const font = {
    widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5,
  };

  it("keeps text that fits", () => {
    expect(fitText("ABC", font, 10, 100)).toEqual({ text: "ABC", size: 10 });
  });

  it("shrinks text before truncating", () => {
    const fitted = fitText("ABCDEFGHIJ", font, 10, 20);
    expect(fitted.text).toBe("ABCDEFGHIJ");
    expect(fitted.size).toBeLessThan(10);
    expect(font.widthOfTextAtSize(fitted.text, fitted.size)).toBeLessThanOrEqual(20);
  });

  it("ellipsizes text that cannot be shrunk enough", () => {
    const fitted = fitText("ABCDEFGHIJKLMNOPQRSTUVWXYZ", font, 10, 20);
    expect(fitted.text.endsWith("...")).toBe(true);
    expect(font.widthOfTextAtSize(fitted.text, fitted.size)).toBeLessThanOrEqual(20);
  });

  it("returns empty text when even an ellipsis does not fit", () => {
    expect(fitText("ABC", font, 10, 2)).toEqual({ text: "", size: 4 });
  });
});

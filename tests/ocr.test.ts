import { describe, expect, it } from "vitest";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import type { OcrPage, Project } from "../src/model/types";
import { parseProject, serializeProject } from "../src/io/projectFile";
import { isOcrCurrent, ocrPageToText } from "../src/search/ocr";
import { searchTextPage } from "../src/search/textIndex";

function makeProject(): Project {
  const project = createProject(defaultDocument("Scan.pdf", 2), createDefaultLayers());
  project.documents[0].sha256 = "scan-sha";
  return project;
}

function makeOcr(overrides: Partial<OcrPage> = {}): OcrPage {
  return {
    text: "ROOM A101 VENTILATION",
    words: [
      { text: "ROOM", x: 10, y: 20, width: 40, height: 12, confidence: 92 },
      { text: "A101", x: 55, y: 20, width: 35, height: 12, confidence: 88 },
      { text: "VENTILATION", x: 10, y: 40, width: 90, height: 12, confidence: 80 },
    ],
    engine: "tesseract",
    languages: "eng+swe",
    generatedAt: "2026-01-01T00:00:00.000Z",
    documentSha256: "scan-sha",
    sourcePage: 1,
    width: 595,
    height: 842,
    ...overrides,
  };
}

describe("OCR index", () => {
  it("converts stored OCR words into searchable page text", () => {
    const page = ocrPageToText(makeOcr(), 3);
    expect(page.page).toBe(3);
    expect(page.text).toBe("ROOM A101 VENTILATION");
    const hits = searchTextPage(page, "A101");
    expect(hits).toHaveLength(1);
    expect(hits[0].rects[0]).toMatchObject({ x: 55, y: 20, width: 35, height: 12 });
  });

  it("invalidates OCR when the source checksum or source page changes", () => {
    const project = makeProject();
    const ocr = makeOcr();
    expect(isOcrCurrent(project, 1, ocr)).toBe(true);
    expect(isOcrCurrent(project, 1, { ...ocr, documentSha256: "other" })).toBe(false);
    expect(isOcrCurrent(project, 2, { ...ocr, sourcePage: 1 })).toBe(false);
  });

  it("round-trips OCR through the project file", () => {
    const project = makeProject();
    project.pages["1"] = { ocr: makeOcr() };
    const parsed = parseProject(serializeProject(project));
    expect(parsed.schemaVersion).toBe(19);
    expect(parsed.pages["1"].ocr).toEqual(makeOcr());
  });

  it("drops invalid OCR records but keeps the rest of the page state", () => {
    const project = makeProject();
    project.pages["1"] = { name: "Scanned sheet", ocr: makeOcr() };
    const raw = JSON.parse(serializeProject(project));
    raw.pages["1"].ocr.documentSha256 = "";
    const parsed = parseProject(JSON.stringify(raw));
    expect(parsed.pages["1"].name).toBe("Scanned sheet");
    expect(parsed.pages["1"].ocr).toBeUndefined();
  });

  it("loads a schema 16 project without OCR and upgrades it to schema 19", () => {
    const project = makeProject();
    const raw = JSON.parse(serializeProject(project));
    raw.schemaVersion = 16;
    const parsed = parseProject(JSON.stringify(raw));
    expect(parsed.schemaVersion).toBe(19);
    expect(parsed.pages["1"]?.ocr).toBeUndefined();
  });
});

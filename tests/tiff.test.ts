import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import { isTiff, pageSizePt, readTiff, rotationForOrientation, TiffImportError } from "../src/io/tiff";
import { createTiffDocumentRef, tiffToPdf } from "../src/io/tiffImport";

const fixtures = path.resolve(__dirname, "../fixtures/tiff");

async function fixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtures, name)));
}

/** Builds a minimal little-endian TIFF with one IFD per page. */
function syntheticTiff(pages: { width: number; height: number; preview?: boolean }[]): Uint8Array {
  const entryCounts = pages.map(() => 9);
  const ifdOffsets: number[] = [];
  let cursor = 8;
  for (const count of entryCounts) {
    ifdOffsets.push(cursor);
    cursor += 2 + count * 12 + 4;
  }
  const stripBase = cursor;
  const bytes = new Uint8Array(stripBase + pages.length);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);

  pages.forEach((page, index) => {
    const ifdOffset = ifdOffsets[index];
    const count = entryCounts[index];
    view.setUint16(ifdOffset, count, true);
    let entry = ifdOffset + 2;
    const write = (tag: number, type: number, value: number) => {
      view.setUint16(entry, tag, true);
      view.setUint16(entry + 2, type, true);
      view.setUint32(entry + 4, 1, true);
      if (type === 3) view.setUint16(entry + 8, value, true);
      else view.setUint32(entry + 8, value, true);
      entry += 12;
    };
    write(254, 4, page.preview ? 1 : 0);
    write(256, 3, page.width);
    write(257, 3, page.height);
    write(258, 3, 1);
    write(259, 3, 4);
    write(262, 3, 0);
    write(273, 4, stripBase + index);
    write(278, 4, page.height);
    write(279, 4, 1);
    const next = ifdOffset + 2 + count * 12;
    view.setUint32(next, index === pages.length - 1 ? 0 : ifdOffsets[index + 1], true);
  });

  return bytes;
}

describe("TIFF reading", () => {
  it("detects TIFF by magic bytes, not by extension", async () => {
    expect(isTiff(await fixture("g4-200dpi.tif"))).toBe(true);
    expect(isTiff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(false);
    expect(isTiff(new Uint8Array(4))).toBe(false);
  });

  it("reads a single-strip CCITT G4 page", async () => {
    const file = readTiff(await fixture("g4-200dpi.tif"));
    expect(file.pages).toHaveLength(1);
    const page = file.pages[0];
    expect(page).toMatchObject({
      width: 64,
      height: 48,
      compression: 4,
      photometric: 0,
      bitsPerSample: 1,
      dpiX: 200,
      dpiY: 200,
      dpiKnown: true,
    });
    expect(page.strips).toHaveLength(1);
    expect(page.strips[0].rows).toBe(48);
  });

  it("keeps every strip of a multi-strip page", async () => {
    const page = readTiff(await fixture("g4-strips.tif")).pages[0];
    expect(page.strips).toHaveLength(6);
    expect(page.strips.map((strip) => strip.rows)).toEqual([8, 8, 8, 8, 8, 8]);
    expect(page.strips.map((strip) => strip.top)).toEqual([0, 8, 16, 24, 32, 40]);
  });

  it("derives the page size from the DPI tags", async () => {
    const page = readTiff(await fixture("g4-200dpi.tif")).pages[0];
    expect(pageSizePt(page)).toEqual({ width: 23.04, height: 17.28 });
  });

  it("skips reduced-resolution preview IFDs", () => {
    const bytes = syntheticTiff([
      { width: 10, height: 10 },
      { width: 2, height: 2, preview: true },
      { width: 20, height: 20 },
    ]);
    const pages = readTiff(bytes).pages;
    expect(pages).toHaveLength(2);
    expect(pages.map((page) => page.width)).toEqual([10, 20]);
  });

  it("maps TIFF orientation onto PDF rotation", () => {
    expect(rotationForOrientation(1)).toBe(0);
    expect(rotationForOrientation(3)).toBe(180);
    expect(rotationForOrientation(6)).toBe(90);
    expect(rotationForOrientation(8)).toBe(270);
    expect(() => rotationForOrientation(2)).toThrow(/orientation 2/i);
  });
});

describe("TIFF to PDF", () => {
  it("writes CCITT image streams without decoding pixels", async () => {
    const source = await fixture("g4-200dpi.tif");
    const conversion = await tiffToPdf(source);
    expect(conversion.pages).toHaveLength(1);
    expect(conversion.pages[0].widthPt).toBe(23.04);
    expect(conversion.pages[0].rotation).toBe(0);

    const pdf = await PDFDocument.load(conversion.bytes);
    const page = pdf.getPages()[0];
    const resources = page.node.Resources();
    const xobjects = resources?.lookup(PDFName.of("XObject"), PDFDict);
    expect(xobjects).toBeDefined();
    const entries = xobjects!.entries();
    expect(entries).toHaveLength(1);
    const stream = pdf.context.lookup(entries[0][1]);
    expect(stream).toBeInstanceOf(PDFRawStream);
    const dict = (stream as PDFRawStream).dict;
    expect(String(dict.get(PDFName.of("Filter")))).toBe("/CCITTFaxDecode");
    const width = dict.get(PDFName.of("Width"));
    expect(width).toBeInstanceOf(PDFNumber);
    expect((width as PDFNumber).asNumber()).toBe(64);
  });

  it("creates one image object per strip", async () => {
    const conversion = await tiffToPdf(await fixture("g4-strips.tif"));
    const pdf = await PDFDocument.load(conversion.bytes);
    const resources = pdf.getPages()[0].node.Resources();
    const xobjects = resources!.lookup(PDFName.of("XObject"), PDFDict)!;
    expect(xobjects.entries()).toHaveLength(6);
    expect(conversion.pages[0].strips).toBe(6);
  });

  it("rejects non-fax compressions with a clear message", async () => {
    await expect(tiffToPdf(await fixture("lzw.tif"))).rejects.toThrow(/compression 5/i);
  });

  it("embeds the derived PDF in the document reference", async () => {
    const source = await fixture("g4-200dpi.tif");
    const conversion = await tiffToPdf(source);
    const document = createTiffDocumentRef({
      name: "Plan.tif",
      path: "/plans/Plan.tif",
      sha256: "abc",
      sizeBytes: source.byteLength,
      conversion,
    });
    expect(document.kind).toBe("tiff");
    expect(document.pageCount).toBe(1);
    expect(document.embeddedPdf?.startsWith("JVBERi0")).toBe(true);
    expect(document.source).toEqual({
      format: "tiff",
      dpi: [200, 200],
      originalName: "Plan.tif",
    });
  });

  it("reports a readable error for a malformed file", async () => {
    await expect(tiffToPdf(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(TiffImportError);
  });
});

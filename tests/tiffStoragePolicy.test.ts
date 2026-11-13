import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName, type PDFRawStream } from "pdf-lib";
import { base64ToBytes } from "../src/io/base64";
import { readTiff } from "../src/io/tiff";
import { createTiffDocumentRef, tiffToPdf } from "../src/io/tiffImport";

/*
 * Pins the shipped TIF storage decision in ADR 0015:
 *
 *   - CCITT G3/G4 pages are a byte-for-byte passthrough and must stay one;
 *   - a decoded (colour or greyscale) page is a derived PDF embedded as base64
 *     in `DocumentRef.embeddedPdf`, and the derived PDF is deterministic.
 *
 * A future reference-plus-cache storage mode changes the second fact and must
 * update this file and the ADR together. The first fact is not negotiable.
 */

const fixtures = path.resolve(__dirname, "../fixtures/tiff");

async function fixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtures, name)));
}

interface ImageStream {
  stream: PDFRawStream;
  bytes: Uint8Array;
}

async function imageStreams(pdfBytes: Uint8Array, pageIndex = 0): Promise<ImageStream[]> {
  const pdf = await PDFDocument.load(pdfBytes);
  const resources = pdf.getPages()[pageIndex].node.Resources();
  const xobjects = resources?.lookup(PDFName.of("XObject"), PDFDict);
  if (!xobjects) return [];
  return xobjects.entries().map(([, ref]) => {
    const stream = pdf.context.lookup(ref) as PDFRawStream;
    return { stream, bytes: stream.asUint8Array() };
  });
}

function dictName(stream: PDFRawStream, key: string): string {
  return String(stream.dict.get(PDFName.of(key)));
}

describe("TIF storage policy (ADR 0015)", () => {
  it("passes CCITT strips through byte-for-byte and adds no raster growth", async () => {
    const source = await fixture("g4-strips.tif");
    const file = readTiff(source);
    const conversion = await tiffToPdf(source);
    const streams = await imageStreams(conversion.bytes);

    expect(file.pages[0].compression).toBe(4);
    expect(streams).toHaveLength(file.pages[0].strips.length);

    let stored = 0;
    streams.forEach((entry, index) => {
      expect(dictName(entry.stream, "Filter")).toBe("/CCITTFaxDecode");
      expect(dictName(entry.stream, "BitsPerComponent")).toBe("1");
      const strip = file.pages[0].strips[index];
      const original = source.subarray(strip.offset, strip.offset + strip.byteCount);
      expect(entry.bytes).toEqual(original);
      stored += entry.bytes.length;
    });

    const sourceStripBytes = file.pages[0].strips.reduce(
      (total, strip) => total + strip.byteCount,
      0,
    );
    expect(stored).toBe(sourceStripBytes);
    // The derived PDF is the source strips plus PDF structure, not a re-encode.
    // A decoded 1-bit raster for this page would be 24 KiB on its own.
    expect(conversion.bytes.length).toBeLessThan(sourceStripBytes + 4096);
  });

  it("embeds a decoded colour page as Flate images, never as JPEG", async () => {
    const source = await fixture("rgb8-deflate.tif");
    const conversion = await tiffToPdf(source);
    const streams = await imageStreams(conversion.bytes);
    expect(streams.length).toBeGreaterThan(0);
    for (const entry of streams) {
      expect(dictName(entry.stream, "Filter")).toBe("/FlateDecode");
      expect(dictName(entry.stream, "ColorSpace")).toBe("/DeviceRGB");
      expect(dictName(entry.stream, "Filter")).not.toBe("/DCTDecode");
    }

    // The derived PDF is what the project stores, base64 encoded.
    const document = createTiffDocumentRef({
      name: "Colour plan.tif",
      path: "/plans/Colour plan.tif",
      sha256: "abc",
      sizeBytes: source.byteLength,
      conversion,
    });
    expect(document.embeddedPdf).toBeDefined();
    const embedded = base64ToBytes(document.embeddedPdf!);
    expect(Buffer.from(embedded).equals(Buffer.from(conversion.bytes))).toBe(true);
    expect(document.storage).toBe("reference");
  });

  it("derives identical bytes for the same colour source", async () => {
    const first = await tiffToPdf(await fixture("rgb8-lzw-predictor.tif"));
    const second = await tiffToPdf(await fixture("rgb8-lzw-predictor.tif"));
    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(true);
  });
});

import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName, PDFNumber, type PDFRawStream } from "pdf-lib";
import { unzlibSync } from "fflate";
import { t } from "../src/i18n";
import { readTiff, type TiffPage } from "../src/io/tiff";
import { assertDecodablePage, decodeStrip } from "../src/io/tiff/decode";
import { tiffToPdf } from "../src/io/tiffImport";

/*
 * Fixture provenance (committed under fixtures/tiff/, all a few hundred bytes):
 *
 *   python3 + tifffile wrote the uncompressed base images with
 *   photometric min-is-black / min-is-white / rgb and fixed pixels, then
 *   libtiff `tiffcp` produced the compressed variants:
 *
 *     tiffcp -c none     base-gray8.tif gray8-none.tif
 *     tiffcp -c packbits base-gray8.tif gray8-packbits.tif
 *     tiffcp -c lzw      base-gray8.tif gray8-lzw.tif
 *     tiffcp -c zip      base-gray8.tif gray8-deflate.tif
 *     tiffcp -c zip:2    base-gray8.tif gray8-deflate-predictor.tif
 *     tiffcp -c lzw:2    base-rgb8.tif  rgb8-lzw-predictor.tif
 *     tiffcp -c zip      base-rgb8.tif  rgb8-deflate.tif
 *     tiffcp -c none     base-bilevel.tif bilevel-none.tif
 *     tiffcp -c zip      base-gray16.tif gray16-deflate.tif
 *     tiffcp gray8-lzw.tif rgb8-deflate.tif multipage-mixed.tif
 *
 *   gray4-none.tif is a hand-written 4-bit uncompressed TIFF and
 *   rgba8-none.tif is tifffile with ExtraSamples=unassociated alpha.
 *   The expected raster checksums below were computed from the base images
 *   with Python/numpy, not from the TypeScript decoder.
 */

const fixtures = path.resolve(__dirname, "../fixtures/tiff");

async function fixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtures, name)));
}

function fnv1a(data: Uint8Array): string {
  let hash = 0x2166136261;
  for (const value of data) {
    hash ^= value;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

interface DecodedPage {
  page: TiffPage;
  data: Uint8Array;
  parts: { data: Uint8Array; width: number; rows: number }[];
}

/** Decodes every strip of every page and concatenates the strips in order. */
async function decodeAll(name: string): Promise<DecodedPage[]> {
  const bytes = await fixture(name);
  const file = readTiff(bytes);
  return file.pages.map((page) => {
    const parts = page.strips.map((strip) => decodeStrip(page, strip, bytes, file.littleEndian));
    const data = new Uint8Array(parts.reduce((total, part) => total + part.data.length, 0));
    let offset = 0;
    for (const part of parts) {
      data.set(part.data, offset);
      offset += part.data.length;
    }
    return { page, data, parts };
  });
}

const GRAY8 = { name: "gray gradient", width: 32, height: 24, hash: "f8a5c9a1" };
const RGB8 = { name: "RGB pattern", width: 16, height: 12, hash: "c277fba1" };

interface ImageStream {
  name: string;
  stream: PDFRawStream;
}

async function imageStreams(pdfBytes: Uint8Array, pageIndex = 0): Promise<ImageStream[]> {
  const pdf = await PDFDocument.load(pdfBytes);
  const resources = pdf.getPages()[pageIndex].node.Resources();
  const xobjects = resources?.lookup(PDFName.of("XObject"), PDFDict);
  if (!xobjects) return [];
  return xobjects.entries().map(([name, ref]) => ({
    name: name.toString(),
    stream: pdf.context.lookup(ref) as PDFRawStream,
  }));
}

function dictNumber(stream: PDFRawStream, key: string): number {
  const value = stream.dict.get(PDFName.of(key));
  if (!(value instanceof PDFNumber)) throw new Error(`missing ${key}`);
  return value.asNumber();
}

function dictName(stream: PDFRawStream, key: string): string {
  return String(stream.dict.get(PDFName.of(key)));
}

describe("TIFF raster decoding", () => {
  it("decodes uncompressed, PackBits, LZW and Deflate grayscale identically", async () => {
    const names = ["gray8-none.tif", "gray8-packbits.tif", "gray8-lzw.tif", "gray8-deflate.tif"];
    for (const name of names) {
      const [decoded] = await decodeAll(name);
      expect(decoded.page.width).toBe(GRAY8.width);
      expect(decoded.page.height).toBe(GRAY8.height);
      expect(decoded.data).toHaveLength(GRAY8.width * GRAY8.height);
      expect(fnv1a(decoded.data), name).toBe(GRAY8.hash);
    }
  });

  it("undoes horizontal differencing for 8-bit grayscale", async () => {
    const [decoded] = await decodeAll("gray8-deflate-predictor.tif");
    expect(decoded.page.predictor).toBe(2);
    expect(fnv1a(decoded.data)).toBe(GRAY8.hash);
  });

  it("undoes horizontal differencing per RGB component", async () => {
    const [plain] = await decodeAll("rgb8-deflate.tif");
    const [predictor] = await decodeAll("rgb8-lzw-predictor.tif");
    expect(predictor.page.predictor).toBe(2);
    expect(plain.page.samplesPerPixel).toBe(3);
    expect(fnv1a(plain.data)).toBe(RGB8.hash);
    expect(fnv1a(predictor.data)).toBe(RGB8.hash);
  });

  it("decodes 1-bit, 4-bit and 16-bit samples into PDF-ready data", async () => {
    const [bilevel] = await decodeAll("bilevel-none.tif");
    expect(bilevel.page.photometric).toBe(0);
    expect(bilevel.data).toHaveLength(64);
    expect(fnv1a(bilevel.data)).toBe("578fa981");

    const [fourBit] = await decodeAll("gray4-none.tif");
    expect(fourBit.page.bitsPerSample).toBe(4);
    expect(fourBit.data).toHaveLength(64);
    expect(fnv1a(fourBit.data)).toBe("88c2e131");

    const [sixteen] = await decodeAll("gray16-deflate.tif");
    expect(sixteen.page.bitsPerSample).toBe(16);
    expect(sixteen.page.dpiKnown).toBe(true);
    expect(sixteen.page.dpiX).toBe(200);
    expect(sixteen.data).toHaveLength(128);
    expect(fnv1a(sixteen.data)).toBe("7e1b7b61");
  });

  it("composites an RGBA scan over white instead of rendering black", async () => {
    const [rgba] = await decodeAll("rgba8-none.tif");
    expect(rgba.page.samplesPerPixel).toBe(4);
    expect(rgba.page.extraSamples).toEqual([2]);
    expect(rgba.data).toHaveLength(144);
    expect(fnv1a(rgba.data)).toBe("f1dcd2be");
  });

  it("decodes a 1-bit LZW scan and inverts min-is-white data", async () => {
    const [decoded] = await decodeAll("lzw.tif");
    expect(decoded.page.compression).toBe(5);
    expect(decoded.page.photometric).toBe(0);
    expect(decoded.data).toHaveLength(384);
    expect(fnv1a(decoded.data)).toBe("b8274d6e");
  });

  it("honours fill order 2 by reversing the bits in every byte", async () => {
    const bytes = (await fixture("bilevel-none.tif")).slice();
    patchTag(bytes, 305, { tag: 266, type: 3, count: 1, value: 2 });
    const original = readTiff(bytes);
    for (const strip of original.pages[0].strips) {
      for (let index = strip.offset; index < strip.offset + strip.byteCount; index++) {
        const value = bytes[index];
        let reversed = 0;
        for (let bit = 0; bit < 8; bit++) reversed |= ((value >> bit) & 1) << (7 - bit);
        bytes[index] = reversed;
      }
    }
    const file = readTiff(bytes);
    expect(file.pages[0].fillOrder).toBe(2);
    const data = file.pages[0].strips.map(
      (strip) => decodeStrip(file.pages[0], strip, bytes, file.littleEndian).data,
    );
    const joined = new Uint8Array(data.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of data) {
      joined.set(part, offset);
      offset += part.length;
    }
    expect(fnv1a(joined)).toBe("578fa981");
  });

  it("keeps every page of a multi-page strip TIFF", async () => {
    const pages = await decodeAll("multipage-mixed.tif");
    expect(pages).toHaveLength(2);
    expect(pages[0].page.strips).toHaveLength(3);
    expect(fnv1a(pages[0].data)).toBe(GRAY8.hash);
    expect(pages[1].page.compression).toBe(8);
    expect(fnv1a(pages[1].data)).toBe(RGB8.hash);
  });
});

describe("TIFF raster PDF export", () => {
  it("writes decoded strips as FlateDecode images at the source DPI", async () => {
    const source = await fixture("gray8-lzw.tif");
    const conversion = await tiffToPdf(source);
    expect(conversion.pages).toHaveLength(1);
    expect(conversion.pages[0].widthPt).toBeCloseTo((32 / 200) * 72, 2);
    expect(conversion.pages[0].heightPt).toBeCloseTo((24 / 200) * 72, 2);
    expect(conversion.dpi).toEqual([200, 200]);

    const file = readTiff(source);
    const streams = await imageStreams(conversion.bytes);
    expect(streams).toHaveLength(3);
    streams.forEach((entry, index) => {
      expect(dictName(entry.stream, "Filter")).toBe("/FlateDecode");
      expect(dictName(entry.stream, "ColorSpace")).toBe("/DeviceGray");
      expect(dictNumber(entry.stream, "BitsPerComponent")).toBe(8);
      expect(dictNumber(entry.stream, "Width")).toBe(32);
      expect(dictNumber(entry.stream, "Height")).toBe(8);
      const strip = file.pages[0].strips[index];
      const decoded = decodeStrip(file.pages[0], strip, source, file.littleEndian);
      expect(unzlibSync(entry.stream.asUint8Array())).toEqual(decoded.data);
    });
  });

  it("writes RGB pixels and the orientation rotation", async () => {
    const conversion = await tiffToPdf(await fixture("rgb8-deflate.tif"));
    const streams = await imageStreams(conversion.bytes);
    expect(streams[0] && dictName(streams[0].stream, "ColorSpace")).toBe("/DeviceRGB");
    expect(conversion.pages[0].widthPt).toBeCloseTo((16 / 150) * 72, 3);
  });

  it("applies the TIFF orientation to a decoded page", async () => {
    const bytes = await patched("gray8-lzw.tif", [[274, { value: 6 }]]);
    const conversion = await tiffToPdf(bytes);
    expect(conversion.pages[0].rotation).toBe(90);
    const pdf = await PDFDocument.load(conversion.bytes);
    expect(pdf.getPages()[0].getRotation().angle).toBe(90);
  });

  it("keeps CCITT strips byte-for-byte", async () => {
    const source = await fixture("g4-strips.tif");
    const file = readTiff(source);
    const conversion = await tiffToPdf(source);
    const streams = await imageStreams(conversion.bytes);
    expect(streams).toHaveLength(file.pages[0].strips.length);
    streams.forEach((entry, index) => {
      expect(dictName(entry.stream, "Filter")).toBe("/CCITTFaxDecode");
      const strip = file.pages[0].strips[index];
      const original = source.subarray(strip.offset, strip.offset + strip.byteCount);
      expect(entry.stream.asUint8Array()).toEqual(original);
    });
  });

  it("produces identical bytes for identical input", async () => {
    const source = await fixture("gray8-packbits.tif");
    const first = await tiffToPdf(source);
    const second = await tiffToPdf(source.slice());
    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(true);
  });

  it("writes both pages of a multi-page TIFF", async () => {
    const conversion = await tiffToPdf(await fixture("multipage-mixed.tif"));
    expect(conversion.pages).toHaveLength(2);
    expect(conversion.bytes.byteLength).toBeGreaterThan(0);
    const pdf = await PDFDocument.load(conversion.bytes);
    expect(pdf.getPageCount()).toBe(2);
  });
});

/**
 * Rewrites an existing inline IFD entry. Fixtures keep every patched value in
 * the four-byte value slot, so no offset bookkeeping is needed.
 */
function patchTag(
  bytes: Uint8Array,
  tag: number,
  patch: { tag?: number; type?: number; count?: number; value?: number },
): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = bytes[0] === 0x49;
  const ifd = view.getUint32(4, little);
  const count = view.getUint16(ifd, little);
  for (let index = 0; index < count; index++) {
    const entry = ifd + 2 + index * 12;
    if (view.getUint16(entry, little) !== tag) continue;
    if (patch.tag !== undefined) view.setUint16(entry, patch.tag, little);
    const type = patch.type ?? view.getUint16(entry + 2, little);
    if (patch.type !== undefined) view.setUint16(entry + 2, type, little);
    if (patch.count !== undefined) view.setUint32(entry + 4, patch.count, little);
    if (patch.value !== undefined) {
      for (let byte = 0; byte < 4; byte++) bytes[entry + 8 + byte] = 0;
      if (type === 3) view.setUint16(entry + 8, patch.value, little);
      else view.setUint32(entry + 8, patch.value, little);
    }
    return bytes;
  }
  throw new Error(`tag ${tag} not found`);
}

async function patched(name: string, patches: [number, Parameters<typeof patchTag>[2]][] = []) {
  const bytes = (await fixture(name)).slice();
  for (const [tag, patch] of patches) patchTag(bytes, tag, patch);
  return bytes;
}

/** Writes one element of an out-of-line SHORT/LONG tag array. */
function patchTagElement(bytes: Uint8Array, tag: number, index: number, value: number): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = bytes[0] === 0x49;
  const ifd = view.getUint32(4, little);
  const count = view.getUint16(ifd, little);
  for (let entryIndex = 0; entryIndex < count; entryIndex++) {
    const entry = ifd + 2 + entryIndex * 12;
    if (view.getUint16(entry, little) !== tag) continue;
    const type = view.getUint16(entry + 2, little);
    const total = view.getUint32(entry + 4, little);
    const base = total * (type === 3 ? 2 : 4) <= 4 ? entry + 8 : view.getUint32(entry + 8, little);
    if (type === 3) view.setUint16(base + index * 2, value, little);
    else view.setUint32(base + index * 4, value, little);
    return;
  }
  throw new Error(`tag ${tag} not found`);
}

describe("TIFF unsupported variants", () => {
  it.each([
    {
      title: "planar channels",
      patches: [[284, { value: 2 }]] as [number, Parameters<typeof patchTag>[2]][],
      message: () => t("tiff.planarUnsupported"),
    },
    {
      title: "palette colour",
      patches: [[262, { value: 3 }]] as [number, Parameters<typeof patchTag>[2]][],
      message: () => t("tiff.paletteUnsupported"),
    },
    {
      title: "CMYK colour",
      patches: [[262, { value: 5 }]] as [number, Parameters<typeof patchTag>[2]][],
      message: () => t("tiff.cmykUnsupported"),
    },
    {
      title: "YCbCr colour",
      patches: [[262, { value: 6 }]] as [number, Parameters<typeof patchTag>[2]][],
      message: () => t("tiff.ycbcrUnsupported"),
    },
    {
      title: "3-bit samples",
      patches: [[258, { value: 3 }]] as [number, Parameters<typeof patchTag>[2]][],
      message: () => t("tiff.unsupportedBits", { bits: 3 }),
    },
    {
      title: "two samples per pixel",
      patches: [[277, { value: 2 }]] as [number, Parameters<typeof patchTag>[2]][],
      message: () => t("tiff.unsupportedSamples", { samples: 2 }),
    },
    {
      title: "predictor 3",
      patches: [[305, { tag: 317, type: 3, count: 1, value: 3 }]] as [
        number,
        Parameters<typeof patchTag>[2],
      ][],
      message: () => t("tiff.predictorUnsupported", { predictor: 3 }),
    },
    {
      title: "predictor 2 with 4-bit samples",
      patches: [
        [258, { value: 4 }],
        [305, { tag: 317, type: 3, count: 1, value: 2 }],
      ] as [number, Parameters<typeof patchTag>[2]][],
      message: () => t("tiff.predictorBits", { bits: 4 }),
    },
    {
      title: "signed samples",
      patches: [[305, { tag: 339, type: 3, count: 1, value: 2 }]] as [
        number,
        Parameters<typeof patchTag>[2],
      ][],
      message: () => t("tiff.sampleFormatUnsupported"),
    },
    {
      title: "exotic fill order",
      patches: [[305, { tag: 266, type: 3, count: 1, value: 3 }]] as [
        number,
        Parameters<typeof patchTag>[2],
      ][],
      message: () => t("tiff.fillOrderUnsupported", { fillOrder: 3 }),
    },
  ])("rejects $title with a localized reason", async ({ patches, message }) => {
    const bytes = await patched("gray8-none.tif", patches);
    await expect(tiffToPdf(bytes)).rejects.toThrow(message());
  });

  it("rejects a decoded page above the memory limit", async () => {
    const bytes = await patched("gray8-none.tif", [
      [256, { value: 20000 }],
      [257, { value: 20000 }],
    ]);
    const file = readTiff(bytes);
    expect(() => assertDecodablePage(file.pages[0])).toThrow(
      t("tiff.decodedTooLarge", { width: 20000, height: 20000, megabytes: 256 }),
    );
  });

  it("rejects a damaged strip instead of writing a blank page", async () => {
    const bytes = await patched("gray8-lzw.tif", [[259, { value: 1 }]]);
    patchTagElement(bytes, 279, 0, 10);
    await expect(tiffToPdf(bytes)).rejects.toThrow(t("tiff.corruptData", { compression: 1 }));
  });

  it("rejects a page with no strip table", async () => {
    const bytes = await patched("gray8-none.tif", [[273, { tag: 999 }]]);
    await expect(tiffToPdf(bytes)).rejects.toThrow(t("tiff.mismatchedStrips"));
  });

  it("rejects a page with no image strips instead of writing a blank page", async () => {
    const bytes = await patched("gray8-none.tif", [
      [273, { tag: 999 }],
      [279, { tag: 998 }],
    ]);
    await expect(tiffToPdf(bytes)).rejects.toThrow(t("tiff.missingStrips"));
  });
});

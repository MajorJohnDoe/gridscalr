import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, type PDFRawStream } from "pdf-lib";
import { unzlibSync } from "fflate";
import { t } from "../src/i18n";
import { readTiff } from "../src/io/tiff";
import { tiffToPdf } from "../src/io/tiffImport";

/*
 * Fixture provenance (committed under fixtures/tiff/, a few hundred bytes each):
 *
 *   Pillow and tifffile wrote the base images from fixed pixel formulas, then
 *   libtiff `tiffcp` produced the JPEG and YCbCr variants:
 *
 *     Pillow L 24×16 gradient        gray8-jpeg-tables.tif   (JPEGTables + strip)
 *     Pillow RGB 16×16               rgb8-jpeg-rgb.tif
 *     tiffcp -c jpeg -r 16           rgb8-jpeg-strips.tif    (two YCbCr strips)
 *     Pillow CMYK 8×8                cmyk8-jpeg.tif
 *     tiffcp -c jpeg base-rgb16.tif  (not committed; wrote the YCbCr strip bytes)
 *     tifffile tile=(16,16) zlib     rgb8-tiled.tif          (40×30 page)
 *     tifffile tile=(16,16) none     bilevel-tiled.tif       (34×20 page)
 *
 *   gray8-jpeg-full.tif merges the JPEGTables stream of gray8-jpeg-tables.tif
 *   into its strip and writes a minimal TIFF without tag 347.
 *   gray8-jpeg-oldstyle.tif wraps the same complete stream in a compression-6
 *   directory whose JPEGInterchangeFormat points at it.
 *
 *   The expected rasters below are recomputed from the same pixel formulas the
 *   generator used, not from the decoder.
 */

const fixtures = path.resolve(__dirname, "../fixtures/tiff");
const GRAY = { width: 24, height: 16 };
const RGB = { width: 16, height: 16 };
const TILED = { width: 40, height: 30 };
const BILEVEL = { width: 34, height: 20 };

async function fixture(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(path.join(fixtures, name)));
}

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

function hasKey(stream: PDFRawStream, key: string): boolean {
  return stream.dict.has(PDFName.of(key));
}

function sourceBytes(source: Uint8Array, start: number, length: number): Uint8Array {
  return source.subarray(start, start + length);
}

/** The stream a strip is expected to embed when the shared tables apply. */
function composed(tables: Uint8Array, strip: Uint8Array): Uint8Array {
  const merged = new Uint8Array(tables.length - 2 + strip.length - 2);
  merged.set(tables.subarray(0, tables.length - 2), 0);
  merged.set(strip.subarray(2), tables.length - 2);
  return merged;
}

describe("JPEG-in-TIFF passthrough", () => {
  it("embeds a complete grey JPEG strip byte-for-byte through DCTDecode", async () => {
    const source = await fixture("gray8-jpeg-full.tif");
    const page = readTiff(source).pages[0];
    expect(page.compression).toBe(7);
    expect(page.jpegTables).toBeNull();
    expect(page.strips).toHaveLength(1);

    const conversion = await tiffToPdf(source);
    const streams = await imageStreams(conversion.bytes);
    expect(streams).toHaveLength(1);
    const strip = page.strips[0];
    expect(streams[0].stream.asUint8Array()).toEqual(
      sourceBytes(source, strip.offset, strip.byteCount),
    );
    expect(dictName(streams[0].stream, "Filter")).toBe("/DCTDecode");
    expect(dictName(streams[0].stream, "ColorSpace")).toBe("/DeviceGray");
    expect(dictNumber(streams[0].stream, "BitsPerComponent")).toBe(8);
    expect(dictNumber(streams[0].stream, "Width")).toBe(GRAY.width);
    expect(dictNumber(streams[0].stream, "Height")).toBe(GRAY.height);
    expect(hasKey(streams[0].stream, "Decode")).toBe(false);
    expect(conversion.pages[0].widthPt).toBeCloseTo((GRAY.width / 200) * 72, 2);
  });

  it("composes JPEGTables with the abbreviated strip and re-encodes nothing", async () => {
    const source = await fixture("gray8-jpeg-tables.tif");
    const page = readTiff(source).pages[0];
    expect(page.jpegTables).not.toBeNull();
    const tables = page.jpegTables!;
    const strip = page.strips[0];
    const complete = await fixture("gray8-jpeg-full.tif");
    const fullPage = readTiff(complete).pages[0];
    const fullStream = sourceBytes(
      complete,
      fullPage.strips[0].offset,
      fullPage.strips[0].byteCount,
    );

    const expected = composed(tables, sourceBytes(source, strip.offset, strip.byteCount));
    // The merged stream is the same JPEG the full-stream fixture carries.
    expect(expected).toEqual(fullStream);
    expect(expected[0]).toBe(0xff);
    expect(expected[1]).toBe(0xd8);
    expect(expected[expected.length - 2]).toBe(0xff);
    expect(expected[expected.length - 1]).toBe(0xd9);

    const conversion = await tiffToPdf(source);
    const [image] = await imageStreams(conversion.bytes);
    expect(image.stream.asUint8Array()).toEqual(expected);
    expect(dictName(image.stream, "Filter")).toBe("/DCTDecode");
    expect(dictNumber(image.stream, "Height")).toBe(GRAY.height);
  });

  it("embeds YCbCr JPEG strips as DeviceRGB and keeps every strip in order", async () => {
    const source = await fixture("rgb8-jpeg-strips.tif");
    const page = readTiff(source).pages[0];
    expect(page.compression).toBe(7);
    expect(page.photometric).toBe(6);
    expect(page.strips).toHaveLength(2);
    const tables = page.jpegTables!;

    const conversion = await tiffToPdf(source);
    const streams = await imageStreams(conversion.bytes);
    expect(streams).toHaveLength(2);
    streams.forEach((entry, index) => {
      const strip = page.strips[index];
      expect(entry.stream.asUint8Array()).toEqual(
        composed(tables, sourceBytes(source, strip.offset, strip.byteCount)),
      );
      expect(dictName(entry.stream, "Filter")).toBe("/DCTDecode");
      expect(dictName(entry.stream, "ColorSpace")).toBe("/DeviceRGB");
      expect(dictNumber(entry.stream, "Width")).toBe(RGB.width);
      expect(dictNumber(entry.stream, "Height")).toBe(strip.rows);
      expect(hasKey(entry.stream, "Decode")).toBe(false);
    });
    expect(streams.map((entry) => dictNumber(entry.stream, "Height"))).toEqual([16, 16]);
  });

  it("treats photometric RGB JPEG data as DeviceRGB", async () => {
    const source = await fixture("rgb8-jpeg-rgb.tif");
    const page = readTiff(source).pages[0];
    expect(page.photometric).toBe(2);
    const conversion = await tiffToPdf(source);
    const [image] = await imageStreams(conversion.bytes);
    expect(dictName(image.stream, "ColorSpace")).toBe("/DeviceRGB");
    expect(hasKey(image.stream, "Decode")).toBe(false);
  });

  it("inverts a min-is-white JPEG through the decode array", async () => {
    const bytes = await patched("gray8-jpeg-full.tif", [[262, { value: 0 }]]);
    const conversion = await tiffToPdf(bytes);
    const [image] = await imageStreams(conversion.bytes);
    expect(dictName(image.stream, "ColorSpace")).toBe("/DeviceGray");
    const decode = image.stream.dict.lookup(PDFName.of("Decode"), PDFArray);
    expect(decode.asArray().map((value) => (value as PDFNumber).asNumber())).toEqual([1, 0]);
  });

  it("passes CMYK JPEG samples through as DeviceCMYK", async () => {
    const source = await fixture("cmyk8-jpeg.tif");
    const page = readTiff(source).pages[0];
    expect(page.photometric).toBe(5);
    expect(page.samplesPerPixel).toBe(4);
    const tables = page.jpegTables!;
    const strip = page.strips[0];

    const conversion = await tiffToPdf(source);
    const [image] = await imageStreams(conversion.bytes);
    expect(dictName(image.stream, "ColorSpace")).toBe("/DeviceCMYK");
    // No Adobe APP14 marker: the samples are stored as plain CMYK.
    expect(hasKey(image.stream, "Decode")).toBe(false);
    expect(image.stream.asUint8Array()).toEqual(
      composed(tables, sourceBytes(source, strip.offset, strip.byteCount)),
    );
  });

  it("uses the old-style JPEG interchange stream for the whole page", async () => {
    const source = await fixture("gray8-jpeg-oldstyle.tif");
    const page = readTiff(source).pages[0];
    expect(page.compression).toBe(6);
    expect(page.jpegInterchange).not.toBeNull();
    const { offset, length } = page.jpegInterchange!;

    const conversion = await tiffToPdf(source);
    const [image] = await imageStreams(conversion.bytes);
    expect(image.stream.asUint8Array()).toEqual(sourceBytes(source, offset, length));
    expect(dictName(image.stream, "Filter")).toBe("/DCTDecode");
    expect(dictNumber(image.stream, "Height")).toBe(GRAY.height);
  });

  it("produces identical PDF bytes for identical JPEG input", async () => {
    const source = await fixture("gray8-jpeg-tables.tif");
    const first = await tiffToPdf(source);
    const second = await tiffToPdf(source.slice());
    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(true);
  });
});

describe("Tiled TIFF composition", () => {
  it("reads the tile grid with cropped edge tiles", async () => {
    const page = readTiff(await fixture("rgb8-tiled.tif")).pages[0];
    expect(page.tiled).toBe(true);
    expect(page.tileWidth).toBe(16);
    expect(page.tileHeight).toBe(16);
    expect(page.strips).toHaveLength(0);
    expect(page.tiles).toHaveLength(6);
    expect(
      page.tiles.map((tile) => [
        tile.column,
        tile.row,
        tile.left,
        tile.top,
        tile.width,
        tile.height,
      ]),
    ).toEqual([
      [0, 0, 0, 0, 16, 16],
      [1, 0, 16, 0, 16, 16],
      [2, 0, 32, 0, 8, 16],
      [0, 1, 0, 16, 16, 14],
      [1, 1, 16, 16, 16, 14],
      [2, 1, 32, 16, 8, 14],
    ]);
  });

  it("composes RGB tiles into exact row bands, including the edge tiles", async () => {
    const source = await fixture("rgb8-tiled.tif");
    const conversion = await tiffToPdf(source);
    const streams = await imageStreams(conversion.bytes);
    expect(streams).toHaveLength(2);
    expect(streams.map((entry) => dictNumber(entry.stream, "Height"))).toEqual([16, 14]);
    streams.forEach((entry, index) => {
      expect(dictName(entry.stream, "Filter")).toBe("/FlateDecode");
      expect(dictName(entry.stream, "ColorSpace")).toBe("/DeviceRGB");
      expect(dictNumber(entry.stream, "Width")).toBe(TILED.width);
      const top = index * 16;
      const rows = index === 0 ? 16 : 14;
      const expected = new Uint8Array(TILED.width * rows * 3);
      let write = 0;
      for (let y = top; y < top + rows; y++) {
        for (let x = 0; x < TILED.width; x++) {
          expected[write++] = (x * 7) % 256;
          expected[write++] = (y * 11) % 256;
          expected[write++] = ((x + y) * 13) % 256;
        }
      }
      expect(unzlibSync(entry.stream.asUint8Array())).toEqual(expected);
    });
    expect(conversion.pages[0].widthPt).toBeCloseTo((TILED.width / 150) * 72, 2);
    expect(conversion.pages[0].heightPt).toBeCloseTo((TILED.height / 150) * 72, 2);
  });

  it("composes packed 1-bit tiles without leaking edge padding", async () => {
    const source = await fixture("bilevel-tiled.tif");
    const page = readTiff(source).pages[0];
    expect(page.bitsPerSample).toBe(1);
    expect(page.photometric).toBe(0);
    expect(page.tiles).toHaveLength(6);

    const conversion = await tiffToPdf(source);
    const streams = await imageStreams(conversion.bytes);
    expect(streams).toHaveLength(2);
    streams.forEach((entry, index) => {
      expect(dictName(entry.stream, "Filter")).toBe("/FlateDecode");
      expect(dictNumber(entry.stream, "BitsPerComponent")).toBe(1);
      expect(dictNumber(entry.stream, "Width")).toBe(BILEVEL.width);
      const top = index * 16;
      const rows = index === 0 ? 16 : 4;
      const stride = Math.ceil(BILEVEL.width / 8);
      const expected = new Uint8Array(stride * rows);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < BILEVEL.width; x++) {
          const black = (x * 3 + (top + y) * 5) % 7 < 3;
          // Min-is-white samples are inverted so PDF grey keeps black at 0.
          if (!black) expected[y * stride + (x >> 3)] |= 1 << (7 - (x & 7));
        }
      }
      expect(unzlibSync(entry.stream.asUint8Array())).toEqual(expected);
    });
  });

  it("produces identical PDF bytes for identical tiled input", async () => {
    const source = await fixture("rgb8-tiled.tif");
    const first = await tiffToPdf(source);
    const second = await tiffToPdf(source.slice());
    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(true);
  });
});

describe("JPEG and tile unsupported variants", () => {
  it.each([
    {
      title: "missing JPEG tables",
      file: "gray8-jpeg-tables.tif",
      patches: [[347, { tag: 999 }]] as [number, Patch][],
      message: () => t("tiff.jpegTablesMissing"),
    },
    {
      title: "damaged JPEG data",
      file: "gray8-jpeg-tables.tif",
      patches: [[273, { value: 0 }]] as [number, Patch][],
      message: () => t("tiff.jpegDamaged"),
    },
    {
      title: "a JPEG frame narrower than the page",
      file: "gray8-jpeg-tables.tif",
      patches: [[256, { value: 20 }]] as [number, Patch][],
      message: () =>
        t("tiff.jpegGeometry", {
          width: 24,
          height: 16,
          expectedWidth: 20,
          expectedHeight: 16,
        }),
    },
    {
      title: "old-style JPEG without a complete stream",
      file: "gray8-jpeg-oldstyle.tif",
      patches: [
        [513, { tag: 999 }],
        [273, { value: 8 }],
      ] as [number, Patch][],
      message: () => t("tiff.jpegOldStyle"),
    },
    {
      title: "JPEG 2000 compression",
      file: "gray8-none.tif",
      patches: [[259, { value: 33005 }]] as [number, Patch][],
      message: () => t("tiff.jpeg2000"),
    },
    {
      title: "tiled JPEG",
      file: "rgb8-tiled.tif",
      patches: [[259, { value: 7 }]] as [number, Patch][],
      message: () => t("tiff.tiledJpegUnsupported"),
    },
    {
      title: "tiled CCITT fax",
      file: "bilevel-tiled.tif",
      patches: [[259, { value: 4 }]] as [number, Patch][],
      message: () => t("tiff.tiledFaxUnsupported"),
    },
    {
      title: "a mixed strip and tile layout",
      file: "rgb8-tiled.tif",
      patches: [
        [324, { tag: 273 }],
        [325, { tag: 279 }],
      ] as [number, Patch][],
      message: () => t("tiff.mixedLayout"),
    },
    {
      title: "an invalid tile grid",
      file: "rgb8-tiled.tif",
      patches: [[322, { value: 0 }]] as [number, Patch][],
      message: () => t("tiff.tileGrid"),
    },
    {
      title: "a tile count that does not cover the page",
      file: "rgb8-tiled.tif",
      patches: [[256, { value: 100 }]] as [number, Patch][],
      message: () => t("tiff.tileCountMismatch"),
    },
    {
      title: "an absurd tile grid",
      file: "rgb8-tiled.tif",
      patches: [
        [256, { value: 20000 }],
        [257, { value: 20000 }],
      ] as [number, Patch][],
      message: () => t("tiff.tooManyTiles", { tiles: 1562500, limit: 65536 }),
    },
  ])("rejects $title with a localized reason", async ({ file, patches, message }) => {
    const bytes = await patched(file, patches);
    await expect(tiffToPdf(bytes)).rejects.toThrow(message());
  });

  it("rejects a tile that points outside the file", async () => {
    const bytes = await fixture("rgb8-tiled.tif");
    patchTagElement(bytes, 325, 0, 0x7fffffff);
    await expect(tiffToPdf(bytes)).rejects.toThrow(t("tiff.tileOutside"));
  });

  it("rejects a 12-bit JPEG", async () => {
    const bytes = await fixture("gray8-jpeg-full.tif");
    const sof = findMarker(bytes, 0xc0);
    // SOF payload: precision, height (2), width (2), components.
    bytes[sof + 4] = 12;
    await expect(tiffToPdf(bytes)).rejects.toThrow(t("tiff.jpegPrecision", { bits: 12 }));
  });

  it("rejects arithmetic JPEG coding", async () => {
    const bytes = await fixture("gray8-jpeg-full.tif");
    const sof = findMarker(bytes, 0xc0);
    bytes[sof + 1] = 0xc9;
    await expect(tiffToPdf(bytes)).rejects.toThrow(t("tiff.jpegCoding", { coding: "arithmetic" }));
  });
});

interface Patch {
  tag?: number;
  type?: number;
  count?: number;
  value?: number;
}

/** Rewrites an existing inline IFD entry; fixtures keep values in the slot. */
function patchTag(bytes: Uint8Array, tag: number, patch: Patch): Uint8Array {
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

async function patched(name: string, patches: [number, Patch][] = []): Promise<Uint8Array> {
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

/** Finds the first JPEG marker segment with the given marker byte. */
function findMarker(bytes: Uint8Array, marker: number): number {
  for (let index = 0; index < bytes.length - 1; index++) {
    if (bytes[index] === 0xff && bytes[index + 1] === marker) return index;
  }
  throw new Error(`marker 0x${marker.toString(16)} not found`);
}

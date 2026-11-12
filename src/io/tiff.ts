/**
 * Minimal TIFF IFD reader. It parses directories, tags, resolution, orientation
 * and the strip or tile layout only; pixel data is decoded separately by
 * `io/tiff/decode`, `io/tiff/tiles` and `io/tiff/jpeg`. A 1-bit CCITT scan
 * therefore costs a few hundred kilobytes of memory until its strips are passed
 * through to PDF.
 */
import { t } from "../i18n";
import { TiffImportError } from "./tiff/error";
import { MAX_TIFF_TILES, TAG, readLayout, type TiffStrip, type TiffTile } from "./tiff/layout";

export { TiffImportError };
export { MAX_TIFF_TILES };
export type { TiffStrip, TiffTile };

/** A JPEG table set is a small header; anything larger is not a table set. */
export const MAX_JPEG_TABLES_BYTES = 64 * 1024;

export interface TiffPage {
  width: number;
  height: number;
  /** Bits of the first sample; kept for the 1-bit fax path. */
  bitsPerSample: number;
  /** Bits for every sample, in file order. Usually all equal. */
  bitsPerSamples: number[];
  samplesPerPixel: number;
  compression: number;
  photometric: number;
  fillOrder: number;
  planarConfig: number;
  predictor: number;
  orientation: number;
  dpiX: number;
  dpiY: number;
  dpiKnown: boolean;
  tiled: boolean;
  tileWidth: number;
  tileHeight: number;
  tiles: TiffTile[];
  /** Shared `JPEGTables` bytes for new-style JPEG strips, or null. */
  jpegTables: Uint8Array | null;
  /** Old-style JPEG (compression 6) interchange stream, or null. */
  jpegInterchange: { offset: number; length: number } | null;
  /** ExtraSamples values; 1 is premultiplied alpha and 2 is unassociated. */
  extraSamples: number[];
  sampleFormats: number[];
  strips: TiffStrip[];
}

export interface TiffFile {
  pages: TiffPage[];
  littleEndian: boolean;
}

const TYPE_SIZES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
};

/** TIFF magic bytes `II*\0` or `MM\0*`. Extensions are not trusted. */
export function isTiff(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  const big = bytes[0] === 0x4d && bytes[1] === 0x4d;
  if (!little && !big) return false;
  const magic = little ? bytes[2] | (bytes[3] << 8) : (bytes[2] << 8) | bytes[3];
  return magic === 42;
}

function makeReader(bytes: Uint8Array) {
  const little = bytes[0] === 0x49;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    little,
    view,
    u16: (offset: number) => view.getUint16(offset, little),
    u32: (offset: number) => view.getUint32(offset, little),
    i32: (offset: number) => view.getInt32(offset, little),
    f32: (offset: number) => view.getFloat32(offset, little),
    f64: (offset: number) => view.getFloat64(offset, little),
  };
}

type Reader = ReturnType<typeof makeReader>;

function readTagValues(
  reader: Reader,
  bytes: Uint8Array,
  entryOffset: number,
  type: number,
  count: number,
): number[] {
  const size = TYPE_SIZES[type];
  if (!size) return [];
  const total = size * count;
  const base = total <= 4 ? entryOffset + 8 : reader.u32(entryOffset + 8);
  if (base < 0 || base + total > bytes.length) return [];
  const values: number[] = [];
  for (let index = 0; index < count; index++) {
    const offset = base + index * size;
    switch (type) {
      case 1:
      case 2:
      case 6:
      case 7:
        values.push(bytes[offset]);
        break;
      case 3:
        values.push(reader.u16(offset));
        break;
      case 4:
        values.push(reader.u32(offset));
        break;
      case 5: {
        const denominator = reader.u32(offset + 4);
        values.push(denominator ? reader.u32(offset) / denominator : 0);
        break;
      }
      case 8:
        values.push(reader.u16(offset) - 65536 * (reader.u16(offset) >> 15));
        break;
      case 9:
        values.push(reader.i32(offset));
        break;
      case 10: {
        const denominator = reader.i32(offset + 4);
        values.push(denominator ? reader.i32(offset) / denominator : 0);
        break;
      }
      case 11:
        values.push(reader.f32(offset));
        break;
      case 12:
        values.push(reader.f64(offset));
        break;
      default:
        values.push(0);
    }
  }
  return values;
}

export function readTiff(bytes: Uint8Array): TiffFile {
  if (!isTiff(bytes)) throw new TiffImportError(t("tiff.notTiff"));
  const reader = makeReader(bytes);
  const pages: TiffPage[] = [];
  let offset = reader.u32(4);
  let guard = 0;

  while (offset !== 0) {
    if (guard++ > 512) throw new TiffImportError(t("tiff.tooManyDirectories"));
    if (offset + 2 > bytes.length) throw new TiffImportError(t("tiff.truncated"));

    const count = reader.u16(offset);
    if (offset + 2 + count * 12 > bytes.length) {
      throw new TiffImportError(t("tiff.damagedDirectory"));
    }
    const tags = new Map<number, number[]>();
    let jpegTables: Uint8Array | null = null;
    for (let index = 0; index < count; index++) {
      const entry = offset + 2 + index * 12;
      const tag = reader.u16(entry);
      const type = reader.u16(entry + 2);
      const values = reader.u32(entry + 4);
      tags.set(tag, readTagValues(reader, bytes, entry, type, values));
      if (tag === TAG.jpegTables && (type === 1 || type === 6 || type === 7)) {
        if (values > MAX_JPEG_TABLES_BYTES) {
          throw new TiffImportError(t("tiff.jpegTablesTooLarge"));
        }
        const base = values <= 4 ? entry + 8 : reader.u32(entry + 8);
        if (base >= 0 && base + values <= bytes.length) {
          jpegTables = bytes.slice(base, base + values);
        }
      }
    }

    // Bit 0 marks a reduced-resolution preview IFD. Those are never sheets.
    const newSubfileType = tags.get(TAG.newSubfileType)?.[0] ?? 0;
    const isPreview = (newSubfileType & 1) === 1;
    const width = tags.get(TAG.imageWidth)?.[0] ?? 0;
    const height = tags.get(TAG.imageLength)?.[0] ?? 0;

    if (!isPreview && width > 0 && height > 0) {
      const resolutionUnit = tags.get(TAG.resolutionUnit)?.[0] ?? 2;
      const unitScale = resolutionUnit === 3 ? 2.54 : 1;
      const rawX = tags.get(TAG.xResolution)?.[0] ?? 0;
      const rawY = tags.get(TAG.yResolution)?.[0] ?? 0;
      const dpiX = rawX > 0 ? rawX * unitScale : 0;
      const dpiY = rawY > 0 ? rawY * unitScale : 0;
      const samplesPerPixel = tags.get(TAG.samplesPerPixel)?.[0] ?? 1;
      const bitsPerSamples = tags.get(TAG.bitsPerSample) ?? [1];
      const compression = tags.get(TAG.compression)?.[0] ?? 1;
      const layout = readLayout(tags, width, height, bytes.length, compression);

      const interchangeOffset = tags.get(TAG.jpegInterchangeFormat)?.[0] ?? 0;
      const interchangeLength = tags.get(TAG.jpegInterchangeFormatLength)?.[0] ?? 0;
      const jpegInterchange =
        compression === 6 && tags.has(TAG.jpegInterchangeFormat) && interchangeLength > 0
          ? { offset: interchangeOffset, length: interchangeLength }
          : null;

      pages.push({
        width,
        height,
        bitsPerSample: bitsPerSamples[0] ?? 1,
        bitsPerSamples,
        samplesPerPixel,
        compression,
        photometric: tags.get(TAG.photometric)?.[0] ?? 0,
        fillOrder: tags.get(TAG.fillOrder)?.[0] ?? 1,
        planarConfig: tags.get(TAG.planarConfig)?.[0] ?? 1,
        predictor: tags.get(TAG.predictor)?.[0] ?? 1,
        orientation: tags.get(TAG.orientation)?.[0] ?? 1,
        dpiX: dpiX || 300,
        dpiY: dpiY || 300,
        dpiKnown: dpiX > 0 && dpiY > 0,
        tiled: layout.tiles.length > 0,
        tileWidth: layout.tileWidth,
        tileHeight: layout.tileHeight,
        tiles: layout.tiles,
        jpegTables,
        jpegInterchange,
        extraSamples: tags.get(TAG.extraSamples) ?? [],
        sampleFormats: tags.get(TAG.sampleFormat) ?? [],
        strips: layout.strips,
      });
    }

    offset = reader.u32(offset + 2 + count * 12);
  }

  if (!pages.length) throw new TiffImportError(t("tiff.noPages"));
  return { pages, littleEndian: reader.little };
}

export function pageSizePt(page: TiffPage): { width: number; height: number } {
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    width: round((page.width / page.dpiX) * 72),
    height: round((page.height / page.dpiY) * 72),
  };
}

const ORIENTATION_ROTATION: Record<number, number> = { 1: 0, 3: 180, 6: 90, 8: 270 };

export function rotationForOrientation(orientation: number): number {
  const rotation = ORIENTATION_ROTATION[orientation];
  if (rotation === undefined) {
    throw new TiffImportError(t("tiff.unsupportedOrientation", { orientation }));
  }
  return rotation;
}

export interface FaxParameters {
  /** PDF /CCITTFaxDecode K parameter: 0 for G3, -1 for G4. */
  k: number;
  compressionName: string;
  blackIs1: boolean;
}

/**
 * Validates that a page can be written losslessly as /CCITTFaxDecode.
 * Photometric 0 (WhiteIsZero) requires BlackIs1 false; the reverse renders the
 * drawing inverted. Verified against libtiff and PDF.js in spike S1.
 */
export function faxParameters(page: TiffPage): FaxParameters {
  const compression =
    page.compression === 3
      ? { k: 0, compressionName: t("tiff.ccittG3") }
      : page.compression === 4
        ? { k: -1, compressionName: t("tiff.ccittG4") }
        : null;
  if (!compression) {
    throw new TiffImportError(t("tiff.unsupportedCompression", { compression: page.compression }));
  }
  if (page.bitsPerSample !== 1 || page.samplesPerPixel !== 1 || page.planarConfig !== 1) {
    throw new TiffImportError(t("tiff.only1Bit"));
  }
  if (page.tiled) {
    throw new TiffImportError(t("tiff.tiledFaxUnsupported"));
  }
  if (page.fillOrder !== 1) {
    throw new TiffImportError(t("tiff.fillOrder2"));
  }
  if (page.predictor !== 1) {
    throw new TiffImportError(t("tiff.predictors"));
  }
  return { ...compression, blackIs1: page.photometric !== 0 };
}

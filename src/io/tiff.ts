/**
 * Minimal TIFF reader for 1-bit scanned drawings. It parses the IFD structure
 * only; pixel data is never decoded, so a 126 megapixel sheet costs a few
 * hundred kilobytes of memory.
 */

export class TiffImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TiffImportError";
  }
}

export interface TiffStrip {
  offset: number;
  byteCount: number;
  /** Row index of the first row in the strip, counted from the top. */
  top: number;
  rows: number;
}

export interface TiffPage {
  width: number;
  height: number;
  bitsPerSample: number;
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

const TAG = {
  newSubfileType: 254,
  imageWidth: 256,
  imageLength: 257,
  bitsPerSample: 258,
  compression: 259,
  photometric: 262,
  fillOrder: 266,
  stripOffsets: 273,
  orientation: 274,
  samplesPerPixel: 277,
  rowsPerStrip: 278,
  stripByteCounts: 279,
  xResolution: 282,
  yResolution: 283,
  planarConfig: 284,
  resolutionUnit: 296,
  predictor: 317,
  tileWidth: 322,
} as const;

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
  if (!isTiff(bytes)) throw new TiffImportError("This file is not a TIFF image.");
  const reader = makeReader(bytes);
  const pages: TiffPage[] = [];
  let offset = reader.u32(4);
  let guard = 0;

  while (offset !== 0) {
    if (guard++ > 512) throw new TiffImportError("This TIFF has too many image directories.");
    if (offset + 2 > bytes.length) throw new TiffImportError("This TIFF is truncated.");

    const count = reader.u16(offset);
    if (offset + 2 + count * 12 > bytes.length) {
      throw new TiffImportError("This TIFF has a damaged image directory.");
    }
    const tags = new Map<number, number[]>();
    for (let index = 0; index < count; index++) {
      const entry = offset + 2 + index * 12;
      const tag = reader.u16(entry);
      const type = reader.u16(entry + 2);
      const values = reader.u32(entry + 4);
      tags.set(tag, readTagValues(reader, bytes, entry, type, values));
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

      const rowsPerStrip = Math.max(1, tags.get(TAG.rowsPerStrip)?.[0] ?? height);
      const stripOffsets = tags.get(TAG.stripOffsets) ?? [];
      const stripByteCounts = tags.get(TAG.stripByteCounts) ?? [];
      if (stripOffsets.length !== stripByteCounts.length) {
        throw new TiffImportError("This TIFF has mismatched strip offsets and byte counts.");
      }
      const strips: TiffStrip[] = stripOffsets.map((stripOffset, index) => {
        const top = index * rowsPerStrip;
        return {
          offset: stripOffset,
          byteCount: stripByteCounts[index],
          top,
          rows: Math.min(rowsPerStrip, height - top),
        };
      });
      for (const strip of strips) {
        if (strip.offset + strip.byteCount > bytes.length) {
          throw new TiffImportError("This TIFF strip points outside the file.");
        }
      }

      pages.push({
        width,
        height,
        bitsPerSample: tags.get(TAG.bitsPerSample)?.[0] ?? 1,
        samplesPerPixel: tags.get(TAG.samplesPerPixel)?.[0] ?? 1,
        compression: tags.get(TAG.compression)?.[0] ?? 1,
        photometric: tags.get(TAG.photometric)?.[0] ?? 0,
        fillOrder: tags.get(TAG.fillOrder)?.[0] ?? 1,
        planarConfig: tags.get(TAG.planarConfig)?.[0] ?? 1,
        predictor: tags.get(TAG.predictor)?.[0] ?? 1,
        orientation: tags.get(TAG.orientation)?.[0] ?? 1,
        dpiX: dpiX || 300,
        dpiY: dpiY || 300,
        dpiKnown: dpiX > 0 && dpiY > 0,
        tiled: tags.has(TAG.tileWidth),
        strips,
      });
    }

    offset = reader.u32(offset + 2 + count * 12);
  }

  if (!pages.length) throw new TiffImportError("This TIFF contains no image pages.");
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
    throw new TiffImportError(
      `TIFF orientation ${orientation} is not supported. Supported values are 1, 3, 6 and 8.`,
    );
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
      ? { k: 0, compressionName: "CCITT G3" }
      : page.compression === 4
        ? { k: -1, compressionName: "CCITT G4" }
        : null;
  if (!compression) {
    throw new TiffImportError(
      `Unsupported TIFF compression ${page.compression}. Only CCITT G3 and G4 scanned drawings are supported.`,
    );
  }
  if (page.bitsPerSample !== 1 || page.samplesPerPixel !== 1 || page.planarConfig !== 1) {
    throw new TiffImportError(
      "Only 1-bit single-channel TIFFs are supported. Convert this file to a 1-bit scan first.",
    );
  }
  if (page.tiled) {
    throw new TiffImportError("Tiled TIFFs are not supported yet. Save this file as a stripped TIFF.");
  }
  if (page.fillOrder !== 1) {
    throw new TiffImportError("TIFF fill order 2 is not supported.");
  }
  if (page.predictor !== 1) {
    throw new TiffImportError("TIFF predictors are not supported for fax data.");
  }
  return { ...compression, blackIs1: page.photometric !== 0 };
}

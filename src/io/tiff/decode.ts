import { t } from "../../i18n";
import { TiffImportError, type TiffPage, type TiffStrip } from "../tiff";
import { decodeDeflate } from "./deflate";
import { decodeLzw } from "./lzw";
import { decodePackBits } from "./packbits";
import { undoHorizontalPredictor } from "./predictor";

/** One strip converted into PDF-ready samples. */
export interface DecodedStrip {
  data: Uint8Array;
  width: number;
  rows: number;
  bitsPerComponent: 1 | 8;
  colorSpace: "DeviceGray" | "DeviceRGB";
}

/**
 * Upper bound for the decoded raster of one page. Colour scans are expanded to
 * one byte per component, so the limit is checked before a strip is allocated.
 */
export const MAX_DECODED_RASTER_BYTES = 256 * 1024 * 1024;

const UNCOMPRESSED = 1;
const PACKBITS = 32773;
const LZW = 5;
const DEFLATE = 8;
const DEFLATE_LEGACY = 32946;
const SUPPORTED_COMPRESSIONS = new Set([UNCOMPRESSED, PACKBITS, LZW, DEFLATE, DEFLATE_LEGACY]);
const SUPPORTED_BITS = new Set([1, 2, 4, 8, 16]);
const SCALE: Record<number, number[]> = {
  1: [0, 255],
  2: [0, 85, 170, 255],
  4: Array.from({ length: 16 }, (_, value) => value * 17),
};
const BIT_REVERSED = new Uint8Array(256);
for (let value = 0; value < 256; value++) {
  let reversed = 0;
  for (let bit = 0; bit < 8; bit++) reversed |= ((value >> bit) & 1) << (7 - bit);
  BIT_REVERSED[value] = reversed;
}

export function isFaxCompression(compression: number): boolean {
  return compression === 3 || compression === 4;
}

function uniformBits(page: TiffPage): number {
  const declared = page.bitsPerSamples.length ? page.bitsPerSamples : [page.bitsPerSample];
  if (declared.length === 1) return declared[0];
  return declared.every((bits) => bits === declared[0]) ? declared[0] : 0;
}

/**
 * Rejects every page the raster pipeline cannot represent, before a strip is
 * decoded. Each reason names the tag value so the message is actionable.
 */
export function assertDecodablePage(page: TiffPage): void {
  if (page.tiled) throw new TiffImportError(t("tiff.tiledUnsupported"));
  if (!SUPPORTED_COMPRESSIONS.has(page.compression)) {
    if (page.compression === 6 || page.compression === 7) {
      throw new TiffImportError(t("tiff.jpegUnsupported"));
    }
    throw new TiffImportError(t("tiff.unsupportedCompression", { compression: page.compression }));
  }
  if (page.planarConfig !== 1) throw new TiffImportError(t("tiff.planarUnsupported"));
  if (page.fillOrder !== 1 && page.fillOrder !== 2) {
    throw new TiffImportError(t("tiff.fillOrderUnsupported", { fillOrder: page.fillOrder }));
  }

  const bits = uniformBits(page);
  const declared = page.bitsPerSamples.length ? page.bitsPerSamples : [page.bitsPerSample];
  if (!SUPPORTED_BITS.has(bits)) {
    throw new TiffImportError(t("tiff.unsupportedBits", { bits: declared.join("/") || bits }));
  }
  const samples = page.samplesPerPixel;
  if (samples !== 1 && samples !== 3 && samples !== 4) {
    throw new TiffImportError(t("tiff.unsupportedSamples", { samples }));
  }

  if (page.photometric === 3) throw new TiffImportError(t("tiff.paletteUnsupported"));
  if (page.photometric === 5) throw new TiffImportError(t("tiff.cmykUnsupported"));
  if (page.photometric === 6) throw new TiffImportError(t("tiff.ycbcrUnsupported"));
  const validPhotometric = samples === 1 ? page.photometric <= 1 : page.photometric === 2;
  if (!validPhotometric) {
    throw new TiffImportError(t("tiff.photometricUnsupported", { photometric: page.photometric }));
  }
  if (page.sampleFormats.some((format) => format !== 1)) {
    throw new TiffImportError(t("tiff.sampleFormatUnsupported"));
  }

  if (page.predictor !== 1 && page.predictor !== 2) {
    throw new TiffImportError(t("tiff.predictorUnsupported", { predictor: page.predictor }));
  }
  if (page.predictor === 2 && bits < 8) {
    throw new TiffImportError(t("tiff.predictorBits", { bits }));
  }

  const rowBytes =
    bits === 1 && samples === 1
      ? Math.ceil(page.width / 8)
      : page.width * (samples === 4 ? 3 : samples);
  if (rowBytes * page.height > MAX_DECODED_RASTER_BYTES) {
    throw new TiffImportError(
      t("tiff.decodedTooLarge", {
        width: page.width,
        height: page.height,
        megabytes: Math.round(MAX_DECODED_RASTER_BYTES / (1024 * 1024)),
      }),
    );
  }
}

function decodeCompressed(page: TiffPage, input: Uint8Array, expected: number): Uint8Array {
  const compression = page.compression;
  if (compression === UNCOMPRESSED) {
    if (input.length < expected) {
      throw new TiffImportError(t("tiff.corruptData", { compression }));
    }
    return input.slice(0, expected);
  }
  const decoded =
    compression === PACKBITS
      ? decodePackBits(input, expected)
      : compression === LZW
        ? decodeLzw(input, expected)
        : decodeDeflate(input, expected);
  if (decoded.length < expected) {
    throw new TiffImportError(t("tiff.corruptData", { compression }));
  }
  return decoded;
}

/** Fill order 2 stores the most significant bit last, so reverse every byte. */
function reverseFillOrder(data: Uint8Array, rowBytes: number, rows: number): void {
  for (let row = 0; row < rows; row++) {
    const base = row * rowBytes;
    for (let index = 0; index < rowBytes; index++)
      data[base + index] = BIT_REVERSED[data[base + index]];
  }
}

/** Decodes one strip into PDF-ready samples. Call `assertDecodablePage` first. */
export function decodeStrip(
  page: TiffPage,
  strip: TiffStrip,
  bytes: Uint8Array,
  littleEndian: boolean,
): DecodedStrip {
  const bits = uniformBits(page);
  const samples = page.samplesPerPixel;
  const bytesPerRow = Math.ceil((page.width * bits * samples) / 8);
  const expected = strip.rows * bytesPerRow;
  if (expected <= 0) throw new TiffImportError(t("tiff.damagedDirectory"));

  const input = bytes.subarray(strip.offset, strip.offset + strip.byteCount);
  const data = decodeCompressed(page, input, expected);
  if (page.predictor === 2) {
    undoHorizontalPredictor(data, {
      width: page.width,
      rows: strip.rows,
      bitsPerSample: bits,
      samplesPerPixel: samples,
      littleEndian,
    });
  }
  if (page.fillOrder === 2 && bits < 8) {
    reverseFillOrder(data, bytesPerRow, strip.rows);
  }

  // Bilevel greyscale stays packed; PDF handles one bit per component directly.
  if (bits === 1 && samples === 1) {
    if (page.photometric === 0) {
      for (let index = 0; index < data.length; index++) data[index] = ~data[index] & 0xff;
    }
    return {
      data,
      width: page.width,
      rows: strip.rows,
      bitsPerComponent: 1,
      colorSpace: "DeviceGray",
    };
  }

  const outputSamples = samples === 1 ? 1 : 3;
  const out = new Uint8Array(page.width * strip.rows * outputSamples);
  const scale = SCALE[bits];
  const highByte = (offset: number) => (littleEndian ? data[offset + 1] : data[offset]);
  const sampleAt = (base: number, index: number): number => {
    if (bits === 8) return data[base + index];
    if (bits === 16) return highByte(base + index * 2);
    const offset = index * bits;
    const value = (data[base + (offset >> 3)] >> (8 - bits - (offset & 7))) & ((1 << bits) - 1);
    return scale ? scale[value] : value;
  };
  const invert = page.photometric === 0;
  const premultiplied = (page.extraSamples[0] ?? 2) === 1;

  let write = 0;
  for (let row = 0; row < strip.rows; row++) {
    const base = row * bytesPerRow;
    if (samples === 1) {
      for (let x = 0; x < page.width; x++) {
        const value = sampleAt(base, x);
        out[write++] = invert ? 255 - value : value;
      }
      continue;
    }
    for (let x = 0; x < page.width; x++) {
      const index = x * samples;
      const alpha = samples === 4 ? sampleAt(base, index + 3) : 255;
      for (let channel = 0; channel < 3; channel++) {
        const value = sampleAt(base, index + channel);
        out[write++] = samples === 4 ? compositeOverWhite(value, alpha, premultiplied) : value;
      }
    }
  }

  return {
    data: out,
    width: page.width,
    rows: strip.rows,
    bitsPerComponent: 8,
    colorSpace: samples === 1 ? "DeviceGray" : "DeviceRGB",
  };
}

/** Composites an alpha sample over white so a transparent scan stays readable. */
function compositeOverWhite(value: number, alpha: number, premultiplied: boolean): number {
  const result = premultiplied
    ? value + (255 - alpha)
    : Math.round((value * alpha + 255 * (255 - alpha)) / 255);
  return result < 0 ? 0 : result > 255 ? 255 : result;
}

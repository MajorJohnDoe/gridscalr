import { t } from "../../i18n";
import { TiffImportError, type TiffPage } from "../tiff";

/** New-style JPEG-in-TIFF, with an optional shared `JPEGTables` stream. */
export const JPEG_NEW_STYLE = 7;
/** Old-style JPEG-in-TIFF, usually a whole-page interchange stream. */
export const JPEG_OLD_STYLE = 6;

export function isJpegCompression(compression: number): boolean {
  return compression === JPEG_NEW_STYLE || compression === JPEG_OLD_STYLE;
}

/** One JPEG stream embedded through `/DCTDecode`, never re-encoded. */
export interface JpegImage {
  data: Uint8Array;
  width: number;
  height: number;
  /** Row index of the image's first row on the page. */
  top: number;
  colorSpace: "DeviceGray" | "DeviceRGB" | "DeviceCMYK";
  /** Inverted samples for an Adobe CMYK stream; null means no decode array. */
  decode: readonly number[] | null;
}

interface JpegHeader {
  /** Frame marker, for example 0xc0 baseline or 0xc2 progressive. */
  frame: number;
  precision: number;
  width: number;
  height: number;
  components: number;
  hasQuantization: boolean;
  hasHuffman: boolean;
  hasJfif: boolean;
  /** Adobe APP14 colour transform byte, or null when the marker is absent. */
  adobeTransform: number | null;
}

interface JpegRegion {
  data: Uint8Array;
  top: number;
  rows: number;
}

const SUPPORTED_FRAMES = new Set([0xc0, 0xc1, 0xc2]);
const CODING_NAMES: Record<number, string> = {
  0xc3: "lossless",
  0xc5: "hierarchical",
  0xc6: "hierarchical",
  0xc7: "hierarchical",
  0xc9: "arithmetic",
  0xca: "arithmetic",
  0xcb: "arithmetic",
  0xcd: "arithmetic",
  0xce: "arithmetic",
  0xcf: "arithmetic",
};

function isFrameMarker(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function startsWithSoi(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0xff && data[1] === 0xd8;
}

function endsWithEoi(data: Uint8Array): boolean {
  return data.length >= 2 && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9;
}

/** Walks the marker segments before the scan to find the frame and the tables. */
function readJpegHeader(data: Uint8Array): JpegHeader {
  if (!startsWithSoi(data) || !endsWithEoi(data)) {
    throw new TiffImportError(t("tiff.jpegDamaged"));
  }
  const header: JpegHeader = {
    frame: 0,
    precision: 0,
    width: 0,
    height: 0,
    components: 0,
    hasQuantization: false,
    hasHuffman: false,
    hasJfif: false,
    adobeTransform: null,
  };

  let offset = 2;
  while (offset + 4 <= data.length) {
    if (data[offset] !== 0xff) throw new TiffImportError(t("tiff.jpegDamaged"));
    let marker = data[offset + 1];
    while (marker === 0xff && offset + 3 < data.length) {
      offset++;
      marker = data[offset + 1];
    }
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = (data[offset + 2] << 8) | data[offset + 3];
    if (length < 2 || offset + 2 + length > data.length) {
      throw new TiffImportError(t("tiff.jpegDamaged"));
    }
    const segment = data.subarray(offset + 4, offset + 2 + length);
    if (marker === 0xe0 && segment.length >= 5 && ascii(segment, 0, 5) === "JFIF\0") {
      header.hasJfif = true;
    } else if (marker === 0xee && segment.length >= 12 && ascii(segment, 0, 5) === "Adobe") {
      header.adobeTransform = segment[11];
    } else if (marker === 0xdb) {
      header.hasQuantization = true;
    } else if (marker === 0xc4) {
      header.hasHuffman = true;
    } else if (isFrameMarker(marker)) {
      const coding = CODING_NAMES[marker];
      if (coding) throw new TiffImportError(t("tiff.jpegCoding", { coding }));
      if (!SUPPORTED_FRAMES.has(marker) || segment.length < 6) {
        throw new TiffImportError(t("tiff.jpegCoding", { coding: `0x${marker.toString(16)}` }));
      }
      header.frame = marker;
      header.precision = segment[0];
      header.height = (segment[1] << 8) | segment[2];
      header.width = (segment[3] << 8) | segment[4];
      header.components = segment[5];
    }
    offset += 2 + length;
  }

  if (!header.frame) {
    throw new TiffImportError(
      t(
        header.hasQuantization || header.hasHuffman ? "tiff.jpegTablesMissing" : "tiff.jpegDamaged",
      ),
    );
  }
  return header;
}

function ascii(data: Uint8Array, start: number, length: number): string {
  let text = "";
  for (let index = start; index < start + length && index < data.length; index++) {
    text += String.fromCharCode(data[index]);
  }
  return text;
}

/** Builds the complete JPEG stream for one strip from its shared table set. */
function composeStrip(page: TiffPage, strip: Uint8Array): Uint8Array {
  const tables = page.jpegTables;
  if (!tables) return strip;
  if (!startsWithSoi(tables) || !endsWithEoi(tables) || !startsWithSoi(strip)) {
    throw new TiffImportError(t("tiff.jpegDamaged"));
  }
  // Keep the tables, drop their EOI, then append the strip without its SOI.
  const merged = new Uint8Array(tables.length - 2 + strip.length - 2);
  merged.set(tables.subarray(0, tables.length - 2), 0);
  merged.set(strip.subarray(2), tables.length - 2);
  return merged;
}

/**
 * Resolves every JPEG stream on a page. Old-style JPEG normally stores one
 * complete interchange stream for the whole page; new-style JPEG stores one
 * stream per strip, abbreviated by the shared `JPEGTables` when present.
 */
function pageRegions(page: TiffPage, bytes: Uint8Array): JpegRegion[] {
  if (page.compression === JPEG_OLD_STYLE) {
    if (page.jpegInterchange) {
      const { offset, length } = page.jpegInterchange;
      if (offset < 0 || length <= 0 || offset + length > bytes.length) {
        throw new TiffImportError(t("tiff.jpegDamaged"));
      }
      return [{ data: bytes.subarray(offset, offset + length), top: 0, rows: page.height }];
    }
    if (
      page.strips.length &&
      page.strips.every((strip) =>
        startsWithSoi(bytes.subarray(strip.offset, strip.offset + strip.byteCount)),
      )
    ) {
      return page.strips.map((strip) => ({
        data: bytes.subarray(strip.offset, strip.offset + strip.byteCount),
        top: strip.top,
        rows: strip.rows,
      }));
    }
    throw new TiffImportError(t("tiff.jpegOldStyle"));
  }

  return page.strips.map((strip) => ({
    data: composeStrip(page, bytes.subarray(strip.offset, strip.offset + strip.byteCount)),
    top: strip.top,
    rows: strip.rows,
  }));
}

/** Rejects page-level JPEG variants that cannot be embedded safely. */
export function assertJpegPage(page: TiffPage): void {
  if (page.tiled) throw new TiffImportError(t("tiff.tiledJpegUnsupported"));
  if (page.planarConfig !== 1) throw new TiffImportError(t("tiff.planarUnsupported"));
  if (page.fillOrder !== 1) {
    throw new TiffImportError(t("tiff.fillOrderUnsupported", { fillOrder: page.fillOrder }));
  }
  if (page.predictor !== 1) {
    throw new TiffImportError(t("tiff.predictorUnsupported", { predictor: page.predictor }));
  }
}

function colorSpaceFor(
  page: TiffPage,
  header: JpegHeader,
): Pick<JpegImage, "colorSpace" | "decode"> {
  const { components, hasJfif, adobeTransform } = header;
  if (components !== page.samplesPerPixel) {
    throw new TiffImportError(
      t("tiff.jpegComponents", { stream: components, samples: page.samplesPerPixel }),
    );
  }
  if (components === 1) {
    if (page.photometric !== 0 && page.photometric !== 1) {
      throw new TiffImportError(t("tiff.jpegPhotometric", { photometric: page.photometric }));
    }
    return {
      colorSpace: "DeviceGray",
      decode: page.photometric === 0 ? [1, 0] : null,
    };
  }
  if (components === 3) {
    if (page.photometric === 6) {
      // Adobe transform 0 means the components are stored as RGB, not YCbCr.
      if (adobeTransform === 0) {
        throw new TiffImportError(t("tiff.jpegPhotometric", { photometric: page.photometric }));
      }
      return { colorSpace: "DeviceRGB", decode: null };
    }
    if (page.photometric === 2) {
      // A JFIF header or transform 1 means YCbCr content in an RGB page.
      if (hasJfif || adobeTransform === 1) {
        throw new TiffImportError(t("tiff.jpegPhotometric", { photometric: page.photometric }));
      }
      return { colorSpace: "DeviceRGB", decode: null };
    }
    throw new TiffImportError(t("tiff.jpegPhotometric", { photometric: page.photometric }));
  }
  if (components === 4) {
    if (page.photometric !== 5) {
      throw new TiffImportError(t("tiff.jpegPhotometric", { photometric: page.photometric }));
    }
    if (adobeTransform !== null && adobeTransform !== 0) {
      throw new TiffImportError(t("tiff.jpegCoding", { coding: "YCCK" }));
    }
    // An Adobe marker stores CMYK inverted; a plain stream keeps its samples.
    return {
      colorSpace: "DeviceCMYK",
      decode: adobeTransform === null ? null : [1, 0, 1, 0, 1, 0, 1, 0],
    };
  }
  throw new TiffImportError(t("tiff.unsupportedSamples", { samples: components }));
}

/**
 * Returns every JPEG stream of a page, validated against the TIFF geometry.
 * The stream bytes are passed through unchanged, or with the shared tables
 * prepended; nothing is re-encoded.
 */
export function jpegImagesForPage(page: TiffPage, bytes: Uint8Array): JpegImage[] {
  return pageRegions(page, bytes).map((region) => {
    const header = readJpegHeader(region.data);
    if (header.precision !== 8) {
      throw new TiffImportError(t("tiff.jpegPrecision", { bits: header.precision }));
    }
    if (!header.hasQuantization || !header.hasHuffman) {
      throw new TiffImportError(t("tiff.jpegTablesMissing"));
    }
    if (header.width !== page.width || header.height !== region.rows) {
      throw new TiffImportError(
        t("tiff.jpegGeometry", {
          width: header.width,
          height: header.height,
          expectedWidth: page.width,
          expectedHeight: region.rows,
        }),
      );
    }
    return {
      data: region.data,
      width: header.width,
      height: header.height,
      top: region.top,
      ...colorSpaceFor(page, header),
    };
  });
}

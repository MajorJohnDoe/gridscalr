import { t } from "../../i18n";
import { TiffImportError } from "./error";

export interface TiffStrip {
  offset: number;
  byteCount: number;
  /** Row index of the first row in the strip, counted from the top. */
  top: number;
  rows: number;
}

export interface TiffTile {
  /** Row-major index in the tile grid, which is also the IFD array order. */
  index: number;
  column: number;
  row: number;
  /** Pixel position of the tile's top-left corner on the page. */
  left: number;
  top: number;
  /** Valid pixel size; the right and bottom edge tiles are cropped. */
  width: number;
  height: number;
  offset: number;
  byteCount: number;
}

/** A tile grid above this count is hostile, not a drawing. */
export const MAX_TIFF_TILES = 65536;

export const TAG = {
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
  tileLength: 323,
  tileOffsets: 324,
  tileByteCounts: 325,
  extraSamples: 338,
  sampleFormat: 339,
  jpegTables: 347,
  jpegInterchangeFormat: 513,
  jpegInterchangeFormatLength: 514,
} as const;

interface TiffLayout {
  strips: TiffStrip[];
  tiles: TiffTile[];
  tileWidth: number;
  tileHeight: number;
}

/**
 * Reads the strip or tile table and validates it against the page size. A page
 * uses exactly one layout; a stale tile tag next to a strip table is ambiguous
 * and refused rather than guessed. Old-style JPEG may have no image strip
 * because the whole image lives in the interchange stream, which the caller
 * resolves.
 */
export function readLayout(
  tags: Map<number, number[]>,
  width: number,
  height: number,
  fileLength: number,
  compression: number,
): TiffLayout {
  const stripOffsets = tags.get(TAG.stripOffsets) ?? [];
  const stripByteCounts = tags.get(TAG.stripByteCounts) ?? [];
  const tileOffsets = tags.get(TAG.tileOffsets) ?? [];
  const tileByteCounts = tags.get(TAG.tileByteCounts) ?? [];
  const hasStrips = stripOffsets.length > 0 || stripByteCounts.length > 0;
  const hasTiles =
    tags.has(TAG.tileWidth) ||
    tags.has(TAG.tileLength) ||
    tileOffsets.length > 0 ||
    tileByteCounts.length > 0;
  if (hasStrips && hasTiles) throw new TiffImportError(t("tiff.mixedLayout"));

  if (hasTiles) {
    if (tileOffsets.length !== tileByteCounts.length) {
      throw new TiffImportError(t("tiff.tileCountMismatch"));
    }
    const tileWidth = tags.get(TAG.tileWidth)?.[0] ?? 0;
    const tileHeight = tags.get(TAG.tileLength)?.[0] ?? 0;
    if (tileWidth <= 0 || tileHeight <= 0) throw new TiffImportError(t("tiff.tileGrid"));
    const columns = Math.ceil(width / tileWidth);
    const rows = Math.ceil(height / tileHeight);
    if (columns * rows > MAX_TIFF_TILES) {
      throw new TiffImportError(
        t("tiff.tooManyTiles", { tiles: columns * rows, limit: MAX_TIFF_TILES }),
      );
    }
    if (columns * rows !== tileOffsets.length) {
      throw new TiffImportError(t("tiff.tileCountMismatch"));
    }
    const tiles: TiffTile[] = tileOffsets.map((offset, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const left = column * tileWidth;
      const top = row * tileHeight;
      const tile: TiffTile = {
        index,
        column,
        row,
        left,
        top,
        width: Math.min(tileWidth, width - left),
        height: Math.min(tileHeight, height - top),
        offset,
        byteCount: tileByteCounts[index],
      };
      if (tile.offset + tile.byteCount > fileLength) {
        throw new TiffImportError(t("tiff.tileOutside"));
      }
      return tile;
    });
    return { strips: [], tiles, tileWidth, tileHeight };
  }

  if (stripOffsets.length !== stripByteCounts.length) {
    throw new TiffImportError(t("tiff.mismatchedStrips"));
  }
  if (!stripOffsets.length) {
    // Old-style JPEG may keep the whole image in JPEGInterchangeFormat, so the
    // layout is resolved by the JPEG reader, which can name the exact reason.
    if (compression === 6) return { strips: [], tiles: [], tileWidth: 0, tileHeight: 0 };
    throw new TiffImportError(t("tiff.missingStrips"));
  }
  const rowsPerStrip = Math.max(1, tags.get(TAG.rowsPerStrip)?.[0] ?? height);
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
    if (strip.offset + strip.byteCount > fileLength) {
      throw new TiffImportError(t("tiff.stripOutside"));
    }
  }
  return { strips, tiles: [], tileWidth: 0, tileHeight: 0 };
}

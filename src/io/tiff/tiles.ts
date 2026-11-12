import { t } from "../../i18n";
import { TiffImportError, type TiffPage, type TiffTile } from "../tiff";
import { decodeRegion, rasterShape, type DecodedStrip } from "./decode";

/** One composed row of tiles, ready to be written as a PDF image band. */
export interface TiledBand {
  strip: DecodedStrip;
  /** Row index of the band's first row on the page. */
  top: number;
}

/**
 * Composes a tiled TIFF into one band per tile row. Each tile is decoded with
 * its own stride and predictor restart, then copied into the band at its exact
 * pixel position. Right and bottom edge tiles are cropped to the page, so the
 * padding an encoder left in the edge tile never reaches the page raster.
 *
 * One band keeps peak memory at a single tile row instead of the whole page,
 * while the caller can still draw it with the same strip geometry as a stripped
 * page. Call `assertDecodablePage` first.
 */
export function decodeTiledPage(
  page: TiffPage,
  bytes: Uint8Array,
  littleEndian: boolean,
): TiledBand[] {
  const shape = rasterShape(page);
  const tileWidth = page.tileWidth;
  const tileHeight = page.tileHeight;
  if (tileWidth <= 0 || tileHeight <= 0) {
    throw new TiffImportError(t("tiff.tileGrid"));
  }
  const columns = Math.ceil(page.width / tileWidth);
  const tileRows = Math.ceil(page.height / tileHeight);

  const byRow: TiffTile[][] = Array.from({ length: tileRows }, () => []);
  for (const tile of page.tiles) {
    if (tile.row < 0 || tile.row >= tileRows || tile.column < 0 || tile.column >= columns) {
      throw new TiffImportError(t("tiff.tileCountMismatch"));
    }
    byRow[tile.row].push(tile);
  }

  const destStride =
    shape.bitsPerComponent === 1 ? Math.ceil(page.width / 8) : page.width * shape.components;

  return byRow.map((tiles, row) => {
    if (tiles.length !== columns) throw new TiffImportError(t("tiff.tileCountMismatch"));
    tiles.sort((left, right) => left.column - right.column);

    const top = row * tileHeight;
    const rows = Math.min(tileHeight, page.height - top);
    const data = new Uint8Array(destStride * rows);

    for (const tile of tiles) {
      if (tile.left + tile.width > page.width || tile.top + tile.height > page.height) {
        throw new TiffImportError(t("tiff.tileCountMismatch"));
      }
      const decoded = decodeRegion(
        page,
        bytes.subarray(tile.offset, tile.offset + tile.byteCount),
        tileWidth,
        tileHeight,
        littleEndian,
      );
      if (shape.bitsPerComponent === 1) {
        copyPacked(
          data,
          destStride,
          decoded.data,
          Math.ceil(tileWidth / 8),
          tile.left,
          tile.width,
          tile.height,
        );
      } else {
        copySamples(
          data,
          destStride,
          decoded.data,
          tileWidth * shape.components,
          tile.left * shape.components,
          tile.width * shape.components,
          tile.height,
        );
      }
    }

    return {
      strip: {
        data,
        width: page.width,
        rows,
        bitsPerComponent: shape.bitsPerComponent,
        colorSpace: shape.colorSpace,
      },
      top,
    };
  });
}

function copySamples(
  dest: Uint8Array,
  destStride: number,
  source: Uint8Array,
  sourceStride: number,
  destOffset: number,
  length: number,
  rows: number,
): void {
  for (let row = 0; row < rows; row++) {
    const sourceBase = row * sourceStride;
    dest.set(source.subarray(sourceBase, sourceBase + length), row * destStride + destOffset);
  }
}

/**
 * Copies a bit range inside a packed 1-bit page. `destOffset` is the page
 * column, so an edge tile lands exactly where the tile grid places it even when
 * the tile and page row strides differ.
 */
function copyPacked(
  dest: Uint8Array,
  destStride: number,
  source: Uint8Array,
  sourceStride: number,
  destOffset: number,
  width: number,
  rows: number,
): void {
  for (let row = 0; row < rows; row++) {
    const sourceBase = row * sourceStride;
    const destBase = row * destStride;
    for (let x = 0; x < width; x++) {
      const column = destOffset + x;
      const bit = (source[sourceBase + (x >> 3)] >> (7 - (x & 7))) & 1;
      const byte = destBase + (column >> 3);
      const mask = 1 << (7 - (column & 7));
      dest[byte] = bit ? dest[byte] | mask : dest[byte] & ~mask;
    }
  }
}

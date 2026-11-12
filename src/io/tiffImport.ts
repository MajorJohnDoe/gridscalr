import {
  PDFDocument,
  concatTransformationMatrix,
  degrees,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
  type PDFRef,
} from "pdf-lib";
import { bytesToBase64 } from "./base64";
import { t } from "../i18n";
import {
  TiffImportError,
  faxParameters,
  pageSizePt,
  readTiff,
  rotationForOrientation,
  type TiffPage,
} from "./tiff";
import {
  assertDecodablePage,
  decodeStrip,
  isFaxCompression,
  type DecodedStrip,
} from "./tiff/decode";
import { assertJpegPage, isJpegCompression, jpegImagesForPage, type JpegImage } from "./tiff/jpeg";
import { decodeTiledPage } from "./tiff/tiles";
import type { DocumentRef } from "../model/types";

/** A single A0 sheet at 600 DPI is about 500 megapixels; larger files are rejected. */
export const MAX_TIFF_PIXELS = 400_000_000;
export const MAX_TIFF_FILE_BYTES = 200 * 1024 * 1024;
const JPEG_2000_COMPRESSIONS = new Set([33005, 34712]);

export interface TiffPageInfo {
  widthPt: number;
  heightPt: number;
  rotation: number;
  strips: number;
  pixels: number;
  dpiKnown: boolean;
}

export interface TiffConversion {
  bytes: Uint8Array;
  pages: TiffPageInfo[];
  dpi: [number, number];
}

function assertWithinLimits(bytes: Uint8Array, pages: TiffPage[]): void {
  if (bytes.length > MAX_TIFF_FILE_BYTES) {
    throw new TiffImportError(
      t("tiff.tooLarge", {
        megabytes: Math.round(MAX_TIFF_FILE_BYTES / (1024 * 1024)),
      }),
    );
  }
  for (const page of pages) {
    if (page.width * page.height > MAX_TIFF_PIXELS) {
      throw new TiffImportError(
        t("tiff.pageTooLarge", {
          width: page.width,
          height: page.height,
          megapixels: Math.round(MAX_TIFF_PIXELS / 1_000_000),
        }),
      );
    }
  }
}

/**
 * Converts a TIFF into a PDF. 1-bit CCITT G3/G4 pages keep their compressed
 * strips byte-for-byte as `/CCITTFaxDecode` images. JPEG-in-TIFF pages
 * (compression 6/7) are embedded through `/DCTDecode` without re-encoding, with
 * their shared `JPEGTables` composed into each strip when needed. Other
 * supported codecs (none, PackBits, LZW, Deflate with horizontal
 * differencing) are decoded into `/FlateDecode` images; a tiled page is
 * composed into one image band per tile row. Each band or strip becomes its own
 * image XObject, so a large sheet never needs the whole raster in memory at
 * once.
 *
 * The output is deterministic: the same input bytes produce the same PDF bytes,
 * because no wall-clock value is written.
 */
export async function tiffToPdf(bytes: Uint8Array): Promise<TiffConversion> {
  const { pages, littleEndian } = readTiff(bytes);
  assertWithinLimits(bytes, pages);

  const pdf = await PDFDocument.create();
  pdf.setProducer("GridScalr");
  pdf.setCreator("GridScalr");
  pdf.setCreationDate(new Date(0));
  pdf.setModificationDate(new Date(0));
  const infos: TiffPageInfo[] = [];

  for (const page of pages) {
    if (JPEG_2000_COMPRESSIONS.has(page.compression)) {
      throw new TiffImportError(t("tiff.jpeg2000"));
    }
    const rotation = rotationForOrientation(page.orientation);
    const size = pageSizePt(page);
    const pdfPage = pdf.addPage([size.width, size.height]);
    if (rotation) pdfPage.setRotation(degrees(rotation));

    const scaleY = size.height / page.height;
    const drawRegion = (region: { top: number; rows: number }, name: string, ref: PDFRef) => {
      const object = pdfPage.node.newXObject(name, ref);
      pdfPage.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(
          size.width,
          0,
          0,
          region.rows * scaleY,
          0,
          (page.height - region.top - region.rows) * scaleY,
        ),
        drawObject(object),
        popGraphicsState(),
      );
    };

    if (isFaxCompression(page.compression)) {
      const fax = faxParameters(page);
      page.strips.forEach((strip, index) => {
        const data = bytes.subarray(strip.offset, strip.offset + strip.byteCount);
        const stream = pdf.context.stream(data, {
          Type: "XObject",
          Subtype: "Image",
          Width: page.width,
          Height: strip.rows,
          BitsPerComponent: 1,
          ColorSpace: "DeviceGray",
          Filter: "CCITTFaxDecode",
          DecodeParms: {
            K: fax.k,
            Columns: page.width,
            Rows: strip.rows,
            BlackIs1: fax.blackIs1,
            // TIFF strips often omit the end-of-block marker, so Rows must drive
            // the decoder. Without this PDF.js renders an empty page.
            EndOfBlock: false,
          },
        });
        const ref = pdf.context.register(stream);
        drawRegion(strip, `Fax${index}`, ref);
      });
    } else if (isJpegCompression(page.compression)) {
      assertJpegPage(page);
      jpegImagesForPage(page, bytes).forEach((image, index) => {
        const ref = pdf.context.register(jpegStream(pdf, image));
        drawRegion({ top: image.top, rows: image.height }, `Jpeg${index}`, ref);
      });
    } else if (page.tiled) {
      assertDecodablePage(page);
      const bands = decodeTiledPage(page, bytes, littleEndian);
      bands.forEach((band, index) => {
        const ref = pdf.context.register(decodedStream(pdf, band.strip));
        drawRegion({ top: band.top, rows: band.strip.rows }, `Tile${index}`, ref);
      });
    } else {
      assertDecodablePage(page);
      page.strips.forEach((strip, index) => {
        const decoded = decodeStrip(page, strip, bytes, littleEndian);
        const ref = pdf.context.register(decodedStream(pdf, decoded));
        drawRegion(strip, `Img${index}`, ref);
      });
    }

    infos.push({
      widthPt: size.width,
      heightPt: size.height,
      rotation,
      strips: page.tiles.length ? Math.ceil(page.height / page.tileHeight) : page.strips.length,
      pixels: page.width * page.height,
      dpiKnown: page.dpiKnown,
    });
  }

  const saved = await pdf.save({ useObjectStreams: false });
  const first = pages[0];
  return {
    bytes: saved instanceof Uint8Array ? saved : new Uint8Array(saved),
    pages: infos,
    dpi: [first.dpiX, first.dpiY],
  };
}

/** One JPEG strip or page as a passthrough `/DCTDecode` image XObject. */
function jpegStream(pdf: PDFDocument, image: JpegImage) {
  return pdf.context.stream(image.data, {
    Type: "XObject",
    Subtype: "Image",
    Width: image.width,
    Height: image.height,
    BitsPerComponent: 8,
    ColorSpace: image.colorSpace,
    Filter: "DCTDecode",
    ...(image.decode ? { Decode: [...image.decode] } : {}),
  });
}

/** One decoded strip as a compressed PDF image XObject. */
function decodedStream(pdf: PDFDocument, decoded: DecodedStrip) {
  return pdf.context.flateStream(decoded.data, {
    Type: "XObject",
    Subtype: "Image",
    Width: decoded.width,
    Height: decoded.rows,
    BitsPerComponent: decoded.bitsPerComponent,
    ColorSpace: decoded.colorSpace,
  });
}

export interface TiffDocumentInput {
  name: string;
  path: string | null;
  sha256: string;
  sizeBytes: number;
  conversion: TiffConversion;
}

/** Builds the project document entry for a converted TIF, including its PDF. */
export function createTiffDocumentRef(input: TiffDocumentInput): DocumentRef {
  return {
    id: `doc_tif_${Math.random().toString(36).slice(2, 10)}`,
    kind: "tiff",
    name: input.name,
    path: input.path,
    relativePath: null,
    sha256: input.sha256,
    pageCount: input.conversion.pages.length,
    sizeBytes: input.sizeBytes,
    storage: "reference",
    embeddedPdf: bytesToBase64(input.conversion.bytes),
    source: {
      format: "tiff",
      dpi: input.conversion.dpi,
      originalName: input.name,
    },
  };
}

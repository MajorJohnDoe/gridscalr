import {
  PDFDocument,
  concatTransformationMatrix,
  degrees,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from "pdf-lib";
import { bytesToBase64 } from "./base64";
import {
  TiffImportError,
  faxParameters,
  pageSizePt,
  readTiff,
  rotationForOrientation,
  type TiffPage,
} from "./tiff";
import type { DocumentRef } from "../model/types";

/** A single A0 sheet at 600 DPI is about 500 megapixels; larger files are rejected. */
export const MAX_TIFF_PIXELS = 400_000_000;
export const MAX_TIFF_FILE_BYTES = 200 * 1024 * 1024;

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
      `This TIFF is larger than ${Math.round(MAX_TIFF_FILE_BYTES / (1024 * 1024))} MB.`,
    );
  }
  for (const page of pages) {
    if (page.width * page.height > MAX_TIFF_PIXELS) {
      throw new TiffImportError(
        `Page ${page.width} × ${page.height} exceeds the ${Math.round(
          MAX_TIFF_PIXELS / 1_000_000,
        )} megapixel limit.`,
      );
    }
  }
}

/**
 * Converts a 1-bit CCITT TIFF into a PDF without decoding pixel data. Each TIFF
 * strip becomes its own `/CCITTFaxDecode` image XObject, so the file stays
 * roughly the size of the source and a 126 megapixel sheet never touches
 * JavaScript memory.
 */
export async function tiffToPdf(bytes: Uint8Array): Promise<TiffConversion> {
  const { pages } = readTiff(bytes);
  assertWithinLimits(bytes, pages);

  const pdf = await PDFDocument.create();
  pdf.setProducer("GridScalr");
  const infos: TiffPageInfo[] = [];

  for (const page of pages) {
    const fax = faxParameters(page);
    const rotation = rotationForOrientation(page.orientation);
    const size = pageSizePt(page);
    const pdfPage = pdf.addPage([size.width, size.height]);
    if (rotation) pdfPage.setRotation(degrees(rotation));

    const scaleY = size.height / page.height;
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
      const name = pdfPage.node.newXObject(`Fax${index}`, ref);
      pdfPage.pushOperators(
        pushGraphicsState(),
        concatTransformationMatrix(
          size.width,
          0,
          0,
          strip.rows * scaleY,
          0,
          (page.height - strip.top - strip.rows) * scaleY,
        ),
        drawObject(name),
        popGraphicsState(),
      );
    });

    infos.push({
      widthPt: size.width,
      heightPt: size.height,
      rotation,
      strips: page.strips.length,
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
    embeddedPdf: bytesToBase64(input.conversion.bytes),
    source: {
      format: "tiff",
      dpi: input.conversion.dpi,
      originalName: input.name,
    },
  };
}

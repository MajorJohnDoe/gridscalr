import type { PDFFont, PDFImage } from "pdf-lib";
import type { PageViewport } from "pdfjs-dist";
import type { LabelLayout } from "../../model/labelLayout";
import type { MarkupItem, Project } from "../../model/types";

export interface ExportFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}

export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
}

export type ExportImages = Map<string, PDFImage>;

export interface ExportPageContext {
  viewport: PageViewport;
  project: Project;
  fonts: ExportFonts;
  labels: Map<string, LabelLayout>;
  images: ExportImages;
}

export interface ExportItemContext extends ExportPageContext {
  item: MarkupItem;
  layerOpacity: number;
}

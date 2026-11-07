import regularFontUrl from "pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf?url";
import boldFontUrl from "pdfjs-dist/standard_fonts/LiberationSans-Bold.ttf?url";
import italicFontUrl from "pdfjs-dist/standard_fonts/LiberationSans-Italic.ttf?url";
import boldItalicFontUrl from "pdfjs-dist/standard_fonts/LiberationSans-BoldItalic.ttf?url";
import { StandardFonts, type PDFDocument, type PDFFont } from "pdf-lib";
import { t } from "../../i18n";
import type { ExportFonts } from "./types";

export async function embedFonts(pdf: PDFDocument): Promise<ExportFonts> {
  try {
    const [regular, bold, italic, boldItalic] = await Promise.all([
      fetch(regularFontUrl).then((response) => {
        if (!response.ok) throw new Error(t("pdfExport.regularFontUnavailable"));
        return response.arrayBuffer();
      }),
      fetch(boldFontUrl).then((response) => {
        if (!response.ok) throw new Error(t("pdfExport.boldFontUnavailable"));
        return response.arrayBuffer();
      }),
      fetch(italicFontUrl).then((response) => {
        if (!response.ok) throw new Error(t("pdfExport.regularFontUnavailable"));
        return response.arrayBuffer();
      }),
      fetch(boldItalicFontUrl).then((response) => {
        if (!response.ok) throw new Error(t("pdfExport.boldFontUnavailable"));
        return response.arrayBuffer();
      }),
    ]);
    return {
      regular: await pdf.embedFont(new Uint8Array(regular), { subset: true }),
      bold: await pdf.embedFont(new Uint8Array(bold), { subset: true }),
      italic: await pdf.embedFont(new Uint8Array(italic), { subset: true }),
      boldItalic: await pdf.embedFont(new Uint8Array(boldItalic), { subset: true }),
    };
  } catch {
    return {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
      boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    };
  }
}

export function runFont(fonts: ExportFonts, run: { bold: boolean; italic: boolean }): PDFFont {
  if (run.bold) return run.italic ? fonts.boldItalic : fonts.bold;
  return run.italic ? fonts.italic : fonts.regular;
}

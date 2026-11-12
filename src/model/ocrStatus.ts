import type { OcrPage } from "./types";

/**
 * True when stored OCR still belongs to the page's current source revision.
 * Shared by the search index, the OCR runner and the page status badges so the
 * three cannot disagree about staleness.
 */
export function ocrMatchesSource(
  ocr: OcrPage | undefined,
  documentSha256: string,
  sourcePage: number,
): boolean {
  if (!ocr) return false;
  return ocr.documentSha256 === documentSha256 && ocr.sourcePage === sourcePage;
}

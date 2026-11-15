import { t } from "../../i18n";
import { isDerivedPdfCacheRef } from "../../model/derivedPdf";
import type { DerivedPdfCacheRef, DocumentRef } from "../../model/types";

/**
 * Schema 26 → 27: the derived PDF of a TIF document may live in a rebuildable
 * cache instead of `embeddedPdf`.
 *
 * The migration itself adds nothing. Every schema 26 TIF keeps its embedded
 * bytes exactly as they are, so nothing renders, exports or imports
 * differently, and no project loses data. A marker found in older data is not
 * trusted, because the version it names did not exist yet. Schema 27 documents
 * keep a well-formed marker for the project doctor and the cache lifecycle.
 */

/** Reads one stored cache marker, reporting a value that cannot name a cache. */
export function normalizeDerivedPdf(
  rawValue: unknown,
  report?: (code: string) => void,
): DerivedPdfCacheRef | undefined {
  if (rawValue === undefined || rawValue === null) return undefined;
  if (!isDerivedPdfCacheRef(rawValue)) {
    report?.("droppedDerivedPdf");
    return undefined;
  }
  return {
    sourceSha256: rawValue.sourceSha256.toLowerCase(),
    converterVersion: rawValue.converterVersion,
    pageCount: rawValue.pageCount,
    relativePath: rawValue.relativePath,
  };
}

/**
 * Drops a cache marker from a project written before schema 27 and returns how
 * many were ignored. The document and its embedded PDF are untouched.
 */
export function migrateDerivedPdf(documents: readonly DocumentRef[], fromSchema: number): number {
  if (fromSchema >= 27) return 0;
  let ignored = 0;
  for (const document of documents) {
    if (!document.derivedPdf) continue;
    delete document.derivedPdf;
    ignored += 1;
  }
  return ignored;
}

/**
 * A TIF document must name one materialisation of its derived PDF: the
 * embedded bytes or a cache marker. Anything else cannot render, so it keeps
 * the existing hard error instead of opening a document with no page content.
 */
export function assertDerivedPdfSource(documents: readonly DocumentRef[]): void {
  for (const document of documents) {
    if (document.kind !== "tiff") continue;
    if (document.embeddedPdf || document.derivedPdf) continue;
    throw new Error(t("projectFile.missingEmbeddedPdf"));
  }
}

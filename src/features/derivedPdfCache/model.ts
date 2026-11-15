import { DERIVED_PDF_CONVERTER_VERSION, derivedPdfCacheIsCurrent } from "../../model/derivedPdf";
import type { DerivedPdfCacheRef, DocumentRef } from "../../model/types";

/**
 * Pure rules for the derived-PDF cache of a TIF document (schema 27).
 *
 * The cache is an artifact: it lives beside the project, is keyed by the source
 * scan, the converter version and the page count, and never becomes a source of
 * truth. Everything here is free of file I/O so the save path, the loader, the
 * package and the tests apply one rule.
 */

/** Derived bytes above this budget warn before the project limit is reached. */
export const DERIVED_CACHE_BUDGET_BYTES = 160 * 1024 * 1024;

/** Prefix of a derived cache inside a package archive. */
export const DERIVED_CACHE_ARCHIVE_PREFIX = "derived/";

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

export interface DerivedCacheBudgetInput {
  cacheBytes: number;
  projectBytes: number;
  cacheBudgetBytes?: number;
  /** The app's project-file limit, passed by the caller from `io/limits`. */
  projectLimitBytes: number;
}

export interface DerivedCacheBudget {
  cacheBytes: number;
  projectBytes: number;
  totalBytes: number;
  cacheBudgetBytes: number;
  projectLimitBytes: number;
  state: "ok" | "warning" | "over";
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/**
 * The enforced budget: a warning once the derived cache or the combined
 * footprint reaches the cache budget, and the project limit reported as an
 * overrun. The app still saves in both cases — the budget never deletes a page
 * or refuses a save that fits the existing project limit.
 */
export function evaluateDerivedCacheBudget(input: DerivedCacheBudgetInput): DerivedCacheBudget {
  const cacheBytes = nonNegative(input.cacheBytes);
  const projectBytes = nonNegative(input.projectBytes);
  const cacheBudgetBytes = nonNegative(input.cacheBudgetBytes ?? DERIVED_CACHE_BUDGET_BYTES);
  const projectLimitBytes = nonNegative(input.projectLimitBytes);
  const totalBytes = cacheBytes + projectBytes;
  const state =
    projectLimitBytes > 0 && totalBytes >= projectLimitBytes
      ? "over"
      : totalBytes >= cacheBudgetBytes || cacheBytes >= cacheBudgetBytes
        ? "warning"
        : "ok";
  return { cacheBytes, projectBytes, totalBytes, cacheBudgetBytes, projectLimitBytes, state };
}

/**
 * True when the document may be stored as a cache: a real key, and a derived PDF
 * that grew beyond its scan. A passthrough PDF (CCITT G3/G4 or JPEG-in-TIFF) is
 * about the size of the scan itself, so it stays embedded and never acquires a
 * cache entry (ADR 0015).
 */
export function canCacheDerivedPdf(document: DocumentRef): boolean {
  return (
    document.kind === "tiff" &&
    document.source?.passthrough !== true &&
    SHA256_PATTERN.test(document.sha256) &&
    Number.isInteger(document.pageCount) &&
    document.pageCount >= 1
  );
}

/** The cache key properties the document currently claims. */
export function derivedCacheKey(
  document: DocumentRef,
): { sourceSha256: string; pageCount: number } | null {
  if (!canCacheDerivedPdf(document)) return null;
  return { sourceSha256: document.sha256.toLowerCase(), pageCount: document.pageCount };
}

/** A marker for a cache this module just wrote. */
export function derivedCacheMarker(
  document: DocumentRef,
  relativePath: string,
): DerivedPdfCacheRef | null {
  const key = derivedCacheKey(document);
  if (!key) return null;
  return {
    sourceSha256: key.sourceSha256,
    converterVersion: DERIVED_PDF_CONVERTER_VERSION,
    pageCount: key.pageCount,
    relativePath,
  };
}

/**
 * True when the marker still names this document's current key, so the cache
 * may be reused without a rebuild. A missing, malformed or stale marker is a
 * rebuild, never a reason to trust older bytes.
 */
export function derivedCacheIsCurrent(document: DocumentRef): boolean {
  const marker = document.derivedPdf;
  const key = derivedCacheKey(document);
  if (!marker || !key) return false;
  return derivedPdfCacheIsCurrent(marker, key);
}

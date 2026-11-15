import type { DerivedPdfCacheRef } from "./types";

/**
 * Derived-PDF cache rules for a TIF document (schema 27).
 *
 * The cache is keyed by the source TIF checksum, the converter version and the
 * page count. The key decides whether a cache may be reused: a mismatch is a
 * rebuild, never a reason to trust older bytes. These helpers are pure so the
 * loader, the validator and the cache lifecycle all apply one rule.
 */

/**
 * Converter version that produced a TIF's derived PDF. Bump this whenever the
 * same source scan can produce different derived bytes; every existing cache
 * then fails the key check and is rebuilt.
 */
export const DERIVED_PDF_CONVERTER_VERSION = 1;

/** The current properties of a document that a cache key is checked against. */
export interface DerivedPdfCacheKey {
  /** SHA-256 of the source TIF, as stored on the document reference. */
  sourceSha256: string;
  /** Page count of the derived PDF the document expects. */
  pageCount: number;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const MAX_RELATIVE_PATH_LENGTH = 1024;

/**
 * A cache path stays inside the project's own folder tree: no absolute
 * spelling, no drive prefix and no `.` or `..` segment. The lifecycle that
 * creates the cache owns the exact naming, not this rule.
 */
function isSafeCachePath(value: string): boolean {
  if (!value.trim() || value.length > MAX_RELATIVE_PATH_LENGTH) return false;
  if (value.includes("\0")) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  if (/^[A-Za-z]:[\\/]/.test(value)) return false;
  return !value.split(/[\\/]/).some((segment) => segment === "." || segment === "..");
}

/**
 * Runtime shape check for a stored or in-memory cache marker. A marker that
 * fails this check cannot name a usable cache and is dropped with a load-report
 * entry rather than guessed at.
 */
export function isDerivedPdfCacheRef(value: unknown): value is DerivedPdfCacheRef {
  if (typeof value !== "object" || value === null) return false;
  const marker = value as Partial<Record<keyof DerivedPdfCacheRef, unknown>>;
  return (
    typeof marker.sourceSha256 === "string" &&
    SHA256_PATTERN.test(marker.sourceSha256) &&
    typeof marker.converterVersion === "number" &&
    Number.isInteger(marker.converterVersion) &&
    marker.converterVersion >= 1 &&
    typeof marker.pageCount === "number" &&
    Number.isInteger(marker.pageCount) &&
    marker.pageCount >= 1 &&
    typeof marker.relativePath === "string" &&
    isSafeCachePath(marker.relativePath)
  );
}

/**
 * True when the marker still describes the current source at the current
 * converter version, so the cache may be reused instead of rebuilt.
 */
export function derivedPdfCacheIsCurrent(
  marker: Pick<DerivedPdfCacheRef, "sourceSha256" | "converterVersion" | "pageCount">,
  key: DerivedPdfCacheKey,
  converterVersion = DERIVED_PDF_CONVERTER_VERSION,
): boolean {
  return (
    marker.converterVersion === converterVersion &&
    marker.pageCount === key.pageCount &&
    marker.sourceSha256.toLowerCase() === key.sourceSha256.toLowerCase()
  );
}

import { base64ToBytes, bytesToBase64 } from "../../io/base64";
import { fileSize, isTauri, pathExists, readFileBytes, sha256Hex } from "../../io/platform";
import { resolveRelativePath } from "../../io/projectFile";
import type { DocumentRef, Project } from "../../model/types";
import {
  canCacheDerivedPdf,
  derivedCacheIsCurrent,
  derivedCacheKey,
  derivedCacheMarker,
} from "./model";
import { writeDerivedCache } from "./files";

/**
 * The cache lifecycle for a TIF document's derived PDF.
 *
 * Every entry point applies the same order: a current cache is reused, a
 * missing or stale cache is rebuilt from the scan when the scan is reachable,
 * and only the last case — no cache and no scan — is reported to the user. A
 * rebuild writes the same verified cache the importer writes; a failure to
 * write never loses page content because the caller keeps the embedded PDF.
 *
 * A cache is only ever written from bytes the current converter produced. Bytes
 * inherited from an older release stay embedded, because stamping the current
 * converter version on them would make the key lie (ADR 0015).
 */

export interface DerivedCacheResolution {
  bytes: Uint8Array;
  source: "embedded" | "cache" | "rebuilt";
}

export interface CacheMaterialization {
  /** Caches written or refreshed from a reachable scan during this pass. */
  written: number;
  /** Documents that kept their embedded bytes because the scan was not reachable. */
  keptEmbedded: number;
  /** Cache-backed documents whose cache file could not be resolved or rebuilt. */
  unresolved: number;
  cacheBytes: number;
}

/** Every path the original scan may live at, most specific first. */
export function scanCandidates(document: DocumentRef, projectPath: string | null): string[] {
  const candidates: string[] = [];
  if (document.path) candidates.push(document.path);
  if (projectPath && document.relativePath) {
    const resolved = resolveRelativePath(projectPath, document.relativePath);
    if (resolved) candidates.push(resolved);
  }
  return [...new Set(candidates)];
}

/** The absolute path of a document's cache file, or null without a marker. */
export function derivedCachePath(document: DocumentRef, projectPath: string | null): string | null {
  if (!document.derivedPdf || !projectPath) return null;
  return resolveRelativePath(projectPath, document.derivedPdf.relativePath);
}

/**
 * Writes one derived PDF into the project's cache folder and turns the document
 * into a cache-backed one. The marker is only set after the write verified, so
 * a failed write leaves the embedded bytes in place. The caller must only pass
 * bytes produced by the current converter.
 */
export async function storeDerivedPdfCache(
  document: DocumentRef,
  projectPath: string | null,
  bytes: Uint8Array,
): Promise<boolean> {
  if (!isTauri || !projectPath || !canCacheDerivedPdf(document) || !bytes.byteLength) return false;
  const key = derivedCacheKey(document);
  if (!key) return false;
  const marker = derivedCacheMarker(document, "pending");
  if (!marker) return false;
  try {
    const info = await writeDerivedCache({
      projectPath,
      sourceSha256: key.sourceSha256,
      converterVersion: marker.converterVersion,
      pageCount: key.pageCount,
      dataBase64: bytesToBase64(bytes),
      protectedPaths: [...new Set([document.path, document.originalPath].filter(isString))],
    });
    document.derivedPdf = { ...marker, relativePath: info.relativePath };
    delete document.embeddedPdf;
    return true;
  } catch {
    return false;
  }
}

function isString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

async function readCacheFile(
  document: DocumentRef,
  projectPath: string | null,
): Promise<Uint8Array | null> {
  const path = derivedCachePath(document, projectPath);
  if (!path || !(await pathExists(path))) return null;
  try {
    const bytes = await readFileBytes(path);
    return bytes.byteLength ? bytes : null;
  } catch {
    return null;
  }
}

/** Reads a current cache file, or null when the marker is stale or unreadable. */
export async function readCurrentDerivedCache(
  document: DocumentRef,
  projectPath: string | null,
): Promise<Uint8Array | null> {
  if (!derivedCacheIsCurrent(document)) return null;
  return readCacheFile(document, projectPath);
}

/**
 * Reads a cache whose source checksum and page count still match while only the
 * converter version moved on. The drawing revision is identical, so the page can
 * open when the scan is gone; a reachable scan still triggers a rebuild first.
 */
async function readCompatibleCache(
  document: DocumentRef,
  projectPath: string | null,
): Promise<Uint8Array | null> {
  const marker = document.derivedPdf;
  const key = derivedCacheKey(document);
  if (!marker || !key) return null;
  if (marker.pageCount !== key.pageCount) return null;
  if (marker.sourceSha256.toLowerCase() !== key.sourceSha256) return null;
  return readCacheFile(document, projectPath);
}

/**
 * Builds a fresh cache from the scan. A scan whose checksum does not match the
 * document is refused: rebuilding from a different revision would silently
 * change the drawing the project measures. Returns the derived bytes on success.
 */
export async function rebuildDerivedPdfCache(
  document: DocumentRef,
  projectPath: string | null,
): Promise<Uint8Array | null> {
  const key = derivedCacheKey(document);
  if (!key || !isTauri) return null;
  for (const candidate of scanCandidates(document, projectPath)) {
    if (!(await pathExists(candidate))) continue;
    try {
      const scan = await readFileBytes(candidate);
      const hash = await sha256Hex(scan);
      if (hash.toLowerCase() !== key.sourceSha256) continue;
      const { tiffToPdf } = await import("../../io/tiffImport");
      const conversion = await tiffToPdf(scan);
      if (conversion.pages.length !== key.pageCount) continue;
      if (await storeDerivedPdfCache(document, projectPath, conversion.bytes)) {
        return conversion.bytes;
      }
      return conversion.bytes;
    } catch {
      // Try the next candidate; a missing or unreadable scan is not fatal here.
    }
  }
  return null;
}

/**
 * Resolves the derived PDF for one document: embedded bytes, a current cache,
 * a rebuilt cache, or a cache whose converter version moved on. Never returns
 * an empty buffer, so a caller cannot render a blank page from a missing file.
 */
export async function loadDerivedPdfBytes(
  document: DocumentRef,
  projectPath: string | null,
): Promise<DerivedCacheResolution | null> {
  if (document.embeddedPdf) {
    const bytes = base64ToBytes(document.embeddedPdf);
    if (bytes.byteLength) return { bytes, source: "embedded" };
  }
  if (!document.derivedPdf) return null;
  const cached = await readCurrentDerivedCache(document, projectPath);
  if (cached) return { bytes: cached, source: "cache" };
  const rebuilt = await rebuildDerivedPdfCache(document, projectPath);
  if (rebuilt) return { bytes: rebuilt, source: "rebuilt" };
  const compatible = await readCompatibleCache(document, projectPath);
  if (compatible) return { bytes: compatible, source: "cache" };
  return null;
}

/**
 * Rebuilds the cache from a scan the user located after the stored one went
 * missing. The located file must be a TIF whose checksum matches the document;
 * a mismatch is reported instead of silently changing the source.
 */
export async function rebuildFromLocatedScan(
  document: DocumentRef,
  projectPath: string | null,
  picked: { bytes: Uint8Array; path: string | null },
): Promise<"ok" | "notTiff" | "mismatch" | "failed"> {
  const { isTiff } = await import("../../io/tiff");
  if (!isTiff(picked.bytes)) return "notTiff";
  const hash = await sha256Hex(picked.bytes);
  const expected = document.sha256.toLowerCase();
  const hasExpected = /^[0-9a-f]{64}$/.test(expected);
  if (hasExpected && hash.toLowerCase() !== expected) return "mismatch";
  if (!hasExpected) document.sha256 = hash.toLowerCase();
  if (picked.path) document.path = picked.path;
  try {
    const { tiffToPdf } = await import("../../io/tiffImport");
    const conversion = await tiffToPdf(picked.bytes);
    document.pageCount = conversion.pages.length;
    if (await storeDerivedPdfCache(document, projectPath, conversion.bytes)) return "ok";
    return "failed";
  } catch {
    return "failed";
  }
}

/**
 * Saves a cache for every embedded TIF before the project is serialized, so a
 * saved colour project carries the raster once, outside its JSON. Only bytes
 * this release rebuilt from the scan are stamped with the current converter
 * version; inherited bytes stay embedded rather than pretending a version.
 */
export async function materializeProjectDerivedCaches(
  project: Project,
  projectPath: string | null,
  previousProjectPath: string | null,
): Promise<CacheMaterialization> {
  const result: CacheMaterialization = {
    written: 0,
    keptEmbedded: 0,
    unresolved: 0,
    cacheBytes: 0,
  };
  if (!isTauri || !projectPath) return result;
  for (const document of project.documents) {
    if (document.kind !== "tiff") continue;
    if (document.embeddedPdf) {
      if (!canCacheDerivedPdf(document)) {
        result.keptEmbedded += 1;
        continue;
      }
      const rebuilt = await rebuildDerivedPdfCache(document, projectPath);
      if (rebuilt) result.written += 1;
      else result.keptEmbedded += 1;
      continue;
    }
    if (!document.derivedPdf) continue;
    if (await cacheFileIsPresent(document, projectPath)) continue;
    if (await copyCacheFromFolder(document, projectPath, previousProjectPath)) continue;
    const rebuilt = await rebuildDerivedPdfCache(document, projectPath);
    if (!rebuilt) result.unresolved += 1;
  }
  result.cacheBytes = await derivedCacheBytes(project, projectPath);
  return result;
}

async function cacheFileIsPresent(
  document: DocumentRef,
  projectPath: string | null,
): Promise<boolean> {
  const path = derivedCachePath(document, projectPath);
  return path ? pathExists(path) : false;
}

/** Copies an existing cache when the project itself is saved to a new folder. */
async function copyCacheFromFolder(
  document: DocumentRef,
  projectPath: string | null,
  previousProjectPath: string | null,
): Promise<boolean> {
  if (!document.derivedPdf || !projectPath || !previousProjectPath) return false;
  if (previousProjectPath === projectPath) return false;
  const source = derivedCachePath(document, previousProjectPath);
  if (!source || !(await pathExists(source))) return false;
  try {
    const bytes = await readFileBytes(source);
    return await storeDerivedPdfCache(document, projectPath, bytes);
  } catch {
    return false;
  }
}

/** Total bytes currently held by the project's derived caches, counted once. */
export async function derivedCacheBytes(
  project: Project,
  projectPath: string | null,
): Promise<number> {
  const seen = new Set<string>();
  let total = 0;
  for (const document of project.documents) {
    const path = derivedCachePath(document, projectPath);
    if (!path || seen.has(path.toLowerCase())) continue;
    seen.add(path.toLowerCase());
    const size = await fileSize(path);
    if (size) total += size;
  }
  return total;
}

import { DERIVED_CACHE_ARCHIVE_PREFIX } from "../../derivedPdfCache";
import { documentSourceKey } from "../../sourceStorage";
import type { Project } from "../../../model/types";

const WINDOWS_RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

const encoder = new TextEncoder();

export function byteLength(value: string): number {
  return encoder.encode(value).length;
}

function truncateToBytes(value: string, maxBytes: number): string {
  if (byteLength(value) <= maxBytes) return value;
  let output = "";
  for (const character of value) {
    if (byteLength(output + character) > maxBytes) break;
    output += character;
  }
  return output;
}

/** A control character, matching Rust `char::is_control()` (C0, DEL and C1). */
export function isControlCode(code: number): boolean {
  return code < 32 || (code >= 127 && code <= 159);
}

export function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    if (isControlCode(character.codePointAt(0) ?? 0)) return true;
  }
  return false;
}

/** Removes folder parts and characters that Windows or macOS reject. */
export function safeArchiveBase(name: string, fallback = "Document"): string {
  const leaf = name.split(/[\\/]/).pop() ?? "";
  const printable = [...leaf]
    .map((character) => (isControlCode(character.codePointAt(0) ?? 0) ? "_" : character))
    .join("");
  let base = printable
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "");
  if (!base) base = fallback;
  if (WINDOWS_RESERVED.has(base.toLowerCase())) base = `_${base}`;
  base = truncateToBytes(base, 160).replace(/[. ]+$/g, "");
  return base || fallback;
}

function splitExtension(name: string): { base: string; extension: string } {
  const match = /^(.*?)(\.[A-Za-z0-9]{1,8})$/.exec(name);
  if (!match) return { base: name, extension: "" };
  return { base: match[1], extension: match[2].toLowerCase() };
}

/** Returns a unique archive file name with the requested extension. */
export function uniqueArchiveName(
  name: string,
  extension: string,
  used: Set<string>,
  fallback = "Document",
): string {
  const withoutExtension = splitExtension(name).base || name;
  const base = safeArchiveBase(withoutExtension, fallback);
  const suffix = extension.startsWith(".") ? extension : `.${extension}`;
  let candidate = `${base}${suffix}`;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${truncateToBytes(base, 150)}-${counter}${suffix}`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function scanExtension(name: string): string {
  return name.toLowerCase().endsWith(".tiff") ? ".tiff" : ".tif";
}

/**
 * Maps each PDF document id to its path inside the package. Two document
 * records that point at the same physical file (a managed copy shared by a
 * page and its duplicate, or two references to one path) share one archive
 * entry instead of duplicating the drawing.
 */
export function documentArchivePaths(project: Project): Map<string, string> {
  const used = new Set<string>();
  const paths = new Map<string, string>();
  const bySource = new Map<string, string>();
  for (const document of project.documents) {
    if (document.kind !== "pdf") continue;
    const sourceKey = documentSourceKey(document);
    const existing = bySource.get(sourceKey);
    if (existing) {
      paths.set(document.id, existing);
      continue;
    }
    const archivePath = `documents/${uniqueArchiveName(document.name, ".pdf", used, "Drawing")}`;
    bySource.set(sourceKey, archivePath);
    paths.set(document.id, archivePath);
  }
  return paths;
}

/** Maps each TIF document id to an original-scan path inside the package. */
export function sourceScanArchivePaths(project: Project): Map<string, string> {
  const used = new Set<string>();
  const paths = new Map<string, string>();
  const bySource = new Map<string, string>();
  for (const document of project.documents) {
    if (document.kind !== "tiff") continue;
    const sourceKey = documentSourceKey(document);
    const existing = bySource.get(sourceKey);
    if (existing) {
      paths.set(document.id, existing);
      continue;
    }
    const archivePath = `source-scans/${uniqueArchiveName(document.name, scanExtension(document.name), used, "Scan")}`;
    bySource.set(sourceKey, archivePath);
    paths.set(document.id, archivePath);
  }
  return paths;
}

/** Maps each cache-backed TIF document id to its cache path inside the package. */
export function derivedCacheArchivePaths(project: Project): Map<string, string> {
  const used = new Set<string>();
  const paths = new Map<string, string>();
  const bySource = new Map<string, string>();
  for (const document of project.documents) {
    if (document.kind !== "tiff" || !document.derivedPdf) continue;
    const sourceKey = documentSourceKey(document);
    const existing = bySource.get(sourceKey);
    if (existing) {
      paths.set(document.id, existing);
      continue;
    }
    const archivePath = `${DERIVED_CACHE_ARCHIVE_PREFIX}${uniqueArchiveName(
      document.name,
      ".pdf",
      used,
      "Scan",
    )}`;
    bySource.set(sourceKey, archivePath);
    paths.set(document.id, archivePath);
  }
  return paths;
}

function projectBaseName(project: Project): string {
  return safeArchiveBase(project.name.replace(/\.gridscalr$/i, "") || "Project", "Project");
}

export function suggestedProjectFileName(project: Project): string {
  return `${projectBaseName(project)}.gridscalr`;
}

export function suggestedPackageFileName(project: Project): string {
  return `${projectBaseName(project)}.gridscalr.zip`;
}

import { serializeProject } from "../../io/projectFile";
import type { Project } from "../../model/types";

export const PACKAGE_FORMAT = "gridscalr-package";
export const PACKAGE_FORMAT_VERSION = 1;
export const DESKTOP_ONLY_MESSAGE = "Project packages require the desktop app.";

export interface PackageManifestFile {
  file: string;
  sha256: string;
  sizeBytes: number;
  kind: string;
}

export interface PackageManifest {
  format: typeof PACKAGE_FORMAT;
  formatVersion: number;
  createdAt: string;
  appVersion: string;
  projectFile: string;
  projectSha256: string;
  projectSchema: number;
  documents: PackageManifestFile[];
  exports: PackageManifestFile[];
  sourceScans: PackageManifestFile[];
}

export interface PackageOptions {
  includeQuantityExports: boolean;
  includeDrawingPdf: boolean;
  includeSourceScans: boolean;
}

export const DEFAULT_PACKAGE_OPTIONS: PackageOptions = {
  includeQuantityExports: false,
  includeDrawingPdf: false,
  includeSourceScans: false,
};

export interface DocumentChecksumOverride {
  sha256: string;
  sizeBytes: number;
}

export type DocumentChecksumOverrides = Record<string, DocumentChecksumOverride>;

export interface PackageProgress {
  phase: string;
  processedBytes: number;
  totalBytes: number;
  currentFile: string;
}

export interface MissingFile {
  name: string;
  path: string;
}

export interface ChecksumMismatch {
  file: string;
  name: string;
  expected: string;
  actual: string;
  sizeBytes: number;
}

export type PackageFailure =
  | { kind: "cancelled" }
  | { kind: "missingSource"; files: MissingFile[] }
  | { kind: "checksumMismatch"; files: ChecksumMismatch[] }
  | { kind: "destinationExists"; path: string }
  | { kind: "invalidPackage"; message: string }
  | { kind: "io"; message: string }
  | { kind: "unknown"; message: string };

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

function byteLength(value: string): number {
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

/** Removes folder parts and characters that Windows or macOS reject. */
export function safeArchiveBase(name: string, fallback = "Document"): string {
  const leaf = name.split(/[\\/]/).pop() ?? "";
  const printable = [...leaf]
    .map((character) => (character.charCodeAt(0) < 32 ? "_" : character))
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

/** Maps each PDF document id to its path inside the package. */
export function documentArchivePaths(project: Project): Map<string, string> {
  const used = new Set<string>();
  const paths = new Map<string, string>();
  for (const document of project.documents) {
    if (document.kind !== "pdf") continue;
    paths.set(
      document.id,
      `documents/${uniqueArchiveName(document.name, ".pdf", used, "Drawing")}`,
    );
  }
  return paths;
}

/** Maps each TIF document id to an original-scan path inside the package. */
export function sourceScanArchivePaths(project: Project): Map<string, string> {
  const used = new Set<string>();
  const paths = new Map<string, string>();
  for (const document of project.documents) {
    if (document.kind !== "tiff") continue;
    paths.set(
      document.id,
      `source-scans/${uniqueArchiveName(document.name, scanExtension(document.name), used, "Scan")}`,
    );
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

/**
 * Builds the project file that travels inside the package. Absolute document
 * paths are cleared, PDFs point at their document archive entry, TIF documents
 * keep their embedded PDF, and accepted checksum changes only touch this copy.
 */
export function portableProjectJson(
  project: Project,
  documentPaths: Map<string, string>,
  overrides: DocumentChecksumOverrides = {},
): string {
  const copy = structuredClone(project);
  for (const document of copy.documents) {
    document.path = null;
    if (document.kind === "pdf") {
      document.relativePath = documentPaths.get(document.id) ?? null;
      const override = overrides[document.id];
      if (override) {
        document.sha256 = override.sha256;
        document.sizeBytes = override.sizeBytes;
      }
    } else {
      document.relativePath = null;
    }
  }
  return serializeProject(copy);
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

function manifestFailure(message: string): never {
  throw new Error(message);
}

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim())
    manifestFailure(`The header is missing ${field}.`);
  return value;
}

function readSize(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    manifestFailure(`The header has an invalid size for ${field}.`);
  }
  return value;
}

function readManifestFile(value: unknown, prefix: string): PackageManifestFile {
  if (typeof value !== "object" || value === null)
    manifestFailure("The header has an invalid file entry.");
  const entry = value as Partial<PackageManifestFile>;
  const file = readString(entry.file, "a file name");
  if (
    file.includes("\\") ||
    file.startsWith("/") ||
    file.split("/").some((part) => !part || part === "." || part === "..") ||
    !file.startsWith(prefix) ||
    file.slice(prefix.length).includes("/")
  ) {
    manifestFailure(`The header contains an unsafe file name: ${file}.`);
  }
  const sha256 = readString(entry.sha256, `a checksum for ${file}`);
  if (!SHA256_PATTERN.test(sha256))
    manifestFailure(`The header has an invalid checksum for ${file}.`);
  const sizeBytes = readSize(entry.sizeBytes, file);
  const kind = readString(entry.kind, `a kind for ${file}`);
  return { file, sha256: sha256.toLowerCase(), sizeBytes, kind };
}

function readManifestFiles(value: unknown, prefix: string): PackageManifestFile[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) manifestFailure(`The header has an invalid ${prefix} list.`);
  return value.map((entry) => readManifestFile(entry, prefix));
}

/** Validates the package header before the extracted project is opened. */
export function validatePackageManifest(value: unknown): PackageManifest {
  if (typeof value !== "object" || value === null)
    manifestFailure("The package header is not an object.");
  const raw = value as Partial<PackageManifest>;
  if (raw.format !== PACKAGE_FORMAT)
    manifestFailure("This ZIP is not a GridScalr project package.");
  if (raw.formatVersion !== PACKAGE_FORMAT_VERSION) {
    manifestFailure(`This package uses an unsupported format version: ${raw.formatVersion}.`);
  }
  const projectFile = readString(raw.projectFile, "the project file");
  if (
    !projectFile.endsWith(".gridscalr") ||
    projectFile.includes("/") ||
    projectFile.includes("\\") ||
    projectFile.includes("..")
  ) {
    manifestFailure("The header names an invalid project file.");
  }
  const projectSha256 = readString(raw.projectSha256, "the project checksum");
  if (!SHA256_PATTERN.test(projectSha256))
    manifestFailure("The header has an invalid project checksum.");
  if (
    typeof raw.projectSchema !== "number" ||
    !Number.isInteger(raw.projectSchema) ||
    raw.projectSchema < 1
  ) {
    manifestFailure("The header has an invalid project schema version.");
  }

  const documents = readManifestFiles(raw.documents, "documents/");
  for (const document of documents) {
    if (document.kind !== "pdf" && document.kind !== "tiff") {
      manifestFailure(`The header has an unsupported document kind: ${document.kind}.`);
    }
  }
  const exportsList = readManifestFiles(raw.exports, "exports/");
  const sourceScans = readManifestFiles(raw.sourceScans, "source-scans/");
  for (const scan of sourceScans) {
    if (scan.kind !== "tiff")
      manifestFailure(`The header has an invalid source scan: ${scan.file}.`);
  }

  const names = new Set<string>();
  for (const entry of [...documents, ...exportsList, ...sourceScans]) {
    const key = entry.file.toLowerCase();
    if (names.has(key)) manifestFailure(`The header lists ${entry.file} more than once.`);
    names.add(key);
  }
  if (
    names.has(projectFile.toLowerCase()) ||
    names.has("manifest.json") ||
    names.has("readme.txt")
  ) {
    manifestFailure("The header reuses a reserved file name.");
  }

  return {
    format: PACKAGE_FORMAT,
    formatVersion: PACKAGE_FORMAT_VERSION,
    createdAt: readString(raw.createdAt, "the creation time"),
    appVersion: readString(raw.appVersion, "the app version"),
    projectFile,
    projectSha256: projectSha256.toLowerCase(),
    projectSchema: raw.projectSchema,
    documents,
    exports: exportsList,
    sourceScans,
  };
}

/**
 * Rejects an extracted project that still carries absolute sender paths or
 * document links outside documents/. Packages created by GridScalr never do.
 */
export function validatePackagedProjectJson(json: string): void {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("The packaged project file is not valid JSON.");
  }
  if (typeof value !== "object" || value === null) {
    throw new Error("The packaged project file is not an object.");
  }
  const documents = (value as { documents?: unknown }).documents;
  if (!Array.isArray(documents)) {
    throw new Error("The packaged project file has no documents list.");
  }
  for (const document of documents) {
    if (typeof document !== "object" || document === null) continue;
    const entry = document as { path?: unknown; relativePath?: unknown; kind?: unknown };
    if (entry.path !== null && entry.path !== undefined) {
      throw new Error("The package contains an absolute document path.");
    }
    if (entry.relativePath !== null && entry.relativePath !== undefined) {
      if (
        typeof entry.relativePath !== "string" ||
        !entry.relativePath.startsWith("documents/") ||
        entry.relativePath.includes("\\") ||
        entry.relativePath.split("/").some((part) => !part || part === "." || part === "..") ||
        entry.relativePath.slice("documents/".length).includes("/")
      ) {
        throw new Error("The package contains a document link outside documents/.");
      }
    }
  }
}

export function parsePackageManifest(json: string): PackageManifest {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("The package header is not valid JSON.");
  }
  return validatePackageManifest(value);
}

/** Normalises the structured error returned by the Rust commands. */
export function normalizePackageFailure(error: unknown): PackageFailure {
  if (typeof error === "object" && error !== null && "kind" in error) {
    const value = error as Record<string, unknown>;
    const kind = String(value.kind);
    if (kind === "cancelled") return { kind: "cancelled" };
    if (kind === "missingSource" && Array.isArray(value.files)) {
      return { kind: "missingSource", files: value.files as MissingFile[] };
    }
    if (kind === "checksumMismatch" && Array.isArray(value.files)) {
      return { kind: "checksumMismatch", files: value.files as ChecksumMismatch[] };
    }
    if (kind === "destinationExists") {
      return { kind: "destinationExists", path: String(value.path ?? "") };
    }
    if (kind === "invalidPackage") {
      return {
        kind: "invalidPackage",
        message: String(value.message ?? "The package is invalid."),
      };
    }
    if (kind === "io") {
      return { kind: "io", message: String(value.message ?? "The package operation failed.") };
    }
    if (typeof value.message === "string" && value.message) {
      return { kind: "unknown", message: value.message };
    }
  }
  return {
    kind: "unknown",
    message: error instanceof Error ? error.message : String(error),
  };
}

export function describePackageFailure(failure: PackageFailure): string {
  switch (failure.kind) {
    case "missingSource":
      return `These source drawings are missing:\n${failure.files
        .map((file) => `• ${file.name} — ${file.path}`)
        .join("\n")}\n\nRelink or restore them, then package the project again.`;
    case "checksumMismatch":
      return `These drawings no longer match the checksums stored in the project:\n${failure.files
        .map((file) => `• ${file.name}`)
        .join("\n")}`;
    case "destinationExists":
      return `The folder “${failure.path}” already exists.`;
    case "invalidPackage":
    case "io":
      return failure.message;
    case "cancelled":
      return "The operation was cancelled.";
    case "unknown":
      return failure.message;
  }
}

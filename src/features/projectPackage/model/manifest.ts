import { t } from "../../../i18n";
import { DERIVED_CACHE_ARCHIVE_PREFIX } from "../../derivedPdfCache";
import { hasControlCharacter } from "./archive";
import {
  PACKAGE_FORMAT,
  PACKAGE_FORMAT_VERSION,
  type PackageManifest,
  type PackageManifestFile,
} from "./format";

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
    manifestFailure(t("package.errorInvalidFileEntry"));
  const entry = value as Partial<PackageManifestFile>;
  const file = readString(entry.file, "a file name");
  if (
    hasControlCharacter(file) ||
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
    manifestFailure(t("package.errorHeaderNotObject"));
  const raw = value as Partial<PackageManifest>;
  if (raw.format !== PACKAGE_FORMAT) manifestFailure(t("package.errorNotPackage"));
  if (raw.formatVersion !== PACKAGE_FORMAT_VERSION) {
    manifestFailure(`This package uses an unsupported format version: ${raw.formatVersion}.`);
  }
  const projectFile = readString(raw.projectFile, "the project file");
  if (
    hasControlCharacter(projectFile) ||
    !projectFile.endsWith(".gridscalr") ||
    projectFile.includes("/") ||
    projectFile.includes("\\") ||
    projectFile.includes("..")
  ) {
    manifestFailure(t("package.errorInvalidProjectFile"));
  }
  const projectSha256 = readString(raw.projectSha256, "the project checksum");
  if (!SHA256_PATTERN.test(projectSha256))
    manifestFailure(t("package.errorInvalidProjectChecksum"));
  if (
    typeof raw.projectSchema !== "number" ||
    !Number.isInteger(raw.projectSchema) ||
    raw.projectSchema < 1
  ) {
    manifestFailure(t("package.errorInvalidProjectSchema"));
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
  const derivedCaches = readManifestFiles(raw.derivedCaches, DERIVED_CACHE_ARCHIVE_PREFIX);
  for (const cache of derivedCaches) {
    if (cache.kind !== "derived")
      manifestFailure(`The header has an invalid derived cache: ${cache.file}.`);
  }

  const names = new Set<string>();
  for (const entry of [...documents, ...exportsList, ...sourceScans, ...derivedCaches]) {
    const key = entry.file.toLowerCase();
    if (names.has(key)) manifestFailure(`The header lists ${entry.file} more than once.`);
    names.add(key);
  }
  if (
    names.has(projectFile.toLowerCase()) ||
    names.has("manifest.json") ||
    names.has("readme.txt")
  ) {
    manifestFailure(t("package.errorReservedFileName"));
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
    derivedCaches,
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
    throw new Error(t("package.errorProjectNotJson"));
  }
  if (typeof value !== "object" || value === null) {
    throw new Error(t("package.errorProjectNotObject"));
  }
  const documents = (value as { documents?: unknown }).documents;
  if (!Array.isArray(documents)) {
    throw new Error(t("package.errorNoDocuments"));
  }
  for (const document of documents) {
    if (typeof document !== "object" || document === null) continue;
    const entry = document as { path?: unknown; relativePath?: unknown; kind?: unknown };
    if (entry.path !== null && entry.path !== undefined) {
      throw new Error(t("package.errorAbsolutePath"));
    }
    if (entry.relativePath !== null && entry.relativePath !== undefined) {
      if (
        typeof entry.relativePath !== "string" ||
        hasControlCharacter(entry.relativePath) ||
        !entry.relativePath.startsWith("documents/") ||
        entry.relativePath.includes("\\") ||
        entry.relativePath.split("/").some((part) => !part || part === "." || part === "..") ||
        entry.relativePath.slice("documents/".length).includes("/")
      ) {
        throw new Error(t("package.errorOutsideDocuments"));
      }
    }
    const derived = (document as { derivedPdf?: { relativePath?: unknown } }).derivedPdf;
    if (derived && derived.relativePath !== null && derived.relativePath !== undefined) {
      if (
        typeof derived.relativePath !== "string" ||
        hasControlCharacter(derived.relativePath) ||
        !derived.relativePath.startsWith(DERIVED_CACHE_ARCHIVE_PREFIX) ||
        derived.relativePath.includes("\\") ||
        derived.relativePath.split("/").some((part) => !part || part === "." || part === "..") ||
        derived.relativePath.slice(DERIVED_CACHE_ARCHIVE_PREFIX.length).includes("/")
      ) {
        throw new Error(t("package.errorOutsideDocuments"));
      }
    }
  }
}

export function parsePackageManifest(json: string): PackageManifest {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error(t("package.errorHeaderNotJson"));
  }
  return validatePackageManifest(value);
}

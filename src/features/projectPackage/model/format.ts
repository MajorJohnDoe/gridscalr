import { t } from "../../../i18n";

export const PACKAGE_FORMAT = "gridscalr-package";
export const PACKAGE_FORMAT_VERSION = 1;
/**
 * The uncompressed content cap of one package. Mirrors `MAX_TOTAL_BYTES` in
 * `src-tauri/src/package.rs`: creating a package that no extraction accepts is
 * refused before the dialog writes anything (F-044). A unit test keeps the two
 * values together.
 */
export const MAX_PACKAGE_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

export function desktopOnlyMessage(): string {
  return t("package.desktopOnly");
}

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
  /** Rebuilt PDF caches carried instead of a colour scan's original bytes. */
  derivedCaches: PackageManifestFile[];
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
  | { kind: "sourceOverwrite" }
  | { kind: "insufficientSpace"; requiredBytes: number; availableBytes: number }
  | { kind: "tooLarge"; requiredBytes: number; maxBytes: number }
  | { kind: "invalidPackage"; message: string }
  | { kind: "io"; message: string }
  | { kind: "unknown"; message: string };

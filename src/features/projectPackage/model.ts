/**
 * Pure model surface for project packages. The rules are split by concern: the
 * format constants and manifest types, safe archive naming and source paths,
 * the portable project copy, header validation and the failure description.
 * The public names stay on this surface so callers and tests keep importing
 * one module.
 */
export {
  DEFAULT_PACKAGE_OPTIONS,
  MAX_PACKAGE_TOTAL_BYTES,
  PACKAGE_FORMAT,
  PACKAGE_FORMAT_VERSION,
  desktopOnlyMessage,
} from "./model/format";
export type {
  ChecksumMismatch,
  DocumentChecksumOverride,
  DocumentChecksumOverrides,
  MissingFile,
  PackageFailure,
  PackageManifest,
  PackageManifestFile,
  PackageOptions,
  PackageProgress,
} from "./model/format";
export {
  derivedCacheArchivePaths,
  documentArchivePaths,
  safeArchiveBase,
  sourceScanArchivePaths,
  suggestedPackageFileName,
  suggestedProjectFileName,
  uniqueArchiveName,
} from "./model/archive";
export { estimatePackageBytes, portableProjectJson } from "./model/portable";
export {
  parsePackageManifest,
  validatePackageManifest,
  validatePackagedProjectJson,
} from "./model/manifest";
export { describePackageFailure, normalizePackageFailure } from "./model/failure";

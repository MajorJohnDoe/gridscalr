export { SourceStorageController } from "./controller";
export type { SourceStorageHost } from "./ports";
export {
  applyManagedCopy,
  consolidateCandidates,
  detachManagedCopy,
  documentSourceKey,
  hasConsolidatableDocuments,
  managedRelativePath,
} from "./managedCopy";
export type { ConsolidateCandidate, ManagedCopyInfo } from "./managedCopy";
export {
  detectSourceLocation,
  displayLeafName,
  documentStorage,
  isManagedDocument,
  normalizeStorageValue,
  shouldRecommendManagedCopy,
  storageModeLabelKey,
} from "./mode";
export type { SourceLocationHint, SourceLocationKind } from "./mode";
export {
  checksumMatches,
  findRelinkSource,
  pageCountChanged,
  relinkSearchFolders,
  sourceChangeActions,
} from "./relink";
export type { SourceChangeAction } from "./relink";
export { sourceFileHash } from "./files";
export type { SourceFileInfo } from "./files";

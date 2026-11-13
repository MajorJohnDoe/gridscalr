export { SourceStorageController } from "./controller";
export type { SourceStorageHost } from "./ports";
export {
  applyManagedCopy,
  consolidateCandidates,
  detachManagedCopy,
  documentSourceKey,
} from "./managedCopy";
export type { ConsolidateCandidate, ManagedCopyInfo } from "./managedCopy";
export {
  detectSourceLocation,
  documentStorage,
  isManagedDocument,
  shouldRecommendManagedCopy,
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
export { prepareReplacementDocument, preservesManagedStorage } from "./replacementCopy";
export type { ReplacementCopyRequest } from "./replacementCopy";
export { describeOutsideReferences, outsideProjectReferences } from "./outsideReferences";
export { outsideReferenceIssues } from "./outsideReferences";
export type { OutsideReference } from "./outsideReferences";

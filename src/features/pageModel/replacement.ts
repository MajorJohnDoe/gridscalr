import { makeId } from "../../model/calibration";
import { pageRecordById } from "../../model/pages";
import type { DocumentRef, PageId, PageSize, Project } from "../../model/types";

/**
 * Source replacement keeps page identity. Mapped pages move to the new document
 * while unmapped pages stay on the old reference marked `superseded`.
 *
 * Replacement does not remove the old managed file. When the replaced document
 * is a managed copy the flow copies the new source into the project so the
 * result stays managed; the previous copy becomes unreferenced and is offered
 * by the project doctor's explicit cleanup.
 */

export interface PageRemap {
  pageId: PageId;
  /** 1-based page in the replacement source. */
  newLocalPage: number;
}

export interface SourceReplacementOptions {
  documentId: string;
  /** A prepared DocumentRef for the replacement source. */
  newDocument: DocumentRef;
  mappings: readonly PageRemap[];
}

export interface SourceReplacementResult {
  /** True when the existing DocumentRef was updated in place. */
  updatedDocument: boolean;
  newDocumentId: string;
  mappedPages: number;
  supersededPages: number;
}

export function pagesForDocument(project: Project, documentId: string): PageId[] {
  return project.pages
    .filter((record) => record.documentId === documentId)
    .map((record) => record.id);
}

/**
 * One replacement document value for both the in-place and the new-record
 * branch.
 *
 * Storage mode and provenance describe the file the replacement points at, not
 * the file it replaces. A reference result therefore clears the old managed
 * copy's `originalPath`/`originalSha256` instead of inheriting them, and a
 * managed result carries the new pick's own provenance. The flow copies a
 * managed replacement into the project; this function never touches a file.
 */
function replacementDocument(
  oldDocument: DocumentRef | null,
  newDocument: DocumentRef,
  id: string,
): DocumentRef {
  const managed = newDocument.storage === "managed";
  return {
    ...(oldDocument ?? {}),
    ...newDocument,
    id,
    copiedFrom: oldDocument?.copiedFrom,
    superseded: undefined,
    storage: managed ? "managed" : "reference",
    originalPath: managed ? (newDocument.originalPath ?? null) : null,
    originalSha256: managed ? newDocument.originalSha256 : undefined,
  };
}

/**
 * Applies a replacement mapping. When every page of the old document is mapped
 * the existing reference is updated; otherwise a new DocumentRef is added and
 * the old one is kept as superseded for the remaining pages.
 */
export function applySourceReplacement(
  project: Project,
  options: SourceReplacementOptions,
): SourceReplacementResult | null {
  const oldDocument = project.documents.find((entry) => entry.id === options.documentId);
  if (!oldDocument) return null;
  const oldPageIds = pagesForDocument(project, options.documentId);
  if (!oldPageIds.length) return null;
  const newPageCount = Math.max(1, Math.round(options.newDocument.pageCount));
  const valid = options.mappings.filter(
    (mapping) =>
      oldPageIds.includes(mapping.pageId) &&
      Number.isInteger(mapping.newLocalPage) &&
      mapping.newLocalPage >= 1 &&
      mapping.newLocalPage <= newPageCount,
  );
  if (!valid.length) return null;
  const mapped = new Set(valid.map((mapping) => mapping.pageId));
  const everyMapped = oldPageIds.every((pageId) => mapped.has(pageId));

  const target: DocumentRef = everyMapped
    ? replacementDocument(oldDocument, options.newDocument, oldDocument.id)
    : replacementDocument(null, options.newDocument, options.newDocument.id || makeId("doc"));
  if (everyMapped) {
    Object.assign(oldDocument, target);
    // The mapping defines the new document's included pages; an old exclusion
    // list refers to pages that no longer exist in this source.
    delete oldDocument.excludedPages;
  } else {
    project.documents.push(target);
    const hasUnmatched = oldPageIds.some((pageId) => !mapped.has(pageId));
    if (hasUnmatched) oldDocument.superseded = true;
  }

  for (const mapping of valid) {
    const record = pageRecordById(project, mapping.pageId);
    if (!record) continue;
    record.documentId = target.id;
    record.localPage = mapping.newLocalPage;
  }
  project.updatedAt = new Date().toISOString();
  return {
    updatedDocument: everyMapped,
    newDocumentId: target.id,
    mappedPages: valid.length,
    supersededPages: oldPageIds.length - valid.length,
  };
}

/** Suggested default mapping: same source index, clamped to the new range. */
export function defaultReplacementMappings(
  project: Project,
  documentId: string,
  newPageCount: number,
): PageRemap[] {
  return pagesForDocument(project, documentId).map((pageId, index) => ({
    pageId,
    newLocalPage: Math.min(Math.max(1, index + 1), Math.max(1, newPageCount)),
  }));
}

export type ReplacementWarningCode = "pageCount" | "pageSize" | "calibration" | "scaleLocked";

export interface ReplacementWarningInput {
  oldPageCount: number;
  newPageCount: number;
  calibratedPages: number;
  scaleLockedPages: number;
  /** Mapped pages whose size differs between the old and the new source. */
  sizeChangedPages?: number;
}

/** True when two 1 pt page viewports differ beyond a rounding tolerance. */
export function pageSizeChanged(oldSize: PageSize, newSize: PageSize, tolerance = 0.5): boolean {
  return (
    Math.abs(oldSize.width - newSize.width) > tolerance ||
    Math.abs(oldSize.height - newSize.height) > tolerance
  );
}

/** Reasons the replacement dialog must warn before applying. */
export function replacementWarnings(input: ReplacementWarningInput): ReplacementWarningCode[] {
  const warnings: ReplacementWarningCode[] = [];
  if (input.oldPageCount !== input.newPageCount) warnings.push("pageCount");
  if ((input.sizeChangedPages ?? 0) > 0) warnings.push("pageSize");
  if (input.calibratedPages > 0) warnings.push("calibration");
  if (input.scaleLockedPages > 0) warnings.push("scaleLocked");
  return warnings;
}

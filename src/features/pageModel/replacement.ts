import { makeId } from "../../model/calibration";
import { pageRecordById } from "../../model/pages";
import type { DocumentRef, PageId, Project } from "../../model/types";

/**
 * Source replacement keeps page identity. Mapped pages move to the new document
 * while unmapped pages stay on the old reference marked `superseded`.
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
    ? {
        ...oldDocument,
        ...options.newDocument,
        id: oldDocument.id,
        copiedFrom: oldDocument.copiedFrom,
        superseded: undefined,
      }
    : {
        ...options.newDocument,
        id: options.newDocument.id || makeId("doc"),
        superseded: undefined,
      };
  if (everyMapped) {
    Object.assign(oldDocument, target);
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

export interface ReplacementWarningInput {
  oldPageCount: number;
  newPageCount: number;
  calibratedPages: number;
  scaleLockedPages: number;
}

/** Reasons the replacement dialog must warn before applying. */
export function replacementWarnings(input: ReplacementWarningInput): string[] {
  const warnings: string[] = [];
  if (input.oldPageCount !== input.newPageCount) warnings.push("pageCount");
  if (input.calibratedPages > 0) warnings.push("calibration");
  if (input.scaleLockedPages > 0) warnings.push("scaleLocked");
  return warnings;
}

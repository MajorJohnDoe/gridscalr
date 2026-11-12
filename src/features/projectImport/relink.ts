import type { DocumentKind, Project } from "../../model/types";
import type { ImportSourceMismatch, PreparedProjectImport } from "./model";
import type { ImportPreflight } from "./preflight";

/**
 * Per-document state for the import preflight dialog. It is derived from the
 * source project, the pages the user selected and what the loader could verify.
 * Nothing here writes to either project.
 */
export interface ImportSourceState {
  documentId: string;
  name: string;
  kind: DocumentKind;
  /** Selected source display pages that belong to this document. */
  selectedPages: number;
  /** Selected pages that will actually be added. */
  importablePages: number;
  expectedPageCount: number;
  /** Page count read from the file on disk, or null when it is missing. */
  actualPageCount: number | null;
  missing: boolean;
  checksumChanged: boolean;
  pageCountChanged: boolean;
}

export interface ImportPreflightSnapshot {
  preflight: ImportPreflight;
  sources: readonly ImportSourceState[];
}

export interface ImportPreflightSourceInput {
  source: Project;
  /** 1-based source display pages the user selected. */
  selected: readonly number[];
  /** Selected pages that could not be read and will be skipped. */
  skipped: readonly number[];
  pageCounts: ReadonlyMap<string, number>;
  mismatches: readonly ImportSourceMismatch[];
}

/** Groups the picker selection by document and pairs it with verified file facts. */
export function buildImportSourceStates(input: ImportPreflightSourceInput): ImportSourceState[] {
  const unique = [...new Set(input.selected)].sort((left, right) => left - right);
  const skipped = new Set(input.skipped);
  const selectedByDocument = new Map<string, number>();
  const importableByDocument = new Map<string, number>();
  for (const page of unique) {
    const record = input.source.pages[page - 1];
    if (!record) continue;
    selectedByDocument.set(record.documentId, (selectedByDocument.get(record.documentId) ?? 0) + 1);
    if (skipped.has(page)) continue;
    importableByDocument.set(
      record.documentId,
      (importableByDocument.get(record.documentId) ?? 0) + 1,
    );
  }
  const mismatchById = new Map(input.mismatches.map((entry) => [entry.documentId, entry]));

  return input.source.documents
    .filter((document) => selectedByDocument.has(document.id))
    .map((document) => {
      const mismatch = mismatchById.get(document.id);
      const actualPageCount = input.pageCounts.get(document.id) ?? null;
      return {
        documentId: document.id,
        name: document.name,
        kind: document.kind,
        selectedPages: selectedByDocument.get(document.id) ?? 0,
        importablePages: importableByDocument.get(document.id) ?? 0,
        expectedPageCount: document.pageCount,
        actualPageCount,
        missing: actualPageCount === null,
        checksumChanged: mismatch?.checksum ?? false,
        pageCountChanged: mismatch?.pageCount ?? false,
      };
    });
}

/** True when a document loaded but its content differs from the source project. */
export function sourceNeedsConfirmation(state: ImportSourceState): boolean {
  return !state.missing && (state.checksumChanged || state.pageCountChanged);
}

/** Changed sources that have not been explicitly accepted in this preflight. */
export function unconfirmedSources(
  sources: readonly ImportSourceState[],
  confirmed: ReadonlySet<string>,
): ImportSourceState[] {
  return sources.filter(
    (state) => sourceNeedsConfirmation(state) && !confirmed.has(state.documentId),
  );
}

export interface ImportPreflightSummary {
  pages: number;
  missingDocuments: number;
  /** Selected pages that will be skipped because their source is missing. */
  skippedPages: number;
  unconfirmedDocuments: number;
  /** No page can be imported, or a changed source is still unconfirmed. */
  blocked: boolean;
}

export function summarizeImportPreflight(
  snapshot: ImportPreflightSnapshot,
  confirmed: ReadonlySet<string>,
): ImportPreflightSummary {
  const missingDocuments = snapshot.sources.filter((state) => state.missing).length;
  const unconfirmedDocuments = unconfirmedSources(snapshot.sources, confirmed).length;
  const pages = snapshot.preflight.pages;
  return {
    pages,
    missingDocuments,
    skippedPages: snapshot.preflight.skippedPages.length,
    unconfirmedDocuments,
    blocked: pages === 0 || unconfirmedDocuments > 0,
  };
}

/** A prepared import with no pages, used when a rebuild leaves nothing to add. */
export function emptyPreparedImport(): PreparedProjectImport {
  return {
    documents: [],
    pages: [],
    createdLayers: [],
    categories: [],
    countTypes: [],
    lineTypes: [],
    assets: {},
    pageMap: [],
    activeLayerId: null,
    warnings: [],
  };
}

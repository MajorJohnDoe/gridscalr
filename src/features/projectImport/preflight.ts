import type { ImportWarning, PreparedProjectImport } from "./model";

export type PreflightSourceWarning =
  | { code: "skippedPage"; page: number; documentName: string }
  | { code: "checksum"; documentName: string }
  | { code: "pageCount"; documentName: string; expected: number; actual: number };

export interface ImportPreflightInput {
  prepared: PreparedProjectImport;
  sourceName: string;
  skipped: readonly number[];
  warnings: readonly PreflightSourceWarning[];
}

export interface ImportPageCountChange {
  name: string;
  expected: number;
  actual: number;
}

export interface ImportPreflight {
  sourceName: string;
  documents: number;
  pages: number;
  items: number;
  categories: number;
  countTypes: number;
  lineTypes: number;
  assets: number;
  /** Documents whose source file could not be read for the selected pages. */
  missingDocuments: string[];
  skippedPages: number[];
  checksumDocuments: string[];
  pageCountChanges: ImportPageCountChange[];
  /** Non-blocking warnings prepared by the import itself. */
  warnings: readonly ImportWarning[];
}

/**
 * Describes everything the import will add before any project mutation. The
 * caller can cancel at this point; nothing has been written.
 */
export function buildImportPreflight(input: ImportPreflightInput): ImportPreflight {
  const missing = new Set<string>();
  const checksum = new Set<string>();
  const pageCounts: ImportPageCountChange[] = [];
  for (const warning of input.warnings) {
    if (warning.code === "skippedPage") {
      missing.add(warning.documentName);
    } else if (warning.code === "checksum") {
      checksum.add(warning.documentName);
    } else {
      pageCounts.push({
        name: warning.documentName,
        expected: warning.expected,
        actual: warning.actual,
      });
    }
  }
  return {
    sourceName: input.sourceName,
    documents: input.prepared.documents.length,
    pages: input.prepared.pageMap.length,
    items: input.prepared.createdLayers.reduce((total, layer) => total + layer.items.length, 0),
    categories: input.prepared.categories.length,
    countTypes: input.prepared.countTypes.length,
    lineTypes: input.prepared.lineTypes.length,
    assets: Object.keys(input.prepared.assets).length,
    missingDocuments: [...missing],
    skippedPages: [...new Set(input.skipped)].sort((left, right) => left - right),
    checksumDocuments: [...checksum],
    pageCountChanges: pageCounts,
    warnings: input.prepared.warnings,
  };
}

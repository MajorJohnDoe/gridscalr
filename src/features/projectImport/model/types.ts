import type { ImportUnresolvedCounts } from "../unresolved";
import type {
  Category,
  CountTypeDef,
  DocumentKind,
  DocumentRef,
  ImageAsset,
  Layer,
  LineType,
  PageId,
  PageRecord,
} from "../../../model/types";

export interface ImportPageInfo {
  /** 1-based page in the source project (display order). */
  page: number;
  documentIndex: number;
  documentId: string;
  documentName: string;
  documentKind: DocumentKind;
  /** 1-based page inside the source document. */
  localPage: number;
  name?: string;
  building?: string;
  floor?: string;
  itemCount: number;
}

export interface ImportDocumentGroup {
  documentId: string;
  documentName: string;
  documentKind: DocumentKind;
  pageCount: number;
  pages: ImportPageInfo[];
}

export interface ImportDocumentOverride {
  /** Actual page count after loading the source document. */
  pageCount?: number;
  /** Absolute path to the resolved source file. */
  path?: string | null;
  sha256?: string;
  sizeBytes?: number;
  /** Drop stale OCR when the source file was relinked. */
  dropOcr?: boolean;
}

export type ImportDocumentOverrides = ReadonlyMap<string, ImportDocumentOverride>;

/**
 * A source document that loaded but differs from the metadata stored in the
 * source project. The import preflight requires an explicit confirmation before
 * such a file can be imported.
 */
export interface ImportSourceMismatch {
  documentId: string;
  name: string;
  checksum: boolean;
  pageCount: boolean;
  expectedPageCount: number;
  actualPageCount: number;
}

export interface ImportPageMapEntry {
  sourcePage: number;
  newPage: number;
  sourcePageId: PageId;
  newPageId: PageId;
  sourceDocumentId: string;
  newDocumentId: string;
  sourceLocalPage: number;
}

/** Revision identity captured when importing from another project file. */
export interface ImportProvenanceSource {
  sourceProjectId: string;
  sourceRevisionSha256: string;
  sourceRevisionSize: number;
  sourceRevisionModifiedAt: string | null;
  appVersion: string;
}

export type ImportWarning =
  | {
      code: "units";
      sourceLengthUnit: string;
      sourceAreaUnit: string;
      destinationLengthUnit: string;
      destinationAreaUnit: string;
    }
  | { code: "missingCategory"; count: number }
  | { code: "missingCountType"; count: number }
  | { code: "missingLineType"; count: number }
  | { code: "missingImage"; count: number }
  | { code: "ocrDropped"; count: number };

export interface PreparedProjectImport {
  documents: DocumentRef[];
  pages: PageRecord[];
  createdLayers: Layer[];
  categories: Category[];
  countTypes: CountTypeDef[];
  lineTypes: LineType[];
  assets: Record<string, ImageAsset>;
  pageMap: ImportPageMapEntry[];
  /** 0-based insertion index. Missing appends. */
  insertIndex?: number;
  activeLayerId: string | null;
  warnings: ImportWarning[];
}

export interface ImportCommitOptions {
  /** Remove copied references that do not resolve in the destination. */
  clearUnresolved?: boolean;
}

export interface ImportCommitResult {
  pageMap: ImportPageMapEntry[];
  createdLayerIds: string[];
  importedItemCount: number;
  warnings: ImportWarning[];
  /** References removed by `clearUnresolved`; zero when the option is off. */
  unresolved: ImportUnresolvedCounts;
}

export type ProjectImportErrorCode = "noSelection" | "invalidPage";

export class ProjectImportError extends Error {
  constructor(
    readonly code: ProjectImportErrorCode,
    readonly page?: number,
  ) {
    super(code);
    this.name = "ProjectImportError";
  }
}

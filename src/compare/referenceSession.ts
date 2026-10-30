import type { PDFDocumentProxy } from "pdfjs-dist";
import { base64ToBytes } from "../io/base64";
import { readFileBytes, pathExists } from "../io/platform";
import { parseProject, resolveRelativePath, sourceDocumentPaths } from "../io/projectFile";
import { documentPageMaps, totalPageCount } from "../model/documents";
import type { PageSize, Project } from "../model/types";
import { loadPdfDocument, PdfRenderer } from "../pdf/pdfRenderer";

export interface ProjectReferenceSession {
  kind: "project";
  project: Project;
  projectPath: string | null;
  name: string;
  pageCount: number;
  renderer: PdfRenderer;
  /** Lazily filled by the comparison pane. */
  pageSizes: Map<number, PageSize>;
  /** Every source path that must stay read-only during a comparison export. */
  sourcePaths: string[];
  destroy: () => Promise<void>;
}

export interface PdfReferenceSession {
  kind: "pdf";
  documentName: string;
  path: string | null;
  name: string;
  pageCount: number;
  renderer: PdfRenderer;
  /** Lazily filled by the comparison pane. */
  pageSizes: Map<number, PageSize>;
  /** The reference file itself must stay read-only during an export. */
  sourcePaths: string[];
  destroy: () => Promise<void>;
}

export type ReferenceSession = ProjectReferenceSession | PdfReferenceSession;

function referenceSourceCandidates(
  document: Project["documents"][number],
  projectPath: string | null,
) {
  const candidates: string[] = [];
  if (document.path) candidates.push(document.path);
  if (projectPath && document.relativePath) {
    const resolved = resolveRelativePath(projectPath, document.relativePath);
    if (resolved) candidates.push(resolved);
  }
  return [...new Set(candidates)];
}

/**
 * Opens a revision as a session-only reference. Nothing is merged into the
 * current project and no source file is written.
 */
export async function openReferenceSession(
  text: string,
  projectPath: string | null,
): Promise<ProjectReferenceSession> {
  const project = parseProject(text);
  if (totalPageCount(project.documents) < 1) {
    throw new Error("The reference project has no pages.");
  }

  const loaded: PDFDocumentProxy[] = [];
  const loadedById = new Map<string, PDFDocumentProxy>();
  const loadedByKey = new Map<string, PDFDocumentProxy>();
  try {
    for (const document of project.documents) {
      const copiedSource = document.copiedFrom
        ? loadedById.get(document.copiedFrom.documentId)
        : undefined;
      if (copiedSource) {
        document.pageCount = copiedSource.numPages;
        loaded.push(copiedSource);
        loadedById.set(document.id, copiedSource);
        continue;
      }

      const cacheKey =
        document.kind === "tiff"
          ? `tiff:${document.sha256}:${document.pageCount}:${document.sizeBytes}`
          : document.path
            ? `pdf:${document.path}:${document.sha256}`
            : null;
      const cached = cacheKey ? loadedByKey.get(cacheKey) : undefined;
      if (cached) {
        document.pageCount = cached.numPages;
        loaded.push(cached);
        loadedById.set(document.id, cached);
        continue;
      }

      let bytes: Uint8Array | null = null;
      if (document.kind === "tiff" && document.embeddedPdf) {
        bytes = base64ToBytes(document.embeddedPdf);
      } else {
        for (const candidate of referenceSourceCandidates(document, projectPath)) {
          if (!(await pathExists(candidate))) continue;
          bytes = await readFileBytes(candidate);
          break;
        }
      }
      if (!bytes) {
        throw new Error(
          `The reference drawing “${document.name}” could not be found. Put it back in its original location, or open the reference project in the desktop app next to its drawings.`,
        );
      }
      const pdf = await loadPdfDocument(bytes);
      document.pageCount = pdf.numPages;
      loaded.push(pdf);
      loadedById.set(document.id, pdf);
      if (cacheKey) loadedByKey.set(cacheKey, pdf);
    }

    const renderer = new PdfRenderer(loaded, documentPageMaps(project.documents));
    return {
      kind: "project",
      project,
      projectPath,
      name: project.name,
      pageCount: totalPageCount(project.documents),
      renderer,
      pageSizes: new Map(),
      sourcePaths: sourceDocumentPaths(project, projectPath),
      destroy: async () => {
        try {
          await renderer.destroy();
        } catch {
          // The documents may already be closed.
        }
      },
    };
  } catch (error) {
    for (const document of new Set(loaded)) {
      try {
        await document.loadingTask.destroy();
      } catch {
        // Best-effort cleanup of a partially loaded comparison.
      }
    }
    throw error;
  }
}

/**
 * Opens a raw PDF drawing as a session-only reference. It has no markups or
 * diff, but supports side-by-side, overlay and the comparison PDF.
 */
export async function openPdfReferenceSession(
  bytes: Uint8Array,
  name: string,
  path: string | null,
): Promise<PdfReferenceSession> {
  const document = await loadPdfDocument(bytes);
  if (document.numPages < 1) {
    await document.loadingTask.destroy().catch(() => undefined);
    throw new Error("The reference drawing has no pages.");
  }
  const renderer = new PdfRenderer([document]);
  return {
    kind: "pdf",
    documentName: name,
    path,
    name,
    pageCount: document.numPages,
    renderer,
    pageSizes: new Map(),
    sourcePaths: path ? [path] : [],
    destroy: async () => {
      try {
        await renderer.destroy();
      } catch {
        // The document may already be closed.
      }
    },
  };
}

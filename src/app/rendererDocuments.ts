import type { PDFDocumentProxy } from "pdfjs-dist";
import { documentPageMaps } from "../model/documents";
import { documentPageOrder } from "../model/pages";
import type { Project } from "../model/types";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import { store } from "../state/store";

export interface ImportedRendererDocument {
  id: string;
  proxy: PDFDocumentProxy;
  pageMap: number[];
}

export type ReconcileResult = "unchanged" | "changed" | "failed";

interface CachedDocument {
  proxy: PDFDocumentProxy;
  pageMap: number[];
}

/**
 * Keeps the PDF renderer aligned with the project's document list across undo
 * and redo. Imported documents are detached into a cache instead of being
 * destroyed, so redo can reattach the same proxies without reading files again.
 */
export class RendererDocumentRegistry {
  private lastIds: string[] = [];
  private readonly cache = new Map<string, CachedDocument>();

  reset(project: Project | null, previousRenderer?: PdfRenderer | null): void {
    this.lastIds = project ? project.documents.map((document) => document.id) : [];
    this.destroyCached(previousRenderer);
  }

  /** Called after every project change that is not an undo or a redo. */
  sync(project: Project | null): void {
    this.lastIds = project ? project.documents.map((document) => document.id) : [];
  }

  /** Adds imported documents to the renderer and remembers their proxies. */
  addImported(
    entries: readonly ImportedRendererDocument[],
    project: Project,
    renderer: PdfRenderer,
  ): void {
    for (const entry of entries) {
      renderer.addDocument(entry.proxy, entry.pageMap);
      this.cache.set(entry.id, { proxy: entry.proxy, pageMap: [...entry.pageMap] });
    }
    renderer.setPageMaps(documentPageMaps(project.documents));
    this.lastIds = project.documents.map((document) => document.id);
  }

  /** Adds one document and then applies the project's explicit page order. */
  addProjectDocument(
    documentId: string,
    proxy: PDFDocumentProxy,
    pageMap: number[],
    renderer: PdfRenderer | null,
  ): void {
    const project = store.project;
    if (!project || !renderer) return;
    this.addImported([{ id: documentId, proxy, pageMap }], project, renderer);
    renderer.setPageOrder(documentPageOrder(project));
  }

  /**
   * Reconciles a document suffix change after undo or redo. Only appends and
   * removals at the end are handled; anything else needs a full reload.
   */
  reconcile(project: Project | null, renderer: PdfRenderer | null): ReconcileResult {
    if (!project || !renderer) return "unchanged";
    const nextIds = project.documents.map((document) => document.id);
    const previousIds = this.lastIds;
    if (sameIds(previousIds, nextIds)) return "unchanged";

    if (isPrefix(nextIds, previousIds)) {
      if (renderer.documentCount !== previousIds.length) return "failed";
      const removeCount = previousIds.length - nextIds.length;
      for (let offset = 0; offset < removeCount; offset += 1) {
        const index = renderer.documentCount - 1;
        const id = previousIds[index];
        const detached = renderer.detachDocument(index);
        if (!detached) return "failed";
        if (id) {
          this.cache.set(id, { proxy: detached.document, pageMap: detached.pageMap });
        }
      }
    } else if (isPrefix(previousIds, nextIds)) {
      if (renderer.documentCount !== previousIds.length) return "failed";
      for (let index = previousIds.length; index < nextIds.length; index += 1) {
        const cached = this.cache.get(nextIds[index]);
        if (!cached) return "failed";
        renderer.addDocument(cached.proxy, cached.pageMap);
      }
    } else {
      return "failed";
    }

    renderer.setPageMaps(documentPageMaps(project.documents));
    this.lastIds = nextIds;
    return "changed";
  }

  /** Destroys cached proxies that are no longer used by the renderer. */
  dispose(renderer: PdfRenderer | null): void {
    this.destroyCached(renderer);
    this.lastIds = [];
  }

  private destroyCached(renderer?: PdfRenderer | null): void {
    const live = new Set(renderer?.documents ?? []);
    const destroyed = new Set<PDFDocumentProxy>();
    for (const cached of this.cache.values()) {
      if (live.has(cached.proxy) || destroyed.has(cached.proxy)) continue;
      destroyed.add(cached.proxy);
      void cached.proxy.loadingTask.destroy().catch(() => undefined);
    }
    this.cache.clear();
  }
}

function sameIds(first: readonly string[], second: readonly string[]): boolean {
  return first.length === second.length && first.every((id, index) => id === second[index]);
}

function isPrefix(prefix: readonly string[], values: readonly string[]): boolean {
  return prefix.length <= values.length && prefix.every((id, index) => id === values[index]);
}

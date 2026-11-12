import type { PDFDocumentProxy } from "pdfjs-dist";
import { documentPageOrder, pageOrderSignature } from "../model/pages";
import type { Project } from "../model/types";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import type { ChangeReason } from "../state/store";
import {
  RendererDocumentRegistry,
  type ImportedRendererDocument,
  type ReconcileResult,
} from "./rendererDocuments";

/**
 * Renderer side of one store change. The page order is derived here, never by
 * the individual page flows: a flow only mutates the store, and the store
 * listener puts the renderer back in step with the new page list.
 */
export interface RendererSyncHost {
  project(): Project | null;
  renderer(): PdfRenderer | null;
  /** Drop previews and cached page sizes after the display order changed. */
  onPageOrderChanged(): void;
  /** An undo or redo attached or detached renderer documents. */
  onDocumentsChanged(): void;
  /** The renderer document list could not follow the restored project. */
  onSyncFailed(): void;
}

/**
 * Keeps the renderer's documents and display page order aligned with the store.
 *
 * `handle()` runs from the single store subscription. Page order is applied
 * only when its signature changes, so an ordinary edit neither cancels page
 * renders nor clears previews. New documents are registered after the store
 * has emitted, so the derived order is applied by `addImported()` once the
 * renderer holds every document the project references.
 */
export class RendererStoreSync {
  private readonly registry: RendererDocumentRegistry;

  constructor(
    private readonly host: RendererSyncHost,
    registry?: RendererDocumentRegistry,
  ) {
    this.registry = registry ?? new RendererDocumentRegistry();
  }

  /** Handles one store change. Only project and history changes touch pages. */
  handle(reason: ChangeReason): void {
    if (reason !== "project" && reason !== "undo") return;
    const project = this.host.project();
    const renderer = this.host.renderer();
    if (reason === "project") {
      this.registry.sync(project);
      if (this.registry.syncPageOrder(project, renderer)) this.host.onPageOrderChanged();
    } else {
      const result: ReconcileResult = this.registry.reconcile(project, renderer);
      if (result === "changed") this.host.onDocumentsChanged();
      else if (result === "failed") this.host.onSyncFailed();
    }
    this.assertApplied(project, renderer);
  }

  /** Starts a new project; the renderer was constructed with its page order. */
  reset(project: Project | null, previousRenderer?: PdfRenderer | null): void {
    this.registry.reset(project, previousRenderer);
  }

  /** Releases cached proxies when the renderer is destroyed. */
  dispose(renderer: PdfRenderer | null): void {
    this.registry.dispose(renderer);
  }

  /** Registers imported documents and derives the display page order. */
  addImported(entries: readonly ImportedRendererDocument[]): boolean {
    const project = this.host.project();
    const renderer = this.host.renderer();
    if (!project || !renderer) return false;
    const changed = this.registry.addImported(entries, project, renderer);
    if (changed) this.host.onPageOrderChanged();
    this.assertApplied(project, renderer);
    return changed;
  }

  /** Registers one document and derives the display page order. */
  addProjectDocument(documentId: string, proxy: PDFDocumentProxy, pageMap: number[]): boolean {
    const project = this.host.project();
    const renderer = this.host.renderer();
    if (!project || !renderer) return false;
    const changed = this.registry.addProjectDocument(project, documentId, proxy, pageMap, renderer);
    if (changed) this.host.onPageOrderChanged();
    this.assertApplied(project, renderer);
    return changed;
  }

  /**
   * Development-only invariant. Production builds compile the branch out, and
   * a project that is still registering new documents is legitimately pending
   * until its last document is added, so the document count is checked first.
   */
  private assertApplied(project: Project | null, renderer: PdfRenderer | null): void {
    if (!import.meta.env.DEV || !project || !renderer) return;
    if (renderer.documentCount !== project.documents.length) return;
    const expected = pageOrderSignature(documentPageOrder(project));
    if (renderer.appliedPageOrder !== expected) console.error("rendererPageOrderMismatch");
  }
}

import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ImportDocumentOverride } from "../features/projectImport/model";
import { base64ToBytes } from "../io/base64";
import { isTauri, pathExists, pickPdf, readFileBytes } from "../io/platform";
import { resolveRelativePath } from "../io/projectFile";
import { documentStartPage, includedLocalPages } from "../model/documents";
import type { DocumentRef, Project } from "../model/types";
import { renderPagePreview } from "../pdf/pdfRenderer";
import { PageThumbnailService } from "../pdf/thumbnails";
import { confirmChecksumMismatch, hashBytes, openDocument } from "./documentImport";
import { sheetBytes } from "./sheetFlows";

export type SourceImportWarning =
  | { code: "skippedPage"; page: number; documentName: string }
  | { code: "checksum"; documentName: string }
  | { code: "pageCount"; documentName: string; expected: number; actual: number };

export interface SourceDocumentLoad {
  documentId: string;
  proxy: PDFDocumentProxy;
  pageCount: number;
  path: string | null;
  sha256: string;
  sizeBytes: number;
  dropOcr: boolean;
}

export interface SourceSelection {
  pages: number[];
  documents: SourceDocumentLoad[];
  overrides: Map<string, ImportDocumentOverride>;
  skipped: number[];
  warnings: SourceImportWarning[];
}

interface SourcePageRef {
  page: number;
  documentId: string;
  documentIndex: number;
  localPage: number;
}

interface LocatedPdf {
  bytes: Uint8Array;
  name: string;
  path: string | null;
}

/**
 * Loads pages from a source `.gridscalr` for previewing and importing. The
 * source project and its files are only read; located files and checksum
 * overrides live in this loader and never touch the source data.
 */
export class ProjectImportSource {
  private readonly documents = new Map<string, DocumentRef>();
  private readonly pageRefs = new Map<number, SourcePageRef>();
  private readonly proxies = new Map<string, PDFDocumentProxy>();
  private readonly loading = new Map<string, Promise<PDFDocumentProxy | null>>();
  private readonly services = new Map<string, PageThumbnailService>();
  private readonly availability = new Map<string, boolean>();
  private readonly resolvedPaths = new Map<string, string>();
  private readonly hashes = new Map<string, string>();
  private readonly sizes = new Map<string, number>();
  private readonly located = new Map<string, LocatedPdf>();

  constructor(
    private readonly source: Project,
    private readonly sourcePath: string | null,
    private readonly isBusy: () => boolean,
  ) {
    source.documents.forEach((document, index) => {
      this.documents.set(document.id, document);
      const start = documentStartPage(source.documents, index);
      includedLocalPages(document).forEach((localPage, offset) => {
        const page = start + offset;
        this.pageRefs.set(page, {
          page,
          documentId: document.id,
          documentIndex: index,
          localPage,
        });
      });
    });
  }

  /** Cheap check used to disable pages whose PDF cannot be found yet. */
  async checkAvailability(): Promise<Map<string, boolean>> {
    for (const document of this.source.documents) {
      if (document.kind === "template") {
        this.availability.set(document.id, Boolean(document.template));
        continue;
      }
      if (document.kind === "tiff") {
        this.availability.set(document.id, Boolean(document.embeddedPdf));
        continue;
      }
      let available = false;
      if (isTauri) {
        for (const candidate of this.candidates(document)) {
          if (await pathExists(candidate)) {
            available = true;
            this.resolvedPaths.set(document.id, candidate);
            break;
          }
        }
      }
      this.availability.set(document.id, available);
    }
    return new Map(this.availability);
  }

  pageRef(page: number): SourcePageRef | undefined {
    return this.pageRefs.get(page);
  }

  async preview(page: number): Promise<string | null> {
    const ref = this.pageRefs.get(page);
    if (!ref) return null;
    const proxy = await this.load(ref.documentId);
    if (!proxy) return null;
    const service = this.services.get(ref.documentId);
    return service ? service.request(ref.localPage) : null;
  }

  /** Prompts for a replacement PDF when the source file cannot be found. */
  async locate(documentId: string): Promise<boolean> {
    const document = this.documents.get(documentId);
    if (!document || document.kind !== "pdf") return false;
    const picked = await pickPdf();
    if (!picked) return false;
    this.located.set(documentId, {
      bytes: picked.bytes,
      name: picked.name,
      path: picked.path,
    });
    const previous = this.proxies.get(documentId);
    if (previous) void previous.loadingTask.destroy().catch(() => undefined);
    this.proxies.delete(documentId);
    this.services.get(documentId)?.destroy();
    this.services.delete(documentId);
    this.hashes.delete(documentId);
    this.sizes.delete(documentId);
    this.availability.set(documentId, true);
    const proxy = await this.load(documentId);
    if (!proxy) {
      this.availability.set(documentId, false);
      return false;
    }
    return true;
  }

  /**
   * Loads every selected document, verifies PDF checksums and drops pages that
   * cannot be read. The caller imports the returned pages only.
   */
  async ensure(pages: readonly number[]): Promise<SourceSelection> {
    const selected = [...new Set(pages)].sort((a, b) => a - b);
    const byDocument = new Map<string, number[]>();
    const skipped: number[] = [];
    const warnings: SourceImportWarning[] = [];
    for (const page of selected) {
      const ref = this.pageRefs.get(page);
      if (!ref) {
        skipped.push(page);
        continue;
      }
      const list = byDocument.get(ref.documentId) ?? [];
      list.push(page);
      byDocument.set(ref.documentId, list);
    }

    const available: number[] = [];
    const documents: SourceDocumentLoad[] = [];
    const overrides = new Map<string, ImportDocumentOverride>();

    for (const [documentId, documentPages] of byDocument) {
      const document = this.documents.get(documentId);
      const proxy = await this.load(documentId);
      if (!document || !proxy) {
        for (const page of documentPages) {
          skipped.push(page);
          warnings.push({
            code: "skippedPage",
            page,
            documentName: document?.name ?? "",
          });
        }
        continue;
      }

      let dropOcr = false;
      let sha256 = document.sha256;
      const path = this.resolvedPaths.get(documentId) ?? document.path;
      let sizeBytes = this.sizes.get(documentId) ?? document.sizeBytes;

      if (document.kind === "pdf") {
        const hash = this.hashes.get(documentId) ?? "";
        if (hash && document.sha256 && hash !== document.sha256) {
          const accepted = await confirmChecksumMismatch(document, hash);
          if (!accepted) {
            for (const page of documentPages) {
              skipped.push(page);
              warnings.push({ code: "skippedPage", page, documentName: document.name });
            }
            warnings.push({ code: "checksum", documentName: document.name });
            continue;
          }
          dropOcr = true;
          warnings.push({ code: "checksum", documentName: document.name });
        }
        if (hash) sha256 = hash;
        if (this.sizes.has(documentId)) sizeBytes = this.sizes.get(documentId)!;
        if (path) this.resolvedPaths.set(documentId, path);
      }

      if (proxy.numPages !== document.pageCount) {
        warnings.push({
          code: "pageCount",
          documentName: document.name,
          expected: document.pageCount,
          actual: proxy.numPages,
        });
      }

      const validPages: number[] = [];
      for (const page of documentPages) {
        const ref = this.pageRefs.get(page);
        if (ref && ref.localPage <= proxy.numPages) {
          validPages.push(page);
          continue;
        }
        skipped.push(page);
        warnings.push({ code: "skippedPage", page, documentName: document.name });
      }
      if (!validPages.length) continue;

      available.push(...validPages);
      documents.push({
        documentId,
        proxy,
        pageCount: proxy.numPages,
        path,
        sha256,
        sizeBytes,
        dropOcr,
      });
      overrides.set(documentId, {
        pageCount: proxy.numPages,
        path,
        sha256,
        sizeBytes,
        dropOcr,
      });
    }

    available.sort((a, b) => a - b);
    skipped.sort((a, b) => a - b);
    return {
      pages: available,
      documents,
      overrides,
      skipped: [...new Set(skipped)],
      warnings,
    };
  }

  /** Destroys previews and every proxy that was not handed to the renderer. */
  dispose(keep: ReadonlySet<PDFDocumentProxy>): void {
    for (const service of this.services.values()) service.destroy();
    this.services.clear();
    for (const proxy of new Set(this.proxies.values())) {
      if (keep.has(proxy)) continue;
      void proxy.loadingTask.destroy().catch(() => undefined);
    }
    this.proxies.clear();
    this.loading.clear();
    this.located.clear();
  }

  private async load(documentId: string): Promise<PDFDocumentProxy | null> {
    const cached = this.proxies.get(documentId);
    if (cached) return cached;
    const pending = this.loading.get(documentId);
    if (pending) return pending;
    const promise = this.loadDocument(documentId).finally(() => {
      this.loading.delete(documentId);
    });
    this.loading.set(documentId, promise);
    return promise;
  }

  private async loadDocument(documentId: string): Promise<PDFDocumentProxy | null> {
    const document = this.documents.get(documentId);
    if (!document) return null;
    let bytes: Uint8Array | null = null;
    let name = document.name;
    let path = document.path;

    if (document.kind === "template") {
      if (!document.template) return null;
      try {
        bytes = await sheetBytes(document.template);
      } catch {
        return null;
      }
      path = null;
    } else if (document.kind === "tiff") {
      if (!document.embeddedPdf) return null;
      try {
        bytes = base64ToBytes(document.embeddedPdf);
      } catch {
        return null;
      }
    } else {
      const located = this.located.get(documentId);
      if (located) {
        bytes = located.bytes;
        name = located.name;
        path = located.path;
      } else if (isTauri) {
        for (const candidate of this.candidates(document)) {
          if (!(await pathExists(candidate))) continue;
          try {
            bytes = await readFileBytes(candidate);
            path = candidate;
            break;
          } catch {
            // Try the next candidate.
          }
        }
      }
      if (!bytes) {
        this.availability.set(documentId, false);
        return null;
      }
      this.hashes.set(documentId, await hashBytes(bytes));
      this.sizes.set(documentId, bytes.byteLength);
    }

    if (!bytes) return null;
    const proxy = await openDocument(bytes, name);
    if (!proxy) {
      this.availability.set(documentId, false);
      return null;
    }
    this.proxies.set(documentId, proxy);
    if (path) this.resolvedPaths.set(documentId, path);
    this.availability.set(documentId, true);
    this.services.set(
      documentId,
      new PageThumbnailService(async (localPage) => {
        const page = await proxy.getPage(localPage);
        const canvas = await renderPagePreview(page, 220);
        return canvas.toDataURL("image/jpeg", 0.74);
      }, this.isBusy),
    );
    return proxy;
  }

  private candidates(document: DocumentRef): string[] {
    const candidates: string[] = [];
    if (document.path) candidates.push(document.path);
    if (this.sourcePath && document.relativePath) {
      const resolved = resolveRelativePath(this.sourcePath, document.relativePath);
      if (resolved && !candidates.includes(resolved)) candidates.push(resolved);
    }
    return candidates;
  }
}

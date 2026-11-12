import type { PDFDocumentProxy } from "pdfjs-dist";
import { describe, expect, it, vi } from "vitest";
import { withTestPageIds } from "./helpers/pages";
import { RendererDocumentRegistry } from "../src/app/rendererDocuments";
import { createProject, defaultDocument } from "../src/model/layers";
import {
  documentPageOrder,
  pageOrderSignature,
  type DocumentPageOrderEntry,
} from "../src/model/pages";
import type { DocumentRef, Project } from "../src/model/types";
import type { PdfRenderer } from "../src/pdf/pdfRenderer";

function documentRef(id: string, pageCount = 1, excludedPages?: number[]): DocumentRef {
  return {
    id,
    kind: "pdf",
    name: `${id}.pdf`,
    path: null,
    relativePath: null,
    sha256: id,
    pageCount,
    sizeBytes: 1,
    excludedPages,
  };
}

function projectWith(documents: DocumentRef[]): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
  project.documents = documents;
  return project;
}

/** One document with an explicit page order, for order-only history steps. */
function projectWithPages(documents: DocumentRef[], locals: number[]): Project {
  const project = projectWith(documents);
  project.pages = locals.map((localPage, index) => ({
    id: `page_${index + 1}`,
    documentId: documents[0].id,
    localPage,
    state: {},
  }));
  return project;
}

function fakeProxy(id: string): PDFDocumentProxy {
  return {
    id,
    loadingTask: { destroy: vi.fn(() => Promise.resolve()) },
  } as unknown as PDFDocumentProxy;
}

interface FakeRenderer {
  documents: PDFDocumentProxy[];
  pageMaps: number[][];
  pageOrder: DocumentPageOrderEntry[] | null;
  readonly appliedPageOrder: string;
  readonly documentCount: number;
  addDocument(document: PDFDocumentProxy, pageMap?: number[]): void;
  detachDocument(index: number): { document: PDFDocumentProxy; pageMap: number[] } | null;
  setPageMaps(maps: number[][]): void;
  setPageOrder(order: DocumentPageOrderEntry[] | null): void;
}

function asRenderer(renderer: FakeRenderer): PdfRenderer {
  return renderer as unknown as PdfRenderer;
}

function fakeRenderer(documents: PDFDocumentProxy[] = []): FakeRenderer {
  const pageMaps: number[][] = documents.map(() => [1]);
  let pageOrder: DocumentPageOrderEntry[] | null = null;
  return {
    documents,
    pageMaps,
    get pageOrder() {
      return pageOrder;
    },
    get appliedPageOrder() {
      return pageOrderSignature(pageOrder);
    },
    get documentCount() {
      return documents.length;
    },
    addDocument(document: PDFDocumentProxy, pageMap?: number[]) {
      documents.push(document);
      pageMaps.push(pageMap ? [...pageMap] : [1]);
    },
    detachDocument(index: number) {
      if (index < 0 || index >= documents.length) return null;
      const [document] = documents.splice(index, 1);
      const [pageMap] = pageMaps.splice(index, 1);
      return { document, pageMap };
    },
    setPageMaps(maps: number[][]) {
      pageMaps.splice(0, pageMaps.length, ...maps.map((map) => [...map]));
    },
    setPageOrder(order: DocumentPageOrderEntry[] | null) {
      pageOrder = order;
    },
  } as unknown as FakeRenderer;
}

describe("renderer document registry", () => {
  it("adds imported documents and remembers their proxies", () => {
    const registry = new RendererDocumentRegistry();
    const a = documentRef("a");
    const b = documentRef("b");
    const project = projectWith([a, b]);
    registry.reset(projectWith([a]));
    const renderer = fakeRenderer([fakeProxy("a")]);
    const proxyA = renderer.documents[0];
    const proxyB = fakeProxy("b");
    registry.sync(project);

    registry.addImported([{ id: "b", proxy: proxyB, pageMap: [1] }], project, asRenderer(renderer));
    expect(renderer.documents).toEqual([proxyA, proxyB]);
    expect(renderer.pageMaps).toEqual([[1], [1]]);
  });

  it("detaches imported documents on undo and reattaches them on redo", () => {
    const registry = new RendererDocumentRegistry();
    const a = documentRef("a");
    const b = documentRef("b", 2, [2]);
    const before = projectWith([a]);
    const after = projectWith([a, b]);
    const renderer = fakeRenderer([fakeProxy("a")]);
    const proxyA = renderer.documents[0];
    const proxyB = fakeProxy("b");
    registry.reset(before);
    registry.sync(after);
    registry.addImported([{ id: "b", proxy: proxyB, pageMap: [1] }], after, asRenderer(renderer));
    expect(renderer.documents).toEqual([proxyA, proxyB]);

    expect(registry.reconcile(before, asRenderer(renderer))).toBe("changed");
    expect(renderer.documents).toEqual([proxyA]);
    expect(renderer.pageMaps).toEqual([[1]]);

    expect(registry.reconcile(after, asRenderer(renderer))).toBe("changed");
    expect(renderer.documents).toEqual([proxyA, proxyB]);
    expect(renderer.pageMaps).toEqual([[1], [1]]);
  });

  it("returns unchanged for item-only history steps", () => {
    const registry = new RendererDocumentRegistry();
    const project = projectWith([documentRef("a")]);
    const renderer = fakeRenderer([fakeProxy("a")]);
    registry.reset(project);
    renderer.setPageOrder(documentPageOrder(project));
    expect(registry.reconcile(project, asRenderer(renderer))).toBe("unchanged");
  });

  it("reapplies the page order when an undo changes no document", () => {
    const registry = new RendererDocumentRegistry();
    const a = documentRef("a", 3);
    const before = projectWithPages([a], [1, 2, 3]);
    const after = projectWithPages([a], [3, 1, 2]);
    const renderer = fakeRenderer([fakeProxy("a")]);
    registry.reset(before);
    renderer.setPageOrder(documentPageOrder(before));

    expect(registry.reconcile(after, asRenderer(renderer))).toBe("changed");
    expect(renderer.pageOrder).toEqual(documentPageOrder(after));
    expect(registry.reconcile(before, asRenderer(renderer))).toBe("changed");
    expect(renderer.pageOrder).toEqual(documentPageOrder(before));
  });

  it("fails when a redo proxy is no longer cached", () => {
    const registry = new RendererDocumentRegistry();
    const before = projectWith([documentRef("a")]);
    const after = projectWith([documentRef("a"), documentRef("b")]);
    const renderer = fakeRenderer([fakeProxy("a"), fakeProxy("b")]);
    registry.reset(after);
    expect(registry.reconcile(before, asRenderer(renderer))).toBe("changed");
    registry.reset(before);
    expect(registry.reconcile(after, asRenderer(renderer))).toBe("failed");
  });

  it("destroys detached proxies on dispose but leaves live documents alone", () => {
    const registry = new RendererDocumentRegistry();
    const before = projectWith([documentRef("a")]);
    const after = projectWith([documentRef("a"), documentRef("b")]);
    const proxyA = fakeProxy("a");
    const proxyB = fakeProxy("b");
    const renderer = fakeRenderer([proxyA]);
    registry.reset(before);
    registry.sync(after);
    registry.addImported([{ id: "b", proxy: proxyB, pageMap: [1] }], after, asRenderer(renderer));
    registry.reconcile(before, asRenderer(renderer));
    registry.dispose(asRenderer(renderer));
    expect(proxyB.loadingTask.destroy).toHaveBeenCalled();
    expect(proxyA.loadingTask.destroy).not.toHaveBeenCalled();
  });

  it("preserves excluded pages in the renderer page map", () => {
    const registry = new RendererDocumentRegistry();
    const a = documentRef("a", 3, [1, 3]);
    const project = projectWith([a]);
    const renderer = fakeRenderer();
    registry.reset(project);
    registry.addImported(
      [{ id: "a", proxy: fakeProxy("a"), pageMap: [2] }],
      project,
      asRenderer(renderer),
    );
    expect(renderer.pageMaps).toEqual([[2]]);
  });
});

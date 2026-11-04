import { describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfRenderer } from "../src/pdf/pdfRenderer";

function documentProxy(name: string, pages: number): PDFDocumentProxy {
  return {
    numPages: pages,
    getPage: async (localPage: number) => ({
      name,
      localPage,
      getOperatorList: async () => undefined,
      getViewport: () => ({ width: 100, height: 100 }),
      cleanup: () => undefined,
    }),
    loadingTask: { destroy: async () => undefined },
  } as unknown as PDFDocumentProxy;
}

describe("PdfRenderer page maps", () => {
  it("maps global pages through included source pages", async () => {
    const renderer = new PdfRenderer([documentProxy("A", 3), documentProxy("B", 2)], [[1, 3], [2]]);
    expect(renderer.pageCount).toBe(3);
    await expect(renderer.getPage(1)).resolves.toMatchObject({ name: "A", localPage: 1 });
    await expect(renderer.getPage(2)).resolves.toMatchObject({ name: "A", localPage: 3 });
    await expect(renderer.getPage(3)).resolves.toMatchObject({ name: "B", localPage: 2 });
  });

  it("rebuilds the mapping after a page removal", async () => {
    const renderer = new PdfRenderer(
      [documentProxy("A", 3), documentProxy("B", 2)],
      [
        [1, 2, 3],
        [1, 2],
      ],
    );
    renderer.setPageMaps([[1, 3], [2]]);
    expect(renderer.pageCount).toBe(3);
    await expect(renderer.getPage(2)).resolves.toMatchObject({ name: "A", localPage: 3 });
    await expect(renderer.getPage(3)).resolves.toMatchObject({ name: "B", localPage: 2 });
  });

  it("removes an empty document and keeps the remaining mapping aligned", async () => {
    const renderer = new PdfRenderer([documentProxy("A", 1), documentProxy("B", 2)], [[1], [1, 2]]);
    renderer.removeDocument(0);
    expect(renderer.documentCount).toBe(1);
    expect(renderer.pageCount).toBe(2);
    await expect(renderer.getPage(1)).resolves.toMatchObject({ name: "B", localPage: 1 });
    await expect(renderer.getPage(2)).resolves.toMatchObject({ name: "B", localPage: 2 });
  });
});

describe("PdfRenderer document replacement", () => {
  it("replaces one document in place and destroys the old proxy only when unused", async () => {
    const destroy = vi.fn(async () => undefined);
    const old = {
      numPages: 1,
      getPage: async (localPage: number) => ({
        name: "Old",
        localPage,
        getOperatorList: async () => undefined,
        getViewport: () => ({ width: 100, height: 100 }),
        cleanup: () => undefined,
      }),
      loadingTask: { destroy },
    } as unknown as PDFDocumentProxy;
    const next = documentProxy("Next", 1);
    const renderer = new PdfRenderer([old, old], [[1], [1]]);

    renderer.replaceDocument(0, next);
    expect(renderer.documentCount).toBe(2);
    await expect(renderer.getPage(1)).resolves.toMatchObject({ name: "Next", localPage: 1 });
    await expect(renderer.getPage(2)).resolves.toMatchObject({ name: "Old", localPage: 1 });
    expect(destroy).not.toHaveBeenCalled();

    renderer.replaceDocument(1, next);
    await Promise.resolve();
    expect(renderer.pageCount).toBe(2);
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

describe("PdfRenderer shared page copies", () => {
  it("does not destroy a source PDF while another page copy still uses it", async () => {
    const destroy = vi.fn(async () => undefined);
    const proxy = {
      numPages: 1,
      getPage: async (localPage: number) => ({
        localPage,
        getOperatorList: async () => undefined,
        getViewport: () => ({ width: 100, height: 100 }),
      }),
      loadingTask: { destroy },
    } as unknown as PDFDocumentProxy;
    const renderer = new PdfRenderer([proxy, proxy], [[1], [1]]);
    renderer.removeDocument(0);
    await Promise.resolve();
    expect(destroy).not.toHaveBeenCalled();
    renderer.removeDocument(0);
    await Promise.resolve();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});

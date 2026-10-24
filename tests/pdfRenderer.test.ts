import { describe, expect, it } from "vitest";
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
    }),
    loadingTask: { destroy: async () => undefined },
  } as unknown as PDFDocumentProxy;
}

describe("PdfRenderer page maps", () => {
  it("maps global pages through included source pages", async () => {
    const renderer = new PdfRenderer(
      [documentProxy("A", 3), documentProxy("B", 2)],
      [[1, 3], [2]],
    );
    expect(renderer.pageCount).toBe(3);
    await expect(renderer.getPage(1)).resolves.toMatchObject({ name: "A", localPage: 1 });
    await expect(renderer.getPage(2)).resolves.toMatchObject({ name: "A", localPage: 3 });
    await expect(renderer.getPage(3)).resolves.toMatchObject({ name: "B", localPage: 2 });
  });

  it("rebuilds the mapping after a page removal", async () => {
    const renderer = new PdfRenderer(
      [documentProxy("A", 3), documentProxy("B", 2)],
      [[1, 2, 3], [1, 2]],
    );
    renderer.setPageMaps([[1, 3], [2]]);
    expect(renderer.pageCount).toBe(3);
    await expect(renderer.getPage(2)).resolves.toMatchObject({ name: "A", localPage: 3 });
    await expect(renderer.getPage(3)).resolves.toMatchObject({ name: "B", localPage: 2 });
  });

  it("removes an empty document and keeps the remaining mapping aligned", async () => {
    const renderer = new PdfRenderer(
      [documentProxy("A", 1), documentProxy("B", 2)],
      [[1], [1, 2]],
    );
    renderer.removeDocument(0);
    expect(renderer.documentCount).toBe(1);
    expect(renderer.pageCount).toBe(2);
    await expect(renderer.getPage(1)).resolves.toMatchObject({ name: "B", localPage: 1 });
    await expect(renderer.getPage(2)).resolves.toMatchObject({ name: "B", localPage: 2 });
  });
});

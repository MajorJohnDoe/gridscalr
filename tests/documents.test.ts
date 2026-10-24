import { describe, expect, it } from "vitest";
import {
  documentIndexForPage,
  documentPageRange,
  documentStartPage,
  localPageNumber,
  pageDocumentLabel,
  primaryDocument,
  totalPageCount,
} from "../src/model/documents";
import { defaultDocument } from "../src/model/layers";
import type { DocumentRef } from "../src/model/types";

function pdf(name: string, pageCount: number): DocumentRef {
  return { ...defaultDocument(name, pageCount), kind: "pdf", sha256: name };
}

const documents = [pdf("Bottom.pdf", 3), pdf("Upper.pdf", 2)];

describe("document page mapping", () => {
  it("sums page counts across documents", () => {
    expect(totalPageCount(documents)).toBe(5);
    expect(totalPageCount([])).toBe(0);
  });

  it("maps global pages onto documents in order", () => {
    expect(documentIndexForPage(documents, 1)).toBe(0);
    expect(documentIndexForPage(documents, 3)).toBe(0);
    expect(documentIndexForPage(documents, 4)).toBe(1);
    expect(documentIndexForPage(documents, 5)).toBe(1);
  });

  it("clamps pages outside the project to the nearest document", () => {
    expect(documentIndexForPage(documents, 0)).toBe(0);
    expect(documentIndexForPage(documents, 99)).toBe(1);
  });

  it("computes document start pages and ranges", () => {
    expect(documentStartPage(documents, 0)).toBe(1);
    expect(documentStartPage(documents, 1)).toBe(4);
    expect(documentPageRange(documents, 0)).toEqual({ start: 1, end: 3 });
    expect(documentPageRange(documents, 1)).toEqual({ start: 4, end: 5 });
  });

  it("converts global pages to local page numbers", () => {
    expect(localPageNumber(documents, 1)).toBe(1);
    expect(localPageNumber(documents, 3)).toBe(3);
    expect(localPageNumber(documents, 4)).toBe(1);
    expect(localPageNumber(documents, 5)).toBe(2);
  });

  it("labels pages with their source document only when there are several", () => {
    const project = { documents };
    expect(pageDocumentLabel(project, 1)).toBe("Bottom.pdf · p. 1/3");
    expect(pageDocumentLabel(project, 4)).toBe("Upper.pdf · p. 1/2");
    expect(pageDocumentLabel({ documents: [documents[0]] }, 2)).toBe("Bottom.pdf");
  });

  it("exposes the primary document", () => {
    expect(primaryDocument(documents)?.name).toBe("Bottom.pdf");
    expect(primaryDocument([])).toBeUndefined();
  });
});

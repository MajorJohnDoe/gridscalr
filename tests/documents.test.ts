import { describe, expect, it } from "vitest";
import {
  documentPageMaps,
  documentPageRange,
  documentStartPage,
  excludedSourcePages,
  includedLocalPages,
  localPageNumber,
  primaryDocument,
  totalPageCount,
} from "../src/model/documents";
import { createProject, defaultDocument } from "../src/model/layers";
import {
  currentPageId,
  documentPageOrder,
  pageIdAt,
  pageIdForDocumentPage,
  pageNumber,
  pageRecordAt,
  pageStateOf,
} from "../src/model/pages";
import {
  cleanupEmptyLayers,
  deletePage,
  duplicatePage,
  insertPage,
  movePage,
} from "../src/features/pageModel";
import type { DocumentRef } from "../src/model/types";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

function pdf(name: string, pageCount: number): DocumentRef {
  return { ...defaultDocument(name, pageCount), kind: "pdf", sha256: name };
}

const documents = [pdf("Bottom.pdf", 3), pdf("Upper.pdf", 2)];

describe("document page mapping", () => {
  it("sums page counts across documents", () => {
    expect(totalPageCount(documents)).toBe(5);
    expect(totalPageCount([])).toBe(0);
  });

  it("computes excluded source pages for a partial import", () => {
    expect(excludedSourcePages(5, [1, 2, 3, 4, 5])).toBeUndefined();
    expect(excludedSourcePages(5, [2, 4])).toEqual([1, 3, 5]);
    expect(excludedSourcePages(5, [])).toEqual([1, 2, 3, 4, 5]);
    expect(excludedSourcePages(5, [0, 6, 2])).toEqual([1, 3, 4, 5]);
    expect(excludedSourcePages(0, [1])).toBeUndefined();
  });

  it("keeps a partially imported document limited to its selected pages", () => {
    const partial: DocumentRef = {
      ...pdf("Partial.pdf", 4),
      excludedPages: excludedSourcePages(4, [1, 3]),
    };
    expect(includedLocalPages(partial)).toEqual([1, 3]);
    expect(totalPageCount([partial])).toBe(2);
  });

  it("computes source document starts and ranges", () => {
    expect(documentStartPage(documents, 0)).toBe(1);
    expect(documentStartPage(documents, 1)).toBe(4);
    expect(documentPageRange(documents, 0)).toEqual({ start: 1, end: 3 });
    expect(documentPageRange(documents, 1)).toEqual({ start: 4, end: 5 });
  });

  it("converts source-document pages to local page numbers", () => {
    expect(localPageNumber(documents, 1)).toBe(1);
    expect(localPageNumber(documents, 3)).toBe(3);
    expect(localPageNumber(documents, 4)).toBe(1);
    expect(localPageNumber(documents, 5)).toBe(2);
  });

  it("exposes the primary document", () => {
    expect(primaryDocument(documents)?.name).toBe("Bottom.pdf");
    expect(primaryDocument([])).toBeUndefined();
  });

  it("maps across source pages that are excluded from the project", () => {
    const trimmed = [{ ...pdf("Bottom.pdf", 3), excludedPages: [2] }, pdf("Upper.pdf", 2)];
    expect(includedLocalPages(trimmed[0])).toEqual([1, 3]);
    expect(totalPageCount(trimmed)).toBe(4);
    expect(documentPageMaps(trimmed)).toEqual([
      [1, 3],
      [1, 2],
    ]);
    expect(documentStartPage(trimmed, 1)).toBe(3);
    expect(localPageNumber(trimmed, 2)).toBe(3);
    expect(localPageNumber(trimmed, 3)).toBe(1);
    expect(documentPageRange(trimmed, 0)).toEqual({ start: 1, end: 2 });
  });

  it("uses the first document that still has pages as primary", () => {
    const trimmed = [{ ...pdf("Empty.pdf", 1), excludedPages: [1] }, pdf("Upper.pdf", 2)];
    expect(primaryDocument(trimmed)?.name).toBe("Upper.pdf");
  });
});

function projectWithPages() {
  const project = withTestPageIds(createProject(pdf("Bottom.pdf", 3)));
  project.documents.push(pdf("Upper.pdf", 2));
  project.pages.push({
    id: "page_4",
    documentId: project.documents[1].id,
    localPage: 1,
    state: {},
  });
  project.pages.push({
    id: "page_5",
    documentId: project.documents[1].id,
    localPage: 2,
    state: {},
  });
  return project;
}

describe("stable page identity", () => {
  it("derives display numbers from the page order", () => {
    const project = projectWithPages();
    expect(project.pages).toHaveLength(5);
    expect(pageNumber(project, "page_1")).toBe(1);
    expect(pageNumber(project, "page_4")).toBe(4);
    expect(pageNumber(project, "missing")).toBe(0);
    expect(pageIdAt(project, 2)).toBe(pageIdFor(2));
    expect(pageRecordAt(project, 5)?.localPage).toBe(2);
    expect(currentPageId(project, 3)).toBe(pageIdFor(3));
  });

  it("resolves a source document page to its project page", () => {
    const project = projectWithPages();
    const upper = project.documents[1];
    expect(pageIdForDocumentPage(project, upper.id, 2)).toBe("page_5");
    expect(pageIdForDocumentPage(project, upper.id, 9)).toBeNull();
  });

  it("reports the renderer order as document index plus local page", () => {
    const project = projectWithPages();
    expect(documentPageOrder(project)).toEqual([
      { documentIndex: 0, localPage: 1 },
      { documentIndex: 0, localPage: 2 },
      { documentIndex: 0, localPage: 3 },
      { documentIndex: 1, localPage: 1 },
      { documentIndex: 1, localPage: 2 },
    ]);
    movePage(project, "page_5", 0);
    expect(documentPageOrder(project)[0]).toEqual({ documentIndex: 1, localPage: 2 });
  });

  it("stores page state on the record", () => {
    const project = projectWithPages();
    pageStateOf(project, "page_2")!.name = "Details";
    expect(pageStateOf(project, "page_2")?.name).toBe("Details");
  });
});

describe("page operations", () => {
  function item(id: string, pageId: string) {
    return {
      id,
      pageId,
      kind: "count" as const,
      points: [{ x: 0, y: 0 }],
      color: "#fff",
      strokeWidth: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
  }

  it("inserts a page record at a chosen index without touching other pages", () => {
    const project = projectWithPages();
    const record = insertPage(project, {
      documentId: project.documents[0].id,
      localPage: 1,
      index: 1,
    });
    expect(record).not.toBeNull();
    expect(project.pages[1].id).toBe(record!.id);
    expect(pageNumber(project, "page_2")).toBe(3);
  });

  it("reorders pages without changing any page ID", () => {
    const project = projectWithPages();
    const ids = project.pages.map((page) => page.id);
    expect(movePage(project, "page_5", 0)).toBe(true);
    expect(project.pages.map((page) => page.id)).toEqual([
      "page_5",
      "page_1",
      "page_2",
      "page_3",
      "page_4",
    ]);
    expect(new Set(project.pages.map((page) => page.id))).toEqual(new Set(ids));
  });

  it("deletes a page, its items and its layer state by ID", () => {
    const project = projectWithPages();
    const layer = project.layers.find((entry) => entry.kind === "measure")!;
    layer.items.push(item("a", "page_2"), item("b", "page_3"));
    layer.pageState = { page_2: { visible: false } };
    const summary = deletePage(project, "page_2");
    expect(summary?.removedItems).toBe(1);
    expect(project.pages.map((page) => page.id)).toEqual(["page_1", "page_3", "page_4", "page_5"]);
    expect(layer.items.map((entry) => entry.pageId)).toEqual(["page_3"]);
    expect(layer.pageState).toBeUndefined();
    // Later pages keep their identity; only the display number changes.
    expect(pageNumber(project, "page_3")).toBe(2);
  });

  it("duplicates a page with a new PageId and copies its items", () => {
    const project = projectWithPages();
    const layer = project.layers.find((entry) => entry.kind === "measure")!;
    layer.items.push(item("a", "page_2"));
    pageStateOf(project, "page_2")!.name = "Copy me";
    const summary = duplicatePage(project, "page_2", {
      copyMarkups: true,
      copyScale: true,
      copyName: true,
      name: "Copy",
    });
    expect(summary?.copiedItems).toBe(1);
    const copy = project.pages[project.pages.length - 1];
    expect(copy.id).not.toBe("page_2");
    expect(copy.documentId).toBe(project.pages[1].documentId);
    expect(copy.localPage).toBe(project.pages[1].localPage);
    expect(copy.state.name).toBe("Copy");
    expect(layer.items.find((entry) => entry.pageId === copy.id)?.id).not.toBe("a");
  });

  it("removes an empty layer when it loses its last page", () => {
    const project = projectWithPages();
    const extra = {
      ...project.layers.find((entry) => entry.kind === "measure")!,
      id: "layer_extra",
      name: "Extra",
      items: [],
      pageState: undefined,
      homePageId: "page_2",
    };
    project.layers.push(extra);
    const before = project.layers.length;
    deletePage(project, "page_2");
    expect(project.layers.length).toBe(before - 1);
    expect(project.layers.find((entry) => entry.id === extra.id)).toBeUndefined();
    expect(cleanupEmptyLayers(project)).toBe(0);
  });

  it("supports an empty project", () => {
    const project = withTestPageIds(createProject());
    expect(project.pages).toEqual([]);
    expect(project.documents).toEqual([]);
    expect(project.layers.map((layer) => layer.kind)).toEqual(["draw", "measure"]);
  });
});

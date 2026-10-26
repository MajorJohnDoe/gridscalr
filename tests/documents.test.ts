import { describe, expect, it } from "vitest";
import {
  deletePageFromProject,
  documentIndexForPage,
  duplicatePageFromProject,
  pageDisplayName,
  documentPageMaps,
  documentPageRange,
  documentStartPage,
  excludedSourcePages,
  includedLocalPages,
  localPageNumber,
  pageDocumentLabel,
  primaryDocument,
  totalPageCount,
} from "../src/model/documents";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
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

function pageProject() {
  const project = createProject(pdf("Bottom.pdf", 3), createDefaultLayers());
  project.documents.push(pdf("Upper.pdf", 1));
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  measure.items = [
    {
      id: "p1",
      page: 1,
      kind: "count",
      points: [{ x: 0, y: 0 }],
      color: "#fff",
      strokeWidth: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "p2",
      page: 2,
      kind: "count",
      points: [{ x: 0, y: 0 }],
      color: "#fff",
      strokeWidth: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "p3",
      page: 3,
      kind: "count",
      points: [{ x: 0, y: 0 }],
      color: "#fff",
      strokeWidth: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "p4",
      page: 4,
      kind: "count",
      points: [{ x: 0, y: 0 }],
      color: "#fff",
      strokeWidth: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];
  project.pages = { "1": {}, "2": {}, "3": {}, "4": {} };
  return project;
}

const now = "2026-01-01T00:00:00.000Z";

describe("page deletion", () => {
  it("removes the page, its items, and remaps later pages", () => {
    const project = pageProject();
    const result = deletePageFromProject(project, 2);
    expect(result).toEqual({ page: 2, removedDocumentIndex: null });
    expect(totalPageCount(project.documents)).toBe(3);
    expect(project.documents[0].excludedPages).toEqual([2]);
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    expect(measure.items.map((item) => [item.id, item.page])).toEqual([
      ["p1", 1],
      ["p3", 2],
      ["p4", 3],
    ]);
    expect(Object.keys(project.pages)).toEqual(["1", "2", "3"]);
  });

  it("removes a document when its last included page is deleted", () => {
    const project = pageProject();
    const result = deletePageFromProject(project, 4);
    expect(result).toEqual({ page: 3, removedDocumentIndex: 1 });
    expect(project.documents.map((document) => document.name)).toEqual(["Bottom.pdf"]);
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    expect(measure.items.map((item) => item.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("refuses to delete the last remaining page", () => {
    const project = createProject(pdf("Only.pdf", 1), createDefaultLayers());
    expect(deletePageFromProject(project, 1)).toBeNull();
  });

  it("refuses pages outside the project", () => {
    const project = pageProject();
    expect(deletePageFromProject(project, 0)).toBeNull();
    expect(deletePageFromProject(project, 99)).toBeNull();
  });

  it("remaps page-scoped layer state and home pages", () => {
    const project = pageProject();
    const layer = project.layers.find((entry) => entry.kind === "measure")!;
    layer.homePage = 2;
    layer.pageState = {
      "2": { visible: false },
      "3": { locked: true },
    };
    project.pages["3"].name = "Detail";
    deletePageFromProject(project, 2);
    expect(layer.homePage).toBe(2);
    expect(layer.pageState).toEqual({ "2": { locked: true } });
    expect(project.pages["2"].name).toBe("Detail");
  });
});

describe("page duplication", () => {
  function duplicateProject() {
    const project = pageProject();
    project.pages["2"] = {
      name: "Windows",
      calibration: {
        id: "cal_2",
        source: "reference",
        p1: { x: 0, y: 0 },
        p2: { x: 100, y: 0 },
        knownLength: 10,
        unit: "m",
        pointsPerMeter: 10,
        createdAt: now,
      },
      scaleLocked: true,
    };
    const layer = project.layers.find((entry) => entry.kind === "measure")!;
    layer.homePage = 1;
    layer.pageState = { "2": { visible: false } };
    return { project, layer };
  }

  it("appends a page copy with scale, name, layer state and markups", () => {
    const { project, layer } = duplicateProject();
    const result = duplicatePageFromProject(project, 2, {
      copyMarkups: true,
      copyScale: true,
      copyName: true,
      name: "Windows copy",
    });
    expect(result).toEqual({ page: 5, sourceDocumentIndex: 0, sourceLocalPage: 2 });
    expect(project.documents).toHaveLength(3);
    const copyDocument = project.documents[2];
    expect(copyDocument.excludedPages).toEqual([1, 3]);
    expect(copyDocument.copiedFrom).toEqual({ documentId: project.documents[0].id, page: 2 });
    expect(project.pages["5"]).toMatchObject({
      name: "Windows copy",
      scaleLocked: true,
      calibration: { id: "cal_2", pointsPerMeter: 10 },
    });
    const copied = layer.items.filter((item) => item.page === 5);
    expect(copied).toHaveLength(1);
    expect(copied[0].id).not.toBe("p2");
    expect(layer.pageState?.["5"]).toEqual({ visible: false });
    expect(pageDisplayName(project, 5)).toBe("Windows copy");
  });

  it("can omit markups, scale and name", () => {
    const { project, layer } = duplicateProject();
    const result = duplicatePageFromProject(project, 2, {
      copyMarkups: false,
      copyScale: false,
      copyName: false,
      name: "Ignored",
    });
    expect(result?.page).toBe(5);
    expect(project.pages["5"]).toBeUndefined();
    expect(layer.items.filter((item) => item.page === 5)).toHaveLength(0);
    expect(layer.pageState?.["5"]).toEqual({ visible: false });
  });
});

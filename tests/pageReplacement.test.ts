import { describe, expect, it } from "vitest";
import {
  applySourceReplacement,
  defaultReplacementMappings,
  pagesForDocument,
  replacementWarnings,
} from "../src/features/pageModel/replacement";
import { removeDocumentAndPages } from "../src/features/pageModel";
import { createProject, defaultDocument } from "../src/model/layers";
import type { DocumentRef } from "../src/model/types";
import { parseProject } from "../src/io/projectFile";
import { serializeProject } from "../src/io/projectFile/serialize";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";

function item(id: string, pageId: string) {
  return {
    id,
    pageId,
    kind: "count" as const,
    points: [{ x: 0, y: 0 }],
    color: "#fff",
    strokeWidth: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeProject() {
  const project = withTestPageIds(createProject(defaultDocument("Old.pdf", 3)));
  const layer = project.layers.find((entry) => entry.kind === "measure")!;
  layer.items.push(item("a", pageIdFor(1)), item("b", pageIdFor(3)));
  project.pages[0].state.name = "Ground";
  project.pages[0].state.scaleLocked = true;
  return project;
}

function newSource(pageCount: number): DocumentRef {
  return {
    ...defaultDocument("New.pdf", pageCount),
    id: "doc_new",
    sha256: "hash_new",
    sizeBytes: 999,
    pageCount,
  };
}

describe("source replacement", () => {
  it("maps old pages to the same source index by default", () => {
    const project = makeProject();
    expect(defaultReplacementMappings(project, project.documents[0].id, 5)).toEqual([
      { pageId: pageIdFor(1), newLocalPage: 1 },
      { pageId: pageIdFor(2), newLocalPage: 2 },
      { pageId: pageIdFor(3), newLocalPage: 3 },
    ]);
    expect(defaultReplacementMappings(project, project.documents[0].id, 2)[2].newLocalPage).toBe(2);
  });

  it("updates the existing document when every page is mapped", () => {
    const project = makeProject();
    const result = applySourceReplacement(project, {
      documentId: project.documents[0].id,
      newDocument: { ...newSource(3), id: "doc_ignored" },
      mappings: [
        { pageId: pageIdFor(1), newLocalPage: 3 },
        { pageId: pageIdFor(2), newLocalPage: 1 },
        { pageId: pageIdFor(3), newLocalPage: 2 },
      ],
    });
    expect(result).toMatchObject({ updatedDocument: true, mappedPages: 3, supersededPages: 0 });
    expect(project.documents).toHaveLength(1);
    expect(project.documents[0].name).toBe("New.pdf");
    expect(project.documents[0].sha256).toBe("hash_new");
    expect(project.documents[0].superseded).toBeUndefined();
    // Identity and item references survive a reordered source.
    expect(project.pages.map((page) => page.id)).toEqual([
      pageIdFor(1),
      pageIdFor(2),
      pageIdFor(3),
    ]);
    expect(project.pages.map((page) => page.localPage)).toEqual([3, 1, 2]);
    expect(project.pages[0].state.name).toBe("Ground");
    expect(project.pages[0].state.scaleLocked).toBe(true);
    const layer = project.layers.find((entry) => entry.kind === "measure")!;
    expect(layer.items.map((entry) => entry.pageId)).toEqual([pageIdFor(1), pageIdFor(3)]);
  });

  it("keeps unmatched pages on a superseded document", () => {
    const project = makeProject();
    const oldId = project.documents[0].id;
    const result = applySourceReplacement(project, {
      documentId: oldId,
      newDocument: newSource(2),
      mappings: [
        { pageId: pageIdFor(1), newLocalPage: 2 },
        { pageId: pageIdFor(3), newLocalPage: 1 },
      ],
    });
    expect(result).toMatchObject({ updatedDocument: false, mappedPages: 2, supersededPages: 1 });
    expect(project.documents).toHaveLength(2);
    const oldDocument = project.documents.find((entry) => entry.id === oldId)!;
    expect(oldDocument.superseded).toBe(true);
    expect(project.pages[0].documentId).toBe("doc_new");
    expect(project.pages[0].localPage).toBe(2);
    expect(project.pages[1].documentId).toBe(oldId);
    expect(project.pages[2].documentId).toBe("doc_new");
    // Items keep pointing at their stable page; the unmatched page still has one.
    const layer = project.layers.find((entry) => entry.kind === "measure")!;
    expect(layer.items.map((entry) => entry.pageId)).toEqual([pageIdFor(1), pageIdFor(3)]);
    expect(pagesForDocument(project, oldId)).toEqual([pageIdFor(2)]);
    const reloaded = parseProject(serializeProject(project));
    expect(reloaded.documents.find((entry) => entry.id === oldId)?.superseded).toBe(true);
  });

  it("ignores invalid mappings and refuses an empty map", () => {
    const project = makeProject();
    expect(
      applySourceReplacement(project, {
        documentId: project.documents[0].id,
        newDocument: newSource(2),
        mappings: [{ pageId: pageIdFor(1), newLocalPage: 9 }],
      }),
    ).toBeNull();
    expect(
      applySourceReplacement(project, {
        documentId: "missing",
        newDocument: newSource(2),
        mappings: [],
      }),
    ).toBeNull();
  });

  it("removes superseded pages only during explicit cleanup", () => {
    const project = makeProject();
    applySourceReplacement(project, {
      documentId: project.documents[0].id,
      newDocument: newSource(2),
      mappings: [{ pageId: pageIdFor(1), newLocalPage: 1 }],
    });
    expect(project.pages).toHaveLength(3);
    const removed = removeDocumentAndPages(project, project.documents[0].id);
    expect(removed).toBe(2);
    expect(project.pages.map((page) => page.id)).toEqual([pageIdFor(1)]);
  });

  it("reports page-count, calibration and lock warnings", () => {
    expect(
      replacementWarnings({
        oldPageCount: 3,
        newPageCount: 2,
        calibratedPages: 1,
        scaleLockedPages: 1,
      }),
    ).toEqual(["pageCount", "calibration", "scaleLocked"]);
    expect(
      replacementWarnings({
        oldPageCount: 2,
        newPageCount: 2,
        calibratedPages: 0,
        scaleLockedPages: 0,
      }),
    ).toEqual([]);
  });
});

// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  commitProjectImport,
  prepareProjectImport,
  type ImportDocumentOverride,
} from "../src/features/projectImport";
import { applyImportManagedCopy, type ManagedCopyInfo } from "../src/features/sourceStorage";
import { createProject, defaultDocument } from "../src/model/layers";
import { store } from "../src/state/store";
import type { DocumentRef, Project } from "../src/model/types";

const PATH = "/tmp/import-copy/Import.gridscalr";
const SOURCE_SHA = "a".repeat(64);

function destinationProject(): Project {
  return createProject(defaultDocument("Existing.pdf", 2));
}

function sourceProject(): Project {
  return createProject(defaultDocument("Level 01.pdf", 1));
}

function preparedImport(destination: Project, source: Project) {
  const sourceDocument = source.documents[0];
  const overrides = new Map<string, ImportDocumentOverride>([
    [
      sourceDocument.id,
      {
        pageCount: 1,
        path: "/home/ana/OneDrive/Level 01.pdf",
        sha256: SOURCE_SHA,
        sizeBytes: 2048,
      },
    ],
  ]);
  return prepareProjectImport(destination, source, [1], overrides);
}

const COPY: ManagedCopyInfo = {
  destinationPath: "/tmp/import-copy/Import.drawings/Level 01-aaaaaaaa.pdf",
  relativePath: "Import.drawings/Level 01-aaaaaaaa.pdf",
  sha256: SOURCE_SHA,
  sizeBytes: 2048,
};

beforeEach(() => {
  store.project = null;
  store.projectPath = null;
  store.fileStamp = null;
  store.dirty = false;
  store.readOnly = false;
});

describe("managed copy inside a drop import", () => {
  it("applies the copy in the import mutation so one undo removes both", () => {
    const destination = destinationProject();
    store.setProject(destination, PATH, false);
    const beforeIds = destination.pages.map((page) => page.id);
    const beforeDocuments = destination.documents.map((document) => document.id);
    const source = sourceProject();
    const prepared = preparedImport(destination, source);
    const importedDocument = prepared.documents[0];

    store.mutate((project) => {
      commitProjectImport(project, prepared);
      expect(
        applyImportManagedCopy(project, {
          documentId: importedDocument.id,
          copy: COPY,
          originalPath: "/home/ana/OneDrive/Level 01.pdf",
          originalSha256: SOURCE_SHA,
        }),
      ).toBe(true);
    }, "project");

    const imported = store.project!.documents.find(
      (document) => document.id === importedDocument.id,
    ) as DocumentRef;
    expect(imported.storage).toBe("managed");
    expect(imported.path).toBe(COPY.destinationPath);
    expect(imported.originalPath).toBe("/home/ana/OneDrive/Level 01.pdf");
    expect(store.project!.pages).toHaveLength(beforeIds.length + 1);
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(store.project!.pages.map((page) => page.id)).toEqual(beforeIds);
    expect(store.project!.documents.map((document) => document.id)).toEqual(beforeDocuments);
    expect(store.project!.documents.some((document) => document.id === importedDocument.id)).toBe(
      false,
    );
  });

  it("does nothing when the imported document is not in the project", () => {
    const destination = destinationProject();
    expect(
      applyImportManagedCopy(destination, {
        documentId: "doc_missing",
        copy: COPY,
        originalPath: null,
        originalSha256: SOURCE_SHA,
      }),
    ).toBe(false);
  });
});

// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ProjectImport from "../src/features/projectImport";

vi.mock("../src/app/documentImport", async () => {
  const { defaultDocument } = await import("../src/model/layers");
  const pdf = {
    numPages: 1,
    loadingTask: { destroy: vi.fn(async () => undefined) },
  };
  return {
    createImportedDocument: vi.fn(async () => {
      const documentRef = defaultDocument("Level 01.pdf", 1);
      documentRef.sha256 = "a".repeat(64);
      documentRef.path = "/home/ana/OneDrive/Level 01.pdf";
      documentRef.sizeBytes = 2048;
      return { documentRef };
    }),
    openDocument: vi.fn(async () => pdf),
    chooseImportPages: vi.fn(async () => [1]),
  };
});

vi.mock("../src/features/projectImport", async (importOriginal) => {
  const actual = await importOriginal<typeof ProjectImport>();
  return {
    ...actual,
    projectImportPreflightDialog: vi.fn(async () => ({ confirmed: true })),
  };
});

import { chooseImportPages } from "../src/app/documentImport";
import { importDroppedDrawing, type DroppedDrawingHost } from "../src/app/droppedDrawingFlows";
import { clearAllRecovery } from "../src/features/sessionRecovery";
import type { ManagedCopyInfo } from "../src/features/sourceStorage";
import { createProject, defaultDocument } from "../src/model/layers";
import type { DocumentRef, Project } from "../src/model/types";
import { store } from "../src/state/store";

const PATH = "/tmp/dropped-import/Dropped.gridscalr";

const COPY: ManagedCopyInfo = {
  destinationPath: "/tmp/dropped-import/Dropped.drawings/Level 01-aaaaaaaa.pdf",
  relativePath: "Dropped.drawings/Level 01-aaaaaaaa.pdf",
  sha256: "a".repeat(64),
  sizeBytes: 2048,
};

function destinationProject(): Project {
  return createProject(defaultDocument("Existing.pdf", 2));
}

function host(overrides: Partial<DroppedDrawingHost> = {}): DroppedDrawingHost {
  return {
    renderer: () => ({}) as never,
    rendererBusy: () => false,
    recommendSourceStorage: vi.fn(async () => true),
    prepareSourceStorage: vi.fn(async () => COPY),
    addImportedDocuments: vi.fn(),
    enqueuePageSize: vi.fn(async () => undefined),
    resetPageSizes: vi.fn(),
    fitPage: vi.fn(),
    invalidate: vi.fn(),
    renderAll: vi.fn(),
    closeSearch: vi.fn(),
    ...overrides,
  };
}

function droppedFile() {
  return {
    name: "Level 01.pdf",
    path: "/home/ana/OneDrive/Level 01.pdf",
    file: { arrayBuffer: async () => new ArrayBuffer(8) } as unknown as File,
  };
}

beforeEach(async () => {
  store.project = null;
  store.projectPath = null;
  store.fileStamp = null;
  store.dirty = false;
  store.readOnly = false;
  vi.mocked(chooseImportPages).mockClear();
  await clearAllRecovery().catch(() => undefined);
});

describe("a Pages-panel drawing drop", () => {
  it("imports at the drop position and applies a managed copy in one history step", async () => {
    const destination = destinationProject();
    store.setProject(destination, PATH, false);
    const beforePages = destination.pages.map((page) => page.id);
    const beforeDocuments = destination.documents.map((document) => document.id);
    const drawingHost = host();

    await importDroppedDrawing(drawingHost, droppedFile(), 1);

    // The page picker receives the drop position, not just a page count.
    expect(vi.mocked(chooseImportPages).mock.calls[0]?.[4]).toMatchObject({
      index: 1,
      destinationPages: 2,
    });
    const imported = store.project!.documents.find(
      (document) => !beforeDocuments.includes(document.id),
    ) as DocumentRef;
    expect(imported?.storage).toBe("managed");
    expect(imported?.path).toBe(COPY.destinationPath);
    expect(imported?.originalPath).toBe("/home/ana/OneDrive/Level 01.pdf");
    expect(store.project!.pages).toHaveLength(3);
    expect(drawingHost.addImportedDocuments).toHaveBeenCalledOnce();
    expect(store.canUndo).toBe(true);

    // One Undo removes the pages and the managed document reference together.
    store.undo();
    expect(store.project!.pages.map((page) => page.id)).toEqual(beforePages);
    expect(store.project!.documents.map((document) => document.id)).toEqual(beforeDocuments);
  });

  it("keeps an ordinary reference import when no managed copy is recommended", async () => {
    const destination = destinationProject();
    store.setProject(destination, PATH, false);
    const beforeDocuments = new Set(destination.documents.map((document) => document.id));
    const drawingHost = host({
      recommendSourceStorage: vi.fn(async () => false),
      prepareSourceStorage: vi.fn(async () => null),
    });

    await importDroppedDrawing(drawingHost, droppedFile(), 2);

    expect(drawingHost.prepareSourceStorage).not.toHaveBeenCalled();
    expect(store.project!.pages).toHaveLength(3);
    const imported = store.project!.documents.find((document) => !beforeDocuments.has(document.id));
    expect(imported?.storage).toBe("reference");
    expect(store.canUndo).toBe(true);
    store.undo();
    expect(store.project!.pages).toHaveLength(2);
  });
});

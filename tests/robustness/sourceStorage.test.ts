// @vitest-environment jsdom
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTestPageIds } from "../helpers/pages";
import {
  copyDocumentIntoProject,
  consolidateDrawings,
} from "../../src/features/sourceStorage/copyActions";
import {
  detachManagedCopy,
  documentSourceKey,
  documentStorage,
  isManagedDocument,
  prepareReplacementDocument,
  preservesManagedStorage,
  sourceChangeActions,
} from "../../src/features/sourceStorage";
import type { SourceStorageHost } from "../../src/features/sourceStorage";
import { commitProjectImport, prepareProjectImport } from "../../src/features/projectImport/model";
import {
  applySourceReplacement,
  defaultReplacementMappings,
  deletePage,
  movePage,
  pagesForDocument,
} from "../../src/features/pageModel";
import { parseProject, serializeProject } from "../../src/io/projectFile";
import { createProject, defaultDocument } from "../../src/model/layers";
import type { DocumentRef, Project } from "../../src/model/types";
import { documentArchivePaths, portableProjectJson } from "../../src/features/projectPackage/model";
import { store } from "../../src/state/store";

const mocks = vi.hoisted(() => ({
  copySourceToProject: vi.fn(),
  sourceFileHash: vi.fn(),
  confirmDialog: vi.fn(),
  messageDialog: vi.fn(),
}));

vi.mock("../../src/features/sourceStorage/files", () => ({
  copySourceToProject: mocks.copySourceToProject,
  sourceFileHash: mocks.sourceFileHash,
  findSourceByHash: vi.fn(),
}));

vi.mock("../../src/ui/dialogs", () => ({
  confirmDialog: mocks.confirmDialog,
  messageDialog: mocks.messageDialog,
}));

const NOW = "2026-01-01T00:00:00.000Z";
const temporaryDirectories: string[] = [];

function hash(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "gridscalr-robustness-"));
  temporaryDirectories.push(directory);
  return directory;
}

function host(): SourceStorageHost {
  return {
    desktop: true,
    bannerHost: document.createElement("div"),
    notify: vi.fn(),
    ensureSaved: async () => true,
    probePdf: async () => 1,
    reloadDocument: async () => true,
    replaceSource: vi.fn(),
    checkpoint: async () => undefined,
    afterChange: vi.fn(),
  };
}

function referenceDocument(name: string, pageCount: number): DocumentRef {
  return {
    ...defaultDocument(name, pageCount),
    id: `doc_${name.replace(/\W+/g, "_")}`,
    sha256: hash(`${name}:${pageCount}`),
    sizeBytes: 100,
  };
}

function projectWithPages(): Project {
  const project = withTestPageIds(createProject(referenceDocument("Plan.pdf", 3)));
  const upper = referenceDocument("Upper.pdf", 2);
  project.documents.push(upper);
  project.pages.push(
    { id: "page_4", documentId: upper.id, localPage: 1, state: {} },
    { id: "page_5", documentId: upper.id, localPage: 2, state: {} },
  );
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  for (const page of project.pages) {
    measure.items.push({
      id: `item_${page.id}`,
      pageId: page.id,
      kind: "length",
      points: [
        { x: 10, y: 10 },
        { x: 110, y: 10 },
      ],
      color: "#4cc9f0",
      strokeWidth: 2,
      categoryId: project.settings.quantity.defaultCategoryId,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  return project;
}

function sourceProject(): Project {
  const project = withTestPageIds(createProject(referenceDocument("Source.pdf", 2)));
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  for (const page of project.pages) {
    measure.items.push({
      id: `source_${page.id}`,
      pageId: page.id,
      kind: "length",
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
      ],
      color: "#4cc9f0",
      strokeWidth: 2,
      categoryId: project.settings.quantity.defaultCategoryId,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  return project;
}

beforeEach(() => {
  store.project = null;
  store.projectPath = null;
  store.fileStamp = null;
  store.dirty = false;
  vi.clearAllMocks();
  mocks.confirmDialog.mockResolvedValue(true);
  mocks.messageDialog.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("source storage robustness", () => {
  it("distinguishes reference and managed documents by explicit mode", () => {
    const reference = referenceDocument("Plan.pdf", 1);
    reference.kind = "pdf";
    expect(documentStorage(reference)).toBe("reference");
    expect(isManagedDocument(reference)).toBe(false);

    const managed = { ...reference, storage: "managed" as const };
    expect(documentStorage(managed)).toBe("managed");
    expect(isManagedDocument(managed)).toBe(true);
    expect(sourceChangeActions(managed)).toEqual(["reload", "useCurrent", "relink"]);
    expect(sourceChangeActions(reference)).toEqual([
      "reload",
      "useCurrent",
      "relink",
      "copyIntoProject",
    ]);
  });

  it("uses the managed relative path, not the display name, as the copy identity", () => {
    const first: DocumentRef = {
      ...referenceDocument("Plan.pdf", 1),
      storage: "managed",
      relativePath: "Level 01.drawings/Plan-aaaaaaaa.pdf",
    };
    const second: DocumentRef = {
      ...first,
      id: "doc_copy",
      name: "Renamed.pdf",
    };
    expect(documentSourceKey(first)).toBe(documentSourceKey(second));
    expect(documentSourceKey({ ...first, relativePath: "Level 01.drawings/Other.pdf" })).not.toBe(
      documentSourceKey(first),
    );
  });

  it("consolidates into a verified copy without writing the original", async () => {
    const directory = temporaryDirectory();
    const sourcePath = path.join(directory, "Plan.pdf");
    const sourceBytes = Buffer.from("%PDF-1.4 original drawing bytes");
    writeFileSync(sourcePath, sourceBytes);
    const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
    const projectPath = path.join(directory, "Level 01.gridscalr");
    const document = project.documents[0];
    document.path = sourcePath;
    document.relativePath = "Plan.pdf";
    document.sha256 = hash(sourceBytes);
    document.sizeBytes = sourceBytes.length;
    store.setProject(project, projectPath, false);

    mocks.sourceFileHash.mockImplementation(async (candidate: string) => {
      const bytes = readFileSync(candidate);
      return { path: candidate, sha256: hash(bytes), sizeBytes: bytes.length };
    });
    mocks.copySourceToProject.mockImplementation(
      async (request: { sourcePath: string; projectPath: string; displayName: string }) => {
        const bytes = readFileSync(request.sourcePath);
        const sha256 = hash(bytes);
        const stem = path.basename(request.projectPath).replace(/\.gridscalr$/i, "");
        const folder = path.join(path.dirname(request.projectPath), `${stem}.drawings`);
        mkdirSync(folder, { recursive: true });
        const fileName = `${path.basename(request.displayName, ".pdf")}-${sha256.slice(0, 8)}.pdf`;
        const destinationPath = path.join(folder, fileName);
        writeFileSync(destinationPath, bytes);
        return {
          destinationPath,
          relativePath: `${stem}.drawings/${fileName}`,
          sha256,
          sizeBytes: bytes.length,
        };
      },
    );

    await consolidateDrawings(host());

    expect(readFileSync(sourcePath)).toEqual(sourceBytes);
    expect(document.storage).toBe("managed");
    expect(document.originalPath).toBe(sourcePath);
    expect(document.originalSha256).toBe(hash(sourceBytes));
    expect(document.relativePath).toMatch(/^Level 01\.drawings\/Plan-[\da-f]{8}\.pdf$/);
    expect(readFileSync(document.path!)).toEqual(sourceBytes);
    expect(hash(readFileSync(document.path!))).toBe(document.sha256);
  });

  it("never auto-accepts a changed reference before copying it", async () => {
    const directory = temporaryDirectory();
    const sourcePath = path.join(directory, "Plan.pdf");
    const sourceBytes = Buffer.from("%PDF-1.4 changed drawing");
    writeFileSync(sourcePath, sourceBytes);
    const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
    const document = project.documents[0];
    document.path = sourcePath;
    document.relativePath = "Plan.pdf";
    document.sha256 = "0".repeat(64);
    document.sizeBytes = sourceBytes.length;
    store.setProject(project, path.join(directory, "Level 01.gridscalr"), false);

    mocks.sourceFileHash.mockImplementation(async (candidate: string) => {
      const bytes = readFileSync(candidate);
      return { path: candidate, sha256: hash(bytes), sizeBytes: bytes.length };
    });

    expect(await copyDocumentIntoProject(host(), document.id)).toBe(false);
    expect(mocks.copySourceToProject).not.toHaveBeenCalled();
    expect(document.storage).not.toBe("managed");
    expect(document.path).toBe(sourcePath);
    expect(document.sha256).toBe("0".repeat(64));
    expect(mocks.messageDialog).toHaveBeenCalled();
    expect(readFileSync(sourcePath)).toEqual(sourceBytes);
  });

  it("includes a managed drawing once in a package", () => {
    const first: DocumentRef = {
      ...referenceDocument("Plan.pdf", 2),
      storage: "managed",
      path: "/work/Level 01.drawings/Plan-aaaaaaaa.pdf",
      relativePath: "Level 01.drawings/Plan-aaaaaaaa.pdf",
      originalPath: "/home/ana/OneDrive/Plan.pdf",
      originalSha256: "b".repeat(64),
    };
    const second: DocumentRef = {
      ...first,
      id: "doc_duplicate",
      name: "Duplicate.pdf",
    };
    const project = createProject();
    project.documents.push(first, second);

    const paths = documentArchivePaths(project);
    expect(paths.get(first.id)).toBe(paths.get(second.id));
    expect(new Set(paths.values()).size).toBe(1);

    const json = portableProjectJson(project, paths);
    const packaged = JSON.parse(json) as Project;
    expect(packaged.documents[0].storage).toBe("managed");
    expect(packaged.documents[0].originalPath).toBeNull();
    expect(json).not.toContain("/home/ana/OneDrive");
  });

  it("saves, loads and later fills an empty project", () => {
    const empty = createProject();
    const loaded = parseProject(serializeProject(empty));
    expect(loaded.documents).toEqual([]);
    expect(loaded.pages).toEqual([]);

    const source = sourceProject();
    const prepared = prepareProjectImport(loaded, source, [1, 2]);
    commitProjectImport(loaded, prepared);
    expect(loaded.documents).toHaveLength(1);
    expect(loaded.pages).toHaveLength(2);
    const reloaded = parseProject(serializeProject(loaded));
    expect(reloaded.pages.map((page) => page.id)).toEqual(loaded.pages.map((page) => page.id));
    expect(reloaded.layers.flatMap((layer) => layer.items)).toHaveLength(2);
  });

  it("keeps page identity through reorder, delete and source replacement", () => {
    const project = projectWithPages();
    const pageIds = project.pages.map((page) => page.id);
    const itemPages = new Map(
      project.layers.flatMap((layer) => layer.items.map((item) => [item.id, item.pageId])),
    );

    expect(movePage(project, "page_5", 0)).toBe(true);
    expect(new Set(project.pages.map((page) => page.id))).toEqual(new Set(pageIds));
    for (const [id, pageId] of itemPages) {
      const item = project.layers.flatMap((layer) => layer.items).find((entry) => entry.id === id);
      if (item) expect(item.pageId).toBe(pageId);
    }

    const removed = deletePage(project, "page_2");
    expect(removed?.pageId).toBe("page_2");
    expect(project.pages.some((page) => page.id === "page_2")).toBe(false);
    expect(project.pages.some((page) => page.id === "page_4")).toBe(true);
    for (const [id, pageId] of itemPages) {
      const item = project.layers.flatMap((layer) => layer.items).find((entry) => entry.id === id);
      if (item && pageId !== "page_2") expect(item.pageId).toBe(pageId);
    }

    const document = project.documents[0];
    const mappedIds = pagesForDocument(project, document.id);
    const beforeReplacementIds = project.pages.map((page) => page.id);
    const mappings = defaultReplacementMappings(project, document.id, 3);
    const replacement = { ...referenceDocument("Revision B.pdf", 3), id: "doc_revision_b" };
    const applied = applySourceReplacement(project, {
      documentId: document.id,
      newDocument: replacement,
      mappings,
    });
    expect(applied?.mappedPages).toBe(mappings.length);
    expect(project.pages.map((page) => page.id)).toEqual(beforeReplacementIds);
    for (const pageId of mappedIds) {
      expect(project.pages.some((page) => page.id === pageId)).toBe(true);
    }
    for (const [id, pageId] of itemPages) {
      const item = project.layers.flatMap((layer) => layer.items).find((entry) => entry.id === id);
      if (item && pageId !== "page_2") expect(item.pageId).toBe(pageId);
    }
  });

  it("keeps managed storage by copying a replacement into the project", async () => {
    const directory = temporaryDirectory();
    const sourcePath = path.join(directory, "Revision B.pdf");
    const sourceBytes = Buffer.from("%PDF-1.4 revision b");
    writeFileSync(sourcePath, sourceBytes);
    const project = withTestPageIds(createProject(defaultDocument("Old.pdf", 1)));
    const projectPath = path.join(directory, "Level 01.gridscalr");
    const oldDocument: DocumentRef = {
      ...project.documents[0],
      storage: "managed",
      path: path.join(directory, "Level 01.drawings", "Old-aaaaaaaa.pdf"),
      relativePath: "Level 01.drawings/Old-aaaaaaaa.pdf",
      originalPath: "/home/ana/OneDrive/Old.pdf",
      originalSha256: "1".repeat(64),
    };
    project.documents[0] = oldDocument;
    const newDocument: DocumentRef = {
      ...referenceDocument("Revision B.pdf", 1),
      path: sourcePath,
      sha256: hash(sourceBytes),
      sizeBytes: sourceBytes.length,
    };
    const destinationPath = path.join(directory, "Level 01.drawings", "Revision B-bbbbbbbb.pdf");
    mocks.copySourceToProject.mockResolvedValue({
      destinationPath,
      relativePath: "Level 01.drawings/Revision B-bbbbbbbb.pdf",
      sha256: hash(sourceBytes),
      sizeBytes: sourceBytes.length,
    });

    expect(preservesManagedStorage(oldDocument)).toBe(true);
    const prepared = await prepareReplacementDocument({
      project,
      projectPath,
      oldDocument,
      newDocument,
      sourcePath,
    });

    expect(mocks.copySourceToProject).toHaveBeenCalledTimes(1);
    expect(prepared?.storage).toBe("managed");
    expect(prepared?.path).toBe(destinationPath);
    expect(prepared?.relativePath).toBe("Level 01.drawings/Revision B-bbbbbbbb.pdf");
    expect(prepared?.sha256).toBe(hash(sourceBytes));
    expect(prepared?.originalPath).toBe(sourcePath);
    expect(prepared?.originalSha256).toBe(hash(sourceBytes));
    // The old file is never removed or rewritten by the preparation.
    expect(oldDocument.path).toContain("Old-aaaaaaaa.pdf");
    expect(readFileSync(sourcePath)).toEqual(sourceBytes);
  });

  it("returns a reference replacement unchanged without copying", async () => {
    const directory = temporaryDirectory();
    const sourcePath = path.join(directory, "Revision B.pdf");
    writeFileSync(sourcePath, Buffer.from("%PDF-1.4 revision b"));
    const project = withTestPageIds(createProject(defaultDocument("Old.pdf", 1)));
    const oldDocument = project.documents[0];
    const newDocument = referenceDocument("Revision B.pdf", 1);

    expect(preservesManagedStorage(oldDocument)).toBe(false);
    const prepared = await prepareReplacementDocument({
      project,
      projectPath: path.join(directory, "Level 01.gridscalr"),
      oldDocument,
      newDocument,
      sourcePath,
    });

    expect(prepared).toBe(newDocument);
    expect(mocks.copySourceToProject).not.toHaveBeenCalled();
    expect(mocks.messageDialog).not.toHaveBeenCalled();
  });

  it("aborts a managed replacement when the copy fails", async () => {
    const directory = temporaryDirectory();
    const sourcePath = path.join(directory, "Revision B.pdf");
    writeFileSync(sourcePath, Buffer.from("%PDF-1.4 revision b"));
    const project = withTestPageIds(createProject(defaultDocument("Old.pdf", 1)));
    const oldDocument: DocumentRef = {
      ...project.documents[0],
      storage: "managed",
      path: path.join(directory, "Level 01.drawings", "Old-aaaaaaaa.pdf"),
      relativePath: "Level 01.drawings/Old-aaaaaaaa.pdf",
    };
    const newDocument = referenceDocument("Revision B.pdf", 1);
    mocks.copySourceToProject.mockRejectedValue(new Error("disk full"));

    expect(
      await prepareReplacementDocument({
        project,
        projectPath: path.join(directory, "Level 01.gridscalr"),
        oldDocument,
        newDocument,
        sourcePath,
      }),
    ).toBeNull();
    expect(mocks.messageDialog).toHaveBeenCalledTimes(1);
    // Nothing about the old document changed on a failed copy.
    expect(oldDocument.storage).toBe("managed");
    expect(oldDocument.path).toContain("Old-aaaaaaaa.pdf");
    expect(readFileSync(sourcePath)).toEqual(Buffer.from("%PDF-1.4 revision b"));
  });

  it("refuses a managed replacement whose copied checksum does not match", async () => {
    const directory = temporaryDirectory();
    const sourcePath = path.join(directory, "Revision B.pdf");
    writeFileSync(sourcePath, Buffer.from("%PDF-1.4 revision b"));
    const project = withTestPageIds(createProject(defaultDocument("Old.pdf", 1)));
    const oldDocument: DocumentRef = {
      ...project.documents[0],
      storage: "managed",
      path: path.join(directory, "Level 01.drawings", "Old-aaaaaaaa.pdf"),
      relativePath: "Level 01.drawings/Old-aaaaaaaa.pdf",
    };
    mocks.copySourceToProject.mockResolvedValue({
      destinationPath: path.join(directory, "Level 01.drawings", "Wrong-cccccccc.pdf"),
      relativePath: "Level 01.drawings/Wrong-cccccccc.pdf",
      sha256: "0".repeat(64),
      sizeBytes: 10,
    });

    expect(
      await prepareReplacementDocument({
        project,
        projectPath: path.join(directory, "Level 01.gridscalr"),
        oldDocument,
        newDocument: referenceDocument("Revision B.pdf", 1),
        sourcePath,
      }),
    ).toBeNull();
    expect(mocks.messageDialog).toHaveBeenCalledTimes(1);
  });

  it("detaches a managed copy without changing its identity or bytes", () => {
    const document = {
      ...referenceDocument("Plan.pdf", 1),
      storage: "managed" as const,
      path: "/work/Level 01.drawings/Plan-aaaaaaaa.pdf",
      relativePath: "Level 01.drawings/Plan-aaaaaaaa.pdf",
      originalPath: "/home/ana/OneDrive/Plan.pdf",
      originalSha256: "b".repeat(64),
    };
    const stored = {
      path: document.path,
      relativePath: document.relativePath,
      sha256: document.sha256,
      sizeBytes: document.sizeBytes,
    };
    detachManagedCopy(document);
    expect(document.storage).toBe("managed");
    expect(document.originalPath).toBeNull();
    expect(document.originalSha256).toBeUndefined();
    expect({
      path: document.path,
      relativePath: document.relativePath,
      sha256: document.sha256,
      sizeBytes: document.sizeBytes,
    }).toEqual(stored);
  });
});

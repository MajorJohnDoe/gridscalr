// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy } from "pdfjs-dist";

vi.mock("../src/ui/dialogs", () => ({
  confirmDialog: vi.fn(async () => true),
  messageDialog: vi.fn(async () => undefined),
}));

vi.mock("../src/features/sessionRecovery", () => ({
  recordStructuralCheckpoint: vi.fn(async () => undefined),
}));

import { deletePageFlow, type PageFlowHost } from "../src/app/pageFlows";
import { commitSourceReplacement } from "../src/app/replacementFlows";
import { RendererStoreSync, type RendererSyncHost } from "../src/app/rendererSync";
import {
  applySourceReplacement,
  insertProjectPage,
  reorderProjectPage,
  type PageActionHost,
} from "../src/features/pageModel";
import { createProject, defaultDocument } from "../src/model/layers";
import {
  documentPageOrder,
  pageOrderSignature,
  type DocumentPageOrderEntry,
} from "../src/model/pages";
import type { DocumentRef, Project } from "../src/model/types";
import type { PdfRenderer } from "../src/pdf/pdfRenderer";
import { store } from "../src/state/store";
import { withTestPageIds } from "./helpers/pages";

const PATH = "/tmp/renderer-order/Pages.gridscalr";

/**
 * F-012 regression: the renderer's display order is derived from the store, so
 * insert, reorder, delete and source replacement must never leave a stale
 * order. A missing derivation makes these assertions fail.
 */

function baseProject(): Project {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", 3)));
}

function fakeProxy(id: string, numPages = 3): PDFDocumentProxy {
  return {
    id,
    numPages,
    loadingTask: { destroy: vi.fn(() => Promise.resolve()) },
  } as unknown as PDFDocumentProxy;
}

interface FakeRenderer {
  documents: PDFDocumentProxy[];
  pageMaps: number[][];
  pageOrder: DocumentPageOrderEntry[] | null;
  setOrderCalls: number;
  readonly appliedPageOrder: string;
  readonly documentCount: number;
  addDocument(document: PDFDocumentProxy, pageMap?: number[]): void;
  replaceDocument(index: number, document: PDFDocumentProxy, pageMap?: number[]): void;
  detachDocument(index: number): { document: PDFDocumentProxy; pageMap: number[] } | null;
  setPageMaps(maps: number[][]): void;
  setPageOrder(order: DocumentPageOrderEntry[] | null): void;
}

function fakeRenderer(
  documents: PDFDocumentProxy[],
  order: DocumentPageOrderEntry[] | null,
): FakeRenderer {
  const pageMaps: number[][] = documents.map((document) => [document.numPages]);
  const state = { pageOrder: order, setOrderCalls: 0 };
  const renderer = {
    documents,
    pageMaps,
    get pageOrder() {
      return state.pageOrder;
    },
    get setOrderCalls() {
      return state.setOrderCalls;
    },
    get appliedPageOrder() {
      return pageOrderSignature(state.pageOrder);
    },
    get documentCount() {
      return documents.length;
    },
    addDocument(document: PDFDocumentProxy, pageMap?: number[]) {
      documents.push(document);
      pageMaps.push(pageMap ? [...pageMap] : [1]);
    },
    replaceDocument(index: number, document: PDFDocumentProxy, pageMap?: number[]) {
      documents[index] = document;
      pageMaps[index] = pageMap ? [...pageMap] : [1];
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
    setPageOrder(next: DocumentPageOrderEntry[] | null) {
      state.setOrderCalls += 1;
      state.pageOrder = next;
    },
  };
  return renderer as unknown as FakeRenderer;
}

function asRenderer(renderer: FakeRenderer): PdfRenderer {
  return renderer as unknown as PdfRenderer;
}

const cleanups: Array<() => void> = [];

interface Harness {
  project: Project;
  renderer: FakeRenderer;
  sync: RendererStoreSync;
  orderChanges: number;
  documentChanges: number;
  failures: number;
}

function setup(): Harness {
  const project = baseProject();
  store.setProject(project, PATH, false);
  const renderer = fakeRenderer(
    project.documents.map((document) => fakeProxy(document.id)),
    documentPageOrder(project),
  );
  const counters = { orderChanges: 0, documentChanges: 0, failures: 0 };
  const host: RendererSyncHost = {
    project: () => store.project,
    renderer: () => asRenderer(renderer),
    onPageOrderChanged: () => {
      counters.orderChanges += 1;
    },
    onDocumentsChanged: () => {
      counters.documentChanges += 1;
    },
    onSyncFailed: () => {
      counters.failures += 1;
    },
  };
  const sync = new RendererStoreSync(host);
  sync.reset(project);
  cleanups.push(store.subscribe((reason) => sync.handle(reason)));
  return {
    project,
    renderer,
    sync,
    get orderChanges() {
      return counters.orderChanges;
    },
    get documentChanges() {
      return counters.documentChanges;
    },
    get failures() {
      return counters.failures;
    },
  };
}

function actionHost(): PageActionHost {
  return {
    renderer: () => null,
    thumbnails: () => null,
    resetPageSizes: () => undefined,
    enqueuePageSize: async () => undefined,
    fitPage: () => undefined,
    invalidate: () => undefined,
    renderAll: () => undefined,
    closeSearch: () => undefined,
    closeReference: async () => undefined,
    afterStructuralChange: () => undefined,
    registerCreatedDocuments: async () => undefined,
    installProject: async () => undefined,
    detachDocument: () => undefined,
  };
}

function flowHost(): PageFlowHost {
  return {
    addDocumentToRenderer: vi.fn(),
    resetPageSizes: vi.fn(),
    enqueuePageSize: vi.fn(async () => undefined),
    fitPage: vi.fn(),
    focusItem: vi.fn(),
    invalidate: vi.fn(),
    renderAll: vi.fn(),
    closeSearch: vi.fn(),
    closeReference: vi.fn(async () => undefined),
    closeSplitView: vi.fn(),
    destroyRenderer: vi.fn(async () => undefined),
  };
}

/** The renderer must hold exactly the order the project now describes. */
function expectDerivedOrder(renderer: FakeRenderer): void {
  const expected = documentPageOrder(store.project!);
  expect(renderer.pageOrder).toEqual(expected);
  expect(renderer.appliedPageOrder).toBe(pageOrderSignature(expected));
}

function pageIds(): string[] {
  return store.project!.pages.map((page) => page.id);
}

beforeEach(() => {
  store.project = null;
  store.projectPath = null;
  store.fileStamp = null;
  store.dirty = false;
  store.readOnly = false;
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("renderer page order is derived from the store", () => {
  it("applies the order after a page insert, its undo and its redo", async () => {
    const { renderer } = setup();
    expectDerivedOrder(renderer);

    await insertProjectPage(actionHost(), "page_1", 1);
    expect(pageIds()).toHaveLength(4);
    expectDerivedOrder(renderer);

    store.undo();
    expect(pageIds()).toHaveLength(3);
    expectDerivedOrder(renderer);

    store.redo();
    expect(pageIds()).toHaveLength(4);
    expectDerivedOrder(renderer);
  });

  it("applies the order after a page reorder, its undo and its redo", async () => {
    const { renderer } = setup();

    await reorderProjectPage(actionHost(), "page_3", 0);
    expect(pageIds()).toEqual(["page_3", "page_1", "page_2"]);
    expectDerivedOrder(renderer);

    store.undo();
    expect(pageIds()).toEqual(["page_1", "page_2", "page_3"]);
    expectDerivedOrder(renderer);

    store.redo();
    expectDerivedOrder(renderer);
  });

  it("applies the order after a page delete", async () => {
    const { renderer } = setup();

    await deletePageFlow(flowHost(), "page_2");
    expect(pageIds()).toEqual(["page_1", "page_3"]);
    expectDerivedOrder(renderer);
  });

  it("applies the order after a source replacement", () => {
    const { renderer } = setup();
    const project = store.project!;
    const replacement: DocumentRef = {
      ...defaultDocument("New.pdf", 3),
      id: "doc_new",
      sha256: "hash_new",
      sizeBytes: 42,
    };
    const applied = applySourceReplacement(project, {
      documentId: project.documents[0].id,
      newDocument: replacement,
      mappings: [
        { pageId: "page_1", newLocalPage: 3 },
        { pageId: "page_2", newLocalPage: 1 },
        { pageId: "page_3", newLocalPage: 2 },
      ],
    });
    expect(applied).not.toBeNull();

    commitSourceReplacement(applied!, asRenderer(renderer), 0, fakeProxy("new"), 3);
    expect(renderer.documents).toHaveLength(1);
    expectDerivedOrder(renderer);
    expect(renderer.pageOrder?.map((entry) => entry.localPage)).toEqual([3, 1, 2]);
  });

  it("does not reapply the order for a change that keeps it (performance guard)", () => {
    const { renderer } = setup();
    const calls = renderer.setOrderCalls;

    store.mutate((project) => {
      project.name = "Renamed project";
    }, "project");

    expect(renderer.setOrderCalls).toBe(calls);
  });

  it("defers the order until a newly imported document is registered", () => {
    const { renderer, sync } = setup();
    const before = renderer.pageOrder;

    const imported: DocumentRef = { ...defaultDocument("Extra.pdf", 2), id: "doc_extra" };
    store.addDocument(imported);
    // The store emitted while the renderer did not yet hold the new document.
    expect(renderer.pageOrder).toBe(before);

    expect(
      sync.addImported([{ id: imported.id, proxy: fakeProxy("extra", 2), pageMap: [1, 2] }]),
    ).toBe(true);
    expect(renderer.documents).toHaveLength(2);
    expectDerivedOrder(renderer);
  });

  it("repairs a renderer whose order drifted on the next store change", () => {
    const { renderer, sync } = setup();
    // A structural change that bypassed the store left the renderer stale.
    renderer.setPageOrder([{ documentIndex: 0, localPage: 3 }]);
    sync.handle("project");
    expectDerivedOrder(renderer);
  });
});

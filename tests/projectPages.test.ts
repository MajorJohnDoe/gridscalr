import { describe, expect, it } from "vitest";
import { createProject, defaultDocument } from "../src/model/layers";
import type { DocumentRef, OcrPage, Project } from "../src/model/types";
import { Store } from "../src/state/store";
import { withTestPageIds } from "./helpers/pages";

const PATH = "/tmp/project-pages/Pages.gridscalr";

function makeProject(pageCount = 3): Project {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", pageCount)));
}

function makeStore(project = makeProject()): Store {
  const store = new Store();
  store.setProject(project, PATH, false);
  return store;
}

function extraDocument(id = "doc_extra", pageCount = 2): DocumentRef {
  return {
    id,
    kind: "pdf",
    name: "Extra.pdf",
    path: "/tmp/project-pages/Extra.pdf",
    relativePath: null,
    sha256: "",
    pageCount,
    sizeBytes: 0,
    storage: "reference",
  };
}

function templateProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Sheet", 1)));
  const document = project.documents[0];
  document.kind = "template";
  document.template = { id: "sheet-template", version: 1, paper: "A3", fields: {} };
  return project;
}

function ocr(): OcrPage {
  return {
    text: "Room 101",
    words: [],
    engine: "tesseract",
    languages: "eng",
    generatedAt: "2026-01-01T00:00:00.000Z",
    documentSha256: "",
    sourcePage: 1,
    width: 100,
    height: 100,
  };
}

describe("document import and source changes", () => {
  it("appends a document's pages and clears the undo history", () => {
    const store = makeStore();
    store.mutate((project) => {
      project.name = "Changed";
    });
    expect(store.canUndo).toBe(true);
    const beforePages = store.project!.pages.length;

    store.addDocument(extraDocument());

    expect(store.project!.documents.map((document) => document.id)).toContain("doc_extra");
    expect(store.project!.pages).toHaveLength(beforePages + 2);
    expect(store.dirty).toBe(true);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
  });

  it("applies a source-storage change as an explicit boundary", () => {
    const store = makeStore();
    store.mutate((project) => {
      project.name = "Changed";
    });

    store.applySourceStorageChange((documents) => {
      documents[0].path = "/tmp/project-pages/Relinked.pdf";
    });

    expect(store.project!.documents[0].path).toBe("/tmp/project-pages/Relinked.pdf");
    expect(store.canUndo).toBe(false);
  });

  it("changes template paper only for a template page and clears history", () => {
    const store = makeStore(templateProject());
    store.mutate((project) => {
      project.name = "Changed";
    });

    store.setTemplatePaper("page_1", "A2");
    expect(store.project!.documents[0].template!.paper).toBe("A2");
    expect(store.canUndo).toBe(false);

    store.mutate((project) => {
      project.name = "Changed again";
    });
    store.setTemplatePaper("page_missing", "A3");
    expect(store.project!.documents[0].template!.paper).toBe("A2");
    expect(store.canUndo).toBe(true);
  });
});

describe("structural page boundaries", () => {
  it("deletes a page, resets the view and clears history", () => {
    const store = makeStore();
    store.setPage(2);
    store.setSelection({ layerId: "layer_measure", itemId: "item_1" });
    store.mutate((project) => {
      project.name = "Changed";
    });

    const summary = store.deletePage("page_2");

    expect(summary).not.toBeNull();
    expect(summary!.pageId).toBe("page_2");
    expect(summary!.nextPageId).toBe("page_3");
    expect(store.project!.pages.map((page) => page.id)).toEqual(["page_1", "page_3"]);
    expect(store.ui.page).toBe(2);
    expect(store.ui.selection).toEqual([]);
    expect(store.canUndo).toBe(false);
  });

  it("returns null for a missing page and refuses deletion while view-only", () => {
    const store = makeStore();
    expect(store.deletePage("page_missing")).toBeNull();

    store.setReadOnly(true);
    expect(store.deletePage("page_1")).toBeNull();
    expect(store.project!.pages).toHaveLength(3);
  });

  it("appends a duplicate and clears the undo history", () => {
    const store = makeStore();
    store.mutate((project) => {
      project.name = "Changed";
    });

    const copy = store.duplicatePage("page_1", {
      copyMarkups: true,
      copyScale: true,
      copyName: true,
      name: "Copy",
    });

    expect(copy).not.toBeNull();
    expect(store.project!.pages).toHaveLength(4);
    expect(store.project!.pages[3].id).toBe(copy!.pageId);
    expect(store.ui.page).toBe(4);
    expect(store.canUndo).toBe(false);
  });
});

describe("undoable page list changes", () => {
  it("moves one page as one undo step", () => {
    const store = makeStore();

    expect(store.reorderPage("page_1", 2)).toBe(true);
    expect(store.project!.pages.map((page) => page.id)).toEqual(["page_2", "page_3", "page_1"]);
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(store.project!.pages.map((page) => page.id)).toEqual(["page_1", "page_2", "page_3"]);
  });

  it("moves a multi-page block as one undo step", () => {
    const store = makeStore();

    expect(store.reorderPages(["page_2", "page_3"], 0)).toBe(true);
    expect(store.project!.pages.map((page) => page.id)).toEqual(["page_2", "page_3", "page_1"]);

    store.undo();
    expect(store.project!.pages.map((page) => page.id)).toEqual(["page_1", "page_2", "page_3"]);
  });

  it("adds no undo step for a reorder that changes nothing", () => {
    const store = makeStore();
    store.mutate((project) => {
      project.name = "Changed";
    });

    expect(store.reorderPage("page_1", 0)).toBe(false);
    expect(store.reorderPages(["page_1"], 0)).toBe(false);

    store.undo();
    expect(store.project!.name).not.toBe("Changed");
  });

  it("inserts and restores exactly one page with its PageId", () => {
    const store = makeStore();
    const before = store.project!.pages.map((page) => page.id);

    const createdId = store.insertPageRecord("page_1", 1);
    expect(createdId).not.toBeNull();
    expect(store.project!.pages).toHaveLength(4);
    expect(store.project!.pages[1].id).toBe(createdId);
    expect(store.ui.page).toBe(2);
    expect(store.ui.selection).toEqual([]);

    store.undo();
    expect(store.project!.pages.map((page) => page.id)).toEqual(before);

    store.redo();
    expect(store.project!.pages.map((page) => page.id)).toContain(createdId);
  });

  it("refuses reorder and insert while view-only", () => {
    const store = makeStore();
    store.setReadOnly(true);

    expect(store.reorderPage("page_1", 2)).toBe(false);
    expect(store.reorderPages(["page_1"], 2)).toBe(false);
    expect(store.insertPageRecord("page_1", 0)).toBeNull();
    expect(store.project!.pages).toHaveLength(3);
  });
});

describe("page metadata and layers", () => {
  it("stores and clears derived OCR without a history step", () => {
    const store = makeStore();
    store.mutate((project) => {
      project.name = "Changed";
    });
    const revision = store.revision;

    store.setPageOcr("page_1", ocr());
    expect(store.project!.pages[0].state.ocr?.text).toBe("Room 101");
    expect(store.revision).toBe(revision + 1);
    expect(store.canUndo).toBe(true);

    store.setPageOcr("page_1", undefined);
    expect(store.project!.pages[0].state.ocr).toBeUndefined();
  });

  it("renames a page as one undo step and trims the name", () => {
    const store = makeStore();

    store.renamePage("page_1", "  Ground floor  ");
    expect(store.project!.pages[0].state.name).toBe("Ground floor");
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(store.project!.pages[0].state.name).toBeUndefined();

    store.renamePage("page_1", "");
    expect(store.project!.pages[0].state.name).toBeUndefined();
  });

  it("changes the active layer and adds a layer as one undo step", () => {
    const store = makeStore();
    const draw = store.project!.layers.find((layer) => layer.kind === "draw")!;
    const reasons: string[] = [];
    store.subscribe((reason) => reasons.push(reason));

    store.setActiveLayer(draw.id);
    expect(store.project!.activeLayerId).toBe(draw.id);
    expect(reasons).toContain("layers");
    expect(store.canUndo).toBe(false);

    store.setActiveLayer("layer_missing");
    expect(store.project!.activeLayerId).toBe(draw.id);

    const before = store.project!.layers.length;
    store.createLayer("draw");
    expect(store.project!.layers).toHaveLength(before + 1);
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(store.project!.layers).toHaveLength(before);
  });
});

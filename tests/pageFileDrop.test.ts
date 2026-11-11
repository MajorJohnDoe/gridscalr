// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyPageDrop,
  isFileDrag,
  PageFileDropController,
  pointInRect,
  type DroppedFile,
} from "../src/features/pageFileDrop";
import { pageReorder } from "../src/features/pageReorder";
import { commitProjectImport, prepareProjectImport } from "../src/features/projectImport/model";
import { createProject, defaultDocument } from "../src/model/layers";
import { excludedSourcePages } from "../src/model/documents";
import type { DocumentRef } from "../src/model/types";
import { store } from "../src/state/store";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function dropped(name: string): DroppedFile {
  return { name, path: `/tmp/${name}` };
}

function sourceDocument(name = "Dropped.pdf"): DocumentRef {
  const document = defaultDocument(name, 3);
  document.sha256 = "hash_dropped";
  document.path = `/tmp/${name}`;
  document.sizeBytes = 4096;
  document.excludedPages = excludedSourcePages(3, [1, 3]);
  return document;
}

/** The same synthetic source and commit sequence the drop flow uses. */
function prepareAndCommit(insertIndex?: number) {
  const destination = createProject(defaultDocument("Existing.pdf", 2));
  store.setProject(destination, null, false);
  const originalIds = destination.pages.map((page) => page.id);

  const document = sourceDocument();
  const source = createProject(document);
  source.settings.lengthUnit = destination.settings.lengthUnit;
  source.settings.areaUnit = destination.settings.areaUnit;
  const before = JSON.stringify(source);
  deepFreeze(source);
  const prepared = prepareProjectImport(
    destination,
    source,
    source.pages.map((_page, index) => index + 1),
    new Map([[document.id, { pageCount: 3, path: document.path }]]),
    insertIndex,
  );
  expect(JSON.stringify(source)).toBe(before);

  store.mutate((project) => {
    commitProjectImport(project, prepared);
  }, "project");
  return { destination, originalIds, prepared };
}

afterEach(() => {
  store.setProject(createProject(defaultDocument("Reset.pdf", 1)), null, false);
});

describe("Pages-panel file drop", () => {
  it("classifies a dropped file as a drawing, project or unsupported file", () => {
    expect(classifyPageDrop([dropped("plan.pdf")])).toMatchObject({ kind: "drawing" });
    expect(classifyPageDrop([dropped("scan.TIF")])).toMatchObject({ kind: "drawing" });
    expect(classifyPageDrop([dropped("site.gridscalr")])).toMatchObject({ kind: "project" });
    expect(classifyPageDrop([dropped("notes.txt")])).toMatchObject({ kind: "unsupported" });
    expect(classifyPageDrop([])).toEqual({ kind: "none" });
    expect(classifyPageDrop([dropped("a.pdf"), dropped("b.pdf")])).toEqual({
      kind: "multiple",
      count: 2,
    });
  });

  it("keeps OS file drags distinct from internal page drags", () => {
    expect(isFileDrag(["Files"])).toBe(true);
    expect(isFileDrag(["text/plain"])).toBe(false);
    expect(isFileDrag(["text/plain", "application/x-gridscalr-page-order"])).toBe(false);
    expect(isFileDrag(undefined)).toBe(false);
  });

  it("tests the panel rectangle with pointer coordinates", () => {
    const rect = { left: 10, top: 20, right: 110, bottom: 220 };
    expect(pointInRect({ x: 10, y: 20 }, rect)).toBe(true);
    expect(pointInRect({ x: 110, y: 220 }, rect)).toBe(true);
    expect(pointInRect({ x: 9, y: 100 }, rect)).toBe(false);
    expect(pointInRect({ x: 50, y: 221 }, rect)).toBe(false);
  });

  it("appends by default and inserts the dropped pages at the chosen position", () => {
    const appended = prepareAndCommit();
    expect(appended.destination.pages).toHaveLength(4);
    expect(appended.destination.pages.map((page) => page.localPage)).toEqual([1, 2, 1, 3]);

    store.setProject(createProject(defaultDocument("Existing.pdf", 2)), null, false);
    const inserted = prepareAndCommit(1);
    expect(inserted.destination.pages.map((page) => page.localPage)).toEqual([1, 1, 3, 2]);
    expect(inserted.destination.pages[1].documentId).toBe(inserted.prepared.documents[0].id);
  });

  it("restores the pre-import project in one undo step", () => {
    const { originalIds } = prepareAndCommit(1);
    expect(store.project!.pages).toHaveLength(4);
    expect(store.canUndo).toBe(true);

    store.undo();

    expect(store.project!.pages.map((page) => page.id)).toEqual(originalIds);
    expect(store.project!.documents).toHaveLength(1);
    expect(store.canUndo).toBe(false);
  });
});

describe("Pages-panel drop controller", () => {
  function setup() {
    const panel = document.createElement("div");
    const list = document.createElement("div");
    list.className = "page-list";
    panel.append(list);
    document.body.append(panel);
    panel.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 200, bottom: 400, width: 200, height: 400 }) as DOMRect;
    pageReorder.bindList(list, panel);
    store.setProject(createProject(defaultDocument("Existing.pdf", 2)), null, false);
    store.ui.leftTab = "pages";
    const addDrawing = vi.fn();
    const reject = vi.fn();
    const controller = new PageFileDropController({ addDrawing, reject });
    controller.bindPanel(panel);
    return { panel, addDrawing, reject, controller };
  }

  afterEach(() => {
    pageReorder.detach();
    document.body.replaceChildren();
  });

  it("adds a drawing at the insertion line and rejects other targets locally", () => {
    const { addDrawing, reject, controller } = setup();
    expect(controller.drop([{ name: "Added.pdf", path: "/tmp/Added.pdf" }], { x: 30, y: 30 })).toBe(
      true,
    );
    expect(addDrawing).toHaveBeenCalledTimes(1);
    expect(addDrawing.mock.calls[0][0]).toMatchObject({ name: "Added.pdf" });

    expect(
      controller.drop([{ name: "Other.gridscalr", path: "/tmp/Other.gridscalr" }], {
        x: 30,
        y: 30,
      }),
    ).toBe(true);
    expect(reject).toHaveBeenLastCalledWith("project", "Other.gridscalr");

    expect(controller.drop([{ name: "notes.txt", path: "/tmp/notes.txt" }], { x: 30, y: 30 })).toBe(
      true,
    );
    expect(reject).toHaveBeenLastCalledWith("unsupported", "notes.txt");
  });

  it("ignores a drop outside the Pages panel and blocks a view-only project", () => {
    const { addDrawing, reject, controller } = setup();
    expect(
      controller.drop([{ name: "Added.pdf", path: "/tmp/Added.pdf" }], { x: 300, y: 30 }),
    ).toBe(false);
    expect(addDrawing).not.toHaveBeenCalled();

    store.setReadOnly(true);
    expect(controller.drop([{ name: "Added.pdf", path: "/tmp/Added.pdf" }], { x: 30, y: 30 })).toBe(
      true,
    );
    expect(reject).toHaveBeenLastCalledWith("readOnly");
    expect(addDrawing).not.toHaveBeenCalled();
    store.setReadOnly(false);
  });
});

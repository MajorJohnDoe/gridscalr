// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import { Store } from "../src/state/store";
import type { DocumentRef } from "../src/model/types";

function extraDocument(): DocumentRef {
  return {
    id: "doc_extra",
    kind: "pdf",
    name: "Extra.pdf",
    path: null,
    relativePath: null,
    sha256: "hash_extra",
    pageCount: 1,
    sizeBytes: 1,
  };
}

function makeStore(): Store {
  const store = new Store();
  store.setProject(
    createProject(defaultDocument("Plan.pdf", 1), createDefaultLayers()),
    null,
    false,
  );
  return store;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("project import history", () => {
  it("undoes a structural document and layer change as one step", () => {
    const store = makeStore();
    const project = store.project!;
    const layerCount = project.layers.length;

    store.mutate((draft) => {
      draft.documents.push(extraDocument());
      draft.pages["2"] = { name: "Second" };
      const layer = draft.layers.find((entry) => entry.kind === "draw")!;
      layer.items.push({
        id: "item_new",
        page: 2,
        kind: "text",
        points: [{ x: 1, y: 1 }],
        color: "#ffffff",
        strokeWidth: 1,
        text: "new",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      });
    }, "project");

    expect(store.project!.documents).toHaveLength(2);
    expect(store.project!.pages["2"].name).toBe("Second");
    expect(store.project!.layers.length).toBe(layerCount);
    expect(store.canUndo).toBe(true);

    store.setPage(2);
    expect(store.ui.page).toBe(2);

    store.undo();
    expect(store.project!.documents).toHaveLength(1);
    expect(store.project!.pages["2"]).toBeUndefined();
    expect(
      store.project!.layers.flatMap((layer) => layer.items).some((item) => item.id === "item_new"),
    ).toBe(false);
    expect(store.ui.page).toBe(1);

    store.redo();
    expect(store.project!.documents).toHaveLength(2);
    expect(store.project!.pages["2"].name).toBe("Second");
    expect(
      store.project!.layers.flatMap((layer) => layer.items).some((item) => item.id === "item_new"),
    ).toBe(true);
  });

  it("keeps the page clamped after undoing an import-like append", () => {
    const store = makeStore();
    store.mutate((draft) => {
      draft.documents.push(extraDocument());
      draft.documents.push({ ...extraDocument(), id: "doc_third" });
    }, "project");
    store.setPage(3);
    expect(store.ui.page).toBe(3);

    store.undo();
    expect(store.project!.documents).toHaveLength(1);
    expect(store.ui.page).toBe(1);
  });
});

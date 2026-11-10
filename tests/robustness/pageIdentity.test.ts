// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { withTestPageIds } from "../helpers/pages";
import {
  applySourceReplacement,
  defaultReplacementMappings,
  deletePage,
  duplicatePage,
  insertPage,
  movePage,
} from "../../src/features/pageModel";
import { commitProjectImport, prepareProjectImport } from "../../src/features/projectImport/model";
import {
  clearAllRecovery,
  listRecoveryRecords,
  recordStructuralCheckpoint,
} from "../../src/features/sessionRecovery";
import { parseProject, serializeProject } from "../../src/io/projectFile";
import { validateProject } from "../../src/model/integrity";
import { createProject, defaultDocument } from "../../src/model/layers";
import { currentPageId, pageNumber, pageRecordAt, pageRecordById } from "../../src/model/pages";
import type { MarkupItem, Project } from "../../src/model/types";
import { store } from "../../src/state/store";

const PATH = "/tmp/robustness/Page identity.gridscalr";
const NOW = "2026-01-01T00:00:00.000Z";

/** Deterministic seeded PRNG; the same sequence runs on every machine. */
function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)];
}

function integer(rng: () => number, max: number): number {
  return Math.floor(rng() * Math.max(1, max));
}

function measurement(project: Project, pageId: string, id: string): MarkupItem {
  return {
    id,
    pageId,
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
  };
}

function drawing(pageId: string, id: string): MarkupItem {
  return {
    id,
    pageId,
    kind: "text",
    points: [{ x: 20, y: 20 }],
    color: "#f2a93b",
    strokeWidth: 2,
    text: "Note",
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function baseProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 3)));
  const second = {
    ...defaultDocument("Upper.pdf", 2),
    id: "doc_upper",
    sha256: "b".repeat(64),
  };
  project.documents.push(second);
  project.pages.push(
    { id: "page_4", documentId: second.id, localPage: 1, state: {} },
    { id: "page_5", documentId: second.id, localPage: 2, state: {} },
  );
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  const draw = project.layers.find((layer) => layer.kind === "draw")!;
  for (const page of project.pages) {
    measure.items.push(measurement(project, page.id, `item_m_${page.id}`));
    draw.items.push(drawing(page.id, `item_d_${page.id}`));
  }
  return project;
}

function importSource(): Project {
  const source = withTestPageIds(createProject(defaultDocument("Source.pdf", 2)));
  source.name = "Source project";
  const measure = source.layers.find((layer) => layer.kind === "measure")!;
  const draw = source.layers.find((layer) => layer.kind === "draw")!;
  for (const page of source.pages) {
    measure.items.push(measurement(source, page.id, `source_m_${page.id}`));
    draw.items.push(drawing(page.id, `source_d_${page.id}`));
  }
  return source;
}

function itemPageMap(project: Project): Map<string, string> {
  const map = new Map<string, string>();
  for (const layer of project.layers) {
    for (const item of layer.items) map.set(item.id, item.pageId);
  }
  return map;
}

function itemIds(project: Project): string[] {
  return [...itemPageMap(project).keys()].sort();
}

function itemCount(project: Project): number {
  return project.layers.reduce((total, layer) => total + layer.items.length, 0);
}

function uniqueIds(project: Project): void {
  const sets: Array<[string, string[]]> = [
    ["document", project.documents.map((document) => document.id)],
    ["page", project.pages.map((page) => page.id)],
    ["layer", project.layers.map((layer) => layer.id)],
    ["item", project.layers.flatMap((layer) => layer.items.map((item) => item.id))],
    ["category", project.categories.map((category) => category.id)],
    ["countType", project.countTypes.map((type) => type.id)],
    ["lineType", project.lineTypes.map((lineType) => lineType.id)],
    ["countPreset", project.countPresets.map((preset) => preset.id)],
    ["markupsView", project.markupsViews.map((view) => view.id)],
  ];
  for (const [kind, ids] of sets) {
    expect(new Set(ids).size, `${kind} IDs must be unique`).toBe(ids.length);
  }
}

/**
 * The invariants from robustness §6. Runs after every operation so a broken
 * reference is attributed to the step that produced it.
 */
function expectInvariants(project: Project): void {
  uniqueIds(project);
  const pageIds = new Set(project.pages.map((page) => page.id));
  const documentIds = new Set(project.documents.map((document) => document.id));
  for (const page of project.pages) {
    expect(documentIds.has(page.documentId), `page ${page.id} must have a document`).toBe(true);
    const document = project.documents.find((entry) => entry.id === page.documentId)!;
    expect(Number.isInteger(page.localPage)).toBe(true);
    expect(page.localPage).toBeGreaterThanOrEqual(1);
    expect(page.localPage).toBeLessThanOrEqual(document.pageCount);
  }
  for (const layer of project.layers) {
    if (layer.homePageId) {
      expect(pageIds.has(layer.homePageId), `layer ${layer.id} home page`).toBe(true);
    }
    for (const key of Object.keys(layer.pageState ?? {})) {
      expect(pageIds.has(key), `layer ${layer.id} page state ${key}`).toBe(true);
    }
    for (const item of layer.items) {
      expect(pageIds.has(item.pageId), `item ${item.id} page`).toBe(true);
    }
  }
  project.pages.forEach((page, index) => {
    expect(pageNumber(project, page.id)).toBe(index + 1);
    expect(pageRecordAt(project, index + 1)).toBe(page);
    expect(pageRecordById(project, page.id)).toBe(page);
  });
  expect(currentPageId(project, 1)).toBe(project.pages[0]?.id ?? null);
  expect(validateProject(project).filter((issue) => issue.severity === "error")).toEqual([]);
}

function expectStableItems(before: Map<string, string>, project: Project): void {
  const after = itemPageMap(project);
  for (const [id, pageId] of before) {
    if (after.has(id)) expect(after.get(id), `item ${id} moved pages`).toBe(pageId);
  }
}

function expectSamePageRecords(
  before: ReadonlyArray<{
    id: string;
    documentId: string;
    localPage: number;
  }>,
  project: Project,
): void {
  for (const previous of before) {
    const current = pageRecordById(project, previous.id);
    if (!current) continue;
    expect(current.documentId).toBe(previous.documentId);
    expect(current.localPage).toBe(previous.localPage);
  }
}

type Operation =
  | "insert"
  | "move"
  | "duplicate"
  | "delete"
  | "import"
  | "replace"
  | "bulk"
  | "undo"
  | "redo"
  | "saveLoad";

beforeEach(async () => {
  store.project = null;
  store.projectPath = null;
  store.fileStamp = null;
  store.dirty = false;
  store.readOnly = false;
  localStorage.clear();
  await clearAllRecovery().catch(() => undefined);
});

describe("stateful page identity sequences", () => {
  it("keeps every page reference valid through a seeded mixed sequence", () => {
    const rng = prng(0x1595eed);
    const project = baseProject();
    store.setProject(project, PATH, false);
    const source = importSource();

    for (let step = 0; step < 80; step += 1) {
      const beforeItems = itemPageMap(store.project!);
      const beforePages = store.project!.pages.map((page) => ({
        id: page.id,
        documentId: page.documentId,
        localPage: page.localPage,
      }));
      const beforeItemCount = itemCount(store.project!);
      const beforeLayerCount = store.project!.layers.length;

      let operation: Operation = pick(rng, [
        "insert",
        "insert",
        "move",
        "duplicate",
        "delete",
        "delete",
        "import",
        "replace",
        "bulk",
        "undo",
        "redo",
      ]);
      if (step % 19 === 0) operation = "saveLoad";

      if (operation === "insert") {
        const page = store.project!.pages.length ? pick(rng, store.project!.pages) : undefined;
        const target = page ? pageRecordById(store.project!, page.id) : undefined;
        if (page && target) {
          const created = store.insertPageRecord(
            page.id,
            integer(rng, store.project!.pages.length + 1),
          );
          expect(created).not.toBeNull();
          expect(store.project!.pages).toHaveLength(beforePages.length + 1);
          expect(store.project!.pages.some((entry) => entry.id === created)).toBe(true);
          expect(itemCount(store.project!)).toBe(beforeItemCount);
          expect(store.project!.layers.length).toBe(beforeLayerCount);
          expectSamePageRecords(beforePages, store.project!);
          expect(store.canUndo, "insert is structural").toBe(false);
          expect(store.canRedo).toBe(false);
        }
      } else if (operation === "move") {
        if (store.project!.pages.length > 1) {
          const page = pick(rng, store.project!.pages);
          const moved = store.reorderPage(page.id, integer(rng, store.project!.pages.length));
          if (moved) {
            expect(new Set(store.project!.pages.map((entry) => entry.id))).toEqual(
              new Set(beforePages.map((entry) => entry.id)),
            );
            expect(itemCount(store.project!)).toBe(beforeItemCount);
            expect(store.project!.layers.length).toBe(beforeLayerCount);
            expectSamePageRecords(beforePages, store.project!);
            expect(store.canUndo, "reorder is structural").toBe(false);
            expect(store.canRedo).toBe(false);
          }
        }
      } else if (operation === "duplicate") {
        const page = store.project!.pages.length ? pick(rng, store.project!.pages) : undefined;
        const summary = page
          ? store.duplicatePage(page.id, {
              copyMarkups: true,
              copyScale: true,
              copyName: true,
              name: "Copy",
            })
          : null;
        if (summary) {
          expect(store.project!.pages).toHaveLength(beforePages.length + 1);
          expect(itemCount(store.project!)).toBe(beforeItemCount + summary.copiedItems);
          expect(store.project!.layers.length).toBe(beforeLayerCount);
          expectSamePageRecords(beforePages, store.project!);
          expect(store.canUndo, "duplicate is structural").toBe(false);
          expect(store.canRedo).toBe(false);
        }
      } else if (operation === "delete") {
        if (store.project!.pages.length > 0) {
          const page = pick(rng, store.project!.pages);
          const summary = store.deletePage(page.id);
          if (summary) {
            expect(store.project!.pages).toHaveLength(beforePages.length - 1);
            expect(store.project!.pages.some((entry) => entry.id === page.id)).toBe(false);
            expect(itemCount(store.project!)).toBe(beforeItemCount - summary.removedItems);
            if (store.project!.pages.length > 0) {
              expect(store.project!.layers.length).toBe(beforeLayerCount - summary.removedLayers);
            }
            expectSamePageRecords(
              beforePages.filter((entry) => entry.id !== page.id),
              store.project!,
            );
            expect(store.canUndo, "delete is structural").toBe(false);
            expect(store.canRedo).toBe(false);
          }
        }
      } else if (operation === "import") {
        const pages = source.pages.map((_page, index) => index + 1);
        const prepared = prepareProjectImport(
          store.project!,
          source,
          pages,
          new Map(),
          integer(rng, 2),
        );
        let importedItemCount = 0;
        store.mutate((current) => {
          importedItemCount = commitProjectImport(current, prepared).importedItemCount;
        }, "project");
        expect(store.project!.pages).toHaveLength(beforePages.length + prepared.pages.length);
        expect(itemCount(store.project!)).toBe(beforeItemCount + importedItemCount);
        expect(store.project!.layers.length).toBe(beforeLayerCount + prepared.createdLayers.length);
        expectSamePageRecords(beforePages, store.project!);
        expect(store.canUndo, "one import is one undo step").toBe(true);

        const afterImportPages = store.project!.pages.map((page) => page.id);
        const afterImportItems = itemIds(store.project!);
        store.undo();
        expect(store.project!.pages.map((page) => page.id)).toEqual(
          beforePages.map((page) => page.id),
        );
        expect(itemIds(store.project!)).toEqual([...beforeItems.keys()].sort());
        expect(store.canRedo).toBe(true);
        store.redo();
        expect(store.project!.pages.map((page) => page.id)).toEqual(afterImportPages);
        expect(itemIds(store.project!)).toEqual(afterImportItems);
      } else if (operation === "replace") {
        const document = store.project!.documents.find(
          (entry) =>
            entry.kind === "pdf" &&
            store.project!.pages.some((page) => page.documentId === entry.id),
        );
        if (document) {
          const mappings = defaultReplacementMappings(store.project!, document.id, 2);
          const replacement = {
            ...defaultDocument("Replacement.pdf", 2),
            id: "doc_replacement",
            sha256: "d".repeat(64),
          };
          let applied = false;
          store.mutate((current) => {
            applied = Boolean(
              applySourceReplacement(current, {
                documentId: document.id,
                newDocument: replacement,
                mappings,
              }),
            );
          }, "project");
          expect(applied).toBe(true);
          expect(store.project!.pages.map((page) => page.id)).toEqual(
            beforePages.map((page) => page.id),
          );
          expect(itemCount(store.project!)).toBe(beforeItemCount);
          expect(store.project!.layers.length).toBe(beforeLayerCount);
        }
      } else if (operation === "bulk") {
        const measure = store.project!.layers.find((layer) => layer.kind === "measure");
        const items = measure?.items ?? [];
        if (items.length) {
          const beforeVisibility = new Map(items.map((item) => [item.id, item.visible]));
          store.mutate((current) => {
            const layer = current.layers.find((entry) => entry.id === measure!.id);
            for (const item of layer?.items ?? []) item.visible = !item.visible;
          });
          const afterVisibility = new Map(
            store
              .project!.layers.find((layer) => layer.id === measure!.id)!
              .items.map((item) => [item.id, item.visible]),
          );
          expect(store.canUndo, "one bulk edit is one undo step").toBe(true);
          store.undo();
          const undone = new Map(
            store
              .project!.layers.find((layer) => layer.id === measure!.id)!
              .items.map((item) => [item.id, item.visible]),
          );
          expect(undone).toEqual(beforeVisibility);
          store.redo();
          const redone = new Map(
            store
              .project!.layers.find((layer) => layer.id === measure!.id)!
              .items.map((item) => [item.id, item.visible]),
          );
          expect(redone).toEqual(afterVisibility);
        }
      } else if (operation === "undo") {
        if (store.canUndo) {
          store.undo();
          expect(store.canRedo).toBe(true);
        }
      } else if (operation === "redo") {
        if (store.canRedo) {
          store.redo();
          expect(store.canUndo).toBe(true);
        }
      } else {
        // Save (serialize → parse) and load. This is a project boundary and
        // clears the history exactly like opening a file.
        const beforePageIds = store.project!.pages.map((page) => page.id);
        const beforeMap = itemPageMap(store.project!);
        const text = serializeProject(store.project!);
        const loaded = parseProject(text);
        expectInvariants(loaded);
        expect(loaded.pages.map((page) => page.id)).toEqual(beforePageIds);
        expect(itemPageMap(loaded)).toEqual(beforeMap);
        store.setProject(loaded, PATH, false);
        expect(store.canUndo).toBe(false);
        expect(store.canRedo).toBe(false);
        operation = "saveLoad";
      }

      expectInvariants(store.project!);
      expectStableItems(beforeItems, store.project!);
      expect(operation).toBeDefined();
    }
  });

  it("records a checkpoint before a structural page action", async () => {
    store.setProject(baseProject(), PATH, false);
    await recordStructuralCheckpoint("Before inserting a page");
    const records = await listRecoveryRecords();
    expect(
      records.some(
        (record) => record.kind === "checkpoint" && record.label === "Before inserting a page",
      ),
    ).toBe(true);
    expect(store.insertPageRecord(store.project!.pages[0].id, 0)).not.toBeNull();
    expect(store.canUndo).toBe(false);
  });

  it("rejects a mutated project with a broken page reference", () => {
    // Guard against a test suite that passes on corrupted data: deliberately
    // break one reference and prove the invariant helper catches it.
    const project = baseProject();
    project.layers[0].items[0].pageId = "page_missing";
    expect(() => expectInvariants(project)).toThrow();
  });

  it("also exercises the pure page helpers directly", () => {
    const project = baseProject();
    const page = project.pages[1];
    expect(movePage(project, page.id, 0)).toBe(true);
    expect(project.pages[0].id).toBe(page.id);
    const inserted = insertPage(project, {
      documentId: page.documentId,
      localPage: page.localPage,
      index: 1,
    });
    expect(inserted).not.toBeNull();
    expectInvariants(project);
    const copied = duplicatePage(project, page.id, {
      copyMarkups: true,
      copyScale: true,
      copyName: true,
      name: "Copy",
    });
    expect(copied?.copiedItems).toBeGreaterThanOrEqual(1);
    expectInvariants(project);
    const removed = deletePage(project, page.id);
    expect(removed).not.toBeNull();
    expectInvariants(project);
  });
});

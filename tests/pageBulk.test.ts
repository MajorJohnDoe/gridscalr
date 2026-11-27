// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/ui/dialogs", () => ({
  confirmDialog: vi.fn(async () => true),
  showModal: vi.fn(async () => "duplicate"),
  textDialog: vi.fn(async () => null),
  targetIdentity: (ids: readonly string[]) => ids.join("\u0000"),
}));

import { confirmDialog } from "../src/ui/dialogs";
import { withTestPageIds } from "./helpers/pages";
import { deletePagesFlow, type PageFlowHost } from "../src/app/pageFlows";
import { clearAllRecovery, listRecoveryRecords } from "../src/features/sessionRecovery";
import { createProject, defaultDocument } from "../src/model/layers";
import { deletePages, duplicatePages } from "../src/model/pageList";
import { validateProject } from "../src/model/integrity";
import type { MarkupItem, Project } from "../src/model/types";
import { store } from "../src/state/store";

const PATH = "/tmp/page-bulk/Pages.gridscalr";
const NOW = "2026-01-01T00:00:00.000Z";

function measurement(pageId: string, id: string, categoryId: string): MarkupItem {
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
    categoryId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function baseProject(): Project {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 5)));
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  const categoryId = project.settings.quantity.defaultCategoryId;
  project.pages.forEach((page, index) => {
    measure.items.push(measurement(page.id, `item_${index + 1}`, categoryId));
    page.state = index === 1 ? { name: "Ground floor", scaleLocked: true } : {};
  });
  measure.pageState = {
    page_2: { visible: false },
    page_4: { locked: true },
  };
  return project;
}

function host(): PageFlowHost {
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

beforeEach(async () => {
  store.project = null;
  store.projectPath = null;
  store.fileStamp = null;
  store.dirty = false;
  store.readOnly = false;
  localStorage.clear();
  vi.mocked(confirmDialog).mockReset();
  vi.mocked(confirmDialog).mockResolvedValue(true);
  await clearAllRecovery().catch(() => undefined);
});

describe("bulk page duplicate", () => {
  it("keeps every existing ID and copies state, items and layer membership", () => {
    const project = baseProject();
    const before = project.pages.map((page) => page.id);
    const result = duplicatePages(project, ["page_1", "page_3"], {
      copyMarkups: true,
      copyScale: true,
      copyName: true,
      name: "",
      names: new Map([
        ["page_1", "First copy"],
        ["page_3", "Third copy"],
      ]),
    });
    expect(result?.pageIds).toHaveLength(2);
    expect(project.pages.slice(0, before.length).map((page) => page.id)).toEqual(before);
    const copies = project.pages.slice(before.length);
    expect(copies.map((page) => page.state?.name)).toEqual(["First copy", "Third copy"]);
    expect(copies[0].state?.scaleLocked).toBeUndefined();
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    for (const copy of copies) {
      const items = measure.items.filter((item) => item.pageId === copy.id);
      expect(items).toHaveLength(1);
      expect(items[0].id).not.toBe(`item_${before.indexOf(copy.id) + 1}`);
    }
    expect(measure.pageState?.[result!.pageIds[0]]).toBeUndefined();
  });

  it("is one undo step through the store", () => {
    const project = baseProject();
    store.setProject(project, PATH, false);
    const before = project.pages.map((page) => page.id);
    const result = store.duplicatePages(["page_1", "page_2"], {
      copyMarkups: false,
      copyScale: false,
      copyName: true,
      name: "",
    });
    expect(result?.pageIds).toHaveLength(2);
    expect(store.canUndo).toBe(true);
    expect(store.project!.pages).toHaveLength(before.length + 2);

    store.undo();
    expect(store.project!.pages.map((page) => page.id)).toEqual(before);
    store.redo();
    expect(store.project!.pages).toHaveLength(before.length + 2);
  });
});

describe("bulk page delete", () => {
  it("cascades items and layer membership without dangling references", () => {
    const project = baseProject();
    const result = deletePages(project, ["page_2", "page_4"]);
    expect(result?.pageIds).toEqual(["page_2", "page_4"]);
    expect(project.pages.map((page) => page.id)).toEqual(["page_1", "page_3", "page_5"]);
    const measure = project.layers.find((layer) => layer.kind === "measure")!;
    expect(measure.items.some((item) => item.pageId === "page_2")).toBe(false);
    expect(measure.items.some((item) => item.pageId === "page_4")).toBe(false);
    expect(measure.pageState?.page_2).toBeUndefined();
    expect(measure.pageState?.page_4).toBeUndefined();
    expect(validateProject(project).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("clears history and writes one checkpoint through the flow", async () => {
    store.setProject(baseProject(), PATH, false);
    const pageHost = host();
    await deletePagesFlow(pageHost, ["page_2", "page_4"]);
    expect(confirmDialog).toHaveBeenCalled();
    expect(store.project!.pages.map((page) => page.id)).toEqual(["page_1", "page_3", "page_5"]);
    expect(store.canUndo).toBe(false);
    expect(pageHost.renderAll).toHaveBeenCalled();
    const records = await listRecoveryRecords();
    expect(records.some((record) => record.kind === "checkpoint")).toBe(true);
  });

  it("can delete a selection that removes every page", () => {
    const project = baseProject();
    const result = deletePages(
      project,
      project.pages.map((page) => page.id),
    );
    expect(result?.pageIds).toHaveLength(5);
    expect(project.pages).toEqual([]);
    expect(result?.nextPageId).toBeNull();
    expect(validateProject(project).filter((issue) => issue.severity === "error")).toEqual([]);
  });
});

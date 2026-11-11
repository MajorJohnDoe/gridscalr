// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { createProject, defaultDocument } from "../src/model/layers";
import type { MarkupItem } from "../src/model/types";
import type { DocumentRef } from "../src/model/types";
import { store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";
import { invoke } from "@tauri-apps/api/core";
import { canTakeOver } from "../src/features/sessionRecovery";
import {
  SessionRecoveryController,
  type SessionRecoveryHost,
} from "../src/features/sessionRecovery";
import { isEditingTool, isInspectionTool, resolveViewOnlyTool } from "../src/features/viewOnly";
import {
  copySelection,
  cutSelection,
  duplicateSelection,
  moveSelectionToLayer,
  pasteSelection,
  setSelectionAreaMode,
  setSelectionCategory,
  setSelectionColor,
  setSelectionCountQuantity,
  setSelectionCountType,
  setSelectionImageMode,
  setSelectionLabelSize,
  setSelectionLocked,
  setSelectionOpacity,
  setSelectionRoom,
  setSelectionStrokeWidth,
  setSelectionVisible,
} from "../src/app/selectionActions";
import { beginSelection } from "../src/canvas/pointer/targets";
import { deletePageFlow, duplicatePageFlow, type PageFlowHost } from "../src/app/pageFlows";
import { addPageFlow, type SheetFlowHost } from "../src/app/sheetFlows";
import { insertImageFile, type ImageFlowHost } from "../src/app/imageFlows";
import {
  clearCalibrationFlow,
  fitDrawingToArea,
  openManualScaleFlow,
  setScaleLock,
  startCalibration,
} from "../src/app/scaleFlows";

function item(id: string, kind: MarkupItem["kind"], page = 1): MarkupItem {
  return {
    id,
    pageId: pageIdFor(page),
    kind,
    points: [
      { x: 10, y: 10 },
      { x: 30, y: 30 },
    ],
    color: "#4cc9f0",
    strokeWidth: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function projectWithItems() {
  const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
  project.name = "View-only plan";
  const draw = project.layers.find((layer) => layer.kind === "draw")!;
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  draw.items.push(item("draw_text", "text"));
  measure.items.push(item("measure_length", "length"));
  return { project, draw, measure };
}

function pageHost(): PageFlowHost {
  return {
    renderer: () => null,
    thumbnails: () => null,
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

function sheetHost(): SheetFlowHost {
  return {
    renderer: () => null,
    thumbnails: () => null,
    installDocuments: vi.fn(async () => undefined),
    enqueuePageSize: vi.fn(async () => undefined),
    resetPageSize: vi.fn(),
    fitPage: vi.fn(),
    invalidate: vi.fn(),
    openPdfFlow: vi.fn(async () => undefined),
  };
}

function imageHost(): ImageFlowHost {
  return { enqueuePageSize: vi.fn(async () => undefined) };
}

function recoveryHost(): SessionRecoveryHost {
  return {
    desktop: false,
    readStamp: async () => null,
    readMetadata: async () => null,
    pathExists: async () => true,
    notify: vi.fn(),
    bannerHost: document.createElement("div"),
    onReload: async () => undefined,
    onRestore: async () => true,
    onSaveCopy: () => undefined,
    onSummaryChange: vi.fn(),
  };
}

let controller: SessionRecoveryController | null = null;

beforeEach(() => {
  localStorage.clear();
  store.closeProject();
});

afterEach(() => {
  controller?.dispose();
  controller = null;
  store.closeProject();
  vi.useRealTimers();
});

describe("view-only tool rules", () => {
  it("keeps only inspection tools and resolves everything else to Select", () => {
    expect(isInspectionTool("select")).toBe(true);
    expect(isInspectionTool("pan")).toBe(true);
    expect(isEditingTool("length")).toBe(true);
    expect(isEditingTool("symbol")).toBe(true);
    expect(resolveViewOnlyTool("area")).toBe("select");
    expect(resolveViewOnlyTool("pan")).toBe("pan");
  });

  it("blocks takeover only for a live foreign lease", () => {
    expect(canTakeOver("liveOther")).toBe(false);
    expect(canTakeOver("staleOther")).toBe(true);
    expect(canTakeOver("none")).toBe(true);
    expect(canTakeOver("own")).toBe(true);
    expect(canTakeOver("corrupt")).toBe(true);
  });
});

describe("view-only command surface", () => {
  it("leaves the project snapshot unchanged for every mutation path", async () => {
    const { project, draw, measure } = projectWithItems();
    store.setProject(project, "/drawings/Plan.gridscalr");
    store.setSelection({ layerId: draw.id, itemId: "draw_text" });
    store.setReadOnly(true);

    const snapshot = JSON.stringify(store.project);
    const revision = store.revision;
    let mutatorRan = false;

    store.mutate(() => {
      mutatorRan = true;
    }, "change");
    store.setTool("length");
    store.setTool("pan");
    store.setTool("pen");
    store.setActiveLayer(measure.id);
    store.addDocument(defaultDocument("Second.pdf", 1) as DocumentRef);
    store.applySourceStorageChange((documents) => documents.splice(0));
    store.setTemplatePaper(pageIdFor(1), "A2");
    store.setPageOcr(pageIdFor(1), {
      text: "locked",
      words: [],
      engine: "tesseract",
      languages: "eng",
      generatedAt: "2026-01-01T00:00:00.000Z",
      documentSha256: "",
      sourcePage: 1,
      width: 100,
      height: 100,
    });
    store.renamePage(pageIdFor(1), "Renamed");
    store.deletePage(pageIdFor(1));
    store.reorderPage(pageIdFor(1), 0);
    store.reorderPages([pageIdFor(1), pageIdFor(2)], 1);
    store.insertPageRecord(pageIdFor(1), 0);
    store.duplicatePage(pageIdFor(1), {
      name: "Copy",
      copyMarkups: true,
      copyScale: true,
      copyName: true,
    });
    store.createLayer("draw");
    store.addCategory("Blocked");
    store.renameCategory(project.categories[0].id, "Blocked");
    store.moveCategory(project.categories[0].id, 1);
    store.setDefaultCategory(project.categories[0].id);
    store.removeCategory(project.categories[0].id);
    store.setQuantityDefaults({ wastePercent: 20, roundingStep: 5 });
    store.setCategoryQuantityOverride(project.categories[0].id, "wastePercent", 20);
    store.undo();
    store.redo();
    store.beginGesture();
    store.endGesture("change");

    cutSelection();
    pasteSelection();
    store.setSelection({ layerId: draw.id, itemId: "draw_text" });
    duplicateSelection();
    moveSelectionToLayer(measure.id);
    setSelectionVisible(false);
    setSelectionLocked(true);
    setSelectionColor("#ffffff");
    setSelectionStrokeWidth(4);
    setSelectionImageMode("background");
    setSelectionOpacity(0.5);
    store.setSelection({ layerId: measure.id, itemId: "measure_length" });
    setSelectionCategory(project.categories[0].id);
    setSelectionRoom("Room 1");
    setSelectionAreaMode("subtract");
    setSelectionCountType("other");
    setSelectionCountQuantity(4);
    setSelectionLabelSize(14);
    copySelection();

    const flowHost = pageHost();
    await duplicatePageFlow(flowHost, pageIdFor(1));
    await deletePageFlow(flowHost, pageIdFor(1));
    await addPageFlow(sheetHost());
    await insertImageFile(imageHost(), new File(["x"], "photo.png", { type: "image/png" }));
    startCalibration();
    setScaleLock(true);
    fitDrawingToArea(vi.fn());
    await clearCalibrationFlow();
    await openManualScaleFlow();

    expect(mutatorRan).toBe(false);
    expect(JSON.stringify(store.project)).toBe(snapshot);
    expect(store.revision).toBe(revision);
    expect(store.dirty).toBe(false);
    expect(store.ui.activeTool).toBe("select");
    expect(flowHost.renderAll).not.toHaveBeenCalled();
    expect(flowHost.enqueuePageSize).not.toHaveBeenCalled();
  });

  it("keeps inspection state working while editing stays disabled", () => {
    const { project, draw, measure } = projectWithItems();
    store.setProject(project, null);
    store.setReadOnly(true);

    store.setPage(1);
    store.setView(2, 10, 20);
    store.setSelection({ layerId: measure.id, itemId: "measure_length" });
    store.toggleSelection({ layerId: draw.id, itemId: "draw_text" });
    store.clearSelection();
    store.setLeftTab("layers");
    store.setHover({ layerId: draw.id, itemId: "draw_text", vertexIndex: -1 });

    expect(store.ui.zoom).toBe(2);
    expect(store.ui.selection).toEqual([]);
    expect(store.ui.leftTab).toBe("layers");
    expect(store.readOnly).toBe(true);
  });
});

describe("view-only canvas pointer", () => {
  it("selects an item on click but never starts a drag", () => {
    const { project, measure } = projectWithItems();
    store.setProject(project, null);
    store.setReadOnly(true);
    const beginDrag = vi.fn();
    const context = {
      editable: () => false,
      toScreen: (point: { x: number; y: number }) => point,
      viewPage: () => 1,
      viewPageId: () => pageIdFor(1),
      viewZoom: () => 1,
      beginDrag,
      beginMarquee: vi.fn(),
      drawInteraction: vi.fn(),
      labelResizeAt: () => false,
      pageLabelLayouts: () => new Map(),
      measurementLabelHit: () => null,
    };
    const event = {
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      pointerId: 1,
    } as unknown as PointerEvent;
    const revision = store.revision;

    beginSelection({ x: 20, y: 20 }, { x: 20, y: 20 }, event, context);

    expect(beginDrag).not.toHaveBeenCalled();
    expect(store.ui.selection).toEqual([{ layerId: measure.id, itemId: "measure_length" }]);
    expect(store.revision).toBe(revision);
  });
});

describe("view-only takeover", () => {
  it("enables editing again when no live owner holds the lease", async () => {
    const { project } = projectWithItems();
    store.setProject(project, "/drawings/Plan.gridscalr");
    store.setReadOnly(true);
    controller = new SessionRecoveryController(recoveryHost());

    const taken = await controller.takeOverToEdit();

    expect(taken).toBe(true);
    expect(store.readOnly).toBe(false);
    store.mutate((current) => {
      current.name = "Edited after takeover";
    }, "change");
    expect(store.project?.name).toBe("Edited after takeover");
  });

  it("stays view-only while a live lease still owns the project", async () => {
    const { project } = projectWithItems();
    store.setProject(project, "/drawings/Plan.gridscalr");
    controller = new SessionRecoveryController({ ...recoveryHost(), desktop: true });
    await controller.afterOpen("/drawings/Plan.gridscalr", project.id, true);

    vi.mocked(invoke).mockResolvedValue({
      lease: {
        instanceId: "instance-other",
        projectId: project.id,
        openedAt: Date.now(),
        heartbeatAt: Date.now(),
        projectSha256: "",
        hostLabel: "Desktop · Windows",
        appVersion: "0.23.0",
      },
      corrupt: false,
    });
    expect(await controller.takeOverToEdit()).toBe(false);
    expect(store.readOnly).toBe(true);

    vi.mocked(invoke).mockResolvedValue({ lease: null, corrupt: false });
    expect(await controller.takeOverToEdit()).toBe(true);
    expect(store.readOnly).toBe(false);
  });

  it("is a no-op when the session is already editable", async () => {
    const { project } = projectWithItems();
    store.setProject(project, "/drawings/Plan.gridscalr");
    controller = new SessionRecoveryController(recoveryHost());
    expect(await controller.takeOverToEdit()).toBe(true);
    expect(store.readOnly).toBe(false);
  });
});

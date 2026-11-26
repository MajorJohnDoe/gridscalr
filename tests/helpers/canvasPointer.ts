import { vi } from "vitest";
import { PointerController } from "../../src/canvas/pointer/PointerController";
import type { PointerHost } from "../../src/canvas/pointer/PointerHost";
import { pageToScreen, screenToPage, zoomAt, type Viewport } from "../../src/canvas/viewport";
import { addItem, createProject, defaultDocument, layersForKind } from "../../src/model/layers";
import type { Layer, MarkupItem, Point, Project } from "../../src/model/types";
import { store } from "../../src/state/store";
import { pageIdFor, withTestPageIds } from "./pages";

/** A project with one page, ready for the pointer state-machine tests. */
export function makePointerProject(): Project {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
}

/** Adds a simple two-point length measurement on page 1. */
export function addLength(
  project: Project,
  id: string,
  points: [Point, Point] = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ],
): { layer: Layer; item: MarkupItem } {
  const layer = layersForKind(project, "measure")[0];
  const item: MarkupItem = {
    id,
    pageId: pageIdFor(1),
    kind: "length",
    points,
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  addItem(project, layer.id, item);
  return { layer, item };
}

/** The jsdom canvas has no layout or pointer capture, so both are stubbed. */
export function makeCanvas(width = 800, height = 600): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  Object.assign(canvas, {
    hasPointerCapture: () => false,
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
  });
  return canvas;
}

export interface CanvasHarness {
  canvas: HTMLCanvasElement;
  host: PointerHost;
  controller: PointerController;
  view: Viewport;
  /** The zoom command recorded by the fake host. */
  zoomAt: ReturnType<typeof vi.fn>;
  /** Replaces the harness view so later conversions use the new transform. */
  setView(next: Viewport): void;
  /** Dispatches a pointer event on the canvas. */
  pointer(type: string, init: PointerEventInit): PointerEvent;
  wheel(init: WheelEventInit): WheelEvent;
}

export interface HarnessOptions {
  view?: Partial<Viewport>;
  project?: Project | null;
  readOnly?: boolean;
  viewOnly?: boolean;
}

/**
 * Wires a PointerController to a stubbed canvas and a minimal PointerHost.
 * The host owns a mutable viewport so pan, zoom and page conversion agree the
 * way they do inside CanvasView, without constructing the real renderer.
 */
export function makeCanvasHarness(options: HarnessOptions = {}): CanvasHarness {
  const project = options.project === undefined ? makePointerProject() : options.project;
  if (project) store.setProject(project, null);
  else store.closeProject();

  const view: Viewport = {
    page: 1,
    zoom: 1,
    panX: 0,
    panY: 0,
    ...options.view,
  };
  const canvas = makeCanvas();
  const zoomAtSpy = vi.fn((screen: Point, factor: number) => {
    const next = zoomAt(view, screen, factor);
    view.zoom = next.zoom;
    view.panX = next.panX;
    view.panY = next.panY;
    store.setView(next.zoom, next.panX, next.panY);
  });
  const host: PointerHost = {
    isReadOnly: () => options.readOnly ?? false,
    isViewOnly: () => options.viewOnly ?? false,
    viewport: () => view,
    cropActive: () => false,
    draft: () => null,
    setDraft: () => {},
    cropCursor: () => null,
    setHostCursor: vi.fn(),
    drawContent: vi.fn(),
    drawInteraction: vi.fn(),
    beginViewGesture: vi.fn(),
    endViewGesture: vi.fn(),
    clearHover: vi.fn(),
    snapPoint: (point) => point,
    snapPolylinePoint: (point) => point,
    constrainPolyline: (_last, point) => point,
    clearSnap: vi.fn(),
    viewZoom: () => view.zoom,
    finishDraft: vi.fn(),
    finishCallout: vi.fn(),
    createItem: () => null,
    runCalibration: () => Promise.resolve(),
    startTextTool: vi.fn(),
    commitEditors: vi.fn(),
    focusCanvas: vi.fn(),
    cropPointerDown: vi.fn(),
    cropPointerMove: vi.fn(),
    cropPointerUp: vi.fn(),
    cropPointerLeave: vi.fn(),
    finishPen: vi.fn(),
    finishQuickArea: vi.fn(),
    finishShape: vi.fn(),
    labelResizeAt: () => false,
    pageLabelLayouts: () => new Map(),
    toScreen: (point) => pageToScreen(view, point),
    cancelDraft: vi.fn(),
    touchNavigationBlocked: () => false,
    activeTool: () => store.ui.activeTool,
    viewPage: () => view.page,
    viewPageId: () => pageIdFor(1),
    toPage: (screen) => screenToPage(view, screen),
    calibrationLabelHit: () => false,
    editCalibration: () => {},
    measurementLabelHit: () => null,
    isLocked: () => false,
    selectItem: vi.fn(),
    promptVolumeDepth: vi.fn(),
    startLabelEdit: vi.fn(),
    editSheetFieldAt: vi.fn(),
    startTextEdit: vi.fn(),
    startTextBoxEdit: vi.fn(),
    editRail: vi.fn(),
    editSchedule: vi.fn(),
    startCloudTextEdit: vi.fn(),
    startCalloutTextEdit: vi.fn(),
    editItemText: () => {},
    zoomAt: zoomAtSpy,
    cancelGesture: vi.fn(),
    openContextMenu: vi.fn(),
  };
  const controller = new PointerController(canvas, host);
  controller.attach();

  return {
    canvas,
    host,
    controller,
    view,
    zoomAt: zoomAtSpy,
    setView(next) {
      view.page = next.page;
      view.zoom = next.zoom;
      view.panX = next.panX;
      view.panY = next.panY;
      store.setView(next.zoom, next.panX, next.panY);
    },
    pointer(type, init) {
      const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        ...init,
      });
      canvas.dispatchEvent(event);
      return event;
    },
    wheel(init) {
      const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
      canvas.dispatchEvent(event);
      return event;
    },
  };
}

/** A minimal fake context for NavigationGesture unit tests. */
export function makeNavigationContext(view: Viewport, pageId = pageIdFor(1)) {
  const calls: {
    begins: Array<"pointer" | "wheel">;
    ends: Array<"pointer" | "wheel">;
    captures: number[];
    cursor: number;
    draws: number;
  } = { begins: [], ends: [], captures: [], cursor: 0, draws: 0 };
  return {
    calls,
    context: {
      viewport: () => view,
      viewPageId: () => pageId,
      capturePointer: (pointerId: number) => calls.captures.push(pointerId),
      updateCursor: () => {
        calls.cursor += 1;
      },
      drawInteraction: () => {
        calls.draws += 1;
      },
      beginViewGesture: (kind: "pointer" | "wheel") => calls.begins.push(kind),
      endViewGesture: (kind: "pointer" | "wheel") => calls.ends.push(kind),
    },
  };
}

import {
  arrowHeadGeometry,
  constrainAngle,
  distance,
  expandRect,
  itemBounds,
  itemCenter,
  itemCorners,
  itemLocalBounds,
  itemLocalToPage,
  itemRotation,
  midpoint,
  nearestPointOnSegment,
  normalizeDegrees,
  polylineLength,
  pointToItemLocal,
  rotatePoint,
  rotatePointsAround,
  simplifyPolyline,
  translatePoints,
  type Bounds,
} from "../model/geometry";
import {
  areaCentroid,
  areaOutline,
  areaShapeOf,
  areaValue,
  rectangleCorners,
} from "../model/area";
import { COUNT_SYMBOL_RADIUS, countSymbol } from "../model/countSymbols";
import { findSegment, findVertex, hitTest } from "../model/hitTest";
import {
  labelBox,
  labelMetrics,
  LABEL_CALIBRATION_OFFSET,
  LABEL_LINE_OFFSET,
  type LabelBox,
  type LabelMetrics,
} from "../model/label";
import {
  CALIBRATION_LABEL_ID,
  layoutPageLabels,
  pageLabelSources,
  type LabelLayout,
} from "../model/labelLayout";
import {
  ensureLabelFonts,
  LABEL_FONT_STACK,
  measureLabelText,
} from "../model/labelFont";
import {
  addItem,
  ensureActiveLayer,
  findItem,
  itemIsLocked,
  layerKindForItem,
  removeItem,
} from "../model/layers";
import {
  normalizeCropRect,
  pageRectFromCrop,
  type NormalizedCrop,
  type PageRect,
} from "../model/export";
import { itemMetrics } from "../model/measure";
import {
  imageAssetForItem,
  imageModeOf,
  imageOpacity,
} from "../model/images";
import { measurementCategory, normalizeRoom } from "../model/categories";
import { resolveSelection } from "../model/selection";
import {
  createCalibration,
  isReferenceCalibration,
  pageCalibration,
  pageScale,
  pageScaleLocked,
  setPageCalibration,
} from "../model/calibration";
import { makeId } from "../model/calibration";
import {
  collectSnapCandidates,
  findSnap,
  type SnapCandidate,
  type SnapKind,
  type SnapResult,
} from "../model/snap";
import {
  clampTextSize,
  measureTextWidth,
  TEXT_FONT_STACK,
  textItemLayout,
} from "../model/text";
import { totalPageCount } from "../model/documents";
import { cloudCurves, cloudRadiusForPoints } from "../model/cloud";
import { calloutLayout, cloudLabelLayout, deltaLayout, stampLayout, textBoxLayout } from "../model/annotations";
import type { AreaShape, ImageAsset, ItemKind, Layer, MarkupItem, PageSize, Point, SelectionRef } from "../model/types";
import { DEFAULT_MEASUREMENT_STROKE_WIDTH } from "../model/style";
import { stampStatusColor } from "../model/stamps";
import { formatArea, formatLength, formatNumber } from "../model/units";
import { cropRectForView, type PdfRenderer, type RenderResult } from "../pdf/pdfRenderer";
import { store } from "../state/store";
import { calibrationDialog, textDialog } from "../ui/dialogs";
import { toast } from "../ui/toast";

export interface CanvasHooks {
  getRenderer: () => PdfRenderer | null;
  getPageSize: (page: number) => PageSize | undefined;
  ensurePageSize: (page: number) => void;
  onError?: (message: string) => void;
  onContextMenu?: (position: { page: Point; clientX: number; clientY: number }) => void;
}

type Draft =
  | { kind: "calibrate"; points: Point[]; cursor: Point }
  | { kind: "length"; points: Point[]; cursor: Point }
  | { kind: "area"; points: Point[]; cursor: Point }
  | { kind: "pen"; points: Point[]; cursor: Point }
  | { kind: "highlight"; points: Point[]; cursor: Point }
  | { kind: "highlight-polygon"; points: Point[]; cursor: Point }
  | { kind: "cloud"; points: Point[]; cursor: Point }
  | { kind: "callout"; start: Point; current: Point }
  | { kind: "line"; start: Point; current: Point }
  | { kind: "arrow"; start: Point; current: Point }
  | { kind: "rect"; start: Point; current: Point }
  | { kind: "ellipse"; start: Point; current: Point }
  | { kind: "highlight-rect"; start: Point; current: Point }
  | { kind: "area-rect"; start: Point; current: Point }
  | { kind: "area-ellipse"; start: Point; current: Point };

type BoxHandleRole = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
type HandleRole = BoxHandleRole | "rotate" | "vertex";

interface Handle {
  role: HandleRole;
  index: number;
  point: Point;
  cursor: string;
}

interface DragState {
  mode: "move" | "vertex" | "resize" | "rotate";
  itemId: string;
  layerId: string;
  vertexIndex: number;
  last: Point;
  moved: boolean;
  handle?: BoxHandleRole;
  startPage?: Point;
  startPoints?: Point[];
  startSelection?: Array<{ ref: SelectionRef; points: Point[] }>;
  startFontSize?: number;
  startRotation?: number;
  startBounds?: Bounds;
  center?: Point;
  startAngle?: number;
}

interface MarqueeState {
  start: Point;
  current: Point;
  additive: boolean;
}

interface CropDrag {
  mode: "new" | "move" | "resize";
  start: Point;
  startRect: PageRect | null;
  handle?: BoxHandleRole;
  pointerId: number;
}

interface CropMode {
  rect: PageRect | null;
  drag: CropDrag | null;
  hover: BoxHandleRole | "move" | null;
  resolve: (crop: NormalizedCrop | null) => void;
}

interface TextEditSession {
  itemId: string | null;
  layerId: string | null;
  page: number;
  anchor: Point;
  text: string;
  color: string;
  fontSize: number;
  rotation: number;
  original?: {
    text: string;
    color: string;
    fontSize: number;
    rotation: number;
  };
  closing: boolean;
  container: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  strip: HTMLDivElement;
}

interface LabelEditSession {
  itemId: string;
  layerId: string;
  page: number;
  value: string;
  original: string | undefined;
  closing: boolean;
  container: HTMLDivElement;
  input: HTMLInputElement;
}

interface LabelHit {
  layer: Layer;
  item: MarkupItem;
}

interface PanState {
  startX: number;
  startY: number;
  panX: number;
  panY: number;
}

const ACCENT = "#35c2a1";
const CALIBRATION_COLOR = "#a78bfa";
const FONT_STACK = TEXT_FONT_STACK;
const HANDLE_SIZE = 8;
/**
 * Screen-space ceiling for canvas measurement labels. Paper-space labels keep
 * their true scale in exported PDFs, but at high zoom they would otherwise
 * cover the area the user is drawing. The cap keeps the label readable while
 * leaving the plan visible.
 */
const CANVAS_LABEL_MAX_PRIMARY_PX = 16;

export class CanvasView {
  readonly host: HTMLElement;
  private base: HTMLCanvasElement;
  private content: HTMLCanvasElement;
  private interaction: HTMLCanvasElement;
  private baseCtx: CanvasRenderingContext2D;
  private contentCtx: CanvasRenderingContext2D;
  private interactionCtx: CanvasRenderingContext2D;
  private loading: HTMLElement;
  private hooks: CanvasHooks;
  private observer: ResizeObserver;
  private unsubscribe: () => void;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private lastRender: RenderResult | null = null;
  private renderGeneration = 0;
  private renderTimer: number | null = null;
  private rendering = false;
  private draft: Draft | null = null;
  private drag: DragState | null = null;
  private marquee: MarqueeState | null = null;
  private pan: PanState | null = null;
  private pointerScreen: Point | null = null;
  private snap: SnapResult | null = null;
  private snapCache: { revision: number; page: number; candidates: SnapCandidate[] } | null = null;
  private spaceDown = false;
  private renderedPage = 0;
  private editorLayer: HTMLDivElement;
  private textEdit: TextEditSession | null = null;
  private labelEdit: LabelEditSession | null = null;
  private editingItemId: string | null = null;
  private editingLabelId: string | null = null;
  private hoverHandle: Handle | null = null;
  private cropMode: CropMode | null = null;
  private cropUi: HTMLDivElement | null = null;
  private imageCache = new Map<string, HTMLImageElement>();
  private imageLoading = new Set<string>();
  private imageFailed = new Set<string>();

  constructor(host: HTMLElement, hooks: CanvasHooks) {
    this.host = host;
    this.hooks = hooks;
    this.base = document.createElement("canvas");
    this.content = document.createElement("canvas");
    this.interaction = document.createElement("canvas");
    this.base.id = "canvas-pdf";
    this.content.id = "canvas-content";
    this.interaction.id = "canvas-interaction";
    this.interaction.tabIndex = 0;
    this.interaction.setAttribute("aria-label", "Drawing canvas");
    host.append(this.base, this.content, this.interaction);

    this.baseCtx = this.base.getContext("2d")!;
    this.contentCtx = this.content.getContext("2d")!;
    this.interactionCtx = this.interaction.getContext("2d")!;

    this.loading = document.createElement("div");
    this.loading.className = "canvas-loading";
    this.loading.textContent = "Rendering page…";
    host.append(this.loading);

    this.editorLayer = document.createElement("div");
    this.editorLayer.className = "canvas-editor-layer";
    host.append(this.editorLayer);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    document.addEventListener("pointerdown", this.onDocumentPointerDown, true);

    this.interaction.addEventListener("pointerdown", this.onPointerDown);
    this.interaction.addEventListener("pointermove", this.onPointerMove);
    this.interaction.addEventListener("pointerup", this.onPointerUp);
    this.interaction.addEventListener("pointercancel", this.onPointerUp);
    this.interaction.addEventListener("pointerleave", this.onPointerLeave);
    this.interaction.addEventListener("dblclick", this.onDoubleClick);
    this.interaction.addEventListener("wheel", this.onWheel, { passive: false });
    this.interaction.addEventListener("contextmenu", this.onContextMenu);

    this.unsubscribe = store.subscribe((reason) => this.onStoreChange(reason));
    this.resize();
    void ensureLabelFonts().then(() => {
      if (!store.project) return;
      this.drawContent();
      this.drawInteraction();
    });
  }

  private onStoreChange(reason: string): void {
    if (reason === "cursor") return;
    if (
      (this.textEdit && !this.textEdit.closing) ||
      (this.labelEdit && !this.labelEdit.closing)
    ) {
      if (reason === "view") {
        this.positionTextEditor();
        this.positionLabelEditor();
      } else if (reason !== "selection" && reason !== "change" && reason !== "save") {
        this.cancelTextEdit();
        this.cancelLabelEdit();
      }
    }
    const page = store.ui.page;
    if (reason === "project" || reason === "undo") {
      this.lastRender = null;
      this.draft = null;
      this.drag = null;
      this.marquee = null;
      this.renderedPage = page;
    }
    if (reason === "project") {
      this.imageCache.clear();
      this.imageLoading.clear();
      this.imageFailed.clear();
    }
    if (reason === "tool") {
      this.draft = null;
      this.updateCursor();
    }
    if (page !== this.renderedPage) {
      this.lastRender = null;
      this.draft = null;
      this.renderedPage = page;
    }
    this.drawAll();
    if (reason === "project" || reason === "view" || reason === "page" || reason === "undo") {
      this.schedulePdfRender();
    }
  }

  resize(): void {
    const rect = this.host.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (rect.width === this.width && rect.height === this.height && dpr === this.dpr) return;
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = dpr;
    for (const canvas of [this.base, this.content, this.interaction]) {
      canvas.width = Math.max(1, Math.round(this.width * this.dpr));
      canvas.height = Math.max(1, Math.round(this.height * this.dpr));
    }
    this.drawAll();
    this.positionTextEditor();
    this.positionLabelEditor();
    this.schedulePdfRender();
  }

  invalidate(): void {
    this.drawAll();
    this.schedulePdfRender();
  }

  setSpaceDown(down: boolean): void {
    this.spaceDown = down;
    this.updateCursor();
  }

  get isBusy(): boolean {
    return (
      this.drag !== null ||
      this.marquee !== null ||
      this.pan !== null ||
      this.draft !== null ||
      this.textEdit !== null ||
      this.labelEdit !== null ||
      this.cropMode !== null
    );
  }

  get isCropping(): boolean {
    return this.cropMode !== null;
  }

  private pageSize(): PageSize | undefined {
    const project = store.project;
    if (!project) return undefined;
    return this.hooks.getPageSize(store.ui.page);
  }

  private ensurePageSize(): PageSize | undefined {
    const size = this.pageSize();
    if (!size) this.hooks.ensurePageSize(store.ui.page);
    return size;
  }

  fitPage(): boolean {
    const size = this.ensurePageSize();
    if (!size || this.width < 1) return false;
    const padding = 42;
    const zoom = Math.max(
      0.03,
      Math.min((this.width - padding * 2) / size.width, (this.height - padding * 2) / size.height),
    );
    const panX = (this.width - size.width * zoom) / 2;
    const panY = (this.height - size.height * zoom) / 2;
    store.setView(zoom, panX, panY);
    return true;
  }

  /**
   * Enters the one-shot crop mode used by the drawing export dialog. The
   * promise resolves with a relative crop, or null when the user cancels.
   */
  pickExportCrop(initial?: NormalizedCrop): Promise<NormalizedCrop | null> {
    if (!store.project) return Promise.resolve(null);
    this.finishCrop(null);
    this.draft = null;
    this.drag = null;
    this.marquee = null;
    this.pan = null;
    this.hoverHandle = null;
    this.snap = null;
    this.snapCache = null;
    store.clearSelection();
    this.fitPage();
    const size = this.pageSize();
    if (!size) return Promise.resolve(null);
    const rect = initial ? pageRectFromCrop(initial, size) : null;
    return new Promise<NormalizedCrop | null>((resolve) => {
      this.cropMode = { rect, drag: null, hover: null, resolve };
      this.showCropUi();
      this.interaction.focus({ preventScroll: true });
      this.updateCursor();
      this.drawInteraction();
      toast("Draw the export area. Drag the handles to adjust. Enter uses it, Esc cancels.", "info");
    });
  }

  confirmCrop(): boolean {
    const mode = this.cropMode;
    if (!mode) return false;
    const size = this.pageSize();
    if (!size || !mode.rect || mode.rect.width < 1 || mode.rect.height < 1) {
      toast("Draw an export area first.", "warning");
      return false;
    }
    const crop = normalizeCropRect(mode.rect, size);
    if (!crop) {
      toast("The export area is too small.", "warning");
      return false;
    }
    this.finishCrop(crop);
    return true;
  }

  cancelCrop(): void {
    this.finishCrop(null);
  }

  private finishCrop(crop: NormalizedCrop | null): void {
    const mode = this.cropMode;
    if (!mode) return;
    this.cropMode = null;
    this.hideCropUi();
    this.updateCursor();
    this.drawInteraction();
    mode.resolve(crop);
  }

  private showCropUi(): void {
    this.hideCropUi();
    const bar = document.createElement("div");
    bar.className = "canvas-crop-bar";
    bar.dataset.cropUi = "true";

    const hint = document.createElement("span");
    hint.className = "canvas-crop-hint";
    hint.textContent = "Drag to select the export area";

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn btn-small btn-ghost";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => this.cancelCrop());

    const use = document.createElement("button");
    use.type = "button";
    use.className = "btn btn-small btn-primary";
    use.textContent = "Use area";
    use.addEventListener("click", () => this.confirmCrop());

    bar.append(hint, cancel, use);
    this.host.append(bar);
    this.cropUi = bar;
  }

  private hideCropUi(): void {
    this.cropUi?.remove();
    this.cropUi = null;
  }

  actualSize(): void {
    const size = this.ensurePageSize();
    if (!size) return;
    this.centerAtZoom(1);
  }

  zoomBy(factor: number): void {
    const center = { x: this.width / 2, y: this.height / 2 };
    this.zoomAt(center, factor);
  }

  setZoom(zoom: number): void {
    const clamped = Math.max(0.03, Math.min(40, zoom));
    this.centerAtZoom(clamped);
  }

  private centerAtZoom(zoom: number): void {
    const size = this.pageSize();
    if (!size) return;
    const centerPage = {
      x: (this.width / 2 - store.ui.panX) / store.ui.zoom,
      y: (this.height / 2 - store.ui.panY) / store.ui.zoom,
    };
    const panX = this.width / 2 - centerPage.x * zoom;
    const panY = this.height / 2 - centerPage.y * zoom;
    store.setView(zoom, panX, panY);
  }

  private zoomAt(screen: Point, factor: number): void {
    const { zoom, panX, panY } = store.ui;
    const next = Math.max(0.03, Math.min(40, zoom * factor));
    const page = { x: (screen.x - panX) / zoom, y: (screen.y - panY) / zoom };
    store.setView(next, screen.x - page.x * next, screen.y - page.y * next);
  }

  private localPoint(event: PointerEvent | WheelEvent | MouseEvent): Point {
    const rect = this.interaction.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  private toPage(screen: Point): Point {
    return {
      x: (screen.x - store.ui.panX) / store.ui.zoom,
      y: (screen.y - store.ui.panY) / store.ui.zoom,
    };
  }

  private toScreen(page: Point): Point {
    return {
      x: page.x * store.ui.zoom + store.ui.panX,
      y: page.y * store.ui.zoom + store.ui.panY,
    };
  }

  private pageLabelLayouts(): Map<string, LabelLayout> {
    const project = store.project;
    const size = this.pageSize();
    if (!project || !size) return new Map();
    return layoutPageLabels(pageLabelSources(project, store.ui.page), {
      pageSize: size,
      measure: measureLabelText,
    });
  }

  private labelScreenScale(metrics: LabelMetrics): number {
    return Math.min(
      store.ui.zoom,
      CANVAS_LABEL_MAX_PRIMARY_PX / Math.max(0.1, metrics.primarySize),
    );
  }

  private screenLabelBox(box: LabelBox, metrics: LabelMetrics): LabelBox {
    const zoom = store.ui.zoom;
    const scale = this.labelScreenScale(metrics);
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const width = box.width * scale;
    const height = box.height * scale;
    const x = centerX * zoom + store.ui.panX - width / 2;
    const y = centerY * zoom + store.ui.panY - height / 2;
    return {
      x,
      y,
      width,
      height,
      primaryCenterY: y + (box.primaryCenterY - box.y) * scale,
      secondaryCenterY:
        box.secondaryCenterY === undefined
          ? undefined
          : y + (box.secondaryCenterY - box.y) * scale,
    };
  }

  private updateCursor(): void {
    const tool = store.ui.activeTool;
    let cursor = "";
    if (this.cropMode) {
      const cropDrag = this.cropMode.drag;
      if (cropDrag?.mode === "move") cursor = "move";
      else if (cropDrag?.handle) cursor = cursorForRole(cropDrag.handle);
      else if (cropDrag?.mode === "new") cursor = "crosshair";
      else if (this.cropMode.hover === "move") cursor = "move";
      else if (this.cropMode.hover) cursor = cursorForRole(this.cropMode.hover);
      else cursor = "crosshair";
    } else if (this.pan) cursor = "grabbing";
    else if (this.drag) {
      if (this.drag.mode === "rotate") cursor = "grabbing";
      else if (this.drag.mode === "resize" && this.drag.handle) {
        cursor = cursorForRole(this.drag.handle);
      } else if (this.drag.mode === "vertex") cursor = "crosshair";
      else cursor = "move";
    } else if (this.spaceDown || tool === "pan") cursor = "grab";
    else if (this.marquee) cursor = "crosshair";
    else if (this.hoverHandle) cursor = this.hoverHandle.cursor;
    else if (tool === "text") cursor = "text";
    else if (tool !== "select") cursor = "crosshair";
    else if (store.ui.hover) cursor = "move";
    if (cursor) this.host.dataset.cursor = cursor;
    else delete this.host.dataset.cursor;
  }

  private capturePointer(pointerId: number): void {
    try {
      this.interaction.setPointerCapture(pointerId);
    } catch {
      // Synthetic events and some platforms do not expose an active pointer.
    }
  }

  private releasePointer(pointerId: number): void {
    try {
      this.interaction.releasePointerCapture(pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (!store.project) return;
    this.commitActiveEditors();
    this.interaction.focus({ preventScroll: true });
    const screen = this.localPoint(event);

    if (this.cropMode) {
      if (event.button !== 0) return;
      event.preventDefault();
      this.handleCropDown(this.toPage(screen), event);
      return;
    }

    if (event.button === 1 || this.spaceDown || store.ui.activeTool === "pan") {
      event.preventDefault();
      this.pan = {
        startX: event.clientX,
        startY: event.clientY,
        panX: store.ui.panX,
        panY: store.ui.panY,
      };
      this.capturePointer(event.pointerId);
      this.updateCursor();
      return;
    }
    if (event.button !== 0) return;

    const page = this.toPage(screen);
    const tool = store.ui.activeTool;

    if (tool === "select") {
      this.handleSelectDown(page, event);
      return;
    }

    if (tool === "calibrate") {
      if (event.detail > 1) return;
      const snapped = this.snapPoint(page);
      if (!this.draft || this.draft.kind !== "calibrate") {
        this.draft = { kind: "calibrate", points: [snapped], cursor: snapped };
        this.drawInteraction();
      } else {
        const first = this.draft.points[0];
        this.draft = null;
        void this.runCalibration(first, snapped);
      }
      return;
    }

    if (tool === "area" && store.ui.measureAreaShape !== "polygon") {
      if (event.detail > 1) return;
      const snapped = this.snapPoint(page);
      this.draft = {
        kind: store.ui.measureAreaShape === "rectangle" ? "area-rect" : "area-ellipse",
        start: snapped,
        current: snapped,
      };
      this.capturePointer(event.pointerId);
      this.drawInteraction();
      return;
    }

    const polygonKind =
      tool === "length"
        ? "length"
        : tool === "area"
          ? "area"
          : tool === "cloud"
            ? "cloud"
            : tool === "highlight" && store.ui.highlightShape === "polygon"
              ? "highlight-polygon"
              : null;
    if (polygonKind) {
      if (event.detail > 1) {
        this.finishDraft();
        return;
      }
      let snapped = this.snapPoint(page);
      if (this.draft && this.draft.kind === polygonKind && this.draft.points.length) {
        if (event.shiftKey) {
          const constrained = constrainAngle(
            this.draft.points[this.draft.points.length - 1],
            snapped,
          );
          if (distance(constrained, snapped) > 1e-6) this.snap = null;
          snapped = constrained;
        }
      }
      if (!this.draft || this.draft.kind !== polygonKind) {
        this.draft = { kind: polygonKind, points: [snapped], cursor: snapped };
      } else if (
        polygonKind !== "length" &&
        this.draft.points.length >= 3 &&
        distance(snapped, this.draft.points[0]) < 10 / store.ui.zoom
      ) {
        this.finishDraft();
        return;
      } else {
        const last = this.draft.points[this.draft.points.length - 1];
        if (distance(last, snapped) > 0.001) this.draft.points.push(snapped);
        this.draft.cursor = snapped;
      }
      this.drawInteraction();
      return;
    }

    if (
      tool === "highlight" &&
      (store.ui.highlightShape === "rectangle" || store.ui.highlightShape === "polygon")
    ) {
      if (store.ui.highlightShape === "rectangle") {
        const snapped = this.snapPoint(page);
        this.draft = { kind: "highlight-rect", start: snapped, current: snapped };
        this.capturePointer(event.pointerId);
        this.drawInteraction();
      }
      return;
    }

    if (tool === "pen" || tool === "highlight") {
      this.draft = { kind: tool, points: [page], cursor: page };
      this.capturePointer(event.pointerId);
      this.drawInteraction();
      return;
    }

    if (tool === "line" || tool === "arrow" || tool === "rect" || tool === "ellipse") {
      const snaps = tool === "line" || tool === "arrow";
      const snapped = snaps ? this.snapPoint(page) : page;
      if (!snaps) this.snap = null;
      this.draft = { kind: tool, start: snapped, current: snapped };
      this.capturePointer(event.pointerId);
      this.drawInteraction();
      return;
    }

    if (tool === "text") {
      const hit = hitTest(store.project, store.ui.page, page, 7 / store.ui.zoom);
      if (hit?.item.kind === "text" && !hit.layer.locked) {
        store.setSelection({ layerId: hit.layer.id, itemId: hit.item.id });
        this.startTextEdit(hit.item, hit.layer);
      } else {
        this.startNewText(page);
      }
      return;
    }

    if (tool === "callout") {
      if (event.detail > 1) return;
      if (!this.draft || this.draft.kind !== "callout") {
        this.draft = { kind: "callout", start: page, current: page };
        this.drawInteraction();
      } else {
        this.finishCallout(page);
      }
      return;
    }

    if (tool === "stamp") {
      if (event.detail > 1) return;
      this.createItem("stamp", [page], { text: store.ui.stampText });
      this.drawInteraction();
      return;
    }

    if (tool === "delta") {
      if (event.detail > 1) return;
      this.createItem("delta", [page], { text: store.ui.deltaText });
      this.drawInteraction();
      return;
    }

    if (tool === "count") {
      if (event.detail > 1) return;
      const snapped = this.snapPoint(page);
      this.createItem("count", [snapped]);
      this.drawInteraction();
    }
  };

  private handleSelectDown(page: Point, event: PointerEvent): void {
    const project = store.project!;
    const screen = this.localPoint(event);
    const modifier = event.shiftKey || event.ctrlKey || event.metaKey;
    const selection = store.ui.selection;
    const primary = store.primarySelection;
    if (!modifier && selection.length === 1 && primary) {
      const found = findItem(project, primary.itemId);
      if (found && !itemIsLocked(found.item, found.layer)) {
        const handle = this.handleAt(found.item, screen);
        if (handle) {
          this.beginHandleDrag(found.layer.id, found.item, handle, page, event);
          return;
        }
      }
    }

    const hit = hitTest(project, store.ui.page, page, 7 / store.ui.zoom, {
      includeLocked: true,
    });
    if (!hit) {
      if (!modifier) store.clearSelection();
      this.marquee = { start: page, current: page, additive: modifier };
      this.capturePointer(event.pointerId);
      this.updateCursor();
      this.drawInteraction();
      return;
    }

    const ref: SelectionRef = { layerId: hit.layer.id, itemId: hit.item.id };
    if (modifier) {
      store.toggleSelection(ref);
      this.drawInteraction();
      return;
    }

    const alreadySelected = store.isSelected(ref);
    if (!alreadySelected) store.setSelection(ref);

    if (itemIsLocked(hit.item, hit.layer)) {
      this.drawInteraction();
      return;
    }

    const single = store.ui.selection.length === 1;
    const vertexEditable =
      single &&
      (hit.item.kind === "length" ||
        hit.item.kind === "area" ||
        hit.item.kind === "cloud" ||
        hit.item.kind === "callout" ||
        (hit.item.kind === "highlight" && hit.item.highlightShape !== "stroke") ||
        hit.item.kind === "line" ||
        hit.item.kind === "arrow" ||
        hit.item.kind === "pen");
    const vertexIndex = vertexEditable
      ? findVertex(hit.item, page, 7 / store.ui.zoom)
      : -1;
    const startSelection = resolveSelection(project, store.ui.selection)
      .filter((entry) => !entry.locked)
      .map((entry) => ({
        ref: entry.ref,
        points: entry.item.points.map((point) => ({ ...point })),
      }));
    if (!startSelection.length) {
      this.drawInteraction();
      return;
    }
    store.beginGesture();
    this.drag = {
      mode: vertexIndex >= 0 ? "vertex" : "move",
      itemId: hit.item.id,
      layerId: hit.layer.id,
      vertexIndex,
      last: page,
      moved: false,
      startPage: page,
      startSelection,
    };
    this.capturePointer(event.pointerId);
    this.updateCursor();
    this.drawInteraction();
  }

  private beginHandleDrag(
    layerId: string,
    item: MarkupItem,
    handle: Handle,
    page: Point,
    event: PointerEvent,
  ): void {
    if (handle.role === "vertex") {
      store.beginGesture();
      this.drag = {
        mode: "vertex",
        itemId: item.id,
        layerId,
        vertexIndex: handle.index,
        last: page,
        moved: false,
        startPage: page,
      };
    } else if (handle.role === "rotate") {
      const center = itemCenter(item);
      store.beginGesture();
      this.drag = {
        mode: "rotate",
        itemId: item.id,
        layerId,
        vertexIndex: -1,
        last: page,
        moved: false,
        startPage: page,
        startPoints: item.points.map((point) => ({ ...point })),
        startRotation: itemRotation(item),
        center,
        startAngle: Math.atan2(page.y - center.y, page.x - center.x),
      };
    } else {
      const bounds = itemLocalBounds(item);
      store.beginGesture();
      this.drag = {
        mode: "resize",
        itemId: item.id,
        layerId,
        vertexIndex: -1,
        last: page,
        moved: false,
        handle: handle.role,
        startPage: page,
        startPoints: item.points.map((point) => ({ ...point })),
        startFontSize: item.fontSize ?? 12,
        startRotation: itemRotation(item),
        startBounds: {
          min: { ...bounds.min },
          max: { ...bounds.max },
        },
        center: midpoint(bounds.min, bounds.max),
      };
    }
    this.capturePointer(event.pointerId);
    this.updateCursor();
    this.drawInteraction();
  }

  private handleAt(item: MarkupItem, screen: Point): Handle | null {
    const handles = this.selectionHandles(item);
    let best: Handle | null = null;
    let bestDistance = HANDLE_SIZE + 2;
    for (const handle of handles) {
      const d = distance(screen, handle.point);
      if (d <= bestDistance) {
        best = handle;
        bestDistance = d;
      }
    }
    return best;
  }

  private selectionHandles(item: MarkupItem): Handle[] {
    if (item.kind === "count") return [];
    if (
      item.kind === "length" ||
      item.kind === "area" ||
      item.kind === "cloud" ||
      (item.kind === "highlight" && item.highlightShape !== "stroke")
    ) {
      return item.points.slice(0, 80).map((point, index) => ({
        role: "vertex" as const,
        index,
        point: this.toScreen(itemLocalToPage(item, point)),
        cursor: "crosshair",
      }));
    }

    if (item.kind === "callout") {
      return item.points.slice(0, 2).map((point, index) => ({
        role: "vertex" as const,
        index,
        point: this.toScreen(itemLocalToPage(item, point)),
        cursor: "crosshair",
      }));
    }

    if (item.kind === "stamp" || item.kind === "delta") {
      return [];
    }

    if (item.kind === "line" || item.kind === "arrow") {
      const handles: Handle[] = item.points.slice(0, 2).map((point, index) => ({
        role: "vertex" as const,
        index,
        point: this.toScreen(itemLocalToPage(item, point)),
        cursor: "crosshair",
      }));
      handles.push({
        role: "rotate",
        index: -1,
        point: this.rotationHandlePoint(item),
        cursor: "grab",
      });
      return handles;
    }

    const bounds = itemLocalBounds(item);
    const center = midpoint(bounds.min, bounds.max);
    const rotation = itemRotation(item);
    const roles: BoxHandleRole[] =
      item.kind === "text"
        ? ["nw", "ne", "se", "sw"]
        : ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    const handles: Handle[] = roles.map((role) => {
      const local = handleLocalPoint(bounds, role);
      const point = this.toScreen(rotatePoint(local, center, rotation));
      return {
        role,
        index: -1,
        point,
        cursor: cursorForRole(role),
      };
    });
    handles.push({
      role: "rotate",
      index: -1,
      point: this.rotationHandlePoint(item),
      cursor: "grab",
    });
    return handles;
  }

  private rotationHandlePoint(item: MarkupItem): Point {
    const bounds = itemLocalBounds(item);
    const center = midpoint(bounds.min, bounds.max);
    const rotation = itemRotation(item);
    const top = rotatePoint({ x: center.x, y: bounds.min.y }, center, rotation);
    const topScreen = this.toScreen(top);
    const upPage = rotatePoint({ x: center.x, y: center.y - 1 }, center, rotation);
    const centerScreen = this.toScreen(center);
    const upScreen = {
      x: (this.toScreen(upPage).x - centerScreen.x) / Math.max(1e-6, Math.hypot(
        this.toScreen(upPage).x - centerScreen.x,
        this.toScreen(upPage).y - centerScreen.y,
      )),
      y: (this.toScreen(upPage).y - centerScreen.y) / Math.max(1e-6, Math.hypot(
        this.toScreen(upPage).x - centerScreen.x,
        this.toScreen(upPage).y - centerScreen.y,
      )),
    };
    return {
      x: topScreen.x + upScreen.x * 26,
      y: topScreen.y + upScreen.y * 26,
    };
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!store.project) return;
    const screen = this.localPoint(event);
    this.pointerScreen = screen;
    const page = this.toPage(screen);
    store.setCursor(page);

    if (this.cropMode) {
      this.handleCropMove(page);
      return;
    }

    if (this.pan) {
      const dx = event.clientX - this.pan.startX;
      const dy = event.clientY - this.pan.startY;
      store.setView(store.ui.zoom, this.pan.panX + dx, this.pan.panY + dy);
      return;
    }

    if (this.drag) {
      this.applyDrag(page, event.shiftKey);
      return;
    }

    if (this.marquee) {
      this.marquee.current = page;
      this.drawInteraction();
      return;
    }

    const tool = store.ui.activeTool;
    if (this.draft) {
      if (this.draft.kind === "area-rect" || this.draft.kind === "area-ellipse") {
        let current = this.snapPoint(page);
        if (event.shiftKey) {
          const constrained = constrainSquare(this.draft.start, current);
          if (distance(constrained, current) > 1e-6) this.snap = null;
          current = constrained;
        }
        this.draft.current = current;
      } else if (
        this.draft.kind === "line" ||
        this.draft.kind === "arrow" ||
        this.draft.kind === "callout"
      ) {
        let current = this.snapPoint(page);
        if (event.shiftKey) {
          const constrained = constrainAngle(this.draft.start, current);
          if (distance(constrained, current) > 1e-6) this.snap = null;
          current = constrained;
        }
        this.draft.current = current;
      } else if (
        this.draft.kind === "rect" ||
        this.draft.kind === "ellipse" ||
        this.draft.kind === "highlight-rect"
      ) {
        this.snap = null;
        this.draft.current = event.shiftKey
          ? constrainSquare(this.draft.start, page)
          : page;
      } else if (this.draft.kind === "pen" || this.draft.kind === "highlight") {
        const last = this.draft.points[this.draft.points.length - 1];
        if (distance(last, page) > 1.4 / store.ui.zoom) {
          this.draft.points.push({ ...page });
        }
        this.draft.cursor = page;
      } else {
        let snapped = this.snapPoint(page);
        if (
          event.shiftKey &&
          (this.draft.kind === "length" ||
            this.draft.kind === "area" ||
            this.draft.kind === "cloud" ||
            this.draft.kind === "highlight-polygon") &&
          this.draft.points.length
        ) {
          const constrained = constrainAngle(
            this.draft.points[this.draft.points.length - 1],
            snapped,
          );
          if (distance(constrained, snapped) > 1e-6) this.snap = null;
          snapped = constrained;
        }
        this.draft.cursor = snapped;
      }
      this.drawInteraction();
      return;
    }

    if (tool === "select") {
      this.hoverHandle = null;
      const selection = store.primarySelection;
      if (selection && store.ui.selection.length === 1) {
        const found = findItem(store.project, selection.itemId);
        if (found && !itemIsLocked(found.item, found.layer)) {
          this.hoverHandle = this.handleAt(found.item, screen);
        }
      }
      if (!this.hoverHandle) {
        const hit = hitTest(store.project, store.ui.page, page, 7 / store.ui.zoom);
        store.setHover(hit ? { layerId: hit.layer.id, itemId: hit.item.id, vertexIndex: -1 } : null);
      } else {
        store.setHover(null);
      }
      this.updateCursor();
      this.drawInteraction();
    } else {
      this.hoverHandle = null;
      this.updateCursor();
    }
  };

  private applyDrag(page: Point, shiftKey: boolean): void {
    if (!this.drag || !store.project) return;
    const found = findItem(store.project, this.drag.itemId);
    if (!found || itemIsLocked(found.item, found.layer)) {
      this.endDrag();
      return;
    }
    const item = found.item;
    if (this.drag.mode === "move") {
      if (!this.drag.startPage || !this.drag.startSelection?.length) return;
      const dx = page.x - this.drag.startPage.x;
      const dy = page.y - this.drag.startPage.y;
      if (dx === 0 && dy === 0 && !this.drag.moved) return;
      for (const entry of this.drag.startSelection) {
        const target = findItem(store.project, entry.ref.itemId);
        if (!target || itemIsLocked(target.item, target.layer)) continue;
        target.item.points = translatePoints(entry.points, dx, dy);
        target.item.updatedAt = new Date().toISOString();
      }
      this.drag.last = page;
      this.drag.moved = true;
    } else if (this.drag.mode === "vertex") {
      const target = this.snapPoint(page, this.drag.itemId);
      const index = this.drag.vertexIndex;
      if (index >= 0 && index < item.points.length) {
        const localTarget =
          itemRotation(item) === 0 ? target : pointToItemLocal(item, target);
        item.points[index] = localTarget;
        item.updatedAt = new Date().toISOString();
        this.drag.moved = true;
      }
    } else if (this.drag.mode === "resize") {
      this.applyResize(item, page, shiftKey);
    } else {
      this.applyRotation(item, page, shiftKey);
    }
    this.drawContent();
    this.drawInteraction();
    this.updateCursor();
  }

  private applyResize(item: MarkupItem, page: Point, shiftKey: boolean): void {
    if (!this.drag?.startBounds || !this.drag.center || !this.drag.handle) return;
    const bounds = this.drag.startBounds;
    const center = this.drag.center;
    const rotation = this.drag.startRotation ?? 0;
    const local = rotatePoint(page, center, -rotation);
    const opposite = oppositeHandlePoint(bounds, this.drag.handle);
    const handlePoint = handleLocalPoint(bounds, this.drag.handle);
    const signX = this.drag.handle.includes("e") ? 1 : this.drag.handle.includes("w") ? -1 : 0;
    const signY = this.drag.handle.includes("s") ? 1 : this.drag.handle.includes("n") ? -1 : 0;
    const dx = handlePoint.x - opposite.x;
    const dy = handlePoint.y - opposite.y;
    if (dx === 0 && dy === 0) return;

    let factorX = signX === 0 ? 1 : (local.x - opposite.x) / dx;
    let factorY = signY === 0 ? 1 : (local.y - opposite.y) / dy;

    if (item.kind === "text") {
      let factor: number;
      if (signX !== 0 && signY !== 0) {
        const pointerX = local.x - opposite.x;
        const pointerY = local.y - opposite.y;
        factor = (pointerX * dx + pointerY * dy) / (dx * dx + dy * dy);
      } else {
        factor = signX !== 0 ? factorX : factorY;
      }
      factor = Math.max(0.01, Math.min(50, factor));
      const nextFont = clampTextSize((this.drag.startFontSize ?? 12) * factor);
      factor = nextFont / Math.max(0.5, this.drag.startFontSize ?? 12);
      factorX = factor;
      factorY = factor;
    } else {
      factorX = Math.max(0.02, Math.min(50, factorX));
      factorY = Math.max(0.02, Math.min(50, factorY));
      if (item.kind === "image") {
        // Corner handles keep the source aspect ratio; edge handles resize one axis.
        if (signX !== 0 && signY !== 0) {
          const factor =
            Math.abs(factorX - 1) >= Math.abs(factorY - 1) ? factorX : factorY;
          factorX = factor;
          factorY = factor;
        }
      } else if (shiftKey && signX !== 0 && signY !== 0) {
        const factor =
          Math.abs(factorX - 1) >= Math.abs(factorY - 1) ? factorX : factorY;
        factorX = factor;
        factorY = factor;
      }
    }

    const scaled = scaleBounds(bounds, opposite, factorX, factorY);
    let shiftX = 0;
    let shiftY = 0;
    if (rotation !== 0) {
      const oldOpposite = rotatePoint(opposite, center, rotation);
      const newCenter = midpoint(scaled.min, scaled.max);
      const newOpposite = rotatePoint(opposite, newCenter, rotation);
      shiftX = oldOpposite.x - newOpposite.x;
      shiftY = oldOpposite.y - newOpposite.y;
    }

    if (item.kind === "text") {
      item.fontSize = clampTextSize((this.drag.startFontSize ?? 12) * factorX);
      item.points[0] = {
        x: scaled.min.x + shiftX,
        y: scaled.min.y + shiftY,
      };
    } else if (item.kind === "rect" || item.kind === "ellipse" || item.kind === "image") {
      item.points = [
        { x: scaled.min.x + shiftX, y: scaled.min.y + shiftY },
        { x: scaled.max.x + shiftX, y: scaled.max.y + shiftY },
      ];
    } else if (item.kind === "pen" || item.kind === "highlight") {
      item.points = (this.drag.startPoints ?? item.points).map((point) => ({
        x: opposite.x + (point.x - opposite.x) * factorX + shiftX,
        y: opposite.y + (point.y - opposite.y) * factorY + shiftY,
      }));
    } else {
      return;
    }
    item.updatedAt = new Date().toISOString();
    this.drag.moved = true;
  }

  private applyRotation(item: MarkupItem, page: Point, shiftKey: boolean): void {
    if (!this.drag?.center || this.drag.startAngle === undefined) return;
    const center = this.drag.center;
    const angle = Math.atan2(page.y - center.y, page.x - center.x);
    let delta = ((angle - this.drag.startAngle) * 180) / Math.PI;
    if (shiftKey) delta = Math.round(delta / 15) * 15;
    if (delta === 0) return;
    if (
      item.kind === "text" ||
      item.kind === "rect" ||
      item.kind === "ellipse" ||
      item.kind === "image"
    ) {
      item.rotation = normalizeDegrees((this.drag.startRotation ?? 0) + delta);
    } else {
      item.points = rotatePointsAround(this.drag.startPoints ?? item.points, center, delta);
      delete item.rotation;
    }
    item.updatedAt = new Date().toISOString();
    this.drag.moved = true;
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (this.interaction.hasPointerCapture(event.pointerId)) {
      this.releasePointer(event.pointerId);
    }
    if (this.cropMode) {
      this.handleCropUp();
      return;
    }
    if (this.pan) {
      this.pan = null;
      this.updateCursor();
      return;
    }
    if (this.marquee) {
      this.finishMarquee();
      return;
    }
    if (this.drag) {
      const moved = this.drag.moved;
      this.endDrag();
      if (moved) this.snap = null;
      return;
    }
    if (this.draft) {
      if (this.draft.kind === "pen" || this.draft.kind === "highlight") {
        this.finishPen();
      } else if (this.draft.kind === "area-rect" || this.draft.kind === "area-ellipse") {
        this.finishQuickArea();
      } else if (
        this.draft.kind === "line" ||
        this.draft.kind === "arrow" ||
        this.draft.kind === "rect" ||
        this.draft.kind === "ellipse" ||
        this.draft.kind === "highlight-rect"
      ) {
        this.finishShape();
      }
    }
  };

  private endDrag(): void {
    if (!this.drag) return;
    const moved = this.drag.moved;
    this.drag = null;
    this.hoverHandle = null;
    if (moved) store.endGesture("change");
    else store.cancelGesture();
    this.updateCursor();
    this.drawContent();
    this.drawInteraction();
  }

  private finishMarquee(): void {
    const marquee = this.marquee;
    this.marquee = null;
    if (!marquee || !store.project) {
      this.drawInteraction();
      return;
    }
    const rect = expandRect(marquee.start, marquee.current);
    if (rect.width < 2 / store.ui.zoom && rect.height < 2 / store.ui.zoom) {
      this.updateCursor();
      this.drawInteraction();
      return;
    }
    const refs = marquee.additive ? [...store.ui.selection] : [];
    for (const layer of store.project.layers) {
      if (!layer.visible) continue;
      for (const item of layer.items) {
        if (item.page !== store.ui.page || item.visible === false) continue;
        const bounds = itemBounds(item);
        const intersects =
          bounds.max.x >= rect.x &&
          bounds.min.x <= rect.x + rect.width &&
          bounds.max.y >= rect.y &&
          bounds.min.y <= rect.y + rect.height;
        if (intersects) refs.push({ layerId: layer.id, itemId: item.id });
      }
    }
    store.setSelectionMany(refs);
    this.updateCursor();
    this.drawInteraction();
  }

  private handleCropDown(page: Point, event: PointerEvent): void {
    const mode = this.cropMode;
    const size = this.pageSize();
    if (!mode || !size) return;
    const point = clampPointToPage(page, size);
    const screen = this.toScreen(page);
    if (mode.rect) {
      const handle = this.cropHandleAt(mode.rect, screen);
      if (handle) {
        mode.drag = {
          mode: "resize",
          start: point,
          startRect: { ...mode.rect },
          handle,
          pointerId: event.pointerId,
        };
        this.capturePointer(event.pointerId);
        mode.hover = handle;
        this.updateCursor();
        this.drawInteraction();
        return;
      }
      if (pointInRect(point, mode.rect)) {
        mode.drag = {
          mode: "move",
          start: point,
          startRect: { ...mode.rect },
          pointerId: event.pointerId,
        };
        this.capturePointer(event.pointerId);
        mode.hover = "move";
        this.updateCursor();
        this.drawInteraction();
        return;
      }
    }
    mode.rect = { x: point.x, y: point.y, width: 0, height: 0 };
    mode.drag = {
      mode: "new",
      start: point,
      startRect: null,
      pointerId: event.pointerId,
    };
    mode.hover = null;
    this.capturePointer(event.pointerId);
    this.updateCursor();
    this.drawInteraction();
  }

  private handleCropMove(page: Point): void {
    const mode = this.cropMode;
    const size = this.pageSize();
    if (!mode || !size) return;
    if (!mode.drag) {
      mode.hover = mode.rect ? this.cropHoverAt(mode.rect, this.toScreen(page)) : null;
      this.updateCursor();
      this.drawInteraction();
      return;
    }
    const point = clampPointToPage(page, size);
    if (mode.drag.mode === "new") {
      mode.rect = rectFromPoints(mode.drag.start, point);
    } else if (mode.drag.startRect) {
      mode.rect =
        mode.drag.mode === "move"
          ? movePageRect(mode.drag.startRect, mode.drag.start, point, size)
          : resizePageRect(mode.drag.startRect, mode.drag.handle, point, size);
    }
    this.drawInteraction();
  }

  private handleCropUp(): void {
    const mode = this.cropMode;
    if (!mode) return;
    const drag = mode.drag;
    mode.drag = null;
    mode.hover = null;
    if (drag?.mode === "new" && mode.rect && (mode.rect.width < 1 || mode.rect.height < 1)) {
      mode.rect = null;
    }
    this.updateCursor();
    this.drawInteraction();
  }

  private cropHandleAt(rect: PageRect, screen: Point): BoxHandleRole | null {
    const tolerance = 10;
    for (const [role, point] of this.cropHandlePoints(rect)) {
      const target = this.toScreen(point);
      if (Math.hypot(target.x - screen.x, target.y - screen.y) <= tolerance) return role;
    }
    return null;
  }

  private cropHoverAt(rect: PageRect, screen: Point): BoxHandleRole | "move" | null {
    const handle = this.cropHandleAt(rect, screen);
    if (handle) return handle;
    return pointInRect(this.toPage(screen), rect) ? "move" : null;
  }

  private cropHandlePoints(rect: PageRect): Array<[BoxHandleRole, Point]> {
    const left = rect.x;
    const top = rect.y;
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    const midX = (left + right) / 2;
    const midY = (top + bottom) / 2;
    return [
      ["nw", { x: left, y: top }],
      ["n", { x: midX, y: top }],
      ["ne", { x: right, y: top }],
      ["e", { x: right, y: midY }],
      ["se", { x: right, y: bottom }],
      ["s", { x: midX, y: bottom }],
      ["sw", { x: left, y: bottom }],
      ["w", { x: left, y: midY }],
    ];
  }

  private onPointerLeave = (): void => {
    if (this.cropMode) {
      if (!this.cropMode.drag) {
        this.cropMode.hover = null;
        this.updateCursor();
        this.drawInteraction();
      }
      return;
    }
    if (this.drag || this.pan) return;
    this.pointerScreen = null;
    this.hoverHandle = null;
    store.setCursor(null);
    store.setHover(null);
    this.snap = null;
    this.updateCursor();
    this.drawInteraction();
  };

  private onDoubleClick = (event: MouseEvent): void => {
    if (!store.project || this.cropMode) return;
    const tool = store.ui.activeTool;
    if (tool === "length" || tool === "area") {
      this.finishDraft();
      return;
    }
    if (tool !== "select" && tool !== "text") return;
    const screen = this.localPoint(event);
    const page = this.toPage(screen);

    if (tool === "select" && this.calibrationLabelHit(screen)) {
      void this.editCalibration();
      return;
    }

    const labelHit = this.measurementLabelHit(screen);
    if (labelHit && !itemIsLocked(labelHit.item, labelHit.layer)) {
      store.setSelection({ layerId: labelHit.layer.id, itemId: labelHit.item.id });
      this.startLabelEdit(labelHit);
      return;
    }

    const hit = hitTest(store.project, store.ui.page, page, 7 / store.ui.zoom);
    if (!hit || itemIsLocked(hit.item, hit.layer)) return;
    store.setSelection({ layerId: hit.layer.id, itemId: hit.item.id });

    if (hit.item.kind === "text") {
      this.startTextEdit(hit.item, hit.layer);
      return;
    }
    if (
      hit.item.kind === "cloud" ||
      hit.item.kind === "callout" ||
      hit.item.kind === "stamp" ||
      hit.item.kind === "delta"
    ) {
      void this.editItemText(hit.item);
      return;
    }

    const segment = findSegment(
      hit.item,
      page,
      7 / store.ui.zoom,
      hit.item.kind === "area" ||
        hit.item.kind === "rect" ||
        hit.item.kind === "ellipse" ||
        (hit.item.kind === "highlight" && hit.item.highlightShape === "polygon"),
    );
    if (
      segment &&
      ["length", "area", "pen"].includes(hit.item.kind) &&
      (hit.item.kind !== "area" || areaShapeOf(hit.item) === "polygon")
    ) {
      const insert = nearestPointOnSegment(
        pointToItemLocal(hit.item, page),
        hit.item.points[segment.index],
        hit.item.points[(segment.index + 1) % hit.item.points.length],
      );
      store.mutate(
        (project) => {
          const item = findItem(project, hit.item.id)?.item;
          if (item) {
            item.points.splice(segment.index + 1, 0, insert);
            item.updatedAt = new Date().toISOString();
          }
        },
        "change",
      );
    }
  };

  private onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    if (this.cropMode) return;
    const project = store.project;
    if (!project) return;
    const page = this.toPage(this.localPoint(event));
    const hit = hitTest(project, store.ui.page, page, 7 / store.ui.zoom, {
      includeLocked: true,
    });
    if (hit) {
      const ref = { layerId: hit.layer.id, itemId: hit.item.id };
      if (!store.isSelected(ref)) store.setSelection(ref);
    }
    this.hooks.onContextMenu?.({
      page,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  private onWheel = (event: WheelEvent): void => {
    if (!store.project) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      const factor = Math.exp(-event.deltaY * 0.0018);
      this.zoomAt(this.localPoint(event), factor);
      return;
    }
    const dx = event.shiftKey ? event.deltaY : event.deltaX;
    const dy = event.shiftKey ? 0 : event.deltaY;
    store.setView(store.ui.zoom, store.ui.panX - dx, store.ui.panY - dy);
  };

  private snapCandidates(): readonly SnapCandidate[] {
    const project = store.project;
    if (!project) return [];
    if (
      !this.snapCache ||
      this.snapCache.revision !== store.revision ||
      this.snapCache.page !== store.ui.page
    ) {
      this.snapCache = {
        revision: store.revision,
        page: store.ui.page,
        candidates: collectSnapCandidates(project, store.ui.page),
      };
    }
    return this.snapCache.candidates;
  }

  private snapPoint(point: Point, excludeItemId?: string): Point {
    const project = store.project;
    this.snap = null;
    if (!project || !project.settings.snapToGeometry) return point;
    const candidates = excludeItemId
      ? this.snapCandidates().filter(
          (candidate) => !candidate.itemIds?.includes(excludeItemId),
        )
      : this.snapCandidates();
    const result = findSnap(
      point,
      candidates,
      project.settings.snapTolerancePx ?? 8,
      store.ui.zoom,
    );
    if (!result) return point;
    this.snap = result;
    return { ...result.point };
  }

  private runCalibration = async (p1: Point, p2: Point): Promise<void> => {
    const project = store.project;
    if (!project) return;
    const page = store.ui.page;
    if (pageScaleLocked(project, page)) {
      this.draft = null;
      toast("This page scale is locked. Unlock it before calibrating.", "warning");
      this.drawInteraction();
      return;
    }
    const pagesAffected = project.layers.some(
      (layer) =>
        layer.kind === "measure" &&
        layer.items.some((item) => item.page === page),
    );
    const result = await calibrationDialog({
      defaultUnit: project.settings.lengthUnit,
      hasMeasurements: pagesAffected,
      pageCount: totalPageCount(project.documents),
      currentPage: page,
    });
    if (!result) {
      this.drawInteraction();
      return;
    }
    const calibration = createCalibration(p1, p2, result.knownLength, result.unit);
    let changed: number[] = [];
    store.mutate(
      (project) => {
        changed = setPageCalibration(project, page, calibration, {
          applyToAll: result.applyToAll,
          updateMeasurements: result.updateMeasurements,
          pageCount: totalPageCount(project.documents),
        });
      },
      "change",
    );
    if (!changed.length) {
      toast("No unlocked pages were available for this calibration.", "warning");
      this.drawInteraction();
      return;
    }
    store.setTool("select");
    const lockedSkipped = result.applyToAll
      ? totalPageCount(project.documents) - changed.length
      : 0;
    toast(
      result.applyToAll
        ? `Scale set from a ${formatNumber(result.knownLength, 2)} ${result.unit} reference on ${
            changed.length === 1 ? "1 page" : `${changed.length} pages`
          }${lockedSkipped > 0 ? ` · ${lockedSkipped} locked skipped` : ""}.`
        : `Scale set at ${formatNumber(result.knownLength, 2)} ${result.unit}.`,
      "success",
    );
    this.drawAll();
    this.schedulePdfRender();
  };

  private editCalibration = async (): Promise<void> => {
    const project = store.project;
    if (!project) return;
    const page = store.ui.page;
    const calibration = pageCalibration(project, page);
    if (!calibration) return;
    if (pageScaleLocked(project, page)) {
      toast("This page scale is locked. Unlock it before editing.", "warning");
      return;
    }
    if (!isReferenceCalibration(calibration)) {
      toast("This page uses a manual scale. Use Manual scale to change it.", "info");
      return;
    }
    const pagesAffected = project.layers.some(
      (layer) =>
        layer.kind === "measure" &&
        layer.items.some((item) => item.page === page),
    );
    const result = await calibrationDialog({
      mode: "edit",
      defaultUnit: calibration.unit,
      initialKnownLength: calibration.knownLength,
      initialUnit: calibration.unit,
      hasMeasurements: pagesAffected,
      pageCount: totalPageCount(project.documents),
      currentPage: page,
    });
    if (!result) return;
    const next = createCalibration(
      calibration.p1,
      calibration.p2,
      result.knownLength,
      result.unit,
    );
    store.mutate(
      (project) => {
        setPageCalibration(project, page, next, {
          applyToAll: false,
          updateMeasurements: result.updateMeasurements,
          pageCount: totalPageCount(project.documents),
        });
      },
      "change",
    );
    toast(
      `Reference length updated to ${formatNumber(result.knownLength, 2)} ${result.unit}.`,
      "success",
    );
  };

  private startNewText(point: Point): void {
    if (this.textEdit) this.commitTextEdit();
    const style = store.ui.style;
    this.beginTextEditSession({
      itemId: null,
      layerId: null,
      page: store.ui.page,
      anchor: point,
      text: "",
      color: style.color,
      fontSize: style.fontSize,
      rotation: 0,
    });
  }

  private startTextEdit(item: MarkupItem, layer: Layer): void {
    if (itemIsLocked(item, layer)) {
      toast("This item is locked.", "warning");
      return;
    }
    if (this.textEdit) this.commitTextEdit();
    this.beginTextEditSession({
      itemId: item.id,
      layerId: layer.id,
      page: item.page,
      anchor: item.points[0] ?? { x: 0, y: 0 },
      text: item.text ?? "",
      color: item.color,
      fontSize: clampTextSize(item.fontSize ?? 12),
      rotation: normalizeDegrees(itemRotation(item)),
      original: {
        text: item.text ?? "",
        color: item.color,
        fontSize: clampTextSize(item.fontSize ?? 12),
        rotation: normalizeDegrees(itemRotation(item)),
      },
    });
  }

  public editSelectedText(): void {
    const selection = store.primarySelection;
    if (!selection || !store.project) return;
    const found = findItem(store.project, selection.itemId);
    if (!found || found.item.locked || found.layer.locked) {
      toast("Select an unlocked text item to edit it.", "info");
      return;
    }
    store.setTool("select");
    if (found.item.kind === "text") {
      this.startTextEdit(found.item, found.layer);
      return;
    }
    if (
      found.item.kind === "cloud" ||
      found.item.kind === "callout" ||
      found.item.kind === "stamp" ||
      found.item.kind === "delta"
    ) {
      void this.editItemText(found.item);
      return;
    }
    toast("Select a text note to edit it.", "info");
  }

  private beginTextEditSession(
    session: Omit<TextEditSession, "closing" | "container" | "textarea" | "strip">,
  ): void {
    this.cancelLabelEdit();
    const container = document.createElement("div");
    container.className = "canvas-text-editor";
    const textarea = document.createElement("textarea");
    textarea.className = "canvas-text-editor-input";
    textarea.value = session.text;
    textarea.placeholder = "Type a note…";
    textarea.wrap = "off";
    textarea.spellcheck = false;
    textarea.setAttribute("aria-label", "Text annotation");
    const strip = document.createElement("div");
    strip.className = "inline-style-strip";

    const sizeField = document.createElement("label");
    sizeField.className = "inline-style-field";
    sizeField.title = "Font size in points";
    const sizeLabel = document.createElement("span");
    sizeLabel.textContent = "Size";
    const sizeInput = document.createElement("input");
    sizeInput.type = "number";
    sizeInput.min = "0.5";
    sizeInput.max = "300";
    sizeInput.step = "0.5";
    sizeInput.value = String(roundTo(session.fontSize, 2));
    sizeInput.className = "inline-size-input";
    sizeField.append(sizeLabel, sizeInput);

    const colorField = document.createElement("label");
    colorField.className = "inline-style-field inline-color-field";
    colorField.title = "Text colour";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = session.color;
    colorInput.setAttribute("aria-label", "Text colour");
    colorField.append(colorInput);

    const rotationField = document.createElement("label");
    rotationField.className = "inline-style-field";
    rotationField.title = "Rotation in degrees";
    const rotationLabel = document.createElement("span");
    rotationLabel.textContent = "Angle";
    const rotationInput = document.createElement("input");
    rotationInput.type = "number";
    rotationInput.min = "-360";
    rotationInput.max = "360";
    rotationInput.step = "1";
    rotationInput.value = String(roundTo(session.rotation, 1));
    rotationInput.className = "inline-angle-input";
    rotationField.append(rotationLabel, rotationInput);

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "inline-strip-button is-quiet";
    cancelButton.textContent = "Cancel";
    const doneButton = document.createElement("button");
    doneButton.type = "button";
    doneButton.className = "inline-strip-button is-primary";
    doneButton.textContent = "Done";
    strip.append(sizeField, colorField, rotationField, cancelButton, doneButton);
    container.append(textarea, strip);

    const edit: TextEditSession = {
      ...session,
      closing: false,
      container,
      textarea,
      strip,
    };
    this.textEdit = edit;
    this.editingItemId = edit.itemId;
    this.editorLayer.append(container);

    const refresh = () => {
      edit.text = textarea.value;
      edit.fontSize = clampTextSize(Number(sizeInput.value));
      edit.color = colorInput.value;
      edit.rotation = normalizeDegrees(Number(rotationInput.value));
      textarea.style.color = edit.color;
      this.positionTextEditor();
    };
    sizeInput.addEventListener("input", refresh);
    colorInput.addEventListener("input", refresh);
    rotationInput.addEventListener("input", refresh);
    textarea.addEventListener("input", () => {
      edit.text = textarea.value;
      this.positionTextEditor();
    });
    textarea.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.cancelTextEdit();
      } else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        void this.commitTextEdit();
      }
    });
    textarea.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (!this.textEdit || this.textEdit !== edit || edit.closing) return;
        const active = document.activeElement;
        if (active && this.editorLayer.contains(active)) return;
        void this.commitTextEdit();
      }, 0);
    });
    doneButton.addEventListener("click", () => void this.commitTextEdit());
    cancelButton.addEventListener("click", () => this.cancelTextEdit());

    this.positionTextEditor();
    this.drawContent();
    this.drawInteraction();
    window.requestAnimationFrame(() => {
      if (this.textEdit !== edit) return;
      textarea.focus({ preventScroll: true });
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }

  private positionTextEditor(): void {
    const edit = this.textEdit;
    if (!edit || edit.closing) return;
    const layout = textItemLayout(
      { text: edit.text, fontSize: edit.fontSize },
      measureTextWidth,
    );
    const zoom = store.ui.zoom;
    const anchor = this.toScreen(edit.anchor);
    const width = Math.max(52, layout.width * zoom + 4);
    const height = Math.max(layout.lineHeight * zoom + 4, layout.height * zoom + 4);
    const textarea = edit.textarea;
    textarea.style.left = `${anchor.x - 2}px`;
    textarea.style.top = `${anchor.y - 2}px`;
    textarea.style.width = `${width}px`;
    textarea.style.height = `${height}px`;
    textarea.style.fontSize = `${Math.max(1, layout.fontSize * zoom)}px`;
    textarea.style.lineHeight = `${layout.lineHeight * zoom}px`;
    textarea.style.fontFamily = FONT_STACK;
    textarea.style.color = edit.color;
    textarea.style.transform = `rotate(${edit.rotation}deg)`;
    textarea.style.transformOrigin = "center";

    const box = rotatedAabb(
      anchor.x - 2,
      anchor.y - 2,
      width,
      height,
      edit.rotation,
    );
    const stripWidth = edit.strip.offsetWidth || 270;
    const left = Math.max(8, Math.min(this.width - stripWidth - 8, box.minX));
    let top = box.minY - 44;
    if (top < 8) top = box.maxY + 8;
    edit.strip.style.left = `${left}px`;
    edit.strip.style.top = `${Math.max(8, top)}px`;
  }

  private closeTextEditor(): void {
    if (!this.textEdit) return;
    this.textEdit.container.remove();
    this.textEdit = null;
    this.editingItemId = null;
    this.drawContent();
    this.drawInteraction();
  }

  private async commitTextEdit(): Promise<void> {
    const edit = this.textEdit;
    if (!edit || edit.closing) return;
    edit.closing = true;
    const project = store.project;
    if (!project) {
      this.closeTextEditor();
      return;
    }
    const value = edit.text;
    if (edit.itemId) {
      const found = findItem(project, edit.itemId);
      if (!found || itemIsLocked(found.item, found.layer)) {
        this.closeTextEditor();
        return;
      }
      const original = edit.original!;
      const rotation = normalizeDegrees(edit.rotation);
      const changed =
        value !== original.text ||
        edit.color !== original.color ||
        Math.abs(edit.fontSize - original.fontSize) > 0.001 ||
        Math.abs(rotation - normalizeDegrees(original.rotation)) > 0.001;
      this.closeTextEditor();
      if (!changed) return;
      store.mutate(
        (project) => {
          const item = findItem(project, edit.itemId!)?.item;
          if (!item) return;
          item.text = value;
          item.color = edit.color;
          item.fontSize = clampTextSize(edit.fontSize);
          if (rotation === 0) delete item.rotation;
          else item.rotation = rotation;
          item.updatedAt = new Date().toISOString();
        },
        "change",
      );
      return;
    }

    if (!value.trim()) {
      this.closeTextEditor();
      return;
    }
    const active = project.layers.find(
      (layer) => layer.id === project.activeLayerId && layer.kind === "draw",
    );
    if (active && (!active.visible || active.locked)) {
      toast(
        `“${active.name}” is ${active.locked ? "locked" : "hidden"}. Unlock or show it, or choose another layer.`,
        "warning",
      );
      this.closeTextEditor();
      return;
    }
    const rotation = normalizeDegrees(edit.rotation);
    let layerId = "";
    let itemId = "";
    this.closeTextEditor();
    store.mutate(
      (project) => {
        const layer = ensureActiveLayer(project, "draw");
        const now = new Date().toISOString();
        const item: MarkupItem = {
          id: makeId("item"),
          page: edit.page,
          kind: "text",
          points: [{ ...edit.anchor }],
          color: edit.color,
          strokeWidth: 2,
          text: value,
          fontSize: clampTextSize(edit.fontSize),
          rotation: rotation === 0 ? undefined : rotation,
          scale: null,
          createdAt: now,
          updatedAt: now,
        };
        addItem(project, layer.id, item);
        layerId = layer.id;
        itemId = item.id;
      },
      "change",
    );
    if (layerId && itemId) {
      store.setSelection({ layerId, itemId });
      store.setTool("select");
    }
  }

  private cancelTextEdit(): void {
    if (!this.textEdit) return;
    this.textEdit.closing = true;
    this.closeTextEditor();
  }

  private startLabelEdit(hit: LabelHit): void {
    if (itemIsLocked(hit.item, hit.layer)) {
      toast("This item is locked.", "warning");
      return;
    }
    if (this.textEdit) this.commitTextEdit();
    const container = document.createElement("div");
    container.className = "canvas-label-editor";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "canvas-label-editor-input";
    input.value = hit.item.label ?? "";
    input.placeholder = "Add label";
    input.setAttribute("aria-label", "Measurement label");
    const hint = document.createElement("span");
    hint.className = "canvas-label-editor-hint";
    const project = store.project;
    const metrics = project ? itemMetrics(hit.item, project) : null;
    hint.textContent = metrics
      ? `${metrics.primary}${metrics.secondary ? ` · ${metrics.secondary}` : ""}`
      : "";
    container.append(input, hint);
    const edit: LabelEditSession = {
      itemId: hit.item.id,
      layerId: hit.layer.id,
      page: hit.item.page,
      value: hit.item.label ?? "",
      original: hit.item.label,
      closing: false,
      container,
      input,
    };
    this.labelEdit = edit;
    this.editingLabelId = hit.item.id;
    this.editorLayer.append(container);
    this.positionLabelEditor();

    input.addEventListener("input", () => {
      edit.value = input.value;
    });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        void this.commitLabelEdit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.cancelLabelEdit();
      }
    });
    input.addEventListener("blur", () => {
      window.setTimeout(() => {
        if (!this.labelEdit || this.labelEdit !== edit || edit.closing) return;
        const active = document.activeElement;
        if (active && this.editorLayer.contains(active)) return;
        void this.commitLabelEdit();
      }, 0);
    });
    this.drawContent();
    this.drawInteraction();
    window.requestAnimationFrame(() => {
      if (this.labelEdit !== edit) return;
      input.focus({ preventScroll: true });
      input.select();
    });
  }

  private positionLabelEditor(): void {
    const edit = this.labelEdit;
    if (!edit || edit.closing || !store.project) return;
    const found = findItem(store.project, edit.itemId);
    if (!found) return;
    const layout = this.pageLabelLayouts().get(found.item.id);
    if (!layout) return;
    const box = this.screenLabelBox(layout.box, layout.metrics);
    const width = Math.max(150, box.width + 42);
    edit.container.style.left = `${Math.max(6, Math.min(this.width - width - 6, box.x - 20))}px`;
    edit.container.style.top = `${Math.max(6, box.y)}px`;
    edit.container.style.width = `${width}px`;
    edit.container.style.minHeight = `${Math.max(28, box.height)}px`;
  }

  private closeLabelEditor(): void {
    if (!this.labelEdit) return;
    this.labelEdit.container.remove();
    this.labelEdit = null;
    this.editingLabelId = null;
    this.drawContent();
    this.drawInteraction();
  }

  private async commitLabelEdit(): Promise<void> {
    const edit = this.labelEdit;
    if (!edit || edit.closing) return;
    edit.closing = true;
    const value = edit.value.trim();
    const original = (edit.original ?? "").trim();
    this.closeLabelEditor();
    if (value === original) return;
    store.mutate(
      (project) => {
        const item = findItem(project, edit.itemId)?.item;
        if (!item) return;
        item.label = value || undefined;
        item.updatedAt = new Date().toISOString();
      },
      "change",
    );
  }

  private cancelLabelEdit(): void {
    if (!this.labelEdit) return;
    this.labelEdit.closing = true;
    this.closeLabelEditor();
  }

  private commitActiveEditors(): void {
    if (this.textEdit && !this.textEdit.closing) void this.commitTextEdit();
    if (this.labelEdit && !this.labelEdit.closing) void this.commitLabelEdit();
  }

  private measurementLabelHit(screen: Point): LabelHit | null {
    const project = store.project;
    if (!project) return null;
    const layouts = this.pageLabelLayouts();
    for (let l = project.layers.length - 1; l >= 0; l--) {
      const layer = project.layers[l];
      if (!layer.visible || layer.opacity <= 0) continue;
      for (let i = layer.items.length - 1; i >= 0; i--) {
        const item = layer.items[i];
        if (item.page !== store.ui.page || item.visible === false) continue;
        if (item.kind !== "length" && item.kind !== "area" && item.kind !== "count") continue;
        const layout = layouts.get(item.id);
        if (!layout) continue;
        if (this.hitLabelBox(screen, this.screenLabelBox(layout.box, layout.metrics))) {
          return { layer, item };
        }
      }
    }
    return null;
  }

  private calibrationLabelHit(screen: Point): boolean {
    const project = store.project;
    if (!project || !project.settings.showCalibration) return false;
    const layout = this.pageLabelLayouts().get(CALIBRATION_LABEL_ID);
    if (!layout) return false;
    return this.hitLabelBox(screen, this.screenLabelBox(layout.box, layout.metrics));
  }

  private hitLabelBox(screen: Point, box: LabelBox): boolean {
    const minHit = 12;
    const paddingX = Math.max(0, (minHit - box.width) / 2);
    const paddingY = Math.max(0, (minHit - box.height) / 2);
    return pointInBox(
      screen,
      box.x - paddingX,
      box.y - paddingY,
      box.width + paddingX * 2,
      box.height + paddingY * 2,
    );
  }

  private onDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.textEdit && !this.labelEdit) return;
    const target = event.target;
    if (target instanceof Node && this.editorLayer.contains(target)) return;
    this.commitActiveEditors();
  };

  private createItem(
    kind: ItemKind,
    points: Point[],
    options: {
      text?: string;
      areaShape?: AreaShape;
      highlightShape?: "stroke" | "rectangle" | "polygon";
    } = {},
  ): { layerId: string; itemId: string } | null {
    const project = store.project;
    if (!project) return null;
    const layerKind = layerKindForItem(kind);
    const active = project.layers.find(
      (layer) => layer.id === project.activeLayerId && layer.kind === layerKind,
    );
    if (active && (!active.visible || active.locked)) {
      toast(
        `“${active.name}” is ${active.locked ? "locked" : "hidden"}. Unlock or show it, or choose another layer.`,
        "warning",
      );
      return null;
    }
    const projectPage = store.ui.page;
    let layerId = "";
    let itemId = "";
    const scale = pageScale(project, projectPage);
    store.mutate(
      (project) => {
        const layer = ensureActiveLayer(project, layerKind);
        const now = new Date().toISOString();
        const style = store.ui.style;
        const isMeasure = layerKind === "measure";
        const category = isMeasure ? measurementCategory(project, store.ui.measureCategoryId) : undefined;
        const highlightShape =
          kind === "highlight" ? (options.highlightShape ?? "stroke") : undefined;
        const filled =
          !isMeasure &&
          (kind === "rect" ||
            kind === "ellipse" ||
            kind === "stamp" ||
            kind === "delta" ||
            (kind === "highlight" && highlightShape !== "stroke"));
        const textLike =
          kind === "text" ||
          kind === "cloud" ||
          kind === "callout" ||
          kind === "stamp" ||
          kind === "delta";
        const item: MarkupItem = {
          id: makeId("item"),
          page: projectPage,
          kind,
          points: points.map((p) => ({ ...p })),
          color: isMeasure
            ? layer.color
            : kind === "stamp"
              ? stampStatusColor(options.text ?? store.ui.stampText, style.color)
              : style.color,
          strokeWidth: isMeasure ? DEFAULT_MEASUREMENT_STROKE_WIDTH : style.strokeWidth,
          fillColor: filled ? style.color : undefined,
          opacity:
            !isMeasure &&
            (kind === "rect" ||
              kind === "ellipse" ||
              kind === "stamp" ||
              kind === "delta" ||
              (kind === "highlight" && highlightShape !== "stroke"))
              ? kind === "highlight"
                ? Math.max(0.18, style.fillOpacity)
                : style.fillOpacity
              : kind === "highlight"
                ? 0.35
                : undefined,
          text: options.text,
          fontSize: textLike ? style.fontSize : undefined,
          highlightShape,
          scale: isMeasure && scale ? { ...scale } : null,
          categoryId: category?.id,
          room: isMeasure ? normalizeRoom(store.ui.measureRoom) : undefined,
          areaMode: kind === "area" ? store.ui.measureAreaMode : undefined,
          areaShape: kind === "area" ? (options.areaShape ?? "polygon") : undefined,
          countType: kind === "count" ? store.ui.measureCountType : undefined,
          createdAt: now,
          updatedAt: now,
        };
        addItem(project, layer.id, item);
        layerId = layer.id;
        itemId = item.id;
      },
      "change",
    );
    if (!layerId || !itemId) return null;
    store.setSelection({ layerId, itemId });
    return { layerId, itemId };
  }

  private finishPen(): void {
    if (!this.draft || (this.draft.kind !== "pen" && this.draft.kind !== "highlight")) return;
    const points = this.draft.points;
    const kind = this.draft.kind;
    this.draft = null;
    if (points.length < 2) {
      this.drawInteraction();
      return;
    }
    const simplified = simplifyPolyline(points, 0.8 / store.ui.zoom);
    this.createItem(kind, simplified);
    this.drawInteraction();
  }

  private finishShape(): void {
    if (
      !this.draft ||
      (this.draft.kind !== "line" &&
        this.draft.kind !== "arrow" &&
        this.draft.kind !== "rect" &&
        this.draft.kind !== "ellipse" &&
        this.draft.kind !== "highlight-rect")
    ) {
      return;
    }
    const { kind, start, current } = this.draft;
    this.draft = null;
    this.snap = null;
    if (distance(start, current) < 3 / store.ui.zoom) {
      this.drawInteraction();
      return;
    }
    if (kind === "highlight-rect") {
      this.createItem("highlight", [start, current], { highlightShape: "rectangle" });
    } else {
      this.createItem(kind, [start, current]);
    }
    this.drawInteraction();
  }

  private finishCallout(current: Point): void {
    if (!this.draft || this.draft.kind !== "callout") return;
    const start = this.draft.start;
    this.draft = null;
    this.snap = null;
    if (distance(start, current) < 3 / store.ui.zoom) {
      this.drawInteraction();
      return;
    }
    void this.createCallout(start, current);
  }

  private async createCallout(start: Point, current: Point): Promise<void> {
    const text = await textDialog(
      "Callout",
      "Text attached to the leader",
      "",
      "Callout text",
      true,
    );
    if (text === null) {
      this.drawInteraction();
      return;
    }
    const content = text.trim() || "Callout";
    const page = this.pageSize();
    let center = current;
    if (page) {
      const box = textBoxLayout(content, store.ui.style.fontSize);
      const margin = 8;
      const minX = Math.min(page.width / 2, box.width / 2 + margin);
      const maxX = Math.max(page.width / 2, page.width - box.width / 2 - margin);
      const minY = Math.min(page.height / 2, box.height / 2 + margin);
      const maxY = Math.max(page.height / 2, page.height - box.height / 2 - margin);
      center = {
        x: Math.max(minX, Math.min(maxX, current.x)),
        y: Math.max(minY, Math.min(maxY, current.y)),
      };
    }
    this.createItem("callout", [start, center], { text: content });
    this.drawInteraction();
  }

  private async promptCloudText(created: { layerId: string; itemId: string }): Promise<void> {
    const text = await textDialog(
      "Revision cloud text",
      "Optional text anchored to the cloud",
      "",
      "Cloud text",
      true,
    );
    if (text === null || !text.trim()) return;
    store.mutate(
      (project) => {
        const item = findItem(project, created.itemId)?.item;
        if (item) {
          item.text = text.trim();
          item.updatedAt = new Date().toISOString();
        }
      },
      "change",
    );
  }

  private async editItemText(item: MarkupItem): Promise<void> {
    const title =
      item.kind === "stamp"
        ? "Edit stamp text"
        : item.kind === "delta"
          ? "Edit revision delta"
          : item.kind === "cloud"
            ? "Revision cloud text"
            : "Edit callout";
    const text = await textDialog(title, "Only this item is changed", item.text ?? "", "", true);
    if (text === null) return;
    store.mutate(
      (project) => {
        const target = findItem(project, item.id)?.item;
        if (target) {
          target.text =
            text.trim() ||
            (target.kind === "stamp" ? "STAMP" : target.kind === "callout" ? "Callout" : "");
          if (target.kind === "stamp") {
            target.color = stampStatusColor(target.text, target.color);
          }
          target.updatedAt = new Date().toISOString();
        }
      },
      "change",
    );
  }

  private finishQuickArea(): void {
    if (
      !this.draft ||
      (this.draft.kind !== "area-rect" && this.draft.kind !== "area-ellipse")
    ) {
      return;
    }
    const shape: AreaShape = this.draft.kind === "area-rect" ? "rectangle" : "ellipse";
    const { start, current } = this.draft;
    this.draft = null;
    this.snap = null;
    if (distance(start, current) < 3 / store.ui.zoom) {
      this.drawInteraction();
      return;
    }
    this.createItem("area", [start, current], { areaShape: shape });
    this.drawInteraction();
  }

  public finishDraft(): void {
    if (this.cropMode) {
      this.confirmCrop();
      return;
    }
    if (!this.draft) return;
    if (this.draft.kind === "area-rect" || this.draft.kind === "area-ellipse") {
      this.finishQuickArea();
    } else if (
      this.draft.kind === "length" ||
      this.draft.kind === "area" ||
      this.draft.kind === "cloud" ||
      this.draft.kind === "highlight-polygon"
    ) {
      this.draft.points = dedupeLast(this.draft.points);
      const points = this.draft.points;
      const kind = this.draft.kind;
      if (kind === "length" && points.length < 2) {
        this.draft = null;
        this.drawInteraction();
        return;
      }
      if (kind !== "length" && points.length < 3) {
        toast("This shape needs at least three points.", "warning");
        return;
      }
      this.draft = null;
      this.snap = null;
      if (kind === "cloud") {
        const created = this.createItem("cloud", points);
        if (created) void this.promptCloudText(created);
      } else if (kind === "highlight-polygon") {
        this.createItem("highlight", points, { highlightShape: "polygon" });
      } else {
        this.createItem(kind, points);
      }
      this.drawInteraction();
    } else if (this.draft.kind === "callout") {
      this.finishCallout(this.draft.current);
    } else if (this.draft.kind === "pen" || this.draft.kind === "highlight") {
      this.finishPen();
    } else if (
      this.draft.kind === "line" ||
      this.draft.kind === "arrow" ||
      this.draft.kind === "rect" ||
      this.draft.kind === "ellipse" ||
      this.draft.kind === "highlight-rect"
    ) {
      this.finishShape();
    } else {
      this.cancelDraft();
    }
  }

  public removeLastPoint(): boolean {
    if (
      !this.draft ||
      this.draft.kind === "line" ||
      this.draft.kind === "arrow" ||
      this.draft.kind === "rect" ||
      this.draft.kind === "ellipse" ||
      this.draft.kind === "highlight-rect" ||
      this.draft.kind === "area-rect" ||
      this.draft.kind === "area-ellipse" ||
      this.draft.kind === "callout"
    ) {
      return false;
    }
    if (this.draft.points.length <= 1) {
      this.cancelDraft();
      return true;
    }
    this.draft.points.pop();
    this.draft.cursor = this.draft.points[this.draft.points.length - 1];
    this.drawInteraction();
    return true;
  }

  public cancelDraft(): void {
    if (this.cropMode) {
      this.cancelCrop();
      return;
    }
    if (!this.draft) return;
    this.draft = null;
    this.snap = null;
    this.drawInteraction();
  }

  public deleteSelection(): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    const resolved = resolveSelection(project, store.ui.selection);
    const removable = resolved.filter((entry) => !entry.locked);
    if (!removable.length) {
      toast("The selected item is locked.", "warning");
      return;
    }
    store.mutate(
      (project) => {
        for (const entry of removable) {
          removeItem(project, entry.ref.layerId, entry.ref.itemId);
        }
      },
      "change",
    );
    if (removable.length < resolved.length) {
      toast(
        `${removable.length} item${removable.length === 1 ? "" : "s"} deleted. Locked items were kept.`,
        "info",
      );
    }
    store.clearSelection();
  }

  public nudgeSelection(dx: number, dy: number): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    const movable = resolveSelection(project, store.ui.selection).filter((entry) => !entry.locked);
    if (!movable.length) return;
    store.mutate(
      (project) => {
        for (const entry of movable) {
          const item = findItem(project, entry.ref.itemId)?.item;
          if (!item) continue;
          item.points = translatePoints(item.points, dx, dy);
          item.updatedAt = new Date().toISOString();
        }
      },
      "change",
    );
  }

  private schedulePdfRender(): void {
    if (!store.project) return;
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      void this.renderPdf();
    }, 90);
  }

  private async renderPdf(): Promise<void> {
    const renderer = this.hooks.getRenderer();
    const size = this.pageSize();
    if (!renderer || !size || !store.project) return;
    const page = store.ui.page;
    const crop = cropRectForView(
      size,
      store.ui.zoom,
      store.ui.panX,
      store.ui.panY,
      this.width,
      this.height,
      70,
    );
    const generation = ++this.renderGeneration;
    this.rendering = true;
    this.loading.classList.add("is-visible");
    try {
      const result = await renderer.renderCrop(page, crop, store.ui.zoom * this.dpr);
      if (generation !== this.renderGeneration) return;
      if (page !== store.ui.page) return;
      this.lastRender = result;
      this.drawBase();
    } catch (error) {
      if (isCancellation(error)) return;
      if (generation === this.renderGeneration) {
        this.hooks.onError?.(`Could not render this page: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      if (generation === this.renderGeneration) {
        this.rendering = false;
        this.loading.classList.remove("is-visible");
      }
    }
  }

  private prepare(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }

  private drawAll(): void {
    this.drawBase();
    this.drawContent();
    this.drawInteraction();
    this.updateCursor();
  }

  private drawBase(): void {
    const ctx = this.baseCtx;
    this.prepare(ctx);
    const project = store.project;
    if (!project) return;
    const size = this.pageSize();
    if (!size) return;
    const { zoom, panX, panY } = store.ui;
    const x = panX;
    const y = panY;
    const w = size.width * zoom;
    const h = size.height * zoom;

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#fbfcfc";
    ctx.fillRect(x, y, w, h);
    ctx.restore();

    if (this.lastRender && this.lastRender.pageNumber === store.ui.page) {
      const rect = this.lastRender.rect;
      ctx.drawImage(
        this.lastRender.canvas,
        panX + rect.x * zoom,
        panY + rect.y * zoom,
        rect.width * zoom,
        rect.height * zoom,
      );
    } else if (this.rendering) {
      ctx.save();
      ctx.fillStyle = "rgba(30, 40, 45, 0.35)";
      ctx.font = `500 12px ${FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Rendering…", x + w / 2, y + h / 2);
      ctx.restore();
    }

    if (project.settings.showGrid) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.strokeStyle = "rgba(40, 70, 80, 0.14)";
      ctx.lineWidth = 1;
      const spacing = 24;
      const offsetX = ((panX % spacing) + spacing) % spacing;
      const offsetY = ((panY % spacing) + spacing) % spacing;
      for (let gx = offsetX; gx < this.width; gx += spacing) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, this.height);
        ctx.stroke();
      }
      for (let gy = offsetY; gy < this.height; gy += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(this.width, gy);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  private drawContent(): void {
    const ctx = this.contentCtx;
    this.prepare(ctx);
    const project = store.project;
    if (!project) return;
    const size = this.pageSize();
    if (!size) return;
    const page = store.ui.page;
    const labels = this.pageLabelLayouts();

    // Background images sit above the PDF but below every markup layer.
    for (const layer of project.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      for (const item of layer.items) {
        if (item.page !== page || item.visible === false || item.kind !== "image") continue;
        if (imageModeOf(item) !== "background") continue;
        this.drawItem(ctx, item, labels);
      }
      ctx.restore();
    }

    for (const layer of project.layers) {
      if (!layer.visible || layer.opacity <= 0) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      for (const item of layer.items) {
        if (item.page !== page || item.visible === false) continue;
        if (item.kind === "image" && imageModeOf(item) === "background") continue;
        this.drawItem(ctx, item, labels);
      }
      ctx.restore();
    }

    if (project.settings.showCalibration) {
      const calibration = pageCalibration(project, page);
      if (calibration && isReferenceCalibration(calibration)) {
        const p1 = this.toScreen(calibration.p1);
        const p2 = this.toScreen(calibration.p2);
        ctx.save();
        ctx.strokeStyle = CALIBRATION_COLOR;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const p of [p1, p2]) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = "#1a2024";
          ctx.fill();
          ctx.stroke();
        }
        const calibrationLabel = labels.get(CALIBRATION_LABEL_ID);
        if (calibrationLabel) this.drawLabelLayout(ctx, calibrationLabel);
        ctx.restore();
      }
    }
  }

  private imageElement(asset: ImageAsset): HTMLImageElement | null {
    if (this.imageFailed.has(asset.id)) return null;
    const cached = this.imageCache.get(asset.id);
    if (cached) {
      return cached.complete && cached.naturalWidth > 0 ? cached : null;
    }
    if (this.imageLoading.has(asset.id)) return null;
    const image = new Image();
    this.imageLoading.add(asset.id);
    image.onload = () => {
      this.imageLoading.delete(asset.id);
      this.imageFailed.delete(asset.id);
      this.drawAll();
    };
    image.onerror = () => {
      this.imageLoading.delete(asset.id);
      this.imageCache.delete(asset.id);
      this.imageFailed.add(asset.id);
      this.drawAll();
    };
    image.src = asset.data;
    this.imageCache.set(asset.id, image);
    return null;
  }

  private drawItem(
    ctx: CanvasRenderingContext2D,
    item: MarkupItem,
    labels: Map<string, LabelLayout>,
  ): void {
    if (this.editingItemId === item.id) return;
    const zoom = store.ui.zoom;
    const points = item.points.map((p) => this.toScreen(p));
    if (points.length === 0) return;
    const lineWidth = Math.max(1, item.strokeWidth * zoom);
    const rotation = itemRotation(item);
    const rotatesInPlace =
      rotation !== 0 &&
      (item.kind === "text" ||
        item.kind === "rect" ||
        item.kind === "ellipse" ||
        item.kind === "image");
    const center = rotatesInPlace ? this.toScreen(itemCenter(item)) : null;
    ctx.save();
    if (center) {
      ctx.translate(center.x, center.y);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-center.x, -center.y);
    }
    ctx.strokeStyle = item.color;
    ctx.fillStyle = item.color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (item.kind) {
      case "length": {
        ctx.beginPath();
        points.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        this.drawEndpoints(ctx, points, item.color);
        break;
      }
      case "area": {
        const shape = areaShapeOf(item);
        const outline = areaOutline(item.points, shape).map((point) =>
          this.toScreen(itemLocalToPage(item, point)),
        );
        ctx.save();
        ctx.globalAlpha *= 0.14;
        ctx.beginPath();
        outline.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        outline.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();
        if (shape !== "ellipse") this.drawEndpoints(ctx, outline, item.color);
        break;
      }
      case "count": {
        const anchorPage = item.points[0];
        if (!anchorPage) break;
        const symbol = countSymbol(item.countType);
        for (const path of symbol.paths) {
          ctx.beginPath();
          path.points.forEach((point, index) => {
            const screen = this.toScreen({ x: anchorPage.x + point.x, y: anchorPage.y + point.y });
            if (index === 0) ctx.moveTo(screen.x, screen.y);
            else ctx.lineTo(screen.x, screen.y);
          });
          if (path.closed) ctx.closePath();
          ctx.stroke();
        }
        for (const dot of symbol.dots) {
          const center = this.toScreen({
            x: anchorPage.x + dot.center.x,
            y: anchorPage.y + dot.center.y,
          });
          ctx.beginPath();
          ctx.arc(center.x, center.y, Math.max(0.6, dot.radius * zoom), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "pen": {
        ctx.beginPath();
        points.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        break;
      }
      case "highlight": {
        if (item.highlightShape && item.highlightShape !== "stroke") {
          const outline =
            item.highlightShape === "rectangle"
              ? rectangleCorners([points[0], points[1]])
              : points;
          ctx.save();
          ctx.globalAlpha *= item.opacity ?? 0.3;
          ctx.fillStyle = item.color;
          ctx.beginPath();
          outline.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        ctx.save();
        ctx.globalAlpha *= 0.38;
        ctx.lineWidth = lineWidth * 4.2;
        ctx.lineCap = "butt";
        ctx.beginPath();
        points.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.stroke();
        ctx.restore();
        break;
      }
      case "line": {
        if (points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(points[1].x, points[1].y);
        ctx.stroke();
        this.drawEndpoints(ctx, points, item.color);
        break;
      }
      case "arrow": {
        if (points.length < 2) break;
        const size = Math.max(8, lineWidth * 3.6);
        const head = arrowHeadGeometry(points[0], points[1], size);
        ctx.save();
        ctx.lineCap = "butt";
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        ctx.lineTo(head.shaftEnd.x, head.shaftEnd.y);
        ctx.stroke();
        ctx.restore();
        drawArrowHead(ctx, points[1], head, item.color);
        break;
      }
      case "rect": {
        if (points.length < 2) break;
        const rect = expandRect(points[0], points[1]);
        if (item.fillColor) {
          ctx.save();
          ctx.globalAlpha *= item.opacity ?? 0.15;
          ctx.fillStyle = item.fillColor;
          ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
          ctx.restore();
        }
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        break;
      }
      case "ellipse": {
        if (points.length < 2) break;
        const rect = expandRect(points[0], points[1]);
        ctx.beginPath();
        ctx.ellipse(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          Math.max(0.5, rect.width / 2),
          Math.max(0.5, rect.height / 2),
          0,
          0,
          Math.PI * 2,
        );
        if (item.fillColor) {
          ctx.save();
          ctx.globalAlpha *= item.opacity ?? 0.15;
          ctx.fillStyle = item.fillColor;
          ctx.fill();
          ctx.restore();
        }
        ctx.stroke();
        break;
      }
      case "cloud": {
        const curves = cloudCurves(item.points, item.cloudRadius ?? cloudRadiusForPoints(item.points));
        if (!curves.length) break;
        const pathStart = this.toScreen(curves[0].start);
        ctx.save();
        if (item.fillColor) {
          ctx.save();
          ctx.globalAlpha *= item.opacity ?? 0.12;
          ctx.fillStyle = item.fillColor;
          ctx.beginPath();
          ctx.moveTo(pathStart.x, pathStart.y);
          for (const curve of curves) {
            const cp1 = this.toScreen(curve.cp1);
            const cp2 = this.toScreen(curve.cp2);
            const end = this.toScreen(curve.end);
            ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.moveTo(pathStart.x, pathStart.y);
        for (const curve of curves) {
          const cp1 = this.toScreen(curve.cp1);
          const cp2 = this.toScreen(curve.cp2);
          const end = this.toScreen(curve.end);
          ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
        const label = cloudLabelLayout(item);
        if (label) {
          this.drawAnnotationPanel(ctx, label, item, "rgba(12, 16, 18, 0.9)", "#f7fbfc", true);
        }
        break;
      }
      case "callout": {
        const layout = calloutLayout(item);
        const anchor = this.toScreen(layout.anchor);
        const leaderStart = this.toScreen(layout.leaderStart);
        const size = Math.max(8, lineWidth * 3.6);
        const head = arrowHeadGeometry(leaderStart, anchor, size);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(leaderStart.x, leaderStart.y);
        ctx.lineTo(head.shaftEnd.x, head.shaftEnd.y);
        ctx.stroke();
        drawArrowHead(ctx, anchor, head, item.color);
        ctx.restore();
        this.drawAnnotationPanel(
          ctx,
          { ...layout, center: { x: (layout.box.x + layout.box.width / 2), y: (layout.box.y + layout.box.height / 2) } },
          item,
          "rgba(12, 16, 18, 0.92)",
          "#f7fbfc",
          false,
        );
        break;
      }
      case "stamp": {
        const layout = stampLayout(item);
        this.drawAnnotationPanel(
          ctx,
          layout,
          item,
          hexAlpha(item.color, Math.max(0.12, item.opacity ?? 0.12)),
          item.color,
          true,
          true,
        );
        break;
      }
      case "delta": {
        const layout = deltaLayout(item);
        const size = layout.size * zoom;
        const center = this.toScreen(layout.center);
        ctx.save();
        ctx.save();
        ctx.globalAlpha *= item.opacity ?? 0.16;
        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.moveTo(center.x, center.y - size / 2);
        ctx.lineTo(center.x + size / 2, center.y + size / 2);
        ctx.lineTo(center.x - size / 2, center.y + size / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.beginPath();
        ctx.moveTo(center.x, center.y - size / 2);
        ctx.lineTo(center.x + size / 2, center.y + size / 2);
        ctx.lineTo(center.x - size / 2, center.y + size / 2);
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = item.color;
        ctx.font = `700 ${Math.max(7, (item.fontSize ?? 14) * zoom * 0.7)}px ${TEXT_FONT_STACK}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(item.text || "", center.x, center.y + size * 0.12);
        if (item.label) {
          ctx.font = `500 ${Math.max(6, (item.fontSize ?? 14) * zoom * 0.38)}px ${TEXT_FONT_STACK}`;
          ctx.fillText(item.label, center.x, center.y + size * 0.62);
        }
        ctx.restore();
        break;
      }
      case "text": {
        const layout = textItemLayout(item);
        const fontSize = Math.max(0.3, layout.fontSize * zoom);
        const lineHeight = layout.lineHeight * zoom;
        ctx.font = `500 ${fontSize}px ${FONT_STACK}`;
        ctx.fillStyle = item.color;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        layout.lines.forEach((line, index) => {
          ctx.fillText(line, points[0].x, points[0].y + index * lineHeight);
        });
        break;
      }
      case "image": {
        if (points.length < 2) break;
        const project = store.project;
        const asset = project ? imageAssetForItem(project, item) : undefined;
        if (!asset) break;
        const image = this.imageElement(asset);
        if (!image) break;
        const rect = expandRect(points[0], points[1]);
        ctx.save();
        ctx.globalAlpha *= imageOpacity(item);
        ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
        ctx.restore();
        break;
      }
    }
    ctx.restore();

    if (item.kind === "length" || item.kind === "area" || item.kind === "count") {
      const layout = labels.get(item.id);
      if (layout && this.editingLabelId !== item.id) {
        this.drawLabelLayout(ctx, layout);
      }
    }
  }

  private drawTrackedLine(
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    centerY: number,
    tracking: number,
  ): void {
    const characters = [...text];
    const widths = characters.map((character) => ctx.measureText(character).width);
    const total = widths.reduce((sum, width) => sum + width, 0) + tracking * Math.max(0, characters.length - 1);
    let x = centerX - total / 2;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    characters.forEach((character, index) => {
      ctx.fillText(character, x, centerY);
      x += widths[index] + tracking;
    });
    ctx.textAlign = "center";
  }

  private drawAnnotationPanel(
    ctx: CanvasRenderingContext2D,
    layout: {
      center: Point;
      width: number;
      height: number;
      lines: string[];
      fontSize: number;
      lineHeight: number;
      padding: number;
    },
    item: MarkupItem,
    fill: string,
    textColor: string,
    leader: boolean,
    bold = false,
  ): void {
    const zoom = store.ui.zoom;
    const center = this.toScreen(layout.center);
    const width = layout.width * zoom;
    const height = layout.height * zoom;
    const x = center.x - width / 2;
    const y = center.y - height / 2;
    ctx.save();
    if (leader && item.kind === "cloud" && item.points.length) {
      const localCentroid = {
        x: item.points.reduce((sum, point) => sum + point.x, 0) / item.points.length,
        y: item.points.reduce((sum, point) => sum + point.y, 0) / item.points.length,
      };
      const centroid = this.toScreen(localCentroid);
      const boxEdge = { x: Math.max(x, Math.min(x + width, centroid.x)), y: Math.max(y, Math.min(y + height, centroid.y)) };
      ctx.strokeStyle = item.color;
      ctx.lineWidth = Math.max(0.6, item.strokeWidth * zoom);
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(boxEdge.x, boxEdge.y);
      ctx.lineTo(centroid.x, centroid.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = fill;
    ctx.strokeStyle = item.color;
    ctx.lineWidth = Math.max(0.8, item.strokeWidth * zoom);
    roundRect(ctx, x, y, width, height, Math.min(5, height / 4));
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = textColor;
    const fontSize = Math.max(6, layout.fontSize * zoom);
    ctx.font = `${bold ? 700 : 500} ${fontSize}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const lineHeight = layout.lineHeight * zoom;
    const startY = center.y - ((layout.lines.length - 1) * lineHeight) / 2;
    layout.lines.forEach((line, index) => {
      if (bold) {
        this.drawTrackedLine(ctx, line, center.x, startY + index * lineHeight, fontSize * 0.08);
      } else {
        ctx.fillText(line, center.x, startY + index * lineHeight);
      }
    });
    ctx.restore();
  }

  private drawEndpoints(ctx: CanvasRenderingContext2D, points: Point[], color: string): void {
    if (points.length > 26) return;
    ctx.save();
    ctx.fillStyle = "#101518";
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawLabelLayout(ctx: CanvasRenderingContext2D, layout: LabelLayout): void {
    const screenScale = this.labelScreenScale(layout.metrics);
    const box = this.screenLabelBox(layout.box, layout.metrics);
    const borderWidth = Math.max(0.5, Math.min(1, layout.metrics.borderWidth * screenScale));
    const leaderWidth = Math.max(0.5, Math.min(1, layout.metrics.leaderWidth * screenScale));
    ctx.save();

    if (layout.leader) {
      const to = this.toScreen(layout.leader.to);
      const from = closestPointOnBox(box, to);
      ctx.strokeStyle = hexAlpha(layout.color, 0.5);
      ctx.lineWidth = leaderWidth;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(12, 16, 18, 0.82)";
    ctx.strokeStyle = hexAlpha(layout.color, 0.55);
    ctx.lineWidth = borderWidth;
    roundRect(
      ctx,
      box.x,
      box.y,
      box.width,
      box.height,
      Math.max(0.5, layout.metrics.radius * screenScale),
    );
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#edf3f5";
    ctx.font = `700 ${Math.max(0.1, layout.metrics.primarySize * screenScale)}px ${LABEL_FONT_STACK}`;
    ctx.fillText(layout.text, box.x + box.width / 2, box.primaryCenterY);
    if (layout.secondary) {
      ctx.fillStyle = "rgba(210, 222, 227, 0.68)";
      ctx.font = `400 ${Math.max(0.1, layout.metrics.secondarySize * screenScale)}px ${LABEL_FONT_STACK}`;
      ctx.fillText(
        layout.secondary,
        box.x + box.width / 2,
        box.secondaryCenterY ?? box.primaryCenterY,
      );
    }
    ctx.restore();
  }

  private drawPreviewLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    anchor: Point,
    color: string,
    secondary?: string,
  ): void {
    const metrics = labelMetrics(1);
    const primaryWidth = measureLabelText(text, metrics.primarySize, "bold");
    const secondaryWidth = secondary
      ? measureLabelText(secondary, metrics.secondarySize, "regular")
      : 0;
    this.drawLabelLayout(ctx, {
      id: "preview",
      text,
      secondary,
      color,
      box: labelBox(anchor, primaryWidth, secondaryWidth, secondary),
      metrics,
      placement: "center",
    });
  }

  private drawInteraction(): void {
    const ctx = this.interactionCtx;
    this.prepare(ctx);
    if (!store.project) return;
    if (this.cropMode) {
      this.drawCropOverlay(ctx);
      return;
    }
    const selected = resolveSelection(store.project, store.ui.selection).filter(
      (entry) => entry.layer.visible && entry.item.visible !== false,
    );

    if (selected.length) {
      for (const entry of selected) {
        ctx.save();
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        this.traceItemOutline(ctx, entry.item);
        ctx.stroke();
        ctx.restore();
      }

      if (selected.length === 1 && !selected[0].locked) {
        const item = selected[0].item;
        const measured = item.kind === "length" || item.kind === "area" || item.kind === "count";
        const handles = this.selectionHandles(item);
        const rotation = handles.find((handle) => handle.role === "rotate");
        ctx.save();
        if (rotation && !measured) {
          const corners = itemCorners(item).map((p) => this.toScreen(p));
          const top = midpoint(corners[0], corners[1]);
          ctx.strokeStyle = hexAlpha(ACCENT, 0.55);
          ctx.beginPath();
          ctx.moveTo(top.x, top.y);
          ctx.lineTo(rotation.point.x, rotation.point.y);
          ctx.stroke();
        }
        for (const handle of handles) {
          ctx.fillStyle = handle.role === "rotate" ? "#101619" : "#f7fbfc";
          ctx.strokeStyle = ACCENT;
          ctx.lineWidth = 1.5;
          if (handle.role === "rotate") {
            ctx.beginPath();
            ctx.arc(handle.point.x, handle.point.y, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(handle.point.x, handle.point.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = ACCENT;
            ctx.fill();
          } else {
            ctx.beginPath();
            ctx.rect(handle.point.x - 4, handle.point.y - 4, 8, 8);
            ctx.fill();
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    } else if (store.ui.hover) {
      const found = findItem(store.project, store.ui.hover.itemId);
      if (found && found.item.visible !== false) {
        ctx.save();
        ctx.strokeStyle = hexAlpha(ACCENT, 0.55);
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        this.traceItemOutline(ctx, found.item);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (this.marquee) {
      const start = this.toScreen(this.marquee.start);
      const end = this.toScreen(this.marquee.current);
      const rect = expandRect(start, end);
      ctx.save();
      ctx.fillStyle = "rgba(53, 194, 161, 0.10)";
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width, rect.height);
      ctx.restore();
    }

    if (this.draft) this.drawDraft(ctx);

    if (this.snap) {
      const p = this.toScreen(this.snap.point);
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.fillStyle = "rgba(53,194,161,0.18)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 10, p.y);
      ctx.lineTo(p.x + 10, p.y);
      ctx.moveTo(p.x, p.y - 10);
      ctx.lineTo(p.x, p.y + 10);
      ctx.stroke();

      const label = snapLabel(this.snap.kind);
      ctx.font = `600 10px ${FONT_STACK}`;
      const width = ctx.measureText(label).width + 10;
      const x = p.x + 12;
      const y = p.y - 26;
      ctx.fillStyle = "rgba(12,16,18,0.9)";
      ctx.strokeStyle = hexAlpha(ACCENT, 0.65);
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, width, 17, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#edf3f5";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + 5, y + 8.5);
      ctx.restore();
    }

    if (
      this.pointerScreen &&
      !this.drag &&
      !this.pan &&
      store.ui.activeTool !== "select" &&
      store.ui.activeTool !== "pan" &&
      store.ui.activeTool !== "text"
    ) {
      const p = this.pointerScreen;
      const color = this.draft && this.draft.kind === "calibrate" ? CALIBRATION_COLOR : ACCENT;
      ctx.save();
      ctx.strokeStyle = hexAlpha(color, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x - 5, p.y);
      ctx.lineTo(p.x + 5, p.y);
      ctx.moveTo(p.x, p.y - 5);
      ctx.lineTo(p.x, p.y + 5);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawCropOverlay(ctx: CanvasRenderingContext2D): void {
    const mode = this.cropMode;
    const size = this.pageSize();
    if (!mode || !size) return;
    const pageTopLeft = this.toScreen({ x: 0, y: 0 });
    const pageBottomRight = this.toScreen({ x: size.width, y: size.height });
    const pageRect = {
      x: pageTopLeft.x,
      y: pageTopLeft.y,
      width: pageBottomRight.x - pageTopLeft.x,
      height: pageBottomRight.y - pageTopLeft.y,
    };

    if (!mode.rect) {
      ctx.save();
      ctx.strokeStyle = hexAlpha(ACCENT, 0.55);
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(pageRect.x + 0.5, pageRect.y + 0.5, pageRect.width, pageRect.height);
      ctx.restore();
      return;
    }

    const start = this.toScreen({ x: mode.rect.x, y: mode.rect.y });
    const end = this.toScreen({
      x: mode.rect.x + mode.rect.width,
      y: mode.rect.y + mode.rect.height,
    });
    const crop = {
      x: start.x,
      y: start.y,
      width: end.x - start.x,
      height: end.y - start.y,
    };

    ctx.save();
    ctx.fillStyle = "rgba(4, 8, 10, 0.58)";
    const top = Math.max(pageRect.y, 0);
    const bottom = Math.min(pageRect.y + pageRect.height, this.height);
    const left = Math.max(pageRect.x, 0);
    const right = Math.min(pageRect.x + pageRect.width, this.width);
    ctx.fillRect(left, top, right - left, Math.max(0, crop.y - top));
    ctx.fillRect(
      left,
      crop.y + crop.height,
      right - left,
      Math.max(0, bottom - (crop.y + crop.height)),
    );
    ctx.fillRect(left, crop.y, Math.max(0, crop.x - left), crop.height);
    ctx.fillRect(
      crop.x + crop.width,
      crop.y,
      Math.max(0, right - (crop.x + crop.width)),
      crop.height,
    );

    ctx.fillStyle = "rgba(53, 194, 161, 0.08)";
    ctx.fillRect(crop.x, crop.y, crop.width, crop.height);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(crop.x + 0.75, crop.y + 0.75, crop.width, crop.height);
    ctx.setLineDash([]);

    ctx.fillStyle = "#101619";
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    for (const [, point] of this.cropHandlePoints(mode.rect)) {
      const screen = this.toScreen(point);
      ctx.fillRect(screen.x - 4, screen.y - 4, 8, 8);
      ctx.strokeRect(screen.x - 4, screen.y - 4, 8, 8);
    }

    const widthPercent = Math.round((mode.rect.width / size.width) * 100);
    const heightPercent = Math.round((mode.rect.height / size.height) * 100);
    const label = `Export area · ${widthPercent}% × ${heightPercent}%`;
    ctx.font = `600 10px ${FONT_STACK}`;
    const labelWidth = ctx.measureText(label).width + 12;
    const labelX = Math.max(8, Math.min(this.width - labelWidth - 8, crop.x));
    const labelY = Math.max(8, crop.y - 26);
    ctx.fillStyle = "rgba(12,16,18,0.92)";
    ctx.strokeStyle = hexAlpha(ACCENT, 0.65);
    ctx.lineWidth = 1;
    roundRect(ctx, labelX, labelY, labelWidth, 18, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#edf3f5";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, labelX + 6, labelY + 9);
    ctx.restore();
  }

  private traceItemOutline(ctx: CanvasRenderingContext2D, item: MarkupItem): void {
    ctx.beginPath();
    if (item.kind === "count") {
      const anchor = item.points[0];
      if (!anchor) return;
      const screen = this.toScreen(anchor);
      ctx.arc(
        screen.x,
        screen.y,
        Math.max(6, (COUNT_SYMBOL_RADIUS + 2) * store.ui.zoom),
        0,
        Math.PI * 2,
      );
      return;
    }
    if (item.kind === "length") {
      item.points.forEach((point, index) => {
        const screen = this.toScreen(itemLocalToPage(item, point));
        if (index === 0) ctx.moveTo(screen.x, screen.y);
        else ctx.lineTo(screen.x, screen.y);
      });
      return;
    }
    if (item.kind === "area") {
      areaOutline(item.points, areaShapeOf(item)).forEach((point, index) => {
        const screen = this.toScreen(itemLocalToPage(item, point));
        if (index === 0) ctx.moveTo(screen.x, screen.y);
        else ctx.lineTo(screen.x, screen.y);
      });
      ctx.closePath();
      return;
    }
    const corners = itemCorners(item).map((point) => this.toScreen(point));
    corners.forEach((corner, index) => {
      if (index === 0) ctx.moveTo(corner.x, corner.y);
      else ctx.lineTo(corner.x, corner.y);
    });
    ctx.closePath();
  }

  private drawDraft(ctx: CanvasRenderingContext2D): void {
    if (!this.draft) return;
    const zoom = store.ui.zoom;
    const project = store.project!;
    const scale = pageScale(project, store.ui.page);
    const unit = project.settings.lengthUnit;
    const areaUnit = project.settings.areaUnit;

    if (
      this.draft.kind === "calibrate" ||
      this.draft.kind === "length" ||
      this.draft.kind === "area" ||
      this.draft.kind === "cloud" ||
      this.draft.kind === "highlight-polygon"
    ) {
      const points = this.draft.points.map((p) => this.toScreen(p));
      const cursor = this.toScreen(this.draft.cursor);
      ctx.save();
      ctx.strokeStyle = this.draft.kind === "calibrate" ? CALIBRATION_COLOR : ACCENT;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([]);
      if (points.length > 1) {
        ctx.beginPath();
        points.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        if (
          (this.draft.kind === "area" ||
            this.draft.kind === "cloud" ||
            this.draft.kind === "highlight-polygon") &&
          points.length >= 3
        ) {
          ctx.closePath();
        }
        ctx.stroke();
      }
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      const last = points[points.length - 1];
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(cursor.x, cursor.y);
      ctx.stroke();
      ctx.setLineDash([]);

      if (
        (this.draft.kind === "area" || this.draft.kind === "highlight-polygon") &&
        points.length >= 2
      ) {
        const pagePoints = this.draft.points;
        const preview = [...pagePoints, this.draft.cursor];
        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = ACCENT;
        ctx.beginPath();
        preview.forEach((p, index) => {
          const s = this.toScreen(p);
          if (index === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        if (preview.length >= 3 && this.draft.kind === "area") {
          this.drawPreviewLabel(
            ctx,
            formatArea(areaValue(preview, "polygon"), scale, areaUnit),
            areaCentroid(preview, "polygon"),
            ACCENT,
          );
        }
      } else if (this.draft.kind === "length" && points.length >= 1) {
        const preview = [...this.draft.points, this.draft.cursor];
        const a = preview[preview.length - 2];
        const b = preview[preview.length - 1];
        const mid = midpoint(a, b);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy) || 1;
        this.drawPreviewLabel(
          ctx,
          formatLength(polylineLength(preview), scale, unit),
          {
            x: mid.x - (dy / length) * LABEL_LINE_OFFSET,
            y: mid.y + (dx / length) * LABEL_LINE_OFFSET,
          },
          ACCENT,
        );
      } else if (this.draft.kind === "calibrate") {
        const a = this.draft.points[0];
        const b = this.draft.cursor;
        const mid = midpoint(a, b);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const length = Math.hypot(dx, dy) || 1;
        this.drawPreviewLabel(
          ctx,
          `${formatNumber(distance(a, b), 1)} pt`,
          {
            x: mid.x + (dy / length) * LABEL_CALIBRATION_OFFSET,
            y: mid.y - (dx / length) * LABEL_CALIBRATION_OFFSET,
          },
          CALIBRATION_COLOR,
        );
      }

      ctx.fillStyle = "#f7fbfc";
      ctx.strokeStyle = this.draft.kind === "calibrate" ? CALIBRATION_COLOR : ACCENT;
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    if (this.draft.kind === "area-rect" || this.draft.kind === "area-ellipse") {
      const shape: AreaShape = this.draft.kind === "area-rect" ? "rectangle" : "ellipse";
      const pagePoints = [this.draft.start, this.draft.current];
      const outline = areaOutline(pagePoints, shape).map((point) => this.toScreen(point));
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.fillStyle = hexAlpha(ACCENT, 0.1);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      outline.forEach((point, index) =>
        index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y),
      );
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (shape !== "ellipse") {
        const corners = rectangleCorners(pagePoints).map((point) => this.toScreen(point));
        ctx.fillStyle = "#f7fbfc";
        for (const point of corners) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
      this.drawPreviewLabel(
        ctx,
        formatArea(areaValue(pagePoints, shape), scale, areaUnit),
        areaCentroid(pagePoints, shape),
        ACCENT,
      );
      ctx.restore();
      return;
    }

    if (this.draft.kind === "pen" || this.draft.kind === "highlight") {
      const points = this.draft.points.map((p) => this.toScreen(p));
      ctx.save();
      ctx.strokeStyle = this.draft.kind === "highlight" ? hexAlpha(store.ui.style.color, 0.4) : store.ui.style.color;
      ctx.lineWidth = this.draft.kind === "highlight" ? store.ui.style.strokeWidth * zoom * 4 : store.ui.style.strokeWidth * zoom;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach((p, index) => (index === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();
      return;
    }

    const start = this.toScreen(this.draft.start);
    const current = this.toScreen(this.draft.current);
    ctx.save();
    ctx.strokeStyle = store.ui.style.color;
    ctx.fillStyle = hexAlpha(store.ui.style.color, store.ui.style.fillOpacity);
    ctx.lineWidth = Math.max(1, store.ui.style.strokeWidth * zoom);
    ctx.lineCap = "round";
    if (this.draft.kind === "line" || this.draft.kind === "arrow") {
      const head =
        this.draft.kind === "arrow" ? arrowHeadGeometry(start, current, 10) : null;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(head ? head.shaftEnd.x : current.x, head ? head.shaftEnd.y : current.y);
      ctx.stroke();
      if (head) drawArrowHead(ctx, current, head, store.ui.style.color);
    } else if (this.draft.kind === "rect" || this.draft.kind === "highlight-rect") {
      const rect = expandRect(start, current);
      if (this.draft.kind === "highlight-rect") {
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.restore();
      } else {
        if (store.ui.style.fillOpacity > 0) ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      }
    } else if (this.draft.kind === "ellipse") {
      const rect = expandRect(start, current);
      ctx.beginPath();
      ctx.ellipse(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        Math.max(0.5, rect.width / 2),
        Math.max(0.5, rect.height / 2),
        0,
        0,
        Math.PI * 2,
      );
      if (store.ui.style.fillOpacity > 0) ctx.fill();
      ctx.stroke();
    } else if (this.draft.kind === "callout") {
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const width = 76;
      const height = 24;
      ctx.fillStyle = "rgba(12, 16, 18, 0.9)";
      ctx.fillRect(current.x - width / 2, current.y - height / 2, width, height);
      ctx.strokeRect(current.x - width / 2, current.y - height / 2, width, height);
      ctx.fillStyle = store.ui.style.color;
      ctx.font = `600 ${Math.max(9, store.ui.style.fontSize * zoom)}px ${TEXT_FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Callout", current.x, current.y);
    }
    ctx.restore();
  }

  getCompositeCanvas(): HTMLCanvasElement {
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(this.width * this.dpr));
    out.height = Math.max(1, Math.round(this.height * this.dpr));
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#14181b";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(this.base, 0, 0);
    ctx.drawImage(this.content, 0, 0);
    return out;
  }

  destroy(): void {
    this.unsubscribe();
    this.hideCropUi();
    this.cropMode = null;
    this.observer.disconnect();
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    this.textEdit?.container.remove();
    this.labelEdit?.container.remove();
    this.textEdit = null;
    this.labelEdit = null;
    this.editorLayer.remove();
    this.interaction.removeEventListener("pointerdown", this.onPointerDown);
    this.interaction.removeEventListener("pointermove", this.onPointerMove);
    this.interaction.removeEventListener("pointerup", this.onPointerUp);
    this.interaction.removeEventListener("pointercancel", this.onPointerUp);
    this.interaction.removeEventListener("pointerleave", this.onPointerLeave);
    this.interaction.removeEventListener("dblclick", this.onDoubleClick);
    this.interaction.removeEventListener("wheel", this.onWheel);
    this.interaction.removeEventListener("contextmenu", this.onContextMenu);
  }
}

function clampPointToPage(point: Point, size: PageSize): Point {
  return {
    x: Math.max(0, Math.min(size.width, point.x)),
    y: Math.max(0, Math.min(size.height, point.y)),
  };
}

function pointInRect(point: Point, rect: PageRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function rectFromPoints(start: Point, end: Point): PageRect {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

function movePageRect(
  rect: PageRect,
  start: Point,
  point: Point,
  size: PageSize,
): PageRect {
  return {
    x: Math.max(0, Math.min(size.width - rect.width, rect.x + point.x - start.x)),
    y: Math.max(0, Math.min(size.height - rect.height, rect.y + point.y - start.y)),
    width: rect.width,
    height: rect.height,
  };
}

function resizePageRect(
  rect: PageRect,
  handle: BoxHandleRole | undefined,
  point: Point,
  size: PageSize,
): PageRect {
  if (!handle) return rect;
  const minSize = 1;
  let left = rect.x;
  let right = rect.x + rect.width;
  let top = rect.y;
  let bottom = rect.y + rect.height;
  if (handle.includes("w")) {
    left = Math.max(0, Math.min(right - minSize, point.x));
  }
  if (handle.includes("e")) {
    right = Math.min(size.width, Math.max(left + minSize, point.x));
  }
  if (handle.includes("n")) {
    top = Math.max(0, Math.min(bottom - minSize, point.y));
  }
  if (handle.includes("s")) {
    bottom = Math.min(size.height, Math.max(top + minSize, point.y));
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function constrainSquare(start: Point, point: Point): Point {
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: start.x + Math.sign(dx || 1) * size,
    y: start.y + Math.sign(dy || 1) * size,
  };
}

function snapLabel(kind: SnapKind): string {
  if (kind === "endpoint") return "Endpoint";
  if (kind === "midpoint") return "Midpoint";
  return "Intersection";
}

function cursorForRole(role: BoxHandleRole): string {
  switch (role) {
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
  }
}

function handleLocalPoint(bounds: Bounds, role: BoxHandleRole): Point {
  const midX = (bounds.min.x + bounds.max.x) / 2;
  const midY = (bounds.min.y + bounds.max.y) / 2;
  switch (role) {
    case "nw":
      return { x: bounds.min.x, y: bounds.min.y };
    case "n":
      return { x: midX, y: bounds.min.y };
    case "ne":
      return { x: bounds.max.x, y: bounds.min.y };
    case "e":
      return { x: bounds.max.x, y: midY };
    case "se":
      return { x: bounds.max.x, y: bounds.max.y };
    case "s":
      return { x: midX, y: bounds.max.y };
    case "sw":
      return { x: bounds.min.x, y: bounds.max.y };
    case "w":
      return { x: bounds.min.x, y: midY };
  }
}

function oppositeHandlePoint(bounds: Bounds, role: BoxHandleRole): Point {
  const midX = (bounds.min.x + bounds.max.x) / 2;
  const midY = (bounds.min.y + bounds.max.y) / 2;
  switch (role) {
    case "nw":
      return { x: bounds.max.x, y: bounds.max.y };
    case "n":
      return { x: midX, y: bounds.max.y };
    case "ne":
      return { x: bounds.min.x, y: bounds.max.y };
    case "e":
      return { x: bounds.min.x, y: midY };
    case "se":
      return { x: bounds.min.x, y: bounds.min.y };
    case "s":
      return { x: midX, y: bounds.min.y };
    case "sw":
      return { x: bounds.max.x, y: bounds.min.y };
    case "w":
      return { x: bounds.max.x, y: midY };
  }
}

function scaleBounds(bounds: Bounds, anchor: Point, factorX: number, factorY: number): Bounds {
  return {
    min: {
      x: anchor.x + (bounds.min.x - anchor.x) * factorX,
      y: anchor.y + (bounds.min.y - anchor.y) * factorY,
    },
    max: {
      x: anchor.x + (bounds.max.x - anchor.x) * factorX,
      y: anchor.y + (bounds.max.y - anchor.y) * factorY,
    },
  };
}

function rotatedAabb(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const center = { x: x + width / 2, y: y + height / 2 };
  const corners = [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ].map((point) => rotatePoint(point, center, rotation));
  return {
    minX: Math.min(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxX: Math.max(...corners.map((point) => point.x)),
    maxY: Math.max(...corners.map((point) => point.y)),
  };
}

function pointInBox(point: Point, x: number, y: number, width: number, height: number): boolean {
  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
}

function closestPointOnBox(box: LabelBox, point: Point): Point {
  return {
    x: Math.max(box.x, Math.min(box.x + box.width, point.x)),
    y: Math.max(box.y, Math.min(box.y + box.height, point.y)),
  };
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function dedupeLast(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  if (distance(last, prev) < 0.0001) return points.slice(0, -1);
  return points;
}

function hexAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const int = parseInt(full, 16);
  if (!Number.isFinite(int) || full.length !== 6) return `rgba(255,255,255,${alpha})`;
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tip: Point,
  head: { wingA: Point; wingB: Point },
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(head.wingA.x, head.wingA.y);
  ctx.lineTo(head.wingB.x, head.wingB.y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function isCancellation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ((error as { name?: string }).name === "RenderingCancelledException" ||
      (error as { name?: string }).name === "AbortException")
  );
}

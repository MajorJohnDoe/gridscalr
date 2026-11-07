import {
  arcGeometry,
  arcPolyline,
  circlePolyline,
  constrainAngle,
  distance,
  expandRect,
  itemBounds,
  itemCenter,
  itemLocalBounds,
  symbolSelectionBounds,
  itemRotation,
  midpoint,
  nearestPointOnSegment,
  normalizeDegrees,
  pointToItemLocal,
  radiusCircle,
  rotatePoint,
  rotatePointsAround,
  simplifyPolyline,
  translatePoints,
  type Bounds,
  vertexAngleAnchor,
} from "../model/geometry";
import { areaOutline, areaShapeOf } from "../model/area";
import { COUNT_SYMBOL_RADIUS } from "../model/countSymbols";
import { findSegment, findVertex, hitTest, itemIntersectsBounds } from "../model/hitTest";
import {
  clampLabelSize,
  labelAnchorForPoints,
  LABEL_PRIMARY_SIZE,
  type LabelBox,
  type LabelMetrics,
} from "../model/label";
import {
  CALIBRATION_LABEL_ID,
  closestPointOnPolyline,
  LABEL_FIT_POSITIONS,
  labelFitLabel,
  layoutPageLabels,
  pageLabelSources,
  type LabelLayout,
} from "../model/labelLayout";
import { ensureLabelFonts, measureLabelText } from "../model/labelFont";
import {
  addItem,
  ensureActiveLayer,
  findItem,
  isMeasurementKind,
  itemIsLocked,
  itemIsVisible,
  layerLockedOnPage,
  layerVisibleOnPage,
  layerKindForItem,
} from "../model/layers";
import { deleteItems, translateItems } from "../model/commands";
import {
  averagePoints,
  constrainSquare,
  cursorForRole,
  dedupeLast,
  focusViewTransform,
  handleLocalPoint,
  isCancellation,
  oppositeHandlePoint,
  pointInBox,
  scaleBounds,
  type BoxHandleRole,
} from "./geometry";
import { CropController } from "./crop";
import { TouchNavigation } from "./touchNavigation";
import { CALIBRATION_COLOR, drawDraft as paintDraft, type Draft } from "./draftRenderer";
import { drawLabelLayout as paintLabelLayout } from "./annotationDraw";
import { CanvasEditorController, type LabelHit } from "./editors";
import { drawItem, type ItemRenderContext } from "./itemRenderer";
import { handleAt, selectionHandles, type Handle } from "./selectionHandles";
import { groupHandleAt } from "./groupHandles";
import type { DragState, MarqueeState, PanState } from "./pointerState";
import {
  drawInteraction as paintInteraction,
  type InteractionRenderContext,
} from "./interactionRenderer";
import type { NormalizedCrop } from "../model/export";
import { imageModeOf } from "../model/images";
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
  excludeOwnSnapTargets,
  findSnap,
  type SnapCandidate,
  type SnapKind,
  type SnapResult,
} from "../model/snap";
import { clampTextSize, TEXT_FONT_STACK } from "../model/text";
import { totalPageCount } from "../model/documents";
import { templateDocumentForPage } from "../features/schematics/model/sheetDocument";
import {
  resolveSheetLabels,
  SHEET_FIELD,
  sheetTemplateFor,
} from "../features/schematics/model/sheetTemplate";
import {
  layoutFieldLines,
  measureSheetText,
  SHEET_FONT_STACK,
} from "../features/schematics/render/sheetText";
import { defaultRailRows, RAIL_ROW_SPACING } from "../model/rail";
import { CLOUD_FILL_OPACITY, cloudFillColor } from "../model/cloud";
import { calloutLayout, cloudLabelLayout, textBoxLayout } from "../model/annotations";
import type {
  AreaShape,
  ImageAsset,
  InspectionStatus,
  ItemKind,
  LabelFitPosition,
  MarkupItem,
  PageSize,
  Point,
  Project,
  SelectionRef,
} from "../model/types";
import { DEFAULT_MEASUREMENT_STROKE_WIDTH } from "../model/style";
import { stampStatusColor } from "../model/stamps";
import { openRailDialog } from "../features/schematics/ui/railDialog";
import {
  clampSymbolSize,
  SYMBOL_SIZE,
  symbolCategoryColor,
  symbolCategoryOf,
  symbolDefaultSize,
  symbolSizeOf,
} from "../features/schematics/symbols/registry";
import { formatNumber } from "../model/units";
import { scaleItemAround, selectionBounds } from "../model/transform";
import { cropRectForView, type PdfRenderer, type RenderResult } from "../pdf/pdfRenderer";
import { store, type ToolId } from "../state/store";
import { clampZoom, fitPageViewport, viewportCenter, type Viewport } from "./viewport";
import {
  pageToScreen as toScreenPoint,
  screenToPage as toPagePoint,
  zoomAt as zoomViewport,
} from "./viewport";
import { calibrationDialog, depthDialog, textDialog } from "../ui/dialogs";
import { showPopoverAt } from "../ui/popover";
import { toast } from "../ui/toast";
import { t } from "../i18n";
import { describeError } from "../io/platformError";

export interface CanvasHooks {
  getRenderer: () => PdfRenderer | null;
  getPageSize: (page: number) => PageSize | undefined;
  ensurePageSize: (page: number) => void;
  onError?: (message: string) => void;
  onContextMenu?: (position: { page: Point; clientX: number; clientY: number }) => void;
}

export interface CanvasViewOptions {
  /** The split reference pane renders the same scene but never edits it. */
  readOnly?: boolean;
  /** Optional viewport override used by the reference pane to stay centred on the primary view. */
  view?: () => Viewport;
  /** Base for the canvas element ids. Primary uses "canvas", the reference pane "reference". */
  canvasIdPrefix?: string;
  /** Optional project source for a read-only comparison pane. Defaults to the open project. */
  project?: () => Project | null;
}

/** Dev-only coordinate bridge used by the Playwright canvas regression suite. */
export interface CanvasTestApi {
  pageToScreen(point: Point): Point;
  screenToPage(point: Point): Point;
  pageSize(): PageSize | undefined;
  selectionHandles(itemId: string): Handle[] | null;
  labelScreenPoint(itemId: string): Point | null;
  labelResizeScreenPoint(itemId: string): Point | null;
  annotationScreenPoint(itemId: string): Point | null;
  snapTarget(): { kind: SnapKind; point: Point } | null;
  draftKind(): string | null;
  searchHighlights(): {
    page: number;
    rects: Array<{ x: number; y: number; width: number; height: number }>;
  } | null;
}

const FONT_STACK = TEXT_FONT_STACK;

function orthoPoint(last: Point, current: Point): Point {
  return Math.abs(current.x - last.x) >= Math.abs(current.y - last.y)
    ? { x: current.x, y: last.y }
    : { x: last.x, y: current.y };
}

/** Tools whose next click can land on an existing snap target. */
const SNAP_TOOLS: ReadonlySet<ToolId> = new Set([
  "calibrate",
  "length",
  "radius",
  "diameter",
  "slope",
  "angle",
  "arc",
  "polyline",
  "area",
  "volume",
  "cloud",
  "line",
  "arrow",
  "count",
  "symbol",
]);

function toolUsesSnapping(tool: ToolId): boolean {
  if (tool === "highlight") return store.ui.highlightShape !== "stroke";
  return SNAP_TOOLS.has(tool);
}

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
  private options: CanvasViewOptions;
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
  private penActive = false;
  private lastPenAt = 0;
  private touchLongPressTimer: number | null = null;
  private touchLongPressStart: Point | null = null;
  private touchLongPressFired = false;
  private touchNavigation: TouchNavigation;
  private snap: SnapResult | null = null;
  private snapCache: { revision: number; page: number; candidates: SnapCandidate[] } | null = null;
  private searchHits: {
    page: number;
    rects: Array<{ x: number; y: number; width: number; height: number }>;
  } | null = null;
  private spaceDown = false;
  private renderedPage = 0;
  private editors: CanvasEditorController;
  private hoverHandle: Handle | null = null;
  private hoverLabelResize = false;
  private labelConnect: { itemId: string; layerId: string } | null = null;
  private sheetFieldEditor: {
    input: HTMLInputElement | HTMLTextAreaElement;
    page: number;
    fieldId: string;
  } | null = null;
  private crop: CropController;
  private imageCache = new Map<string, HTMLImageElement>();
  private imageLoading = new Set<string>();
  private imageFailed = new Set<string>();

  constructor(host: HTMLElement, hooks: CanvasHooks, options: CanvasViewOptions = {}) {
    this.host = host;
    this.hooks = hooks;
    this.options = options;
    this.base = document.createElement("canvas");
    this.content = document.createElement("canvas");
    this.interaction = document.createElement("canvas");
    const prefix = options.canvasIdPrefix ?? "canvas";
    this.base.id = `${prefix}-pdf`;
    this.content.id = `${prefix}-content`;
    this.interaction.id = `${prefix}-interaction`;
    this.base.className = "canvas-pdf";
    this.content.className = "canvas-content";
    this.interaction.className = "canvas-interaction";
    if (options.readOnly) {
      this.interaction.setAttribute("aria-label", t("canvas.referenceDrawing"));
      this.interaction.setAttribute("aria-hidden", "true");
    } else {
      this.interaction.tabIndex = 0;
      this.interaction.setAttribute("aria-label", t("canvas.drawingCanvas"));
    }
    host.append(this.base, this.content, this.interaction);

    this.baseCtx = this.base.getContext("2d")!;
    this.contentCtx = this.content.getContext("2d")!;
    this.interactionCtx = this.interaction.getContext("2d")!;

    this.loading = document.createElement("div");
    this.loading.className = "canvas-loading";
    this.loading.textContent = t("canvas.renderingPage");
    host.append(this.loading);

    this.editors = new CanvasEditorController({
      host,
      width: () => this.width,
      toScreen: (point) => this.toScreen(point),
      pageLabelLayouts: () => this.pageLabelLayouts(),
      screenLabelBox: (box, metrics) => this.screenLabelBox(box, metrics),
      drawContent: () => this.drawContent(),
      drawInteraction: () => this.drawInteraction(),
    });

    this.crop = new CropController({
      host: this.host,
      pageSize: () => this.pageSize(),
      toPage: (screen) => this.toPage(screen),
      toScreen: (page) => this.toScreen(page),
      width: () => this.width,
      height: () => this.height,
      prepare: () => {
        this.draft = null;
        this.drag = null;
        this.marquee = null;
        this.pan = null;
        this.hoverHandle = null;
        this.hoverLabelResize = false;
        this.snap = null;
        this.snapCache = null;
        store.clearSelection();
        this.fitPage();
        this.interaction.focus({ preventScroll: true });
      },
      updateCursor: () => this.updateCursor(),
      drawInteraction: () => this.drawInteraction(),
      capturePointer: (pointerId) => this.capturePointer(pointerId),
    });

    this.touchNavigation = new TouchNavigation({
      getView: () => this.view,
      toLocal: (clientX, clientY) => {
        const rect = this.interaction.getBoundingClientRect();
        return { x: clientX - rect.left, y: clientY - rect.top };
      },
      setView: (next) => store.setView(next.zoom, next.panX, next.panY),
      onGestureStart: () => {
        this.pan = null;
        this.marquee = null;
        this.drag = null;
        store.cancelGesture();
        this.cancelDraft();
      },
      suppressOneFinger: () => this.penActive || performance.now() - this.lastPenAt < 800,
      capturePointer: (pointerId) => this.capturePointer(pointerId),
      releasePointer: (pointerId) => this.releasePointer(pointerId),
    });

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);

    if (!options.readOnly) {
      this.interaction.addEventListener("pointerdown", this.onPointerDown);
      this.interaction.addEventListener("pointermove", this.onPointerMove);
      this.interaction.addEventListener("pointerup", this.onPointerUp);
      this.interaction.addEventListener("pointercancel", this.onPointerUp);
      this.interaction.addEventListener("pointerleave", this.onPointerLeave);
      this.interaction.addEventListener("dblclick", this.onDoubleClick);
      this.interaction.addEventListener("wheel", this.onWheel, { passive: false });
      this.interaction.addEventListener("contextmenu", this.onContextMenu);
    }

    this.unsubscribe = store.subscribe((reason) => this.onStoreChange(reason));
    this.resize();
    void ensureLabelFonts().then(() => {
      if (!this.sceneProject) return;
      this.drawContent();
      this.drawInteraction();
    });
  }

  /** The viewport this canvas renders. The primary canvas follows the store. */
  private get view(): Viewport {
    return (
      this.options.view?.() ?? {
        page: store.ui.page,
        zoom: store.ui.zoom,
        panX: store.ui.panX,
        panY: store.ui.panY,
      }
    );
  }

  private get sceneProject(): Project | null {
    return this.options.project ? this.options.project() : store.project;
  }

  private get viewPage(): number {
    return this.view.page;
  }

  private get viewZoom(): number {
    return this.view.zoom;
  }

  private get viewPanX(): number {
    return this.view.panX;
  }

  private get viewPanY(): number {
    return this.view.panY;
  }

  get viewportSize(): PageSize {
    return { width: this.width, height: this.height };
  }

  /** Current page, zoom and pan. Used by the reference touch navigation. */
  get currentView(): Viewport {
    return this.view;
  }

  get readOnly(): boolean {
    return this.options.readOnly === true;
  }

  pageToScreen(point: Point): Point {
    return toScreenPoint(this.view, point);
  }

  screenToPage(point: Point): Point {
    return toPagePoint(this.view, point);
  }

  /** Zooms around a screen point owned by this canvas. */
  zoomAtScreen(point: Point, factor: number): void {
    if (this.readOnly) return;
    const next = zoomViewport(this.view, point, factor);
    store.setView(next.zoom, next.panX, next.panY);
  }

  /** Hidden reference panes skip drawing and rendering until they are shown again. */
  private get isVisible(): boolean {
    const bounds = this.host.getBoundingClientRect();
    return bounds.width >= 2 && bounds.height >= 2;
  }

  private onStoreChange(reason: string): void {
    if (reason === "cursor") return;
    if (this.readOnly && !this.isVisible) return;
    if (reason === "view" || reason === "page" || reason === "project" || reason === "undo") {
      this.commitSheetField(false);
    }
    this.editors.handleStoreChange(reason);
    const page = this.viewPage;
    if (reason === "project" || reason === "undo") {
      this.lastRender = null;
      this.draft = null;
      this.drag = null;
      this.marquee = null;
      this.labelConnect = null;
      this.snap = null;
      this.renderedPage = page;
    }
    if (reason === "project") {
      this.imageCache.clear();
      this.imageLoading.clear();
      this.imageFailed.clear();
    }
    if (reason === "tool") {
      this.draft = null;
      this.labelConnect = null;
      this.snap = null;
      if (store.ui.hover) store.setHover(null);
      this.updateCursor();
    }
    if (page !== this.renderedPage) {
      this.lastRender = null;
      this.draft = null;
      this.labelConnect = null;
      this.snap = null;
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
    this.editors.positionTextEditor();
    this.editors.positionLabelEditor();
    this.schedulePdfRender();
  }

  invalidate(): void {
    if (this.readOnly && !this.isVisible) return;
    this.drawAll();
    this.schedulePdfRender();
  }

  /** Drops raster and image caches when a comparison session replaces the scene. */
  resetScene(): void {
    this.lastRender = null;
    this.renderedPage = 0;
    this.imageCache.clear();
    this.imageLoading.clear();
    this.imageFailed.clear();
    this.invalidate();
  }

  /** Highlights text-search rectangles on one page. */
  setSearchHits(
    page: number,
    rects: Array<{ x: number; y: number; width: number; height: number }>,
  ): void {
    this.searchHits = { page, rects };
    this.invalidate();
  }

  clearSearchHits(): void {
    if (!this.searchHits) return;
    this.searchHits = null;
    this.invalidate();
  }

  /** Centres page-space bounds in this viewport. Used by the revision diff list. */
  focusBounds(bounds: Bounds): boolean {
    const size = this.ensurePageSize();
    if (!size || this.width < 1 || this.height < 1) return false;
    const view = focusViewTransform(bounds, size, { width: this.width, height: this.height });
    store.setView(view.zoom, view.panX, view.panY);
    return true;
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
      this.labelConnect !== null ||
      this.editors.hasEditors ||
      this.crop.active
    );
  }

  get isCropping(): boolean {
    return this.crop.active;
  }

  private pageSize(): PageSize | undefined {
    return this.hooks.getPageSize(this.viewPage);
  }

  private ensurePageSize(): PageSize | undefined {
    const size = this.pageSize();
    if (!size) this.hooks.ensurePageSize(this.viewPage);
    return size;
  }

  fitPage(): boolean {
    if (this.readOnly) return false;
    const size = this.ensurePageSize();
    if (!size || this.width < 1) return false;
    const view = fitPageViewport(size, this.width, this.height);
    store.setView(view.zoom, view.panX, view.panY);
    return true;
  }

  /**
   * Fits one item in view, including its measurement label, with 25 % breathing
   * room. An item that already sits comfortably in view is left alone so
   * clicking rows in Markups or Layers does not re-zoom the drawing.
   */
  focusItem(item: MarkupItem): boolean {
    const size = this.ensurePageSize();
    if (!size || this.width < 1 || this.height < 1) return false;
    const bounds = this.focusBoundsForItem(item);
    if (this.isBoundsVisible(bounds)) return true;
    const view = focusViewTransform(bounds, size, {
      width: this.width,
      height: this.height,
    });
    store.setView(view.zoom, view.panX, view.panY);
    return true;
  }

  /** True when the bounds already sit inside the viewport with breathing room. */
  private isBoundsVisible(bounds: Bounds): boolean {
    const margin = 48;
    const first = this.toScreen(bounds.min);
    const second = this.toScreen(bounds.max);
    return (
      Math.min(first.x, second.x) >= margin &&
      Math.min(first.y, second.y) >= margin &&
      Math.max(first.x, second.x) <= this.width - margin &&
      Math.max(first.y, second.y) <= this.height - margin
    );
  }

  private focusBoundsForItem(item: MarkupItem): Bounds {
    const bounds = itemBounds(item);
    if (item.kind === "count" && item.points[0]) {
      const radius = COUNT_SYMBOL_RADIUS + 2;
      bounds.min.x -= radius;
      bounds.min.y -= radius;
      bounds.max.x += radius;
      bounds.max.y += radius;
    }
    const label = this.pageLabelLayouts().get(item.id);
    if (label) {
      bounds.min.x = Math.min(bounds.min.x, label.box.x);
      bounds.min.y = Math.min(bounds.min.y, label.box.y);
      bounds.max.x = Math.max(bounds.max.x, label.box.x + label.box.width);
      bounds.max.y = Math.max(bounds.max.y, label.box.y + label.box.height);
    }
    return bounds;
  }

  /**
   * Enters the one-shot crop mode used by the drawing export dialog. The
   * promise resolves with a relative crop, or null when the user cancels.
   */
  pickExportCrop(initial?: NormalizedCrop): Promise<NormalizedCrop | null> {
    if (!store.project) return Promise.resolve(null);
    return this.crop.pick(initial);
  }

  confirmCrop(): boolean {
    return this.crop.confirm();
  }

  cancelCrop(): void {
    this.crop.cancel();
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
    if (this.readOnly) return;
    const size = this.pageSize();
    if (!size) return;
    const centerPage = viewportCenter(this.view, this.width, this.height);
    const clamped = clampZoom(zoom);
    store.setView(
      clamped,
      this.width / 2 - centerPage.x * clamped,
      this.height / 2 - centerPage.y * clamped,
    );
  }

  private zoomAt(screen: Point, factor: number): void {
    if (this.readOnly) return;
    const next = zoomViewport(this.view, screen, factor);
    store.setView(next.zoom, next.panX, next.panY);
  }

  private localPoint(event: PointerEvent | WheelEvent | MouseEvent): Point {
    return this.localFromClient(event.clientX, event.clientY);
  }

  private localFromClient(clientX: number, clientY: number): Point {
    const rect = this.interaction.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private startTouchLongPress(event: PointerEvent): void {
    this.cancelTouchLongPress();
    if (event.pointerType !== "touch" || store.ui.activeTool !== "select") return;
    this.touchLongPressStart = { x: event.clientX, y: event.clientY };
    this.touchLongPressTimer = window.setTimeout(() => {
      this.touchLongPressTimer = null;
      this.touchLongPressFired = true;
      this.drag = null;
      this.marquee = null;
      store.cancelGesture();
      this.openContextMenu(event.clientX, event.clientY);
    }, 550);
  }

  private trackTouchLongPress(event: PointerEvent): void {
    if (!this.touchLongPressStart || event.pointerType !== "touch") return;
    if (
      Math.hypot(
        event.clientX - this.touchLongPressStart.x,
        event.clientY - this.touchLongPressStart.y,
      ) > 8
    ) {
      this.cancelTouchLongPress();
    }
  }

  private cancelTouchLongPress(): void {
    if (this.touchLongPressTimer !== null) {
      window.clearTimeout(this.touchLongPressTimer);
      this.touchLongPressTimer = null;
    }
    this.touchLongPressStart = null;
  }

  private toPage(screen: Point): Point {
    return toPagePoint(this.view, screen);
  }

  private toScreen(page: Point): Point {
    return toScreenPoint(this.view, page);
  }

  private pageLabelLayouts(): Map<string, LabelLayout> {
    const project = this.sceneProject;
    const size = this.pageSize();
    if (!project || !size) return new Map();
    return layoutPageLabels(pageLabelSources(project, this.viewPage), {
      pageSize: size,
      measure: measureLabelText,
      labelSize: project.settings.labelSize,
    });
  }

  /**
   * Labels use the same paper-space size on screen and in PDF export. Do not
   * add a screen-space cap here: it made the canvas disagree with the export.
   */
  private screenLabelBox(box: LabelBox, _metrics: LabelMetrics): LabelBox {
    const zoom = this.viewZoom;
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const width = box.width * zoom;
    const height = box.height * zoom;
    const x = centerX * zoom + this.viewPanX - width / 2;
    const y = centerY * zoom + this.viewPanY - height / 2;
    return {
      x,
      y,
      width,
      height,
      primaryCenterY: y + (box.primaryCenterY - box.y) * zoom,
      secondaryCenterY:
        box.secondaryCenterY === undefined ? undefined : y + (box.secondaryCenterY - box.y) * zoom,
    };
  }

  private labelResizePoint(item: MarkupItem): Point | null {
    const layout = this.pageLabelLayouts().get(item.id);
    if (!layout) return null;
    const box = this.screenLabelBox(layout.box, layout.metrics);
    return { x: box.x + box.width, y: box.y + box.height };
  }

  private labelResizeAt(item: MarkupItem, screen: Point): boolean {
    const point = this.labelResizePoint(item);
    return point ? distance(screen, point) <= 9 : false;
  }

  private updateCursor(): void {
    if (this.readOnly) return;
    const tool = store.ui.activeTool;
    let cursor = "";
    if (this.crop.active) {
      cursor = this.crop.cursor() ?? "crosshair";
    } else if (this.pan) cursor = "grabbing";
    else if (this.drag) {
      if (this.drag.mode === "rotate") cursor = "grabbing";
      else if (
        (this.drag.mode === "resize" || this.drag.mode === "scale-selection") &&
        this.drag.handle
      ) {
        cursor = cursorForRole(this.drag.handle);
      } else if (this.drag.mode === "vertex") cursor = "crosshair";
      else if (this.drag.mode === "measurement-label-size") cursor = "nwse-resize";
      else cursor = "move";
    } else if (this.labelConnect) cursor = "crosshair";
    else if (this.spaceDown || tool === "pan") cursor = "grab";
    else if (this.marquee) cursor = "crosshair";
    else if (this.hoverLabelResize) cursor = "nwse-resize";
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
    this.editors.commitActiveEditors();
    this.interaction.focus({ preventScroll: true });
    const screen = this.localPoint(event);

    if (event.pointerType === "pen") {
      this.penActive = true;
      this.lastPenAt = performance.now();
    }
    if (event.pointerType === "touch") {
      this.cancelTouchLongPress();
      this.touchLongPressFired = false;
      if (this.touchNavigation.pointerDown(event)) return;
      this.startTouchLongPress(event);
    }

    if (this.crop.active) {
      if (event.button !== 0) return;
      event.preventDefault();
      this.crop.pointerDown(this.toPage(screen), event);
      return;
    }

    if (this.labelConnect) {
      event.preventDefault();
      this.commitLabelConnection(this.toPage(screen));
      return;
    }

    if (event.button === 1 || this.spaceDown || store.ui.activeTool === "pan") {
      event.preventDefault();
      this.pan = {
        startX: event.clientX,
        startY: event.clientY,
        panX: this.viewPanX,
        panY: this.viewPanY,
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

    if (tool === "radius" || tool === "diameter") {
      const snapped = this.snapPoint(page);
      if (!this.draft || (this.draft.kind !== "radius" && this.draft.kind !== "diameter")) {
        this.draft = { kind: tool, points: [snapped], cursor: snapped };
        this.drawInteraction();
      } else {
        const points = [this.draft.points[0], snapped];
        this.draft = null;
        this.snap = null;
        this.createItem(tool, points);
        this.drawInteraction();
      }
      return;
    }

    if (tool === "slope") {
      const snapped = this.snapPoint(page);
      if (!this.draft || this.draft.kind !== "slope") {
        this.draft = { kind: "slope", points: [snapped], cursor: snapped };
        this.drawInteraction();
      } else {
        const points = [this.draft.points[0], snapped];
        this.draft = null;
        this.snap = null;
        this.createItem("slope", points);
        this.drawInteraction();
      }
      return;
    }

    if (tool === "angle") {
      const snapped = this.snapPoint(page);
      if (!this.draft || this.draft.kind !== "angle") {
        this.draft = { kind: "angle", points: [snapped], cursor: snapped };
        this.drawInteraction();
      } else {
        this.draft.points.push(snapped);
        this.draft.cursor = snapped;
        if (this.draft.points.length >= 3) {
          const points = this.draft.points.slice(0, 3);
          this.draft = null;
          this.snap = null;
          this.createItem("angle", points);
        }
        this.drawInteraction();
      }
      return;
    }

    if (tool === "arc") {
      const snapped = this.snapPoint(page);
      if (!this.draft || this.draft.kind !== "arc") {
        this.draft = { kind: "arc", points: [snapped], cursor: snapped };
        this.drawInteraction();
      } else {
        this.draft.points.push(snapped);
        this.draft.cursor = snapped;
        if (this.draft.points.length >= 3) {
          const points = this.draft.points.slice(0, 3);
          this.draft = null;
          this.snap = null;
          const preview = { kind: "arc", points } as MarkupItem;
          if (arcGeometry(preview)) this.createItem("arc", points);
          else toast(t("canvas.thirdPoint"), "warning");
        }
        this.drawInteraction();
      }
      return;
    }

    if (tool === "polyline") {
      if (event.detail > 1) {
        this.finishDraft();
        return;
      }
      let snapped = event.shiftKey ? page : this.snapPolylinePoint(page);
      if (event.shiftKey) this.snap = null;
      const existing = this.draft?.kind === "polyline" ? this.draft : null;
      if (existing && existing.points.length) {
        snapped = this.constrainPolyline(
          existing.points[existing.points.length - 1],
          snapped,
          event.shiftKey,
        );
      }
      if (!existing) {
        this.draft = { kind: "polyline", points: [snapped], cursor: snapped };
      } else {
        const last = existing.points[existing.points.length - 1];
        if (distance(last, snapped) > 0.001) existing.points.push(snapped);
        existing.cursor = snapped;
      }
      this.drawInteraction();
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
          : tool === "volume"
            ? "volume"
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
        distance(snapped, this.draft.points[0]) < 10 / this.viewZoom
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

    if (
      tool === "line" ||
      tool === "arrow" ||
      tool === "rect" ||
      tool === "ellipse" ||
      tool === "textbox" ||
      tool === "rail"
    ) {
      const snaps = tool === "line" || tool === "arrow";
      const snapped = snaps ? this.snapPoint(page) : page;
      if (!snaps) this.snap = null;
      this.draft = { kind: tool, start: snapped, current: snapped };
      this.capturePointer(event.pointerId);
      this.drawInteraction();
      return;
    }

    if (tool === "text") {
      const hit = hitTest(store.project, this.viewPage, page, 7 / this.viewZoom);
      if (hit?.item.kind === "text" && !layerLockedOnPage(hit.layer, this.viewPage)) {
        store.setSelection({ layerId: hit.layer.id, itemId: hit.item.id });
        this.editors.startTextEdit(hit.item, hit.layer);
      } else {
        this.editors.startNewText(page);
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

    if (tool === "symbol") {
      if (event.detail > 1) return;
      const snapped = this.snapPoint(page);
      this.createItem("symbol", [snapped], {
        symbolId: store.ui.symbolId,
        status: store.ui.symbolStatus ?? undefined,
      });
      this.drawInteraction();
    }
  };

  private handleSelectDown(page: Point, event: PointerEvent): void {
    const project = store.project!;
    const screen = this.localPoint(event);
    const modifier = event.shiftKey || event.ctrlKey || event.metaKey;
    const selection = store.ui.selection;
    const primary = store.primarySelection;

    if (!modifier && selection.length > 1) {
      const bounds = selectionBounds(project, selection);
      const groupHandle =
        bounds && groupHandleAt(bounds, screen, (point) => this.toScreen(point), 10);
      if (bounds && groupHandle) {
        this.beginGroupScale(project, bounds, groupHandle, page, event);
        return;
      }
    }

    if (!modifier) {
      if (selection.length === 1 && primary) {
        const found = findItem(project, primary.itemId);
        if (
          found &&
          isMeasurementKind(found.item.kind) &&
          !itemIsLocked(found.item, found.layer) &&
          this.labelResizeAt(found.item, screen)
        ) {
          const layout = this.pageLabelLayouts().get(found.item.id);
          if (layout) {
            const center = {
              x: layout.box.x + layout.box.width / 2,
              y: layout.box.y + layout.box.height / 2,
            };
            const startLabelSize = clampLabelSize(Math.round(layout.metrics.primarySize * 10) / 10);
            store.beginGesture();
            if (found.item.labelFit) {
              found.item.labelSize = startLabelSize;
              delete found.item.labelFit;
            }
            this.drag = {
              mode: "measurement-label-size",
              itemId: found.item.id,
              layerId: found.layer.id,
              vertexIndex: -1,
              last: page,
              moved: false,
              startPage: page,
              startLabelSize,
              startLabelDistance: Math.max(0.001, Math.hypot(page.x - center.x, page.y - center.y)),
              center,
            };
            this.capturePointer(event.pointerId);
            this.updateCursor();
            this.drawInteraction();
            return;
          }
        }
      }

      const labelHit = this.measurementLabelHit(screen);
      if (labelHit && !itemIsLocked(labelHit.item, labelHit.layer)) {
        const layout = this.pageLabelLayouts().get(labelHit.item.id);
        if (layout) {
          const ref = { layerId: labelHit.layer.id, itemId: labelHit.item.id };
          if (!store.isSelected(ref)) store.setSelection(ref);
          const center = {
            x: layout.box.x + layout.box.width / 2,
            y: layout.box.y + layout.box.height / 2,
          };
          const anchor = labelAnchorForPoints(labelHit.item, labelHit.item.points);
          store.beginGesture();
          // Dragging is the explicit escape hatch: keep the size the user is
          // looking at (which may be auto-fitted inside a narrow area) instead
          // of jumping back to the project size.
          const configuredSize = clampLabelSize(
            labelHit.item.labelSize ?? project.settings.labelSize,
          );
          const currentSize = clampLabelSize(Math.round(layout.metrics.primarySize * 10) / 10);
          if (Math.abs(currentSize - configuredSize) > 0.05) {
            labelHit.item.labelSize = currentSize;
          }
          delete labelHit.item.labelFit;
          this.drag = {
            mode: "measurement-label",
            itemId: labelHit.item.id,
            layerId: labelHit.layer.id,
            vertexIndex: -1,
            last: page,
            moved: false,
            startPage: page,
            startLabelOffset: labelHit.item.labelOffset
              ? { ...labelHit.item.labelOffset }
              : { x: center.x - anchor.x, y: center.y - anchor.y },
          };
          this.capturePointer(event.pointerId);
          this.updateCursor();
          this.drawInteraction();
          return;
        }
      }
    }

    if (!modifier && selection.length === 1 && primary) {
      const found = findItem(project, primary.itemId);
      if (found && !itemIsLocked(found.item, found.layer)) {
        if (found.item.kind === "cloud") {
          const label = cloudLabelLayout(found.item);
          const inLabel =
            label &&
            page.x >= label.center.x - label.width / 2 &&
            page.y >= label.center.y - label.height / 2 &&
            page.x <= label.center.x + label.width / 2 &&
            page.y <= label.center.y + label.height / 2;
          if (label && inLabel) {
            this.beginHandleDrag(
              found.layer.id,
              found.item,
              { role: "label", index: -1, point: screen, cursor: "move" },
              page,
              event,
            );
            return;
          }
        }
        if (found.item.kind === "callout") {
          const layout = calloutLayout(found.item);
          const inBox =
            page.x >= layout.box.x &&
            page.y >= layout.box.y &&
            page.x <= layout.box.x + layout.box.width &&
            page.y <= layout.box.y + layout.box.height;
          if (inBox) {
            this.beginHandleDrag(
              found.layer.id,
              found.item,
              { role: "vertex", index: 1, point: screen, cursor: "crosshair" },
              page,
              event,
            );
            return;
          }
        }
        const handle = handleAt(found.item, screen, (page) => this.toScreen(page), 10);
        if (handle) {
          this.beginHandleDrag(found.layer.id, found.item, handle, page, event);
          return;
        }
      }
    }

    const hit = hitTest(project, this.viewPage, page, 7 / this.viewZoom, {
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
        hit.item.kind === "radius" ||
        hit.item.kind === "diameter" ||
        hit.item.kind === "arc" ||
        hit.item.kind === "angle" ||
        hit.item.kind === "slope" ||
        hit.item.kind === "volume" ||
        hit.item.kind === "polyline" ||
        hit.item.kind === "cloud" ||
        hit.item.kind === "callout" ||
        (hit.item.kind === "highlight" && hit.item.highlightShape !== "stroke") ||
        hit.item.kind === "line" ||
        hit.item.kind === "arrow" ||
        hit.item.kind === "pen");
    const vertexIndex = vertexEditable ? findVertex(hit.item, page, 7 / this.viewZoom) : -1;
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
    if (handle.role === "label") {
      const label = cloudLabelLayout(item);
      const centroid = averagePoints(item.points);
      store.beginGesture();
      this.drag = {
        mode: "label",
        itemId: item.id,
        layerId,
        vertexIndex: -1,
        last: page,
        moved: false,
        startPage: page,
        startTextOffset: label
          ? { x: label.center.x - centroid.x, y: label.center.y - centroid.y }
          : item.textOffset
            ? { ...item.textOffset }
            : { x: 0, y: 0 },
      };
    } else if (handle.role === "vertex") {
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
      const bounds = item.kind === "symbol" ? symbolSelectionBounds(item) : itemLocalBounds(item);
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
        startSymbolSize: symbolSizeOf(item),
        startRotation: itemRotation(item),
        startBounds: {
          min: { ...bounds.min },
          max: { ...bounds.max },
        },
        startAnchor: item.points[0] ? { ...item.points[0] } : undefined,
        center:
          item.kind === "symbol" && item.points[0]
            ? { ...item.points[0] }
            : midpoint(bounds.min, bounds.max),
      };
    }
    this.capturePointer(event.pointerId);
    this.updateCursor();
    this.drawInteraction();
  }

  private beginGroupScale(
    project: NonNullable<typeof store.project>,
    bounds: Bounds,
    handle: Handle & { role: BoxHandleRole },
    page: Point,
    event: PointerEvent,
  ): void {
    const items: Array<{ ref: SelectionRef; item: MarkupItem }> = [];
    for (const entry of resolveSelection(project, store.ui.selection)) {
      if (
        entry.locked ||
        !itemIsVisible(entry.item, entry.layer) ||
        layerLockedOnPage(entry.layer, entry.item.page)
      ) {
        continue;
      }
      items.push({ ref: entry.ref, item: structuredClone(entry.item) });
    }
    if (!items.length) return;
    store.beginGesture();
    this.drag = {
      mode: "scale-selection",
      itemId: "",
      layerId: "",
      vertexIndex: -1,
      last: page,
      moved: false,
      handle: handle.role,
      startPage: page,
      scaleAnchor: oppositeHandlePoint(bounds, handle.role),
      scaleCorner: handleLocalPoint(bounds, handle.role),
      scaleStartItems: items,
    };
    this.capturePointer(event.pointerId);
    this.updateCursor();
    this.drawInteraction();
  }

  private applyGroupScale(page: Point): void {
    if (!store.project) return;
    if (!this.drag?.scaleAnchor || !this.drag.scaleCorner || !this.drag.scaleStartItems) return;
    const anchor = this.drag.scaleAnchor;
    const corner = this.drag.scaleCorner;
    const dx = corner.x - anchor.x;
    const dy = corner.y - anchor.y;
    const denominator = dx * dx + dy * dy;
    if (denominator < 1e-9) return;
    const factor = Math.max(
      0.05,
      Math.min(20, ((page.x - anchor.x) * dx + (page.y - anchor.y) * dy) / denominator),
    );
    for (const entry of this.drag.scaleStartItems) {
      const target = findItem(store.project, entry.ref.itemId);
      if (!target || itemIsLocked(target.item, target.layer)) continue;
      Object.assign(target.item, structuredClone(entry.item));
      scaleItemAround(target.item, factor, anchor);
    }
    this.drag.moved = true;
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!store.project) return;
    const screen = this.localPoint(event);

    if (event.pointerType === "touch") {
      this.trackTouchLongPress(event);
      if (this.touchNavigation.pointerMove(event)) {
        event.preventDefault();
        return;
      }
      if (this.touchLongPressFired) return;
    }

    this.pointerScreen = screen;
    const page = this.toPage(screen);
    store.setCursor(page);

    if (this.crop.active) {
      this.crop.pointerMove(page);
      return;
    }

    if (this.pan) {
      const dx = event.clientX - this.pan.startX;
      const dy = event.clientY - this.pan.startY;
      store.setView(this.viewZoom, this.pan.panX + dx, this.pan.panY + dy);
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
        // Shift constrains the angle from the raw pointer, not from a segment
        // snap on an existing pipe. Otherwise the snap would force the old line
        // direction and the constrained endpoint could not move away from it.
        let current = event.shiftKey ? page : this.snapPoint(page);
        if (event.shiftKey) {
          this.snap = null;
          const constrained = constrainAngle(this.draft.start, current);
          if (distance(constrained, current) > 1e-6) this.snap = null;
          current = constrained;
        }
        this.draft.current = current;
      } else if (
        this.draft.kind === "rect" ||
        this.draft.kind === "textbox" ||
        this.draft.kind === "rail" ||
        this.draft.kind === "ellipse" ||
        this.draft.kind === "highlight-rect"
      ) {
        this.snap = null;
        this.draft.current = event.shiftKey ? constrainSquare(this.draft.start, page) : page;
      } else if (this.draft.kind === "polyline") {
        const last = this.draft.points[this.draft.points.length - 1];
        const snapped = event.shiftKey ? page : this.snapPolylinePoint(page);
        this.draft.cursor = this.constrainPolyline(last, snapped, event.shiftKey);
      } else if (this.draft.kind === "pen" || this.draft.kind === "highlight") {
        const last = this.draft.points[this.draft.points.length - 1];
        if (distance(last, page) > 1.4 / this.viewZoom) {
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
      this.hoverLabelResize = false;
      const selection = store.primarySelection;
      if (selection && store.ui.selection.length === 1) {
        const found = findItem(store.project, selection.itemId);
        if (found && !itemIsLocked(found.item, found.layer)) {
          if (isMeasurementKind(found.item.kind)) {
            this.hoverLabelResize = this.labelResizeAt(found.item, screen);
          }
          if (!this.hoverLabelResize) {
            this.hoverHandle = handleAt(found.item, screen, (page) => this.toScreen(page), 10);
          }
        }
      }
      if (!this.hoverHandle && !this.hoverLabelResize && store.ui.selection.length > 1) {
        const bounds = selectionBounds(store.project, store.ui.selection);
        if (bounds) {
          this.hoverHandle = groupHandleAt(bounds, screen, (point) => this.toScreen(point), 10);
        }
      }
      if (!this.hoverHandle && !this.hoverLabelResize) {
        const hit = hitTest(store.project, this.viewPage, page, 7 / this.viewZoom);
        store.setHover(
          hit ? { layerId: hit.layer.id, itemId: hit.item.id, vertexIndex: -1 } : null,
        );
      } else {
        store.setHover(null);
      }
      this.updateCursor();
      this.drawInteraction();
    } else {
      this.hoverHandle = null;
      this.hoverLabelResize = false;
      if (toolUsesSnapping(tool)) this.snapPoint(page);
      else this.snap = null;
      this.updateCursor();
      this.drawInteraction();
    }
  };

  private applyDrag(page: Point, shiftKey: boolean): void {
    if (!this.drag || !store.project) return;
    if (this.drag.mode === "scale-selection") {
      this.applyGroupScale(page);
      this.drawContent();
      this.drawInteraction();
      this.updateCursor();
      return;
    }
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
      const index = this.drag.vertexIndex;
      if (index >= 0 && index < item.points.length) {
        const angleAnchor = shiftKey ? vertexAngleAnchor(item, index) : null;
        const target = angleAnchor
          ? constrainAngle(angleAnchor, page)
          : this.snapPoint(page, this.drag.itemId);
        if (angleAnchor) this.snap = null;
        const localTarget = itemRotation(item) === 0 ? target : pointToItemLocal(item, target);
        item.points[index] = localTarget;
        item.updatedAt = new Date().toISOString();
        this.drag.moved = true;
      }
    } else if (this.drag.mode === "label") {
      if (!this.drag.startPage) return;
      const start = this.drag.startTextOffset ?? { x: 0, y: 0 };
      item.textOffset = {
        x: start.x + (page.x - this.drag.startPage.x),
        y: start.y + (page.y - this.drag.startPage.y),
      };
      item.updatedAt = new Date().toISOString();
      this.drag.moved = true;
    } else if (this.drag.mode === "measurement-label") {
      if (!this.drag.startPage) return;
      const start = this.drag.startLabelOffset ?? { x: 0, y: 0 };
      item.labelOffset = {
        x: start.x + (page.x - this.drag.startPage.x),
        y: start.y + (page.y - this.drag.startPage.y),
      };
      item.updatedAt = new Date().toISOString();
      this.drag.moved = true;
    } else if (this.drag.mode === "measurement-label-size") {
      if (!this.drag.center || !this.drag.startLabelDistance) return;
      const pointerDistance = Math.hypot(page.x - this.drag.center.x, page.y - this.drag.center.y);
      const factor = pointerDistance / this.drag.startLabelDistance;
      const next = clampLabelSize((this.drag.startLabelSize ?? LABEL_PRIMARY_SIZE) * factor);
      const rounded = Math.round(next * 10) / 10;
      if (rounded !== item.labelSize) {
        item.labelSize = rounded;
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

    if (item.kind === "text" || item.kind === "stamp" || item.kind === "symbol") {
      let factor: number;
      if (signX !== 0 && signY !== 0) {
        const pointerX = local.x - opposite.x;
        const pointerY = local.y - opposite.y;
        factor = (pointerX * dx + pointerY * dy) / (dx * dx + dy * dy);
      } else {
        factor = signX !== 0 ? factorX : factorY;
      }
      factor = Math.max(0.01, Math.min(50, factor));
      if (item.kind === "symbol") {
        const start = this.drag.startSymbolSize ?? SYMBOL_SIZE;
        factor = clampSymbolSize(start * factor) / start;
      } else {
        const start = this.drag.startFontSize ?? 12;
        factor = clampTextSize(start * factor) / Math.max(0.5, start);
      }
      factorX = factor;
      factorY = factor;
    } else {
      factorX = Math.max(0.02, Math.min(50, factorX));
      factorY = Math.max(0.02, Math.min(50, factorY));
      if (item.kind === "image") {
        // Corner handles keep the source aspect ratio; edge handles resize one axis.
        if (signX !== 0 && signY !== 0) {
          const factor = Math.abs(factorX - 1) >= Math.abs(factorY - 1) ? factorX : factorY;
          factorX = factor;
          factorY = factor;
        }
      } else if (shiftKey && signX !== 0 && signY !== 0) {
        const factor = Math.abs(factorX - 1) >= Math.abs(factorY - 1) ? factorX : factorY;
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
    } else if (item.kind === "stamp") {
      // Stamps are centre-anchored: keep the opposite corner fixed by moving the
      // centre to the middle of the scaled box.
      item.fontSize = clampTextSize((this.drag.startFontSize ?? 12) * factorX);
      item.points[0] = {
        x: (scaled.min.x + scaled.max.x) / 2 + shiftX,
        y: (scaled.min.y + scaled.max.y) / 2 + shiftY,
      };
    } else if (item.kind === "symbol") {
      // Scale the artwork around the opposite selection corner and move the
      // anchor so the visible symbol stays anchored where the user dragged.
      const start = this.drag.startSymbolSize ?? SYMBOL_SIZE;
      const next = clampSymbolSize(start * factorX);
      const sizeFactor = next / start;
      item.symbolSize = next;
      const startAnchor = this.drag.startAnchor ?? item.points[0];
      if (startAnchor) {
        const nextAnchor = {
          x: opposite.x + (startAnchor.x - opposite.x) * sizeFactor,
          y: opposite.y + (startAnchor.y - opposite.y) * sizeFactor,
        };
        if (rotation !== 0) {
          const oldOpposite = rotatePoint(opposite, startAnchor, rotation);
          const newOpposite = rotatePoint(opposite, nextAnchor, rotation);
          nextAnchor.x += oldOpposite.x - newOpposite.x;
          nextAnchor.y += oldOpposite.y - newOpposite.y;
        }
        item.points[0] = nextAnchor;
      }
    } else if (item.kind === "rail") {
      const startPoints = this.drag.startPoints ?? item.points;
      item.points = [
        { x: scaled.min.x + shiftX, y: startPoints[0].y },
        { x: scaled.max.x + shiftX, y: startPoints[1].y },
      ];
    } else if (
      item.kind === "rect" ||
      item.kind === "textbox" ||
      item.kind === "ellipse" ||
      item.kind === "image"
    ) {
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
      item.kind === "textbox" ||
      item.kind === "rect" ||
      item.kind === "ellipse" ||
      item.kind === "image" ||
      item.kind === "symbol"
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
    if (event.pointerType === "pen") {
      this.penActive = false;
      this.lastPenAt = performance.now();
    }
    if (event.pointerType === "touch") {
      this.cancelTouchLongPress();
      if (this.touchLongPressFired) {
        this.touchLongPressFired = false;
        if (this.interaction.hasPointerCapture(event.pointerId)) {
          this.releasePointer(event.pointerId);
        }
        return;
      }
    }
    if (this.touchNavigation.pointerUp(event)) return;
    if (this.interaction.hasPointerCapture(event.pointerId)) {
      this.releasePointer(event.pointerId);
    }
    if (this.crop.active) {
      this.crop.pointerUp();
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
      this.snap = null;
      this.endDrag();
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
        this.draft.kind === "textbox" ||
        this.draft.kind === "rail" ||
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
    this.hoverLabelResize = false;
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
    if (rect.width < 2 / this.viewZoom && rect.height < 2 / this.viewZoom) {
      this.updateCursor();
      this.drawInteraction();
      return;
    }
    const refs = marquee.additive ? [...store.ui.selection] : [];
    const min = { x: rect.x, y: rect.y };
    const max = { x: rect.x + rect.width, y: rect.y + rect.height };
    for (const layer of store.project.layers) {
      if (!layerVisibleOnPage(layer, this.viewPage)) continue;
      for (const item of layer.items) {
        if (item.page !== this.viewPage || !itemIsVisible(item, layer)) continue;
        if (itemIntersectsBounds(item, min, max)) {
          refs.push({ layerId: layer.id, itemId: item.id });
        }
      }
    }
    store.setSelectionMany(refs);
    this.updateCursor();
    this.drawInteraction();
  }

  private onPointerLeave = (): void => {
    this.cancelTouchLongPress();
    if (this.crop.active) {
      this.crop.pointerLeave();
      return;
    }
    if (this.drag || this.pan) return;
    this.pointerScreen = null;
    this.hoverHandle = null;
    this.hoverLabelResize = false;
    store.setCursor(null);
    store.setHover(null);
    this.snap = null;
    this.updateCursor();
    this.drawInteraction();
  };

  private onDoubleClick = (event: MouseEvent): void => {
    if (this.touchNavigation.active || this.touchNavigation.suppressed) return;
    if (!store.project || this.crop.active) return;
    const tool = store.ui.activeTool;
    if (tool === "length" || tool === "area" || tool === "volume" || tool === "polyline") {
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
      if (labelHit.item.kind === "volume") {
        this.promptVolumeDepth({ layerId: labelHit.layer.id, itemId: labelHit.item.id });
        return;
      }
      this.editors.startLabelEdit(labelHit);
      return;
    }

    const hit = hitTest(store.project, this.viewPage, page, 7 / this.viewZoom);
    if (!hit) {
      if (tool === "select") this.editSheetFieldAt(this.viewPage, screen);
      return;
    }
    if (itemIsLocked(hit.item, hit.layer)) return;
    store.setSelection({ layerId: hit.layer.id, itemId: hit.item.id });

    if (hit.item.kind === "volume") {
      this.promptVolumeDepth({ layerId: hit.layer.id, itemId: hit.item.id });
      return;
    }

    if (hit.item.kind === "text") {
      this.editors.startTextEdit(hit.item, hit.layer);
      return;
    }
    if (hit.item.kind === "textbox") {
      this.editors.startTextBoxEdit(hit.item, hit.layer);
      return;
    }
    if (hit.item.kind === "rail") {
      void openRailDialog(hit.item.id);
      return;
    }
    if (hit.item.kind === "cloud") {
      this.editors.startCloudTextEdit(hit.item, hit.layer);
      return;
    }
    if (hit.item.kind === "callout") {
      this.editors.startCalloutTextEdit(hit.item, hit.layer);
      return;
    }
    if (hit.item.kind === "stamp" || hit.item.kind === "delta") {
      void this.editItemText(hit.item);
      return;
    }

    const segment = findSegment(
      hit.item,
      page,
      7 / this.viewZoom,
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
      store.mutate((project) => {
        const item = findItem(project, hit.item.id)?.item;
        if (item) {
          item.points.splice(segment.index + 1, 0, insert);
          item.updatedAt = new Date().toISOString();
        }
      }, "change");
    }
  };

  private onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
    if (this.touchLongPressFired) return;
    this.cancelTouchLongPress();
    this.openContextMenu(event.clientX, event.clientY);
  };

  private openContextMenu(clientX: number, clientY: number): void {
    if (this.crop.active) return;
    const project = store.project;
    if (!project) return;
    const screen = this.localFromClient(clientX, clientY);
    const labelHit = this.measurementLabelHit(screen);
    if (labelHit && !itemIsLocked(labelHit.item, labelHit.layer)) {
      store.setSelection({ layerId: labelHit.layer.id, itemId: labelHit.item.id });
      this.showMeasurementLabelMenu(clientX, clientY, labelHit.item, labelHit.layer.id);
      return;
    }
    const page = this.toPage(screen);
    const hit = hitTest(project, this.viewPage, page, 7 / this.viewZoom, {
      includeLocked: true,
    });
    if (hit) {
      const ref = { layerId: hit.layer.id, itemId: hit.item.id };
      if (!store.isSelected(ref)) store.setSelection(ref);
    }
    this.hooks.onContextMenu?.({
      page,
      clientX,
      clientY,
    });
  }

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
    store.setView(this.viewZoom, this.viewPanX - dx, this.viewPanY - dy);
  };

  private snapCandidates(): readonly SnapCandidate[] {
    const project = store.project;
    if (!project) return [];
    if (
      !this.snapCache ||
      this.snapCache.revision !== store.revision ||
      this.snapCache.page !== this.viewPage
    ) {
      this.snapCache = {
        revision: store.revision,
        page: this.viewPage,
        candidates: collectSnapCandidates(project, this.viewPage),
      };
    }
    return this.snapCache.candidates;
  }

  private snapPoint(point: Point, excludeItemId?: string): Point {
    const project = store.project;
    this.snap = null;
    if (!project || !project.settings.snapToGeometry) return point;
    const candidates = excludeItemId
      ? excludeOwnSnapTargets(this.snapCandidates(), excludeItemId)
      : this.snapCandidates();
    const result = findSnap(
      point,
      candidates,
      project.settings.snapTolerancePx ?? 8,
      this.viewZoom,
    );
    if (!result) return point;
    this.snap = result;
    return { ...result.point };
  }

  private snapPolylinePoint(point: Point): Point {
    return this.snapPoint(point);
  }

  private constrainPolyline(last: Point, point: Point, free: boolean): Point {
    if (free) {
      this.snap = null;
      return point;
    }
    // An explicit snap target wins over the orthogonal default, so a cable can
    // start or end on a port, midpoint, intersection or segment at any angle.
    if (this.snap) return point;
    const constrained = orthoPoint(last, point);
    if (distance(constrained, point) > 1e-6) this.snap = null;
    return constrained;
  }

  private runCalibration = async (p1: Point, p2: Point): Promise<void> => {
    const project = store.project;
    if (!project) return;
    const page = this.viewPage;
    if (pageScaleLocked(project, page)) {
      this.draft = null;
      toast(t("canvas.scaleLockedCalibrate"), "warning");
      this.drawInteraction();
      return;
    }
    const pagesAffected = project.layers.some(
      (layer) => layer.kind === "measure" && layer.items.some((item) => item.page === page),
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
    store.mutate((project) => {
      changed = setPageCalibration(project, page, calibration, {
        applyToAll: result.applyToAll,
        updateMeasurements: result.updateMeasurements,
        pageCount: totalPageCount(project.documents),
      });
    }, "change");
    if (!changed.length) {
      toast(t("canvas.noUnlockedCalibration"), "warning");
      this.drawInteraction();
      return;
    }
    store.setTool("select");
    const lockedSkipped = result.applyToAll
      ? totalPageCount(project.documents) - changed.length
      : 0;
    toast(
      result.applyToAll
        ? t("canvas.scaleSetMany", {
            length: formatNumber(result.knownLength, 2),
            unit: result.unit,
            count: changed.length,
            locked: lockedSkipped > 0 ? t("canvas.lockedSkipped", { count: lockedSkipped }) : "",
          })
        : t("canvas.scaleSetSingle", {
            length: formatNumber(result.knownLength, 2),
            unit: result.unit,
          }),
      "success",
    );
    this.drawAll();
    this.schedulePdfRender();
  };

  private editCalibration = async (): Promise<void> => {
    const project = store.project;
    if (!project) return;
    const page = this.viewPage;
    const calibration = pageCalibration(project, page);
    if (!calibration) return;
    if (pageScaleLocked(project, page)) {
      toast(t("canvas.scaleLockedEdit"), "warning");
      return;
    }
    if (!isReferenceCalibration(calibration)) {
      toast(t("canvas.manualScaleUse"), "info");
      return;
    }
    const pagesAffected = project.layers.some(
      (layer) => layer.kind === "measure" && layer.items.some((item) => item.page === page),
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
    const next = createCalibration(calibration.p1, calibration.p2, result.knownLength, result.unit);
    store.mutate((project) => {
      setPageCalibration(project, page, next, {
        applyToAll: false,
        updateMeasurements: result.updateMeasurements,
        pageCount: totalPageCount(project.documents),
      });
    }, "change");
    toast(
      t("canvas.referenceUpdated", {
        length: formatNumber(result.knownLength, 2),
        unit: result.unit,
      }),
      "success",
    );
  };

  public editSelectedText(): void {
    const selection = store.primarySelection;
    if (!selection || !store.project) return;
    const found = findItem(store.project, selection.itemId);
    if (!found || itemIsLocked(found.item, found.layer)) {
      toast(t("canvas.selectUnlockedText"), "info");
      return;
    }
    store.setTool("select");
    if (found.item.kind === "text") {
      this.editors.startTextEdit(found.item, found.layer);
      return;
    }
    if (found.item.kind === "textbox") {
      this.editors.startTextBoxEdit(found.item, found.layer);
      return;
    }
    if (found.item.kind === "cloud") {
      this.editors.startCloudTextEdit(found.item, found.layer);
      return;
    }
    if (found.item.kind === "callout") {
      this.editors.startCalloutTextEdit(found.item, found.layer);
      return;
    }
    if (found.item.kind === "stamp" || found.item.kind === "delta") {
      void this.editItemText(found.item);
      return;
    }
    toast(t("canvas.selectText"), "info");
  }

  private showMeasurementLabelMenu(x: number, y: number, item: MarkupItem, layerId: string): void {
    const custom = Boolean(item.labelOffset || item.labelAnchor || item.labelFit);
    showPopoverAt(x, y, [
      {
        label: t("canvas.resetLabelPosition"),
        icon: "undo",
        disabled: !custom,
        action: () => {
          store.mutate((project) => {
            const target = findItem(project, item.id)?.item;
            if (!target) return;
            delete target.labelOffset;
            delete target.labelAnchor;
            delete target.labelFit;
            target.updatedAt = new Date().toISOString();
          }, "change");
        },
      },
      {
        label: t("canvas.resetLabelSize"),
        icon: "undo",
        disabled: item.labelSize === undefined,
        action: () => {
          store.mutate((project) => {
            const target = findItem(project, item.id)?.item;
            if (!target) return;
            delete target.labelSize;
            target.updatedAt = new Date().toISOString();
          }, "change");
        },
      },
      ...(item.kind === "volume"
        ? [
            { separator: true as const },
            {
              label: t("canvas.setVolumeDepth"),
              icon: "volume",
              action: () => this.promptVolumeDepth({ layerId, itemId: item.id }),
            },
          ]
        : []),
      { separator: true },
      {
        label: item.labelFit
          ? t("canvas.lockInsidePosition", { position: labelFitLabel(item.labelFit) })
          : t("canvas.lockInsideArea"),
        icon: "target",
        disabled: item.kind !== "area" && item.kind !== "volume",
        children: [
          ...LABEL_FIT_POSITIONS.map((position) => ({
            label: `${item.labelFit === position ? "✓ " : ""}${labelFitLabel(position)}`,
            action: () => this.setMeasurementLabelFit(item.id, position),
          })),
          { separator: true },
          {
            label: t("canvas.release"),
            disabled: item.labelFit === undefined,
            action: () => this.releaseMeasurementLabelFit(item.id),
          },
        ],
      },
      { separator: true },
      {
        label: t("canvas.chooseConnection"),
        icon: "target",
        disabled: item.kind === "count" || Boolean(item.labelFit),
        action: () => {
          this.labelConnect = { itemId: item.id, layerId };
          toast(t("canvas.connectionHint"), "info");
          this.interaction.focus({ preventScroll: true });
          this.updateCursor();
        },
      },
    ]);
  }

  private setMeasurementLabelFit(itemId: string, placement: LabelFitPosition): void {
    store.mutate((project) => {
      const target = findItem(project, itemId)?.item;
      if (!target || (target.kind !== "area" && target.kind !== "volume")) return;
      target.labelFit = placement;
      delete target.labelOffset;
      delete target.labelAnchor;
      target.updatedAt = new Date().toISOString();
    }, "change");
  }

  private releaseMeasurementLabelFit(itemId: string): void {
    store.mutate((project) => {
      const target = findItem(project, itemId)?.item;
      if (!target) return;
      delete target.labelFit;
      target.updatedAt = new Date().toISOString();
    }, "change");
  }

  private commitLabelConnection(page: Point): void {
    const connect = this.labelConnect;
    this.labelConnect = null;
    const project = store.project;
    if (!connect || !project) {
      this.updateCursor();
      return;
    }
    const found = findItem(project, connect.itemId);
    if (!found || itemIsLocked(found.item, found.layer) || found.item.page !== this.viewPage) {
      this.updateCursor();
      return;
    }
    const circle = radiusCircle(found.item);
    const point =
      found.item.kind === "length"
        ? closestPointOnPolyline(found.item.points, page, false)
        : found.item.kind === "area"
          ? closestPointOnPolyline(
              areaOutline(found.item.points, areaShapeOf(found.item)),
              page,
              true,
            )
          : found.item.kind === "arc"
            ? closestPointOnPolyline(arcPolyline(found.item), page, false)
            : circle
              ? closestPointOnPolyline(circlePolyline(circle.center, circle.radius), page, true)
              : found.item.points[0];
    if (!point) {
      this.updateCursor();
      return;
    }
    store.mutate((project) => {
      const target = findItem(project, connect.itemId)?.item;
      if (!target) return;
      target.labelAnchor = { ...point };
      target.updatedAt = new Date().toISOString();
    }, "change");
    toast(t("canvas.connectionUpdated"), "success");
    this.updateCursor();
    this.drawInteraction();
  }

  private measurementLabelHit(screen: Point): LabelHit | null {
    const project = store.project;
    if (!project) return null;
    const layouts = this.pageLabelLayouts();
    for (let l = project.layers.length - 1; l >= 0; l--) {
      const layer = project.layers[l];
      if (!layerVisibleOnPage(layer, this.viewPage) || layer.opacity <= 0) continue;
      for (let i = layer.items.length - 1; i >= 0; i--) {
        const item = layer.items[i];
        if (item.page !== this.viewPage || !itemIsVisible(item, layer)) continue;
        if (!isMeasurementKind(item.kind)) continue;
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

  private createItem(
    kind: ItemKind,
    points: Point[],
    options: {
      text?: string;
      areaShape?: AreaShape;
      highlightShape?: "stroke" | "rectangle" | "polygon";
      symbolId?: string;
      status?: InspectionStatus;
    } = {},
  ): { layerId: string; itemId: string } | null {
    const project = store.project;
    if (!project) return null;
    const layerKind = layerKindForItem(kind);
    const active = project.layers.find(
      (layer) => layer.id === project.activeLayerId && layer.kind === layerKind,
    );
    if (
      active &&
      (!layerVisibleOnPage(active, this.viewPage) || layerLockedOnPage(active, this.viewPage))
    ) {
      toast(
        t("canvas.layerUnavailable", {
          name: active.name,
          state: layerLockedOnPage(active, this.viewPage)
            ? t("canvas.stateLocked")
            : t("canvas.stateHidden"),
        }),
        "warning",
      );
      return null;
    }
    const projectPage = this.viewPage;
    let layerId = "";
    let itemId = "";
    const scale = pageScale(project, projectPage);
    store.mutate((project) => {
      const layer = ensureActiveLayer(project, layerKind, this.viewPage);
      const now = new Date().toISOString();
      const style = store.ui.style;
      const isMeasure = layerKind === "measure";
      const category = isMeasure
        ? measurementCategory(project, store.ui.measureCategoryId)
        : undefined;
      const highlightShape =
        kind === "highlight" ? (options.highlightShape ?? "stroke") : undefined;
      const shapeLike = kind === "rect" || kind === "ellipse";
      const filledShape = !isMeasure && shapeLike && style.shapeFill === "filled";
      const filled =
        !isMeasure &&
        (filledShape ||
          kind === "stamp" ||
          kind === "delta" ||
          (kind === "highlight" && highlightShape !== "stroke"));
      const textLike =
        kind === "text" ||
        kind === "textbox" ||
        kind === "cloud" ||
        kind === "callout" ||
        kind === "stamp" ||
        kind === "delta";
      const cloudPreset = kind === "cloud" ? cloudFillColor(store.ui.cloudFill) : null;
      const lineLike = kind === "polyline" || kind === "line";
      const lineStyle = lineLike ? store.ui.lineStyle : undefined;
      const item: MarkupItem = {
        id: makeId("item"),
        page: projectPage,
        kind,
        points: points.map((p) => ({ ...p })),
        color: isMeasure
          ? layer.color
          : kind === "textbox"
            ? "#1a2024"
            : lineLike
              ? (lineStyle?.color ?? style.color)
              : kind === "rail"
                ? "#4a4a4a"
                : kind === "symbol"
                  ? symbolCategoryColor(symbolCategoryOf(options.symbolId ?? store.ui.symbolId))
                  : kind === "stamp"
                    ? stampStatusColor(options.text ?? store.ui.stampText, style.color)
                    : (cloudPreset ?? style.color),
        strokeWidth: isMeasure
          ? DEFAULT_MEASUREMENT_STROKE_WIDTH
          : lineLike
            ? (lineStyle?.widthPt ?? style.strokeWidth)
            : kind === "rail"
              ? 0.6
              : style.strokeWidth,
        fillColor: cloudPreset ?? (filled ? style.color : undefined),
        opacity:
          !isMeasure &&
          (filledShape ||
            kind === "stamp" ||
            kind === "delta" ||
            cloudPreset !== null ||
            (kind === "highlight" && highlightShape !== "stroke"))
            ? kind === "highlight"
              ? Math.max(0.18, style.fillOpacity)
              : kind === "cloud"
                ? CLOUD_FILL_OPACITY
                : style.fillOpacity
            : kind === "highlight"
              ? 0.35
              : undefined,
        text: options.text,
        textColor: kind === "textbox" ? "#1a2024" : undefined,
        padding: kind === "textbox" ? 4 : undefined,
        lineTypeId: kind === "polyline" ? store.ui.lineTypeId : undefined,
        lineStyle:
          (lineLike && lineStyle?.dashed) || (shapeLike && style.dashed) ? "dashed" : undefined,
        rows: kind === "rail" ? defaultRailRows("plc") : undefined,
        rowSpacing: kind === "rail" ? RAIL_ROW_SPACING : undefined,
        fontSize: textLike ? style.fontSize : undefined,
        highlightShape,
        arrowHeads: kind === "arrow" ? store.ui.arrowHeads : undefined,
        scale: isMeasure && scale ? { ...scale } : null,
        categoryId: category?.id,
        room: isMeasure ? normalizeRoom(store.ui.measureRoom) : undefined,
        depth: kind === "volume" ? 1 : undefined,
        areaMode: kind === "area" ? store.ui.measureAreaMode : undefined,
        areaShape:
          kind === "area" || kind === "volume" ? (options.areaShape ?? "polygon") : undefined,
        countType: kind === "count" ? store.ui.measureCountType : undefined,
        countQuantity:
          kind === "count" && store.ui.measureCountQuantity > 1
            ? store.ui.measureCountQuantity
            : undefined,
        symbolId: kind === "symbol" ? (options.symbolId ?? store.ui.symbolId) : undefined,
        symbolSize:
          kind === "symbol" ? symbolDefaultSize(options.symbolId ?? store.ui.symbolId) : undefined,
        status: kind === "symbol" ? options.status : undefined,
        createdAt: now,
        updatedAt: now,
      };
      addItem(project, layer.id, item);
      layerId = layer.id;
      itemId = item.id;
    }, "change");
    if (!layerId || !itemId) return null;
    store.setSelection({ layerId, itemId });
    return { layerId, itemId };
  }

  /** Asks for the depth that turns a newly drawn or double-clicked volume into m³. */
  private promptVolumeDepth(itemRef: { layerId: string; itemId: string } | null): void {
    const project = store.project;
    if (!itemRef || !project) return;
    const found = findItem(project, itemRef.itemId);
    if (!found || found.item.kind !== "volume") return;
    void depthDialog(project.settings.lengthUnit, found.item.depth ?? 1).then((depth) => {
      if (depth === null) return;
      const value = Math.max(0.001, Math.min(1_000_000, depth));
      store.mutate((current) => {
        const target = findItem(current, itemRef.itemId)?.item;
        if (!target || target.kind !== "volume") return;
        target.depth = value;
        target.updatedAt = new Date().toISOString();
      }, "change");
    });
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
    const simplified = simplifyPolyline(points, 0.8 / this.viewZoom);
    this.createItem(kind, simplified);
    this.drawInteraction();
  }

  private finishShape(): void {
    if (
      !this.draft ||
      (this.draft.kind !== "line" &&
        this.draft.kind !== "arrow" &&
        this.draft.kind !== "rect" &&
        this.draft.kind !== "textbox" &&
        this.draft.kind !== "rail" &&
        this.draft.kind !== "ellipse" &&
        this.draft.kind !== "highlight-rect")
    ) {
      return;
    }
    const { kind, start, current } = this.draft;
    this.draft = null;
    this.snap = null;
    if (distance(start, current) < 3 / this.viewZoom) {
      this.drawInteraction();
      return;
    }
    if (kind === "highlight-rect") {
      this.createItem("highlight", [start, current], { highlightShape: "rectangle" });
    } else if (kind === "textbox") {
      const created = this.createItem("textbox", [start, current], { text: "" });
      const project = store.project;
      const found = created && project ? findItem(project, created.itemId) : undefined;
      if (found) this.editors.startTextBoxEdit(found.item, found.layer);
    } else if (kind === "rail") {
      this.createItem("rail", [start, current]);
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
    if (distance(start, current) < 3 / this.viewZoom) {
      this.drawInteraction();
      return;
    }
    this.createCallout(start, current);
  }

  private createCallout(start: Point, current: Point): void {
    const content = t("kind.callout");
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
    const created = this.createItem("callout", [start, center], { text: content });
    if (created && store.project) {
      const found = findItem(store.project, created.itemId);
      if (found) this.editors.startCalloutTextEdit(found.item, found.layer);
    }
    this.drawInteraction();
  }

  private async editItemText(item: MarkupItem): Promise<void> {
    const title =
      item.kind === "stamp"
        ? t("canvas.editStampText")
        : item.kind === "delta"
          ? t("canvas.editDelta")
          : item.kind === "cloud"
            ? t("canvas.cloudText")
            : t("canvas.editCallout");
    const text = await textDialog(title, t("canvas.onlyThisItem"), item.text ?? "", "", true);
    if (text === null) return;
    store.mutate((project) => {
      const target = findItem(project, item.id)?.item;
      if (target) {
        target.text =
          text.trim() ||
          (target.kind === "stamp"
            ? t("tool.stamp")
            : target.kind === "callout"
              ? t("kind.callout")
              : "");
        if (target.kind === "stamp") {
          target.color = stampStatusColor(target.text, target.color);
        }
        target.updatedAt = new Date().toISOString();
      }
    }, "change");
  }

  private finishQuickArea(): void {
    if (!this.draft || (this.draft.kind !== "area-rect" && this.draft.kind !== "area-ellipse")) {
      return;
    }
    const shape: AreaShape = this.draft.kind === "area-rect" ? "rectangle" : "ellipse";
    const { start, current } = this.draft;
    this.draft = null;
    this.snap = null;
    if (distance(start, current) < 3 / this.viewZoom) {
      this.drawInteraction();
      return;
    }
    this.createItem("area", [start, current], { areaShape: shape });
    this.drawInteraction();
  }

  public finishDraft(): void {
    if (this.crop.active) {
      this.crop.confirm();
      return;
    }
    if (!this.draft) return;
    if (
      this.draft.kind === "radius" ||
      this.draft.kind === "diameter" ||
      this.draft.kind === "arc" ||
      this.draft.kind === "angle" ||
      this.draft.kind === "slope"
    ) {
      const kind = this.draft.kind;
      const points = dedupeLast(this.draft.points);
      const minimum = kind === "arc" || kind === "angle" ? 3 : 2;
      this.draft = null;
      this.snap = null;
      if (points.length >= minimum) {
        const selected = points.slice(0, minimum);
        const preview = { kind, points: selected } as MarkupItem;
        if (kind !== "arc" || arcGeometry(preview)) this.createItem(kind, selected);
        else toast(t("canvas.thirdPoint"), "warning");
      } else {
        toast(t("canvas.remainingPoints"), "warning");
      }
      this.drawInteraction();
      return;
    }

    if (this.draft.kind === "polyline") {
      const points = dedupeLast(this.draft.points);
      this.draft = null;
      this.snap = null;
      if (points.length >= 2) this.createItem("polyline", points);
      this.drawInteraction();
      return;
    }

    if (this.draft.kind === "area-rect" || this.draft.kind === "area-ellipse") {
      this.finishQuickArea();
    } else if (
      this.draft.kind === "length" ||
      this.draft.kind === "area" ||
      this.draft.kind === "volume" ||
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
        toast(t("canvas.minThreePoints"), "warning");
        return;
      }
      this.draft = null;
      this.snap = null;
      if (kind === "cloud") {
        const created = this.createItem("cloud", points, {
          text: store.ui.cloudText ? t("reference.revision") : undefined,
        });
        if (created && store.ui.cloudText && store.project) {
          const found = findItem(store.project, created.itemId);
          if (found) this.editors.startCloudTextEdit(found.item, found.layer);
        }
      } else if (kind === "highlight-polygon") {
        this.createItem("highlight", points, { highlightShape: "polygon" });
      } else {
        const created = this.createItem(kind, points);
        if (kind === "volume") this.promptVolumeDepth(created);
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
      this.draft.kind === "textbox" ||
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
      this.draft.kind === "textbox" ||
      this.draft.kind === "rail" ||
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
    if (this.crop.active) {
      this.crop.cancel();
      return;
    }
    if (this.labelConnect) {
      this.labelConnect = null;
      this.updateCursor();
      this.drawInteraction();
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
      toast(t("canvas.selectedLocked"), "warning");
      return;
    }
    let deleted = 0;
    store.mutate((project) => {
      deleted = deleteItems(project, store.ui.selection).changed;
    }, "change");
    if (deleted < resolved.length) {
      toast(t("canvas.itemsDeleted", { count: deleted }), "info");
    }
    store.clearSelection();
  }

  public nudgeSelection(dx: number, dy: number): void {
    const project = store.project;
    if (!project || !store.ui.selection.length) return;
    const movable = resolveSelection(project, store.ui.selection).filter((entry) => !entry.locked);
    if (!movable.length) return;
    store.mutate((project) => {
      translateItems(project, store.ui.selection, dx, dy);
    }, "change");
  }

  private schedulePdfRender(): void {
    if (!this.hooks.getRenderer()) return;
    const bounds = this.host.getBoundingClientRect();
    if (bounds.width < 2 || bounds.height < 2) return;
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      void this.renderPdf();
    }, 90);
  }

  private async renderPdf(): Promise<void> {
    const renderer = this.hooks.getRenderer();
    const size = this.pageSize();
    if (!renderer || !size) return;
    const bounds = this.host.getBoundingClientRect();
    if (bounds.width < 2 || bounds.height < 2) return;
    const page = this.viewPage;
    const crop = cropRectForView(
      size,
      this.viewZoom,
      this.viewPanX,
      this.viewPanY,
      this.width,
      this.height,
      70,
    );
    const generation = ++this.renderGeneration;
    this.rendering = true;
    this.loading.classList.add("is-visible");
    try {
      const result = await renderer.renderCrop(page, crop, this.viewZoom * this.dpr);
      if (generation !== this.renderGeneration) return;
      if (page !== this.viewPage) return;
      this.lastRender = result;
      this.drawBase();
    } catch (error) {
      if (isCancellation(error)) return;
      if (generation === this.renderGeneration) {
        this.hooks.onError?.(t("canvas.renderPageFailed", { error: describeError(error) }));
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
    const project = this.sceneProject;
    const size = this.pageSize();
    if (!size) return;
    const { zoom, panX, panY } = this.view;
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

    if (this.lastRender && this.lastRender.pageNumber === this.viewPage) {
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

    if (project?.settings.showGrid) {
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
    const project = this.sceneProject;
    if (!project) return;
    const size = this.pageSize();
    if (!size) return;
    const page = this.viewPage;
    const labels = this.pageLabelLayouts();

    // Background images sit above the PDF but below every markup layer.
    for (const layer of project.layers) {
      if (!layerVisibleOnPage(layer, page) || layer.opacity <= 0) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      for (const item of layer.items) {
        if (item.page !== page || !itemIsVisible(item, layer) || item.kind !== "image") continue;
        if (imageModeOf(item) !== "background") continue;
        drawItem(ctx, item, labels, this.itemRenderContext());
      }
      ctx.restore();
    }

    this.drawSheetFields(ctx);

    for (const layer of project.layers) {
      if (!layerVisibleOnPage(layer, page) || layer.opacity <= 0) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      for (const item of layer.items) {
        if (item.page !== page || !itemIsVisible(item, layer)) continue;
        if (item.kind === "image" && imageModeOf(item) === "background") continue;
        drawItem(ctx, item, labels, this.itemRenderContext());
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

  /** Draws template field values above the PDF page and below every item. */
  private drawSheetFields(ctx: CanvasRenderingContext2D): void {
    const project = this.sceneProject;
    if (!project) return;
    const sheetDocument = templateDocumentForPage(project, this.viewPage);
    if (!sheetDocument?.template) return;
    const spec = sheetTemplateFor(
      sheetDocument.template.id,
      sheetDocument.template.paper,
      resolveSheetLabels((key) => t(key)),
    );
    if (!spec) return;

    const zoom = this.viewZoom;
    ctx.save();
    ctx.fillStyle = "#000000";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    for (const field of spec.fields) {
      const value = sheetDocument.template.fields[field.id] ?? "";
      if (!value) continue;
      const lines = layoutFieldLines(field, value, measureSheetText);
      for (const line of lines) {
        if (!line.text) continue;
        const point = this.toScreen({ x: line.x, y: line.baseline });
        ctx.font = `${line.size * zoom}px ${SHEET_FONT_STACK}`;
        ctx.fillText(line.text, point.x, point.y);
      }
    }
    ctx.restore();
  }

  /** Opens an inline editor when a double-click lands on an empty sheet cell. */
  private editSheetFieldAt(pageNumber: number, screen: Point): boolean {
    const project = store.project;
    if (!project) return false;
    const sheetDocument = templateDocumentForPage(project, pageNumber);
    if (!sheetDocument?.template) return false;
    const spec = sheetTemplateFor(
      sheetDocument.template.id,
      sheetDocument.template.paper,
      resolveSheetLabels((key) => t(key)),
    );
    if (!spec) return false;

    const pagePoint = this.toPage(screen);
    const field = spec.fields.find(
      (candidate) =>
        pagePoint.x >= candidate.rect.x &&
        pagePoint.x <= candidate.rect.x + candidate.rect.width &&
        pagePoint.y >= candidate.rect.y &&
        pagePoint.y <= candidate.rect.y + candidate.rect.height,
    );
    if (!field) return false;

    const start = this.toScreen({ x: field.rect.x, y: field.rect.y });
    const end = this.toScreen({
      x: field.rect.x + field.rect.width,
      y: field.rect.y + field.rect.height,
    });
    const zoom = this.viewZoom;
    const multiline = (field.maxLines ?? 1) > 1;
    const input: HTMLInputElement | HTMLTextAreaElement = multiline
      ? document.createElement("textarea")
      : document.createElement("input");
    if (input instanceof HTMLInputElement) input.type = "text";
    input.className = "sheet-field-input";
    input.value = sheetDocument.template.fields[field.id] ?? "";
    if (field.id === SHEET_FIELD.details) {
      input.placeholder = t("sheet.field.detailsPlaceholder");
    }
    input.maxLength = 500;
    input.style.position = "absolute";
    input.style.left = `${start.x}px`;
    input.style.top = `${start.y}px`;
    input.style.width = `${Math.max(24, end.x - start.x)}px`;
    input.style.height = `${Math.max(16, end.y - start.y)}px`;
    input.style.boxSizing = "border-box";
    input.style.fontFamily = SHEET_FONT_STACK;
    input.style.fontSize = `${Math.max(7, field.fontSize * zoom)}px`;
    input.style.fontWeight = field.bold ? "700" : "400";
    input.style.textAlign = field.align;
    input.style.padding = `0 ${field.padding * zoom}px`;
    input.style.lineHeight = `${Math.max(1, field.fontSize * 1.18 * zoom)}px`;
    input.style.whiteSpace = "pre-wrap";
    input.style.resize = "none";
    input.style.overflow = "auto";
    input.style.background = "#ffffff";
    input.style.color = "#111111";
    input.style.caretColor = "#111111";
    input.style.border = "1px solid #2b7fff";
    input.style.outline = "none";
    input.style.boxShadow = "0 0 0 2px rgba(43, 127, 255, 0.25)";
    input.style.zIndex = "20";

    this.commitSheetField(false);
    this.sheetFieldEditor = { input, page: pageNumber, fieldId: field.id };
    this.host.append(input);
    input.focus();
    input.select();

    input.addEventListener("pointerdown", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      const keyEvent = event as KeyboardEvent;
      keyEvent.stopPropagation();
      if (keyEvent.key === "Enter" && (keyEvent.ctrlKey || keyEvent.metaKey || !multiline)) {
        keyEvent.preventDefault();
        this.commitSheetField(true);
      } else if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        this.commitSheetField(false);
      }
    });
    input.addEventListener("blur", () => this.commitSheetField(true));
    return true;
  }

  private commitSheetField(save: boolean): void {
    const editor = this.sheetFieldEditor;
    if (!editor) return;
    this.sheetFieldEditor = null;
    editor.input.remove();
    if (!save) return;
    const project = store.project;
    if (!project || store.ui.page !== editor.page) return;
    const value = editor.input.value;
    store.mutate((current) => {
      const sheetDocument = templateDocumentForPage(current, editor.page);
      if (sheetDocument?.template) sheetDocument.template.fields[editor.fieldId] = value;
    }, "change");
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

  private drawLabelLayout(ctx: CanvasRenderingContext2D, layout: LabelLayout): void {
    paintLabelLayout(
      ctx,
      layout,
      (point) => this.toScreen(point),
      () => this.viewZoom,
      (box, metrics) => this.screenLabelBox(box, metrics),
    );
  }

  private interactionRenderContext(): InteractionRenderContext {
    return {
      readOnly: this.readOnly,
      page: this.viewPage,
      zoom: this.viewZoom,
      toScreen: (point) => this.toScreen(point),
      prepare: (ctx) => this.prepare(ctx),
      cropDraw: (ctx) => this.crop.draw(ctx),
      drawDraft: (ctx) => this.drawDraft(ctx),
      labelResizePoint: (item) => this.labelResizePoint(item),
      hoverLabelResize: this.hoverLabelResize,
      searchHits: this.searchHits,
      marquee: this.marquee,
      draft: this.draft,
      snap: this.snap,
      pointerScreen: this.pointerScreen,
      dragActive: Boolean(this.drag),
      panActive: Boolean(this.pan),
    };
  }

  private itemRenderContext(): ItemRenderContext {
    return {
      zoom: this.viewZoom,
      project: this.sceneProject,
      toScreen: (point) => this.toScreen(point),
      imageElement: (asset) => this.imageElement(asset),
      screenLabelBox: (box, metrics) => this.screenLabelBox(box, metrics),
      editors: {
        editingItemId: this.editors.editingItemId,
        editingLabelId: this.editors.editingLabelId,
        textSession: this.editors.textSession,
      },
    };
  }

  private drawInteraction(): void {
    paintInteraction(this.interactionCtx, this.interactionRenderContext());
  }

  private drawDraft(ctx: CanvasRenderingContext2D): void {
    if (!this.draft || !store.project) return;
    paintDraft(ctx, {
      draft: this.draft,
      project: store.project,
      viewPage: this.viewPage,
      zoom: this.viewZoom,
      pageSize: this.pageSize(),
      toScreen: (point) => this.toScreen(point),
      style: store.ui.style,
      cloudFill: store.ui.cloudFill,
      arrowHeads: store.ui.arrowHeads,
      paintLabel: (layout) => this.drawLabelLayout(ctx, layout),
    });
  }

  /** Dev-only bridge used by Playwright; the production UI never calls it. */
  getTestApi(): CanvasTestApi {
    return {
      pageToScreen: (point) => this.toScreen(point),
      screenToPage: (point) => this.toPage(point),
      pageSize: () => this.pageSize(),
      selectionHandles: (itemId) => {
        const project = store.project;
        const found = project ? findItem(project, itemId) : undefined;
        return found ? selectionHandles(found.item, (point) => this.toScreen(point)) : null;
      },
      labelScreenPoint: (itemId) => {
        const layout = this.pageLabelLayouts().get(itemId);
        if (!layout) return null;
        const box = this.screenLabelBox(layout.box, layout.metrics);
        return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      },
      labelResizeScreenPoint: (itemId) => {
        const project = store.project;
        const found = project ? findItem(project, itemId) : undefined;
        return found && isMeasurementKind(found.item.kind)
          ? this.labelResizePoint(found.item)
          : null;
      },
      snapTarget: () =>
        this.snap ? { kind: this.snap.kind, point: { ...this.snap.point } } : null,
      draftKind: () => this.draft?.kind ?? null,
      searchHighlights: () => this.searchHits,
      annotationScreenPoint: (itemId) => {
        const project = store.project;
        const found = project ? findItem(project, itemId) : undefined;
        if (!found) return null;
        if (found.item.kind === "callout") return this.toScreen(calloutLayout(found.item).center);
        if (found.item.kind === "cloud") {
          const label = cloudLabelLayout(found.item);
          return label ? this.toScreen(label.center) : null;
        }
        return null;
      },
    };
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
    this.crop.destroy();
    this.observer.disconnect();
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    this.commitSheetField(false);
    this.editors.destroy();
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

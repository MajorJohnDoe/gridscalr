import { distance, itemBounds, type Bounds } from "../model/geometry";
import { COUNT_SYMBOL_RADIUS } from "../model/countSymbols";
import { hitTest } from "../model/hitTest";
import type { LabelBox, LabelMetrics } from "../model/label";

import {
  CALIBRATION_LABEL_ID,
  layoutPageLabels,
  pageLabelSources,
  type LabelLayout,
} from "../model/labelLayout";
import { ensureLabelFonts, measureLabelText } from "../model/labelFont";
import {
  findItem,
  isMeasurementKind,
  itemIsLocked,
  itemIsVisible,
  layerVisibleOnPage,
} from "../model/layers";
import { buildLayerHierarchy } from "../model/layerHierarchy";
import { deleteItems, translateItems } from "../model/commands";

import { focusViewTransform, isCancellation, pointInBox } from "./geometry";
import { CropController } from "./crop";
import { PointerController } from "./pointer/PointerController";
import { createItemInStore, type ItemOptions } from "./pointer/itemFactory";
import { DraftLifecycle } from "./pointer/draft";
import { capturePointer, localFromClient } from "./pointer/primitives";
import type { PointerHost } from "./pointer/PointerHost";
import { CALIBRATION_COLOR, drawDraft as paintDraft } from "./draftRenderer";
import { drawLabelLayout as paintLabelLayout } from "./annotationDraw";
import { CanvasEditorController, type LabelHit } from "./editors";
import { type ItemRenderContext } from "./itemRenderer";
import { drawVisibleItems } from "./items/visible";
import { selectionHandles, type Handle } from "./selectionHandles";

import {
  drawInteraction as paintInteraction,
  type InteractionRenderContext,
} from "./interactionRenderer";
import type { NormalizedCrop } from "../model/export";
import { pageIdAt } from "../model/pages";
import { resolveSelection } from "../model/selection";
import {
  createCalibration,
  isReferenceCalibration,
  pageCalibration,
  pageScaleLocked,
  setPageCalibration,
} from "../model/calibration";
import {
  collectSnapCandidates,
  excludeOwnSnapTargets,
  findSnap,
  type SnapCandidate,
  type SnapKind,
  type SnapResult,
} from "../model/snap";
import { TEXT_FONT_STACK } from "../model/text";
import {
  SHEET_FIELD,
  SHEET_FONT_STACK,
  layoutFieldLines,
  measureSheetText,
  openRailDialog,
  resolveSheetLabels,
  sheetTemplateFor,
  templateDocumentForPage,
} from "../features/schematics";
import { calloutLayout, cloudLabelLayout } from "../model/annotations";
import type { ImageAsset, ItemKind, MarkupItem, PageSize, Point, Project } from "../model/types";
import { formatNumber } from "../model/units";
import { cropRectForView, type PdfRenderer, type RenderResult } from "../pdf/pdfRenderer";
import { store } from "../state/store";
import {
  clampZoom,
  fitPageViewport,
  viewportCenter,
  visiblePageBounds,
  type Viewport,
} from "./viewport";
import {
  pageToScreen as toScreenPoint,
  screenToPage as toPagePoint,
  zoomAt as zoomViewport,
} from "./viewport";
import { calibrationDialog } from "../ui/dialogs";
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
/**
 * Screen-space margin added to the culling rectangle so labels, leaders and
 * symbol tags that start outside the viewport still draw while they cross it.
 */
const VIEW_CULL_MARGIN = 120;

function orthoPoint(last: Point, current: Point): Point {
  return Math.abs(current.x - last.x) >= Math.abs(current.y - last.y)
    ? { x: current.x, y: last.y }
    : { x: last.x, y: current.y };
}

/** Tools whose next click can land on an existing snap target. */
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
  private drafts: DraftLifecycle;
  private pointers: PointerController;
  private snap: SnapResult | null = null;
  private snapCache: { revision: number; pageId: string; candidates: SnapCandidate[] } | null =
    null;
  private searchHits: {
    page: number;
    rects: Array<{ x: number; y: number; width: number; height: number }>;
  } | null = null;
  private renderedPage = 0;
  private editors: CanvasEditorController;
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
        this.drafts.setDraft(null);
        this.pointers.cancelDrag();
        this.pointers.cancelPanAndMarquee();
        this.pointers.clearHover();
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

    this.drafts = new DraftLifecycle({
      viewPage: () => this.viewPage,
      viewZoom: () => this.viewZoom,
      pageSize: () => this.pageSize(),
      drawInteraction: () => this.drawInteraction(),
      clearSnap: () => {
        this.snap = null;
      },
      createItem: (kind, points, options) => this.createItem(kind, points, options),
      startTextBoxEdit: (item, layer) => this.editors.startTextBoxEdit(item, layer),
      startCalloutTextEdit: (item, layer) => this.editors.startCalloutTextEdit(item, layer),
      startCloudTextEdit: (item, layer) => this.editors.startCloudTextEdit(item, layer),
      cropActive: () => this.crop.active,
      cropCancel: () => this.crop.cancel(),
      cropConfirm: () => this.crop.confirm(),
      labelConnectActive: () => this.pointers.labelConnectActive,
      cancelLabelConnection: () => this.pointers.cancelLabelConnection(),
      updateCursor: () => this.updateCursor(),
    });

    const pointerHost: PointerHost = {
      isReadOnly: () => this.readOnly,
      isViewOnly: () => store.readOnly,
      viewport: () => this.view,
      cropActive: () => this.crop.active,
      cropCursor: () => this.crop.cursor(),
      draft: () => this.drafts.draft,
      setDraft: (draft) => this.drafts.setDraft(draft),
      setHostCursor: (cursor) => {
        if (cursor) this.host.dataset.cursor = cursor;
        else delete this.host.dataset.cursor;
      },
      drawContent: () => this.drawContent(),
      drawInteraction: () => this.drawInteraction(),
      clearHover: () => this.pointers.clearHover(),
      snapPoint: (point, excludeItemId) => this.snapPoint(point, excludeItemId),
      snapPolylinePoint: (point) => this.snapPolylinePoint(point),
      constrainPolyline: (last, point, free) => this.constrainPolyline(last, point, free),
      clearSnap: () => {
        this.snap = null;
      },
      viewZoom: () => this.viewZoom,
      finishDraft: () => this.drafts.finishDraft(),
      finishCallout: (page) => this.drafts.finishCallout(page),
      createItem: (kind, points, options) => this.createItem(kind, points, options),
      runCalibration: (p1, p2) => this.runCalibration(p1, p2),
      startTextTool: (page) => this.startTextTool(page),
      cancelDraft: () => this.cancelDraft(),
      commitEditors: () => this.editors.commitActiveEditors(),
      focusCanvas: () => this.interaction.focus({ preventScroll: true }),
      cropPointerDown: (page, event) => this.crop.pointerDown(page, event),
      cropPointerMove: (page) => this.crop.pointerMove(page),
      cropPointerUp: () => this.crop.pointerUp(),
      cropPointerLeave: () => this.crop.pointerLeave(),
      finishPen: () => this.drafts.finishPen(),
      finishQuickArea: () => this.drafts.finishQuickArea(),
      finishShape: () => this.drafts.finishShape(),
      labelResizeAt: (item, screen) => this.labelResizeAt(item, screen),
      pageLabelLayouts: () => this.pageLabelLayouts(),
      toScreen: (point) => this.toScreen(point),
      touchNavigationBlocked: () => this.pointers.touchBlocked,
      activeTool: () => store.ui.activeTool,
      viewPage: () => this.viewPage,
      viewPageId: () => this.viewPageId,
      toPage: (screen) => this.toPage(screen),
      calibrationLabelHit: (screen) => this.calibrationLabelHit(screen),
      editCalibration: () => this.editCalibration(),
      measurementLabelHit: (screen) => this.measurementLabelHit(screen),
      isLocked: (item, layer) => itemIsLocked(item, layer),
      selectItem: (layerId, itemId) => store.setSelection({ layerId, itemId }),
      promptVolumeDepth: (ref) => this.drafts.promptVolumeDepth(ref),
      startLabelEdit: (hit) => this.editors.startLabelEdit(hit),
      editSheetFieldAt: (page, screen) => {
        this.editSheetFieldAt(page, screen);
      },
      startTextEdit: (item, layer) => this.editors.startTextEdit(item, layer),
      startTextBoxEdit: (item, layer) => this.editors.startTextBoxEdit(item, layer),
      editRail: (item) => {
        void openRailDialog(item.id);
      },
      startCloudTextEdit: (item, layer) => this.editors.startCloudTextEdit(item, layer),
      startCalloutTextEdit: (item, layer) => this.editors.startCalloutTextEdit(item, layer),
      editItemText: (item) => this.drafts.editItemText(item),
      zoomAt: (screen, factor) => this.zoomAt(screen, factor),
      cancelGesture: () => {
        this.pointers.cancelDrag();
        this.pointers.cancelMarquee();
        store.cancelGesture();
      },
      openContextMenu: (clientX, clientY) => {
        const page = this.toPage(this.localFromClient(clientX, clientY));
        this.hooks.onContextMenu?.({ page, clientX, clientY });
      },
    };
    this.pointers = new PointerController(this.interaction, pointerHost);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);

    this.pointers.attach();

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

  private get viewPageId(): string | null {
    return this.sceneProject ? pageIdAt(this.sceneProject, this.viewPage) : null;
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

  /** The reference pane never edits, and a view-only session has no editors. */
  private get editingDisabled(): boolean {
    return this.options.readOnly === true || store.readOnly;
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
    if (reason === "save" && store.readOnly) {
      // Losing the lease mid-gesture must not leave a draft or editor open.
      this.drafts.setDraft(null);
      this.pointers.cancelDrag();
      this.pointers.cancelMarquee();
      this.pointers.cancelLabelConnection();
      this.commitSheetField(false);
      this.editors.cancelActiveEditors();
    }
    this.editors.handleStoreChange(reason);
    const page = this.viewPage;
    if (reason === "project" || reason === "undo") {
      this.lastRender = null;
      this.drafts.setDraft(null);
      this.pointers.cancelDrag();
      this.pointers.cancelMarquee();
      this.pointers.cancelLabelConnection();
      this.snap = null;
      this.renderedPage = page;
    }
    if (reason === "project") {
      this.imageCache.clear();
      this.imageLoading.clear();
      this.imageFailed.clear();
    }
    if (reason === "tool") {
      this.drafts.setDraft(null);
      this.pointers.cancelLabelConnection();
      this.snap = null;
      if (store.ui.hover) store.setHover(null);
      this.updateCursor();
    }
    if (page !== this.renderedPage) {
      this.lastRender = null;
      this.drafts.setDraft(null);
      this.pointers.cancelLabelConnection();
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
    this.pointers.setSpaceDown(down);
    this.updateCursor();
  }

  get isBusy(): boolean {
    return (
      this.pointers.dragActive ||
      this.pointers.marqueeActive ||
      this.pointers.panActive ||
      this.drafts.draft !== null ||
      this.pointers.labelConnectActive ||
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

  private localFromClient(clientX: number, clientY: number): Point {
    return localFromClient(this.interaction, clientX, clientY);
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
    return layoutPageLabels(pageLabelSources(project, this.viewPageId ?? ""), {
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
    this.pointers.updateCursor();
  }

  private capturePointer(pointerId: number): void {
    capturePointer(this.interaction, pointerId);
  }

  private snapCandidates(): readonly SnapCandidate[] {
    const project = store.project;
    if (!project) return [];
    if (
      !this.snapCache ||
      this.snapCache.revision !== store.revision ||
      this.snapCache.pageId !== this.viewPageId
    ) {
      this.snapCache = {
        revision: store.revision,
        pageId: this.viewPageId ?? "",
        candidates: this.viewPageId ? collectSnapCandidates(project, this.viewPageId) : [],
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
    if (this.editingDisabled) return;
    const project = store.project;
    if (!project) return;
    const page = this.viewPage;
    const pageId = this.viewPageId;
    if (!pageId) return;
    if (pageScaleLocked(project, pageId)) {
      this.drafts.setDraft(null);
      toast(t("canvas.scaleLockedCalibrate"), "warning");
      this.drawInteraction();
      return;
    }
    const pagesAffected = project.layers.some(
      (layer) => layer.kind === "measure" && layer.items.some((item) => item.pageId === pageId),
    );
    const result = await calibrationDialog({
      defaultUnit: project.settings.lengthUnit,
      hasMeasurements: pagesAffected,
      pageCount: project.pages.length,
      currentPage: page,
    });
    if (!result) {
      this.drawInteraction();
      return;
    }
    const calibration = createCalibration(p1, p2, result.knownLength, result.unit);
    let changed: string[] = [];
    store.mutate((project) => {
      changed = setPageCalibration(project, pageId, calibration, {
        applyToAll: result.applyToAll,
        updateMeasurements: result.updateMeasurements,
      });
    }, "change");
    if (!changed.length) {
      toast(t("canvas.noUnlockedCalibration"), "warning");
      this.drawInteraction();
      return;
    }
    store.setTool("select");
    const lockedSkipped = result.applyToAll ? project.pages.length - changed.length : 0;
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
    const pageId = this.viewPageId;
    if (!pageId) return;
    const calibration = pageCalibration(project, pageId);
    if (!calibration) return;
    if (pageScaleLocked(project, pageId)) {
      toast(t("canvas.scaleLockedEdit"), "warning");
      return;
    }
    if (!isReferenceCalibration(calibration)) {
      toast(t("canvas.manualScaleUse"), "info");
      return;
    }
    const pagesAffected = project.layers.some(
      (layer) => layer.kind === "measure" && layer.items.some((item) => item.pageId === pageId),
    );
    const result = await calibrationDialog({
      mode: "edit",
      defaultUnit: calibration.unit,
      initialKnownLength: calibration.knownLength,
      initialUnit: calibration.unit,
      hasMeasurements: pagesAffected,
      pageCount: project.pages.length,
      currentPage: page,
    });
    if (!result) return;
    const next = createCalibration(calibration.p1, calibration.p2, result.knownLength, result.unit);
    store.mutate((project) => {
      setPageCalibration(project, pageId, next, {
        applyToAll: false,
        updateMeasurements: result.updateMeasurements,
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
    if (this.editingDisabled) return;
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
      void this.drafts.editItemText(found.item);
      return;
    }
    toast(t("canvas.selectText"), "info");
  }

  private measurementLabelHit(screen: Point): LabelHit | null {
    const project = store.project;
    if (!project) return null;
    const layouts = this.pageLabelLayouts();
    const hierarchy = buildLayerHierarchy(project.layers);
    for (let l = project.layers.length - 1; l >= 0; l--) {
      const layer = project.layers[l];
      if (!layerVisibleOnPage(layer, this.viewPageId ?? "", hierarchy) || layer.opacity <= 0)
        continue;
      for (let i = layer.items.length - 1; i >= 0; i--) {
        const item = layer.items[i];
        if (item.pageId !== this.viewPageId || !itemIsVisible(item, layer, hierarchy)) continue;
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

  private startTextTool(page: Point): void {
    if (this.editingDisabled) return;
    const project = store.project;
    if (!project) return;
    // hitTest already excludes hidden and locked layers, an inherited lock included.
    const hit = hitTest(project, this.viewPageId ?? "", page, 7 / this.viewZoom);
    if (hit?.item.kind === "text") {
      store.setSelection({ layerId: hit.layer.id, itemId: hit.item.id });
      this.editors.startTextEdit(hit.item, hit.layer);
    } else {
      this.editors.startNewText(page);
    }
  }

  private createItem(
    kind: ItemKind,
    points: Point[],
    options: ItemOptions = {},
  ): { layerId: string; itemId: string } | null {
    return createItemInStore(kind, points, options, this.viewPageId ?? "");
  }

  public finishDraft(): void {
    this.drafts.finishDraft();
  }

  public removeLastPoint(): boolean {
    return this.drafts.removeLastPoint();
  }

  public cancelDraft(): void {
    this.drafts.cancelDraft();
  }

  public deleteSelection(): void {
    if (this.editingDisabled) return;
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
    if (this.editingDisabled) return;
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
    const pageId = this.viewPageId;
    const labels = this.pageLabelLayouts();
    const visible = visiblePageBounds(this.view, this.width, this.height, VIEW_CULL_MARGIN);
    const renderContext = this.itemRenderContext();

    // Background images sit above the PDF but below every markup layer.
    drawVisibleItems(ctx, project, pageId ?? "", labels, renderContext, visible, true);

    this.drawSheetFields(ctx);

    drawVisibleItems(ctx, project, pageId ?? "", labels, renderContext, visible, false);

    if (project.settings.showCalibration) {
      const calibration = pageCalibration(project, pageId);
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
      readOnly: this.editingDisabled,
      page: this.viewPage,
      zoom: this.viewZoom,
      toScreen: (point) => this.toScreen(point),
      prepare: (ctx) => this.prepare(ctx),
      cropDraw: (ctx) => this.crop.draw(ctx),
      drawDraft: (ctx) => this.drawDraft(ctx),
      labelResizePoint: (item) => this.labelResizePoint(item),
      hoverLabelResize: this.pointers.hoverLabelResize,
      searchHits: this.searchHits,
      marquee: this.pointers.marqueeState,
      draft: this.drafts.draft,
      snap: this.snap,
      pointerScreen: this.pointers.pointerScreen,
      dragActive: this.pointers.dragActive,
      panActive: this.pointers.panActive,
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
    if (!this.drafts.draft || !store.project) return;
    paintDraft(ctx, {
      draft: this.drafts.draft,
      project: store.project,
      viewPage: this.viewPage,
      viewPageId: this.viewPageId,
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
      draftKind: () => this.drafts.draft?.kind ?? null,
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
    this.pointers.detach();
  }
}

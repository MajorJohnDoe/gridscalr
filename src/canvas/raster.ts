/**
 * The primary canvas raster controller: one place that schedules a PDF render,
 * chooses the tile cache or the full-page fallback, and keeps the generation
 * guard. `CanvasView` only forwards its viewport, draws `current`, and asks for
 * `rendering` and tile statistics.
 *
 * Read-only canvases (the split reference pane, comparison and the reference
 * source) never use the tile cache; they keep the pre-tile `renderCrop()` path.
 */

import { perfMark, perfSpanAsync } from "../features/perfMonitor";
import {
  DisplayLevelController,
  levelIndexFor,
  levelIsSharpEnough,
  levelPixels,
  levelScaleFor,
  type DisplayLevel,
  type DisplayLevelStats,
  type LevelRequest,
} from "../features/displayLevels";
import {
  TileCacheController,
  type TileCacheStats,
  type TileRect,
  type TileRenderSource,
} from "../features/tileCache";
import type { PageSize } from "../model/types";
import { cropRectForView, type PdfRenderer, type RenderResult } from "../pdf/pdfRenderer";
import { isCancellation } from "./geometry";

export interface CanvasRasterHost {
  renderer(): PdfRenderer | null;
  pageSize(): PageSize | undefined;
  page(): number;
  pageId(): string | null;
  zoom(): number;
  panX(): number;
  panY(): number;
  dpr(): number;
  width(): number;
  height(): number;
  bounds(): DOMRect;
  loading(): HTMLElement;
  drawBase(): void;
  /** True while the pointer is mid-pan, so an expensive raster can wait. */
  gestureActive?: () => boolean;
  /** Identity of the loaded document set, so a replaced source cannot hit a stale level. */
  contentKey?: () => string;
  onError(error: unknown): void;
}

/**
 * Screen-space margin around the viewport. A pan shorter than this stays inside
 * the rendered crop, so it costs one blit instead of a full PDF.js render.
 */
const CROP_MARGIN = 300;
/** Coalescing window for a single view change outside a gesture. */
const COALESCE_MS = 90;
/** Shortest delay before a scheduled raster, so a burst shares one render. */
const MIN_WAIT_MS = 16;
/**
 * During a gesture a raster may start no sooner than this after the last one.
 * A coalescing timer alone is reset by every wheel event, so a held scroll would
 * otherwise render nothing until it stopped and the newly exposed strip would
 * stay empty for the whole gesture.
 */
const GESTURE_MIN_INTERVAL_MS = 220;
/**
 * ... and no later than this, so an expensive page still fills while the
 * gesture runs instead of waiting for the release.
 */
const GESTURE_MAX_INTERVAL_MS = 600;
/** A gesture-time raster is spaced at this multiple of its own measured cost. */
const GESTURE_COST_FACTOR = 1.5;
/**
 * PDF.js re-walks the page operator list for every tile, so on a dense drawing
 * a tile can cost as much as a whole crop. When the first tile is this slow the
 * tiled path is abandoned for the full-crop render, which walks the list once.
 */
const TILE_COST_LIMIT_MS = 30;
/** The coarse pass runs at this fraction of the exact device scale. */
const COARSE_SCALE_FACTOR = 0.45;

/** True when `raster` covers `view` (both in page units) with a small slack. */
export function rasterCovers(
  raster: { rect: { x: number; y: number; width: number; height: number } } | null,
  view: { x: number; y: number; width: number; height: number },
): boolean {
  if (!raster) return false;
  const rect = raster.rect;
  const slack = 0.5;
  return (
    rect.x <= view.x + slack &&
    rect.y <= view.y + slack &&
    rect.x + rect.width >= view.x + view.width - slack &&
    rect.y + rect.height >= view.y + view.height - slack
  );
}

/** The page and pixel density a raster was rendered for. */
export interface RenderedView {
  page: number;
  zoom: number;
  dpr: number;
}

/**
 * The part of the viewport that lies over the page, in page units. Clamping to
 * the page matters: at the fit view the viewport is wider than the drawing, and
 * the empty margin beside the sheet must not count as uncovered content.
 */
export function visiblePageRect(
  pageSize: PageSize,
  zoom: number,
  panX: number,
  panY: number,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  if (!Number.isFinite(zoom) || zoom <= 0) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.max(0, -panX / zoom);
  const top = Math.max(0, -panY / zoom);
  const right = Math.min(pageSize.width, (width - panX) / zoom);
  const bottom = Math.min(pageSize.height, (height - panY) / zoom);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * True when the raster on screen already describes this view: same page, same
 * zoom and pixel density, and a crop that contains the whole visible page area.
 * Panning inside the crop then needs one `drawImage`, not a PDF.js render.
 */
export function rasterMatchesView(
  raster: RenderResult | null,
  rendered: RenderedView | null,
  page: number,
  zoom: number,
  dpr: number,
  view: { x: number; y: number; width: number; height: number },
): boolean {
  if (!raster || !rendered) return false;
  if (rendered.page !== page || rendered.zoom !== zoom || rendered.dpr !== dpr) return false;
  if (raster.pageNumber !== page) return false;
  return rasterCovers(raster, view);
}

/**
 * Raster cadence during a gesture: proportional to the last measured cost, so a
 * 46 ms page fills every 220 ms and a 400 ms page every 600 ms, instead of a
 * binary "cheap pages render, expensive pages wait for the release" rule.
 */
export function gestureCadenceMs(lastCostMs: number): number {
  const cost = Number.isFinite(lastCostMs) && lastCostMs > 0 ? lastCostMs : 0;
  return Math.round(
    Math.min(
      GESTURE_MAX_INTERVAL_MS,
      Math.max(GESTURE_MIN_INTERVAL_MS, cost * GESTURE_COST_FACTOR),
    ),
  );
}

/**
 * How long to wait before starting the next raster. During a gesture the
 * measured-cost interval applies; the first schedule after the gesture settles
 * renders at once; an ordinary view change coalesces a burst.
 */
export function cadenceWaitMs(input: {
  gesture: boolean;
  settle: boolean;
  lastCostMs: number;
  overdueMs: number;
}): number {
  const overdue = Number.isFinite(input.overdueMs) ? Math.max(0, input.overdueMs) : 0;
  if (input.gesture) return Math.max(MIN_WAIT_MS, gestureCadenceMs(input.lastCostMs) - overdue);
  if (input.settle) return MIN_WAIT_MS;
  return Math.max(MIN_WAIT_MS, COALESCE_MS - overdue);
}

/** Draws a whole-page level bitmap with the current view. */
export function drawLevelBitmap(
  ctx: CanvasRenderingContext2D,
  level: DisplayLevel,
  view: { zoom: number; panX: number; panY: number },
): void {
  ctx.drawImage(
    level.canvas,
    view.panX,
    view.panY,
    level.pageSize.width * view.zoom,
    level.pageSize.height * view.zoom,
  );
}

/**
 * The raster that stays visible underneath a partial tile composition. Without
 * it a new crop replaces the base canvas before its first tile exists, so the
 * whole drawing blanks and redraws on every zoom step and on every pan past the
 * crop margin. The backdrop is drawn with the current pan and zoom, so the old
 * drawing still moves with the gesture while the new tiles fill in on top.
 */
export function backdropFor(
  previous: RenderResult | null,
  current: RenderResult | null,
  page: number,
): RenderResult | null {
  if (!previous || previous === current) return null;
  if (previous.pageNumber !== page) return null;
  return previous;
}

export class CanvasRasterController {
  private rasterValue: RenderResult | null = null;
  private renderedView: RenderedView | null = null;
  private backdropValue: RenderResult | null = null;
  private coarsePending = false;
  private pending: RenderResult | null = null;
  private pendingView: RenderedView | null = null;
  private generation = 0;
  private timer: number | null = null;
  private lastRenderAt = 0;
  private lastCostMs = 0;
  private gestureAtLastSchedule = false;
  private tilesDisabled = false;
  private busyValue = false;
  private useTiles: boolean;
  private readonly tiles: TileCacheController | null;
  private readonly levels: DisplayLevelController | null;

  constructor(
    private readonly host: CanvasRasterHost,
    options: { tiled: boolean; levels?: boolean },
  ) {
    this.useTiles = options.tiled;
    this.levels =
      options.levels === false
        ? null
        : new DisplayLevelController(
            { renderPageLevel: (pageNumber, scale) => this.renderPageLevel(pageNumber, scale) },
            { onLevel: () => this.host.drawBase() },
          );
    if (!options.tiled) {
      this.tiles = null;
      return;
    }
    const source: TileRenderSource = {
      renderTile: (pageNumber, rect, scale) => {
        const renderer = this.host.renderer();
        if (!renderer) throw new Error("renderer-unavailable");
        return renderer.renderTileCanvas(pageNumber, rect, scale);
      },
    };
    this.tiles = new TileCacheController({
      source,
      onProgress: (completed) => {
        const tileCost = this.tiles?.stats().firstTileMs ?? 0;
        if (!this.tilesDisabled && completed === 1 && tileCost > TILE_COST_LIMIT_MS) {
          // One tile already costs what a whole crop would: stop tiling.
          this.tilesDisabled = true;
          this.pending = null;
          this.pendingView = null;
          this.tiles?.cancel();
          this.busyValue = false;
          void this.renderNow();
          return;
        }
        const pending = this.pending;
        if (pending && this.rasterValue !== pending) {
          this.rasterValue = pending;
          this.renderedView = this.pendingView;
          this.pending = null;
          this.pendingView = null;
        }
        if (completed > 0) this.hideLoading();
        this.busyValue = this.tiles?.busy ?? false;
        this.host.drawBase();
      },
      onComplete: () => {
        if (this.pending) {
          this.rasterValue = this.pending;
          this.renderedView = this.pendingView;
          this.pending = null;
          this.pendingView = null;
        }
        this.backdropValue = null;
        this.busyValue = false;
        this.hideLoading();
        this.host.drawBase();
      },
      onError: (error) => this.fallback(error),
    });
  }

  /** The raster the base canvas draws. Its pixels may still be filling in. */
  get current(): RenderResult | null {
    return this.rasterValue;
  }

  /** The previous complete raster, kept visible while a new crop fills in. */
  get backdrop(): RenderResult | null {
    return this.backdropValue;
  }

  get rendering(): boolean {
    return this.busyValue;
  }

  /**
   * Schedules the next raster. A view that the raster on screen still covers is
   * skipped entirely: `drawBase` already paints that raster at the new pan, so a
   * PDF.js render would buy nothing and cost a stall. Otherwise the wait follows
   * the cost-aware cadence: the measured-cost interval during a gesture, an
   * immediate render once the gesture settles, and a short coalescing window for
   * an ordinary view change.
   */
  schedule(): void {
    if (!this.host.renderer()) return;
    const bounds = this.host.bounds();
    if (bounds.width < 2 || bounds.height < 2) return;
    const gesture = this.host.gestureActive?.() === true;
    const page = this.host.page();
    const zoom = this.host.zoom();
    const dpr = this.host.dpr();
    if (this.covers(page, zoom, dpr)) {
      this.clearTimer();
      this.gestureAtLastSchedule = gesture;
      // The settled view is already sharp; cache its whole-page level for the
      // next pan or zoom-back while the canvas is idle.
      this.requestLevel(gesture);
      return;
    }
    if (this.levelCovers(zoom, dpr)) {
      this.clearTimer();
      this.gestureAtLastSchedule = gesture;
      return;
    }
    const wait = cadenceWaitMs({
      gesture,
      settle: this.gestureAtLastSchedule && !gesture,
      lastCostMs: this.lastCostMs,
      overdueMs: performance.now() - this.lastRenderAt,
    });
    this.gestureAtLastSchedule = gesture;
    this.clearTimer();
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.renderNow();
    }, wait);
  }

  /** Drops the current raster and cancels queued tiles without changing the page. */
  reset(): void {
    this.generation += 1;
    this.rasterValue = null;
    this.renderedView = null;
    this.backdropValue = null;
    this.pending = null;
    this.pendingView = null;
    this.busyValue = false;
    this.gestureAtLastSchedule = false;
    this.clearTimer();
    this.tiles?.cancel();
    this.hideLoading();
  }

  tileStats(): TileCacheStats | null {
    return this.tiles?.stats() ?? null;
  }

  levelStats(): DisplayLevelStats | null {
    return this.levels?.stats() ?? null;
  }

  /**
   * The whole-page level to draw under the exact crop. Null when the exact
   * raster already covers the visible page area, so a settled view draws the
   * same single image it did before levels existed.
   */
  underlay(): DisplayLevel | null {
    if (!this.levels) return null;
    const request = this.levelRequest();
    if (!request) return null;
    if (this.covers(request.page, this.host.zoom(), this.host.dpr())) return null;
    return this.levels.peek(request);
  }

  dispose(): void {
    this.reset();
    this.tiles?.dispose();
    this.levels?.dispose();
  }

  /**
   * The level request for the current page and view. Null when there is no
   * page, or when this octave's whole page does not fit the level caps: a level
   * that cannot reach the view's own scale would only be an underlay, and the
   * exact crop plus the coarse pass already cover that case.
   */
  private levelRequest(): LevelRequest | null {
    const size = this.host.pageSize();
    const pageId = this.host.pageId();
    if (!size || !pageId) return null;
    const scale = this.host.zoom() * this.host.dpr();
    const index = levelIndexFor(scale);
    const pageSize = { width: size.width, height: size.height };
    const pixels = levelPixels(pageSize, levelScaleFor(index));
    if (pixels.scale + 1e-9 < levelScaleFor(index)) return null;
    return {
      contentKey: this.host.contentKey?.() ?? "",
      pageId,
      page: this.host.page(),
      pageSize,
      scale,
    };
  }

  /** Starts (or joins) the whole-page build for the current view when idle. */
  private requestLevel(gesture: boolean): void {
    if (!this.levels || gesture) return;
    const request = this.levelRequest();
    if (request) this.levels.ensure(request, { build: true });
  }

  /**
   * True when a cached whole-page level is at least as sharp as this view would
   * render, so blitting it is already the exact output and a PDF.js render would
   * only repeat the same pixels. The level is never built from here.
   */
  private levelCovers(zoom: number, dpr: number): boolean {
    if (!this.levels) return false;
    const request = this.levelRequest();
    if (!request) return false;
    const level = this.levels.ensure(request, { build: false });
    return !!level && levelIsSharpEnough(level.scale, zoom * dpr);
  }

  /**
   * True when the raster on screen was rendered for the current page, zoom and
   * density, so it is sharp at this view. A raster from another zoom is only a
   * backdrop; once a level is drawn under it, that backdrop would make the
   * settled image softer than the level itself.
   */
  currentAccurate(): boolean {
    const rendered = this.renderedView;
    return (
      !!rendered &&
      !!this.rasterValue &&
      rendered.page === this.host.page() &&
      rendered.zoom === this.host.zoom() &&
      rendered.dpr === this.host.dpr()
    );
  }

  /** True when the raster on screen already describes the current view. */
  private covers(page: number, zoom: number, dpr: number): boolean {
    const size = this.host.pageSize();
    if (!size) return false;
    const visible = visiblePageRect(
      size,
      zoom,
      this.host.panX(),
      this.host.panY(),
      this.host.width(),
      this.host.height(),
    );
    return rasterMatchesView(this.rasterValue, this.renderedView, page, zoom, dpr, visible);
  }

  private async renderNow(): Promise<void> {
    const renderer = this.host.renderer();
    const size = this.host.pageSize();
    const bounds = this.host.bounds();
    if (!renderer || !size || bounds.width < 2 || bounds.height < 2) return;
    const page = this.host.page();
    const pageId = this.host.pageId();
    const zoom = this.host.zoom();
    const dpr = this.host.dpr();
    const panX = this.host.panX();
    const panY = this.host.panY();
    const width = this.host.width();
    const height = this.host.height();
    if (this.covers(page, zoom, dpr)) {
      // The view is already inside the rendered crop. `drawBase` paints that
      // raster at the new pan, so re-rendering would only add a stall.
      return;
    }
    if (this.levelCovers(zoom, dpr)) return;
    this.lastRenderAt = performance.now();
    const crop = cropRectForView(size, zoom, panX, panY, width, height, CROP_MARGIN);
    const view: RenderedView = { page, zoom, dpr };
    const generation = ++this.generation;
    // Keep the raster that is on screen now visible underneath the new one.
    if (this.rasterValue) this.backdropValue = this.rasterValue;
    this.ensureCoarse(page, crop, zoom, dpr, generation);

    if (this.useTiles && !this.tilesDisabled && this.tiles && pageId) {
      const tiles = this.renderTiles(page, pageId, zoom, dpr, width, height, crop);
      if (tiles) {
        const busy = this.tiles.busy;
        this.busyValue = busy;
        if (!busy) {
          this.rasterValue = tiles;
          this.renderedView = view;
          this.pending = null;
          this.pendingView = null;
          this.backdropValue = null;
          this.hideLoading();
          this.host.drawBase();
          return;
        }
        this.pending = tiles;
        this.pendingView = view;
        if (!this.rasterValue) {
          this.showLoading();
          this.host.drawBase();
        }
        return;
      }
    }

    this.busyValue = true;
    this.showLoading();
    const startedAt = performance.now();
    let painted = false;
    try {
      const result = await perfSpanAsync("pdf-raster", () =>
        renderer.renderCrop(page, crop, zoom * dpr),
      );
      this.lastCostMs = performance.now() - startedAt;
      perfMark("raster");
      if (generation !== this.generation || page !== this.host.page()) return;
      this.rasterValue = result;
      this.renderedView = view;
      this.backdropValue = null;
      this.host.drawBase();
      painted = true;
    } catch (error) {
      if (isCancellation(error)) return;
      if (generation === this.generation) this.host.onError(error);
    } finally {
      if (generation === this.generation) {
        this.busyValue = false;
        this.hideLoading();
        // The sharp raster is on screen; cache the whole-page level for the
        // next pan or zoom-back. A gesture in flight keeps its frames free of it.
        if (painted) this.requestLevel(this.host.gestureActive?.() === true);
      }
    }
  }

  private renderTiles(
    page: number,
    pageId: string,
    zoom: number,
    dpr: number,
    width: number,
    height: number,
    crop: TileRect,
  ): RenderResult | null {
    const tiles = this.tiles;
    if (!tiles) return null;
    const scale = Math.max(0.05, zoom * dpr);
    const visible: TileRect = {
      x: (-this.host.panX() / zoom - crop.x) * scale,
      y: (-this.host.panY() / zoom - crop.y) * scale,
      width: (width / zoom) * scale,
      height: (height / zoom) * scale,
    };
    return tiles.render({ pageId, pageNumber: page, zoom, dpr, crop, visible });
  }

  /**
   * When the previous raster does not cover the new view (a zoom out or a large
   * jump), render the crop once at a fraction of the exact scale and keep it
   * under the tiles. It is a few milliseconds of work and turns a blank sheet
   * into a soft copy of the drawing that sharpens as the tiles arrive.
   */
  private ensureCoarse(
    page: number,
    crop: TileRect,
    zoom: number,
    dpr: number,
    generation: number,
  ): void {
    if (this.coarsePending) return;
    const visible = {
      x: -this.host.panX() / zoom,
      y: -this.host.panY() / zoom,
      width: this.host.width() / zoom,
      height: this.host.height() / zoom,
    };
    if (rasterCovers(this.rasterValue, visible)) return;
    const renderer = this.host.renderer();
    if (!renderer) return;
    this.coarsePending = true;
    const startedAt = performance.now();
    const scale = Math.max(0.05, zoom * dpr * COARSE_SCALE_FACTOR);
    void perfSpanAsync("pdf-raster", () => renderer.renderCrop(page, crop, scale))
      .then((result) => {
        this.lastCostMs = Math.max(this.lastCostMs, performance.now() - startedAt);
        if (generation !== this.generation || this.host.page() !== page) return;
        if (!this.busyValue) return;
        this.backdropValue = result;
        this.host.drawBase();
      })
      .catch(() => undefined)
      .finally(() => {
        this.coarsePending = false;
      });
  }

  private fallback(error: unknown): void {
    this.useTiles = false;
    this.pending = null;
    this.tiles?.cancel();
    this.busyValue = false;
    this.hideLoading();
    this.host.onError(error);
    void this.renderNow();
  }

  /** Renders one whole page for the level cache through the shared renderer. */
  private async renderPageLevel(
    pageNumber: number,
    scale: number,
  ): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
    const renderer = this.host.renderer();
    if (!renderer) throw new Error("renderer-unavailable");
    return renderer.renderPageLevel(pageNumber, scale);
  }

  private showLoading(): void {
    this.host.loading().classList.add("is-visible");
  }

  private hideLoading(): void {
    this.host.loading().classList.remove("is-visible");
  }

  private clearTimer(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }
}

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
  onError(error: unknown): void;
}

const CROP_MARGIN = 70;
/** Coalescing window for a single view change. */
const COALESCE_MS = 90;
/**
 * A view that keeps changing still rasterises this often. A coalescing timer
 * alone is reset by every wheel event, so a held scroll rendered nothing until
 * it stopped and the newly exposed strip stayed empty for the whole gesture.
 */
const CONTINUOUS_RENDER_MS = 140;
/** A raster that costs this much must not be re-run at the fastest cadence. */
const MAX_CADENCE_COST_MS = 400;
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
  private backdropValue: RenderResult | null = null;
  private coarsePending = false;
  private pending: RenderResult | null = null;
  private generation = 0;
  private timer: number | null = null;
  private lastRenderAt = 0;
  private lastCostMs = 0;
  private tilesDisabled = false;
  private busyValue = false;
  private useTiles: boolean;
  private readonly tiles: TileCacheController | null;

  constructor(
    private readonly host: CanvasRasterHost,
    options: { tiled: boolean },
  ) {
    this.useTiles = options.tiled;
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
          this.tiles?.cancel();
          this.busyValue = false;
          void this.renderNow();
          return;
        }
        const pending = this.pending;
        if (pending && this.rasterValue !== pending) {
          this.rasterValue = pending;
          this.pending = null;
        }
        if (completed > 0) this.hideLoading();
        this.busyValue = this.tiles?.busy ?? false;
        this.host.drawBase();
      },
      onComplete: () => {
        if (this.pending) {
          this.rasterValue = this.pending;
          this.pending = null;
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

  /** A page whose last raster cost more than a couple of frames. */
  private get expensive(): boolean {
    return this.lastCostMs > 60;
  }

  /**
   * Coalesces a burst of view changes, but never postpones the raster for more
   * than `CONTINUOUS_RENDER_MS`. During a held scroll that keeps a steady
   * cadence of renders, and each one only needs the newly exposed edge because
   * the tiles are anchored to the page.
   */
  schedule(): void {
    if (!this.host.renderer()) return;
    const bounds = this.host.bounds();
    if (bounds.width < 2 || bounds.height < 2) return;
    const now = performance.now();
    const overdue = now - this.lastRenderAt;
    const interval = Math.min(
      MAX_CADENCE_COST_MS,
      Math.max(CONTINUOUS_RENDER_MS, Math.round(this.lastCostMs * 1.5)),
    );
    // On an expensive page a render started mid-drag is thrown away a frame
    // later and costs the user a visible stall, so it waits for the gesture.
    const defer = this.expensive && this.host.gestureActive?.() === true;
    const wait = defer ? 200 : Math.max(16, Math.min(COALESCE_MS, interval - overdue));
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      if (this.expensive && this.host.gestureActive?.() === true) {
        this.schedule();
        return;
      }
      void this.renderNow();
    }, wait);
  }

  /** Drops the current raster and cancels queued tiles without changing the page. */
  reset(): void {
    this.generation += 1;
    this.rasterValue = null;
    this.backdropValue = null;
    this.pending = null;
    this.busyValue = false;
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.tiles?.cancel();
    this.hideLoading();
  }

  tileStats(): TileCacheStats | null {
    return this.tiles?.stats() ?? null;
  }

  dispose(): void {
    this.reset();
    this.tiles?.dispose();
  }

  private async renderNow(): Promise<void> {
    this.lastRenderAt = performance.now();
    const renderer = this.host.renderer();
    const size = this.host.pageSize();
    const bounds = this.host.bounds();
    if (!renderer || !size || bounds.width < 2 || bounds.height < 2) return;
    const page = this.host.page();
    const pageId = this.host.pageId();
    const zoom = this.host.zoom();
    const dpr = this.host.dpr();
    const width = this.host.width();
    const height = this.host.height();
    const crop = cropRectForView(
      size,
      zoom,
      this.host.panX(),
      this.host.panY(),
      width,
      height,
      CROP_MARGIN,
    );
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
          this.pending = null;
          this.backdropValue = null;
          this.hideLoading();
          this.host.drawBase();
          return;
        }
        this.pending = tiles;
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
    try {
      const result = await perfSpanAsync("pdf-raster", () =>
        renderer.renderCrop(page, crop, zoom * dpr),
      );
      this.lastCostMs = performance.now() - startedAt;
      perfMark("raster");
      if (generation !== this.generation || page !== this.host.page()) return;
      this.rasterValue = result;
      this.backdropValue = null;
      this.host.drawBase();
    } catch (error) {
      if (isCancellation(error)) return;
      if (generation === this.generation) this.host.onError(error);
    } finally {
      if (generation === this.generation) {
        this.busyValue = false;
        this.hideLoading();
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

  private showLoading(): void {
    this.host.loading().classList.add("is-visible");
  }

  private hideLoading(): void {
    this.host.loading().classList.remove("is-visible");
  }
}

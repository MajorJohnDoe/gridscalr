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
  onError(error: unknown): void;
}

const CROP_MARGIN = 70;

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
  private underlayValue: RenderResult | null = null;
  private underlayPending = false;
  private pending: RenderResult | null = null;
  private generation = 0;
  private timer: number | null = null;
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

  /**
   * A coarse whole-page raster drawn beneath everything else, so an area that
   * has never been rendered (for example after zooming out) shows the drawing
   * immediately instead of an empty sheet.
   */
  get underlay(): RenderResult | null {
    return this.underlayValue;
  }

  get rendering(): boolean {
    return this.busyValue;
  }

  /** Same 90 ms coalescing window the pre-tile canvas used. */
  schedule(): void {
    if (!this.host.renderer()) return;
    const bounds = this.host.bounds();
    if (bounds.width < 2 || bounds.height < 2) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.renderNow();
    }, 90);
  }

  /** Drops the current raster and cancels queued tiles without changing the page. */
  reset(): void {
    this.generation += 1;
    this.rasterValue = null;
    this.backdropValue = null;
    this.underlayValue = null;
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
    this.ensureUnderlay(page, size);
    // Keep the raster that is on screen now visible underneath the new one.
    if (this.rasterValue) this.backdropValue = this.rasterValue;

    if (this.useTiles && this.tiles && pageId) {
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
    try {
      const result = await perfSpanAsync("pdf-raster", () =>
        renderer.renderCrop(page, crop, zoom * dpr),
      );
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
   * Renders one coarse full-page bitmap per page and keeps it for the lifetime
   * of that page. It is about 384 px on the long side, so the cost is one small
   * raster and the result is stretched behind the exact tiles.
   */
  private ensureUnderlay(page: number, size: PageSize): void {
    if (this.underlayValue?.pageNumber === page || this.underlayPending) return;
    const renderer = this.host.renderer();
    if (!renderer) return;
    this.underlayPending = true;
    const scale = 384 / Math.max(size.width, size.height, 1);
    void perfSpanAsync("pdf-raster", () =>
      renderer.renderCrop(page, { x: 0, y: 0, width: size.width, height: size.height }, scale),
    )
      .then((result) => {
        this.underlayPending = false;
        if (this.host.page() !== page) return;
        this.underlayValue = result;
        this.host.drawBase();
      })
      .catch(() => {
        this.underlayPending = false;
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

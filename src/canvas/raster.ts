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
  renderScaleFor,
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

export class CanvasRasterController {
  private rasterValue: RenderResult | null = null;
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

    if (this.useTiles && this.tiles && pageId) {
      const tiles = this.renderTiles(page, pageId, zoom, dpr, width, height, crop);
      if (tiles) {
        const busy = this.tiles.busy;
        this.busyValue = busy;
        if (!busy) {
          this.rasterValue = tiles;
          this.pending = null;
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
    const scale = renderScaleFor(crop, zoom * dpr);
    const visible: TileRect = {
      x: (-this.host.panX() / zoom - crop.x) * scale,
      y: (-this.host.panY() / zoom - crop.y) * scale,
      width: (width / zoom) * scale,
      height: (height / zoom) * scale,
    };
    return tiles.render({ pageId, pageNumber: page, zoom, dpr, crop, visible });
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

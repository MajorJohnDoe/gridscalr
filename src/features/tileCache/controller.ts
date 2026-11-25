/**
 * The tile cache controller: a visible-first render queue, cancellation on a
 * new scene, zoom or page, `createImageBitmap` with a canvas fallback, and a
 * byte-bounded cache evicted by distance from the viewport.
 *
 * The controller owns a full-size composition canvas. Each completed tile is
 * painted into it at its integer device-pixel origin, so the host can keep
 * drawing the same `RenderResult` shape it used for the single-crop render. The
 * host never waits for every tile: the first visible tile is painted as soon as
 * it exists.
 */

import { perfSpan, perfSpanAsync } from "../perfMonitor";
import {
  TILE_CACHE_BUDGET_BYTES,
  buildTilePlan,
  selectEvictions,
  supportsTileCache,
  tileByteSize,
  tileKey,
  visibleFirstOrder,
  type TileCacheEntryMeta,
  type TileCacheStats,
  type TilePlan,
  type TilePlanInput,
  type TileRect,
  type PlannedTile,
} from "./model";

export interface TileRenderTask {
  promise: Promise<HTMLCanvasElement>;
  cancel(): void;
}

/** The host adapter renders one page-space rect; CanvasView maps it to PdfRenderer. */
export interface TileRenderSource {
  renderTile(pageNumber: number, rect: TileRect, scale: number): TileRenderTask;
}

export interface TileCacheHost {
  source: TileRenderSource;
  /** Called after the first and every painted tile, in visible-first order. */
  onProgress?(completed: number, total: number): void;
  onComplete?(): void;
  onError?(error: unknown): void;
}

export interface TileRaster {
  pageNumber: number;
  rect: TileRect;
  canvas: HTMLCanvasElement;
  renderScale: number;
}

type TileImage = ImageBitmap | HTMLCanvasElement;

interface CacheEntry extends TileCacheEntryMeta {
  image: TileImage;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function isCancellation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  return name === "RenderingCancelledException" || name === "AbortError";
}

function closeImage(image: TileImage): void {
  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    try {
      image.close();
    } catch {
      // A closed bitmap has nothing left to release.
    }
  }
}

export class TileCacheController {
  private readonly budget: number;
  private readonly supported: boolean;
  private readonly entries = new Map<string, CacheEntry>();
  private bytes = 0;
  private clock = 0;
  private epoch = 0;
  private plan: TilePlan | null = null;
  private composition: HTMLCanvasElement | null = null;
  private queue: PlannedTile[] = [];
  private current: TileRenderTask | null = null;
  private completed = 0;
  private misses = 0;
  private hits = 0;
  private firstTileMs: number | null = null;
  private startedAt = 0;

  constructor(
    private readonly host: TileCacheHost,
    options: { budget?: number; supported?: boolean } = {},
  ) {
    this.budget = Math.max(0, options.budget ?? TILE_CACHE_BUDGET_BYTES);
    this.supported = options.supported ?? supportsTileCache();
  }

  get isSupported(): boolean {
    return this.supported;
  }

  /** True while at least one tile for the current view is still queued. */
  get busy(): boolean {
    return this.queue.length > 0 || this.current !== null;
  }

  /**
   * Starts a tiled render for `input`. Returns a composition raster the host
   * can draw immediately (possibly empty), or null when the host must use the
   * full-page path.
   */
  render(input: TilePlanInput): TileRaster | null {
    if (!this.supported) return null;
    const plan = buildTilePlan(input);
    if (!plan.tiles.length) return null;

    this.cancelWork();
    this.plan = plan;
    this.startedAt = now();
    this.firstTileMs = null;
    this.completed = 0;
    this.hits = 0;
    this.misses = 0;
    // Reuse the composition surface instead of allocating a new canvas on
    // every render. At a held-pan cadence a fresh canvas per step churned tens
    // of megabytes per second and produced 150-280 ms garbage-collection stalls
    // on an otherwise tiny project.
    if (!this.composition) this.composition = document.createElement("canvas");
    if (this.composition.width !== plan.width || this.composition.height !== plan.height) {
      this.composition.width = plan.width;
      this.composition.height = plan.height;
    } else {
      this.composition.getContext("2d")?.clearRect(0, 0, plan.width, plan.height);
    }

    const missing: PlannedTile[] = [];
    for (const tile of plan.tiles) {
      const key = tileKey(plan, tile);
      const entry = this.entries.get(key);
      if (!entry) {
        missing.push(tile);
        continue;
      }
      entry.lastUsed = ++this.clock;
      this.hits += 1;
      perfSpan("tile-cache-hit", () => undefined);
      this.compose(entry.image, tile);
    }
    this.completed = this.hits;
    if (!missing.length) {
      this.firstTileMs = 0;
      return this.raster(plan);
    }

    this.misses = missing.length;
    this.queue = visibleFirstOrder(missing);
    this.evict(plan);
    void this.pump();
    return this.raster(plan);
  }

  /** Cancels queued and in-flight tiles; cached tiles stay for a return visit. */
  cancel(): void {
    this.cancelWork();
  }

  stats(): TileCacheStats {
    return {
      supported: this.supported,
      bytes: this.bytes,
      budgetBytes: this.budget,
      tiles: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      firstTileMs: this.firstTileMs,
    };
  }

  dispose(): void {
    this.cancelWork();
    for (const entry of this.entries.values()) closeImage(entry.image);
    this.entries.clear();
    this.bytes = 0;
    this.composition = null;
    this.plan = null;
  }

  private raster(plan: TilePlan): TileRaster {
    return {
      pageNumber: plan.pageNumber,
      rect: { ...plan.crop },
      canvas: this.composition!,
      renderScale: plan.scale,
    };
  }

  private cancelWork(): void {
    this.epoch += 1;
    this.queue = [];
    if (this.current) {
      try {
        this.current.cancel();
      } catch {
        // The render may already have settled.
      }
      this.current = null;
    }
  }

  private async pump(): Promise<void> {
    const epoch = this.epoch;
    let failed = false;
    try {
      while (this.queue.length && !failed) {
        if (epoch !== this.epoch) return;
        const plan = this.plan;
        const tile = this.queue.shift();
        if (!plan || !tile) break;
        let canvas: HTMLCanvasElement;
        try {
          const task = this.host.source.renderTile(plan.pageNumber, tile.rect, plan.scale);
          this.current = task;
          canvas = await perfSpanAsync("tile-render", () => task.promise);
        } catch (error) {
          this.current = null;
          if (epoch !== this.epoch || isCancellation(error)) return;
          failed = true;
          this.host.onError?.(error);
          return;
        }
        this.current = null;
        if (epoch !== this.epoch) return;
        this.compose(canvas, tile);
        if (this.firstTileMs === null) this.firstTileMs = now() - this.startedAt;
        this.host.onProgress?.(this.completed + 1, plan.tiles.length);
        const image = await this.toImage(canvas);
        if (epoch !== this.epoch) {
          closeImage(image);
          return;
        }
        this.store(tile, image);
        this.completed += 1;
        this.evict(plan);
      }
    } finally {
      if (!failed && epoch === this.epoch) this.host.onComplete?.();
    }
  }

  private async toImage(canvas: HTMLCanvasElement): Promise<TileImage> {
    try {
      if (typeof createImageBitmap === "function") return await createImageBitmap(canvas);
    } catch {
      // The canvas itself is a valid cached image when conversion fails.
    }
    return canvas;
  }

  private compose(image: TileImage, tile: PlannedTile): void {
    const context = this.composition?.getContext("2d");
    if (!context) return;
    context.drawImage(image, tile.x, tile.y);
  }

  private store(tile: PlannedTile, image: TileImage): void {
    const plan = this.plan;
    if (!plan) return;
    const key = tileKey(plan, tile);
    const previous = this.entries.get(key);
    if (previous) this.bytes -= previous.bytes;
    const bytes = tileByteSize(tile.width, tile.height);
    this.entries.set(key, {
      key,
      image,
      bytes,
      rect: { x: tile.x, y: tile.y, width: tile.width, height: tile.height },
      lastUsed: ++this.clock,
      bucket: plan.bucket,
    });
    this.bytes += bytes;
  }

  private evict(plan: TilePlan): void {
    if (this.bytes <= this.budget) return;
    const keep = new Set(plan.tiles.map((tile) => tileKey(plan, tile)));
    const metas: TileCacheEntryMeta[] = [];
    for (const entry of this.entries.values()) {
      metas.push({
        key: entry.key,
        bytes: entry.bytes,
        rect: entry.rect,
        lastUsed: entry.lastUsed,
        bucket: entry.bucket,
      });
    }
    for (const key of selectEvictions(metas, this.budget, keep, plan.visible)) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      this.bytes -= entry.bytes;
      closeImage(entry.image);
      this.entries.delete(key);
    }
  }
}

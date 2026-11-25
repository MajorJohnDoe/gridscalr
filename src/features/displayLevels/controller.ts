/**
 * The level cache controller: build one whole-page bitmap per page and zoom
 * octave through the existing renderer, reuse it on a revisit, and evict by
 * least recent use inside a byte budget.
 *
 * A build is asynchronous and idempotent per key. It never cancels the exact
 * crop render: it is started only when the canvas is idle, and its result is a
 * plain canvas the host blits. `clear()` bumps an epoch, so a build that finishes
 * after a scene reset is dropped instead of stored.
 */

import { perfSpan } from "../perfMonitor";
import {
  LEVEL_CACHE_BUDGET_BYTES,
  levelByteSize,
  levelIndexFor,
  levelKey,
  levelPixels,
  levelScaleFor,
  selectLevelEvictions,
  type LevelEntryMeta,
  type LevelPageSize,
} from "./model";

/** The host renders one whole page at a scale; CanvasView maps it to PdfRenderer. */
export interface LevelRenderSource {
  renderPageLevel(
    pageNumber: number,
    scale: number,
  ): Promise<{ canvas: HTMLCanvasElement; scale: number }>;
}

export interface LevelRequest {
  /** Identity of the loaded document set; a replaced source changes it. */
  contentKey: string;
  pageId: string;
  page: number;
  pageSize: LevelPageSize;
  /** Requested device scale of the current view: zoom * dpr. */
  scale: number;
}

export interface DisplayLevel {
  key: string;
  pageNumber: number;
  pageSize: LevelPageSize;
  /** Resolution the bitmap was rendered at, possibly below the octave's. */
  scale: number;
  index: number;
  canvas: HTMLCanvasElement;
}

export interface DisplayLevelStats {
  bytes: number;
  budgetBytes: number;
  levels: number;
  hits: number;
  misses: number;
  builds: number;
  lastBuildMs: number | null;
}

interface Entry extends DisplayLevel {
  bytes: number;
  lastUsed: number;
}

export interface DisplayLevelOptions {
  budget?: number;
  /** Called after a level is stored, so the canvas can repaint with it. */
  onLevel?: (level: DisplayLevel) => void;
}

export class DisplayLevelController {
  private readonly budget: number;
  private readonly onLevel: ((level: DisplayLevel) => void) | undefined;
  private readonly entries = new Map<string, Entry>();
  private readonly building = new Set<string>();
  private bytes = 0;
  private clock = 0;
  private epoch = 0;
  private hits = 0;
  private misses = 0;
  private builds = 0;
  private lastBuildMs: number | null = null;

  constructor(
    private readonly source: LevelRenderSource,
    options: DisplayLevelOptions = {},
  ) {
    this.budget = Math.max(0, options.budget ?? LEVEL_CACHE_BUDGET_BYTES);
    this.onLevel = options.onLevel;
  }

  /** A cached level for this request, or null. Never starts a build, never counts. */
  peek(request: LevelRequest): DisplayLevel | null {
    const entry = this.entries.get(this.keyFor(request));
    if (!entry) return null;
    entry.lastUsed = ++this.clock;
    return entry;
  }

  /**
   * A cached level for this request, or null with a build started when `build`
   * is true. A gesture passes `false`, so a whole-page render is never started
   * behind the user's hand; a settled view passes `true` once.
   */
  ensure(request: LevelRequest, options: { build: boolean }): DisplayLevel | null {
    const key = this.keyFor(request);
    const entry = this.entries.get(key);
    if (entry) {
      entry.lastUsed = ++this.clock;
      this.hits += 1;
      perfSpan("level-hit", () => undefined);
      return entry;
    }
    this.misses += 1;
    if (options.build) void this.build(request, key);
    return null;
  }

  stats(): DisplayLevelStats {
    return {
      bytes: this.bytes,
      budgetBytes: this.budget,
      levels: this.entries.size,
      hits: this.hits,
      misses: this.misses,
      builds: this.builds,
      lastBuildMs: this.lastBuildMs,
    };
  }

  /** Drops every level and ignores any build that is still running. */
  clear(): void {
    this.epoch += 1;
    this.entries.clear();
    this.building.clear();
    this.bytes = 0;
  }

  dispose(): void {
    this.clear();
  }

  private keyFor(request: LevelRequest): string {
    return levelKey(request.contentKey, request.pageId, request.page, levelIndexFor(request.scale));
  }

  private async build(request: LevelRequest, key: string): Promise<void> {
    if (this.building.has(key)) return;
    this.building.add(key);
    const epoch = this.epoch;
    const index = levelIndexFor(request.scale);
    const pixels = levelPixels(request.pageSize, levelScaleFor(index));
    const startedAt = performance.now();
    try {
      const raster = await this.source.renderPageLevel(request.page, pixels.scale);
      if (epoch !== this.epoch) return;
      this.builds += 1;
      this.lastBuildMs = performance.now() - startedAt;
      const entry: Entry = {
        key,
        pageNumber: request.page,
        pageSize: { ...request.pageSize },
        scale: raster.scale,
        index,
        canvas: raster.canvas,
        bytes: levelByteSize(raster.canvas.width, raster.canvas.height),
        lastUsed: ++this.clock,
      };
      this.store(entry);
      this.onLevel?.(entry);
    } catch {
      // A cancelled or failed build leaves the exact crop path in place.
    } finally {
      this.building.delete(key);
    }
  }

  private store(entry: Entry): void {
    const previous = this.entries.get(entry.key);
    if (previous) this.bytes -= previous.bytes;
    this.entries.set(entry.key, entry);
    this.bytes += entry.bytes;
    this.evict(entry.key);
  }

  private evict(keepKey: string): void {
    if (this.bytes <= this.budget) return;
    const metas: LevelEntryMeta[] = [];
    for (const entry of this.entries.values()) {
      metas.push({ key: entry.key, bytes: entry.bytes, lastUsed: entry.lastUsed });
    }
    for (const key of selectLevelEvictions(metas, this.budget, new Set([keepKey]))) {
      const entry = this.entries.get(key);
      if (!entry) continue;
      this.bytes -= entry.bytes;
      this.entries.delete(key);
    }
  }
}

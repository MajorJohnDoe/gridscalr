/**
 * Display levels: the pure rules for one downscaled whole-page bitmap per zoom
 * octave. A view picks the smallest octave whose resolution reaches the scale it
 * would render at, so a pan or a zoom-back can blit a cached page image instead
 * of asking PDF.js for the whole page again.
 *
 * A level is display data only: it is never measured, printed or exported, and
 * the project file never learns about it.
 */

/**
 * Hard cap on retained level pixels: 128 MiB of RGBA.
 *
 * The budget holds several octaves of one page (at 2531 x 1685 pt that is about
 * 1.1, 4.3 and 17 Mpix for the three nearest octaves) or a few pages of a
 * larger project. It is separate from the tile budget; a scanned page disables
 * tiling, so the two rarely fill together.
 */
export const LEVEL_CACHE_BUDGET_BYTES = 128 * 1024 * 1024;

/** `ImageBitmap` and canvas pixels are RGBA in this accounting. */
export const LEVEL_BYTES_PER_PIXEL = 4;

/**
 * One level never takes more than this, so the LRU always holds a few. It is
 * also the gate for whether an octave is built at all: an octave whose whole
 * page does not fit is never requested, because a softer bitmap would only be
 * an underlay and a 20 Mpix build is not worth that.
 */
export const LEVEL_MAX_PIXELS = 20_000_000;

/** A canvas wider or taller than this is refused by some WebViews. */
export const LEVEL_MAX_DIMENSION = 8192;

export interface LevelPageSize {
  width: number;
  height: number;
}

export interface LevelPixels {
  /** Device pixels per page point the level is actually rendered at. */
  scale: number;
  width: number;
  height: number;
}

/**
 * The smallest octave whose resolution reaches `scale`: a view at 0.29 asks for
 * level -1 (0.5), a view at 1.2 asks for level 1 (2.0). Octaves keep the key
 * space small and make a revisit after a zoom band change a guaranteed hit.
 */
export function levelIndexFor(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 0;
  return Math.ceil(Math.log2(scale));
}

/** The nominal render scale of one octave. */
export function levelScaleFor(index: number): number {
  return 2 ** index;
}

/** True when a level at `levelScale` is at least as sharp as the view. */
export function levelIsSharpEnough(levelScale: number, requestedScale: number): boolean {
  if (!Number.isFinite(levelScale) || !Number.isFinite(requestedScale)) return false;
  return levelScale + 1e-9 >= requestedScale;
}

/**
 * The device-pixel canvas one level is rendered into. The octave scale is
 * reduced when the page would exceed the pixel or dimension cap, so an A0 scan
 * at a high octave still fits one budget entry instead of allocating a
 * 70 Mpix canvas.
 */
export function levelPixels(page: LevelPageSize, scale: number): LevelPixels {
  const requested = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const width = Math.max(1, page.width);
  const height = Math.max(1, page.height);
  let actual = requested;
  const pixels = width * height * actual * actual;
  if (pixels > LEVEL_MAX_PIXELS) actual = Math.sqrt(LEVEL_MAX_PIXELS / (width * height));
  const longest = Math.max(width, height) * actual;
  if (longest > LEVEL_MAX_DIMENSION) actual *= LEVEL_MAX_DIMENSION / longest;
  return {
    scale: actual,
    width: Math.max(1, Math.floor(width * actual)),
    height: Math.max(1, Math.floor(height * actual)),
  };
}

export function levelByteSize(width: number, height: number): number {
  return Math.max(0, Math.round(width)) * Math.max(0, Math.round(height)) * LEVEL_BYTES_PER_PIXEL;
}

/**
 * The key covers the loaded document set, the page and the octave. A replaced
 * source swaps the renderer's document and therefore its `docId`, so a level
 * from the previous drawing can never be drawn for the new one.
 */
export function levelKey(contentKey: string, pageId: string, page: number, index: number): string {
  return `${contentKey}|${pageId}|${page}|${index}`;
}

export interface LevelEntryMeta {
  key: string;
  bytes: number;
  lastUsed: number;
}

/**
 * Keys to drop so the cache fits `budget`: least recently used first, never a
 * key in `keep`. The current view's level is always kept, so the level being
 * drawn can never evict itself; a single level larger than the budget therefore
 * exceeds it until the next view replaces it. One level is capped at
 * `LEVEL_MAX_PIXELS`, so the overshoot is bounded by that entry.
 */
export function selectLevelEvictions(
  entries: readonly LevelEntryMeta[],
  budget: number,
  keep: ReadonlySet<string>,
): string[] {
  let total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
  if (total <= budget) return [];
  const candidates = entries
    .filter((entry) => !keep.has(entry.key))
    .sort((a, b) => a.lastUsed - b.lastUsed);
  const evictions: string[] = [];
  for (const entry of candidates) {
    if (total <= budget) break;
    total -= entry.bytes;
    evictions.push(entry.key);
  }
  return evictions;
}

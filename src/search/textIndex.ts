import { Util, type PDFPageProxy } from "pdfjs-dist";
import type { Bounds } from "../model/geometry";

export interface SearchRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextWord {
  text: string;
  /** Character offset of the word in PageText.text. */
  start: number;
  end: number;
  rect: SearchRect;
}

export interface PageText {
  page: number;
  text: string;
  words: TextWord[];
}

export interface SearchHit {
  page: number;
  text: string;
  snippet: string;
  start: number;
  rects: SearchRect[];
  bounds: Bounds;
}

const MAX_HITS_PER_PAGE = 40;

function unionRects(rects: SearchRect[]): Bounds {
  const min = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };
  const max = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY };
  for (const rect of rects) {
    min.x = Math.min(min.x, rect.x);
    min.y = Math.min(min.y, rect.y);
    max.x = Math.max(max.x, rect.x + rect.width);
    max.y = Math.max(max.y, rect.y + rect.height);
  }
  return { min, max };
}

function textSnippet(text: string, start: number, end: number): string {
  const from = Math.max(0, start - 42);
  const to = Math.min(text.length, end + 58);
  const prefix = from > 0 ? "…" : "";
  const suffix = to < text.length ? "…" : "";
  return `${prefix}${text.slice(from, to).replace(/\s+/g, " ").trim()}${suffix}`;
}

/** Extracts the PDF text layer as page-space words with bounding boxes. */
export async function extractPageText(page: PDFPageProxy, pageNumber: number): Promise<PageText> {
  const content = await page.getTextContent();
  const viewport = page.getViewport({ scale: 1 });
  const words: TextWord[] = [];
  let text = "";

  for (const item of content.items) {
    if (!("str" in item) || !("transform" in item)) continue;
    const raw = item.str.replace(/\s+/g, " ").trim();
    if (!raw) continue;
    const transformed = Util.transform(viewport.transform, item.transform);
    const [a, b, c, d, e, f] = transformed;
    const baseline = Math.hypot(a, b) || 1;
    const direction = { x: a / baseline, y: b / baseline };
    const width = Number(item.width) || baseline * raw.length * 0.5;
    const corners = [
      { x: e, y: f },
      { x: e + direction.x * width, y: f + direction.y * width },
      { x: e + c, y: f + d },
      { x: e + direction.x * width + c, y: f + direction.y * width + d },
    ];
    const minX = Math.min(...corners.map((point) => point.x));
    const minY = Math.min(...corners.map((point) => point.y));
    const maxX = Math.max(...corners.map((point) => point.x));
    const maxY = Math.max(...corners.map((point) => point.y));
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || maxX <= minX || maxY <= minY) {
      continue;
    }
    const start = text.length ? text.length + 1 : 0;
    if (text) text += " ";
    text += raw;
    words.push({
      text: raw,
      start,
      end: text.length,
      rect: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    });
  }

  return { page: pageNumber, text, words };
}

/** Pure search over one extracted page, used by the index and unit tests. */
export function searchTextPage(page: PageText, query: string): SearchHit[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length < 2) return [];
  const haystack = page.text.toLocaleLowerCase();
  const hits: SearchHit[] = [];
  let from = 0;
  while (hits.length < MAX_HITS_PER_PAGE) {
    const start = haystack.indexOf(needle, from);
    if (start < 0) break;
    const end = start + needle.length;
    const rects = page.words
      .filter((word) => word.start < end && word.end > start)
      .map((word) => word.rect);
    if (rects.length) {
      hits.push({
        page: page.page,
        text: page.text.slice(start, end),
        snippet: textSnippet(page.text, start, end),
        start,
        rects,
        bounds: unionRects(rects),
      });
    }
    from = end;
  }
  return hits;
}

/**
 * Lazily extracts and caches the PDF text layer. OCR text can later be added
 * to the same index without changing the search or canvas highlight paths.
 */
export class PdfTextIndex {
  private readonly pages = new Map<number, PageText>();
  private readonly stored = new Map<number, PageText>();
  private readonly pending = new Map<number, Promise<PageText>>();
  private disposed = false;

  constructor(
    readonly pageCount: number,
    private readonly loadPage: (page: number) => Promise<PDFPageProxy>,
  ) {}

  get indexedCount(): number {
    return this.pages.size;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Adds OCR text that should win over an empty PDF text layer. */
  seed(page: number, text: PageText): void {
    this.stored.set(page, text);
  }

  /** Replaces one page after OCR, without waiting for a full reindex. */
  setPageText(page: number, text: PageText): void {
    this.stored.set(page, text);
    this.pages.set(page, text);
  }

  async page(page: number): Promise<PageText> {
    const cached = this.pages.get(page);
    if (cached) return cached;
    const pending = this.pending.get(page);
    if (pending) return pending;
    const promise = this.loadPage(page)
      .then((proxy) => extractPageText(proxy, page))
      .catch(() => ({ page, text: "", words: [] }))
      .then((result) => {
        const stored = this.stored.get(page);
        const resolved = result.text.trim() || !stored ? result : stored;
        this.pages.set(page, resolved);
        this.pending.delete(page);
        return resolved;
      });
    this.pending.set(page, promise);
    return promise;
  }

  async indexAll(onProgress?: (done: number, total: number) => void): Promise<void> {
    for (let page = 1; page <= this.pageCount; page += 1) {
      if (this.disposed) return;
      await this.page(page);
      onProgress?.(page, this.pageCount);
    }
  }

  search(query: string): SearchHit[] {
    const hits: SearchHit[] = [];
    const pages = [...this.pages.values()].sort((a, b) => a.page - b.page);
    for (const page of pages) {
      if (this.disposed) break;
      hits.push(...searchTextPage(page, query));
    }
    return hits;
  }

  dispose(): void {
    this.disposed = true;
    this.pages.clear();
    this.stored.clear();
    this.pending.clear();
  }
}

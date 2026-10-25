/**
 * Lazily renders and caches page previews for the Pages panel.
 *
 * Rendering runs one page at a time, only for pages the panel has requested
 * (visible cards), and yields while the main canvas render is busy. Results are
 * cached as data URLs so rebuilding the sidebar never re-rasterises a page.
 */
export class PageThumbnailService {
  private cache = new Map<number, string>();
  private pending = new Map<number, Promise<string | null>>();
  private resolvers = new Map<number, (url: string | null) => void>();
  private queue: number[] = [];
  private pumping = false;
  private destroyed = false;

  constructor(
    private readonly render: (page: number) => Promise<string>,
    private readonly isBusy: () => boolean = () => false,
  ) {}

  /** A cached preview, or null while it still has to be rendered. */
  get(page: number): string | null {
    return this.cache.get(page) ?? null;
  }

  /**
   * Requests a preview. Concurrent requests for the same page share one render.
   * Resolves to null when rendering fails, the request is cleared, or the
   * service is destroyed.
   */
  request(page: number): Promise<string | null> {
    const cached = this.cache.get(page);
    if (cached) return Promise.resolve(cached);
    const existing = this.pending.get(page);
    if (existing) return existing;
    if (this.destroyed) return Promise.resolve(null);
    const promise = new Promise<string | null>((resolve) => {
      this.resolvers.set(page, resolve);
    });
    this.pending.set(page, promise);
    this.queue.push(page);
    void this.pump();
    return promise;
  }

  /** Drops every preview and queued request, for example after pages were removed. */
  clear(): void {
    this.cache.clear();
    this.queue = [];
    this.resolveAll(null);
  }

  destroy(): void {
    this.destroyed = true;
    this.clear();
  }

  private resolveAll(url: string | null): void {
    for (const [page, resolve] of this.resolvers) {
      this.pending.delete(page);
      resolve(url);
    }
    this.resolvers.clear();
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.destroyed) return;
    this.pumping = true;
    try {
      while (!this.destroyed && this.queue.length) {
        const page = this.queue.shift()!;
        const resolve = this.resolvers.get(page);
        if (!resolve || this.cache.has(page)) continue;
        await this.waitForIdle();
        if (this.destroyed) return;
        let url: string | null = null;
        try {
          url = await this.render(page);
        } catch {
          url = null;
        }
        // A clear() or destroy() while rendering invalidates this request.
        if (this.resolvers.get(page) !== resolve) continue;
        this.resolvers.delete(page);
        this.pending.delete(page);
        if (url) this.cache.set(page, url);
        resolve(url);
        if (this.queue.length) await delay(24);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async waitForIdle(): Promise<void> {
    const started = Date.now();
    while (!this.destroyed && this.isBusy() && Date.now() - started < 4000) {
      await delay(120);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

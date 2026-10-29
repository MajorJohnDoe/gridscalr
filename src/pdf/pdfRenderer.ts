import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PageSize, Point } from "../model/types";
import { contentBoundsFromPixels } from "./thumbnails";

GlobalWorkerOptions.workerSrc = workerUrl;

export class PasswordRequiredError extends Error {
  constructor() {
    super("This PDF is password protected.");
    this.name = "PasswordRequiredError";
  }
}

export class PdfPasswordError extends Error {
  constructor() {
    super("The password was not accepted.");
    this.name = "PdfPasswordError";
  }
}

function isPasswordException(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ((error as { name?: string }).name === "PasswordException" ||
      (error as { code?: number }).code === 1)
  );
}

/** PDF.js 6 decodes CCITT and JBIG2 through WebAssembly, so the assets need a base URL. */
function wasmBaseUrl(): string | undefined {
  if (typeof document === "undefined") return undefined;
  try {
    return new URL("wasm/", document.baseURI).href;
  } catch {
    return undefined;
  }
}

export async function loadPdfDocument(
  data: Uint8Array,
  password?: string,
): Promise<PDFDocumentProxy> {
  try {
    const task = getDocument({
      data: data.slice(),
      password,
      useSystemFonts: true,
      disableAutoFetch: true,
      disableStream: false,
      wasmUrl: wasmBaseUrl(),
    });
    return await task.promise;
  } catch (error) {
    if (isPasswordException(error)) {
      if (password) throw new PdfPasswordError();
      throw new PasswordRequiredError();
    }
    throw error;
  }
}

export interface RenderResult {
  pageNumber: number;
  rect: { x: number; y: number; width: number; height: number };
  canvas: HTMLCanvasElement;
  renderScale: number;
}

export class PdfRenderer {
  private pages = new Map<number, PDFPageProxy>();
  /** Concurrent renders are allowed so the primary and split reference canvases do not cancel each other. */
  private activeTasks = new Set<{ cancel: () => void }>();
  /** 1-based global page where each document starts. */
  private starts: number[] = [];
  /** Source-local pages included for each document, in global order. */
  private pageMaps: number[][];

  constructor(
    public readonly documents: PDFDocumentProxy[],
    pageMaps?: number[][],
  ) {
    if (!documents.length) throw new Error("A project needs at least one document.");
    this.pageMaps = documents.map((document, index) => {
      const requested = pageMaps?.[index];
      if (!requested) return Array.from({ length: document.numPages }, (_, page) => page + 1);
      return requested.filter(
        (page) => Number.isInteger(page) && page >= 1 && page <= document.numPages,
      );
    });
    this.recomputeStarts();
  }

  private recomputeStarts(): void {
    this.starts = [];
    let start = 1;
    for (const pages of this.pageMaps) {
      this.starts.push(start);
      start += pages.length;
    }
  }

  /** Appends a document. New documents always go at the end. */
  addDocument(document: PDFDocumentProxy, pageMap?: number[]): void {
    this.documents.push(document);
    this.pageMaps.push(
      pageMap?.filter((page) => page >= 1 && page <= document.numPages) ??
        Array.from({ length: document.numPages }, (_, page) => page + 1),
    );
    this.recomputeStarts();
  }

  /** Replaces the included source pages after a page removal. */
  setPageMaps(pageMaps: number[][]): void {
    this.cancel();
    for (const page of new Set(this.pages.values())) page.cleanup();
    this.pages.clear();
    this.pageMaps = this.documents.map((document, index) => {
      const requested = pageMaps[index];
      if (!requested) return Array.from({ length: document.numPages }, (_, page) => page + 1);
      return requested.filter(
        (page) => Number.isInteger(page) && page >= 1 && page <= document.numPages,
      );
    });
    this.recomputeStarts();
  }

  /** Removes an entire source document after its last included page is deleted. */
  removeDocument(index: number): void {
    if (index < 0 || index >= this.documents.length) return;
    this.cancel();
    for (const page of new Set(this.pages.values())) page.cleanup();
    this.pages.clear();
    const [document] = this.documents.splice(index, 1);
    this.pageMaps.splice(index, 1);
    this.recomputeStarts();
    // Duplicated pages share the source PDF proxy, so only destroy it when the
    // last project page that uses it has gone.
    if (document && !this.documents.includes(document)) {
      void document.loadingTask.destroy().catch(() => undefined);
    }
  }

  get documentCount(): number {
    return this.documents.length;
  }

  get pageCount(): number {
    return this.pageMaps.reduce((sum, pages) => sum + pages.length, 0);
  }

  /** 0-based document index and 1-based local page for a global page number. */
  private locate(pageNumber: number): { index: number; localPage: number } {
    const page = Math.max(1, Math.min(this.pageCount, Math.round(pageNumber)));
    let index = 0;
    for (let i = 0; i < this.starts.length; i++) {
      if (page >= this.starts[i]) index = i;
      else break;
    }
    const pages = this.pageMaps[index] ?? [];
    return { index, localPage: pages[Math.max(0, page - this.starts[index])] ?? 1 };
  }

  async getPage(pageNumber: number): Promise<PDFPageProxy> {
    const existing = this.pages.get(pageNumber);
    if (existing) return existing;
    const { index, localPage } = this.locate(pageNumber);
    const page = await this.documents[index].getPage(localPage);
    // Images (including CCITT/JBIG2 decoded through WASM) are attached to the
    // operator list. Building it up front prevents a blank first paint while
    // the image is still pending in the worker.
    await page.getOperatorList();
    this.pages.set(pageNumber, page);
    return page;
  }

  async getPageSize(pageNumber: number): Promise<PageSize> {
    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  }

  /** True while the main canvas render is running, so background work can yield. */
  get busy(): boolean {
    return this.activeTasks.size > 0;
  }

  /**
   * Renders a small preview of the page for the Pages panel. This uses its own
   * render task so it never cancels or blocks the main canvas render, and the
   * caller caps the pixel size to keep large drawings cheap.
   */
  async renderPageThumbnail(pageNumber: number, maxDimension = 256): Promise<HTMLCanvasElement> {
    const page = await this.getPage(pageNumber);
    return renderPagePreview(page, maxDimension, true);
  }

  async getDocumentData(index: number): Promise<Uint8Array> {
    const document = this.documents[index];
    if (!document) throw new Error(`Document ${index + 1} is not loaded.`);
    return document.getData();
  }

  cancel(): void {
    for (const task of this.activeTasks) {
      try {
        task.cancel();
      } catch {
        // Rendering may already be complete.
      }
    }
    this.activeTasks.clear();
  }

  async renderCrop(
    pageNumber: number,
    rect: { x: number; y: number; width: number; height: number },
    requestedScale: number,
  ): Promise<RenderResult> {
    const page = await this.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const pageWidth = base.width;
    const pageHeight = base.height;

    const x = Math.max(0, Math.min(pageWidth - 0.5, rect.x));
    const y = Math.max(0, Math.min(pageHeight - 0.5, rect.y));
    const width = Math.max(0.5, Math.min(pageWidth - x, rect.width));
    const height = Math.max(0.5, Math.min(pageHeight - y, rect.height));

    const maxDimension = 4096;
    const maxPixels = 8_000_000;
    let scale = Math.min(
      requestedScale,
      maxDimension / Math.max(width, 1),
      maxDimension / Math.max(height, 1),
    );
    if (width * height * scale * scale > maxPixels) {
      scale = Math.sqrt(maxPixels / (width * height));
    }
    scale = Math.max(0.05, scale);

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));

    const viewport = base.clone({
      scale,
      offsetX: -x * scale,
      offsetY: -y * scale,
    });
    const task = page.render({
      canvas,
      viewport,
      background: "#ffffff",
      intent: "display",
    });
    this.activeTasks.add(task);
    try {
      await task.promise;
    } finally {
      this.activeTasks.delete(task);
    }
    return {
      pageNumber,
      rect: { x, y, width, height },
      canvas,
      renderScale: scale,
    };
  }

  async destroy(): Promise<void> {
    this.cancel();
    for (const page of new Set(this.pages.values())) page.cleanup();
    this.pages.clear();
    for (const document of new Set(this.documents)) {
      await document.loadingTask.destroy();
    }
  }
}

/**
 * Renders one PDF page into a small white canvas. Used for page previews in
 * the Pages panel and in the import picker. The page's own rotation and view
 * are preserved, and the largest side is capped at `maxDimension` pixels.
 */
export async function renderPagePreview(
  page: PDFPageProxy,
  maxDimension = 144,
  trimMargins = false,
): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 });
  const longest = Math.max(base.width, base.height, 1);
  const scale = Math.min(1, Math.max(1, maxDimension) / longest);
  const viewport = base.clone({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const task = page.render({
    canvas,
    viewport,
    background: "#ffffff",
    intent: "display",
  });
  await task.promise;
  if (!trimMargins) return canvas;

  let bounds = null;
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return canvas;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    bounds = contentBoundsFromPixels(image.data, canvas.width, canvas.height);
  } catch {
    return canvas;
  }
  if (!bounds) return canvas;
  const padding = Math.max(2, Math.round(Math.max(bounds.width, bounds.height) * 0.025));
  const x = Math.max(0, bounds.x - padding);
  const y = Math.max(0, bounds.y - padding);
  const width = Math.min(canvas.width - x, bounds.width + padding * 2);
  const height = Math.min(canvas.height - y, bounds.height + padding * 2);
  if (width < 8 || height < 8) return canvas;
  if (width * height < canvas.width * canvas.height * 0.01) return canvas;

  const trimmed = document.createElement("canvas");
  trimmed.width = width;
  trimmed.height = height;
  const context = trimmed.getContext("2d");
  if (!context) return canvas;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(canvas, x, y, width, height, 0, 0, width, height);
  return trimmed;
}

export function cropRectForView(
  pageSize: PageSize,
  zoom: number,
  panX: number,
  panY: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 80,
): { x: number; y: number; width: number; height: number } {
  const left = Math.max(0, (-panX - margin) / zoom);
  const top = Math.max(0, (-panY - margin) / zoom);
  const right = Math.min(pageSize.width, (viewportWidth - panX + margin) / zoom);
  const bottom = Math.min(pageSize.height, (viewportHeight - panY + margin) / zoom);
  const x = Math.max(0, Math.min(left, pageSize.width - 1));
  const y = Math.max(0, Math.min(top, pageSize.height - 1));
  return {
    x,
    y,
    width: Math.max(0.5, Math.min(pageSize.width - x, right - x)),
    height: Math.max(0.5, Math.min(pageSize.height - y, bottom - y)),
  };
}

export function screenToPage(point: Point, zoom: number, panX: number, panY: number): Point {
  return { x: (point.x - panX) / zoom, y: (point.y - panY) / zoom };
}

export function pageToScreen(point: Point, zoom: number, panX: number, panY: number): Point {
  return { x: point.x * zoom + panX, y: point.y * zoom + panY };
}

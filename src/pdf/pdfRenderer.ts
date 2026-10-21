import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PageSize, Point } from "../model/types";

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
  private activeTask: { cancel: () => void } | null = null;

  constructor(public readonly document: PDFDocumentProxy) {}

  get pageCount(): number {
    return this.document.numPages;
  }

  async getPage(pageNumber: number): Promise<PDFPageProxy> {
    const existing = this.pages.get(pageNumber);
    if (existing) return existing;
    const page = await this.document.getPage(pageNumber);
    this.pages.set(pageNumber, page);
    return page;
  }

  async getPageSize(pageNumber: number): Promise<PageSize> {
    const page = await this.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    return { width: viewport.width, height: viewport.height };
  }

  cancel(): void {
    if (this.activeTask) {
      try {
        this.activeTask.cancel();
      } catch {
        // Rendering may already be complete.
      }
      this.activeTask = null;
    }
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

    this.cancel();
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
    this.activeTask = task;
    try {
      await task.promise;
    } finally {
      if (this.activeTask === task) this.activeTask = null;
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
    for (const page of this.pages.values()) page.cleanup();
    this.pages.clear();
    await this.document.loadingTask.destroy();
  }
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

export function screenToPage(
  point: Point,
  zoom: number,
  panX: number,
  panY: number,
): Point {
  return { x: (point.x - panX) / zoom, y: (point.y - panY) / zoom };
}

export function pageToScreen(
  point: Point,
  zoom: number,
  panX: number,
  panY: number,
): Point {
  return { x: point.x * zoom + panX, y: point.y * zoom + panY };
}

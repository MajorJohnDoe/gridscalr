import { t } from "../i18n";
import type { Project } from "../model/types";
import { totalPageCount } from "../model/documents";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import { disposeOcrWorker, isOcrCurrent, ocrPageToText, runOcrPage } from "../search/ocr";
import { PdfTextIndex, type SearchHit } from "../search/textIndex";
import { store } from "../state/store";
import type { CanvasView } from "../canvas/CanvasView";
import { messageDialog } from "../ui/dialogs";
import { SearchPanel } from "../ui/searchPanel";
import { toast } from "../ui/toast";
import { describeError } from "../io/platformError";

export interface SearchControllerOptions {
  host: HTMLElement;
  project: () => Project | null;
  renderer: () => PdfRenderer | null;
  canvas: () => CanvasView;
  enqueuePageSize: (page: number) => Promise<unknown>;
  isDisposed: () => boolean;
}

/**
 * Owns the floating search panel, the local text index and the OCR run loop.
 * App.ts only opens and closes it.
 */
export class SearchController {
  private panel: SearchPanel | null = null;
  private index: PdfTextIndex | null = null;
  private query = "";
  private debounce: number | null = null;
  private ocrBusy = false;
  private ocrToken = 0;

  constructor(private readonly options: SearchControllerOptions) {}

  open(): void {
    const project = this.options.project();
    const renderer = this.options.renderer();
    if (!project || !renderer) return;
    if (this.panel) {
      this.panel.focus();
      return;
    }
    this.query = "";
    const index = new PdfTextIndex(totalPageCount(project.documents), (page) =>
      renderer.getPage(page),
    );
    for (let page = 1; page <= index.pageCount; page += 1) {
      const stored = project.pages[String(page)]?.ocr;
      if (stored && isOcrCurrent(project, page, stored)) {
        index.seed(page, ocrPageToText(stored, page));
      }
    }
    this.index = index;
    this.panel = new SearchPanel(this.options.host, {
      onQuery: (query) => this.onQuery(query),
      onSelect: (hit) => void this.selectHit(hit),
      onOcr: () => void this.runOcr(),
      onClose: () => this.close(),
    });
    this.panel.setProgress(0, index.pageCount);
    this.panel.setResults([], "", 0, index.pageCount);
    void this.indexText(index);
  }

  close(): void {
    this.ocrToken += 1;
    this.ocrBusy = false;
    if (this.debounce !== null) {
      window.clearTimeout(this.debounce);
      this.debounce = null;
    }
    this.panel?.destroy();
    this.panel = null;
    this.index?.dispose();
    this.index = null;
    this.query = "";
    this.options.canvas().clearSearchHits();
  }

  private onQuery(query: string): void {
    this.query = query;
    if (this.debounce !== null) window.clearTimeout(this.debounce);
    this.debounce = window.setTimeout(() => {
      this.debounce = null;
      this.run(query);
    }, 120);
  }

  private run(query: string): void {
    const index = this.index;
    if (!index || !this.panel) return;
    this.panel.setResults(index.search(query), query, index.indexedCount, index.pageCount);
  }

  private async indexText(index: PdfTextIndex): Promise<void> {
    await index.indexAll((done, total) => {
      if (this.index !== index || !this.panel) return;
      this.panel.setProgress(done, total);
      if (this.query.trim()) this.run(this.query);
    });
    if (this.index !== index || !this.panel) return;
    this.panel.setIndexComplete(index.indexedCount);
    if (this.query.trim()) this.run(this.query);
  }

  private async selectHit(hit: SearchHit): Promise<void> {
    const project = this.options.project();
    if (!project) return;
    if (hit.page < 1 || hit.page > totalPageCount(project.documents)) return;
    await this.options.enqueuePageSize(hit.page);
    if (store.ui.page !== hit.page) store.setPage(hit.page);
    const canvas = this.options.canvas();
    canvas.setSearchHits(hit.page, hit.rects);
    canvas.focusBounds(hit.bounds);
    canvas.invalidate();
  }

  private async runOcr(): Promise<void> {
    const index = this.index;
    const panel = this.panel;
    const renderer = this.options.renderer();
    if (!index || !panel || !renderer || !this.options.project() || this.ocrBusy) return;
    this.ocrBusy = true;
    panel.setOcrBusy(true);
    const token = ++this.ocrToken;
    let scanned = 0;
    try {
      for (let page = 1; page <= index.pageCount; page += 1) {
        if (token !== this.ocrToken || this.index !== index || !this.panel) return;
        const pageText = await index.page(page);
        if (pageText.text.trim().length >= 8) continue;
        const project = this.options.project();
        if (!project) return;
        const stored = project.pages[String(page)]?.ocr;
        if (stored && isOcrCurrent(project, page, stored)) {
          index.setPageText(page, ocrPageToText(stored, page));
          continue;
        }
        panel.setStatus(t("app.ocrPageProgress", { page, total: index.pageCount }));
        const ocr = await runOcrPage(project, page, renderer, (message, progress) => {
          if (token !== this.ocrToken) return;
          panel.setStatus(
            t("app.ocrPageProgressDetail", {
              page,
              total: index.pageCount,
              message,
              percent: Math.round(progress * 100),
            }),
          );
        });
        if (token !== this.ocrToken || this.index !== index) return;
        store.setPageOcr(page, ocr);
        index.setPageText(page, ocrPageToText(ocr, page));
        scanned += 1;
        this.run(this.query);
      }
      if (token !== this.ocrToken) return;
      if (scanned === 0) {
        panel.setStatus(t("app.everyPageSearchable"));
      } else {
        this.run(this.query);
        panel.setStatus(t("app.ocrIndexed", { count: scanned }));
        toast(t("app.ocrIndexed", { count: scanned }), "success");
      }
    } catch (error) {
      if (!this.options.isDisposed() && token === this.ocrToken) {
        await messageDialog(t("app.ocrFailed"), describeError(error), "warning");
      }
    } finally {
      this.ocrBusy = false;
      this.panel?.setOcrBusy(false);
    }
  }

  dispose(): void {
    this.close();
    void disposeOcrWorker();
  }
}

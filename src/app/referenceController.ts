import { CanvasView } from "../canvas/CanvasView";
import { syncViewport } from "../canvas/viewport";
import { compareRevisions, type DiffItem, type RevisionDiff } from "../compare/revisionDiff";
import {
  openPdfReferenceSession,
  openReferenceSession,
  type ReferenceSession,
} from "../compare/referenceSession";
import { pickPdf, pickProject, saveBinaryFile } from "../io/platform";
import { sourceDocumentPaths } from "../io/projectFile";
import { totalPageCount } from "../model/documents";
import type { PageSize } from "../model/types";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import { store } from "../state/store";
import { ComparePanel } from "../ui/comparePanel";
import { messageDialog } from "../ui/dialogs";
import { ReferencePaneHeader, type ReferenceSource } from "../ui/referencePane";
import { SplitView } from "../ui/splitView";
import { toast } from "../ui/toast";

export interface ReferenceControllerOptions {
  canvasArea: HTMLElement;
  referencePaneHost: HTMLElement;
  referenceHost: HTMLElement;
  splitResizer: HTMLElement;
  primaryCanvas: CanvasView;
  getRenderer: () => PdfRenderer | null;
  getPageSize: (page: number) => PageSize | undefined;
  ensurePageSize: (page: number) => Promise<PageSize | undefined>;
  requestRender: () => void;
}

/**
 * Owns the reference-pane and comparison lifecycle. The primary project stays
 * in the store; a revision or drawing reference lives only in this controller.
 */
export class ReferenceController {
  readonly view: CanvasView;
  readonly splitView: SplitView;
  private readonly pane: ReferencePaneHeader;
  private mode: ReferenceSource = "same";
  private session: ReferenceSession | null = null;
  private diff: RevisionDiff | null = null;
  private panel: ComparePanel | null = null;
  private previousOpen = false;
  private refreshTimer: number | null = null;
  private pageSizes = new Map<number, PageSize>();
  private sizePromises = new Map<number, Promise<PageSize | undefined>>();
  private sizeEpoch = 0;

  constructor(private readonly options: ReferenceControllerOptions) {
    const referenceViewport = { page: 1, zoom: 1, panX: 0, panY: 0 };
    this.view = new CanvasView(
      options.referenceHost,
      {
        getRenderer: () => this.session?.renderer ?? options.getRenderer(),
        getPageSize: (page) =>
          this.session ? this.pageSizes.get(page) : options.getPageSize(page),
        ensurePageSize: (page) => {
          if (this.session) void this.enqueuePageSize(page);
          else void options.ensurePageSize(page);
        },
        onError: (message) => toast(`Reference: ${message}`, "error"),
      },
      {
        readOnly: true,
        canvasIdPrefix: "reference",
        project: () =>
          this.session
            ? this.session.kind === "project"
              ? this.session.project
              : null
            : store.project,
        view: () => {
          const rect = options.referenceHost.getBoundingClientRect();
          const target = this.view?.viewportSize ?? {
            width: rect.width,
            height: rect.height,
          };
          // The reference toolbar sits above the reference canvas. Use the
          // primary canvas height for the vertical centre so both pages stay
          // level in side-by-side mode instead of drifting by half the bar.
          const alignedTarget = {
            width: target.width,
            height: options.primaryCanvas.viewportSize.height || target.height,
          };
          const synced = syncViewport(
            {
              page: store.ui.page,
              zoom: store.ui.zoom,
              panX: store.ui.panX,
              panY: store.ui.panY,
            },
            options.primaryCanvas.viewportSize,
            alignedTarget,
          );
          referenceViewport.page = synced.page;
          referenceViewport.zoom = synced.zoom;
          referenceViewport.panX = synced.panX;
          referenceViewport.panY = synced.panY;
          return referenceViewport;
        },
      },
    );
    this.splitView = new SplitView({
      area: options.canvasArea,
      referencePane: options.referencePaneHost,
      referenceHost: options.referenceHost,
      resizer: options.splitResizer,
      primary: options.primaryCanvas,
      reference: this.view,
    });
    this.pane = new ReferencePaneHeader(options.referencePaneHost, {
      setSource: (source) => this.setSource(source),
      open: () => this.openFromBar(),
      close: () => void this.close(false),
    });
    this.updatePane();
  }

  get hasSession(): boolean {
    return this.session !== null;
  }

  get isSplitOpen(): boolean {
    return this.splitView.isOpen;
  }

  /** The application menu disables comparison while a reference is loaded. */
  toggleSplitView(): void {
    if (!store.project) return;
    if (this.session) {
      toast("Close the revision comparison first.", "info");
      return;
    }
    this.splitView.toggle();
    this.view.invalidate();
    this.updatePane();
  }

  onStoreChange(reason: string): void {
    if (
      this.session &&
      (reason === "change" || reason === "project" || reason === "undo" || reason === "layers")
    ) {
      this.scheduleRefresh();
    }
  }

  async openCompare(): Promise<void> {
    if (!store.project) return;
    try {
      const picked = await pickProject();
      if (!picked) return;
      await this.loadRevisionReference(picked.text, picked.path);
    } catch (error) {
      await messageDialog("Could not compare revisions", errorMessage(error), "warning");
    }
  }

  async openDrawingReference(): Promise<void> {
    if (!store.project) return;
    try {
      const picked = await pickPdf();
      if (!picked) return;
      await this.loadDrawingReference(picked.bytes, picked.name, picked.path);
    } catch (error) {
      await messageDialog("Could not open the reference drawing", errorMessage(error), "warning");
    }
  }

  private async loadRevisionReference(text: string, projectPath: string | null): Promise<void> {
    const current = store.project;
    if (!current) return;
    let session: ReferenceSession;
    try {
      session = await openReferenceSession(text, projectPath);
    } catch (error) {
      await messageDialog("Could not open the reference revision", errorMessage(error), "warning");
      return;
    }
    await this.enterSession(session, "revision");
  }

  private async loadDrawingReference(
    bytes: Uint8Array,
    name: string,
    path: string | null,
  ): Promise<void> {
    const current = store.project;
    if (!current) return;
    let session: ReferenceSession;
    try {
      session = await openPdfReferenceSession(bytes, name, path);
    } catch (error) {
      await messageDialog("Could not open the reference drawing", errorMessage(error), "warning");
      return;
    }
    await this.enterSession(session, "drawing");
  }

  private async enterSession(
    session: ReferenceSession,
    mode: Exclude<ReferenceSource, "same">,
  ): Promise<void> {
    const current = store.project;
    if (!current) {
      await session.destroy();
      return;
    }
    this.previousOpen = this.splitView.isOpen;
    await this.clearSession();
    this.session = session;
    this.mode = mode;
    this.sizeEpoch += 1;
    this.pageSizes.clear();
    this.sizePromises.clear();
    this.diff = session.kind === "project" ? compareRevisions(current, session.project) : null;
    this.splitView.setMode("side");
    this.splitView.setOpacity(0.5);
    this.splitView.setOpen(true);
    this.view.resetScene();
    this.panel = new ComparePanel(this.options.canvasArea, {
      setMode: (next) => {
        this.splitView.setMode(next);
        this.view.invalidate();
      },
      setOpacity: (value) => this.splitView.setOpacity(value),
      selectItem: (item) => void this.selectDiffItem(item),
      refresh: () => this.refreshDiff(),
      exportPdf: () => void this.exportPdf(),
      close: () => void this.close(false),
    });
    this.panel.update(current.name, session.name, this.diff, {
      pageCount: session.pageCount,
    });
    void this.enqueuePageSize(store.ui.page);
    this.updatePane();
    this.options.requestRender();
    toast(
      mode === "revision"
        ? `Comparing with ${session.name}.`
        : `Showing ${session.name} as the reference drawing.`,
      "info",
    );
  }

  private async enterSamePage(): Promise<void> {
    await this.clearSession();
    this.mode = "same";
    this.pageSizes.clear();
    this.sizePromises.clear();
    this.sizeEpoch += 1;
    this.view.resetScene();
    this.splitView.setMode("side");
    this.splitView.setOpen(true);
    this.updatePane();
    this.options.requestRender();
  }

  private async clearSession(): Promise<void> {
    this.panel?.destroy();
    this.panel = null;
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    const session = this.session;
    this.session = null;
    this.diff = null;
    this.pageSizes.clear();
    this.sizePromises.clear();
    this.sizeEpoch += 1;
    if (session) await session.destroy();
  }

  private updatePane(): void {
    this.pane.update({
      source: this.mode,
      referenceName: this.session?.name ?? null,
      pageCount: this.session?.pageCount,
    });
  }

  private setSource(source: ReferenceSource): void {
    if (source === "same") {
      if (this.mode !== "same" || this.session) void this.enterSamePage();
      return;
    }
    if (source === this.mode && this.session) return;
    if (source === "drawing") void this.openDrawingReference();
    else void this.openCompare();
  }

  private openFromBar(): void {
    if (this.mode === "drawing") void this.openDrawingReference();
    else void this.openCompare();
  }

  private enqueuePageSize(page: number): Promise<PageSize | undefined> {
    const session = this.session;
    if (!session) return Promise.resolve(undefined);
    const known = this.pageSizes.get(page);
    if (known) return Promise.resolve(known);
    const pending = this.sizePromises.get(page);
    if (pending) return pending;
    const epoch = this.sizeEpoch;
    const promise = session.renderer
      .getPageSize(page)
      .then((size) => {
        if (this.session !== session || epoch !== this.sizeEpoch) return undefined;
        this.pageSizes.set(page, size);
        this.view.invalidate();
        return size;
      })
      .catch((error) => {
        if (this.session === session) {
          toast(`Could not read reference page ${page}: ${errorMessage(error)}`, "warning");
        }
        return undefined;
      })
      .finally(() => {
        this.sizePromises.delete(page);
      });
    this.sizePromises.set(page, promise);
    return promise;
  }

  private scheduleRefresh(): void {
    if (!this.session) return;
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refreshDiff();
    }, 160);
  }

  private refreshDiff(): void {
    const project = store.project;
    const session = this.session;
    if (!project || !session) return;
    if (session.kind !== "project") return;
    this.diff = compareRevisions(project, session.project);
    this.panel?.update(project.name, session.name, this.diff, {
      pageCount: session.pageCount,
    });
  }

  private async selectDiffItem(item: DiffItem): Promise<void> {
    const project = store.project;
    if (!project) return;
    if (item.page > totalPageCount(project.documents)) {
      toast(`Page ${item.page} exists only in the reference revision.`, "info");
      return;
    }
    if (store.ui.page !== item.page) store.setPage(item.page);
    await this.options.ensurePageSize(item.page);
    if (item.current) {
      store.setSelection({
        layerId: item.current.layer.id,
        itemId: item.current.item.id,
      });
    } else {
      store.clearSelection();
    }
    this.options.primaryCanvas.focusBounds(item.bounds);
    this.options.primaryCanvas.invalidate();
  }

  async close(restoreSplit = true): Promise<void> {
    await this.clearSession();
    this.mode = "same";
    this.view.resetScene();
    this.splitView.setMode("side");
    this.splitView.setOpen(restoreSplit ? this.previousOpen : false);
    this.updatePane();
    this.options.requestRender();
  }

  private async exportPdf(): Promise<void> {
    const project = store.project;
    const session = this.session;
    const renderer = this.options.getRenderer();
    if (!project || !session || !renderer) return;
    try {
      const { exportComparisonPdf } = await import("../pdf/comparePdf");
      const bytes = await exportComparisonPdf({
        current: project,
        referenceName: session.name,
        referencePageCount: session.pageCount,
        reference: session.kind === "project" ? session.project : undefined,
        diff: this.diff,
        currentRenderer: renderer,
        referenceRenderer: session.renderer,
      });
      const safe = project.name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "gridscalr";
      const path = await saveBinaryFile(
        bytes,
        `${safe}-comparison.pdf`,
        [{ name: "PDF document", extensions: ["pdf"] }],
        "application/pdf",
        {
          forbiddenPaths: [
            ...sourceDocumentPaths(project, store.projectPath),
            ...session.sourcePaths,
          ],
        },
      );
      if (path) toast("Comparison PDF exported.", "success");
    } catch (error) {
      await messageDialog("Comparison export failed", errorMessage(error), "warning");
    }
  }

  dispose(): void {
    this.panel?.destroy();
    this.panel = null;
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.session) void this.session.destroy();
    this.session = null;
    this.splitView.destroy();
    this.view.destroy();
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

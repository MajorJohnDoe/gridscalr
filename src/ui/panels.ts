import { pageDisplayName, primaryDocument, totalPageCount } from "../model/documents";
import type { AreaMode, CountType, ImageMode, PageSize, RecentEntry } from "../model/types";
import { store } from "../state/store";
import type { AutosavePreview } from "../state/store";
import type { ShellRefs } from "./shell";
import { renderSidebar, setInspectorCollapsed } from "./sidebar";
import { renderContextBar } from "./contextBar";
import { renderInspector } from "./inspector";
import { renderMarkupsPanel } from "./markupsPanel";
import { updateStatus } from "./statusBar";
import { renderWelcome } from "./welcome";
import { toast } from "./toast";

export interface PanelActions {
  openPdf: () => void;
  openProject: () => void;
  newProject: () => void;
  closeProject: () => void;
  quit: () => void;
  saveProject: () => void;
  saveProjectAs: () => void;
  exportAs: (kind: "csv" | "json" | "png" | "drawing" | "quantity-csv" | "quantity-pdf") => void;
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  zoomActual: () => void;
  renameSelection: () => void;
  toggleMarkups: () => void;
  openQuantities: () => void;
  startCalibration: () => void;
  clearCalibration: () => void;
  openManualScale: () => void;
  setScaleLock: (locked: boolean) => void;
  deleteSelection: () => void;
  editSelectedText: () => void;
  copySelection: () => void;
  cutSelection: () => void;
  pasteSelection: () => void;
  duplicateSelection: () => void;
  moveSelectionToLayer: (layerId: string) => void;
  setSelectionVisible: (visible: boolean) => void;
  setSelectionLocked: (locked: boolean) => void;
  setSelectionColor: (color: string) => void;
  setSelectionStrokeWidth: (width: number) => void;
  setSelectionCategory: (categoryId: string) => void;
  setSelectionRoom: (room: string) => void;
  setSelectionAreaMode: (mode: AreaMode) => void;
  setSelectionCountType: (type: CountType) => void;
  insertImage: () => void;
  setSelectionImageMode: (mode: ImageMode) => void;
  setSelectionOpacity: (opacity: number) => void;
  goToPage: (page: number, fit?: boolean) => void;
  navigateToItem: (page: number, layerId: string, itemId: string) => void;
  ensurePageSize: (page: number) => void;
  getPageSize: (page: number) => PageSize | undefined;
  getPageThumbnail: (page: number) => string | null;
  requestPageThumbnail: (page: number) => Promise<string | null>;
  addPages: () => void;
  deletePage: (page: number) => void;
  duplicatePage: (page: number) => void;
  refresh: () => void;
  restoreAutosave: () => void;
  getAutosave: () => AutosavePreview | null;
  openRecent: (entry: RecentEntry) => void;
}

/** Focuses the selection label in Properties for rename. */
export function requestMarkupRename(refs: ShellRefs): void {
  const selection = store.ui.selection.length === 1 ? store.primarySelection : null;
  if (!selection) {
    toast("Select one item to rename it.", "info");
    return;
  }
  setInspectorCollapsed(false);
  window.requestAnimationFrame(() => {
    const fallback = refs.inspector.querySelector<HTMLInputElement>(
      '[data-role="selection-label"]',
    );
    if (fallback) {
      fallback.focus({ preventScroll: true });
      fallback.select();
      return;
    }
    toast("Select the item and edit its label in Properties.", "info");
  });
}

export function renderChrome(refs: ShellRefs, actions: PanelActions): void {
  renderTopbar(refs, actions);
  renderToolRail(refs);
  renderSidebar(refs, actions);
  renderContextBar(refs, actions);
  renderInspector(refs, actions);
  renderMarkupsPanel(refs, actions);
  updateStatus(refs);
  renderWelcome(refs, actions);
}

export function renderTopbar(refs: ShellRefs, _actions: PanelActions): void {
  const project = store.project;
  const hasProject = Boolean(project);
  refs.projectName.hidden = !hasProject;
  if (!refs.projectName.isContentEditable) {
    refs.projectName.textContent = project?.name ?? "";
  }
  refs.projectName.title = "Double-click to rename project";
  refs.docName.textContent = project
    ? (primaryDocument(project.documents)?.name ?? "No drawing open")
    : "No drawing open";
  const pageName = project ? pageDisplayName(project, store.ui.page) : undefined;
  refs.docMeta.textContent = project
    ? `Page ${store.ui.page} of ${totalPageCount(project.documents)}${pageName ? ` · ${pageName}` : ""}`
    : "";
  refs.dirtyDot.classList.toggle("hidden", !store.dirty || !hasProject);
  refs.dirtyDot.title = "Unsaved changes";
  refs.undoBtn.disabled = !store.canUndo;
  refs.redoBtn.disabled = !store.canRedo;
  refs.zoomReadout.textContent = `${Math.round(store.ui.zoom * 100)}%`;
  refs.pageInput.disabled = !hasProject;
  refs.pagePrevBtn.disabled = !hasProject || store.ui.page <= 1;
  refs.pageNextBtn.disabled =
    !hasProject || store.ui.page >= (project ? totalPageCount(project.documents) : 1);
  if (document.activeElement !== refs.pageInput) {
    refs.pageInput.value = hasProject ? String(store.ui.page) : "1";
  }
  refs.pageTotal.textContent = `/ ${project ? totalPageCount(project.documents) : 0}`;
}

function renderToolRail(refs: ShellRefs): void {
  for (const btn of refs.toolRail.querySelectorAll<HTMLElement>("[data-tool]")) {
    const active = btn.dataset.tool === store.ui.activeTool;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  }
}

/* ---------------- Inspector ---------------- */

import { primaryDocument } from "../model/documents";
import { pageDisplayName, pageIdAt } from "../model/pages";
import type { AreaMode, CountType, ImageMode, PageId, PageSize, RecentEntry } from "../model/types";
import { store, type ChangeReason, type ToolId } from "../state/store";
import type { RecoverySummary } from "../features/sessionRecovery";
import type { ShellRefs } from "./shell";
import { renderSidebar, setInspectorCollapsed } from "./sidebar";
import { renderContextBar } from "./contextBar";
import { renderInspector } from "./inspector";
import { isMarkupsOpen, renderMarkupsPanel } from "./markupsPanel";
import { updateStatus } from "./statusBar";
import { renderWelcome } from "./welcome";
import { toast } from "./toast";
import { icon } from "./icons";
import {
  familyToolForDisplay,
  rememberFamilyTool,
  TOOL_BY_ID,
  TOOL_FAMILY_BY_ID,
  type ToolFamilyId,
} from "./toolDefs";
import { t } from "../i18n";
import { isEditingTool } from "../features/viewOnly";
import { requestShellRender } from "./editSafeRender";

export interface PanelActions {
  openPdf: () => void;
  openProject: () => void;
  openCompare: () => void;
  openDrawingReference: () => void;
  openSearch: () => void;
  newProject: () => void;
  closeProject: () => void;
  quit: () => void;
  saveProject: () => void;
  saveProjectAs: () => void;
  saveProjectCopy: () => void;
  backupProject: () => void;
  openBackupManager: () => void;
  openConflictedCopies: () => void;
  packageProject: () => void;
  openPackage: () => void;
  exportAs: (
    kind: "csv" | "json" | "png" | "drawing" | "quantity-csv" | "quantity-pdf" | "quantity-xlsx",
  ) => void;
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  zoomActual: () => void;
  renameSelection: () => void;
  toggleMarkups: () => void;
  toggleSplitView: () => void;
  isSplitViewOpen: () => boolean;
  hasReferenceSession: () => boolean;
  openQuantities: () => void;
  startCalibration: () => void;
  clearCalibration: () => void;
  openManualScale: () => void;
  setScaleLock: (locked: boolean) => void;
  deleteSelection: () => void;
  editSelectedText: () => void;
  editRail: (itemId: string) => void;
  editLineTypes: () => void;
  fitDrawingToArea: () => void;
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
  setSelectionCountQuantity: (quantity: number) => void;
  setSelectionLabelSize: (size: number) => void;
  insertImage: () => void;
  setSelectionImageMode: (mode: ImageMode) => void;
  setSelectionOpacity: (opacity: number) => void;
  goToPage: (page: number, fit?: boolean) => void;
  navigateToItem: (pageId: PageId, layerId: string, itemId: string) => void;
  ensurePageSize: (page: number) => void;
  getPageSize: (page: number) => PageSize | undefined;
  getPageThumbnail: (page: number) => string | null;
  requestPageThumbnail: (page: number) => Promise<string | null>;
  addPages: () => void;
  importProjectPages: () => void;
  editSheetFields: (page: number) => void;
  deletePage: (pageId: PageId) => void;
  duplicatePage: (pageId: PageId) => void;
  reorderPage: (pageId: PageId, targetIndex: number) => void;
  reorderPages: (pageIds: readonly PageId[], insertionIndex: number) => void;
  insertPage: (pageId: PageId, index: number) => void;
  replaceSource: (documentId: string) => void;
  consolidateDrawings: () => void;
  copyDrawingIntoProject: (documentId: string) => void;
  detachFromSource: (documentId: string) => void;
  relinkSource: (documentId: string) => void;
  reloadSource: (documentId: string) => void;
  useCurrentSource: (documentId: string) => void;
  cleanupSuperseded: (documentId: string) => void;
  refresh: () => void;
  openRecovery: () => void;
  openProjectDoctor: () => void;
  getRecoverySummary: () => RecoverySummary;
  openRecent: (entry: RecentEntry) => void;
  openDemoProject: () => void;
  copyDiagnostics: () => void;
  reportProblem: () => void;
}

/** Focuses the selection label in Properties for rename. */
export function requestMarkupRename(refs: ShellRefs): void {
  const selection = store.ui.selection.length === 1 ? store.primarySelection : null;
  if (!selection) {
    toast(t("panels.renameOne"), "info");
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
    toast(t("panels.renameHint"), "info");
  });
}

/**
 * Repaint the whole shell. Every caller goes through the edit-safe scheduler so
 * a rebuild cannot remove the field the user is typing in; see
 * `editSafeRender.ts` for the background deferral, focus restore and render
 * coalescing rules.
 */
export function renderChrome(
  refs: ShellRefs,
  actions: PanelActions,
  reason: ChangeReason = "change",
): void {
  requestShellRender(refs.root, reason, () => paintChrome(refs, actions));
}

function paintChrome(refs: ShellRefs, actions: PanelActions): void {
  renderTopbar(refs, actions);
  renderToolRail(refs);
  renderSidebar(refs, actions);
  renderContextBar(refs, actions);
  renderInspector(refs, actions);
  renderMarkupsPanel(refs, actions);
  updateStatus(refs, actions);
  renderWelcome(refs, actions);
}

export function renderTopbar(refs: ShellRefs, _actions: PanelActions): void {
  const project = store.project;
  const hasProject = Boolean(project);
  refs.projectName.hidden = !hasProject;
  if (!refs.projectName.isContentEditable) {
    refs.projectName.textContent = project?.name ?? "";
  }
  refs.projectName.title = t("shell.renameHint");
  const currentPage = project?.pages[store.ui.page - 1];
  const pageDocument = currentPage
    ? project?.documents.find((document) => document.id === currentPage.documentId)
    : undefined;
  refs.docName.textContent = project
    ? (pageDocument?.name ?? primaryDocument(project.documents)?.name ?? t("shell.noDrawing"))
    : t("shell.noDrawing");
  const pageName = project ? pageDisplayName(project, pageIdAt(project, store.ui.page)) : undefined;
  refs.docMeta.textContent = project
    ? t("panels.pageOf", {
        page: store.ui.page,
        total: project.pages.length,
        name: pageName ? t("panels.pageNameSuffix", { name: pageName }) : "",
      })
    : "";
  refs.dirtyDot.classList.toggle("hidden", !store.dirty || !hasProject);
  refs.dirtyDot.title = t("dialogs.unsavedTitle");
  refs.undoBtn.disabled = store.readOnly || !store.canUndo;
  refs.redoBtn.disabled = store.readOnly || !store.canRedo;
  refs.zoomReadout.textContent = `${Math.round(store.ui.zoom * 100)}%`;
  refs.pageInput.disabled = !hasProject;
  refs.pagePrevBtn.disabled = !hasProject || store.ui.page <= 1;
  refs.pageNextBtn.disabled = !hasProject || store.ui.page >= (project ? project.pages.length : 1);
  if (document.activeElement !== refs.pageInput) {
    refs.pageInput.value = hasProject ? String(store.ui.page) : "1";
  }
  refs.pageTotal.textContent = `/ ${project ? project.pages.length : 0}`;
}

function renderToolRail(refs: ShellRefs): void {
  rememberFamilyTool(store.ui.activeTool);
  const viewOnly = store.readOnly;
  for (const btn of refs.toolRail.querySelectorAll<HTMLButtonElement>(
    "[data-tool]:not([data-tool-group])",
  )) {
    const tool = btn.dataset.tool as ToolId;
    const definition = TOOL_BY_ID.get(tool);
    const active = tool === store.ui.activeTool;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
    btn.disabled = viewOnly && isEditingTool(tool);
    if (definition) {
      btn.title = definition.shortcut
        ? `${t(definition.label)} (${definition.shortcut})`
        : t(definition.label);
    }
    if (btn.disabled) btn.title = `${btn.title} · ${t("viewOnly.disabled")}`;
  }
  for (const btn of refs.toolRail.querySelectorAll<HTMLButtonElement>("[data-tool-group]")) {
    const family = TOOL_FAMILY_BY_ID.get(btn.dataset.toolGroup as ToolFamilyId);
    if (!family) continue;
    const memberId = familyToolForDisplay(family, store.ui.activeTool);
    const member = TOOL_BY_ID.get(memberId);
    const active = family.tools.includes(store.ui.activeTool);
    if (member) {
      btn.dataset.displayTool = memberId;
      btn.innerHTML = icon(member.icon, 19);
      btn.title = `${t(member.label)} (${member.shortcut}) · ${t(family.label)}`;
    }
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
    btn.title = member
      ? `${t(member.label)} (${member.shortcut}) · ${t(family.label)}`
      : t(family.label);
    btn.disabled = viewOnly;
    if (viewOnly) btn.title = `${btn.title} · ${t("viewOnly.disabled")}`;
  }
  const markupsActive = Boolean(store.project) && isMarkupsOpen();
  refs.markupsBtn.classList.toggle("is-active", markupsActive);
  refs.markupsBtn.setAttribute("aria-pressed", String(markupsActive));
  refs.markupsBtn.disabled = !store.project;
}

/* ---------------- Inspector ---------------- */

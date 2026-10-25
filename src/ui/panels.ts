import { hasClipboard } from "../model/clipboard";
import { primaryDocument, totalPageCount } from "../model/documents";
import { itemIsVisible, layersForKind } from "../model/layers";
import { resolveSelection, selectionKind } from "../model/selection";
import type {
  AreaMode,
  CountType,
  ImageMode,
  PageSize,
  RecentEntry,
} from "../model/types";
import { store } from "../state/store";
import type { AutosavePayload } from "../state/store";
import type { PopoverItem } from "./popover";
import { showPopoverAt } from "./popover";
import type { ShellRefs } from "./shell";
import { renderSidebar, setInspectorCollapsed } from "./sidebar";
import { renderContextBar } from "./contextBar";
import { renderInspector } from "./inspector";
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
  exportAs: (
    kind: "csv" | "json" | "png" | "drawing" | "quantity-csv" | "quantity-pdf",
  ) => void;
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomFit: () => void;
  zoomActual: () => void;
  renameSelection: () => void;
  openMeasurements: () => void;
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
  refresh: () => void;
  restoreAutosave: () => void;
  getAutosave: () => AutosavePayload | null;
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
  refs.docName.textContent = project ? (primaryDocument(project.documents)?.name ?? "No drawing open") : "No drawing open";
  refs.docMeta.textContent = project
    ? `Page ${store.ui.page} of ${totalPageCount(project.documents)}`
    : "";
  refs.dirtyDot.classList.toggle("hidden", !store.dirty || !hasProject);
  refs.dirtyDot.title = "Unsaved changes";
  refs.undoBtn.disabled = !store.canUndo;
  refs.redoBtn.disabled = !store.canRedo;
  refs.zoomReadout.textContent = `${Math.round(store.ui.zoom * 100)}%`;
  refs.pageInput.disabled = !hasProject;
  refs.pagePrevBtn.disabled = !hasProject || store.ui.page <= 1;
  refs.pageNextBtn.disabled = !hasProject || store.ui.page >= (project ? totalPageCount(project.documents) : 1);
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

export function showSelectionMenuAt(x: number, y: number, actions: PanelActions): void {
  const project = store.project;
  if (!project) return;
  const refs = store.ui.selection;
  const resolved = resolveSelection(project, refs);
  const kind = selectionKind(project, refs);
  const anyVisible = resolved.some((entry) => itemIsVisible(entry.item, entry.layer));
  const canShow = resolved.some((entry) => entry.layer.visible);
  const anyUnlocked = resolved.some((entry) => !entry.locked);
  const canUnlock = resolved.some((entry) => !entry.layer.locked);
  const items: PopoverItem[] = [];

  if (!resolved.length) {
    items.push({
      label: "Paste",
      icon: "copy",
      disabled: !hasClipboard(project),
      action: actions.pasteSelection,
    });
    showPopoverAt(x, y, items);
    return;
  }

  const editableText =
    resolved.length === 1 &&
    (resolved[0].item.kind === "text" ||
      resolved[0].item.kind === "cloud" ||
      resolved[0].item.kind === "callout" ||
      resolved[0].item.kind === "stamp" ||
      resolved[0].item.kind === "delta") &&
    !resolved[0].locked;

  items.push(
    { label: "Copy", icon: "copy", action: actions.copySelection },
    { label: "Cut", icon: "trash", action: actions.cutSelection },
    { label: "Duplicate", icon: "copy", action: actions.duplicateSelection },
  );
  if (editableText) {
    items.push({ label: "Edit text…", icon: "text", action: actions.editSelectedText });
  }
  items.push(
    { separator: true },
    {
      label: anyVisible ? "Hide" : "Show",
      icon: anyVisible ? "eyeOff" : "eye",
      disabled: !anyVisible && !canShow,
      action: () => actions.setSelectionVisible(!anyVisible),
    },
    {
      label: anyUnlocked ? "Lock" : "Unlock",
      icon: anyUnlocked ? "lock" : "unlock",
      disabled: !anyUnlocked && !canUnlock,
      action: () => actions.setSelectionLocked(anyUnlocked),
    },
  );

  const targets = kind ? layersForKind(project, kind) : [];
  if (targets.length > 1) {
    items.push({ separator: true });
    for (const layer of targets) {
      if (resolved.every((entry) => entry.layer.id === layer.id)) continue;
      items.push({
        label: `Move to ${layer.name}`,
        icon: "layers",
        disabled: layer.locked,
        action: () => actions.moveSelectionToLayer(layer.id),
      });
    }
  }

  items.push(
    { separator: true },
    {
      label: "Delete",
      icon: "trash",
      danger: true,
      disabled: !anyUnlocked,
      action: actions.deleteSelection,
    },
  );
  showPopoverAt(x, y, items);
}

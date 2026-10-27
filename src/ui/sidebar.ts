import { store } from "../state/store";
import { clear, el } from "./dom";
import { icon } from "./icons";
import { renderLayers } from "./layerList";
import { renderPages, disconnectPageThumbnails } from "./pageList";
import { renderSymbolLibrary } from "./symbolLibrary";
import type { PanelActions } from "./panels";
import {
  clearPanelPreferences,
  DEFAULT_PANELS,
  loadPanelPreferences,
  PANEL_LIMITS,
  savePanelPreferences,
} from "./preferences";
import type { ShellRefs } from "./shell";

export { PANEL_LIMITS };

interface PanelLayout {
  dock: HTMLElement;
  dockResizer: HTMLElement;
  dockRestore: HTMLButtonElement;
  inspector: HTMLElement;
  inspectorResizer: HTMLElement;
  inspectorRestore: HTMLButtonElement;
}

let layout: PanelLayout | null = null;

function applyPreferences(): void {
  if (!layout) return;
  const prefs = loadPanelPreferences();
  const root = document.documentElement;
  root.style.setProperty("--dock-w", `${prefs.leftWidth}px`);
  root.style.setProperty("--inspector-w", `${prefs.rightWidth}px`);
  layout.dock.classList.toggle("is-collapsed", prefs.leftCollapsed);
  layout.dockResizer.hidden = prefs.leftCollapsed;
  layout.dockRestore.hidden = !prefs.leftCollapsed;
  layout.inspector.classList.toggle("is-collapsed", prefs.rightCollapsed);
  layout.inspectorResizer.hidden = prefs.rightCollapsed;
  layout.inspectorRestore.hidden = !prefs.rightCollapsed;
  layout.dock.setAttribute("aria-hidden", String(prefs.leftCollapsed));
  layout.inspector.setAttribute("aria-hidden", String(prefs.rightCollapsed));
  layout.dock.inert = prefs.leftCollapsed;
  layout.inspector.inert = prefs.rightCollapsed;
}

export function initPanelLayout(next: PanelLayout): void {
  layout = next;
  applyPreferences();
}

export function isSidebarCollapsed(): boolean {
  return layout
    ? layout.dock.classList.contains("is-collapsed")
    : loadPanelPreferences().leftCollapsed;
}

export function isInspectorCollapsed(): boolean {
  return layout
    ? layout.inspector.classList.contains("is-collapsed")
    : loadPanelPreferences().rightCollapsed;
}

export function setSidebarCollapsed(collapsed: boolean): void {
  savePanelPreferences({ leftCollapsed: collapsed });
  applyPreferences();
}

export function toggleSidebar(): void {
  setSidebarCollapsed(!isSidebarCollapsed());
}

export function setInspectorCollapsed(collapsed: boolean): void {
  savePanelPreferences({ rightCollapsed: collapsed });
  applyPreferences();
}

export function toggleInspector(): void {
  setInspectorCollapsed(!isInspectorCollapsed());
}

export function setPanelWidth(side: "left" | "right", width: number): void {
  if (side === "left") {
    savePanelPreferences({
      leftWidth: Math.max(PANEL_LIMITS.leftMin, Math.min(PANEL_LIMITS.leftMax, width)),
    });
  } else {
    savePanelPreferences({
      rightWidth: Math.max(PANEL_LIMITS.rightMin, Math.min(PANEL_LIMITS.rightMax, width)),
    });
  }
}

export function resetPanelLayout(): void {
  clearPanelPreferences();
  savePanelPreferences({ ...DEFAULT_PANELS });
  applyPreferences();
}

export function renderSidebar(refs: ShellRefs, actions: PanelActions): void {
  disconnectPageThumbnails();
  for (const tab of refs.dockTabs) {
    const active = tab.dataset.tab === store.ui.leftTab;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-pressed", String(active));
  }
  clear(refs.dockBody);
  clear(refs.dockFooter);
  if (!store.project) {
    const note = el("div", "empty-note");
    note.innerHTML = `${icon("folder", 26)}<div>Open a PDF or TIF drawing to start measuring.</div>`;
    refs.dockBody.append(note);
    return;
  }
  switch (store.ui.leftTab) {
    case "pages":
      renderPages(refs, actions);
      break;
    case "layers":
      renderLayers(refs, actions);
      break;
    case "symbols":
      renderSymbolLibrary(refs, actions);
      break;
  }
}

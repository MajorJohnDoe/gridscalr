import { el } from "./dom";
import { brandMark, icon } from "./icons";
import { createMenuBar, relabelMenuBar } from "./topMenu";
import { attachToolFamilyFlyout, attachToolFlyout } from "./toolFlyouts";
import {
  TOOLS,
  TOOL_BY_ID,
  TOOL_FAMILY_BY_ID,
  TOOL_FAMILY_BY_TOOL,
  familyToolForDisplay,
  isFamilyLeader,
  rememberFamilyTool,
  type ToolFamilyId,
} from "./toolDefs";
import { store, type LeftTab, type ToolId } from "../state/store";
import { APP_SHORTCUTS, formatShortcut } from "./shortcuts";
import {
  initPanelLayout,
  PANEL_LIMITS,
  setInspectorCollapsed,
  setPanelWidth,
  setSidebarCollapsed,
} from "./sidebar";
import { t } from "../i18n";

export interface ShellRefs {
  root: HTMLElement;
  topbar: HTMLElement;
  menuBar: HTMLElement;
  projectName: HTMLElement;
  docName: HTMLElement;
  docMeta: HTMLElement;
  dirtyDot: HTMLElement;
  undoBtn: HTMLButtonElement;
  redoBtn: HTMLButtonElement;
  zoomOutBtn: HTMLButtonElement;
  zoomInBtn: HTMLButtonElement;
  zoomFitBtn: HTMLButtonElement;
  zoomActualBtn: HTMLButtonElement;
  zoomReadout: HTMLButtonElement;
  pagePrevBtn: HTMLButtonElement;
  pageNextBtn: HTMLButtonElement;
  pageInput: HTMLInputElement;
  pageTotal: HTMLElement;
  toolRail: HTMLElement;
  markupsBtn: HTMLButtonElement;
  dockTabs: HTMLElement[];
  dockCollapse: HTMLButtonElement;
  dockRestore: HTMLButtonElement;
  dockResizer: HTMLElement;
  dockBody: HTMLElement;
  dockFooter: HTMLElement;
  contextBar: HTMLElement;
  inspector: HTMLElement;
  inspectorHeaderLabel: HTMLElement;
  inspectorRestore: HTMLButtonElement;
  inspectorResizer: HTMLElement;
  canvasArea: HTMLElement;
  canvasHost: HTMLElement;
  referencePane: HTMLElement;
  referenceHost: HTMLElement;
  splitResizer: HTMLElement;
  markupsResizer: HTMLElement;
  markupsPanel: HTMLElement;
  welcome: HTMLElement;
  statusCalibration: HTMLElement;
  statusCoords: HTMLElement;
  statusWarning: HTMLElement;
  statusZoom: HTMLElement;
  statusZoomLabel: HTMLElement;
  statusPage: HTMLElement;
  statusPageLabel: HTMLElement;
  statusLayer: HTMLElement;
}

function setIconButtonLabels(button: HTMLButtonElement, label: string, shortcut?: string): void {
  button.title = shortcut ? `${label} (${shortcut})` : label;
  button.setAttribute("aria-label", label);
}

function makeIconButton(iconName: string, label: string, shortcut?: string): HTMLButtonElement {
  const btn = el("button", "icon-btn");
  btn.type = "button";
  btn.innerHTML = icon(iconName, 16);
  setIconButtonLabels(btn, label, shortcut);
  return btn;
}

export function createShell(root: HTMLElement): ShellRefs {
  root.textContent = "";
  const shell = el("div", "app-shell");

  const topbar = el("header", "topbar");
  // The whole title row drags the window. Tauri treats buttons as clickable and
  // skips them, and the project name opts out below so double-click rename works.
  topbar.setAttribute("data-tauri-drag-region", "deep");
  const brand = el("div", "brand");
  brand.innerHTML = brandMark();
  brand.title = "GridScalr";

  const menuBar = createMenuBar();
  const history = el("div", "topbar-history");
  const undoBtn = makeIconButton("undo", t("menu.edit.undo"), formatShortcut(APP_SHORTCUTS.undo));
  const redoBtn = makeIconButton("redo", t("menu.edit.redo"), formatShortcut(APP_SHORTCUTS.redo));
  undoBtn.classList.add("topbar-history-btn");
  redoBtn.classList.add("topbar-history-btn");
  undoBtn.disabled = true;
  redoBtn.disabled = true;
  history.append(undoBtn, redoBtn);

  const identity = el("div", "doc-identity");
  const projectName = el("span", "project-name", t("shell.noProject"));
  // Opt out of the title-row drag region: double-clicking the name renames it.
  projectName.setAttribute("data-tauri-drag-region", "false");
  projectName.title = t("shell.renameHint");
  projectName.setAttribute("aria-label", t("shell.renameAria"));
  const docLine = el("span", "doc-line");
  const docName = el("span", "doc-name", t("shell.noDrawing"));
  const docMeta = el("span", "doc-meta", "");
  const dirtyDot = el("span", "dirty-dot hidden");
  docLine.append(docName, docMeta, dirtyDot);
  identity.append(projectName, docLine);

  const spacer = el("div", "topbar-spacer");
  const spacerEnd = el("div", "topbar-spacer");
  topbar.append(brand, menuBar, history, spacer, identity, spacerEnd);

  const workspace = el("div", "workspace");
  const toolRail = el("aside", "tool-rail");
  toolRail.setAttribute("aria-label", t("shell.toolsAria"));
  toolRail.setAttribute("role", "toolbar");
  toolRail.setAttribute("aria-orientation", "vertical");
  let lastGroup = "";
  for (const tool of TOOLS) {
    if (lastGroup && tool.group !== lastGroup) {
      toolRail.append(el("div", "tool-separator"));
    }
    lastGroup = tool.group;
    const family = TOOL_FAMILY_BY_TOOL.get(tool.id);
    if (family && !isFamilyLeader(tool.id)) continue;
    const btn = el("button", family ? "tool-btn tool-family" : "tool-btn");
    btn.type = "button";
    if (family) {
      const member = familyToolForDisplay(family, store.ui.activeTool);
      const memberTool = TOOL_BY_ID.get(member);
      const shortcuts = family.tools
        .map((id) => TOOL_BY_ID.get(id)?.shortcut)
        .filter(Boolean)
        .join(" / ");
      btn.dataset.toolGroup = family.id;
      btn.dataset.displayTool = member;
      btn.innerHTML = icon(memberTool?.icon ?? "cursor", 19);
      btn.title = `${t(family.label)} (${shortcuts})`;
      btn.setAttribute("aria-label", t("tool.familyTools", { name: t(family.label) }));
      btn.setAttribute("aria-haspopup", "menu");
      btn.addEventListener("click", () => {
        const next = familyToolForDisplay(family, store.ui.activeTool);
        rememberFamilyTool(next);
        store.setTool(next);
      });
      attachToolFamilyFlyout(btn, family);
    } else {
      btn.dataset.tool = tool.id;
      btn.innerHTML = icon(tool.icon, 19);
      btn.title = `${t(tool.label)} (${tool.shortcut})`;
      btn.setAttribute("aria-label", t(tool.label));
      btn.addEventListener("click", () => store.setTool(tool.id));
      attachToolFlyout(btn, tool.id);
    }
    toolRail.append(btn);
  }
  toolRail.append(el("div", "tool-spacer"));
  const markupsBtn = el("button", "tool-markups");
  markupsBtn.type = "button";
  markupsBtn.innerHTML = `${icon("markups", 18)}<span>${t("shell.markups")}</span>`;
  markupsBtn.title = t("shell.markupsListTitle", {
    shortcut: formatShortcut(APP_SHORTCUTS.markups),
  });
  markupsBtn.setAttribute("aria-label", t("shell.markupsList"));
  markupsBtn.setAttribute("aria-pressed", "false");
  toolRail.append(markupsBtn);

  const dock = el("aside", "left-dock");
  const dockHeader = el("div", "dock-header");
  const dockTabs = el("div", "dock-tabs");
  const tabDefs: Array<{ id: LeftTab; icon: string; label: string }> = [
    { id: "pages", icon: "pages", label: t("shell.pages") },
    { id: "layers", icon: "layers", label: t("shell.layers") },
  ];
  const dockTabButtons: HTMLElement[] = [];
  for (const tab of tabDefs) {
    const btn = el("button", "dock-tab");
    btn.type = "button";
    btn.dataset.tab = tab.id;
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = `${icon(tab.icon, 14)}<span>${tab.label}</span>`;
    btn.addEventListener("click", () => store.setLeftTab(tab.id));
    dockTabs.append(btn);
    dockTabButtons.push(btn);
  }
  const collapse = el("button", "dock-collapse");
  collapse.type = "button";
  collapse.title = t("shell.hideSidebarTitle", { shortcut: "Ctrl+\\" });
  collapse.setAttribute("aria-label", t("shell.hideSidebar"));
  collapse.innerHTML = icon("chevronLeft", 14);
  collapse.addEventListener("click", () => setSidebarCollapsed(true));
  dockHeader.append(dockTabs, collapse);
  const dockBody = el("div", "dock-body");
  const dockFooter = el("div", "dock-footer");
  dock.append(dockHeader, dockBody, dockFooter);

  const dockRestore = el("button", "dock-restore");
  dockRestore.type = "button";
  dockRestore.hidden = true;
  dockRestore.title = t("shell.showSidebarTitle", { shortcut: "Ctrl+\\" });
  dockRestore.setAttribute("aria-label", t("shell.showSidebar"));
  dockRestore.innerHTML = icon("chevronRight", 14);
  dockRestore.addEventListener("click", () => setSidebarCollapsed(false));

  const dockResizer = el("div", "resizer");
  dockResizer.title = t("shell.resizeSidebar");

  const main = el("main", "main-area");
  const contextBar = el("div", "context-bar");
  const canvasArea = el("div", "canvas-area");
  const canvasHost = el("div", "canvas-host");
  const referencePane = el("div", "canvas-reference hidden");
  referencePane.setAttribute("aria-label", t("shell.referenceView"));
  const referenceHost = el("div", "canvas-host reference-canvas");
  referenceHost.setAttribute("aria-label", t("shell.referenceDrawing"));
  referencePane.append(referenceHost);
  const splitResizer = el("div", "canvas-split-resizer hidden");
  splitResizer.title = t("shell.resizeReference");
  splitResizer.setAttribute("role", "separator");
  splitResizer.setAttribute("aria-label", t("shell.resizeReference"));
  splitResizer.setAttribute("aria-orientation", "vertical");
  splitResizer.tabIndex = 0;
  canvasArea.append(canvasHost, splitResizer, referencePane);
  const markupsResizer = el("div", "markups-resizer");
  markupsResizer.hidden = true;
  markupsResizer.title = t("shell.resizeMarkups");
  const markupsPanel = el("section", "markups-panel");
  markupsPanel.hidden = true;
  markupsPanel.setAttribute("aria-label", t("shell.markupsList"));
  main.append(contextBar, canvasArea, markupsResizer, markupsPanel);

  const inspector = el("aside", "inspector");
  inspector.setAttribute("aria-label", t("shell.properties"));
  const inspectorHeader = el("div", "inspector-header");
  const inspectorHeaderLabel = el("span", "", t("shell.properties"));
  inspectorHeader.append(inspectorHeaderLabel);
  inspector.append(inspectorHeader);

  const inspectorResizer = el("div", "resizer");

  const inspectorRestore = el("button", "inspector-restore");
  inspectorRestore.type = "button";
  inspectorRestore.hidden = true;
  inspectorRestore.title = t("shell.showPropertiesTitle", { shortcut: "Ctrl/Cmd+Shift+\\" });
  inspectorRestore.setAttribute("aria-label", t("shell.showProperties"));
  inspectorRestore.innerHTML = icon("chevronLeft", 14);
  inspectorRestore.addEventListener("click", () => setInspectorCollapsed(false));

  const welcome = el("div", "welcome hidden");
  canvasHost.append(welcome);

  workspace.append(
    toolRail,
    dock,
    dockRestore,
    dockResizer,
    main,
    inspectorResizer,
    inspector,
    inspectorRestore,
  );

  const statusbar = el("footer", "statusbar");
  const statusCalibration = el("div", "status-section");
  const statusCoords = el("div", "status-section");
  const statusWarning = el("div", "status-section status-warning");
  const statusZoom = el("div", "status-section status-controls");
  const statusPage = el("div", "status-section status-controls");
  const statusSpacer = el("div", "status-spacer");
  const statusLayer = el("div", "status-section");

  const zoomOutBtn = makeIconButton("zoomOut", t("shell.zoomOut"), "Ctrl+-");
  const zoomReadout = el("button", "zoom-readout", "100%");
  zoomReadout.type = "button";
  zoomReadout.title = t("shell.resetZoom");
  const zoomInBtn = makeIconButton("zoomIn", t("shell.zoomIn"), "Ctrl++");
  const zoomFitBtn = makeIconButton("fit", t("shell.fitPage"), "Ctrl+0");
  const zoomActualBtn = makeIconButton("target", t("shell.actualSize"));
  const statusZoomLabel = el("span", "status-label", t("shell.zoom"));
  statusZoom.append(statusZoomLabel, zoomOutBtn, zoomReadout, zoomInBtn, zoomFitBtn, zoomActualBtn);

  const pagePrevBtn = makeIconButton("chevronLeft", t("shell.previousPage"), t("shortcut.pageUp"));
  const pageInput = el("input", "page-input");
  pageInput.type = "number";
  pageInput.min = "1";
  pageInput.value = "1";
  pageInput.setAttribute("aria-label", t("shell.pageNumber"));
  const pageTotal = el("span", "page-total", "/ 0");
  const pageNextBtn = makeIconButton("chevronRight", t("shell.nextPage"), t("shortcut.pageDown"));
  const statusPageLabel = el("span", "status-label", t("shell.page"));
  statusPage.append(statusPageLabel, pagePrevBtn, pageInput, pageTotal, pageNextBtn);

  statusbar.append(
    statusCalibration,
    statusCoords,
    statusWarning,
    statusZoom,
    statusPage,
    statusSpacer,
    statusLayer,
  );

  shell.append(topbar, workspace, statusbar);
  root.append(shell);

  initPanelLayout({
    dock,
    dockResizer,
    dockRestore,
    inspector,
    inspectorResizer,
    inspectorRestore,
  });

  setupResizer(
    dockResizer,
    dock,
    "dock-w",
    PANEL_LIMITS.leftMin,
    PANEL_LIMITS.leftMax,
    false,
    (width) => setPanelWidth("left", width),
  );
  setupResizer(
    inspectorResizer,
    inspector,
    "inspector-w",
    PANEL_LIMITS.rightMin,
    PANEL_LIMITS.rightMax,
    true,
    (width) => setPanelWidth("right", width),
  );

  return {
    root,
    topbar,
    menuBar,
    projectName,
    docName,
    docMeta,
    dirtyDot,
    undoBtn,
    redoBtn,
    zoomOutBtn,
    zoomInBtn,
    zoomFitBtn,
    zoomActualBtn,
    zoomReadout,
    pagePrevBtn,
    pageNextBtn,
    pageInput,
    pageTotal,
    toolRail,
    markupsBtn,
    dockTabs: dockTabButtons,
    dockCollapse: collapse,
    dockRestore,
    dockResizer,
    dockBody,
    dockFooter,
    contextBar,
    inspector,
    inspectorHeaderLabel,
    inspectorRestore,
    inspectorResizer,
    canvasArea,
    canvasHost,
    referencePane,
    referenceHost,
    splitResizer,
    markupsResizer,
    markupsPanel,
    welcome,
    statusCalibration,
    statusCoords,
    statusWarning,
    statusZoom,
    statusZoomLabel,
    statusPage,
    statusPageLabel,
    statusLayer,
  };
}

function relabelToolRail(refs: ShellRefs): void {
  for (const button of refs.toolRail.querySelectorAll<HTMLElement>("[data-tool]")) {
    const tool = TOOL_BY_ID.get(button.dataset.tool as ToolId);
    if (!tool) continue;
    setIconButtonLabels(button as HTMLButtonElement, t(tool.label), tool.shortcut);
  }
  for (const button of refs.toolRail.querySelectorAll<HTMLElement>("[data-tool-group]")) {
    const family = TOOL_FAMILY_BY_ID.get(button.dataset.toolGroup as ToolFamilyId);
    if (!family) continue;
    const shortcuts = family.tools
      .map((id) => TOOL_BY_ID.get(id)?.shortcut)
      .filter(Boolean)
      .join(" / ");
    button.title = `${t(family.label)} (${shortcuts})`;
    button.setAttribute("aria-label", t("tool.familyTools", { name: t(family.label) }));
  }
  const markupsLabel = refs.markupsBtn.querySelector("span");
  if (markupsLabel) markupsLabel.textContent = t("shell.markups");
  refs.markupsBtn.title = t("shell.markupsListTitle", {
    shortcut: formatShortcut(APP_SHORTCUTS.markups),
  });
  refs.markupsBtn.setAttribute("aria-label", t("shell.markupsList"));
}

/** Re-applies the active language to the static shell chrome. */
export function relabelShell(refs: ShellRefs): void {
  relabelMenuBar();
  relabelToolRail(refs);

  refs.toolRail.setAttribute("aria-label", t("shell.toolsAria"));
  for (const button of refs.dockTabs) {
    const label = button.querySelector("span");
    if (label) {
      label.textContent = button.dataset.tab === "pages" ? t("shell.pages") : t("shell.layers");
    }
  }
  refs.dockCollapse.title = t("shell.hideSidebarTitle", { shortcut: "Ctrl+\\" });
  refs.dockCollapse.setAttribute("aria-label", t("shell.hideSidebar"));
  refs.dockRestore.title = t("shell.showSidebarTitle", { shortcut: "Ctrl+\\" });
  refs.dockRestore.setAttribute("aria-label", t("shell.showSidebar"));
  refs.dockResizer.title = t("shell.resizeSidebar");
  refs.inspector.setAttribute("aria-label", t("shell.properties"));
  refs.inspectorHeaderLabel.textContent = t("shell.properties");
  refs.inspectorRestore.title = t("shell.showPropertiesTitle", {
    shortcut: "Ctrl/Cmd+Shift+\\",
  });
  refs.inspectorRestore.setAttribute("aria-label", t("shell.showProperties"));
  refs.referencePane.setAttribute("aria-label", t("shell.referenceView"));
  refs.referenceHost.setAttribute("aria-label", t("shell.referenceDrawing"));
  refs.splitResizer.title = t("shell.resizeReference");
  refs.splitResizer.setAttribute("aria-label", t("shell.resizeReference"));
  refs.markupsResizer.title = t("shell.resizeMarkups");
  refs.markupsPanel.setAttribute("aria-label", t("shell.markupsList"));
  refs.statusZoomLabel.textContent = t("shell.zoom");
  refs.statusPageLabel.textContent = t("shell.page");

  setIconButtonLabels(refs.undoBtn, t("menu.edit.undo"), formatShortcut(APP_SHORTCUTS.undo));
  setIconButtonLabels(refs.redoBtn, t("menu.edit.redo"), formatShortcut(APP_SHORTCUTS.redo));
  setIconButtonLabels(refs.zoomOutBtn, t("shell.zoomOut"), "Ctrl+-");
  setIconButtonLabels(refs.zoomInBtn, t("shell.zoomIn"), "Ctrl++");
  setIconButtonLabels(refs.zoomFitBtn, t("shell.fitPage"), "Ctrl+0");
  setIconButtonLabels(refs.zoomActualBtn, t("shell.actualSize"));
  refs.zoomReadout.title = t("shell.resetZoom");
  setIconButtonLabels(refs.pagePrevBtn, t("shell.previousPage"), t("shortcut.pageUp"));
  setIconButtonLabels(refs.pageNextBtn, t("shell.nextPage"), t("shortcut.pageDown"));
  refs.pageInput.setAttribute("aria-label", t("shell.pageNumber"));
}

function setupResizer(
  handle: HTMLElement,
  panel: HTMLElement,
  variable: string,
  min: number,
  max: number,
  invert: boolean,
  onEnd?: (width: number) => void,
): void {
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("is-dragging");
    const startX = event.clientX;
    const startWidth = panel.getBoundingClientRect().width;
    let lastWidth = startWidth;
    const onMove = (move: PointerEvent) => {
      const delta = (move.clientX - startX) * (invert ? -1 : 1);
      const width = Math.max(min, Math.min(max, startWidth + delta));
      lastWidth = width;
      document.documentElement.style.setProperty(`--${variable}`, `${Math.round(width)}px`);
    };
    const onUp = () => {
      handle.classList.remove("is-dragging");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      onEnd?.(lastWidth);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp, { once: true });
  });
}

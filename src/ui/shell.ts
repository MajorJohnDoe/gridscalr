import { el } from "./dom";
import { brandMark, icon } from "./icons";
import { TOOLS } from "./toolDefs";
import { store, type LeftTab } from "../state/store";

export interface ShellRefs {
  root: HTMLElement;
  projectName: HTMLElement;
  docName: HTMLElement;
  docMeta: HTMLElement;
  dirtyDot: HTMLElement;
  openPdfBtn: HTMLButtonElement;
  openProjectBtn: HTMLButtonElement;
  saveBtn: HTMLButtonElement;
  exportBtn: HTMLButtonElement;
  importImageBtn: HTMLButtonElement;
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
  dockTabs: HTMLElement[];
  dockBody: HTMLElement;
  dockFooter: HTMLElement;
  contextBar: HTMLElement;
  inspector: HTMLElement;
  canvasHost: HTMLElement;
  welcome: HTMLElement;
  statusCalibration: HTMLElement;
  statusCoords: HTMLElement;
  statusZoom: HTMLElement;
  statusPage: HTMLElement;
  statusLayer: HTMLElement;
}

function makeIconButton(iconName: string, label: string, shortcut?: string): HTMLButtonElement {
  const btn = el("button", "icon-btn");
  btn.type = "button";
  btn.innerHTML = icon(iconName, 17);
  btn.title = shortcut ? `${label} (${shortcut})` : label;
  btn.setAttribute("aria-label", label);
  return btn;
}

export function createShell(root: HTMLElement): ShellRefs {
  root.textContent = "";
  const shell = el("div", "app-shell");

  const topbar = el("header", "topbar");
  const brand = el("div", "brand");
  brand.innerHTML = brandMark();
  const brandName = el("div", "brand-name");
  brandName.innerHTML = "Grid<span>Scalr</span>";
  brand.append(brandName);

  const identity = el("div", "doc-identity");
  const projectName = el("span", "project-name", "No project open");
  projectName.title = "Double-click to rename project";
  projectName.setAttribute("aria-label", "Project name; double-click to rename");
  const docLine = el("span", "doc-line");
  const docName = el("span", "doc-name", "No drawing open");
  const docMeta = el("span", "doc-meta", "");
  const dirtyDot = el("span", "dirty-dot hidden");
  docLine.append(docName, docMeta, dirtyDot);
  identity.append(projectName, docLine);

  const spacer = el("div", "topbar-spacer");

  const fileGroup = el("div", "topbar-group");
  const openPdfBtn = el("button", "btn btn-primary");
  openPdfBtn.type = "button";
  openPdfBtn.innerHTML = `${icon("folder", 15)}<span>Open drawing</span>`;
  openPdfBtn.title = "Open a PDF or TIF drawing (Ctrl+O)";
  const openProjectBtn = makeIconButton("file", "Open project", "Ctrl+Shift+O");
  const saveBtn = makeIconButton("save", "Save project", "Ctrl+S");
  const exportBtn = makeIconButton("download", "Export", "Ctrl+E");
  const importImageBtn = el("button", "btn btn-ghost");
  importImageBtn.type = "button";
  importImageBtn.innerHTML = `${icon("image", 15)}<span>Import image</span>`;
  importImageBtn.title = "Import a PNG or JPEG image (Ctrl+V also pastes images)";
  fileGroup.append(openPdfBtn, openProjectBtn, saveBtn, exportBtn, importImageBtn);

  const historyGroup = el("div", "topbar-group");
  const undoBtn = makeIconButton("undo", "Undo", "Ctrl+Z");
  const redoBtn = makeIconButton("redo", "Redo", "Ctrl+Shift+Z");
  historyGroup.append(undoBtn, redoBtn);

  const zoomGroup = el("div", "topbar-group");
  const zoomOutBtn = makeIconButton("zoomOut", "Zoom out", "Ctrl+-");
  const zoomReadout = el("button", "zoom-readout", "100%");
  zoomReadout.type = "button";
  zoomReadout.title = "Reset to 100%";
  const zoomInBtn = makeIconButton("zoomIn", "Zoom in", "Ctrl++");
  const zoomFitBtn = makeIconButton("fit", "Fit page", "Ctrl+0");
  const zoomActualBtn = makeIconButton("target", "Actual size (100%)");
  zoomGroup.append(zoomOutBtn, zoomReadout, zoomInBtn, zoomFitBtn, zoomActualBtn);

  const pageGroup = el("div", "topbar-group page-control");
  const pagePrevBtn = makeIconButton("chevronLeft", "Previous page", "Page Up");
  const pageInput = el("input", "page-input");
  pageInput.type = "number";
  pageInput.min = "1";
  pageInput.value = "1";
  pageInput.setAttribute("aria-label", "Page number");
  const pageTotal = el("span", "page-total", "/ 0");
  const pageNextBtn = makeIconButton("chevronRight", "Next page", "Page Down");
  pageGroup.append(pagePrevBtn, pageInput, pageTotal, pageNextBtn);

  topbar.append(brand, identity, spacer, fileGroup, historyGroup, zoomGroup, pageGroup);

  const workspace = el("div", "workspace");
  const toolRail = el("aside", "tool-rail");
  toolRail.setAttribute("aria-label", "Tools");
  toolRail.setAttribute("role", "toolbar");
  toolRail.setAttribute("aria-orientation", "vertical");
  let lastGroup = "";
  for (const tool of TOOLS) {
    if (lastGroup && tool.group !== lastGroup) {
      toolRail.append(el("div", "tool-separator"));
    }
    lastGroup = tool.group;
    const btn = el("button", "tool-btn");
    btn.type = "button";
    btn.dataset.tool = tool.id;
    btn.innerHTML = icon(tool.icon, 19);
    btn.title = `${tool.label} (${tool.shortcut})`;
    btn.setAttribute("aria-label", tool.label);
    btn.addEventListener("click", () => store.setTool(tool.id));
    toolRail.append(btn);
  }
  toolRail.append(el("div", "tool-spacer"));
  const keyboardHint = el("div", "tool-hint");
  keyboardHint.innerHTML = `${icon("keyboard", 15)}<div>Shortcuts</div>`;
  keyboardHint.title = "V select · K calibrate · L length · A area · P pen · R rect · T text";
  toolRail.append(keyboardHint);

  const dock = el("aside", "left-dock");
  const dockTabs = el("div", "dock-tabs");
  const tabDefs: Array<{ id: LeftTab; icon: string; label: string }> = [
    { id: "pages", icon: "pages", label: "Pages" },
    { id: "layers", icon: "layers", label: "Layers" },
    { id: "markups", icon: "markups", label: "Markups" },
    { id: "quantities", icon: "quantities", label: "Quantities" },
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
  const dockBody = el("div", "dock-body");
  const dockFooter = el("div", "dock-footer");
  dock.append(dockTabs, dockBody, dockFooter);

  const dockResizer = el("div", "resizer");
  dockResizer.title = "Resize panel";

  const main = el("main", "main-area");
  const contextBar = el("div", "context-bar");
  const canvasHost = el("div", "canvas-host");
  main.append(contextBar, canvasHost);

  const inspector = el("aside", "inspector");
  inspector.setAttribute("aria-label", "Properties");
  const inspectorHeader = el("div", "inspector-header", "Properties");
  inspector.append(inspectorHeader);

  const inspectorResizer = el("div", "resizer");

  const welcome = el("div", "welcome hidden");
  canvasHost.append(welcome);

  workspace.append(toolRail, dock, dockResizer, main, inspectorResizer, inspector);

  const statusbar = el("footer", "statusbar");
  const statusCalibration = el("div", "status-section");
  const statusCoords = el("div", "status-section");
  const statusZoom = el("div", "status-section");
  const statusPage = el("div", "status-section");
  const statusSpacer = el("div", "status-spacer");
  const statusLayer = el("div", "status-section");
  const statusLocal = el("div", "status-section");
  statusLocal.innerHTML = `<span class="status-chip"><span class="status-dot"></span>Local only</span>`;
  statusbar.append(
    statusCalibration,
    statusCoords,
    statusZoom,
    statusPage,
    statusSpacer,
    statusLayer,
    statusLocal,
  );

  shell.append(topbar, workspace, statusbar);
  root.append(shell);

  setupResizer(dockResizer, dock, "dock-w", 210, 420);
  setupResizer(inspectorResizer, inspector, "inspector-w", 250, 420, true);

  return {
    root,
    projectName,
    docName,
    docMeta,
    dirtyDot,
    openPdfBtn,
    openProjectBtn,
    saveBtn,
    exportBtn,
    importImageBtn,
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
    dockTabs: dockTabButtons,
    dockBody,
    dockFooter,
    contextBar,
    inspector,
    canvasHost,
    welcome,
    statusCalibration,
    statusCoords,
    statusZoom,
    statusPage,
    statusLayer,
  };
}

function setupResizer(
  handle: HTMLElement,
  panel: HTMLElement,
  variable: string,
  min: number,
  max: number,
  invert = false,
): void {
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("is-dragging");
    const startX = event.clientX;
    const startWidth = panel.getBoundingClientRect().width;
    const onMove = (move: PointerEvent) => {
      const delta = (move.clientX - startX) * (invert ? -1 : 1);
      const width = Math.max(min, Math.min(max, startWidth + delta));
      document.documentElement.style.setProperty(`--${variable}`, `${Math.round(width)}px`);
    };
    const onUp = () => {
      handle.classList.remove("is-dragging");
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp, { once: true });
  });
}

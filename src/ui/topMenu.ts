import { hasClipboard } from "../model/clipboard";
import { clearRecent, getRecent } from "../io/platform";
import { store } from "../state/store";
import { openCategoriesDialog } from "./categoriesDialog";
import { el } from "./dom";
import { openHelp } from "./helpDialog";
import { icon } from "./icons";
import type { PanelActions } from "./panels";
import {
  isInspectorCollapsed,
  isSidebarCollapsed,
  resetPanelLayout,
  toggleInspector,
  toggleSidebar,
} from "./sidebar";
import { openSettingsDialog } from "./settingsDialog";
import { isMarkupsOpen } from "./markupsPanel";
import { APP_SHORTCUTS, formatShortcut } from "./shortcuts";
import { toast } from "./toast";

interface ActionItem {
  kind: "action";
  label: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  action: () => void;
}

interface SeparatorItem {
  kind: "separator";
}

interface SubmenuItem {
  kind: "submenu";
  label: string;
  key?: string;
  disabled?: boolean;
  items: MenuItem[];
}

type MenuItem = ActionItem | SeparatorItem | SubmenuItem;

interface MenuDefinition {
  id: string;
  label: string;
  items: () => MenuItem[];
}

function action(
  label: string,
  run: () => void,
  options: { shortcut?: string; disabled?: boolean; checked?: boolean; danger?: boolean } = {},
): ActionItem {
  return {
    kind: "action",
    label,
    shortcut: options.shortcut ? formatShortcut(options.shortcut) : undefined,
    disabled: options.disabled,
    checked: options.checked,
    danger: options.danger,
    action: run,
  };
}

function separator(): SeparatorItem {
  return { kind: "separator" };
}

function hasSelection(): boolean {
  return store.ui.selection.length > 0;
}

function buildMenus(actions: PanelActions): MenuDefinition[] {
  const project = store.project;
  const hasProject = Boolean(project);
  const recent = getRecent();

  return [
    {
      id: "file",
      label: "File",
      items: () => [
        action("New project…", actions.newProject, { shortcut: APP_SHORTCUTS.newProject }),
        action("Open project…", actions.openProject, { shortcut: APP_SHORTCUTS.openProject }),
        action("Open drawing…", actions.openPdf, { shortcut: APP_SHORTCUTS.openDrawing }),
        action("Compare revisions…", actions.openCompare, { disabled: !hasProject }),
        {
          kind: "submenu",
          label: "Open recent",
          disabled: recent.length === 0,
          items: recent.length
            ? [
                ...recent
                  .slice(0, 10)
                  .map((entry) =>
                    action(
                      `${entry.name}  ·  ${entry.kind === "project" ? "Project" : "Drawing"}`,
                      () => actions.openRecent(entry),
                    ),
                  ),
                separator(),
                action("Clear recent list", () => {
                  clearRecent();
                  actions.refresh();
                  toast("Recent list cleared.", "info");
                }),
              ]
            : [action("No recent files", () => undefined, { disabled: true })],
        },
        separator(),
        action("Save", actions.saveProject, {
          shortcut: APP_SHORTCUTS.save,
          disabled: !hasProject,
        }),
        action("Save as…", actions.saveProjectAs, {
          shortcut: APP_SHORTCUTS.saveAs,
          disabled: !hasProject,
        }),
        separator(),
        action("Import image…", actions.insertImage, { disabled: !hasProject }),
        {
          kind: "submenu",
          label: "Export",
          key: "export",
          disabled: !hasProject,
          items: [
            action("Drawing PDF…", () => actions.exportAs("drawing")),
            action("View as PNG", () => actions.exportAs("png")),
            separator(),
            action("Markups to CSV", () => actions.exportAs("csv")),
            action("Quantities to CSV", () => actions.exportAs("quantity-csv")),
            action("Quantities to Excel…", () => actions.exportAs("quantity-xlsx")),
            action("Quantity report (PDF)", () => actions.exportAs("quantity-pdf")),
            separator(),
            action("Project to JSON", () => actions.exportAs("json")),
          ],
        },
        separator(),
        action("Close project", actions.closeProject, { disabled: !hasProject }),
        action("Quit", actions.quit, { shortcut: APP_SHORTCUTS.quit }),
      ],
    },
    {
      id: "edit",
      label: "Edit",
      items: () => [
        action("Undo", actions.undo, { shortcut: APP_SHORTCUTS.undo, disabled: !store.canUndo }),
        action("Redo", actions.redo, {
          shortcut: APP_SHORTCUTS.redo,
          disabled: !store.canRedo,
        }),
        separator(),
        action("Cut", actions.cutSelection, {
          shortcut: APP_SHORTCUTS.cut,
          disabled: !hasSelection(),
        }),
        action("Copy", actions.copySelection, {
          shortcut: APP_SHORTCUTS.copy,
          disabled: !hasSelection(),
        }),
        action("Paste", actions.pasteSelection, {
          shortcut: APP_SHORTCUTS.paste,
          disabled: !hasProject || !hasClipboard(project!),
        }),
        action("Duplicate", actions.duplicateSelection, {
          shortcut: APP_SHORTCUTS.duplicate,
          disabled: !hasSelection(),
        }),
        action(APP_SHORTCUTS.delete, actions.deleteSelection, {
          shortcut: APP_SHORTCUTS.delete,
          disabled: !hasSelection(),
          danger: true,
        }),
        separator(),
        action("Rename", actions.renameSelection, {
          shortcut: APP_SHORTCUTS.rename,
          disabled: store.ui.selection.length !== 1,
        }),
      ],
    },
    {
      id: "view",
      label: "View",
      items: () => [
        action("Sidebar", toggleSidebar, {
          shortcut: APP_SHORTCUTS.sidebar,
          checked: !isSidebarCollapsed(),
        }),
        action("Properties", toggleInspector, {
          shortcut: APP_SHORTCUTS.properties,
          checked: !isInspectorCollapsed(),
        }),
        separator(),
        action("Split view", actions.toggleSplitView, {
          shortcut: APP_SHORTCUTS.splitView,
          checked: actions.isSplitViewOpen(),
          disabled: !hasProject,
        }),
        separator(),
        action("Zoom in", actions.zoomIn, {
          shortcut: APP_SHORTCUTS.zoomIn,
          disabled: !hasProject,
        }),
        action("Zoom out", actions.zoomOut, {
          shortcut: APP_SHORTCUTS.zoomOut,
          disabled: !hasProject,
        }),
        action("Fit page", actions.zoomFit, {
          shortcut: APP_SHORTCUTS.fitPage,
          disabled: !hasProject,
        }),
        action("Actual size", actions.zoomActual, {
          shortcut: APP_SHORTCUTS.actualSize,
          disabled: !hasProject,
        }),
        separator(),
        action("Show grid", () => toggleSetting("showGrid"), {
          checked: project?.settings.showGrid ?? false,
          disabled: !hasProject,
        }),
        action("Show scale line", () => toggleSetting("showCalibration"), {
          checked: project?.settings.showCalibration ?? false,
          disabled: !hasProject,
        }),
        action("Snap to geometry", () => toggleSetting("snapToGeometry"), {
          checked: project?.settings.snapToGeometry ?? false,
          disabled: !hasProject,
        }),
        separator(),
        action("Markups list…", actions.toggleMarkups, {
          shortcut: APP_SHORTCUTS.markups,
          disabled: !hasProject,
          checked: isMarkupsOpen(),
        }),
        action("Quantities…", actions.openQuantities, {
          shortcut: APP_SHORTCUTS.quantities,
          disabled: !hasProject,
        }),
      ],
    },
    {
      id: "settings",
      label: "Settings",
      items: () => [
        action("Project settings…", () => openSettingsDialog(), {
          shortcut: APP_SHORTCUTS.settings,
          disabled: !hasProject,
        }),
        action("Manage categories…", () => void openCategoriesDialog(), {
          disabled: !hasProject,
        }),
        separator(),
        action("Reset panel layout", () => {
          resetPanelLayout();
          toast("Panel layout reset.", "success");
        }),
      ],
    },
    {
      id: "help",
      label: "Help",
      items: () => [
        action("Workflows", () => openHelp("workflows")),
        action("User guide", () => openHelp("guide"), { shortcut: APP_SHORTCUTS.userGuide }),
        action("Keyboard shortcuts", () => openHelp("shortcuts"), {
          shortcut: APP_SHORTCUTS.shortcuts,
        }),
        separator(),
        action("About GridScalr", () => openHelp("about")),
      ],
    },
  ];
}

function toggleSetting(key: "showGrid" | "showCalibration" | "snapToGeometry"): void {
  store.mutate((project) => {
    project.settings[key] = !project.settings[key];
  }, "change");
}

let menuActions: PanelActions | null = null;
const menuButtons = new Map<string, HTMLButtonElement>();
let menuRoot: HTMLElement | null = null;
let openMenuId: string | null = null;
let openedByHover = false;
let panels: HTMLElement[] = [];

export function setMenuActions(actions: PanelActions): void {
  menuActions = actions;
}

export function createMenuBar(): HTMLElement {
  const bar = el("nav", "menubar");
  bar.setAttribute("role", "menubar");
  bar.setAttribute("aria-label", "Main menu");

  for (const [index, definition] of [
    { id: "file", label: "File" },
    { id: "edit", label: "Edit" },
    { id: "view", label: "View" },
    { id: "settings", label: "Settings" },
    { id: "help", label: "Help" },
  ].entries()) {
    const button = el("button", "menu-trigger", definition.label);
    button.type = "button";
    button.dataset.menu = definition.id;
    button.accessKey = definition.label.charAt(0).toLowerCase();
    button.setAttribute("role", "menuitem");
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (openMenuId === definition.id) {
        if (openedByHover) {
          openedByHover = false;
          return;
        }
        closeMenus();
      } else {
        openMenu(definition.id, true);
      }
    });
    button.addEventListener("pointerenter", () => {
      if (menuRoot && openMenuId !== definition.id) openMenu(definition.id, false, true);
    });
    button.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openMenu(definition.id, true);
      } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const step = event.key === "ArrowRight" ? 1 : -1;
        const next = (index + step + menuButtons.size) % menuButtons.size;
        const target = [...menuButtons.values()][next];
        target.focus();
        if (menuRoot) openMenu(target.dataset.menu ?? "file", true);
      }
    });
    menuButtons.set(definition.id, button);
    bar.append(button);
  }
  return bar;
}

function openMenu(id: string, focusFirst: boolean, byHover = false): void {
  if (!menuActions) return;
  closeMenus();
  const button = menuButtons.get(id);
  const definition = buildMenus(menuActions).find((entry) => entry.id === id);
  if (!button || !definition) return;
  openMenuId = id;
  openedByHover = byHover;
  button.setAttribute("aria-expanded", "true");
  button.classList.add("is-open");

  const root = el("div", "menu-root");
  root.addEventListener("mousedown", (event) => {
    if (event.target === root) closeMenus();
  });
  const panel = createPanel(definition.items(), 0);
  root.append(panel);
  document.body.append(root);
  menuRoot = root;
  panels = [panel];

  const rect = button.getBoundingClientRect();
  positionPanel(panel, rect.left, rect.bottom + 8);
  if (focusFirst) {
    focusFirstItem(panel);
  }
}

function createPanel(items: MenuItem[], level: number): HTMLElement {
  const panel = el("div", "menu-panel");
  panel.setAttribute("role", "menu");
  panel.dataset.level = String(level);

  for (const item of items) {
    if (item.kind === "separator") {
      const line = el("div", "menu-separator");
      line.setAttribute("role", "separator");
      panel.append(line);
      continue;
    }

    if (item.kind === "submenu") {
      const button = el("button", "menu-item menu-submenu");
      button.type = "button";
      button.setAttribute("role", "menuitem");
      button.setAttribute("aria-haspopup", "menu");
      button.setAttribute("aria-expanded", "false");
      button.disabled = item.disabled === true;
      if (item.key) button.dataset.submenu = item.key;
      button.append(
        el("span", "menu-check"),
        el("span", "menu-label", item.label),
        el("span", "menu-arrow", "›"),
      );
      const open = () => {
        if (button.disabled) return;
        openSubmenu(button, item.items, level + 1);
      };
      button.addEventListener("pointerenter", open);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        open();
        focusFirstItem(panels[level + 1] ?? button);
      });
      panel.append(button);
      continue;
    }

    const button = el("button", `menu-item${item.danger ? " is-danger" : ""}`);
    button.type = "button";
    button.setAttribute("role", item.checked === undefined ? "menuitem" : "menuitemcheckbox");
    if (item.checked !== undefined) button.setAttribute("aria-checked", String(item.checked));
    button.disabled = item.disabled === true;
    const check = el("span", "menu-check");
    if (item.checked) check.innerHTML = icon("check", 12);
    const label = el("span", "menu-label", item.label);
    const hint = el("span", "menu-shortcut", item.shortcut ?? "");
    button.append(check, label, hint);
    button.addEventListener("pointerenter", () => closeSubmenusAbove(level));
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (button.disabled) return;
      closeMenus();
      item.action();
    });
    panel.append(button);
  }

  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (level > 0) {
        buttonsAtLevel(level);
        focusItemButton(level - 1);
      } else {
        const trigger = openMenuId ? menuButtons.get(openMenuId) : undefined;
        closeMenus();
        trigger?.focus();
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(panel, event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "ArrowRight") {
      const focused = document.activeElement as HTMLElement | null;
      if (focused?.classList.contains("menu-submenu")) {
        event.preventDefault();
        focused.click();
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      if (level > 0) {
        event.preventDefault();
        closeSubmenusAbove(level - 1);
        focusItemButton(level - 1);
      } else if (openMenuId) {
        event.preventDefault();
        const ids = [...menuButtons.keys()];
        const next = ids[(ids.indexOf(openMenuId) - 1 + ids.length) % ids.length];
        openMenu(next, true);
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      const focused = document.activeElement as HTMLElement | null;
      if (focused?.classList.contains("menu-item")) {
        event.preventDefault();
        focused.click();
      }
    }
  });

  return panel;
}

function positionPanel(panel: HTMLElement, left: number, top: number): void {
  panel.style.left = `${Math.max(8, left)}px`;
  panel.style.top = `${Math.max(8, top)}px`;
  const rect = panel.getBoundingClientRect();
  if (rect.right > window.innerWidth - 8) {
    panel.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
  }
  if (rect.bottom > window.innerHeight - 8) {
    panel.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
  }
}

function openSubmenu(anchor: HTMLElement, items: MenuItem[], level: number): void {
  closeSubmenusAbove(level - 1);
  const existing = panels[level];
  if (existing) {
    existing.remove();
    panels = panels.slice(0, level);
  }
  const panel = createPanel(items, level);
  menuRoot?.append(panel);
  panels[level] = panel;
  const rect = anchor.getBoundingClientRect();
  positionPanel(panel, rect.right + 3, rect.top - 4);
  anchor.setAttribute("aria-expanded", "true");
  anchor.classList.add("is-open");
}

function closeSubmenusAbove(level: number): void {
  for (let index = panels.length - 1; index > level; index -= 1) {
    panels[index]?.remove();
    panels.pop();
  }
  for (const panel of panels) {
    for (const item of panel.querySelectorAll<HTMLElement>(".menu-submenu.is-open")) {
      item.classList.remove("is-open");
      item.setAttribute("aria-expanded", "false");
    }
  }
}

function buttonsAtLevel(level: number): void {
  panels[level]?.remove();
  panels = panels.slice(0, level);
}

function focusFirstItem(panel: HTMLElement | undefined): void {
  if (!panel) return;
  const items = [...panel.querySelectorAll<HTMLButtonElement>(".menu-item:not(:disabled)")];
  items[0]?.focus();
}

function focusItemButton(level: number): void {
  const panel = panels[level];
  if (!panel) return;
  const open = panel.querySelector<HTMLButtonElement>(".menu-submenu.is-open");
  if (open) {
    open.focus();
    return;
  }
  const items = [...panel.querySelectorAll<HTMLButtonElement>(".menu-submenu")];
  items[items.length - 1]?.focus();
}

function moveFocus(panel: HTMLElement, step: number): void {
  const items = [...panel.querySelectorAll<HTMLButtonElement>(".menu-item:not(:disabled)")];
  if (!items.length) return;
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  const next = index < 0 ? 0 : (index + step + items.length) % items.length;
  items[next].focus();
}

export function closeMenus(): void {
  if (openMenuId) {
    const button = menuButtons.get(openMenuId);
    button?.classList.remove("is-open");
    button?.setAttribute("aria-expanded", "false");
  }
  menuRoot?.remove();
  menuRoot = null;
  openMenuId = null;
  openedByHover = false;
  panels = [];
}

export function openExportMenu(): void {
  if (!menuActions) return;
  openMenu("file", false);
  const trigger = menuRoot?.querySelector<HTMLElement>('.menu-submenu[data-submenu="export"]');
  trigger?.dispatchEvent(new MouseEvent("pointerenter", { bubbles: false }));
  focusFirstItem(panels[1]);
}

document.addEventListener("mousedown", (event) => {
  if (!menuRoot) return;
  const target = event.target as Node;
  if (menuRoot.contains(target)) return;
  if (target instanceof Element && target.closest(".menubar")) return;
  closeMenus();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuRoot) {
    event.preventDefault();
    event.stopPropagation();
    closeMenus();
  }
});

window.addEventListener("resize", () => closeMenus());
window.addEventListener("blur", () => closeMenus());

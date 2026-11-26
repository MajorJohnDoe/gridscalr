import { hasClipboard } from "../model/clipboard";
import { updateProjectSettings } from "../model/commands/settings";
import { store } from "../state/store";
import { el } from "./dom";
import { openHelp } from "./helpDialog";
import { icon } from "./icons";
import type { PanelActions } from "./panels";
import {
  isInspectorCollapsed,
  isSidebarCollapsed,
  toggleInspector,
  toggleSidebar,
} from "./sidebar";
import { openPreferencesDialog } from "./preferencesDialog";
import { openSettingsDialog } from "./settingsDialog";
import { isMarkupsOpen } from "./markupsPanel";
import { isSummaryOpen } from "../features/schedules";
import { isPerfPanelOpen, togglePerformancePanel } from "../features/perfMonitor";
import { openTakeoffSettingsDialog } from "../features/takeoffSettings";
import { APP_SHORTCUTS } from "./shortcuts";
import { t } from "../i18n";
import { fileMenu } from "./menus/fileMenu";
import { action, separator, type MenuDefinition, type MenuItem } from "./menus/menuItems";

function hasSelection(): boolean {
  return store.ui.selection.length > 0;
}

function buildMenus(actions: PanelActions): MenuDefinition[] {
  const project = store.project;
  const hasProject = Boolean(project);
  const viewOnly = store.readOnly;

  return [
    fileMenu(actions),
    {
      id: "edit",
      label: t("menu.edit"),
      items: () => [
        action(t("menu.edit.undo"), actions.undo, {
          shortcut: APP_SHORTCUTS.undo,
          disabled: viewOnly || !store.canUndo,
        }),
        action(t("menu.edit.redo"), actions.redo, {
          shortcut: APP_SHORTCUTS.redo,
          disabled: viewOnly || !store.canRedo,
        }),
        separator(),
        action(t("menu.edit.cut"), actions.cutSelection, {
          shortcut: APP_SHORTCUTS.cut,
          disabled: viewOnly || !hasSelection(),
        }),
        action(t("menu.edit.copy"), actions.copySelection, {
          shortcut: APP_SHORTCUTS.copy,
          disabled: !hasSelection(),
        }),
        action(t("menu.edit.paste"), actions.pasteSelection, {
          shortcut: APP_SHORTCUTS.paste,
          disabled: viewOnly || !hasProject || !hasClipboard(project!),
        }),
        action(t("menu.edit.duplicate"), actions.duplicateSelection, {
          shortcut: APP_SHORTCUTS.duplicate,
          disabled: viewOnly || !hasSelection(),
        }),
        action(t("menu.edit.delete"), actions.deleteSelection, {
          shortcut: APP_SHORTCUTS.delete,
          disabled: viewOnly || !hasSelection(),
          danger: true,
        }),
        separator(),
        action(t("menu.edit.rename"), actions.renameSelection, {
          shortcut: APP_SHORTCUTS.rename,
          disabled: viewOnly || store.ui.selection.length !== 1,
        }),
      ],
    },
    {
      id: "view",
      label: t("menu.view"),
      items: () => [
        action(t("menu.view.sidebar"), toggleSidebar, {
          shortcut: APP_SHORTCUTS.sidebar,
          checked: !isSidebarCollapsed(),
        }),
        action(t("menu.view.properties"), toggleInspector, {
          shortcut: APP_SHORTCUTS.properties,
          checked: !isInspectorCollapsed(),
        }),
        separator(),
        action(t("menu.view.reference"), actions.toggleSplitView, {
          shortcut: APP_SHORTCUTS.splitView,
          checked: actions.isSplitViewOpen(),
          disabled: !hasProject || actions.hasReferenceSession(),
        }),
        separator(),
        action(t("menu.view.zoomIn"), actions.zoomIn, {
          shortcut: APP_SHORTCUTS.zoomIn,
          disabled: !hasProject,
        }),
        action(t("menu.view.zoomOut"), actions.zoomOut, {
          shortcut: APP_SHORTCUTS.zoomOut,
          disabled: !hasProject,
        }),
        action(t("menu.view.fitPage"), actions.zoomFit, {
          shortcut: APP_SHORTCUTS.fitPage,
          disabled: !hasProject,
        }),
        action(t("menu.view.actualSize"), actions.zoomActual, {
          shortcut: APP_SHORTCUTS.actualSize,
          disabled: !hasProject,
        }),
        separator(),
        action(t("menu.view.showGrid"), () => toggleSetting("showGrid"), {
          checked: project?.settings.showGrid ?? false,
          disabled: !hasProject || viewOnly,
        }),
        action(t("menu.view.showScale"), () => toggleSetting("showCalibration"), {
          checked: project?.settings.showCalibration ?? false,
          disabled: !hasProject || viewOnly,
        }),
        action(t("menu.view.snap"), () => toggleSetting("snapToGeometry"), {
          checked: project?.settings.snapToGeometry ?? false,
          disabled: !hasProject || viewOnly,
        }),
        separator(),
        action(t("menu.view.search"), actions.openSearch, {
          shortcut: APP_SHORTCUTS.searchText,
          disabled: !hasProject,
        }),
        separator(),
        action(t("menu.view.markups"), actions.toggleMarkups, {
          shortcut: APP_SHORTCUTS.markups,
          disabled: !hasProject,
          checked: isMarkupsOpen(),
        }),
        action(t("menu.view.quantities"), actions.openQuantities, {
          shortcut: APP_SHORTCUTS.quantities,
          disabled: !hasProject,
        }),
        action(t("menu.view.summary"), actions.toggleSummary, {
          shortcut: APP_SHORTCUTS.summary,
          disabled: !hasProject,
          checked: isSummaryOpen(),
        }),
        action(t("menu.view.takeoffSettings"), () => void openTakeoffSettingsDialog(), {
          disabled: !hasProject || viewOnly,
        }),
        action(t("menu.view.spaces"), actions.openSpaces, {
          disabled: !hasProject,
        }),
      ],
    },
    {
      id: "settings",
      label: t("menu.settings"),
      items: () => [
        action(t("menu.settings.preferences"), () => openPreferencesDialog()),
        action(t("menu.settings.project"), () => openSettingsDialog(), {
          shortcut: APP_SHORTCUTS.settings,
          disabled: !hasProject || viewOnly,
        }),
      ],
    },
    {
      id: "help",
      label: t("menu.help"),
      items: () => [
        action(t("menu.help.workflows"), () => openHelp("workflows")),
        action(t("menu.help.guide"), () => openHelp("guide"), {
          shortcut: APP_SHORTCUTS.userGuide,
        }),
        action(t("menu.help.shortcuts"), () => openHelp("shortcuts"), {
          shortcut: APP_SHORTCUTS.shortcuts,
        }),
        separator(),
        {
          kind: "submenu",
          label: t("menu.help.diagnosticsGroup"),
          items: [
            action(t("menu.help.diagnostics"), actions.copyDiagnostics),
            action(t("menu.help.report"), actions.reportProblem),
            separator(),
            action(t("menu.help.performance"), () => togglePerformancePanel(), {
              checked: isPerfPanelOpen(),
            }),
          ],
        },
        separator(),
        action(t("menu.help.about"), () => openHelp("about")),
      ],
    },
  ];
}

function toggleSetting(key: "showGrid" | "showCalibration" | "snapToGeometry"): void {
  store.mutate((project) => {
    updateProjectSettings(project, { [key]: !project.settings[key] });
  }, "change");
}

let menuActions: PanelActions | null = null;
const menuButtons = new Map<string, HTMLButtonElement>();
let menuBarRoot: HTMLElement | null = null;
let menuRoot: HTMLElement | null = null;
let openMenuId: string | null = null;
let openedByHover = false;
let panels: HTMLElement[] = [];
const submenuAnchors = new Map<number, HTMLElement>();

/** Top-level menu buttons, shared by the initial build and the relabel pass. */
const MENU_TRIGGERS = [
  { id: "file", label: () => t("menu.file") },
  { id: "edit", label: () => t("menu.edit") },
  { id: "view", label: () => t("menu.view") },
  { id: "settings", label: () => t("menu.settings") },
  { id: "help", label: () => t("menu.help") },
] as const;

export function setMenuActions(actions: PanelActions): void {
  menuActions = actions;
}

/** Re-applies the active language to the top-level menu buttons. */
export function relabelMenuBar(): void {
  if (!menuBarRoot) return;
  menuBarRoot.setAttribute("aria-label", t("menu.mainAria"));
  for (const definition of MENU_TRIGGERS) {
    const button = menuButtons.get(definition.id);
    if (!button) continue;
    const label = definition.label();
    button.textContent = label;
    button.accessKey = label.charAt(0).toLowerCase();
  }
}

export function createMenuBar(): HTMLElement {
  const bar = el("nav", "menubar");
  bar.setAttribute("role", "menubar");
  bar.setAttribute("aria-label", t("menu.mainAria"));
  menuBarRoot = bar;

  for (const [index, definition] of MENU_TRIGGERS.entries()) {
    const label = definition.label();
    const button = el("button", "menu-trigger", label);
    button.type = "button";
    button.dataset.menu = definition.id;
    button.accessKey = label.charAt(0).toLowerCase();
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
  submenuAnchors.clear();

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
        const anchor = submenuAnchors.get(level);
        closePanelAt(level);
        anchor?.focus();
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
        const anchor = submenuAnchors.get(level);
        closePanelAt(level);
        anchor?.focus();
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
  const panel = createPanel(items, level);
  menuRoot?.append(panel);
  panels[level] = panel;
  submenuAnchors.set(level, anchor);
  const rect = anchor.getBoundingClientRect();
  positionPanel(panel, rect.right + 3, rect.top - 4);
  anchor.setAttribute("aria-expanded", "true");
  anchor.classList.add("is-open");
}

function closeSubmenusAbove(level: number): void {
  for (let index = panels.length - 1; index > level; index -= 1) {
    panels[index]?.remove();
    panels.pop();
    submenuAnchors.delete(index);
  }
  for (const panel of panels) {
    for (const item of panel.querySelectorAll<HTMLElement>(".menu-submenu.is-open")) {
      item.classList.remove("is-open");
      item.setAttribute("aria-expanded", "false");
    }
  }
}

/** Removes the panel at `level` and every deeper panel, then focuses the parent item. */
function closePanelAt(level: number): void {
  for (let index = panels.length - 1; index >= level; index -= 1) {
    panels[index]?.remove();
    panels.pop();
    const anchor = submenuAnchors.get(index);
    submenuAnchors.delete(index);
    anchor?.classList.remove("is-open");
    anchor?.setAttribute("aria-expanded", "false");
  }
}

function focusFirstItem(panel: HTMLElement | undefined): void {
  if (!panel) return;
  const items = [...panel.querySelectorAll<HTMLButtonElement>(".menu-item:not(:disabled)")];
  items[0]?.focus();
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
  submenuAnchors.clear();
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

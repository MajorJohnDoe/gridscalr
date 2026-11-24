import { t } from "../../i18n";
import { clearRecent, getRecent, isTauri } from "../../io/platform";
import { store } from "../../state/store";
import type { PanelActions } from "../panels";
import { APP_SHORTCUTS } from "../shortcuts";
import { toast } from "../toast";
import { action, separator, type MenuDefinition, type MenuItem } from "./menuItems";

/** The File menu, grouped so the primary file and project commands stay scannable. */
export function fileMenu(actions: PanelActions): MenuDefinition {
  return {
    id: "file",
    label: t("menu.file"),
    items: () => fileMenuItems(actions),
  };
}

function fileMenuItems(actions: PanelActions): MenuItem[] {
  const project = store.project;
  const hasProject = Boolean(project);
  const viewOnly = store.readOnly;
  const recent = getRecent();

  return [
    action(t("menu.file.newProject"), actions.newProject, {
      shortcut: APP_SHORTCUTS.newProject,
    }),
    action(t("menu.file.openProject"), actions.openProject, {
      shortcut: APP_SHORTCUTS.openProject,
    }),
    action(t("menu.file.openDrawing"), actions.openPdf, {
      shortcut: APP_SHORTCUTS.openDrawing,
    }),
    recentMenu(actions, recent),
    separator(),
    action(t("menu.file.save"), actions.saveProject, {
      shortcut: APP_SHORTCUTS.save,
      disabled: !hasProject || viewOnly,
    }),
    action(t("menu.file.saveAs"), actions.saveProjectAs, {
      shortcut: APP_SHORTCUTS.saveAs,
      disabled: !hasProject || viewOnly,
    }),
    action(t("menu.file.saveCopy"), actions.saveProjectCopy, {
      disabled: !hasProject,
    }),
    separator(),
    {
      kind: "submenu",
      label: t("menu.file.importGroup"),
      items: [
        action(t("menu.file.importProjectPages"), actions.importProjectPages, {
          disabled: !hasProject || viewOnly,
        }),
        action(t("menu.file.importImage"), actions.insertImage, {
          disabled: !hasProject || viewOnly,
        }),
        action(t("menu.file.consolidateDrawings"), actions.consolidateDrawings, {
          disabled: !hasProject || viewOnly,
        }),
      ],
    },
    {
      kind: "submenu",
      label: t("menu.file.compareGroup"),
      items: [
        action(t("menu.file.compareRevision"), actions.openCompare, { disabled: !hasProject }),
        action(t("menu.file.compareDrawing"), actions.openDrawingReference, {
          disabled: !hasProject,
        }),
      ],
    },
    separator(),
    {
      kind: "submenu",
      label: t("menu.file.shareGroup"),
      items: [
        action(t("menu.file.sendByEmail"), actions.sendByEmail, {
          disabled: !hasProject || !isTauri,
        }),
        action(t("menu.file.package"), actions.packageProject, {
          disabled: !hasProject || !isTauri,
        }),
        action(t("menu.file.openPackage"), actions.openPackage, {
          disabled: !isTauri,
        }),
        ...(isTauri
          ? []
          : [
              action(t("menu.file.packageDesktopOnly"), () => undefined, {
                disabled: true,
              }),
              action(t("menu.file.emailDesktopOnly"), () => undefined, {
                disabled: true,
              }),
            ]),
      ],
    },
    {
      kind: "submenu",
      label: t("menu.file.exportGroup"),
      key: "export",
      disabled: !hasProject,
      items: exportItems(actions),
    },
    separator(),
    {
      kind: "submenu",
      label: t("menu.file.maintenanceGroup"),
      items: [
        action(t("menu.file.backupNow"), actions.backupProject, {
          disabled: !hasProject || !isTauri,
        }),
        action(t("menu.file.backupManager"), actions.openBackupManager, {
          disabled: !hasProject || !isTauri,
        }),
        action(t("menu.file.conflictedCopies"), actions.openConflictedCopies, {
          disabled: !hasProject || !isTauri,
        }),
        action(t("menu.file.projectDoctor"), actions.openProjectDoctor, {
          disabled: !hasProject,
        }),
      ],
    },
    separator(),
    action(t("menu.file.closeProject"), actions.closeProject, { disabled: !hasProject }),
    action(t("menu.file.quit"), actions.quit, { shortcut: APP_SHORTCUTS.quit }),
  ];
}

function recentMenu(actions: PanelActions, recent: ReturnType<typeof getRecent>): MenuItem {
  return {
    kind: "submenu",
    label: t("menu.file.openRecent"),
    disabled: recent.length === 0,
    items: recent.length
      ? [
          ...recent.slice(0, 10).map((entry) =>
            action(
              t("menu.file.recentEntry", {
                name: entry.name,
                kind:
                  entry.kind === "project"
                    ? t("menu.file.recentProject")
                    : t("menu.file.recentDrawing"),
              }),
              () => actions.openRecent(entry),
            ),
          ),
          separator(),
          action(t("menu.file.clearRecent"), () => {
            clearRecent();
            actions.refresh();
            toast(t("menu.file.recentCleared"), "info");
          }),
        ]
      : [action(t("menu.file.noRecent"), () => undefined, { disabled: true })],
  };
}

function exportItems(actions: PanelActions): MenuItem[] {
  return [
    action(t("menu.file.exportDrawing"), () => actions.exportAs("drawing")),
    action(t("menu.file.exportPng"), () => actions.exportAs("png")),
    separator(),
    action(t("menu.file.exportMarkupsCsv"), () => actions.exportAs("csv")),
    action(t("menu.file.exportQuantityCsv"), () => actions.exportAs("quantity-csv")),
    action(t("menu.file.exportQuantityXlsx"), () => actions.exportAs("quantity-xlsx")),
    action(t("menu.file.exportQuantityPdf"), () => actions.exportAs("quantity-pdf")),
    separator(),
    action(t("menu.file.exportJson"), () => actions.exportAs("json")),
  ];
}

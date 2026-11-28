import { t } from "../../i18n";
import { pageDisplayName, pageNumber } from "../../model/pages";
import type { PageId, Project } from "../../model/types";
import { store } from "../../state/store";
import { textDialog } from "../../ui/dialogs";
import type { PanelActions } from "../../ui/panels";
import type { PopoverItem } from "../../ui/popover";
import { pageCardTabMenuItems } from "../openPages";
import { isBlankSheet, templateDocumentForPage } from "../schematics";
import { pageInsertTarget, pageMovePositions } from "./model";
import { moveTargets } from "./targets";
import { insertPageNear, movePageToPosition } from "./operations";
import { insertPositionLabel, pageLocationDialog } from "./ui";

/**
 * The page card menu. Items are built from project data on every open, so the
 * target position, the source actions and the sheet actions always describe the
 * page the menu was opened on.
 */
export function pageMenuItems(
  project: Project,
  pageId: PageId,
  actions: PanelActions,
): PopoverItem[] {
  const page = pageNumber(project, pageId);
  const goTo: PopoverItem = {
    label: t("page.goTo", { page }),
    icon: "pages",
    action: () => actions.goToPage(page, true),
  };
  // Session-only tab entries: they act on the page the menu was opened on and
  // disable only the action that would change nothing.
  const tabInfo = actions.openPageTabInfo?.(pageId);
  const tabItems =
    tabInfo && actions.previewPage
      ? pageCardTabMenuItems(tabInfo, {
          preview: () => actions.previewPage?.(pageId),
          pin: () => actions.pinPage(pageId),
        })
      : [];
  const record = project.pages[page - 1];
  if (!record) return [goTo, ...tabItems];
  if (store.readOnly) return [goTo, ...tabItems];
  const targets = moveTargets(project, pageId);

  const sheetDocument = templateDocumentForPage(project, page);
  const sourceDocument = project.documents.find((entry) => entry.id === record.documentId);
  const insertItems: PopoverItem[] = sheetDocument
    ? []
    : (["before", "after"] as const).map((direction) => {
        const target = pageInsertTarget(project, pageId, direction);
        const position = target ? insertPositionLabel(target) : "";
        return {
          label: t("page.insertMenu", { position }),
          icon: "plus",
          action: () => void insertPageNear(actions, pageId, direction),
        };
      });

  return [
    goTo,
    ...tabItems,
    {
      label: t("page.renameEllipsis"),
      icon: "text",
      action: () => {
        void textDialog(
          t("page.rename"),
          t("page.titleFallback", { page }),
          pageDisplayName(project, pageId) ?? "",
          t("page.name"),
        ).then((value) => {
          if (value !== null) store.renamePage(pageId, value);
        });
      },
    },
    ...(sheetDocument && !isBlankSheet(sheetDocument)
      ? [
          {
            label: t("page.editSheetFields"),
            icon: "text",
            action: () => actions.editSheetFields(page),
          },
          { separator: true as const },
        ]
      : []),
    {
      label: t("page.setLocation"),
      icon: "target",
      action: () => pageLocationDialog(project, pageId, page),
    },
    ...(sourceDocument?.kind === "pdf" || sourceDocument?.kind === "tiff"
      ? [
          ...(sourceDocument.kind === "pdf"
            ? [
                ...(sourceDocument.storage === "managed"
                  ? [
                      {
                        label: t("page.detachFromSource"),
                        icon: "folder",
                        action: () => actions.detachFromSource(record.documentId),
                      },
                    ]
                  : [
                      {
                        label: t("page.useManagedCopy"),
                        icon: "folder",
                        action: () => actions.copyDrawingIntoProject(record.documentId),
                      },
                    ]),
                {
                  label: t("page.reloadSource"),
                  icon: "folder",
                  action: () => actions.reloadSource(record.documentId),
                },
                {
                  label: t("page.useCurrentSource"),
                  icon: "folder",
                  action: () => actions.useCurrentSource(record.documentId),
                },
                {
                  label: t("page.relinkSource"),
                  icon: "folder",
                  action: () => actions.relinkSource(record.documentId),
                },
              ]
            : []),
          {
            label: t("page.replaceSource"),
            icon: "folder",
            action: () => actions.replaceSource(record.documentId),
          },
        ]
      : []),
    ...(sourceDocument?.superseded
      ? [
          {
            label: t("page.cleanupSuperseded"),
            icon: "trash",
            danger: true,
            action: () => actions.cleanupSuperseded(record.documentId),
          },
        ]
      : []),
    ...insertItems,
    {
      label:
        targets.length > 1
          ? t("page.moveSelectionToPosition", { count: targets.length })
          : t("page.moveToPosition"),
      icon: "cursorMove",
      disabled: pageMovePositions(project, targets[0]).length === 0,
      action: () => void movePageToPosition(actions, targets),
    },
    {
      label:
        targets.length > 1
          ? t("page.duplicateSelection", { count: targets.length })
          : t("page.duplicate"),
      icon: "copy",
      action: () =>
        targets.length > 1 ? actions.duplicatePages(targets) : actions.duplicatePage(pageId),
    },
    { separator: true },
    {
      label:
        targets.length > 1
          ? t("page.deleteSelection", { count: targets.length })
          : t("page.delete"),
      icon: "trash",
      danger: true,
      action: () =>
        targets.length > 1 ? actions.deletePages(targets) : actions.deletePage(pageId),
    },
  ];
}

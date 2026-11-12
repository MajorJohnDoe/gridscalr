import { t } from "../../i18n";
import { pageDisplayName, pageNumber } from "../../model/pages";
import type { PageId, Project } from "../../model/types";
import { store } from "../../state/store";
import { textDialog } from "../../ui/dialogs";
import type { PanelActions } from "../../ui/panels";
import type { PopoverItem } from "../../ui/popover";
import { isBlankSheet, templateDocumentForPage } from "../schematics/model/sheetDocument";
import { pageInsertTarget, pageMovePositions } from "./model";
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
  const record = project.pages[page - 1];
  if (!record) return [goTo];
  if (store.readOnly) return [goTo];

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
    ...(sourceDocument?.kind === "pdf"
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
      label: t("page.moveToPosition"),
      icon: "cursorMove",
      disabled: pageMovePositions(project, pageId).length === 0,
      action: () => void movePageToPosition(actions, pageId),
    },
    {
      label: t("page.duplicate"),
      icon: "copy",
      action: () => actions.duplicatePage(pageId),
    },
    { separator: true },
    {
      label: t("page.delete"),
      icon: "trash",
      danger: true,
      action: () => actions.deletePage(pageId),
    },
  ];
}

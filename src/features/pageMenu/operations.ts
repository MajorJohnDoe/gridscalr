import { t } from "../../i18n";
import type { PageId } from "../../model/types";
import type { PanelActions } from "../../ui/panels";
import { toast } from "../../ui/toast";
import { store } from "../../state/store";
import { pageInsertTarget, pageMovePositions, type PageInsertDirection } from "./model";
import {
  insertPageDialog,
  insertPositionLabel,
  movePageDialog,
  movePositionLabel,
  pagePositionLabel,
} from "./ui";

/**
 * Page-menu operations. Each one delegates to the existing `PanelActions` entry
 * point, so insert and move keep their single undo step and duplicate and
 * delete keep their explicit confirmation and recovery checkpoint.
 */

/** Inserts a record for the same source sheet before or after the anchor page. */
export async function insertPageNear(
  actions: PanelActions,
  pageId: PageId,
  direction: PageInsertDirection,
): Promise<void> {
  if (store.readOnly) return;
  const project = store.project;
  if (!project) return;
  const target = pageInsertTarget(project, pageId, direction);
  if (!target) return;
  if (!(await insertPageDialog(insertPositionLabel(target)))) return;
  // Re-read the target after the dialog: the index is still derived from the
  // PageId, never from a display number or the filtered card position.
  const current = store.project;
  if (!current) return;
  const confirmed = pageInsertTarget(current, pageId, direction);
  if (!confirmed) return;
  actions.insertPage(pageId, confirmed.index);
}

/** Moves one page to a chosen position through the undoable reorder action. */
export async function movePageToPosition(actions: PanelActions, pageId: PageId): Promise<void> {
  if (store.readOnly) return;
  const project = store.project;
  if (!project) return;
  const positions = pageMovePositions(project, pageId);
  if (!positions.length) return;
  const index = await movePageDialog({
    subtitle: pagePositionLabel(project, pageId),
    positions,
  });
  if (index === null) return;
  const chosen = positions.find((position) => position.index === index);
  if (!chosen) return;
  actions.reorderPages([pageId], chosen.index);
  toast(t("page.movedToast", { position: movePositionLabel(chosen) }), "info");
}

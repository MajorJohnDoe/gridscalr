import { t } from "../../i18n";
import type { PageId } from "../../model/types";
import { store } from "../../state/store";
import { ListReorderController, type MoveOutcome } from "../listInteraction";
import { fullListInsertionIndex, planDrop, type PageReorderEntry } from "./model";

/**
 * Page drag, multi-selection and keyboard reorder for the Pages panel. The
 * shared list controller owns the drag state, the drop line and the selection;
 * this wrapper adds the page document boundaries and maps a file drop back to
 * the project page list. A drop calls one host action so the move stays one
 * checkpoint and one undo step.
 */
export interface PageReorderActions {
  /** Applies one checkpoint and moves the pages as one undo step. */
  reorder: (pageIds: readonly PageId[], insertionIndex: number) => void;
  goToPage: (page: number) => void;
}

function projectEntries(): PageReorderEntry[] {
  const project = store.project;
  if (!project) return [];
  return project.pages.map((page) => ({ id: page.id, documentId: page.documentId }));
}

function documentName(documentId: string | null): string {
  const project = store.project;
  if (!documentId || !project) return "";
  return project.documents.find((document) => document.id === documentId)?.name ?? "";
}

function announceMove(outcome: MoveOutcome): string {
  const position = outcome.startIndex + 1;
  const last = outcome.startIndex + outcome.count;
  return outcome.count > 1
    ? t("page.reorderedMany", {
        count: outcome.count,
        position,
        last,
        total: outcome.total,
      })
    : t("page.reorderedOne", { position, total: outcome.total });
}

export class PageReorderController {
  private actions: PageReorderActions | null = null;
  private readonly drag = new ListReorderController<PageReorderEntry>({
    rowSelector: ".page-card",
    rowId: (row) => row.dataset.pageId ?? null,
    entries: projectEntries,
    canReorder: () => !store.readOnly,
    selectable: true,
    dragMime: "application/x-gridscalr-page-order",
    onMove: (ids, insertionIndex) => this.actions?.reorder(ids as PageId[], insertionIndex),
    announce: (_ids, outcome) => announceMove(outcome),
    planDrop: (entries, selected, insertionIndex) => {
      const plan = planDrop(entries, selected, insertionIndex);
      const name = plan.crossDocument ? documentName(plan.targetDocumentId) : "";
      return {
        changesOrder: plan.changesOrder,
        label: name ? t("page.moveToDocument", { name }) : null,
        crossDocument: plan.crossDocument,
      };
    },
    dropLineClass: "page-drop-line",
    dropLabelClass: "page-drop-label",
    announcerClass: "page-reorder-announcer",
  });

  setActions(actions: PageReorderActions): void {
    this.actions = actions;
  }

  /** Rebinds the drag surface; card listeners are recreated by the panel render. */
  bindList(list: HTMLElement, scroll: HTMLElement): void {
    this.drag.bindList(list, scroll);
  }

  /** Applies selection styling and the keyboard hint to one card. */
  decorateCard(card: HTMLElement, pageId: PageId): void {
    this.drag.decorate(card, pageId);
  }

  /** Handles a card click and reports whether the panel should navigate. */
  handleClick(event: MouseEvent, pageId: PageId): boolean {
    return this.drag.handleClick(event, pageId);
  }

  handleDragStart(event: DragEvent, pageId: PageId, card: HTMLElement): void {
    this.drag.handleDragStart(event, pageId, card);
  }

  handleDragEnd(): void {
    this.drag.handleDragEnd();
  }

  handleKeyDown(event: KeyboardEvent, pageId: PageId): void {
    this.drag.handleKeyDown(event, pageId);
  }

  /** Selected page IDs for page commands that act on the whole selection. */
  selectionIds(): PageId[] {
    return this.drag.selectionIds() as PageId[];
  }

  /** Restores focus and clears drag chrome after the panel re-rendered. */
  afterRender(): void {
    this.drag.afterRender();
  }

  /** Drops the drag surface when the Pages panel leaves the DOM. */
  detach(): void {
    this.drag.detach();
  }

  /** Clears selection and drag state; used when the panel starts over. */
  reset(): void {
    this.drag.reset();
  }

  /**
   * Shows the same insertion line for a file drop and returns the 0-based
   * insertion index in the project page list. Returns 0 when the panel has no
   * list (an empty project).
   */
  showExternalDrop(clientY: number): number {
    const index = this.drag.previewExternalDrop(clientY, (renderedIndex, rows) => {
      // A status filter renders a subset of the pages, so the rendered index is
      // translated back to a project insertion index before anything is added.
      const visiblePages = rows
        .map((row) => Number(row.dataset.page ?? 0))
        .filter((page) => Number.isFinite(page) && page > 0);
      return fullListInsertionIndex(visiblePages, renderedIndex, store.project?.pages.length ?? 0);
    });
    return index ?? 0;
  }

  /** Hides the file-drop line without disturbing an internal card drag. */
  hideExternalDrop(): void {
    this.drag.hideExternalDrop();
  }
}

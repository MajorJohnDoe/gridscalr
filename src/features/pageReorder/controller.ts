import { t } from "../../i18n";
import type { PageId } from "../../model/types";
import { store } from "../../state/store";
import { ListReorderController, type MoveOutcome } from "../listInteraction";
import { pageWindowState } from "../pageWindow";
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
  reorder: (pageIds: readonly PageId[], insertionIndex: number) => void | Promise<void>;
  goToPage: (page: number) => void;
  /** Repaints the panel after an asynchronous move resolves. */
  refresh?: () => void;
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
  /** Project index of the first mounted card while the panel shows a window. */
  private windowOffset = 0;
  /** Pages the panel currently mounts; null means the full project list. */
  private mountedIds: ReadonlySet<PageId> | null = null;
  private readonly drag = new ListReorderController<PageReorderEntry>({
    rowSelector: ".page-card",
    rowId: (row) => row.dataset.pageId ?? null,
    entries: projectEntries,
    // The whole selection stays inside the mounted window, so a bulk action
    // never acts on pages that were not on screen.
    visibleEntries: () =>
      this.mountedIds
        ? projectEntries().filter((entry) => this.mountedIds!.has(entry.id))
        : projectEntries(),
    canReorder: () => !store.readOnly,
    selectable: true,
    onMove: (ids, insertionIndex, changesOrder) => {
      const revealId = ids[0];
      const result = this.actions?.reorder(ids as PageId[], insertionIndex);
      if (!changesOrder || !revealId) return;
      // A checkpoint sits between the gesture and the store mutation, so a
      // render can happen before the new order exists. Ask for the reveal only
      // after the move resolves, then repaint so the moved block stays visible.
      const reveal = () => {
        pageWindowState.reveal(revealId);
        pageWindowState.requestFocus(revealId);
        this.actions?.refresh?.();
        // The render after the store emit follows the current page, which can
        // leave a moved block that does not contain it off-window; the prune
        // then drops the block from the selection. Restore it now that the
        // reveal has mounted it, so a follow-up bulk command still targets it.
        // A block wider than the window keeps only its mounted pages.
        const mounted = this.mountedIds;
        this.drag.select(mounted?.has(revealId) ? ids.filter((id) => mounted.has(id)) : ids);
      };
      if (isPromise(result)) void result.then(reveal);
      else reveal();
    },
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
    renderedOffset: () => this.windowOffset,
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

  /**
   * Sets the project index of the first mounted card. A windowed panel maps a
   * rendered drop position back to the full page list with this offset, so a
   * drop near a window edge never lands at the wrong project position.
   */
  setWindowOffset(offset: number): void {
    this.windowOffset = Math.max(0, Math.round(offset));
  }

  /** Sets the pages the panel currently mounts; used to clamp the selection. */
  setVisibleIds(pageIds: readonly PageId[]): void {
    this.mountedIds = new Set(pageIds);
    this.drag.prune();
  }

  /** Applies selection styling and the keyboard hint to one card. */
  decorateCard(card: HTMLElement, pageId: PageId): void {
    this.drag.decorate(card, pageId);
  }

  /** Handles a card click and reports whether the panel should navigate. */
  handleClick(event: MouseEvent, pageId: PageId): boolean {
    return this.drag.handleClick(event, pageId);
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
    this.mountedIds = null;
    this.windowOffset = 0;
  }

  /**
   * Shows the same insertion line for a file drop and returns the 0-based
   * insertion index in the project page list. Returns 0 when the panel has no
   * list (an empty project).
   */
  showExternalDrop(clientY: number): number {
    const index = this.drag.previewExternalDrop(clientY, (renderedIndex, rows) => {
      // The rendered cards are a window of the page list or a filtered subset.
      // Their display page numbers place a drop without a separate offset.
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

/** A host action may keep the panel open while its checkpoint resolves. */
function isPromise(value: unknown): value is Promise<void> {
  return typeof (value as { then?: unknown } | null | undefined)?.then === "function";
}

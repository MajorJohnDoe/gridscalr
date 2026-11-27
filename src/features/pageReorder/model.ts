import { pageListAfterMove, pageListOrderChanges } from "../../model/pages";
import type { PageId } from "../../model/types";
import type { ListMoveCommand, ListSelection, ListSelectMode } from "../listInteraction";

/**
 * Pure ordering, selection and drop-target math for the Pages panel. Selection
 * ranges and keyboard insertion come from the shared list interaction model;
 * this file adds the page-specific document boundaries and cross-document drop
 * plan. Nothing here touches the DOM, the store or the i18n catalogs.
 */

// Re-exported so the Pages panel and its tests keep one public surface.
export {
  dragSet,
  insertionIndexAt,
  keyboardInsertion,
  orderedSelection,
  pruneSelection,
  selectionAfterClick,
} from "../listInteraction";
export type { RowSpan } from "../listInteraction";

export interface PageReorderEntry {
  id: PageId;
  /** Source document the page belongs to; null for a project without documents. */
  documentId: string | null;
}

export type PageMoveCommand = ListMoveCommand;

/**
 * `aria-keyshortcuts` value. Built from key tokens so it never reads as
 * interface prose, and shared by the panel and its tests.
 */
export const PAGE_REORDER_KEYSHORTCUTS = [
  "Alt+ArrowUp",
  "Alt+ArrowDown",
  "Alt+Home",
  "Alt+End",
].join(" ");

export type PageSelectMode = ListSelectMode;
export type PageSelection = ListSelection;

export interface DropPlan {
  /** 0-based insertion index in the current page list. */
  insertionIndex: number;
  /** True when applying the plan actually changes the order. */
  changesOrder: boolean;
  /** Document the block lands next to, or null for an empty project. */
  targetDocumentId: string | null;
  /** True when no moved page already belongs to the target document. */
  crossDocument: boolean;
  /** True when the insertion point sits between two documents. */
  atBoundary: boolean;
}

/**
 * Everything the drop indicator, the cross-document hint and the commit need.
 * `insertionIndex` is computed in the current list, and the target document is
 * read from the list that remains after the moved pages are taken out.
 */
export function planDrop(
  pages: readonly PageReorderEntry[],
  selectedIds: ReadonlySet<PageId>,
  insertionIndex: number,
): DropPlan {
  const clamped = Math.max(0, Math.min(pages.length, Math.round(insertionIndex)));
  const remaining = pages.filter((page) => !selectedIds.has(page.id));
  const selectedBefore = pages.slice(0, clamped).filter((page) => selectedIds.has(page.id)).length;
  const insertAt = Math.max(0, Math.min(remaining.length, clamped - selectedBefore));
  const after = remaining[insertAt] ?? null;
  const before = remaining[insertAt - 1] ?? null;
  const target = after ?? before;
  const movedDocuments = new Set(
    pages.filter((page) => selectedIds.has(page.id)).map((page) => page.documentId),
  );
  return {
    insertionIndex: clamped,
    changesOrder: pageListOrderChanges(pages, selectedIds, clamped),
    targetDocumentId: target?.documentId ?? null,
    crossDocument: Boolean(after && selectedIds.size > 0 && !movedDocuments.has(after.documentId)),
    atBoundary: Boolean(
      !after || !before || (before.documentId !== after.documentId && !selectedIds.has(before.id)),
    ),
  };
}

export interface DocumentSegment {
  documentId: string | null;
  /** 0-based index of the first page in this run. */
  start: number;
  count: number;
}

/**
 * Consecutive runs of pages that share a source document. A reorder can
 * interleave documents, so this returns one segment per run instead of one per
 * document.
 */
export function documentSegments(pages: readonly PageReorderEntry[]): DocumentSegment[] {
  const segments: DocumentSegment[] = [];
  pages.forEach((page, index) => {
    const last = segments[segments.length - 1];
    if (last && last.documentId === page.documentId) {
      last.count += 1;
      return;
    }
    segments.push({ documentId: page.documentId, start: index, count: 1 });
  });
  return segments;
}

/**
 * Maps an insertion index in the rendered card order to the project page list.
 *
 * `renderedOffset` is the project index of the first mounted card, as the
 * internal drag path uses. When the mounted rows start exactly there they are a
 * contiguous window, so the project index is simply offset + rendered index —
 * including a drop below the last mounted card, which stays inside the window
 * instead of jumping to the end of the project. When a status filter makes the
 * rows non-contiguous, the display page numbers decide where a drop lands.
 * Dropping below the last visible card of a filtered list lands after that page.
 */
export function fullListInsertionIndex(
  visiblePages: readonly number[],
  insertionIndex: number,
  totalPages: number,
  renderedOffset = 0,
): number {
  const total = Math.max(0, Math.round(totalPages));
  if (!visiblePages.length) return total;
  const clamped = Math.max(0, Math.min(visiblePages.length, Math.round(insertionIndex)));
  const offset = Math.max(0, Math.round(renderedOffset));
  if (isContiguousWindow(visiblePages, offset)) {
    // A contiguous window of the unfiltered list.
    return Math.max(0, Math.min(total, offset + clamped));
  }
  if (clamped >= visiblePages.length) {
    // After the last mounted card, not the end of the project.
    const lastPage = Math.round(visiblePages[visiblePages.length - 1]);
    return Math.max(0, Math.min(total, lastPage));
  }
  const page = Math.round(visiblePages[clamped]);
  return Math.max(0, Math.min(total, page - 1));
}

/** True when the mounted display pages are consecutive from the window start. */
function isContiguousWindow(visiblePages: readonly number[], offset: number): boolean {
  const first = Math.round(visiblePages[0]);
  if (first - 1 !== offset) return false;
  for (let index = 1; index < visiblePages.length; index += 1) {
    if (Math.round(visiblePages[index]) !== Math.round(visiblePages[index - 1]) + 1) {
      return false;
    }
  }
  return true;
}

export interface PageOrderOutcome {
  /** 0-based index of the first moved page after the change. */
  startIndex: number;
  count: number;
  total: number;
}

/** Where a planned move would place the selection, for announcements. */
export function moveOutcome(
  pages: readonly PageReorderEntry[],
  selectedIds: ReadonlySet<PageId>,
  insertionIndex: number,
): PageOrderOutcome {
  const next = pageListAfterMove(pages, selectedIds, insertionIndex);
  const startIndex = next.findIndex((page) => selectedIds.has(page.id));
  return { startIndex: Math.max(0, startIndex), count: selectedIds.size, total: next.length };
}

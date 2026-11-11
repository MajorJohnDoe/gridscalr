import { pageListAfterMove, pageListOrderChanges } from "../../model/pages";
import type { PageId } from "../../model/types";

/**
 * Pure ordering, selection and drop-target math for the Pages panel. Nothing in
 * this file touches the DOM, the store or the i18n catalogs, so the same rules
 * drive mouse drops, keyboard reorder and the tests.
 */

export interface PageReorderEntry {
  id: PageId;
  /** Source document the page belongs to; null for a project without documents. */
  documentId: string | null;
}

export type PageMoveCommand = "up" | "down" | "home" | "end";

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

export type PageSelectMode = "replace" | "toggle" | "range";

export interface PageSelection {
  ids: PageId[];
  anchor: PageId | null;
}

/**
 * Selection after clicking one card.
 *
 * - `replace` selects only the clicked page and becomes the new anchor;
 * - `toggle` adds or removes the page and anchors on it;
 * - `range` selects every page between the anchor and the clicked page.
 */
export function selectionAfterClick(
  pages: readonly PageReorderEntry[],
  current: readonly PageId[],
  anchor: PageId | null,
  pageId: PageId,
  mode: PageSelectMode,
): PageSelection {
  if (mode === "toggle") {
    const ids = current.includes(pageId)
      ? current.filter((id) => id !== pageId)
      : pages.filter((page) => current.includes(page.id) || page.id === pageId).map((p) => p.id);
    return { ids: ids.length ? ids : [pageId], anchor: pageId };
  }
  if (mode === "range" && anchor) {
    const from = pages.findIndex((page) => page.id === anchor);
    const to = pages.findIndex((page) => page.id === pageId);
    if (from >= 0 && to >= 0) {
      const [start, end] = from <= to ? [from, to] : [to, from];
      return { ids: pages.slice(start, end + 1).map((page) => page.id), anchor };
    }
  }
  return { ids: [pageId], anchor: pageId };
}

/** Selected IDs in page order, ignoring IDs that are no longer in the project. */
export function orderedSelection(
  pages: readonly PageReorderEntry[],
  selected: ReadonlySet<PageId>,
): PageId[] {
  return pages.filter((page) => selected.has(page.id)).map((page) => page.id);
}

/**
 * The pages a drag moves: the whole selection when the grabbed page is part of
 * it, otherwise only the grabbed page.
 */
export function dragSet(
  pages: readonly PageReorderEntry[],
  selected: ReadonlySet<PageId>,
  pageId: PageId,
): PageId[] {
  if (!selected.has(pageId)) return [pageId];
  return orderedSelection(pages, selected);
}

/** Drops IDs that left the project, for example after a page delete. */
export function pruneSelection(
  pages: readonly PageReorderEntry[],
  current: readonly PageId[],
): PageId[] {
  const present = new Set(pages.map((page) => page.id));
  return current.filter((id) => present.has(id));
}

/**
 * Insertion index for a keyboard move of the current selection, or null when
 * the selection cannot move that way. `up`/`down` step past the neighbouring
 * non-selected page so the block never collides with itself.
 */
export function keyboardInsertion(
  pages: readonly PageReorderEntry[],
  selected: ReadonlySet<PageId>,
  command: PageMoveCommand,
): number | null {
  if (!selected.size) return null;
  if (command === "home") return 0;
  if (command === "end") return pages.length;
  let first = -1;
  let last = -1;
  pages.forEach((page, index) => {
    if (!selected.has(page.id)) return;
    if (first < 0) first = index;
    last = index;
  });
  if (first < 0) return null;
  return command === "up" ? Math.max(0, first - 1) : Math.min(pages.length, last + 2);
}

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

export interface RowSpan {
  top: number;
  bottom: number;
}

/**
 * Insertion index for a vertical pointer position over a list of card spans.
 * A pointer above the first midpoint lands before the first card, below the
 * last midpoint after the last one.
 */
export function insertionIndexAt(spans: readonly RowSpan[], clientY: number): number {
  for (let index = 0; index < spans.length; index += 1) {
    if (clientY < (spans[index].top + spans[index].bottom) / 2) return index;
  }
  return spans.length;
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

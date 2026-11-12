/**
 * Pure list-interaction rules shared by the Pages, Layers and Markups lists.
 *
 * Everything here works on ordered entries with stable string IDs, so the same
 * selection range, block move, insertion and collapse rules drive pointer
 * drags, keyboard moves and the tests. Nothing in this file touches the DOM,
 * the store or an i18n catalog.
 */

export interface ListEntry {
  id: string;
}

export type ListSelectMode = "replace" | "toggle" | "range";

export interface ListSelection {
  ids: string[];
  anchor: string | null;
}

export type ListMoveCommand = "up" | "down" | "home" | "end";

/**
 * Selection after clicking one row.
 *
 * - `replace` selects only the clicked row and becomes the new anchor;
 * - `toggle` adds or removes the row and anchors on it;
 * - `range` selects every row between the anchor and the clicked row.
 */
export function selectionAfterClick(
  entries: readonly ListEntry[],
  current: readonly string[],
  anchor: string | null,
  id: string,
  mode: ListSelectMode,
): ListSelection {
  if (mode === "toggle") {
    const ids = current.includes(id)
      ? current.filter((entry) => entry !== id)
      : entries.filter((entry) => current.includes(entry.id) || entry.id === id).map((e) => e.id);
    return { ids: ids.length ? ids : [id], anchor: id };
  }
  if (mode === "range" && anchor) {
    const from = entries.findIndex((entry) => entry.id === anchor);
    const to = entries.findIndex((entry) => entry.id === id);
    if (from >= 0 && to >= 0) {
      const [start, end] = from <= to ? [from, to] : [to, from];
      return { ids: entries.slice(start, end + 1).map((entry) => entry.id), anchor };
    }
  }
  return { ids: [id], anchor: id };
}

/** Selected IDs in list order, ignoring IDs that are no longer present. */
export function orderedSelection(
  entries: readonly ListEntry[],
  selected: ReadonlySet<string>,
): string[] {
  return entries.filter((entry) => selected.has(entry.id)).map((entry) => entry.id);
}

/**
 * The rows a drag moves: the whole selection when the grabbed row is part of
 * it, otherwise only the grabbed row.
 */
export function dragSet(
  entries: readonly ListEntry[],
  selected: ReadonlySet<string>,
  id: string,
): string[] {
  if (!selected.has(id)) return [id];
  return orderedSelection(entries, selected);
}

/** Drops IDs that left the list, for example after a delete. */
export function pruneSelection(
  entries: readonly ListEntry[],
  current: readonly string[],
): string[] {
  const present = new Set(entries.map((entry) => entry.id));
  return current.filter((id) => present.has(id));
}

/**
 * Insertion index for a keyboard move of the current selection, or null when
 * the selection cannot move that way. `up`/`down` step past the neighbouring
 * non-selected row so the block never collides with itself.
 */
export function keyboardInsertion(
  entries: readonly ListEntry[],
  selected: ReadonlySet<string>,
  command: ListMoveCommand,
): number | null {
  if (!selected.size) return null;
  if (command === "home") return 0;
  if (command === "end") return entries.length;
  let first = -1;
  let last = -1;
  entries.forEach((entry, index) => {
    if (!selected.has(entry.id)) return;
    if (first < 0) first = index;
    last = index;
  });
  if (first < 0) return null;
  return command === "up" ? Math.max(0, first - 1) : Math.min(entries.length, last + 2);
}

/**
 * Entries after moving every selected entry to an insertion index in the
 * current list. The selected block keeps its relative order, and the index is
 * recomputed once the block is taken out, so mouse and keyboard share one rule.
 */
export function moveEntries<T extends ListEntry>(
  entries: readonly T[],
  selected: ReadonlySet<string>,
  insertionIndex: number,
): T[] {
  const clamped = Math.max(0, Math.min(entries.length, Math.round(insertionIndex)));
  const moving = entries.filter((entry) => selected.has(entry.id));
  const remaining = entries.filter((entry) => !selected.has(entry.id));
  const selectedBefore = entries.slice(0, clamped).filter((entry) => selected.has(entry.id)).length;
  const insertAt = Math.max(0, Math.min(remaining.length, clamped - selectedBefore));
  return [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
}

/** True when moving the selected entries to the index changes the order. */
export function moveChangesOrder(
  entries: readonly ListEntry[],
  selected: ReadonlySet<string>,
  insertionIndex: number,
): boolean {
  const next = moveEntries(entries, selected, insertionIndex);
  return next.some((entry, index) => entry.id !== entries[index]?.id);
}

export interface RowSpan {
  top: number;
  bottom: number;
}

/**
 * Insertion index for a vertical pointer position over a list of row spans.
 * A pointer above the first midpoint lands before the first row, below the
 * last midpoint after the last row.
 */
export function insertionIndexAt(spans: readonly RowSpan[], clientY: number): number {
  for (let index = 0; index < spans.length; index += 1) {
    if (clientY < (spans[index].top + spans[index].bottom) / 2) return index;
  }
  return spans.length;
}

export interface MoveOutcome {
  /** 0-based index of the first moved entry after the change. */
  startIndex: number;
  count: number;
  total: number;
}

/** Where a planned move would place the selection, for announcements. */
export function moveOutcome(
  entries: readonly ListEntry[],
  selected: ReadonlySet<string>,
  insertionIndex: number,
): MoveOutcome {
  const next = moveEntries(entries, selected, insertionIndex);
  const startIndex = next.findIndex((entry) => selected.has(entry.id));
  return { startIndex: Math.max(0, startIndex), count: selected.size, total: next.length };
}

/** Case- and locale-aware query normalization shared by every list filter. */
export function normalizeFilterQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

/** True when the searchable text contains the already-normalized query. */
export function matchesFilterText(haystack: string, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return haystack.toLocaleLowerCase().includes(normalizedQuery);
}

/** Collapse state after toggling one group key. */
export function toggleCollapsedKey(collapsed: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(collapsed);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** Collapse state that hides every given group key. */
export function collapseAllKeys(keys: Iterable<string>): Set<string> {
  return new Set(keys);
}

/** Collapse state with every group expanded. */
export function expandAllKeys(): Set<string> {
  return new Set();
}

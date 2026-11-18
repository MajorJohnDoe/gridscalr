/**
 * Shared list interactions for the Pages, Layers and Markups panels. Other
 * modules import only this surface; see ADR 0013.
 */
export {
  collapseAllKeys,
  dragSet,
  expandAllKeys,
  insertionIndexAt,
  keyboardInsertion,
  matchesFilterText,
  moveChangesOrder,
  moveEntries,
  moveOutcome,
  normalizeFilterQuery,
  orderedSelection,
  pruneSelection,
  rowIndexAt,
  selectionAfterClick,
  toggleCollapsedKey,
} from "./model";
export type {
  ListEntry,
  ListMoveCommand,
  ListSelection,
  ListSelectMode,
  MoveOutcome,
  RowSpan,
} from "./model";
export { ListReorderController } from "./controller";
export type { ListDropPlan, ListReorderOptions } from "./controller";
export { PointerRowDrag } from "./pointerDrag";
export type { PointerRowDragOptions } from "./pointerDrag";
export { dragHandle, DropIndicator, LiveRegion, RowNavigator } from "./ui";
export type { DropIndicatorOptions } from "./ui";

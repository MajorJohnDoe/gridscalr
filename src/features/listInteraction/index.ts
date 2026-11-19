/**
 * Shared list interactions for the Pages, Layers and Markups panels. Other
 * modules import only this surface; see ADR 0013.
 */
export {
  collapseAllKeys,
  dragSet,
  dropLinePlacement,
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
  rowMoveGuideIndex,
  selectionAfterClick,
  toggleCollapsedKey,
} from "./model";
export type {
  DropLinePlacement,
  ListEntry,
  ListMoveCommand,
  ListSelection,
  ListSelectMode,
  MoveOutcome,
  RowBox,
  RowSpan,
} from "./model";
export { ListReorderController } from "./controller";
export type { ListDropPlan, ListReorderOptions } from "./controller";
export { PointerRowDrag } from "./pointerDrag";
export type { PointerDropGuide, PointerRowDragOptions } from "./pointerDrag";
export { ListDragFeedback, viewportBox } from "./feedback";
export type { DragFeedbackOptions } from "./feedback";
export { dragHandle, LiveRegion, RowNavigator } from "./ui";

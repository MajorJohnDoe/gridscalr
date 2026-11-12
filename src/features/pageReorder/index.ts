import { PageReorderController } from "./controller";

export { PageReorderController };
export type { PageReorderActions } from "./controller";
export {
  documentSegments,
  dragSet,
  fullListInsertionIndex,
  insertionIndexAt,
  keyboardInsertion,
  moveOutcome,
  orderedSelection,
  PAGE_REORDER_KEYSHORTCUTS,
  planDrop,
  selectionAfterClick,
} from "./model";
export type {
  DocumentSegment,
  DropPlan,
  PageMoveCommand,
  PageOrderOutcome,
  PageReorderEntry,
  PageSelectMode,
  RowSpan,
} from "./model";
export {
  documentRunHeader,
  PAGE_REORDER_HINT_ID,
  PAGE_SELECT_HINT_ID,
  pageReorderHint,
  pageSelectHint,
} from "./ui";

/** One controller per window; the Pages panel rebinds it on every render. */
export const pageReorder = new PageReorderController();

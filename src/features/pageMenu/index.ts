import { PageMenuController, pageMenu } from "./controller";

export { PageMenuController, pageMenu };
export type { PageMenuPosition } from "./controller";
export {
  PAGE_MENU_HINT_ID,
  PAGE_MENU_KEYSHORTCUTS,
  PAGE_SHORTCUTS,
  pageInsertTarget,
  pageMovePositions,
  pageShortcutCommand,
  pageShortcutReadsOnly,
} from "./model";
export type {
  PageInsertDirection,
  PageInsertTarget,
  PageMovePosition,
  PageShortcutCommand,
  PageShortcutEvent,
} from "./model";
export { pageMenuItems } from "./menu";
export { insertPageNear, movePageToPosition } from "./operations";
export {
  insertPageDialog,
  insertPositionLabel,
  movePageDialog,
  movePositionLabel,
  pageLocationDialog,
  pageMenuHint,
  pagePositionLabel,
} from "./ui";

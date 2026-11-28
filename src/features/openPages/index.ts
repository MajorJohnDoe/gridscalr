export { OpenPagesController } from "./controller";
export type { OpenPagesHost } from "./controller";
export {
  activatePage,
  closePageTab,
  emptyOpenPages,
  hasSinglePreview,
  openPageTab,
  pinPageTab,
  previewPageTab,
  prunePageTabs,
  seedOpenPages,
} from "./model";
export type { ClosePageTabResult, OpenPageTab, OpenPagesState, PrunePageTabsResult } from "./model";

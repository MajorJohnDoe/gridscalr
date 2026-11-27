import { PageWindowController } from "./controller";

export { PageWindowController } from "./controller";
export {
  PAGE_WINDOW_SIZE,
  clampPageWindowStart,
  pageWindow,
  pageWindowAroundIndex,
  pageWindowContains,
  pageWindowSignature,
} from "./model";
export type { PageWindow } from "./model";
export { pageWindowControls } from "./ui";
export type { PageWindowAction, PageWindowControlsOptions } from "./ui";

/** One window position per window; the Pages panel asks it on every render. */
export const pageWindowState = new PageWindowController();

/**
 * Public surface for the schematics feature.
 *
 * Operation-card templates, the sheet-field model, sheet rendering, the
 * schematic and facility symbol artwork, and the dialogs that edit them. The
 * symbol catalogue itself is pure data and lives in `src/model/symbols`; this
 * feature re-exports it so callers have one import for symbol lookup and
 * sheet rendering.
 *
 * Everything outside `src/features/schematics` imports only this file
 * (`npm run check:modules`).
 */
export * from "./model/fitDrawing";
export * from "./model/sheetDocument";
export * from "./model/sheetTemplate";
export * from "./symbols/registry";
export * from "./render/sheetText";
export {
  baselineY,
  buildSheetPdf,
  buildStaticSheetPdf,
  drawSheetFields,
  toPdfRect,
} from "./render/sheetPdf";
export type { SheetFonts } from "./render/sheetPdf";
export { openLineTypeDialog } from "./ui/lineTypeDialog";
export { openRailDialog } from "./ui/railDialog";
export { openSheetFieldsDialog } from "./ui/sheetFieldsDialog";
export type { SheetFieldsDialogOptions } from "./ui/sheetFieldsDialog";
export { chooseProjectSource } from "./ui/sheetSourceDialog";
export type {
  ProjectSourceChoice,
  SheetSourceChoice,
  SheetSourceMode,
} from "./ui/sheetSourceDialog";

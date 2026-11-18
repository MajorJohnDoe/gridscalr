/**
 * Dialog window host: the shared movable, non-modal dialog shell, its stacking
 * and focus rules, and the small shared prompts.
 */

export {
  closeAllDialogs,
  closeTopDialog,
  dialogCount,
  mountDialog,
  topDialogId,
  type DialogSurface,
  type MountedDialog,
} from "./controller";
export {
  checkDialogTarget,
  clampDialogPosition,
  centeredDialogPosition,
  DialogStack,
  DIALOG_MARGIN,
  DIALOG_Z_BASE,
  targetIdentity,
  type DialogAction,
  type DialogTarget,
  type Point,
  type ResolvedTarget,
  type Size,
  type TargetKind,
  type TargetProblem,
} from "./model";
export {
  confirmDialog,
  depthDialog,
  messageDialog,
  openDialog,
  passwordDialog,
  revalidateTarget,
  revalidateTargetNow,
  textDialog,
  unsavedChangesDialog,
  type ConfirmOptions,
  type DialogOptions,
  type UnsavedChangesChoice,
} from "./ui";

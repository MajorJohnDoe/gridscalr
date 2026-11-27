/**
 * Public surface of the transient overlay registry: the monotonic order and
 * Escape routing shared by tool flyouts, top menus and popovers.
 */

export {
  closeTopTransient,
  registerTransientOverlay,
  topTransientId,
  transientOverlayCount,
  type TransientOverlayHandle,
} from "./controller";
export { TRANSIENT_Z_BASE, TransientStack } from "./model";

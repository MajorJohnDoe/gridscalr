/**
 * Public surface for the one-click rail connection feature. The geometry and
 * guards live in the pure model; the controller owns the single insertion
 * mutation. See issue #378.
 */
export {
  CONNECTION_HIT_TOLERANCE_PX,
  canConnectWireToChannel,
  findRailCrossing,
  isWireKind,
} from "./model";
export type { RailCrossing, WireRef } from "./model";
export { CONNECTION_SYMBOL_ID, connectToChannel } from "./controller";
export type { ConnectToChannelResult } from "./controller";

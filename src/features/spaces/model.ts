/**
 * Pure model surface for spaces. The rules are split by concern so no file
 * grows into a grab bag: the tree walk, the derived area, the mutations and the
 * explicit room-from-text creation. Nothing here imports UI, so the register,
 * the schedule source and a later CSV import share one rule set.
 */
export { spaceArea, spaceAreas, spaceMeasurements } from "./model/area";
export type { SpaceArea, SpaceAreaSource, SpaceAreaWarning, SpaceMeasurement } from "./model/area";
export {
  canReparent,
  duplicateNumberSpaceIds,
  moveSpace,
  parentCandidates,
  spaceSubtreeIds,
  spaceTree,
  uniqueSpaces,
} from "./model/tree";
export type { SpaceNode } from "./model/tree";
export {
  createSpace,
  deleteSpace,
  emptySpaceDraft,
  manualAreaOf,
  spaceDraftFor,
  updateSpace,
  validateSpaceDraft,
} from "./model/mutations";
export type {
  DeleteSpaceResult,
  SpaceDraft,
  SpaceMutationResult,
  SpaceProblem,
  SpaceProblemCode,
} from "./model/mutations";
export {
  linkProblem,
  linkableSelection,
  linkMeasurement,
  linkMeasurements,
  unlinkMeasurement,
} from "./model/links";
export type { LinkManyResult, LinkResult } from "./model/links";
export { createRoomsFromText, roomTextCandidates } from "./model/roomText";
export type { CreateRoomsResult, RoomTextCandidate } from "./model/roomText";

/**
 * Public surface of the spaces feature. The rules live in the pure model files;
 * other modules import only this index so the internals can move. The Phase 4
 * schedule source reads the same derived area from here.
 */
export { openSpacesDialog } from "./ui";
export type { SpacesDialogOptions } from "./ui";
export {
  canReparent,
  createRoomsFromText,
  createSpace,
  deleteSpace,
  duplicateNumberSpaceIds,
  emptySpaceDraft,
  linkMeasurements,
  linkProblem,
  linkableSelection,
  linkMeasurement,
  manualAreaOf,
  moveSpace,
  parentCandidates,
  roomTextCandidates,
  spaceArea,
  spaceAreas,
  spaceDraftFor,
  spaceMeasurements,
  spaceSubtreeIds,
  spaceTree,
  uniqueSpaces,
  unlinkMeasurement,
  updateSpace,
  validateSpaceDraft,
} from "./model";
export type {
  CreateRoomsResult,
  DeleteSpaceResult,
  LinkManyResult,
  LinkResult,
  RoomTextCandidate,
  SpaceArea,
  SpaceAreaSource,
  SpaceAreaWarning,
  SpaceDraft,
  SpaceMeasurement,
  SpaceMutationResult,
  SpaceNode,
  SpaceProblem,
  SpaceProblemCode,
} from "./model";

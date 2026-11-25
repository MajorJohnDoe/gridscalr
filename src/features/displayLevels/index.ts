/**
 * Display levels: the in-memory whole-page bitmap cache used while a scanned
 * drawing pans or zooms. One level per page and zoom octave, bounded by bytes,
 * built through the existing renderer and never part of the project file.
 */

export {
  DisplayLevelController,
  type DisplayLevel,
  type DisplayLevelOptions,
  type DisplayLevelStats,
  type LevelRenderSource,
  type LevelRequest,
} from "./controller";
export {
  LEVEL_BYTES_PER_PIXEL,
  LEVEL_CACHE_BUDGET_BYTES,
  LEVEL_MAX_DIMENSION,
  LEVEL_MAX_PIXELS,
  levelByteSize,
  levelIndexFor,
  levelIsSharpEnough,
  levelKey,
  levelPixels,
  levelScaleFor,
  selectLevelEvictions,
  type LevelEntryMeta,
  type LevelPageSize,
  type LevelPixels,
} from "./model";

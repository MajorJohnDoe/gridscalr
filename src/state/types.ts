import type { CloudFillPreset } from "../model/cloud";
import type {
  AreaMode,
  AreaShape,
  ArrowHeads,
  CountType,
  HighlightShape,
  InspectionStatus,
  Point,
  SelectionRef,
} from "../model/types";

export type ToolId =
  | "select"
  | "pan"
  | "calibrate"
  | "length"
  | "area"
  | "count"
  | "radius"
  | "diameter"
  | "arc"
  | "angle"
  | "slope"
  | "volume"
  | "pen"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "highlight"
  | "text"
  | "textbox"
  | "polyline"
  | "rail"
  | "cloud"
  | "callout"
  | "stamp"
  | "delta"
  | "symbol";

export type LeftTab = "pages" | "layers" | "symbols";

export interface DrawStyle {
  color: string;
  strokeWidth: number;
  fillOpacity: number;
  fontSize: number;
  /** Fill mode for new rectangles and ellipses. */
  shapeFill: "outline" | "filled";
  /** Whether new shape outlines are dashed. */
  dashed: boolean;
}

export interface UIState {
  activeTool: ToolId;
  page: number;
  zoom: number;
  panX: number;
  panY: number;
  selection: SelectionRef[];
  hover: { layerId: string; itemId: string; vertexIndex: number } | null;
  cursor: Point | null;
  leftTab: LeftTab;
  style: DrawStyle;
  /** Text used by the next stamp or revision delta. */
  stampText: string;
  deltaText: string;
  highlightShape: HighlightShape;
  cloudText: boolean;
  cloudFill: CloudFillPreset;
  arrowHeads: ArrowHeads;
  /** Category for new measurements. null means the project default. */
  measureCategoryId: string | null;
  /** Sticky room for new measurements, trimmed when an item is created. */
  measureRoom: string;
  /** Sticky object type for new count measurements. */
  measureCountType: CountType;
  /** Sticky pieces per count object for new count measurements. */
  measureCountQuantity: number;
  /** Sticky add/subtract mode for new area measurements. */
  measureAreaMode: AreaMode;
  /** Sticky quick-area shape for the area tool. */
  measureAreaShape: AreaShape;
  /** Symbol used by the next placement. */
  symbolId: string;
  /** Sticky inspection status for new symbols. null means Not assessed. */
  symbolStatus: InspectionStatus | null;
  /** Sticky line type for new schematic polylines. */
  lineTypeId: string;
  /** Editable line style for the next pipe/duct run. */
  lineStyle: { color: string; widthPt: number; dashed: boolean };
}

export type ChangeReason =
  | "project"
  | "change"
  | "view"
  | "page"
  | "tool"
  | "selection"
  | "cursor"
  | "layers"
  | "save"
  | "undo";

/** Runtime-only fingerprint of the file the editor loaded. Never serialized. */
export interface FileStamp {
  sha256: string;
  sizeBytes: number;
  modifiedAt: number;
}

/** Runtime autosave state consumed by the status bar and diagnostics. */
export interface AutosaveFailure {
  message: string;
  quotaExceeded: boolean;
}

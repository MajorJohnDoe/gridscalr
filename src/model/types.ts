export const SCHEMA_VERSION = 3 as const;

export type LengthUnit = "mm" | "cm" | "m" | "in" | "ft" | "yd";
export type AreaUnit = "mm2" | "cm2" | "m2" | "in2" | "ft2" | "yd2";
export type LayerKind = "measure" | "draw";

export type MeasurementKind = "length" | "area" | "count";
export type CountType = "door" | "window" | "radiator" | "fixture" | "other";
export type AreaMode = "add" | "subtract";
export type DrawingKind =
  | "pen"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "highlight"
  | "text";
export type ItemKind = MeasurementKind | DrawingKind;

export interface Point {
  x: number;
  y: number;
}

export interface ScaleSnapshot {
  /** PDF points that represent one metre in the real world. */
  pointsPerMeter: number;
  sourceUnit: LengthUnit;
}

export interface Calibration {
  id: string;
  p1: Point;
  p2: Point;
  knownLength: number;
  unit: LengthUnit;
  pointsPerMeter: number;
  createdAt: string;
}

export interface MarkupItem {
  id: string;
  page: number;
  kind: ItemKind;
  points: Point[];
  color: string;
  strokeWidth: number;
  fillColor?: string;
  opacity?: number;
  text?: string;
  label?: string;
  fontSize?: number;
  /** Clockwise rotation in degrees. Used by text, rectangles and ellipses. */
  rotation?: number;
  /** Hidden items stay in the project but are not drawn or exported. Defaults to true. */
  visible?: boolean;
  /** Locked items remain visible and exportable, but cannot be edited. Defaults to false. */
  locked?: boolean;
  /** Measurement scale captured when the item was created. */
  scale?: ScaleSnapshot | null;
  /** Measurements only. References a category in the project. */
  categoryId?: string;
  /** Measurements only. Trimmed free text, omitted when empty. */
  room?: string;
  /** Areas only. Defaults to add. */
  areaMode?: AreaMode;
  /** Count items only. */
  countType?: CountType;
  createdAt: string;
  updatedAt: string;
}

export interface SelectionRef {
  layerId: string;
  itemId: string;
}

export interface Layer {
  id: string;
  name: string;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  opacity: number;
  color: string;
  items: MarkupItem[];
}

export interface PageState {
  calibration?: Calibration;
}

export interface DocumentRef {
  name: string;
  path: string | null;
  relativePath: string | null;
  sha256: string;
  pageCount: number;
  sizeBytes: number;
}

export interface ProjectSettings {
  lengthUnit: LengthUnit;
  areaUnit: AreaUnit;
  showGrid: boolean;
  showCalibration: boolean;
  snapToGeometry: boolean;
  quantity: QuantitySettings;
}

/** A user-defined grouping label for measurements. Order in the project is report order. */
export interface Category {
  /** Stable id such as "cat_3f9a". Never reused. */
  id: string;
  /** Editable display name, unique per project, case-insensitive. */
  name: string;
  /** Overrides the project waste percentage. Reserved for Etapp 2B. */
  wastePercent?: number;
  /** Overrides the project rounding step. Reserved for Etapp 2B. */
  roundingStep?: number;
}

export interface QuantitySettings {
  /** Always references a category in the project. */
  defaultCategoryId: string;
  /** 0-100. Project default, used when the category has no override. */
  wastePercent: number;
  /** 0 means no rounding. Otherwise a step in the row's own unit. */
  roundingStep: number;
}

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  document: DocumentRef;
  settings: ProjectSettings;
  /** Ordered category list. At least one category always exists. */
  categories: Category[];
  pages: Record<string, PageState>;
  layers: Layer[];
  activeLayerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageSize {
  width: number;
  height: number;
}

export interface RecentEntry {
  kind: "pdf" | "project";
  path: string;
  name: string;
  at: string;
}

export interface AppViewState {
  page: number;
  zoom: number;
  panX: number;
  panY: number;
}

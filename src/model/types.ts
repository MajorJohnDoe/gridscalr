export const SCHEMA_VERSION = 7 as const;

export type LengthUnit = "mm" | "cm" | "m" | "in" | "ft" | "yd";
export type AreaUnit = "mm2" | "cm2" | "m2" | "in2" | "ft2" | "yd2";
export type LayerKind = "measure" | "draw";

export type MeasurementKind = "length" | "area" | "count";
export type CountType = "door" | "window" | "radiator" | "fixture" | "other";
export type AreaMode = "add" | "subtract";
/** Polygon is the original click-by-click area. Rectangle and ellipse use two opposite points. */
export type AreaShape = "polygon" | "rectangle" | "ellipse";
export type DrawingKind =
  | "pen"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "highlight"
  | "text"
  | "image";
export type ItemKind = MeasurementKind | DrawingKind;

/** Background images sit above the PDF and below every markup. Annotation images follow layer order. */
export type ImageMode = "background" | "annotation";

export interface ImageAsset {
  id: string;
  name: string;
  mime: "image/png" | "image/jpeg";
  /** Natural pixel size after any downscaling. */
  width: number;
  height: number;
  /** Encoded byte size of the embedded image. */
  byteSize: number;
  /** data:image/png;base64,... or data:image/jpeg;base64,... */
  data: string;
}

export interface ImageRef {
  assetId: string;
  mode: ImageMode;
}

export interface Point {
  x: number;
  y: number;
}

export interface ScaleSnapshot {
  /** PDF points that represent one metre in the real world. */
  pointsPerMeter: number;
  sourceUnit: LengthUnit;
}

export interface ReferenceCalibration {
  id: string;
  /** Older project files omit this and are normalized to "reference". */
  source?: "reference";
  p1: Point;
  p2: Point;
  knownLength: number;
  unit: LengthUnit;
  pointsPerMeter: number;
  createdAt: string;
}

export interface ManualCalibration {
  id: string;
  source: "manual";
  /** The N in a 1:N drawing scale. */
  ratio: number;
  pointsPerMeter: number;
  createdAt: string;
}

export type Calibration = ReferenceCalibration | ManualCalibration;

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
  /** Clockwise rotation in degrees. Used by text, rectangles, ellipses and images. */
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
  /** Areas only. Missing means polygon. */
  areaShape?: AreaShape;
  /** Count items only. */
  countType?: CountType;
  /** Images only. References an embedded asset and selects the draw mode. */
  image?: ImageRef;
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
  /** Only valid when the page has a calibration. */
  scaleLocked?: boolean;
}

export type DocumentKind = "pdf" | "tiff";

/** Provenance for a document that GridScalr derived itself, such as a converted TIF. */
export interface DocumentSourceInfo {
  format: "tiff";
  /** X and Y resolution in dots per inch, as read from the TIFF. */
  dpi: [number, number];
  originalName: string;
}

export interface DocumentRef {
  /** Stable id. Page numbers map onto documents in array order. */
  id: string;
  kind: DocumentKind;
  name: string;
  path: string | null;
  relativePath: string | null;
  /** Hash of the source file. For a TIF this is the original .tif, not the derived PDF. */
  sha256: string;
  /** Page count in the source document. */
  pageCount: number;
  /** 1-based source pages explicitly removed from the project. */
  excludedPages?: number[];
  sizeBytes: number;
  /** Only for kind "tiff": base64 encoded PDF derived from the TIFF. */
  embeddedPdf?: string;
  /** Only for kind "tiff". */
  source?: DocumentSourceInfo;
}

export interface ProjectSettings {
  lengthUnit: LengthUnit;
  areaUnit: AreaUnit;
  showGrid: boolean;
  showCalibration: boolean;
  snapToGeometry: boolean;
  /** Markup snap distance in screen pixels. Defaults to 8. */
  snapTolerancePx: number;
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
  /** Source documents in page order. New documents append; pages can be deleted explicitly. */
  documents: DocumentRef[];
  settings: ProjectSettings;
  /** Ordered category list. At least one category always exists. */
  categories: Category[];
  /** Embedded image payloads keyed by asset id. Items reference these by id. */
  assets: Record<string, ImageAsset>;
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

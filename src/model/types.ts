export const SCHEMA_VERSION = 11 as const;

export type LengthUnit = "mm" | "cm" | "m" | "in" | "ft" | "yd";
export type AreaUnit = "mm2" | "cm2" | "m2" | "in2" | "ft2" | "yd2";
export type LayerKind = "measure" | "draw";

export type MeasurementKind = "length" | "area" | "count";
export type CountType = "door" | "window" | "radiator" | "fixture" | "other";
export type AreaMode = "add" | "subtract";
/** Polygon is the original click-by-click area. Rectangle and ellipse use two opposite points. */
export type AreaShape = "polygon" | "rectangle" | "ellipse";
export type HighlightShape = "stroke" | "rectangle" | "polygon";
export type ArrowHeads = "end" | "both";
export type TextAlign = "left" | "center" | "right";
/** Stroke pattern for measurement and drawing lines. Missing means solid. */
export type LineStyle = "solid" | "dashed";
export type DrawingKind =
  | "pen"
  | "line"
  | "arrow"
  | "rect"
  | "ellipse"
  | "highlight"
  | "text"
  | "image"
  | "cloud"
  | "callout"
  | "stamp"
  | "delta";
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
  /** Length measurements only. Missing means solid. */
  lineStyle?: LineStyle;
  /** Count items only. */
  countType?: CountType;
  /** Highlights only. Missing means the original freehand stroke. */
  highlightShape?: HighlightShape;
  /** Arrows only. Missing means a single head at the end point. */
  arrowHeads?: ArrowHeads;
  /** Cloud text labels only: offset from the cloud centre in PDF points. */
  textOffset?: Point;
  /** Measurements only: manual offset for the value label, in PDF points. */
  labelOffset?: Point;
  /** Measurements only: manual leader connection point in PDF coordinates. */
  labelAnchor?: Point;
  /** Clouds only: fixed scallop radius in PDF points. Missing means automatic. */
  cloudRadius?: number;
  /** Callout and cloud text boxes only: fixed box width in PDF points. */
  textBoxWidth?: number;
  /** Callout and cloud text boxes only: fixed box height in PDF points. */
  textBoxHeight?: number;
  /** Text colour for annotation text boxes. Missing uses the default light text. */
  textColor?: string;
  /** Text, callout and cloud text: bold weight. Missing means regular. */
  textBold?: boolean;
  /** Text, callout and cloud text: underline. Missing means no underline. */
  textUnderline?: boolean;
  /** Text, callout and cloud text alignment. Missing means left for notes and centred for callouts and clouds. */
  textAlign?: TextAlign;
  /** Images only. References an embedded asset and selects the draw mode. */
  image?: ImageRef;
  createdAt: string;
  updatedAt: string;
}

export interface SelectionRef {
  layerId: string;
  itemId: string;
}

export interface LayerPageState {
  /** Overrides the layer default on this page. */
  visible?: boolean;
  /** Overrides the layer default on this page. */
  locked?: boolean;
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
  /** Page-specific visibility and lock overrides. */
  pageState?: Record<string, LayerPageState>;
  /** The page where the layer was created. Keeps empty layers discoverable. */
  homePage?: number;
}

export interface PageState {
  calibration?: Calibration;
  /** Only valid when the page has a calibration. */
  scaleLocked?: boolean;
  /** Optional user-facing page title, for example "Window count". */
  name?: string;
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
  /** Set when this reference is a duplicated page of another document entry. */
  copiedFrom?: { documentId: string; page: number };
}

export interface ProjectSettings {
  lengthUnit: LengthUnit;
  areaUnit: AreaUnit;
  /** Show cm below 1 m and metres above 1 m on lengths and labels. */
  smartLengthUnits: boolean;
  showGrid: boolean;
  showCalibration: boolean;
  snapToGeometry: boolean;
  /** Markup snap distance in screen pixels. Defaults to 8. */
  snapTolerancePx: number;
  /** Reusable stamp labels. New projects inherit the app defaults. */
  stampPresets: string[];
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

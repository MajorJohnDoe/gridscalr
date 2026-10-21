export const SCHEMA_VERSION = 2 as const;

export type LengthUnit = "mm" | "cm" | "m" | "in" | "ft" | "yd";
export type AreaUnit = "mm2" | "cm2" | "m2" | "in2" | "ft2";
export type LayerKind = "measure" | "draw";

export type MeasurementKind = "length" | "area";
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
}

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  document: DocumentRef;
  settings: ProjectSettings;
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

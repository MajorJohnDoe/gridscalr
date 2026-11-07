import type { MarkupItem, Point, SelectionRef } from "../model/types";
import type { Bounds } from "../model/geometry";
import type { BoxHandleRole } from "./geometry";

/** The pointer gesture that is currently in progress. */
export interface DragState {
  mode:
    | "move"
    | "vertex"
    | "resize"
    | "scale-selection"
    | "rotate"
    | "label"
    | "measurement-label"
    | "measurement-label-size";
  itemId: string;
  layerId: string;
  vertexIndex: number;
  last: Point;
  moved: boolean;
  handle?: BoxHandleRole;
  startPage?: Point;
  startPoints?: Point[];
  startSelection?: Array<{ ref: SelectionRef; points: Point[] }>;
  startFontSize?: number;
  startSymbolSize?: number;
  startRotation?: number;
  startBounds?: Bounds;
  startAnchor?: Point;
  scaleAnchor?: Point;
  scaleCorner?: Point;
  scaleStartItems?: Array<{ ref: SelectionRef; item: MarkupItem }>;
  center?: Point;
  startAngle?: number;
  startTextOffset?: Point;
  startLabelOffset?: Point;
  startLabelSize?: number;
  startLabelDistance?: number;
}

export interface MarqueeState {
  start: Point;
  current: Point;
  additive: boolean;
}

export interface PanState {
  startX: number;
  startY: number;
  panX: number;
  panY: number;
}

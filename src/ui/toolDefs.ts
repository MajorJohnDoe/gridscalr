import type { ToolId } from "../state/store";

export interface ToolDef {
  id: ToolId;
  label: string;
  icon: string;
  shortcut: string;
  hint: string;
  group: "nav" | "measure" | "draw";
}

export const TOOLS: ToolDef[] = [
  {
    id: "select",
    label: "Select",
    icon: "cursor",
    shortcut: "V",
    hint: "Click to select · drag to move · double-click a segment to add a vertex",
    group: "nav",
  },
  {
    id: "pan",
    label: "Pan",
    icon: "hand",
    shortcut: "H",
    hint: "Drag to pan · hold Space with any tool · Ctrl+wheel zooms",
    group: "nav",
  },
  {
    id: "calibrate",
    label: "Calibrate",
    icon: "ruler",
    shortcut: "K",
    hint: "Click two points on a known dimension, then enter its real length",
    group: "measure",
  },
  {
    id: "length",
    label: "Length",
    icon: "length",
    shortcut: "L",
    hint: "Click each point · Enter or double-click to finish · Shift constrains the angle",
    group: "measure",
  },
  {
    id: "area",
    label: "Area",
    icon: "area",
    shortcut: "A",
    hint: "Click around the perimeter · click the first point or press Enter to close",
    group: "measure",
  },
  {
    id: "count",
    label: "Count",
    icon: "count",
    shortcut: "C",
    hint: "Choose a type, category and room · click to place one count",
    group: "measure",
  },
  {
    id: "pen",
    label: "Pen",
    icon: "pen",
    shortcut: "P",
    hint: "Drag to draw freehand",
    group: "draw",
  },
  {
    id: "line",
    label: "Line",
    icon: "line",
    shortcut: "I",
    hint: "Drag to draw a line · hold Shift to constrain the angle",
    group: "draw",
  },
  {
    id: "arrow",
    label: "Arrow",
    icon: "arrow",
    shortcut: "U",
    hint: "Drag to draw an arrow · hold Shift to constrain the angle",
    group: "draw",
  },
  {
    id: "rect",
    label: "Rectangle",
    icon: "rect",
    shortcut: "R",
    hint: "Drag to draw a rectangle · hold Shift for a square",
    group: "draw",
  },
  {
    id: "ellipse",
    label: "Ellipse",
    icon: "ellipse",
    shortcut: "O",
    hint: "Drag to draw an ellipse · hold Shift for a circle",
    group: "draw",
  },
  {
    id: "highlight",
    label: "Highlight",
    icon: "highlight",
    shortcut: "G",
    hint: "Drag to highlight an area of the drawing",
    group: "draw",
  },
  {
    id: "text",
    label: "Text note",
    icon: "text",
    shortcut: "T",
    hint: "Click a location to place a text note",
    group: "draw",
  },
];

export const TOOL_BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]));

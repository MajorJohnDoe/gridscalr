import type { ToolId } from "../state/store";
import { TOOL_SHORTCUTS } from "./shortcuts";

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
    shortcut: TOOL_SHORTCUTS.select,
    hint: "Click to select · drag to move · double-click a segment to add a vertex",
    group: "nav",
  },
  {
    id: "pan",
    label: "Pan",
    icon: "hand",
    shortcut: TOOL_SHORTCUTS.pan,
    hint: "Drag to pan · hold Space with any tool · Ctrl+wheel zooms",
    group: "nav",
  },
  {
    id: "calibrate",
    label: "Calibrate",
    icon: "ruler",
    shortcut: TOOL_SHORTCUTS.calibrate,
    hint: "Click two points on a known dimension, then enter its real length",
    group: "measure",
  },
  {
    id: "length",
    label: "Length",
    icon: "length",
    shortcut: TOOL_SHORTCUTS.length,
    hint: "Click each point · Enter or double-click to finish · Shift constrains the angle",
    group: "measure",
  },
  {
    id: "area",
    label: "Area",
    icon: "area",
    shortcut: TOOL_SHORTCUTS.area,
    hint: "Polygon: click each point · Rectangle/Ellipse: drag · Shift makes a square/circle",
    group: "measure",
  },
  {
    id: "count",
    label: "Count",
    icon: "count",
    shortcut: TOOL_SHORTCUTS.count,
    hint: "Choose a type, category and room · click to place one count",
    group: "measure",
  },
  {
    id: "pen",
    label: "Pen",
    icon: "pen",
    shortcut: TOOL_SHORTCUTS.pen,
    hint: "Drag to draw freehand",
    group: "draw",
  },
  {
    id: "line",
    label: "Line",
    icon: "line",
    shortcut: TOOL_SHORTCUTS.line,
    hint: "Drag to draw a line · hold Shift to constrain the angle",
    group: "draw",
  },
  {
    id: "arrow",
    label: "Arrow",
    icon: "arrow",
    shortcut: TOOL_SHORTCUTS.arrow,
    hint: "Drag to draw an arrow · Shift constrains the angle · Variants for heads and colour",
    group: "draw",
  },
  {
    id: "rect",
    label: "Rectangle",
    icon: "rect",
    shortcut: TOOL_SHORTCUTS.rect,
    hint: "Drag to draw a rectangle · hold Shift for a square",
    group: "draw",
  },
  {
    id: "ellipse",
    label: "Ellipse",
    icon: "ellipse",
    shortcut: TOOL_SHORTCUTS.ellipse,
    hint: "Drag to draw an ellipse · hold Shift for a circle",
    group: "draw",
  },
  {
    id: "highlight",
    label: "Highlight",
    icon: "highlight",
    shortcut: TOOL_SHORTCUTS.highlight,
    hint: "Drag to highlight · choose Pen, Rectangle or Polygon in the tool flyout",
    group: "draw",
  },
  {
    id: "text",
    label: "Text note",
    icon: "text",
    shortcut: TOOL_SHORTCUTS.text,
    hint: "Click a location to place a text note",
    group: "draw",
  },
  {
    id: "cloud",
    label: "Revision cloud",
    icon: "cloud",
    shortcut: TOOL_SHORTCUTS.cloud,
    hint: "Click each corner · close on the first point or press Enter · Variants for text box and fill",
    group: "draw",
  },
  {
    id: "callout",
    label: "Callout",
    icon: "callout",
    shortcut: TOOL_SHORTCUTS.callout,
    hint: "Click the object to point at, then place the text box · Variants for leader colour",
    group: "draw",
  },
  {
    id: "stamp",
    label: "Stamp",
    icon: "stamp",
    shortcut: TOOL_SHORTCUTS.stamp,
    hint: "Choose a preset and click to place it · Variants for presets · double-click to edit this stamp",
    group: "draw",
  },
  {
    id: "delta",
    label: "Revision delta",
    icon: "delta",
    shortcut: TOOL_SHORTCUTS.delta,
    hint: "Set the revision in the context bar and click to place the triangle",
    group: "draw",
  },
];

export const TOOL_BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]));

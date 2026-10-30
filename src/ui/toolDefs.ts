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
    hint: "Polygon: click each point · Rectangle/Ellipse: drag · Add or Deduct in the context bar",
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
    id: "radius",
    label: "Radius",
    icon: "radius",
    shortcut: TOOL_SHORTCUTS.radius,
    hint: "Click the centre, then a point on the circle",
    group: "measure",
  },
  {
    id: "diameter",
    label: "Diameter",
    icon: "diameter",
    shortcut: TOOL_SHORTCUTS.diameter,
    hint: "Click the centre, then a point on the circle",
    group: "measure",
  },
  {
    id: "arc",
    label: "Arc",
    icon: "arc",
    shortcut: TOOL_SHORTCUTS.arc,
    hint: "Click the start, a point on the curve, then the end",
    group: "measure",
  },
  {
    id: "angle",
    label: "Angle",
    icon: "angle",
    shortcut: TOOL_SHORTCUTS.angle,
    hint: "Click the first ray, the vertex, then the second ray",
    group: "measure",
  },
  {
    id: "slope",
    label: "Slope",
    icon: "slope",
    shortcut: TOOL_SHORTCUTS.slope,
    hint: "Click the run start and end · value is rise over run",
    group: "measure",
  },
  {
    id: "volume",
    label: "Volume",
    icon: "volume",
    shortcut: TOOL_SHORTCUTS.volume,
    hint: "Draw a polygon · set Depth in Properties · value is area × depth",
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
  {
    id: "symbol",
    label: "Symbol",
    icon: "symbol",
    shortcut: TOOL_SHORTCUTS.symbol,
    hint: "Pick a symbol · set status · click to place",
    group: "draw",
  },
];

export const TOOL_BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]));

export type ToolFamilyId = "circle-arc" | "angle-slope";

export interface ToolFamily {
  id: ToolFamilyId;
  label: string;
  tools: ToolId[];
}

export const TOOL_FAMILIES: ToolFamily[] = [
  { id: "circle-arc", label: "Circle & arc", tools: ["radius", "diameter", "arc"] },
  { id: "angle-slope", label: "Angle & slope", tools: ["angle", "slope"] },
];

export const TOOL_FAMILY_BY_ID = new Map(TOOL_FAMILIES.map((family) => [family.id, family]));
export const TOOL_FAMILY_BY_TOOL = new Map<ToolId, ToolFamily>(
  TOOL_FAMILIES.flatMap((family) => family.tools.map((tool) => [tool, family] as const)),
);

const lastFamilyTools = new Map<ToolFamilyId, ToolId>();

export function familyForTool(toolId: ToolId): ToolFamily | undefined {
  return TOOL_FAMILY_BY_TOOL.get(toolId);
}

/** True for the member that owns the rail slot. */
export function isFamilyLeader(toolId: ToolId): boolean {
  const family = familyForTool(toolId);
  return Boolean(family && family.tools[0] === toolId);
}

/** Remembers the most recently used member of a family for this session. */
export function rememberFamilyTool(toolId: ToolId): void {
  const family = familyForTool(toolId);
  if (family) lastFamilyTools.set(family.id, toolId);
}

/** The active member, the last used member, or the family's default leader. */
export function familyToolForDisplay(family: ToolFamily, activeTool: ToolId): ToolId {
  if (family.tools.includes(activeTool)) return activeTool;
  return lastFamilyTools.get(family.id) ?? family.tools[0];
}

export function resetFamilyToolMemory(): void {
  lastFamilyTools.clear();
}

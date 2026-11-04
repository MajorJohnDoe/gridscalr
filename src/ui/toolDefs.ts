import type { MessageKey } from "../i18n";
import type { ToolId } from "../state/store";
import { TOOL_SHORTCUTS } from "./shortcuts";

export interface ToolDef {
  id: ToolId;
  label: MessageKey;
  icon: string;
  shortcut: string;
  hint: MessageKey;
  group: "nav" | "measure" | "draw";
}

export const TOOLS: ToolDef[] = [
  {
    id: "select",
    label: "tool.select",
    icon: "cursor",
    shortcut: TOOL_SHORTCUTS.select,
    hint: "tool.select.hint",
    group: "nav",
  },
  {
    id: "pan",
    label: "tool.pan",
    icon: "hand",
    shortcut: TOOL_SHORTCUTS.pan,
    hint: "tool.pan.hint",
    group: "nav",
  },
  {
    id: "calibrate",
    label: "tool.calibrate",
    icon: "ruler",
    shortcut: TOOL_SHORTCUTS.calibrate,
    hint: "tool.calibrate.hint",
    group: "measure",
  },
  {
    id: "length",
    label: "tool.length",
    icon: "length",
    shortcut: TOOL_SHORTCUTS.length,
    hint: "tool.length.hint",
    group: "measure",
  },
  {
    id: "area",
    label: "tool.area",
    icon: "area",
    shortcut: TOOL_SHORTCUTS.area,
    hint: "tool.area.hint",
    group: "measure",
  },
  {
    id: "count",
    label: "tool.count",
    icon: "count",
    shortcut: TOOL_SHORTCUTS.count,
    hint: "tool.count.hint",
    group: "measure",
  },
  {
    id: "radius",
    label: "tool.radius",
    icon: "radius",
    shortcut: TOOL_SHORTCUTS.radius,
    hint: "tool.radius.hint",
    group: "measure",
  },
  {
    id: "diameter",
    label: "tool.diameter",
    icon: "diameter",
    shortcut: TOOL_SHORTCUTS.diameter,
    hint: "tool.radius.hint",
    group: "measure",
  },
  {
    id: "arc",
    label: "tool.arc",
    icon: "arc",
    shortcut: TOOL_SHORTCUTS.arc,
    hint: "tool.arc.hint",
    group: "measure",
  },
  {
    id: "angle",
    label: "tool.angle",
    icon: "angle",
    shortcut: TOOL_SHORTCUTS.angle,
    hint: "tool.angle.hint",
    group: "measure",
  },
  {
    id: "slope",
    label: "tool.slope",
    icon: "slope",
    shortcut: TOOL_SHORTCUTS.slope,
    hint: "tool.slope.hint",
    group: "measure",
  },
  {
    id: "volume",
    label: "tool.volume",
    icon: "volume",
    shortcut: TOOL_SHORTCUTS.volume,
    hint: "tool.volume.hint",
    group: "measure",
  },
  {
    id: "pen",
    label: "tool.pen",
    icon: "pen",
    shortcut: TOOL_SHORTCUTS.pen,
    hint: "tool.pen.hint",
    group: "draw",
  },
  {
    id: "line",
    label: "tool.line",
    icon: "line",
    shortcut: TOOL_SHORTCUTS.line,
    hint: "tool.line.hint",
    group: "draw",
  },
  {
    id: "arrow",
    label: "tool.arrow",
    icon: "arrow",
    shortcut: TOOL_SHORTCUTS.arrow,
    hint: "tool.arrow.hint",
    group: "draw",
  },
  {
    id: "rect",
    label: "tool.rect",
    icon: "rect",
    shortcut: TOOL_SHORTCUTS.rect,
    hint: "tool.rect.hint",
    group: "draw",
  },
  {
    id: "ellipse",
    label: "tool.ellipse",
    icon: "ellipse",
    shortcut: TOOL_SHORTCUTS.ellipse,
    hint: "tool.ellipse.hint",
    group: "draw",
  },
  {
    id: "highlight",
    label: "tool.highlight",
    icon: "highlight",
    shortcut: TOOL_SHORTCUTS.highlight,
    hint: "tool.highlight.hint",
    group: "draw",
  },
  {
    id: "text",
    label: "tool.text",
    icon: "text",
    shortcut: TOOL_SHORTCUTS.text,
    hint: "tool.text.hint",
    group: "draw",
  },
  {
    id: "cloud",
    label: "tool.cloud",
    icon: "cloud",
    shortcut: TOOL_SHORTCUTS.cloud,
    hint: "tool.cloud.hint",
    group: "draw",
  },
  {
    id: "callout",
    label: "tool.callout",
    icon: "callout",
    shortcut: TOOL_SHORTCUTS.callout,
    hint: "tool.callout.hint",
    group: "draw",
  },
  {
    id: "stamp",
    label: "tool.stamp",
    icon: "stamp",
    shortcut: TOOL_SHORTCUTS.stamp,
    hint: "tool.stamp.hint",
    group: "draw",
  },
  {
    id: "delta",
    label: "tool.delta",
    icon: "delta",
    shortcut: TOOL_SHORTCUTS.delta,
    hint: "tool.delta.hint",
    group: "draw",
  },
  {
    id: "symbol",
    label: "tool.symbol",
    icon: "symbol",
    shortcut: TOOL_SHORTCUTS.symbol,
    hint: "tool.symbol.hint",
    group: "draw",
  },
];

export const TOOL_BY_ID = new Map(TOOLS.map((tool) => [tool.id, tool]));

export type ToolFamilyId = "circle-arc" | "angle-slope";

export interface ToolFamily {
  id: ToolFamilyId;
  label: MessageKey;
  tools: ToolId[];
}

export const TOOL_FAMILIES: ToolFamily[] = [
  { id: "circle-arc", label: "tool.family.circleArc", tools: ["radius", "diameter", "arc"] },
  { id: "angle-slope", label: "tool.family.angleSlope", tools: ["angle", "slope"] },
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

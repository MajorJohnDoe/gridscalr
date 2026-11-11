import type { ToolId } from "../../state/store";

/**
 * Tools that only inspect the drawing. Every other tool creates, measures or
 * edits project data, so a view-only session keeps Select and Pan only.
 */
const INSPECTION_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>(["select", "pan"]);

/** The one rule behind every view-only guard: project data never changes. */
export function isMutationAllowed(viewOnly: boolean): boolean {
  return !viewOnly;
}

export function isInspectionTool(tool: ToolId): boolean {
  return INSPECTION_TOOLS.has(tool);
}

export function isEditingTool(tool: ToolId): boolean {
  return !isInspectionTool(tool);
}

/** Resolves the tool a view-only session is allowed to keep armed. */
export function resolveViewOnlyTool(tool: ToolId): ToolId {
  return isEditingTool(tool) ? "select" : tool;
}

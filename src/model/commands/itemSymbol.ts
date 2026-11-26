import type { Project, SelectionRef } from "../types";
import { applyItemCommand, type ItemCommandResult } from "./shared";

const TAG_MAX_LENGTH = 40;
const TAG_OFFSET_LIMIT = 2000;

/** Normalizes the free-text designation shown next to a symbol. */
export function setItemSymbolTag(
  project: Project,
  refs: SelectionRef[],
  tag: string | undefined,
): ItemCommandResult {
  const value = (tag ?? "").replace(/\s+/g, " ").trim().slice(0, TAG_MAX_LENGTH) || undefined;
  return applyItemCommand(project, refs, (item) => {
    if (item.kind !== "symbol") return false;
    item.tag = value;
    return true;
  });
}

/** Moves a symbol tag along one axis, keeping the other axis unchanged. */
export function setItemSymbolTagOffset(
  project: Project,
  refs: SelectionRef[],
  axis: "x" | "y",
  value: number,
): ItemCommandResult {
  const rounded = Number.isFinite(value) ? Math.round(value) : 0;
  const next = Math.max(-TAG_OFFSET_LIMIT, Math.min(TAG_OFFSET_LIMIT, rounded));
  return applyItemCommand(project, refs, (item) => {
    if (item.kind !== "symbol") return false;
    const current = item.tagOffset ?? { x: 0, y: 0 };
    item.tagOffset = axis === "x" ? { x: next, y: current.y } : { x: current.x, y: next };
    return true;
  });
}

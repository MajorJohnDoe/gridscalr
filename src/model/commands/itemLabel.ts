import { clampLabelSize } from "../label";
import type { Project, SelectionRef } from "../types";
import { applyItemCommand, type ItemCommandResult } from "./shared";

/** Sets or clears the optional free-text label on the selected items. */
export function setItemLabel(
  project: Project,
  refs: SelectionRef[],
  label: string | undefined,
): ItemCommandResult {
  const next = label?.trim() || undefined;
  return applyItemCommand(project, refs, (item) => {
    item.label = next;
    return true;
  });
}

/**
 * Sets the measurement label size in points, or clears it so the label follows
 * the project default. Sizes are clamped to the supported range.
 */
export function setItemLabelSize(
  project: Project,
  refs: SelectionRef[],
  size: number | undefined,
): ItemCommandResult {
  const next = size === undefined ? undefined : clampLabelSize(size);
  return applyItemCommand(project, refs, (item) => {
    if (next === undefined) delete item.labelSize;
    else item.labelSize = next;
    return true;
  });
}

/** Releases a label that was locked inside its area back to free placement. */
export function releaseItemLabelFit(project: Project, refs: SelectionRef[]): ItemCommandResult {
  return applyItemCommand(project, refs, (item) => {
    if (item.labelFit === undefined) return false;
    delete item.labelFit;
    return true;
  });
}

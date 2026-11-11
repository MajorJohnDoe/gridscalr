import { classifyOpenTarget, type OpenTarget } from "../../model/openTarget";

/**
 * Pure target and position rules for a PDF/TIF drop on the Pages panel. The
 * controller owns the DOM; this file never touches the store, the canvas or
 * the i18n catalogs, so the tests can describe the same decisions.
 */

export interface DroppedFile {
  /** Display name used for classification and the import dialog. */
  name: string;
  /** Native path when the drop came from the desktop shell. */
  path: string | null;
  /** Browser `File` when the drop came from the HTML5 fallback. */
  file?: File;
}

export type PageDropDecision =
  | { kind: "drawing"; file: DroppedFile }
  | { kind: "project"; file: DroppedFile }
  | { kind: "unsupported"; file: DroppedFile }
  | { kind: "multiple"; count: number }
  | { kind: "none" };

/** A file drag always exposes `Files`; an internal card drag never does. */
export function isFileDrag(types: readonly string[] | undefined): boolean {
  return Boolean(types?.some((type) => type === "Files"));
}

/**
 * One dropped file at a time keeps the import honest: a batch would need its
 * own ordering rules. A PDF/TIF becomes pages; a project file is never opened
 * over the current project from this target.
 */
export function classifyPageDrop(files: readonly DroppedFile[]): PageDropDecision {
  if (!files.length) return { kind: "none" };
  if (files.length > 1) return { kind: "multiple", count: files.length };
  const file = files[0];
  const target: OpenTarget = classifyOpenTarget(file.name || file.path || "");
  return { kind: target, file };
}

/** True when the pointer is inside a panel rectangle. */
export function pointInRect(
  point: { x: number; y: number },
  rect: { left: number; top: number; right: number; bottom: number },
): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  );
}

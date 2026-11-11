/** What the app should do with a file path or a dropped file name. */
export type OpenTarget = "drawing" | "project" | "unsupported";

/**
 * Classifies a user-supplied path by extension. Kept pure so native paths and
 * browser `File` names use the same rules, and so the Pages-panel drop target
 * and the window-level drop share one decision.
 */
export function classifyOpenTarget(pathOrName: string): OpenTarget {
  const lower = pathOrName.toLowerCase();
  if (lower.endsWith(".pdf") || lower.endsWith(".tif") || lower.endsWith(".tiff")) {
    return "drawing";
  }
  if (lower.endsWith(".gridscalr") || lower.endsWith(".json")) {
    return "project";
  }
  return "unsupported";
}

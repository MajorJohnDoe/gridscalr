/** What the operating system asked GridScalr to open. */
export type LaunchTarget = "project" | "drawing" | "unknown";

const DRAWING_EXTENSIONS = new Set(["pdf", "tif", "tiff"]);

function extensionOf(path: string): string {
  const name = path.trim().split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

/**
 * Classifies a path handed over by the OS. File associations only cover
 * `.gridscalr`, but drawings are accepted too because Windows "Open with" and
 * macOS "Open with" can pass a PDF or TIF.
 */
export function classifyLaunchPath(path: string): LaunchTarget {
  const extension = extensionOf(path);
  if (extension === "gridscalr") return "project";
  if (DRAWING_EXTENSIONS.has(extension)) return "drawing";
  return "unknown";
}

/**
 * The first path worth opening. Extra files are ignored: GridScalr keeps one
 * project per window, and the caller reports that instead of opening silently.
 */
export function firstLaunchPath(paths: readonly string[]): string | null {
  for (const path of paths) {
    if (path.trim() && classifyLaunchPath(path) !== "unknown") return path;
  }
  return null;
}

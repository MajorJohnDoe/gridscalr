const symbolPathCache = new Map<string, Path2D>();

/** Parsed SVG path reused by every canvas draw of the same symbol artwork. */
export function symbolPath(data: string): Path2D {
  let path = symbolPathCache.get(data);
  if (!path) {
    path = new Path2D(data);
    symbolPathCache.set(data, path);
  }
  return path;
}

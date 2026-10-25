/**
 * Path matching for write protection. GridScalr must never overwrite a source
 * drawing, so comparisons are deliberately conservative: slashes are
 * normalised and case is ignored even on case-sensitive file systems. A false
 * positive only asks the user to pick another name; a false negative would
 * destroy source material.
 */
export function pathComparisonKey(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/+$/g, "").toLowerCase();
}

export function sameFilePath(first: string, second: string): boolean {
  const a = pathComparisonKey(first);
  const b = pathComparisonKey(second);
  return Boolean(a) && a === b;
}

/** Returns the protected path that matches, or null when the target is free. */
export function findProtectedPath(
  candidate: string,
  protectedPaths: readonly string[],
): string | null {
  if (!candidate.trim()) return null;
  return protectedPaths.find((path) => sameFilePath(candidate, path)) ?? null;
}

export function assertWritablePath(candidate: string, protectedPaths: readonly string[]): void {
  const match = findProtectedPath(candidate, protectedPaths);
  if (!match) return;
  throw new Error("Choose a different file name. GridScalr will not overwrite a source drawing.");
}

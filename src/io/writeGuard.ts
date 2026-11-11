/**
 * Path matching for write protection. GridScalr must never overwrite a source
 * drawing, so comparisons are deliberately conservative: separators are
 * normalised, the Windows verbatim prefix is stripped and case is ignored even
 * on case-sensitive file systems. A false positive only asks the user to pick
 * another name; a false negative would destroy source material.
 *
 * When a case-insensitive comparison meets two distinct files, the guard
 * refuses rather than assuming which one the user meant. That matches the Rust
 * guard in `src-tauri/src/path_guard.rs`.
 */
import { t } from "../i18n";

/** Strips the `\\?\` / `\\?\UNC\` verbatim prefixes Windows canonical paths carry. */
function stripVerbatimPrefix(text: string): string {
  if (/^\/\/\?\/unc\//i.test(text)) return `//${text.slice(8)}`;
  if (text.startsWith("//?/")) return text.slice(4);
  return text;
}

export function pathComparisonKey(path: string): string {
  const normalized = stripVerbatimPrefix(path.trim().replace(/\\/g, "/"))
    .replace(/\/+/g, "/")
    .replace(/\/+$/g, "");
  return normalized.toLowerCase();
}

export function sameFilePath(first: string, second: string): boolean {
  const a = pathComparisonKey(first);
  const b = pathComparisonKey(second);
  return Boolean(a) && a === b;
}

/** True when `candidate` is `root` or lives below it. */
export function isPathInside(candidate: string, root: string): boolean {
  const target = pathComparisonKey(candidate);
  const base = pathComparisonKey(root);
  if (!target || !base) return false;
  return target === base || target.startsWith(`${base}/`);
}

/** A managed-copy folder is protected as a folder, not only file by file. */
export function isManagedCopyFolder(path: string): boolean {
  return /\.drawings$/i.test(pathComparisonKey(path));
}

/**
 * A drive-relative path such as `C:Plan.pdf` resolves against the per-drive
 * current directory, which the browser cannot know. It is rejected instead of
 * being assumed safe.
 */
export function isDriveRelativePath(path: string): boolean {
  return /^[a-z]:(?:[^/\\]|$)/i.test(path.trim());
}

/** Returns the protected path that matches, or null when the target is free. */
export function findProtectedPath(
  candidate: string,
  protectedPaths: readonly string[],
): string | null {
  if (!candidate.trim()) return null;
  for (const path of protectedPaths) {
    if (!path.trim()) continue;
    if (sameFilePath(candidate, path)) return path;
    if (isManagedCopyFolder(path) && isPathInside(candidate, path)) return path;
  }
  return null;
}

export function assertWritablePath(candidate: string, protectedPaths: readonly string[]): void {
  if (isDriveRelativePath(candidate)) throw new Error(t("guard.ambiguousPath"));
  const match = findProtectedPath(candidate, protectedPaths);
  if (!match) return;
  throw new Error(t("guard.sourceProtected"));
}

/**
 * Pure rules for the conflicted copies GridScalr writes beside a project.
 *
 * A copy is an ordinary sibling file named
 * `<project> (conflicted copy YYYY-MM-DD HHMM).gridscalr`, with an optional
 * attempt number inside the parentheses. This module owns the recognition,
 * ordering and delete rules; the Rust `list_conflicted_copies` command owns the
 * directory read so the frontend never guesses at a path.
 */
export interface ConflictedCopyEntry {
  /** Absolute path reported by the desktop command. */
  path: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: number;
}

export type ConflictedCopyDeleteBlock = "openProject" | "onlyCopy";

const PROJECT_EXTENSION = ".gridscalr";
const COPY_MARKER = " (conflicted copy ";
const STAMP_LENGTH = 15;

function fileNameOf(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return slash < 0 ? path : path.slice(slash + 1);
}

function folderOf(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return slash < 0 ? "" : path.slice(0, slash);
}

function hasProjectExtension(name: string): boolean {
  return name.length >= PROJECT_EXTENSION.length && name.toLowerCase().endsWith(PROJECT_EXTENSION);
}

/**
 * The stem the save flow uses, or null when the path has no file name. It
 * mirrors `conflictedCopyPath`: a `.gridscalr` extension is removed, any other
 * extension stays part of the stem, and an empty stem becomes `project`.
 */
export function projectFileStem(projectPath: string): string | null {
  const name = fileNameOf(projectPath);
  if (!name) return null;
  const stem = hasProjectExtension(name)
    ? name.slice(0, name.length - PROJECT_EXTENSION.length)
    : name;
  return stem || "project";
}

function isStamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2} \d{4}$/.test(value);
}

function isAttempt(value: string): boolean {
  return /^[1-9][0-9]*$/.test(value);
}

/** True only for the documented name this app writes for one project stem. */
export function isConflictedCopyFileName(fileName: string, stem: string): boolean {
  const prefix = `${stem || "project"}${COPY_MARKER}`;
  const extension = PROJECT_EXTENSION.length;
  if (!fileName.startsWith(prefix) || !hasProjectExtension(fileName)) return false;
  if (fileName.length < prefix.length + extension + 1) return false;
  if (fileName[fileName.length - extension - 1] !== ")") return false;
  const inner = fileName.slice(prefix.length, fileName.length - extension - 1);
  if (inner.length < STAMP_LENGTH || !isStamp(inner.slice(0, STAMP_LENGTH))) return false;
  const rest = inner.slice(STAMP_LENGTH);
  if (!rest) return true;
  return rest.startsWith(" ") && isAttempt(rest.slice(1));
}

/**
 * Defence in depth over the desktop command: the entry must carry a matching
 * name and live in the project's own folder. A look-alike is dropped, not shown.
 */
export function isConflictedCopyEntry(entry: ConflictedCopyEntry, projectPath: string): boolean {
  const stem = projectFileStem(projectPath);
  if (!stem || !isConflictedCopyFileName(entry.fileName, stem)) return false;
  if (fileNameOf(entry.path) !== entry.fileName) return false;
  return folderOf(entry.path) === folderOf(projectPath);
}

/** Newest first, with the file name as a stable tie-breaker. */
export function sortConflictedCopiesNewestFirst(
  entries: readonly ConflictedCopyEntry[],
): ConflictedCopyEntry[] {
  return [...entries].sort(
    (left, right) =>
      right.modifiedAt - left.modifiedAt || right.fileName.localeCompare(left.fileName),
  );
}

export function totalConflictedCopyBytes(entries: readonly ConflictedCopyEntry[]): number {
  return entries.reduce((total, entry) => total + entry.sizeBytes, 0);
}

/**
 * Why a copy must not be deleted, or null when deletion may be confirmed.
 *
 * The open project's own file is never a candidate. When the original project
 * file is missing from disk, a single remaining copy is the only version of the
 * project there is, so deleting it would destroy the project data.
 */
export function conflictedCopyDeleteBlock(input: {
  fileName: string;
  projectPath: string;
  projectFileExists: boolean;
  copyCount: number;
}): ConflictedCopyDeleteBlock | null {
  if (fileNameOf(input.projectPath).toLowerCase() === input.fileName.toLowerCase()) {
    return "openProject";
  }
  if (!input.projectFileExists && input.copyCount <= 1) return "onlyCopy";
  return null;
}

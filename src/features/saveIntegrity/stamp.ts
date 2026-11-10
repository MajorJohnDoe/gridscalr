/**
 * A runtime-only fingerprint of the project file on disk. It is captured when
 * a project is opened and after every verified save. It is never part of the
 * project JSON.
 */
export interface ProjectFileStamp {
  sha256: string;
  sizeBytes: number;
  modifiedAt: number;
}

/** The hash is authoritative; size is a cheap secondary check. */
export function sameFileVersion(
  expected: ProjectFileStamp | null,
  current: ProjectFileStamp | null,
): boolean {
  if (!expected || !current) return false;
  return (
    expected.sha256.toLowerCase() === current.sha256.toLowerCase() &&
    expected.sizeBytes === current.sizeBytes
  );
}

/**
 * A Save with nothing to save must not rewrite the file. Save As always
 * proceeds so the user can choose a new destination.
 */
export function isNoOpSave(dirty: boolean, saveAs: boolean, hasPath: boolean): boolean {
  return hasPath && !dirty && !saveAs;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `YYYY-MM-DD HHMM` in local time, safe in a file name. */
export function conflictTimestamp(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

function splitPath(path: string): { folder: string; separator: string; name: string } {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (slash < 0) return { folder: "", separator: "/", name: path };
  const separator = path[slash] === "\\" ? "\\" : "/";
  return { folder: path.slice(0, slash), separator, name: path.slice(slash + 1) };
}

/**
 * Builds `<project> (conflicted copy YYYY-MM-DD HHMM).gridscalr` next to the
 * original. `attempt` adds a numbered suffix when that name already exists.
 */
export function conflictedCopyPath(targetPath: string, date: Date, attempt = 1): string {
  const { folder, separator, name } = splitPath(targetPath);
  const stem = name.replace(/\.gridscalr$/i, "") || "project";
  const suffix = attempt > 1 ? ` ${attempt}` : "";
  const copyName = `${stem} (conflicted copy ${conflictTimestamp(date)}${suffix}).gridscalr`;
  return folder ? `${folder}${separator}${copyName}` : copyName;
}

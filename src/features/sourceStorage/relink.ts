import type { DocumentRef } from "../../model/types";
import { basename, joinPath } from "../../io/platform";
import { findSourceByHash, type SourceFileInfo } from "./files";
import { isManagedDocument } from "./mode";

export type SourceChangeAction = "reload" | "useCurrent" | "relink" | "copyIntoProject";

/** Actions offered for a changed or missing source. Never auto-applied. */
export function sourceChangeActions(document: DocumentRef): SourceChangeAction[] {
  if (document.kind !== "pdf") return [];
  if (isManagedDocument(document)) return ["reload", "useCurrent", "relink"];
  return ["reload", "useCurrent", "relink", "copyIntoProject"];
}

export function checksumMatches(expected: string, actual: string): boolean {
  return Boolean(expected) && expected.toLowerCase() === actual.toLowerCase();
}

export function pageCountChanged(expected: number, actual: number): boolean {
  return expected > 0 && actual > 0 && expected !== actual;
}

/** Project folder and its managed drawings folder, in that order. */
export function relinkSearchFolders(projectPath: string | null): string[] {
  if (!projectPath) return [];
  const normalized = projectPath.replace(/\\/g, "/");
  const folder = normalized.split("/").slice(0, -1).join("/");
  if (!folder) return [];
  const projectName = basename(projectPath).replace(/\.gridscalr$/i, "");
  const separator = projectPath.includes("\\") ? "\\" : "/";
  const parent = projectPath.split(/[\\/]/).slice(0, -1).join(separator);
  return [folder, joinPath(parent || folder, `${projectName}.drawings`)];
}

/**
 * Additive relink helper: checks only the project folder and its managed
 * drawings folder for the expected checksum. It never scans the file system.
 */
export async function findRelinkSource(
  projectPath: string | null,
  expectedSha256: string,
): Promise<SourceFileInfo | null> {
  if (!expectedSha256) return null;
  for (const folder of relinkSearchFolders(projectPath)) {
    const found = await findSourceByHash(folder, expectedSha256);
    if (found) return found;
  }
  return null;
}

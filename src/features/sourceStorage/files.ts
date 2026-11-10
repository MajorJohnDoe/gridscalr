import { invoke } from "@tauri-apps/api/core";

export interface ManagedCopyRequest {
  sourcePath: string;
  projectPath: string;
  displayName: string;
  protectedPaths: string[];
}

export interface ManagedCopyResult {
  destinationPath: string;
  relativePath: string;
  sha256: string;
  sizeBytes: number;
}

export interface SourceFileInfo {
  path: string;
  sha256: string;
  sizeBytes: number;
}

/** Copies a drawing into the project's sibling drawings folder. */
export async function copySourceToProject(request: ManagedCopyRequest): Promise<ManagedCopyResult> {
  return invoke<ManagedCopyResult>("source_copy_to_project", { request });
}

/** Existence, size and SHA-256 for one source, or null when it is missing. */
export async function sourceFileHash(path: string): Promise<SourceFileInfo | null> {
  return invoke<SourceFileInfo | null>("source_file_hash", { path });
}

/** Searches one folder, non-recursively, for a file with the expected hash. */
export async function findSourceByHash(
  folder: string,
  expectedSha256: string,
): Promise<SourceFileInfo | null> {
  return invoke<SourceFileInfo | null>("source_find_by_hash", {
    folder,
    expectedSha256,
  });
}

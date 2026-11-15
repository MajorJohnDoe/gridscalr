import { invoke } from "@tauri-apps/api/core";

/** One verified derived-PDF cache write beside a project. */
export interface DerivedCacheWriteRequest {
  projectPath: string;
  sourceSha256: string;
  converterVersion: number;
  pageCount: number;
  dataBase64: string;
  protectedPaths: string[];
}

export interface DerivedCacheInfo {
  destinationPath: string;
  relativePath: string;
  sha256: string;
  sizeBytes: number;
}

/**
 * Writes a derived PDF into the project's sibling `<stem>.derived` folder and
 * returns the verified path. The Rust command owns the folder and file naming,
 * so the stored marker never guesses at a path the writer did not use.
 */
export async function writeDerivedCache(
  request: DerivedCacheWriteRequest,
): Promise<DerivedCacheInfo> {
  return invoke<DerivedCacheInfo>("derived_cache_write", { request });
}

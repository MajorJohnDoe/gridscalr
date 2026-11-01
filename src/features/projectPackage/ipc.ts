import { Channel, invoke } from "@tauri-apps/api/core";
import type { PackageManifest, PackageProgress } from "./model";

export interface PackageSourceRequest {
  sourcePath: string;
  archivePath: string;
  kind: "pdf" | "tiff";
  expectedSha256: string;
}

export interface PackageDataRequest {
  archivePath: string;
  kind: string;
  dataBase64: string;
}

export interface PackageCreateRequest {
  jobId: string;
  outputPath: string;
  projectFileName: string;
  projectJson: string;
  projectSchema: number;
  appVersion: string;
  createdAt: string;
  documents: PackageSourceRequest[];
  exports: PackageDataRequest[];
  sourceScans: PackageSourceRequest[];
  protectedPaths: string[];
}

export interface PackageCreateResult {
  outputPath: string;
  manifest: PackageManifest;
  manifestJson: string;
  totalBytes: number;
}

export interface PackageInspection {
  manifest: PackageManifest;
  manifestJson: string;
  destinationPath: string;
  destinationExists: boolean;
  projectName: string;
}

export interface PackageExtractResult {
  projectPath: string;
  manifest: PackageManifest;
  manifestJson: string;
  extractedTo: string;
}

function channelFor(onProgress: (progress: PackageProgress) => void): Channel<PackageProgress> {
  const channel = new Channel<PackageProgress>();
  channel.onmessage = onProgress;
  return channel;
}

export function createProjectPackage(
  request: PackageCreateRequest,
  onProgress: (progress: PackageProgress) => void,
): Promise<PackageCreateResult> {
  return invoke<PackageCreateResult>("package_create", {
    request,
    onProgress: channelFor(onProgress),
  });
}

export function inspectProjectPackage(packagePath: string): Promise<PackageInspection> {
  return invoke<PackageInspection>("package_inspect", { packagePath });
}

export function extractProjectPackage(
  request: {
    jobId: string;
    packagePath: string;
    destinationPath: string;
    mode: "new" | "replace" | "reuse";
  },
  onProgress: (progress: PackageProgress) => void,
): Promise<PackageExtractResult> {
  return invoke<PackageExtractResult>("package_extract", {
    request,
    onProgress: channelFor(onProgress),
  });
}

export function cancelProjectPackage(jobId: string): Promise<void> {
  return invoke<void>("package_cancel", { jobId });
}

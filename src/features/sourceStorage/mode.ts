import type { DocumentRef, DocumentStorageMode } from "../../model/types";

/** A coarse, non-blocking hint about where a picked drawing lives. */
export type SourceLocationKind = "local" | "network" | "cloud";

export interface SourceLocationHint {
  kind: SourceLocationKind;
  /** Stable catalog key suffix: `unc`, `cloud` or none. */
  reason: "unc" | "cloud" | null;
}

/**
 * Path segments used by common cloud clients. The list is deliberately short
 * and documented in `docs/limitations.md`; it is a recommendation hint, never
 * a rule and never a reason to block a local reference.
 */
const CLOUD_SEGMENTS = new Set([
  "onedrive",
  "onedrive - personal",
  "dropbox",
  "google drive",
  "google-drive",
  "googledrive",
  "my drive",
  "icloud",
  "icloud drive",
  "mobile documents",
  "box",
  "box.com",
  "dropbox (personal)",
  "sharepoint",
  "sharepoint online",
  "nextcloud",
  "owncloud",
  "seafile",
  "pcloud",
  "mega",
  "yandexdisk",
  "yandex disk",
  "nutstore",
]);

export function documentStorage(document: DocumentRef): DocumentStorageMode {
  return document.storage === "managed" ? "managed" : "reference";
}

export function isManagedDocument(document: DocumentRef): boolean {
  return documentStorage(document) === "managed";
}

/** The effective storage mode for display, including TIF and template docs. */
export function storageModeLabelKey(document: DocumentRef): string {
  if (document.kind === "template") return "sourceStorage.modeEmbedded";
  if (document.kind === "tiff") return "sourceStorage.modeEmbedded";
  return isManagedDocument(document) ? "sourceStorage.modeManaged" : "sourceStorage.modeReference";
}

export function normalizeStorageValue(value: DocumentStorageMode | undefined): DocumentStorageMode {
  return value === "managed" ? "managed" : "reference";
}

function segmentMatches(segment: string): boolean {
  const normalized = segment.trim().toLowerCase();
  if (CLOUD_SEGMENTS.has(normalized)) return true;
  // A client folder often carries a company suffix, such as
  // "OneDrive - Contoso" or "Dropbox (Team)".
  return [...CLOUD_SEGMENTS].some(
    (known) => normalized.startsWith(`${known} `) || normalized.startsWith(`${known}(`),
  );
}

/**
 * Detects an UNC network path or a well-known cloud-client folder. The result
 * only drives an import recommendation; reference remains the default for an
 * ordinary local path and the user always chooses.
 */
export function detectSourceLocation(path: string | null | undefined): SourceLocationHint {
  if (!path) return { kind: "local", reason: null };
  const normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("//")) return { kind: "network", reason: "unc" };
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some(segmentMatches)) return { kind: "cloud", reason: "cloud" };
  return { kind: "local", reason: null };
}

export function shouldRecommendManagedCopy(hint: SourceLocationHint): boolean {
  return hint.kind === "network" || hint.kind === "cloud";
}

/** Removes a folder and extension from a display name for action copy. */
export function displayLeafName(name: string): string {
  return name.split(/[\\/]/).pop() ?? name;
}

import type { PageId, PageProvenance, PageRecord, Project } from "../../model/types";

/**
 * A read-only, display-safe summary of one page's import provenance.
 *
 * `PageProvenance` stores the source project's stable ID, not its display name,
 * and it deliberately contains no file paths. The summary repeats that rule:
 * every string here is an identifier, a hash, a version or an ISO timestamp.
 */
export interface ProvenanceSummary {
  sourceProjectId: string;
  sourceProjectShort: string;
  sourcePageId: string;
  sourcePageShort: string;
  /** 1-based page inside the imported source document, when the record has one. */
  sourcePageNumber: number | null;
  sourceRevisionSha256: string;
  revisionShort: string;
  sourceRevisionSize: number;
  sourceRevisionModifiedAt: string | null;
  importedAt: string;
  appVersion: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const SHA256 = /^[a-f0-9]{64}$/i;
const APP_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,39}$/;

/**
 * Identifiers are shown with their type prefix and a short unique tail:
 * `project_1a2b3c4d…` reads better than a bare UUID and stays unambiguous.
 */
export function shortIdentifier(value: string, tail = 8): string {
  const separator = value.indexOf("_");
  if (separator < 0) return value.length <= 12 ? value : `${value.slice(0, 12)}…`;
  const prefix = value.slice(0, separator + 1);
  const rest = value.slice(separator + 1);
  if (!rest) return prefix;
  return rest.length <= tail ? `${prefix}${rest}` : `${prefix}${rest.slice(0, tail)}…`;
}

/** A revision hash is shown as its first 12 hex characters. */
export function shortRevision(hash: string): string {
  return hash.slice(0, 12);
}

function safeId(value: unknown): string | null {
  return typeof value === "string" && SAFE_ID.test(value) ? value : null;
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return Number.isFinite(Date.parse(value)) ? value : null;
}

function safeSize(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

/**
 * Returns null for missing, partial, path-like or otherwise malformed
 * provenance. The load report already drops such records with
 * `droppedPageProvenance`; this guards in-memory data as well so the interface
 * never shows an empty block or a value it cannot trust.
 */
export function summarizePageProvenance(
  page: Pick<PageRecord, "provenance" | "localPage">,
): ProvenanceSummary | null {
  const provenance: Partial<PageProvenance> | undefined = page.provenance;
  if (!provenance || typeof provenance !== "object") return null;

  const sourceProjectId = safeId(provenance.sourceProjectId);
  const sourcePageId = safeId(provenance.sourcePageId);
  const revision =
    typeof provenance.sourceRevisionSha256 === "string" &&
    SHA256.test(provenance.sourceRevisionSha256)
      ? provenance.sourceRevisionSha256.toLowerCase()
      : null;
  const size = safeSize(provenance.sourceRevisionSize);
  const importedAt = isoTimestamp(provenance.importedAt);
  const appVersion =
    typeof provenance.appVersion === "string" && APP_VERSION.test(provenance.appVersion)
      ? provenance.appVersion
      : null;
  const modifiedAt =
    provenance.sourceRevisionModifiedAt === null
      ? null
      : isoTimestamp(provenance.sourceRevisionModifiedAt);

  if (
    !sourceProjectId ||
    !sourcePageId ||
    !revision ||
    size === null ||
    !importedAt ||
    !appVersion ||
    (provenance.sourceRevisionModifiedAt !== null && !modifiedAt)
  ) {
    return null;
  }

  const sourcePageNumber =
    Number.isInteger(page.localPage) && page.localPage >= 1 ? page.localPage : null;

  return {
    sourceProjectId,
    sourceProjectShort: shortIdentifier(sourceProjectId),
    sourcePageId,
    sourcePageShort: shortIdentifier(sourcePageId),
    sourcePageNumber,
    sourceRevisionSha256: revision,
    revisionShort: shortRevision(revision),
    sourceRevisionSize: size,
    sourceRevisionModifiedAt: modifiedAt,
    importedAt,
    appVersion,
  };
}

/** Provenance for one page, or null when the page is not imported or is invalid. */
export function pageProvenanceSummary(project: Project, pageId: PageId): ProvenanceSummary | null {
  const page = project.pages.find((entry) => entry.id === pageId);
  return page ? summarizePageProvenance(page) : null;
}

/** Valid provenance keyed by page ID. Built once per Markups render. */
export function provenanceByPage(project: Project): Map<PageId, ProvenanceSummary> {
  const summaries = new Map<PageId, ProvenanceSummary>();
  for (const page of project.pages) {
    const summary = summarizePageProvenance(page);
    if (summary) summaries.set(page.id, summary);
  }
  return summaries;
}

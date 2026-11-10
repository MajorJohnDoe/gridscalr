import { t } from "../../i18n";
import { makeId } from "../../model/calibration";
import type { DocumentRef } from "../../model/types";

export function normalizeSheetFields(rawValue: unknown): Record<string, string> {
  if (typeof rawValue !== "object" || rawValue === null) return {};
  const fields: Record<string, string> = {};
  for (const [id, value] of Object.entries(rawValue)) {
    if (!id || id.length > 120 || typeof value !== "string") continue;
    fields[id] = value.slice(0, 500);
  }
  return fields;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * Appends the storage fields in one fixed order so a parse → serialize →
 * parse round trip produces byte-identical JSON.
 */
function normalizeStorageFields(document: DocumentRef, rawDoc: Partial<DocumentRef>): void {
  if (document.kind === "template") {
    document.storage = "reference";
    return;
  }
  if (rawDoc.storage !== "managed") {
    if (rawDoc.storage === "reference") document.storage = "reference";
    return;
  }
  document.storage = "managed";
  document.originalPath =
    typeof rawDoc.originalPath === "string" && rawDoc.originalPath ? rawDoc.originalPath : null;
  if (typeof rawDoc.originalSha256 === "string" && SHA256_PATTERN.test(rawDoc.originalSha256)) {
    document.originalSha256 = rawDoc.originalSha256.toLowerCase();
  }
}

export function normalizeDocument(rawValue: unknown, report?: (code: string) => void): DocumentRef {
  const rawDoc = (
    typeof rawValue === "object" && rawValue !== null ? rawValue : {}
  ) as Partial<DocumentRef> & {
    source?: { format?: unknown; dpi?: unknown; originalName?: unknown };
  };
  const kind = rawDoc.kind === "tiff" ? "tiff" : rawDoc.kind === "template" ? "template" : "pdf";
  const document: DocumentRef = {
    id: typeof rawDoc.id === "string" && rawDoc.id ? rawDoc.id : makeId("doc"),
    kind,
    name:
      typeof rawDoc.name === "string" && rawDoc.name.trim()
        ? rawDoc.name
        : kind === "tiff"
          ? "Untitled.tif"
          : kind === "template"
            ? t("sheet.untitled")
            : "Untitled.pdf",
    path: typeof rawDoc.path === "string" && rawDoc.path ? rawDoc.path : null,
    relativePath:
      typeof rawDoc.relativePath === "string" && rawDoc.relativePath ? rawDoc.relativePath : null,
    sha256: typeof rawDoc.sha256 === "string" ? rawDoc.sha256 : "",
    pageCount:
      typeof rawDoc.pageCount === "number" && Number.isFinite(rawDoc.pageCount)
        ? Math.max(1, Math.round(rawDoc.pageCount))
        : 1,
    sizeBytes:
      typeof rawDoc.sizeBytes === "number" && Number.isFinite(rawDoc.sizeBytes)
        ? Math.max(0, Math.round(rawDoc.sizeBytes))
        : 0,
  };
  if (kind === "template") {
    const rawTemplate = (
      typeof rawDoc.template === "object" && rawDoc.template !== null ? rawDoc.template : {}
    ) as Partial<NonNullable<DocumentRef["template"]>>;
    document.template = {
      id:
        typeof rawTemplate.id === "string" && rawTemplate.id.trim()
          ? rawTemplate.id
          : "gridscalr.operation-card.frame",
      version:
        typeof rawTemplate.version === "number" && Number.isFinite(rawTemplate.version)
          ? Math.max(1, Math.round(rawTemplate.version))
          : 1,
      paper: rawTemplate.paper === "A2" ? "A2" : "A3",
      fields: normalizeSheetFields(rawTemplate.fields),
    };
    document.path = null;
    document.relativePath = null;
    document.sha256 = "";
    document.pageCount = 1;
    document.sizeBytes = 0;
    normalizeStorageFields(document, rawDoc);
    return document;
  }

  if (rawDoc.superseded === true) document.superseded = true;
  if (Array.isArray(rawDoc.excludedPages)) {
    const rawExcluded = rawDoc.excludedPages.filter(
      (value) => typeof value === "number" && Number.isFinite(value),
    );
    const excluded = [
      ...new Set(
        rawExcluded
          .map((value) => Math.round(value))
          .filter((value) => value >= 1 && value <= document.pageCount),
      ),
    ].sort((a, b) => a - b);
    if (excluded.length) document.excludedPages = excluded;
    if (excluded.length !== rawDoc.excludedPages.length) report?.("droppedExcludedPage");
  }
  if (rawDoc.copiedFrom && typeof rawDoc.copiedFrom === "object") {
    const copied = rawDoc.copiedFrom as { documentId?: unknown; page?: unknown };
    if (
      typeof copied.documentId === "string" &&
      copied.documentId &&
      typeof copied.page === "number" &&
      Number.isInteger(copied.page) &&
      copied.page >= 1 &&
      copied.page <= document.pageCount
    ) {
      document.copiedFrom = { documentId: copied.documentId, page: copied.page };
    } else {
      report?.("droppedCopiedFrom");
    }
  }
  if (kind === "tiff") {
    if (typeof rawDoc.embeddedPdf !== "string" || !rawDoc.embeddedPdf) {
      throw new Error(t("projectFile.missingEmbeddedPdf"));
    }
    document.embeddedPdf = rawDoc.embeddedPdf;
    const dpi = Array.isArray(rawDoc.source?.dpi) ? rawDoc.source.dpi : [];
    const x = typeof dpi[0] === "number" && dpi[0] > 0 ? dpi[0] : 300;
    const y = typeof dpi[1] === "number" && dpi[1] > 0 ? dpi[1] : x;
    document.source = {
      format: "tiff",
      dpi: [x, y],
      originalName:
        typeof rawDoc.source?.originalName === "string" && rawDoc.source.originalName
          ? rawDoc.source.originalName
          : document.name,
    };
  }
  normalizeStorageFields(document, rawDoc);
  return document;
}

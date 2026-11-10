import { isMeasurementKind } from "./layers";
import type { ImageAsset, MarkupItem, PageRecord, Project } from "./types";

/**
 * Shared referential-integrity rules for a project.
 *
 * The validator is pure: it never mutates, drops or rewrites data. Codes are
 * stable technical identifiers; the user-facing text is translated from the
 * code by the project-integrity feature. Messages stay lowercase technical
 * English so the i18n gate does not mistake them for interface prose.
 */

export type ProjectIssueSeverity = "error" | "warning";

export interface ProjectIssueEntity {
  kind: string;
  id?: string;
}

export interface ProjectIssue {
  severity: ProjectIssueSeverity;
  code: string;
  message: string;
  entity?: ProjectIssueEntity;
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/i;

function issue(
  severity: ProjectIssueSeverity,
  code: string,
  entity?: ProjectIssueEntity,
  message = code,
): ProjectIssue {
  return entity ? { severity, code, message, entity } : { severity, code, message };
}

function isFinitePoint(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const point = value as { x?: unknown; y?: unknown };
  return (
    typeof point.x === "number" &&
    Number.isFinite(point.x) &&
    typeof point.y === "number" &&
    Number.isFinite(point.y)
  );
}

function isIsoTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function checkUnique(
  issues: ProjectIssue[],
  seen: Set<string>,
  id: string,
  kind: string,
  code: string,
): void {
  if (seen.has(id)) {
    issues.push(issue("error", code, { kind, id }));
    return;
  }
  seen.add(id);
}

function validateAsset(asset: ImageAsset, key: string, issues: ProjectIssue[]): void {
  const prefix = asset.mime === "image/png" ? "data:image/png;base64," : "data:image/jpeg;base64,";
  if (asset.mime !== "image/png" && asset.mime !== "image/jpeg") {
    issues.push(issue("error", "assetInvalidMime", { kind: "asset", id: key }));
  } else if (!asset.data.startsWith(prefix) || asset.data.length <= prefix.length) {
    issues.push(issue("error", "assetMimeMismatch", { kind: "asset", id: key }));
  }
  if (
    typeof asset.width !== "number" ||
    !Number.isFinite(asset.width) ||
    asset.width <= 0 ||
    typeof asset.height !== "number" ||
    !Number.isFinite(asset.height) ||
    asset.height <= 0
  ) {
    issues.push(issue("error", "assetInvalidSize", { kind: "asset", id: key }));
  }
}

function validateItemGeometry(item: MarkupItem, issues: ProjectIssue[]): void {
  if (!item.points.length || !item.points.every(isFinitePoint)) {
    issues.push(issue("error", "invalidItemGeometry", { kind: "item", id: item.id }));
    return;
  }
  if (item.kind === "polyline" && item.points.length > 500) {
    issues.push(issue("error", "invalidItemGeometry", { kind: "item", id: item.id }));
  }
  if (item.kind === "image" || item.kind === "textbox") {
    const [first, second] = item.points;
    if (!first || !second) {
      issues.push(issue("error", "invalidItemGeometry", { kind: "item", id: item.id }));
      return;
    }
    const minimum = item.kind === "image" ? 0.5 : 2;
    if (Math.abs(second.x - first.x) < minimum || Math.abs(second.y - first.y) < minimum) {
      issues.push(
        issue("error", item.kind === "image" ? "invalidImageGeometry" : "invalidTextboxGeometry", {
          kind: "item",
          id: item.id,
        }),
      );
    }
  }
}

function validatePageProvenance(page: PageRecord, issues: ProjectIssue[]): void {
  const provenance = page.provenance;
  if (!provenance) return;
  if (
    !provenance.sourceProjectId ||
    !provenance.sourcePageId ||
    !SHA256_PATTERN.test(provenance.sourceRevisionSha256) ||
    !Number.isFinite(provenance.sourceRevisionSize) ||
    provenance.sourceRevisionSize < 0 ||
    !provenance.importedAt ||
    !isIsoTimestamp(provenance.importedAt) ||
    !provenance.appVersion
  ) {
    issues.push(issue("warning", "invalidPageProvenance", { kind: "page", id: page.id }));
  }
}

/**
 * Validates every persistent reference and identity in a project.
 *
 * Zero documents and zero pages are valid from schema 24 onward. The checks do
 * not require every document to own a page: superseded documents and managed
 * sources with no remaining pages are valid.
 */
export function validateProject(project: Project): ProjectIssue[] {
  const issues: ProjectIssue[] = [];
  const documentIds = new Set<string>();
  const pageIds = new Set<string>();
  const layerIds = new Set<string>();
  const itemIds = new Set<string>();
  const categoryIds = new Set<string>();
  const countTypeIds = new Set<string>();
  const lineTypeIds = new Set<string>();
  const presetIds = new Set<string>();
  const viewIds = new Set<string>();

  for (const document of project.documents) {
    checkUnique(issues, documentIds, document.id, "document", "duplicateDocumentId");
    if (!Number.isInteger(document.pageCount) || document.pageCount < 1) {
      issues.push(
        issue("error", "invalidDocumentPageCount", { kind: "document", id: document.id }),
      );
    }
    if (
      document.storage !== undefined &&
      document.storage !== "reference" &&
      document.storage !== "managed"
    ) {
      issues.push(
        issue("warning", "invalidDocumentStorage", { kind: "document", id: document.id }),
      );
    }
    if (document.storage === "managed" && document.kind === "pdf" && !document.relativePath) {
      issues.push(
        issue("error", "managedSourceMissingRelativePath", { kind: "document", id: document.id }),
      );
    }
    if (document.originalSha256 !== undefined && !SHA256_PATTERN.test(document.originalSha256)) {
      issues.push(
        issue("warning", "invalidOriginalSourceHash", { kind: "document", id: document.id }),
      );
    }
    for (const excluded of document.excludedPages ?? []) {
      if (!Number.isInteger(excluded) || excluded < 1 || excluded > document.pageCount) {
        issues.push(issue("warning", "invalidExcludedPage", { kind: "document", id: document.id }));
      }
    }
    if (document.copiedFrom) {
      const source = project.documents.find(
        (entry) => entry.id === document.copiedFrom?.documentId,
      );
      if (!source) {
        issues.push(
          issue("warning", "missingCopiedFromDocument", { kind: "document", id: document.id }),
        );
      } else if (
        !Number.isInteger(document.copiedFrom.page) ||
        document.copiedFrom.page < 1 ||
        document.copiedFrom.page > source.pageCount
      ) {
        issues.push(
          issue("warning", "invalidCopiedFromPage", { kind: "document", id: document.id }),
        );
      }
    }
  }

  for (const page of project.pages) {
    checkUnique(issues, pageIds, page.id, "page", "duplicatePageId");
    const document = project.documents.find((entry) => entry.id === page.documentId);
    if (!document) {
      issues.push(issue("error", "missingPageDocument", { kind: "page", id: page.id }));
    } else if (
      !Number.isInteger(page.localPage) ||
      page.localPage < 1 ||
      page.localPage > document.pageCount
    ) {
      issues.push(issue("error", "pageLocalPageOutOfRange", { kind: "page", id: page.id }));
    }
    const ocr = page.state?.ocr;
    if (ocr) {
      if (document && ocr.documentSha256 !== document.sha256) {
        issues.push(issue("warning", "ocrDocumentMismatch", { kind: "page", id: page.id }));
      }
      if (
        !Number.isInteger(ocr.sourcePage) ||
        ocr.sourcePage < 1 ||
        ocr.sourcePage !== page.localPage
      ) {
        issues.push(issue("warning", "ocrSourcePageMismatch", { kind: "page", id: page.id }));
      }
    }
    validatePageProvenance(page, issues);
  }

  for (const category of project.categories) {
    checkUnique(issues, categoryIds, category.id, "category", "duplicateCategoryId");
  }
  for (const countType of project.countTypes) {
    checkUnique(issues, countTypeIds, countType.id, "countType", "duplicateCountTypeId");
  }
  for (const lineType of project.lineTypes) {
    checkUnique(issues, lineTypeIds, lineType.id, "lineType", "duplicateLineTypeId");
  }
  if (!categoryIds.has(project.settings.quantity.defaultCategoryId)) {
    issues.push(
      issue("error", "missingDefaultCategory", {
        kind: "settings",
        id: "quantity.defaultCategoryId",
      }),
    );
  }

  for (const layer of project.layers) {
    checkUnique(issues, layerIds, layer.id, "layer", "duplicateLayerId");
    if (layer.kind !== "measure" && layer.kind !== "draw") {
      issues.push(issue("error", "invalidLayerKind", { kind: "layer", id: layer.id }));
    }
    if (layer.homePageId && !pageIds.has(layer.homePageId)) {
      issues.push(issue("error", "missingLayerHomePage", { kind: "layer", id: layer.id }));
    }
    for (const key of Object.keys(layer.pageState ?? {})) {
      if (!pageIds.has(key)) {
        issues.push(issue("error", "missingLayerPageState", { kind: "layer", id: layer.id }));
      }
    }
    for (const item of layer.items) {
      checkUnique(issues, itemIds, item.id, "item", "duplicateItemId");
      if (!pageIds.has(item.pageId)) {
        issues.push(issue("error", "missingItemPage", { kind: "item", id: item.id }));
      }
      if (layer.kind === "measure" ? !isMeasurementKind(item.kind) : isMeasurementKind(item.kind)) {
        issues.push(issue("error", "itemLayerKindMismatch", { kind: "item", id: item.id }));
      }
      if (isMeasurementKind(item.kind)) {
        if (!item.categoryId || !categoryIds.has(item.categoryId)) {
          issues.push(issue("error", "missingItemCategory", { kind: "item", id: item.id }));
        }
        if (item.kind === "count" && (!item.countType || !countTypeIds.has(item.countType))) {
          issues.push(issue("error", "missingItemCountType", { kind: "item", id: item.id }));
        }
        if (item.lineTypeId && !lineTypeIds.has(item.lineTypeId)) {
          issues.push(issue("error", "missingItemLineType", { kind: "item", id: item.id }));
        }
      } else if (item.categoryId) {
        issues.push(issue("warning", "unexpectedItemCategory", { kind: "item", id: item.id }));
      }
      if (item.kind === "polyline" && item.lineTypeId && !lineTypeIds.has(item.lineTypeId)) {
        issues.push(issue("error", "missingItemLineType", { kind: "item", id: item.id }));
      }
      if (item.kind === "image") {
        const assetId = item.image?.assetId;
        if (!assetId || !project.assets[assetId]) {
          issues.push(issue("error", "missingImageAsset", { kind: "item", id: item.id }));
        }
      }
      validateItemGeometry(item, issues);
    }
  }

  if (!layerIds.has(project.activeLayerId)) {
    issues.push(
      issue("error", "missingActiveLayer", { kind: "settings", id: project.activeLayerId }),
    );
  } else {
    const active = project.layers.find((layer) => layer.id === project.activeLayerId);
    if (active && active.kind !== "measure" && active.kind !== "draw") {
      issues.push(issue("error", "invalidActiveLayerKind", { kind: "layer", id: active.id }));
    }
  }

  for (const [key, asset] of Object.entries(project.assets)) {
    validateAsset(asset, key, issues);
  }
  if (project.reportLogoAssetId) {
    const asset = project.assets[project.reportLogoAssetId];
    if (!asset) {
      issues.push(
        issue("warning", "missingReportLogo", { kind: "asset", id: project.reportLogoAssetId }),
      );
    } else if (asset.mime !== "image/png" && asset.mime !== "image/jpeg") {
      issues.push(
        issue("warning", "invalidReportLogoMime", { kind: "asset", id: project.reportLogoAssetId }),
      );
    }
  }

  for (const preset of project.countPresets) {
    checkUnique(issues, presetIds, preset.id, "countPreset", "duplicateCountPresetId");
    if (!categoryIds.has(preset.categoryId)) {
      issues.push(
        issue("error", "missingCountPresetCategory", { kind: "countPreset", id: preset.id }),
      );
    }
    if (!countTypeIds.has(preset.countType)) {
      issues.push(issue("error", "missingCountPresetType", { kind: "countPreset", id: preset.id }));
    }
  }

  for (const view of project.markupsViews) {
    checkUnique(issues, viewIds, view.id, "markupsView", "duplicateMarkupsViewId");
    if (view.categoryId && !categoryIds.has(view.categoryId)) {
      issues.push(
        issue("warning", "missingMarkupsViewCategory", { kind: "markupsView", id: view.id }),
      );
    }
    if (view.countType && !countTypeIds.has(view.countType)) {
      issues.push(
        issue("warning", "missingMarkupsViewCountType", { kind: "markupsView", id: view.id }),
      );
    }
  }

  return issues;
}

export interface ProjectShape {
  documents: number;
  pages: number;
  layers: number;
  items: number;
  assets: number;
  categories: number;
  countTypes: number;
  lineTypes: number;
  countPresets: number;
  markupsViews: number;
}

export function projectShape(project: Project): ProjectShape {
  return {
    documents: project.documents.length,
    pages: project.pages.length,
    layers: project.layers.length,
    items: project.layers.reduce((total, layer) => total + layer.items.length, 0),
    assets: Object.keys(project.assets).length,
    categories: project.categories.length,
    countTypes: project.countTypes.length,
    lineTypes: project.lineTypes.length,
    countPresets: project.countPresets.length,
    markupsViews: project.markupsViews.length,
  };
}

/**
 * Compares entity counts across a serialize → parse round trip. A difference
 * means normalization discarded user data, which must block a save rather than
 * silently write a smaller project.
 */
export function compareProjectShape(expected: Project, parsed: Project): ProjectIssue[] {
  const before = projectShape(expected);
  const after = projectShape(parsed);
  const issues: ProjectIssue[] = [];
  for (const key of Object.keys(before) as (keyof ProjectShape)[]) {
    if (before[key] !== after[key]) {
      issues.push(
        issue(
          "error",
          `roundTrip${key.charAt(0).toUpperCase()}${key.slice(1)}`,
          { kind: "project" },
          `round trip ${key} count ${before[key]} -> ${after[key]}`,
        ),
      );
    }
  }
  return issues;
}

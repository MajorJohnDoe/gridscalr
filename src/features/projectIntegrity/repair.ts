import { isMeasurementKind } from "../../model/layers";
import type { ProjectIssue } from "../../model/integrity";
import type { MarkupItem, PageRecord, Project } from "../../model/types";

export type RepairKind = "duplicateIds" | "danglingReferences" | "staleOcr";

export interface RepairResult {
  /** A new project value. The input project is never mutated. */
  project: Project;
  /** Number of entities changed or removed. */
  changed: number;
}

const DANGLING_CODES = new Set([
  "missingPageDocument",
  "pageLocalPageOutOfRange",
  "missingLayerHomePage",
  "missingLayerPageState",
  "missingItemPage",
  "missingItemCategory",
  "missingItemCountType",
  "missingItemLineType",
  "missingImageAsset",
  "missingDefaultCategory",
  "missingActiveLayer",
  "missingCountPresetCategory",
  "missingCountPresetType",
  "missingMarkupsViewCategory",
  "missingMarkupsViewCountType",
  "missingReportLogo",
  "invalidReportLogoMime",
  "invalidExcludedPage",
  "missingCopiedFromDocument",
  "invalidCopiedFromPage",
]);

const STALE_OCR_CODES = new Set(["ocrDocumentMismatch", "ocrSourcePageMismatch"]);

/** Repairs that can actually change something for the current issue list. */
export function availableRepairs(issues: readonly ProjectIssue[]): RepairKind[] {
  const codes = new Set(issues.map((entry) => entry.code));
  const repairs: RepairKind[] = [];
  if ([...codes].some((code) => code.startsWith("duplicate"))) repairs.push("duplicateIds");
  if ([...codes].some((code) => DANGLING_CODES.has(code))) repairs.push("danglingReferences");
  if ([...codes].some((code) => STALE_OCR_CODES.has(code))) repairs.push("staleOcr");
  return repairs;
}

function cloneProject(project: Project): Project {
  if (typeof structuredClone === "function") return structuredClone(project);
  return JSON.parse(JSON.stringify(project)) as Project;
}

function nextId(base: string, used: Set<string>): string {
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

/** Renames every repeated entity ID after the first occurrence, deterministically. */
export function repairDuplicateIds(input: Project): RepairResult {
  const project = cloneProject(input);
  let changed = 0;

  const documentIds = new Set<string>();
  for (const document of project.documents) {
    if (documentIds.has(document.id)) {
      document.id = nextId(document.id, documentIds);
      changed += 1;
    } else {
      documentIds.add(document.id);
    }
  }

  const pageIds = new Set<string>();
  for (const page of project.pages) {
    if (pageIds.has(page.id)) {
      page.id = nextId(page.id, pageIds);
      changed += 1;
    } else {
      pageIds.add(page.id);
    }
  }

  const layerIds = new Set<string>();
  const itemIds = new Set<string>();
  for (const layer of project.layers) {
    if (layerIds.has(layer.id)) {
      layer.id = nextId(layer.id, layerIds);
      changed += 1;
    } else {
      layerIds.add(layer.id);
    }
    for (const item of layer.items) {
      if (itemIds.has(item.id)) {
        item.id = nextId(item.id, itemIds);
        changed += 1;
      } else {
        itemIds.add(item.id);
      }
    }
  }

  const categoryIds = new Set<string>();
  for (const category of project.categories) {
    if (categoryIds.has(category.id)) {
      category.id = nextId(category.id, categoryIds);
      changed += 1;
    } else {
      categoryIds.add(category.id);
    }
  }

  const countTypeIds = new Set<string>();
  for (const countType of project.countTypes) {
    if (countTypeIds.has(countType.id)) {
      countType.id = nextId(countType.id, countTypeIds);
      changed += 1;
    } else {
      countTypeIds.add(countType.id);
    }
  }

  const lineTypeIds = new Set<string>();
  for (const lineType of project.lineTypes) {
    if (lineTypeIds.has(lineType.id)) {
      lineType.id = nextId(lineType.id, lineTypeIds);
      changed += 1;
    } else {
      lineTypeIds.add(lineType.id);
    }
  }

  const presetIds = new Set<string>();
  for (const preset of project.countPresets) {
    if (presetIds.has(preset.id)) {
      preset.id = nextId(preset.id, presetIds);
      changed += 1;
    } else {
      presetIds.add(preset.id);
    }
  }

  const viewIds = new Set<string>();
  for (const view of project.markupsViews) {
    if (viewIds.has(view.id)) {
      view.id = nextId(view.id, viewIds);
      changed += 1;
    } else {
      viewIds.add(view.id);
    }
  }

  return { project, changed };
}

function repairItem(item: MarkupItem, project: Project): boolean {
  let changed = false;
  const categoryIds = new Set(project.categories.map((entry) => entry.id));
  const countTypeIds = new Set(project.countTypes.map((entry) => entry.id));
  const lineTypeIds = new Set(project.lineTypes.map((entry) => entry.id));
  if (isMeasurementKind(item.kind)) {
    if (item.categoryId && !categoryIds.has(item.categoryId)) {
      item.categoryId = project.settings.quantity.defaultCategoryId;
      changed = true;
    }
    if (item.kind === "count" && item.countType && !countTypeIds.has(item.countType)) {
      if (countTypeIds.has("other")) item.countType = "other";
      else delete item.countType;
      changed = true;
    }
  }
  if (item.lineTypeId && !lineTypeIds.has(item.lineTypeId)) {
    delete item.lineTypeId;
    changed = true;
  }
  return changed;
}

/** Removes or rewrites references that point at missing entities. */
export function repairDanglingReferences(input: Project): RepairResult {
  const project = cloneProject(input);
  let changed = 0;

  const documents = new Map(project.documents.map((document) => [document.id, document]));
  const pages: PageRecord[] = [];
  for (const page of project.pages) {
    const document = documents.get(page.documentId);
    if (!document) {
      changed += 1;
      continue;
    }
    const localPage = Math.max(1, Math.min(document.pageCount, Math.round(page.localPage || 1)));
    if (localPage !== page.localPage) {
      page.localPage = localPage;
      changed += 1;
    }
    pages.push(page);
  }
  project.pages = pages;
  const pageIds = new Set(pages.map((page) => page.id));

  const assetIds = new Set(Object.keys(project.assets));
  const categoryIds = new Set(project.categories.map((entry) => entry.id));
  const countTypeIds = new Set(project.countTypes.map((entry) => entry.id));

  if (!categoryIds.has(project.settings.quantity.defaultCategoryId)) {
    const fallback = project.categories[0]?.id;
    if (fallback) {
      project.settings.quantity.defaultCategoryId = fallback;
      changed += 1;
    }
  }

  for (const layer of project.layers) {
    if (layer.homePageId && !pageIds.has(layer.homePageId)) {
      delete layer.homePageId;
      changed += 1;
    }
    if (layer.pageState) {
      for (const key of Object.keys(layer.pageState)) {
        if (!pageIds.has(key)) {
          delete layer.pageState[key];
          changed += 1;
        }
      }
      if (!Object.keys(layer.pageState).length) delete layer.pageState;
    }
    const items: MarkupItem[] = [];
    for (const item of layer.items) {
      if (!pageIds.has(item.pageId)) {
        changed += 1;
        continue;
      }
      if (item.kind === "image" && (!item.image?.assetId || !assetIds.has(item.image.assetId))) {
        changed += 1;
        continue;
      }
      if (repairItem(item, project)) changed += 1;
      items.push(item);
    }
    layer.items = items;
  }

  if (project.reportLogoAssetId) {
    const logo = project.assets[project.reportLogoAssetId];
    if (!logo || (logo.mime !== "image/png" && logo.mime !== "image/jpeg")) {
      project.reportLogoAssetId = null;
      changed += 1;
    }
  }

  const presets = [];
  for (const preset of project.countPresets) {
    if (!categoryIds.has(preset.categoryId)) {
      const fallback = project.categories[0]?.id;
      if (!fallback) {
        changed += 1;
        continue;
      }
      preset.categoryId = fallback;
      changed += 1;
    }
    if (!countTypeIds.has(preset.countType)) {
      if (!countTypeIds.has("other")) {
        changed += 1;
        continue;
      }
      preset.countType = "other";
      changed += 1;
    }
    presets.push(preset);
  }
  project.countPresets = presets;

  for (const view of project.markupsViews) {
    if (view.categoryId && !categoryIds.has(view.categoryId)) {
      view.categoryId = null;
      changed += 1;
    }
    if (view.countType && !countTypeIds.has(view.countType)) {
      view.countType = null;
      changed += 1;
    }
  }

  for (const document of project.documents) {
    if (document.excludedPages) {
      const filtered = document.excludedPages.filter(
        (page) => Number.isInteger(page) && page >= 1 && page <= document.pageCount,
      );
      if (filtered.length !== document.excludedPages.length) {
        changed += 1;
        if (filtered.length) document.excludedPages = filtered;
        else delete document.excludedPages;
      }
    }
    if (document.copiedFrom) {
      const source = documents.get(document.copiedFrom.documentId);
      if (
        !source ||
        !Number.isInteger(document.copiedFrom.page) ||
        document.copiedFrom.page < 1 ||
        document.copiedFrom.page > source.pageCount
      ) {
        delete document.copiedFrom;
        changed += 1;
      }
    }
  }

  if (!project.layers.some((layer) => layer.id === project.activeLayerId)) {
    const fallback = project.layers.find((layer) => layer.kind === "measure") ?? project.layers[0];
    if (fallback) {
      project.activeLayerId = fallback.id;
      changed += 1;
    }
  }

  return { project, changed };
}

/** Removes OCR text whose source checksum or source page no longer matches. */
export function repairStaleOcr(input: Project): RepairResult {
  const project = cloneProject(input);
  let changed = 0;
  const documents = new Map(project.documents.map((document) => [document.id, document]));
  for (const page of project.pages) {
    const ocr = page.state?.ocr;
    if (!ocr) continue;
    const document = documents.get(page.documentId);
    if (!document || ocr.documentSha256 !== document.sha256 || ocr.sourcePage !== page.localPage) {
      delete page.state.ocr;
      changed += 1;
    }
  }
  return { project, changed };
}

export function applyRepair(project: Project, kind: RepairKind): RepairResult {
  if (kind === "duplicateIds") return repairDuplicateIds(project);
  if (kind === "staleOcr") return repairStaleOcr(project);
  return repairDanglingReferences(project);
}

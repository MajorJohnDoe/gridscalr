import { isMeasurementKind } from "../../model/layers";
import type { MarkupItem, PageRecord, Project } from "../../model/types";
import type { RepairChanges } from "./repairPlan";

function repairItem(item: MarkupItem, project: Project, log: RepairChanges): void {
  const categoryIds = new Set(project.categories.map((entry) => entry.id));
  const countTypeIds = new Set(project.countTypes.map((entry) => entry.id));
  const lineTypeIds = new Set(project.lineTypes.map((entry) => entry.id));
  if (isMeasurementKind(item.kind)) {
    if (item.categoryId && !categoryIds.has(item.categoryId)) {
      item.categoryId = project.settings.quantity.defaultCategoryId;
      log.rewrite("item", item.id, "missingItemCategory");
    }
    if (item.kind === "count" && item.countType && !countTypeIds.has(item.countType)) {
      if (countTypeIds.has("other")) item.countType = "other";
      else delete item.countType;
      log.rewrite("item", item.id, "missingItemCountType");
    }
  }
  if (item.lineTypeId && !lineTypeIds.has(item.lineTypeId)) {
    delete item.lineTypeId;
    log.rewrite("item", item.id, "missingItemLineType");
  }
}

/**
 * Removes or rewrites references that point at missing entities.
 *
 * The walk records one change per concrete decision: a removed page, a removed
 * item, a cleared layer home page, one dropped page-state entry, and every
 * rewritten reference. `changed` is derived from those records, so the preview
 * cannot disagree with the repaired copy.
 */
export function planDanglingReferences(project: Project, log: RepairChanges): void {
  const documents = new Map(project.documents.map((document) => [document.id, document]));
  const pages: PageRecord[] = [];
  for (const page of project.pages) {
    const document = documents.get(page.documentId);
    if (!document) {
      log.remove("page", page.id, "missingPageDocument");
      continue;
    }
    const localPage = Math.max(1, Math.min(document.pageCount, Math.round(page.localPage || 1)));
    if (localPage !== page.localPage) {
      page.localPage = localPage;
      log.rewrite("page", page.id, "pageLocalPageOutOfRange");
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
      log.rewrite("settings", "quantity.defaultCategoryId", "missingDefaultCategory");
    }
  }

  for (const layer of project.layers) {
    if (layer.homePageId && !pageIds.has(layer.homePageId)) {
      delete layer.homePageId;
      log.rewrite("layer", layer.id, "missingLayerHomePage");
    }
    if (layer.pageState) {
      for (const key of Object.keys(layer.pageState)) {
        if (!pageIds.has(key)) {
          delete layer.pageState[key];
          log.rewrite("layer", layer.id, "missingLayerPageState");
        }
      }
      if (!Object.keys(layer.pageState).length) delete layer.pageState;
    }
    const items: MarkupItem[] = [];
    for (const item of layer.items) {
      if (!pageIds.has(item.pageId)) {
        log.remove("item", item.id, "missingItemPage");
        continue;
      }
      if (item.kind === "image" && (!item.image?.assetId || !assetIds.has(item.image.assetId))) {
        log.remove("item", item.id, "missingImageAsset");
        continue;
      }
      repairItem(item, project, log);
      items.push(item);
    }
    layer.items = items;
  }

  if (project.reportLogoAssetId) {
    const logo = project.assets[project.reportLogoAssetId];
    if (!logo || (logo.mime !== "image/png" && logo.mime !== "image/jpeg")) {
      log.rewrite(
        "asset",
        project.reportLogoAssetId,
        logo ? "invalidReportLogoMime" : "missingReportLogo",
      );
      project.reportLogoAssetId = null;
    }
  }

  const presets = [];
  for (const preset of project.countPresets) {
    if (!categoryIds.has(preset.categoryId)) {
      const fallback = project.categories[0]?.id;
      if (!fallback) {
        log.remove("countPreset", preset.id, "missingCountPresetCategory");
        continue;
      }
      preset.categoryId = fallback;
      log.rewrite("countPreset", preset.id, "missingCountPresetCategory");
    }
    if (!countTypeIds.has(preset.countType)) {
      if (!countTypeIds.has("other")) {
        log.remove("countPreset", preset.id, "missingCountPresetType");
        continue;
      }
      preset.countType = "other";
      log.rewrite("countPreset", preset.id, "missingCountPresetType");
    }
    presets.push(preset);
  }
  project.countPresets = presets;

  for (const view of project.markupsViews) {
    if (view.categoryId && !categoryIds.has(view.categoryId)) {
      view.categoryId = null;
      log.rewrite("markupsView", view.id, "missingMarkupsViewCategory");
    }
    if (view.countType && !countTypeIds.has(view.countType)) {
      view.countType = null;
      log.rewrite("markupsView", view.id, "missingMarkupsViewCountType");
    }
  }

  for (const document of project.documents) {
    if (document.excludedPages) {
      const filtered = document.excludedPages.filter(
        (page) => Number.isInteger(page) && page >= 1 && page <= document.pageCount,
      );
      if (filtered.length !== document.excludedPages.length) {
        log.rewrite("document", document.id, "invalidExcludedPage");
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
        log.rewrite(
          "document",
          document.id,
          source ? "invalidCopiedFromPage" : "missingCopiedFromDocument",
        );
        delete document.copiedFrom;
      }
    }
  }

  if (!project.layers.some((layer) => layer.id === project.activeLayerId)) {
    const missingActiveLayerId = project.activeLayerId;
    const fallback = project.layers.find((layer) => layer.kind === "measure") ?? project.layers[0];
    if (fallback) {
      project.activeLayerId = fallback.id;
      log.rewrite("settings", missingActiveLayerId, "missingActiveLayer");
    }
  }
}

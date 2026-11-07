import { normalizeCountPresets, normalizeCountTypes } from "../../features/countTypes/model";
import { t } from "../../i18n";
import { makeId } from "../../model/calibration";
import { totalPageCount } from "../../model/documents";
import { createDefaultLayers, createProject } from "../../model/layers";
import { normalizeMarkupsViews } from "../../model/markups";
import { normalizeProjectMetadata } from "../../model/metadata";
import { SCHEMA_VERSION } from "../../model/types";
import type { PageState, Project } from "../../model/types";
import { normalizeCalibration } from "./calibration";
import { normalizeCategories } from "./categories";
import { normalizeSettings } from "./settings";
import { normalizeAssets } from "./assets";
import { normalizeLayers } from "./layers";
import { normalizeLineTypes } from "./lineTypes";
import { normalizeDocument } from "./documents";
import { normalizeOcr } from "./ocr";

export function parseProject(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(t("projectFile.invalidJson"));
  }
  if (typeof data !== "object" || data === null) throw new Error(t("projectFile.emptyOrInvalid"));
  const raw = data as Partial<Project>;
  if (typeof raw.schemaVersion !== "number") throw new Error(t("projectFile.noSchema"));
  if (raw.schemaVersion > SCHEMA_VERSION) {
    throw new Error(t("projectFile.newerVersion"));
  }
  const legacy = (raw as { document?: unknown }).document;
  const rawDocuments: unknown[] = Array.isArray((raw as { documents?: unknown }).documents)
    ? (raw as { documents: unknown[] }).documents
    : legacy
      ? [legacy]
      : [];
  if (!rawDocuments.length) {
    throw new Error(t("projectFile.noDocument"));
  }
  // Schema 5 and earlier stored exactly one document. Migration wraps it in a list.
  const documents = rawDocuments.map((entry) => normalizeDocument(entry));
  const seen = new Set<string>();
  for (const document of documents) {
    if (seen.has(document.id)) document.id = makeId("doc");
    seen.add(document.id);
  }
  for (const document of documents) {
    if (!document.copiedFrom) continue;
    const source = documents.find((candidate) => candidate.id === document.copiedFrom!.documentId);
    if (!source || document.copiedFrom.page > source.pageCount) document.copiedFrom = undefined;
  }
  const total = totalPageCount(documents);
  if (total < 1) throw new Error(t("projectFile.noPages"));
  const base = createProject(documents[0], createDefaultLayers());
  const categories = normalizeCategories(raw.categories);
  const countTypes = normalizeCountTypes(raw.countTypes);
  const settings = normalizeSettings(raw.settings, categories);
  const countPresets = normalizeCountPresets(
    raw.countPresets,
    new Set(categories.map((category) => category.id)),
    new Set(countTypes.map((countType) => countType.id)),
    settings.quantity.defaultCategoryId,
  );
  const assets = normalizeAssets(raw.assets);
  const project: Project = {
    ...base,
    id: typeof raw.id === "string" ? raw.id : base.id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : base.name,
    documents,
    settings,
    categories,
    countTypes,
    countPresets,
    lineTypes: normalizeLineTypes(raw.lineTypes),
    assets,
    pages: {},
    metadata: normalizeProjectMetadata(raw.metadata),
    reportLogoAssetId:
      typeof raw.reportLogoAssetId === "string" &&
      assets[raw.reportLogoAssetId] &&
      (assets[raw.reportLogoAssetId].mime === "image/png" ||
        assets[raw.reportLogoAssetId].mime === "image/jpeg")
        ? raw.reportLogoAssetId
        : null,
    markupsViews: normalizeMarkupsViews(
      raw.markupsViews,
      new Set(categories.map((category) => category.id)),
      new Set(countTypes.map((countType) => countType.id)),
    ),
    layers: normalizeLayers(
      raw.layers,
      new Set(categories.map((category) => category.id)),
      new Set(countTypes.map((countType) => countType.id)),
      settings.quantity.defaultCategoryId,
      new Set(Object.keys(assets)),
      total,
    ),
    activeLayerId: typeof raw.activeLayerId === "string" ? raw.activeLayerId : base.activeLayerId,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : base.updatedAt,
  };

  if (raw.pages && typeof raw.pages === "object") {
    for (const [key, value] of Object.entries(raw.pages)) {
      const page = Number(key);
      if (!Number.isInteger(page) || page < 1 || page > total) continue;
      const rawPage = value as {
        calibration?: unknown;
        scaleLocked?: unknown;
        name?: unknown;
        building?: unknown;
        floor?: unknown;
        ocr?: unknown;
      } | null;
      const cal = normalizeCalibration(rawPage?.calibration);
      const name = typeof rawPage?.name === "string" ? rawPage.name.trim().slice(0, 80) : "";
      const building =
        typeof rawPage?.building === "string" ? rawPage.building.trim().slice(0, 80) : "";
      const floor = typeof rawPage?.floor === "string" ? rawPage.floor.trim().slice(0, 80) : "";
      const ocr = normalizeOcr(rawPage?.ocr);
      if (!cal && !name && !building && !floor && !ocr) continue;
      const state: PageState = {};
      if (cal) {
        state.calibration = cal;
        // A lock without a scale is meaningless and is discarded.
        if (rawPage?.scaleLocked === true) state.scaleLocked = true;
      }
      if (name) state.name = name;
      if (building) state.building = building;
      if (floor) state.floor = floor;
      if (ocr) state.ocr = ocr;
      project.pages[key] = state;
    }
  }

  if (!project.layers.some((l) => l.id === project.activeLayerId)) {
    project.activeLayerId =
      project.layers.find((l) => l.kind === "measure")?.id ?? project.layers[0].id;
  }

  return project;
}

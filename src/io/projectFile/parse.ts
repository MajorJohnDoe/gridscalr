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
import { migrateLayers, migratePages } from "./pages";

export interface ProjectLoadReport {
  /** Translation keys for invalid references found while migrating. */
  warnings: string[];
  migratedFrom: number;
}

function normalizePageState(value: unknown): PageState | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const rawPage = value as {
    calibration?: unknown;
    scaleLocked?: unknown;
    name?: unknown;
    building?: unknown;
    floor?: unknown;
    ocr?: unknown;
  };
  const cal = normalizeCalibration(rawPage.calibration);
  const name = typeof rawPage.name === "string" ? rawPage.name.trim().slice(0, 80) : "";
  const building = typeof rawPage.building === "string" ? rawPage.building.trim().slice(0, 80) : "";
  const floor = typeof rawPage.floor === "string" ? rawPage.floor.trim().slice(0, 80) : "";
  const ocr = normalizeOcr(rawPage.ocr);
  if (!cal && !name && !building && !floor && !ocr) return undefined;
  const state: PageState = {};
  if (cal) {
    state.calibration = cal;
    // A lock without a scale is meaningless and is discarded.
    if (rawPage.scaleLocked === true) state.scaleLocked = true;
  }
  if (name) state.name = name;
  if (building) state.building = building;
  if (floor) state.floor = floor;
  if (ocr) state.ocr = ocr;
  return state;
}

export function parseProject(text: string): Project {
  return parseProjectWithReport(text).project;
}

export function parseProjectWithReport(text: string): {
  project: Project;
  report: ProjectLoadReport;
} {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(t("projectFile.invalidJson"));
  }
  if (typeof data !== "object" || data === null) throw new Error(t("projectFile.emptyOrInvalid"));
  const raw = data as Partial<Project> & { document?: unknown };
  if (typeof raw.schemaVersion !== "number") throw new Error(t("projectFile.noSchema"));
  if (raw.schemaVersion > SCHEMA_VERSION) {
    throw new Error(t("projectFile.newerVersion"));
  }
  const legacy = raw.document;
  const rawDocuments: unknown[] = Array.isArray(raw.documents)
    ? raw.documents
    : legacy
      ? [legacy]
      : [];
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
  const supportsEmpty = raw.schemaVersion >= 24;
  if (!documents.length && !supportsEmpty) throw new Error(t("projectFile.noDocument"));
  if (total < 1 && !supportsEmpty) throw new Error(t("projectFile.noPages"));

  const projectId = typeof raw.id === "string" && raw.id ? raw.id : makeId("project");
  const migration = migratePages(raw.pages, documents, projectId);
  const pageStates = migration.states;
  for (const record of migration.records) {
    const state = normalizePageState(pageStates.get(record.id));
    record.state = state ?? {};
  }
  const pageIds = new Set(migration.records.map((record) => record.id));

  const base = createProject(documents[0], createDefaultLayers(migration.firstPageId ?? undefined));
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
    id: projectId,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : base.name,
    documents,
    settings,
    categories,
    countTypes,
    countPresets,
    lineTypes: normalizeLineTypes(raw.lineTypes),
    assets,
    pages: migration.records,
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
      migrateLayers(raw.layers, migration),
      new Set(categories.map((category) => category.id)),
      new Set(countTypes.map((countType) => countType.id)),
      settings.quantity.defaultCategoryId,
      new Set(Object.keys(assets)),
      pageIds,
      migration.firstPageId,
    ),
    activeLayerId: typeof raw.activeLayerId === "string" ? raw.activeLayerId : base.activeLayerId,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : base.updatedAt,
  };

  if (!project.layers.some((layer) => layer.id === project.activeLayerId)) {
    project.activeLayerId =
      project.layers.find((layer) => layer.kind === "measure")?.id ?? project.layers[0].id;
  }

  return {
    project,
    report: {
      warnings: [...migration.warnings],
      migratedFrom: raw.schemaVersion,
    },
  };
}

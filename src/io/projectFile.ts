import { makeId } from "../model/calibration";
import {
  createDefaultCategories,
  createDefaultQuantitySettings,
  normalizeCategoryName,
  CATEGORY_NAME_MAX_LENGTH,
} from "../model/categories";
import {
  createDefaultLayers,
  createLayer,
  isMeasurementKind,
  layerKindForItem,
  normalizeLayerOrder,
} from "../model/layers";
import { createProject, DEFAULT_SETTINGS } from "../model/layers";
import { SCHEMA_VERSION } from "../model/types";
import type {
  AreaMode,
  AreaUnit,
  Calibration,
  Category,
  CountType,
  ItemKind,
  Layer,
  LayerKind,
  LengthUnit,
  MarkupItem,
  Point,
  Project,
  ProjectSettings,
  QuantitySettings,
} from "../model/types";

const ITEM_KINDS: ReadonlySet<ItemKind> = new Set([
  "length",
  "area",
  "count",
  "pen",
  "line",
  "arrow",
  "rect",
  "ellipse",
  "highlight",
  "text",
]);

const COUNT_TYPES: ReadonlySet<CountType> = new Set([
  "door",
  "window",
  "radiator",
  "fixture",
  "other",
]);

const LENGTH_UNITS = new Set<LengthUnit>(["mm", "cm", "m", "in", "ft", "yd"]);
const AREA_UNITS = new Set<AreaUnit>(["mm2", "cm2", "m2", "in2", "ft2", "yd2"]);

function isPoint(value: unknown): value is Point {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Point).x === "number" &&
    Number.isFinite((value as Point).x) &&
    typeof (value as Point).y === "number" &&
    Number.isFinite((value as Point).y)
  );
}

function normalizeCalibration(value: unknown): Calibration | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const cal = value as Partial<Calibration>;
  if (!isPoint(cal.p1) || !isPoint(cal.p2)) return undefined;
  if (typeof cal.knownLength !== "number" || cal.knownLength <= 0) return undefined;
  if (typeof cal.pointsPerMeter !== "number" || !Number.isFinite(cal.pointsPerMeter) || cal.pointsPerMeter <= 0) {
    return undefined;
  }
  return {
    id: typeof cal.id === "string" ? cal.id : `cal_${Date.now()}`,
    p1: cal.p1,
    p2: cal.p2,
    knownLength: cal.knownLength,
    unit: LENGTH_UNITS.has(cal.unit as LengthUnit) ? (cal.unit as LengthUnit) : "mm",
    pointsPerMeter: cal.pointsPerMeter,
    createdAt: typeof cal.createdAt === "string" ? cal.createdAt : new Date().toISOString(),
  };
}

function uniqueCategoryName(categories: Category[], wanted: string): string {
  const exists = (candidate: string) =>
    categories.some((category) => category.name.toLowerCase() === candidate.toLowerCase());
  if (!exists(wanted)) return wanted;
  let index = 2;
  for (;;) {
    const suffix = ` ${index++}`;
    const candidate = `${wanted.slice(0, CATEGORY_NAME_MAX_LENGTH - suffix.length).trim()}${suffix}`;
    if (!exists(candidate)) return candidate;
  }
}

function normalizeCategories(value: unknown): Category[] {
  const categories: Category[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== "object" || entry === null) continue;
      const raw = entry as Partial<Category>;
      const name = typeof raw.name === "string" ? normalizeCategoryName(raw.name) : "";
      if (!name) continue;
      const clipped = name.slice(0, CATEGORY_NAME_MAX_LENGTH).trim();
      let id = typeof raw.id === "string" && raw.id ? raw.id : makeId("cat");
      if (categories.some((category) => category.id === id)) {
        id = makeId("cat");
      }
      const category: Category = { id, name: uniqueCategoryName(categories, clipped) };
      if (typeof raw.wastePercent === "number" && Number.isFinite(raw.wastePercent)) {
        category.wastePercent = Math.max(0, Math.min(100, raw.wastePercent));
      }
      if (typeof raw.roundingStep === "number" && Number.isFinite(raw.roundingStep)) {
        category.roundingStep = Math.max(0, raw.roundingStep);
      }
      categories.push(category);
    }
  }
  return categories.length ? categories : createDefaultCategories();
}

function normalizeSettings(
  value: Partial<ProjectSettings> | undefined,
  categories: Category[],
): ProjectSettings {
  const rawQuantity = (value?.quantity ?? {}) as Partial<QuantitySettings>;
  const ids = new Set(categories.map((category) => category.id));
  const fallbackQuantity = createDefaultQuantitySettings(categories);
  return {
    lengthUnit: LENGTH_UNITS.has(value?.lengthUnit as LengthUnit)
      ? (value!.lengthUnit as LengthUnit)
      : DEFAULT_SETTINGS.lengthUnit,
    areaUnit: AREA_UNITS.has(value?.areaUnit as AreaUnit)
      ? (value!.areaUnit as AreaUnit)
      : DEFAULT_SETTINGS.areaUnit,
    showGrid: value?.showGrid ?? DEFAULT_SETTINGS.showGrid,
    showCalibration: value?.showCalibration ?? DEFAULT_SETTINGS.showCalibration,
    snapToGeometry: value?.snapToGeometry ?? DEFAULT_SETTINGS.snapToGeometry,
    quantity: {
      defaultCategoryId:
        typeof rawQuantity.defaultCategoryId === "string" && ids.has(rawQuantity.defaultCategoryId)
          ? rawQuantity.defaultCategoryId
          : fallbackQuantity.defaultCategoryId,
      wastePercent:
        typeof rawQuantity.wastePercent === "number" && Number.isFinite(rawQuantity.wastePercent)
          ? Math.max(0, Math.min(100, rawQuantity.wastePercent))
          : fallbackQuantity.wastePercent,
      roundingStep:
        typeof rawQuantity.roundingStep === "number" && Number.isFinite(rawQuantity.roundingStep)
          ? Math.max(0, rawQuantity.roundingStep)
          : fallbackQuantity.roundingStep,
    },
  };
}

function normalizeItem(
  value: unknown,
  layerKind: LayerKind,
  categoryIds: ReadonlySet<string>,
  fallbackCategoryId: string,
): MarkupItem | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Partial<MarkupItem>;
  if (!raw.kind || !ITEM_KINDS.has(raw.kind)) return null;
  if (layerKindForItem(raw.kind) !== layerKind) return null;
  if (!Array.isArray(raw.points) || !raw.points.every(isPoint)) return null;
  if (raw.points.length === 0) return null;
  const now = new Date().toISOString();
  const scale = raw.scale;
  const isMeasure = isMeasurementKind(raw.kind);
  const room = typeof raw.room === "string" ? raw.room.trim() : "";
  return {
    id: typeof raw.id === "string" ? raw.id : `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    page: typeof raw.page === "number" && raw.page >= 1 ? Math.round(raw.page) : 1,
    kind: raw.kind,
    points: raw.kind === "count" ? [{ x: raw.points[0].x, y: raw.points[0].y }] : raw.points.map((p) => ({ x: p.x, y: p.y })),
    color: typeof raw.color === "string" ? raw.color : "#4cc9f0",
    strokeWidth: typeof raw.strokeWidth === "number" && raw.strokeWidth > 0 ? raw.strokeWidth : 2,
    fillColor: typeof raw.fillColor === "string" ? raw.fillColor : undefined,
    opacity: typeof raw.opacity === "number" ? Math.max(0, Math.min(1, raw.opacity)) : undefined,
    text: typeof raw.text === "string" ? raw.text : undefined,
    label: typeof raw.label === "string" ? raw.label : undefined,
    fontSize:
      typeof raw.fontSize === "number" && Number.isFinite(raw.fontSize) && raw.fontSize > 0
        ? Math.max(0.5, Math.min(300, raw.fontSize))
        : undefined,
    rotation:
      typeof raw.rotation === "number" && Number.isFinite(raw.rotation)
        ? ((raw.rotation % 360) + 360) % 360
        : undefined,
    visible: raw.visible !== false,
    locked: raw.locked === true,
    scale:
      scale === undefined
        ? undefined
        : scale &&
            typeof scale === "object" &&
            typeof (scale as { pointsPerMeter?: unknown }).pointsPerMeter === "number" &&
            (scale as { pointsPerMeter: number }).pointsPerMeter > 0
          ? {
              pointsPerMeter: (scale as { pointsPerMeter: number }).pointsPerMeter,
              sourceUnit: LENGTH_UNITS.has((scale as { sourceUnit?: LengthUnit }).sourceUnit as LengthUnit)
                ? ((scale as { sourceUnit: LengthUnit }).sourceUnit)
                : "mm",
            }
          : null,
    categoryId: isMeasure
      ? typeof raw.categoryId === "string" && categoryIds.has(raw.categoryId)
        ? raw.categoryId
        : fallbackCategoryId
      : undefined,
    room: isMeasure && room ? room : undefined,
    areaMode:
      raw.kind === "area" ? (raw.areaMode === "subtract" ? ("subtract" as AreaMode) : "add") : undefined,
    countType:
      raw.kind === "count"
        ? COUNT_TYPES.has(raw.countType as CountType)
          ? (raw.countType as CountType)
          : "other"
        : undefined,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
}

function normalizeLayers(
  rawLayers: unknown,
  categoryIds: ReadonlySet<string>,
  fallbackCategoryId: string,
): Layer[] {
  const layers: Layer[] = [];
  if (Array.isArray(rawLayers)) {
    for (const value of rawLayers) {
      if (typeof value !== "object" || value === null) continue;
      const raw = value as Partial<Layer>;
      if (raw.kind !== "measure" && raw.kind !== "draw") continue;
      const layer: Layer = {
        id: typeof raw.id === "string" ? raw.id : `layer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : raw.kind === "measure" ? "Measurements" : "Markups",
        kind: raw.kind,
        visible: raw.visible !== false,
        locked: raw.locked === true,
        opacity: typeof raw.opacity === "number" ? Math.max(0, Math.min(1, raw.opacity)) : 1,
        color: typeof raw.color === "string" ? raw.color : raw.kind === "measure" ? "#4cc9f0" : "#f2a93b",
        items: [],
      };
      if (Array.isArray(raw.items)) {
        for (const item of raw.items) {
          const normalized = normalizeItem(item, layer.kind, categoryIds, fallbackCategoryId);
          if (normalized) layer.items.push(normalized);
        }
      }
      layers.push(layer);
    }
  }

  if (!layers.some((l) => l.kind === "measure")) layers.push(createLayer("measure", "Measurements"));
  if (!layers.some((l) => l.kind === "draw")) layers.push(createLayer("draw", "Markups"));
  const ids = new Set<string>();
  return normalizeLayerOrder(
    layers.map((layer) => {
      if (ids.has(layer.id)) layer.id = `${layer.id}_${Math.random().toString(36).slice(2, 6)}`;
      ids.add(layer.id);
      return layer;
    }),
  );
}

export function parseProject(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (typeof data !== "object" || data === null) throw new Error("Project file is empty or invalid.");
  const raw = data as Partial<Project>;
  if (typeof raw.schemaVersion !== "number") throw new Error("Project file has no schema version.");
  if (raw.schemaVersion > SCHEMA_VERSION) {
    throw new Error("This project was created by a newer version of GridScalr.");
  }
  if (typeof raw.document !== "object" || raw.document === null) {
    throw new Error("Project file has no document reference.");
  }
  const rawDoc = raw.document;
  const doc = {
    name:
      typeof rawDoc.name === "string" && rawDoc.name.trim()
        ? rawDoc.name
        : "Untitled.pdf",
    path: typeof rawDoc.path === "string" && rawDoc.path ? rawDoc.path : null,
    relativePath:
      typeof rawDoc.relativePath === "string" && rawDoc.relativePath
        ? rawDoc.relativePath
        : null,
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
  const base = createProject(doc, createDefaultLayers());
  const categories = normalizeCategories(raw.categories);
  const settings = normalizeSettings(raw.settings, categories);
  const project: Project = {
    ...base,
    id: typeof raw.id === "string" ? raw.id : base.id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : base.name,
    document: doc,
    settings,
    categories,
    pages: {},
    layers: normalizeLayers(
      raw.layers,
      new Set(categories.map((category) => category.id)),
      settings.quantity.defaultCategoryId,
    ),
    activeLayerId: typeof raw.activeLayerId === "string" ? raw.activeLayerId : base.activeLayerId,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : base.updatedAt,
  };

  if (raw.pages && typeof raw.pages === "object") {
    for (const [key, value] of Object.entries(raw.pages)) {
      const page = Number(key);
      if (!Number.isInteger(page) || page < 1) continue;
      const cal = normalizeCalibration((value as { calibration?: unknown } | null)?.calibration);
      if (cal) project.pages[key] = { calibration: cal };
    }
  }

  if (!project.layers.some((l) => l.id === project.activeLayerId)) {
    project.activeLayerId = project.layers.find((l) => l.kind === "measure")?.id ?? project.layers[0].id;
  }

  return project;
}

export function serializeProject(project: Project): string {
  return JSON.stringify({ ...project, updatedAt: new Date().toISOString() }, null, 2);
}

export function suggestedProjectName(project: Project): string {
  const safe = project.name.replace(/[^\w\-. ]+/g, "").trim() || "Untitled";
  return `${safe}.gridscalr`;
}

export function relativeDocumentPath(projectPath: string, documentPath: string | null): string | null {
  if (!documentPath) return null;
  const normalize = (path: string) => path.replace(/\\/g, "/");
  const projectDir = normalize(projectPath).split("/").slice(0, -1).join("/");
  const doc = normalize(documentPath);
  if (!projectDir) return doc;
  const projectParts = projectDir.split("/");
  const docParts = doc.split("/");
  if (projectParts[0] !== docParts[0]) return null;
  let i = 0;
  while (i < projectParts.length && i < docParts.length && projectParts[i] === docParts[i]) i++;
  const up = projectParts.length - i;
  return [...Array(up).fill(".."), ...docParts.slice(i)].join("/");
}

export function resolveRelativePath(projectPath: string, relativePath: string | null): string | null {
  if (!relativePath) return null;
  const separator = projectPath.includes("\\") ? "\\" : "/";
  const projectDir = projectPath.split(/[\\/]/).slice(0, -1).join(separator);
  if (!projectDir) return relativePath;
  const parts = `${projectDir}${separator}${relativePath.replace(/[\\/]/g, separator)}`.split(separator);
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return (projectPath.startsWith("/") ? "/" : "") + resolved.join(separator);
}

export function remapPageItems(project: Project, pageCount: number): void {
  for (const layer of project.layers) {
    layer.items = layer.items.filter((item) => item.page <= pageCount);
  }
}

export { isMeasurementKind };

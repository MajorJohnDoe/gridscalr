import { makeId, isValidManualRatio, manualPointsPerMeter } from "../model/calibration";
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
import { totalPageCount } from "../model/documents";
import { normalizeStampPresets, stampStatusColor } from "../model/stamps";
import type {
  AreaMode,
  AreaShape,
  AreaUnit,
  ArrowHeads,
  HighlightShape,
  Calibration,
  Category,
  CountType,
  DocumentRef,
  ImageAsset,
  ImageMode,
  ItemKind,
  Layer,
  LayerKind,
  LengthUnit,
  MarkupItem,
  Point,
  Project,
  ProjectSettings,
  QuantitySettings,
  TextAlign,
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
  "image",
  "cloud",
  "callout",
  "stamp",
  "delta",
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
  const cal = value as Record<string, unknown>;
  const id = typeof cal.id === "string" && cal.id ? cal.id : makeId("cal");
  const createdAt = typeof cal.createdAt === "string" ? cal.createdAt : new Date().toISOString();

  if (cal.source === "manual") {
    const ratio = typeof cal.ratio === "number" ? cal.ratio : NaN;
    if (!isValidManualRatio(ratio)) return undefined;
    if (
      typeof cal.pointsPerMeter !== "number" ||
      !Number.isFinite(cal.pointsPerMeter) ||
      cal.pointsPerMeter <= 0
    ) {
      return undefined;
    }
    return {
      id,
      source: "manual",
      ratio,
      pointsPerMeter: manualPointsPerMeter(ratio),
      createdAt,
    };
  }

  if (!isPoint(cal.p1) || !isPoint(cal.p2)) return undefined;
  if (typeof cal.knownLength !== "number" || cal.knownLength <= 0) return undefined;
  if (
    typeof cal.pointsPerMeter !== "number" ||
    !Number.isFinite(cal.pointsPerMeter) ||
    cal.pointsPerMeter <= 0
  ) {
    return undefined;
  }
  return {
    id,
    source: "reference",
    p1: cal.p1,
    p2: cal.p2,
    knownLength: cal.knownLength,
    unit: LENGTH_UNITS.has(cal.unit as LengthUnit) ? (cal.unit as LengthUnit) : "mm",
    pointsPerMeter: cal.pointsPerMeter,
    createdAt,
  };
}

function normalizeHighlightShape(value: unknown): HighlightShape {
  return value === "rectangle" || value === "polygon" ? value : "stroke";
}

function normalizeAreaShape(value: unknown): AreaShape {
  return value === "rectangle" || value === "ellipse" ? value : "polygon";
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
    smartLengthUnits: value?.smartLengthUnits !== false,
    showGrid: value?.showGrid ?? DEFAULT_SETTINGS.showGrid,
    showCalibration: value?.showCalibration ?? DEFAULT_SETTINGS.showCalibration,
    snapToGeometry: value?.snapToGeometry ?? DEFAULT_SETTINGS.snapToGeometry,
    snapTolerancePx:
      typeof value?.snapTolerancePx === "number" && Number.isFinite(value.snapTolerancePx)
        ? Math.max(2, Math.min(24, value.snapTolerancePx))
        : DEFAULT_SETTINGS.snapTolerancePx,
    stampPresets: normalizeStampPresets(value?.stampPresets),
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

function normalizeAssets(value: unknown): Record<string, ImageAsset> {
  const assets: Record<string, ImageAsset> = {};
  if (typeof value !== "object" || value === null) return assets;
  for (const [id, entry] of Object.entries(value)) {
    if (!id || id === "__proto__" || id === "constructor" || id === "prototype") continue;
    if (typeof entry !== "object" || entry === null) continue;
    const raw = entry as Partial<ImageAsset>;
    const mime: ImageAsset["mime"] | null =
      raw.mime === "image/png" || raw.mime === "image/jpeg" ? raw.mime : null;
    if (!mime) continue;
    if (typeof raw.data !== "string") continue;
    const prefix = mime === "image/png" ? "data:image/png;base64," : "data:image/jpeg;base64,";
    if (!raw.data.startsWith(prefix) || raw.data.length <= prefix.length) continue;
    if (
      typeof raw.width !== "number" ||
      !Number.isFinite(raw.width) ||
      raw.width <= 0 ||
      typeof raw.height !== "number" ||
      !Number.isFinite(raw.height) ||
      raw.height <= 0
    ) {
      continue;
    }
    assets[id] = {
      id,
      name:
        typeof raw.name === "string" && raw.name.trim()
          ? raw.name.trim().slice(0, 260)
          : `Image.${mime === "image/png" ? "png" : "jpg"}`,
      mime,
      width: Math.round(raw.width),
      height: Math.round(raw.height),
      byteSize:
        typeof raw.byteSize === "number" && Number.isFinite(raw.byteSize)
          ? Math.max(0, Math.round(raw.byteSize))
          : 0,
      data: raw.data,
    };
  }
  return assets;
}

function normalizeImageMode(value: unknown): ImageMode {
  return value === "annotation" ? "annotation" : "background";
}

function normalizeItem(
  value: unknown,
  layerKind: LayerKind,
  categoryIds: ReadonlySet<string>,
  fallbackCategoryId: string,
  assetIds: ReadonlySet<string>,
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
  const points =
    raw.kind === "count"
      ? [{ x: raw.points[0].x, y: raw.points[0].y }]
      : raw.points.map((p) => ({ x: p.x, y: p.y }));
  let image: MarkupItem["image"];
  if (raw.kind === "image") {
    if (!raw.image || typeof raw.image.assetId !== "string" || !assetIds.has(raw.image.assetId)) {
      return null;
    }
    if (points.length < 2) return null;
    if (points.length > 2) points.length = 2;
    const width = Math.abs(points[1].x - points[0].x);
    const height = Math.abs(points[1].y - points[0].y);
    if (width < 0.5 || height < 0.5) return null;
    image = {
      assetId: raw.image.assetId,
      mode: normalizeImageMode(raw.image.mode),
    };
  }
  const areaShape = raw.kind === "area" ? normalizeAreaShape(raw.areaShape) : undefined;
  if (areaShape === "rectangle" || areaShape === "ellipse") {
    // Quick areas are defined by exactly two opposite points. Trim malformed
    // legacy data instead of inventing a different shape or geometry.
    if (points.length < 2) return null;
    if (points.length > 2) points.length = 2;
  }
  if (raw.kind === "cloud" && points.length < 3) return null;
  if (raw.kind === "callout") {
    if (points.length < 2) return null;
    points.length = 2;
  }
  if (raw.kind === "stamp" || raw.kind === "delta") points.length = 1;
  const highlightShape =
    raw.kind === "highlight" ? normalizeHighlightShape(raw.highlightShape) : undefined;
  const arrowHeads: ArrowHeads | undefined =
    raw.kind === "arrow" ? (raw.arrowHeads === "both" ? "both" : "end") : undefined;
  const textOffset =
    raw.kind === "cloud" && isPoint(raw.textOffset) ? { ...raw.textOffset } : undefined;
  const labelOffset = isMeasure && isPoint(raw.labelOffset) ? { ...raw.labelOffset } : undefined;
  const labelAnchor = isMeasure && isPoint(raw.labelAnchor) ? { ...raw.labelAnchor } : undefined;
  const lineStyle: MarkupItem["lineStyle"] =
    raw.kind === "length" && raw.lineStyle === "dashed" ? "dashed" : undefined;
  const cloudRadius =
    raw.kind === "cloud" &&
    typeof raw.cloudRadius === "number" &&
    Number.isFinite(raw.cloudRadius) &&
    raw.cloudRadius > 0
      ? Math.max(2, Math.min(40, raw.cloudRadius))
      : undefined;
  const textBoxWidth =
    (raw.kind === "callout" || raw.kind === "cloud") &&
    typeof raw.textBoxWidth === "number" &&
    Number.isFinite(raw.textBoxWidth) &&
    raw.textBoxWidth > 0
      ? Math.max(20, Math.min(2000, raw.textBoxWidth))
      : undefined;
  const textBoxHeight =
    (raw.kind === "callout" || raw.kind === "cloud") &&
    typeof raw.textBoxHeight === "number" &&
    Number.isFinite(raw.textBoxHeight) &&
    raw.textBoxHeight > 0
      ? Math.max(15, Math.min(2000, raw.textBoxHeight))
      : undefined;
  const textColor =
    (raw.kind === "cloud" ||
      raw.kind === "callout" ||
      raw.kind === "stamp" ||
      raw.kind === "delta") &&
    typeof raw.textColor === "string" &&
    raw.textColor
      ? raw.textColor
      : undefined;
  const supportsTextStyle = raw.kind === "text" || raw.kind === "cloud" || raw.kind === "callout";
  const textBold = supportsTextStyle && raw.textBold === true ? true : undefined;
  const textUnderline = supportsTextStyle && raw.textUnderline === true ? true : undefined;
  const textAlign: TextAlign | undefined =
    supportsTextStyle &&
    (raw.textAlign === "left" || raw.textAlign === "center" || raw.textAlign === "right")
      ? raw.textAlign
      : undefined;
  const text =
    typeof raw.text === "string"
      ? raw.text
      : raw.kind === "stamp"
        ? "APPROVED"
        : raw.kind === "callout"
          ? "Callout"
          : raw.kind === "delta"
            ? "A"
            : undefined;
  const fontSize =
    typeof raw.fontSize === "number" && Number.isFinite(raw.fontSize) && raw.fontSize > 0
      ? Math.max(0.5, Math.min(300, raw.fontSize))
      : raw.kind === "callout" || raw.kind === "cloud" || raw.kind === "stamp"
        ? 12
        : raw.kind === "delta"
          ? 14
          : undefined;
  return {
    id:
      typeof raw.id === "string"
        ? raw.id
        : `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    page: typeof raw.page === "number" && raw.page >= 1 ? Math.round(raw.page) : 1,
    kind: raw.kind,
    points,
    color:
      raw.kind === "stamp"
        ? stampStatusColor(text, typeof raw.color === "string" ? raw.color : "#4cc9f0")
        : typeof raw.color === "string"
          ? raw.color
          : raw.kind === "image"
            ? "#7aa2f7"
            : "#4cc9f0",
    strokeWidth: typeof raw.strokeWidth === "number" && raw.strokeWidth > 0 ? raw.strokeWidth : 2,
    fillColor: typeof raw.fillColor === "string" ? raw.fillColor : undefined,
    opacity: typeof raw.opacity === "number" ? Math.max(0, Math.min(1, raw.opacity)) : undefined,
    text,
    label: typeof raw.label === "string" ? raw.label : undefined,
    fontSize,
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
              sourceUnit: LENGTH_UNITS.has(
                (scale as { sourceUnit?: LengthUnit }).sourceUnit as LengthUnit,
              )
                ? (scale as { sourceUnit: LengthUnit }).sourceUnit
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
      raw.kind === "area"
        ? raw.areaMode === "subtract"
          ? ("subtract" as AreaMode)
          : "add"
        : undefined,
    areaShape,
    highlightShape,
    arrowHeads,
    textOffset,
    labelOffset,
    labelAnchor,
    lineStyle,
    cloudRadius,
    textBoxWidth,
    textBoxHeight,
    textColor,
    textBold,
    textUnderline,
    textAlign,
    countType:
      raw.kind === "count"
        ? COUNT_TYPES.has(raw.countType as CountType)
          ? (raw.countType as CountType)
          : "other"
        : undefined,
    image,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
}

function normalizeLayers(
  rawLayers: unknown,
  categoryIds: ReadonlySet<string>,
  fallbackCategoryId: string,
  assetIds: ReadonlySet<string>,
): Layer[] {
  const layers: Layer[] = [];
  if (Array.isArray(rawLayers)) {
    for (const value of rawLayers) {
      if (typeof value !== "object" || value === null) continue;
      const raw = value as Partial<Layer>;
      if (raw.kind !== "measure" && raw.kind !== "draw") continue;
      const layer: Layer = {
        id:
          typeof raw.id === "string"
            ? raw.id
            : `layer_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name:
          typeof raw.name === "string" && raw.name.trim()
            ? raw.name.trim()
            : raw.kind === "measure"
              ? "Measurements"
              : "Markups",
        kind: raw.kind,
        visible: raw.visible !== false,
        locked: raw.locked === true,
        opacity: typeof raw.opacity === "number" ? Math.max(0, Math.min(1, raw.opacity)) : 1,
        color:
          typeof raw.color === "string"
            ? raw.color
            : raw.kind === "measure"
              ? "#4cc9f0"
              : "#f2a93b",
        items: [],
      };
      if (Array.isArray(raw.items)) {
        for (const item of raw.items) {
          const normalized = normalizeItem(
            item,
            layer.kind,
            categoryIds,
            fallbackCategoryId,
            assetIds,
          );
          if (normalized) layer.items.push(normalized);
        }
      }
      layers.push(layer);
    }
  }

  if (!layers.some((l) => l.kind === "measure"))
    layers.push(createLayer("measure", "Measurements"));
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

function normalizeDocument(rawValue: unknown): DocumentRef {
  const rawDoc = (
    typeof rawValue === "object" && rawValue !== null ? rawValue : {}
  ) as Partial<DocumentRef> & {
    source?: { format?: unknown; dpi?: unknown; originalName?: unknown };
  };
  const kind = rawDoc.kind === "tiff" ? "tiff" : "pdf";
  const document: DocumentRef = {
    id: typeof rawDoc.id === "string" && rawDoc.id ? rawDoc.id : makeId("doc"),
    kind,
    name:
      typeof rawDoc.name === "string" && rawDoc.name.trim()
        ? rawDoc.name
        : kind === "tiff"
          ? "Untitled.tif"
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
  if (Array.isArray(rawDoc.excludedPages)) {
    const excluded = [
      ...new Set(
        rawDoc.excludedPages
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
          .map((value) => Math.round(value))
          .filter((value) => value >= 1 && value <= document.pageCount),
      ),
    ].sort((a, b) => a - b);
    if (excluded.length) document.excludedPages = excluded;
  }
  if (kind === "tiff") {
    if (typeof rawDoc.embeddedPdf !== "string" || !rawDoc.embeddedPdf) {
      throw new Error("A TIF document in this project is missing its embedded PDF.");
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
  return document;
}

export function parseProject(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (typeof data !== "object" || data === null)
    throw new Error("Project file is empty or invalid.");
  const raw = data as Partial<Project>;
  if (typeof raw.schemaVersion !== "number") throw new Error("Project file has no schema version.");
  if (raw.schemaVersion > SCHEMA_VERSION) {
    throw new Error("This project was created by a newer version of GridScalr.");
  }
  const legacy = (raw as { document?: unknown }).document;
  const rawDocuments: unknown[] = Array.isArray((raw as { documents?: unknown }).documents)
    ? (raw as { documents: unknown[] }).documents
    : legacy
      ? [legacy]
      : [];
  if (!rawDocuments.length) {
    throw new Error("Project file has no document reference.");
  }
  // Schema 5 and earlier stored exactly one document. Migration wraps it in a list.
  const documents = rawDocuments.map((entry) => normalizeDocument(entry));
  const seen = new Set<string>();
  for (const document of documents) {
    if (seen.has(document.id)) document.id = makeId("doc");
    seen.add(document.id);
  }
  const total = totalPageCount(documents);
  if (total < 1) throw new Error("Project file has no remaining pages.");
  const base = createProject(documents[0], createDefaultLayers());
  const categories = normalizeCategories(raw.categories);
  const settings = normalizeSettings(raw.settings, categories);
  const assets = normalizeAssets(raw.assets);
  const project: Project = {
    ...base,
    id: typeof raw.id === "string" ? raw.id : base.id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : base.name,
    documents,
    settings,
    categories,
    assets,
    pages: {},
    layers: normalizeLayers(
      raw.layers,
      new Set(categories.map((category) => category.id)),
      settings.quantity.defaultCategoryId,
      new Set(Object.keys(assets)),
    ),
    activeLayerId: typeof raw.activeLayerId === "string" ? raw.activeLayerId : base.activeLayerId,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : base.createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : base.updatedAt,
  };

  if (raw.pages && typeof raw.pages === "object") {
    for (const [key, value] of Object.entries(raw.pages)) {
      const page = Number(key);
      if (!Number.isInteger(page) || page < 1 || page > total) continue;
      const rawPage = value as { calibration?: unknown; scaleLocked?: unknown } | null;
      const cal = normalizeCalibration(rawPage?.calibration);
      if (cal) {
        project.pages[key] = { calibration: cal };
        // A lock without a scale is meaningless and is discarded.
        if (rawPage?.scaleLocked === true) project.pages[key].scaleLocked = true;
      }
    }
  }

  if (!project.layers.some((l) => l.id === project.activeLayerId)) {
    project.activeLayerId =
      project.layers.find((l) => l.kind === "measure")?.id ?? project.layers[0].id;
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

export function relativeDocumentPath(
  projectPath: string,
  documentPath: string | null,
): string | null {
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

export function resolveRelativePath(
  projectPath: string,
  relativePath: string | null,
): string | null {
  if (!relativePath) return null;
  const separator = projectPath.includes("\\") ? "\\" : "/";
  const projectDir = projectPath.split(/[\\/]/).slice(0, -1).join(separator);
  if (!projectDir) return relativePath;
  const parts = `${projectDir}${separator}${relativePath.replace(/[\\/]/g, separator)}`.split(
    separator,
  );
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return (projectPath.startsWith("/") ? "/" : "") + resolved.join(separator);
}

/**
 * Every path that belongs to a source document. This includes both the stored
 * absolute path and the path resolved from the project's relative reference, so
 * an export can never overwrite a drawing even if it was located through the
 * portable fallback.
 */
export function sourceDocumentPaths(project: Project, projectPath: string | null = null): string[] {
  const paths = new Set<string>();
  for (const document of project.documents) {
    if (document.path) paths.add(document.path);
    if (projectPath && document.relativePath) {
      const resolved = resolveRelativePath(projectPath, document.relativePath);
      if (resolved) paths.add(resolved);
    }
  }
  return [...paths];
}

/** Recomputes every document's relative path for a new project location. */
export function updateRelativeDocumentPaths(project: Project, projectPath: string | null): void {
  for (const document of project.documents) {
    document.relativePath =
      projectPath && document.path ? relativeDocumentPath(projectPath, document.path) : null;
  }
}

export function remapPageItems(project: Project, pageCount: number): void {
  for (const layer of project.layers) {
    layer.items = layer.items.filter((item) => item.page <= pageCount);
  }
}

export { isMeasurementKind };

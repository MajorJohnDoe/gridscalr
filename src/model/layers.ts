import { makeId } from "./calibration";
import { createDefaultCategories, createDefaultQuantitySettings } from "./categories";
import { SCHEMA_VERSION } from "./types";
import type {
  DocumentRef,
  ItemKind,
  Layer,
  LayerKind,
  LayerPageState,
  MarkupItem,
  Project,
  ProjectSettings,
  SelectionRef,
} from "./types";

export const DEFAULT_MEASURE_COLOR = "#4cc9f0";
export const DEFAULT_DRAW_COLOR = "#f2a93b";
export const DEFAULT_SETTINGS: ProjectSettings = {
  lengthUnit: "mm",
  areaUnit: "m2",
  smartLengthUnits: true,
  labelSize: 6,
  // Existing projects keep the full "Perimeter" wording; createProject turns
  // this on for new projects.
  compactAreaLabels: false,
  showGrid: false,
  showCalibration: true,
  snapToGeometry: true,
  snapTolerancePx: 8,
  stampPresets: ["APPROVED", "NOT APPROVED", "FOR INFORMATION", "INSPECTED", "REVISED"],
  // Replaced by createProject and the project normalizer, which know the
  // project's category ids.
  quantity: { defaultCategoryId: "", wastePercent: 0, roundingStep: 0 },
};

const MEASURE_KINDS: ReadonlySet<ItemKind> = new Set([
  "length",
  "area",
  "count",
  "radius",
  "diameter",
  "arc",
]);

export function isMeasurementKind(kind: ItemKind): boolean {
  return MEASURE_KINDS.has(kind);
}

export function layerKindForItem(kind: ItemKind): LayerKind {
  return isMeasurementKind(kind) ? "measure" : "draw";
}

export function createLayer(
  kind: LayerKind,
  name?: string,
  color?: string,
  homePage?: number,
): Layer {
  const index = Math.floor(Math.random() * 900 + 100);
  return {
    id: makeId("layer"),
    name: name ?? (kind === "measure" ? `Measurements ${index}` : `Markup ${index}`),
    kind,
    visible: true,
    locked: false,
    opacity: 1,
    color: color ?? (kind === "measure" ? DEFAULT_MEASURE_COLOR : DEFAULT_DRAW_COLOR),
    items: [],
    ...(homePage ? { homePage } : {}),
  };
}

export function createDefaultLayers(page = 1): Layer[] {
  return [
    createLayer("draw", "Markups", undefined, page),
    createLayer("measure", "Measurements", undefined, page),
  ];
}

export function defaultDocument(name = "Untitled", pageCount = 1): DocumentRef {
  return {
    id: makeId("doc"),
    kind: "pdf",
    name,
    path: null,
    relativePath: null,
    sha256: "",
    pageCount,
    sizeBytes: 0,
  };
}

export function createProject(document: DocumentRef, layers?: Layer[]): Project {
  const now = new Date().toISOString();
  const actualLayers = layers?.length ? layers : createDefaultLayers();
  const measureLayer = actualLayers.find((l) => l.kind === "measure");
  const categories = createDefaultCategories();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: makeId("project"),
    name: document.name.replace(/\.(pdf|tiff?)$/i, "") || "Untitled",
    documents: [document],
    settings: {
      ...DEFAULT_SETTINGS,
      compactAreaLabels: true,
      stampPresets: [...DEFAULT_SETTINGS.stampPresets],
      quantity: createDefaultQuantitySettings(categories),
    },
    categories,
    assets: {},
    pages: {},
    markupsViews: [],
    layers: normalizeLayerOrder(actualLayers),
    activeLayerId: measureLayer?.id ?? actualLayers[0].id,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeLayerOrder(layers: Layer[]): Layer[] {
  const draw = layers.filter((l) => l.kind === "draw");
  const measure = layers.filter((l) => l.kind === "measure");
  return [...draw, ...measure];
}

export function activeLayer(project: Project): Layer | undefined {
  return project.layers.find((l) => l.id === project.activeLayerId);
}

export function layersForKind(project: Project, kind: LayerKind): Layer[] {
  return project.layers.filter((l) => l.kind === kind);
}

export function layerPageState(layer: Layer, page: number): LayerPageState | undefined {
  return layer.pageState?.[String(page)];
}

export function layerVisibleOnPage(layer: Layer, page: number): boolean {
  return layerPageState(layer, page)?.visible ?? layer.visible;
}

export function layerLockedOnPage(layer: Layer, page: number): boolean {
  return layerPageState(layer, page)?.locked ?? layer.locked;
}

/** True when a layer is either created on the page or has items on it. */
export function layerAppliesToPage(layer: Layer, page: number): boolean {
  return layer.homePage === page || layer.items.some((item) => item.page === page);
}

function pruneLayerPageState(layer: Layer, key: string): void {
  if (!layer.pageState) return;
  const state = layer.pageState[key];
  if (state && state.visible === undefined && state.locked === undefined) {
    delete layer.pageState[key];
  }
  if (!Object.keys(layer.pageState).length) delete layer.pageState;
}

export function setLayerVisibleOnPage(layer: Layer, page: number, visible: boolean): void {
  const key = String(page);
  layer.pageState ??= {};
  layer.pageState[key] = { ...layer.pageState[key], visible };
  if (visible === layer.visible) delete layer.pageState[key].visible;
  pruneLayerPageState(layer, key);
}

export function setLayerLockedOnPage(layer: Layer, page: number, locked: boolean): void {
  const key = String(page);
  layer.pageState ??= {};
  layer.pageState[key] = { ...layer.pageState[key], locked };
  if (locked === layer.locked) delete layer.pageState[key].locked;
  pruneLayerPageState(layer, key);
}

function clearPageOverride(layer: Layer, field: "visible" | "locked"): void {
  if (!layer.pageState) return;
  for (const state of Object.values(layer.pageState)) delete state[field];
  for (const key of Object.keys(layer.pageState)) {
    const state = layer.pageState[key];
    if (state.visible === undefined && state.locked === undefined) delete layer.pageState[key];
  }
  if (!Object.keys(layer.pageState).length) delete layer.pageState;
}

export function setLayerVisibleGlobally(layer: Layer, visible: boolean): void {
  layer.visible = visible;
  clearPageOverride(layer, "visible");
}

export function setLayerLockedGlobally(layer: Layer, locked: boolean): void {
  layer.locked = locked;
  clearPageOverride(layer, "locked");
}

export function itemIsVisible(item: MarkupItem, layer?: Layer): boolean {
  if (layer && !layerVisibleOnPage(layer, item.page)) return false;
  return item.visible !== false;
}

export function itemIsLocked(item: MarkupItem, layer?: Layer): boolean {
  if (layer && layerLockedOnPage(layer, item.page)) return true;
  return item.locked === true;
}

function availableLayerName(project: Project, kind: LayerKind): string {
  const base = kind === "measure" ? "Measurements" : "Markups";
  const names = new Set(project.layers.map((layer) => layer.name));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index++;
  return `${base} ${index}`;
}

/** Returns a layer that can receive new items of the requested kind. */
export function ensureActiveLayer(project: Project, kind: LayerKind, page?: number): Layer {
  const current = project.layers.find((l) => l.id === project.activeLayerId && l.kind === kind);
  const currentEditable = current
    ? page === undefined
      ? current.visible && !current.locked
      : layerVisibleOnPage(current, page) && !layerLockedOnPage(current, page)
    : false;
  if (current && currentEditable) return current;

  const editable = layersForKind(project, kind).find(
    (layer) =>
      (page === undefined || layerAppliesToPage(layer, page)) &&
      (page === undefined
        ? layer.visible && !layer.locked
        : layerVisibleOnPage(layer, page) && !layerLockedOnPage(layer, page)),
  );
  if (editable) {
    project.activeLayerId = editable.id;
    return editable;
  }

  const layer = createLayer(kind, availableLayerName(project, kind), undefined, page);
  project.layers = normalizeLayerOrder([...project.layers, layer]);
  project.activeLayerId = layer.id;
  return layer;
}

export function addLayer(project: Project, kind: LayerKind, page?: number): Layer {
  const existing = layersForKind(project, kind).length;
  const layer = createLayer(
    kind,
    kind === "measure" ? `Measurements ${existing + 1}` : `Markup ${existing + 1}`,
    undefined,
    page,
  );
  project.layers = normalizeLayerOrder([...project.layers, layer]);
  project.activeLayerId = layer.id;
  return layer;
}

export function duplicateLayer(project: Project, layerId: string): Layer | undefined {
  const source = project.layers.find((l) => l.id === layerId);
  if (!source) return undefined;
  const copy: Layer = {
    ...source,
    id: makeId("layer"),
    name: `${source.name} copy`,
    items: source.items.map((item) => ({
      ...item,
      id: makeId("item"),
      points: item.points.map((p) => ({ ...p })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })),
    pageState: source.pageState
      ? (JSON.parse(JSON.stringify(source.pageState)) as Record<string, LayerPageState>)
      : undefined,
  };
  const index = project.layers.findIndex((l) => l.id === layerId);
  project.layers.splice(index + 1, 0, copy);
  project.layers = normalizeLayerOrder(project.layers);
  project.activeLayerId = copy.id;
  return copy;
}

export function removeLayer(project: Project, layerId: string): boolean {
  const layer = project.layers.find((l) => l.id === layerId);
  if (!layer) return false;
  project.layers = project.layers.filter((l) => l.id !== layerId);
  if (!layersForKind(project, layer.kind).length) {
    project.layers = normalizeLayerOrder([
      ...project.layers,
      createLayer(layer.kind, undefined, undefined, layer.homePage),
    ]);
  }
  const fallback = layersForKind(project, layer.kind)[0];
  if (project.activeLayerId === layerId && fallback) project.activeLayerId = fallback.id;
  return true;
}

export function moveLayer(project: Project, layerId: string, direction: -1 | 1): boolean {
  const layer = project.layers.find((l) => l.id === layerId);
  if (!layer) return false;
  const group = project.layers.filter((l) => l.kind === layer.kind);
  const index = group.findIndex((l) => l.id === layerId);
  const target = index + direction;
  if (target < 0 || target >= group.length) return false;
  const reordered = [...group];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  const others = project.layers.filter((l) => l.kind !== layer.kind);
  const draw = project.layers.some((l) => l.kind === "draw");
  project.layers =
    layer.kind === "draw"
      ? [...reordered, ...others]
      : draw
        ? [...others, ...reordered]
        : [...reordered, ...others];
  return true;
}

export function swapLayers(project: Project, layerId: string, otherLayerId: string): boolean {
  const a = project.layers.findIndex((l) => l.id === layerId);
  const b = project.layers.findIndex((l) => l.id === otherLayerId);
  if (a < 0 || b < 0 || a === b) return false;
  if (project.layers[a].kind !== project.layers[b].kind) return false;
  [project.layers[a], project.layers[b]] = [project.layers[b], project.layers[a]];
  return true;
}

export function reorderLayer(project: Project, layerId: string, beforeLayerId: string): boolean {
  const layer = project.layers.find((l) => l.id === layerId);
  const target = project.layers.find((l) => l.id === beforeLayerId);
  if (!layer || !target || layer.kind !== target.kind || layer.id === target.id) return false;
  const group = project.layers.filter((l) => l.kind === layer.kind);
  const from = group.findIndex((l) => l.id === layerId);
  const to = group.findIndex((l) => l.id === beforeLayerId);
  if (from < 0 || to < 0) return false;
  group.splice(from, 1);
  group.splice(to, 0, layer);
  const others = project.layers.filter((l) => l.kind !== layer.kind);
  project.layers =
    layer.kind === "draw"
      ? [...group, ...others]
      : others.some((l) => l.kind === "draw")
        ? [...others, ...group]
        : [...group, ...others];
  return true;
}

export function addItem(project: Project, layerId: string, item: MarkupItem): void {
  const layer = project.layers.find((l) => l.id === layerId);
  if (!layer) throw new Error("Target layer does not exist");
  layer.items.push(item);
}

export function removeItem(
  project: Project,
  layerId: string,
  itemId: string,
): MarkupItem | undefined {
  const layer = project.layers.find((l) => l.id === layerId);
  if (!layer) return undefined;
  const index = layer.items.findIndex((i) => i.id === itemId);
  if (index < 0) return undefined;
  return layer.items.splice(index, 1)[0];
}

export function findItem(
  project: Project,
  itemId: string,
): { layer: Layer; item: MarkupItem } | undefined {
  for (const layer of project.layers) {
    const item = layer.items.find((i) => i.id === itemId);
    if (item) return { layer, item };
  }
  return undefined;
}

export function moveItemToLayer(
  project: Project,
  layerId: string,
  itemId: string,
  targetLayerId: string,
): boolean {
  const source = project.layers.find((l) => l.id === layerId);
  const target = project.layers.find((l) => l.id === targetLayerId);
  if (!source || !target || source.kind !== target.kind) return false;
  const index = source.items.findIndex((i) => i.id === itemId);
  if (index < 0) return false;
  const [item] = source.items.splice(index, 1);
  target.items.push(item);
  item.updatedAt = new Date().toISOString();
  return true;
}

export interface MoveSelectionResult {
  moved: number;
  skipped: number;
  mixedKinds: boolean;
}

export function moveItemsToLayer(
  project: Project,
  refs: SelectionRef[],
  targetLayerId: string,
): MoveSelectionResult {
  const result: MoveSelectionResult = { moved: 0, skipped: 0, mixedKinds: false };
  const target = project.layers.find((layer) => layer.id === targetLayerId);
  if (!target) return result;

  const found = refs
    .map((ref) => ({ ref, match: findItem(project, ref.itemId) }))
    .filter((entry): entry is { ref: SelectionRef; match: { layer: Layer; item: MarkupItem } } =>
      Boolean(entry.match),
    );
  if (!found.length) return result;
  const kind = found[0].match.layer.kind;
  if (found.some((entry) => entry.match.layer.kind !== kind)) {
    result.mixedKinds = true;
    result.skipped = found.length;
    return result;
  }
  if (target.kind !== kind) {
    result.skipped = found.length;
    return result;
  }

  for (const { ref, match } of found) {
    if (itemIsLocked(match.item, match.layer) || layerLockedOnPage(target, match.item.page)) {
      result.skipped++;
      continue;
    }
    if (ref.layerId === target.id) continue;
    const source = project.layers.find((layer) => layer.id === ref.layerId);
    if (!source) {
      result.skipped++;
      continue;
    }
    const index = source.items.findIndex((item) => item.id === ref.itemId);
    if (index < 0) {
      result.skipped++;
      continue;
    }
    const [item] = source.items.splice(index, 1);
    target.items.push(item);
    item.updatedAt = new Date().toISOString();
    result.moved++;
  }
  return result;
}

export function cloneItem(item: MarkupItem, offset = 0, page?: number): MarkupItem {
  const now = new Date().toISOString();
  return {
    ...item,
    id: makeId("item"),
    page: page ?? item.page,
    points: item.points.map((point) => ({ x: point.x + offset, y: point.y + offset })),
    textOffset: item.textOffset ? { ...item.textOffset } : undefined,
    labelOffset: item.labelOffset ? { ...item.labelOffset } : undefined,
    labelAnchor: item.labelAnchor ? { ...item.labelAnchor } : undefined,
    // Copies should always be visible and editable after they are pasted.
    visible: true,
    locked: false,
    scale: item.scale ? { ...item.scale } : item.scale,
    createdAt: now,
    updatedAt: now,
  };
}

export function itemCountForPage(project: Project, page: number): number {
  return project.layers.reduce(
    (count, layer) => count + layer.items.filter((i) => i.page === page).length,
    0,
  );
}

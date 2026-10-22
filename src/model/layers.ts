import { makeId } from "./calibration";
import { createDefaultCategories, createDefaultQuantitySettings } from "./categories";
import { SCHEMA_VERSION } from "./types";
import type {
  DocumentRef,
  ItemKind,
  Layer,
  LayerKind,
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
  showGrid: false,
  showCalibration: true,
  snapToGeometry: true,
  snapTolerancePx: 8,
  // Replaced by createProject and the project normalizer, which know the
  // project's category ids.
  quantity: { defaultCategoryId: "", wastePercent: 0, roundingStep: 0 },
};

const MEASURE_KINDS: ReadonlySet<ItemKind> = new Set(["length", "area", "count"]);

export function isMeasurementKind(kind: ItemKind): boolean {
  return MEASURE_KINDS.has(kind);
}

export function layerKindForItem(kind: ItemKind): LayerKind {
  return isMeasurementKind(kind) ? "measure" : "draw";
}

export function createLayer(kind: LayerKind, name?: string, color?: string): Layer {
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
  };
}

export function createDefaultLayers(): Layer[] {
  return [
    createLayer("draw", "Markups"),
    createLayer("measure", "Measurements"),
  ];
}

export function defaultDocument(name = "Untitled", pageCount = 1): DocumentRef {
  return {
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
    name: document.name.replace(/\.pdf$/i, "") || "Untitled",
    document,
    settings: { ...DEFAULT_SETTINGS, quantity: createDefaultQuantitySettings(categories) },
    categories,
    pages: {},
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

export function itemIsVisible(item: MarkupItem, layer?: Layer): boolean {
  if (layer && !layer.visible) return false;
  return item.visible !== false;
}

export function itemIsLocked(item: MarkupItem, layer?: Layer): boolean {
  if (layer?.locked) return true;
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
export function ensureActiveLayer(project: Project, kind: LayerKind): Layer {
  const current = project.layers.find((l) => l.id === project.activeLayerId && l.kind === kind);
  if (current?.visible && !current.locked) return current;

  const editable = layersForKind(project, kind).find((layer) => layer.visible && !layer.locked);
  if (editable) {
    project.activeLayerId = editable.id;
    return editable;
  }

  let layer = current;
  if (!layer) {
    layer = createLayer(kind, availableLayerName(project, kind));
    project.layers = normalizeLayerOrder([...project.layers, layer]);
  }
  // If every layer of this kind is hidden or locked, create a new editable layer
  // rather than silently drawing something the user cannot see or change.
  if (!layer.visible || layer.locked) {
    layer = createLayer(kind, availableLayerName(project, kind));
    project.layers = normalizeLayerOrder([...project.layers, layer]);
  }
  project.activeLayerId = layer.id;
  return layer;
}

export function addLayer(project: Project, kind: LayerKind): Layer {
  const existing = layersForKind(project, kind).length;
  const layer = createLayer(
    kind,
    kind === "measure" ? `Measurements ${existing + 1}` : `Markup ${existing + 1}`,
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
    project.layers = normalizeLayerOrder([...project.layers, createLayer(layer.kind)]);
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
  project.layers = layer.kind === "draw" ? [...reordered, ...others] : draw ? [...others, ...reordered] : [...reordered, ...others];
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
    layer.kind === "draw" ? [...group, ...others] : others.some((l) => l.kind === "draw") ? [...others, ...group] : [...group, ...others];
  return true;
}

export function addItem(project: Project, layerId: string, item: MarkupItem): void {
  const layer = project.layers.find((l) => l.id === layerId);
  if (!layer) throw new Error("Target layer does not exist");
  layer.items.push(item);
}

export function removeItem(project: Project, layerId: string, itemId: string): MarkupItem | undefined {
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

export function moveItemToLayer(project: Project, layerId: string, itemId: string, targetLayerId: string): boolean {
  const source = project.layers.find((l) => l.id === layerId);
  const target = project.layers.find((l) => l.id === targetLayerId);
  if (!source || !target || source.kind !== target.kind) return false;
  const index = source.items.findIndex((i) => i.id === itemId);
  if (index < 0) return false;
  const [item] = source.items.splice(index, 1);
  target.items.push(item);
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
  if (!target || target.locked) return result;

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
    if (itemIsLocked(match.item, match.layer)) {
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

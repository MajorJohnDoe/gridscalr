import { makeId } from "./calibration";
import { normalizeColor } from "./color";
import { buildLayerHierarchy, layerDescendantIds, layerEffectiveState } from "./layerHierarchy";
import { defaultProjectMetadata } from "./metadata";
import { DEFAULT_STAMP_PRESETS, defaultStampPresets } from "./stamps";
import { createDefaultCategories, createDefaultQuantitySettings } from "./categories";
import { defaultCountTypes } from "../features/countTypes/model";
import { defaultLineTypes } from "./lineTypes";
import { SCHEMA_VERSION } from "./types";
import { buildPageRecords } from "./pages";
import { includedLocalPages as includedLocalPagesFor } from "./documents";
import type {
  DocumentRef,
  ItemKind,
  PageId,
  Layer,
  LayerKind,
  LayerPageState,
  MarkupItem,
  Project,
  ProjectSettings,
  SelectionRef,
} from "./types";
import { t } from "../i18n";

export const DEFAULT_MEASURE_COLOR = "#f70808";
export const DEFAULT_DRAW_COLOR = "#f2a93b";

export interface LayerColorDefaults {
  measure: string;
  draw: string;
}

export const DEFAULT_LAYER_COLORS: LayerColorDefaults = {
  measure: DEFAULT_MEASURE_COLOR,
  draw: DEFAULT_DRAW_COLOR,
};

let layerColorDefaults: LayerColorDefaults = { ...DEFAULT_LAYER_COLORS };

function normalizeLayerColor(value: unknown, fallback: string): string {
  return normalizeColor(value, fallback);
}

/** Default stroke/text colour for an item whose stored colour is invalid. */
export function defaultColorForItem(kind: ItemKind): string {
  return isMeasurementKind(kind) ? DEFAULT_MEASURE_COLOR : DEFAULT_DRAW_COLOR;
}

/** Default colour for a layer whose stored colour is invalid. */
export function defaultColorForLayer(kind: LayerKind): string {
  return kind === "measure" ? DEFAULT_MEASURE_COLOR : DEFAULT_DRAW_COLOR;
}

/** Resolves an item colour without ever falling back to black. */
export function resolveItemColor(item: Pick<MarkupItem, "kind" | "color">): string {
  return normalizeColor(item.color, defaultColorForItem(item.kind));
}

/** Resolves a layer colour without ever falling back to black. */
export function resolveLayerColor(layer: Pick<Layer, "kind" | "color">): string {
  return normalizeColor(layer.color, defaultColorForLayer(layer.kind));
}

/** App-level colours used by every newly created layer. */
export function setDefaultLayerColors(colors: Partial<LayerColorDefaults>): LayerColorDefaults {
  layerColorDefaults = {
    measure: normalizeLayerColor(colors.measure, layerColorDefaults.measure),
    draw: normalizeLayerColor(colors.draw, layerColorDefaults.draw),
  };
  return { ...layerColorDefaults };
}

export function defaultLayerColors(): LayerColorDefaults {
  return { ...layerColorDefaults };
}

export function resetDefaultLayerColors(): LayerColorDefaults {
  layerColorDefaults = { ...DEFAULT_LAYER_COLORS };
  return defaultLayerColors();
}

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
  stampPresets: [...DEFAULT_STAMP_PRESETS],
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
  "angle",
  "slope",
  "volume",
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
  homePageId?: PageId,
): Layer {
  const index = Math.floor(Math.random() * 900 + 100);
  return {
    id: makeId("layer"),
    name:
      name ??
      (kind === "measure"
        ? t("layer.defaultMeasurements", { index })
        : t("layer.defaultMarkup", { index })),
    kind,
    visible: true,
    locked: false,
    opacity: 1,
    color: normalizeColor(color ?? layerColorDefaults[kind], defaultColorForLayer(kind)),
    items: [],
    ...(homePageId ? { homePageId } : {}),
  };
}

export function createDefaultLayers(homePageId?: PageId): Layer[] {
  return [
    createLayer("draw", t("layer.defaultMarkupsName"), undefined, homePageId),
    createLayer("measure", t("layer.defaultMeasurementsName"), undefined, homePageId),
  ];
}

export function defaultDocument(name = t("app.untitledProject"), pageCount = 1): DocumentRef {
  return {
    id: makeId("doc"),
    kind: "pdf",
    name,
    path: null,
    relativePath: null,
    sha256: "",
    pageCount,
    sizeBytes: 0,
    storage: "reference",
  };
}

export function createProject(document?: DocumentRef | null, layers?: Layer[]): Project {
  const now = new Date().toISOString();
  const pages = document
    ? buildPageRecords([document], (entry) => includedLocalPagesFor(entry))
    : [];
  const homePageId = pages[0]?.id;
  const actualLayers = layers?.length ? layers : createDefaultLayers(homePageId);
  const measureLayer = actualLayers.find((l) => l.kind === "measure");
  const categories = createDefaultCategories();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: makeId("project"),
    name: document?.name.replace(/\.(pdf|tiff?)$/i, "") || t("app.untitledProject"),
    documents: document ? [document] : [],
    settings: {
      ...DEFAULT_SETTINGS,
      compactAreaLabels: true,
      stampPresets: defaultStampPresets(),
      quantity: createDefaultQuantitySettings(categories),
    },
    categories,
    countTypes: defaultCountTypes(),
    countPresets: [],
    lineTypes: defaultLineTypes(),
    assets: {},
    pages,
    markupsViews: [],
    metadata: defaultProjectMetadata(),
    reportLogoAssetId: null,
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

export function layersForKind(project: Pick<Project, "layers">, kind: LayerKind): Layer[] {
  return project.layers.filter((l) => l.kind === kind);
}

export function layerPageState(layer: Layer, pageId: PageId): LayerPageState | undefined {
  return layer.pageState?.[pageId];
}

export function layerVisibleOnPage(layer: Layer, pageId: PageId): boolean {
  return layerPageState(layer, pageId)?.visible ?? layer.visible;
}

export function layerLockedOnPage(layer: Layer, pageId: PageId): boolean {
  return layerPageState(layer, pageId)?.locked ?? layer.locked;
}

/** True when a layer is either created on the page or has items on it. */
export function layerAppliesToPage(layer: Layer, pageId: PageId): boolean {
  return layer.homePageId === pageId || layer.items.some((item) => item.pageId === pageId);
}

/**
 * Layers of a kind that can receive items living on the given pages.
 * Keeps move-to-layer pickers consistent with the page-scoped Layers list.
 */
export function moveTargetLayers(
  project: Project,
  kind: LayerKind,
  pageIds: Iterable<PageId>,
): Layer[] {
  const pageList = [...pageIds];
  return layersForKind(project, kind).filter((layer) =>
    pageList.some((pageId) => layerAppliesToPage(layer, pageId)),
  );
}

function pruneLayerPageState(layer: Layer, key: string): void {
  if (!layer.pageState) return;
  const state = layer.pageState[key];
  if (state && state.visible === undefined && state.locked === undefined) {
    delete layer.pageState[key];
  }
  if (!Object.keys(layer.pageState).length) delete layer.pageState;
}

export function setLayerVisibleOnPage(layer: Layer, pageId: PageId, visible: boolean): void {
  const key = pageId;
  layer.pageState ??= {};
  layer.pageState[key] = { ...layer.pageState[key], visible };
  if (visible === layer.visible) delete layer.pageState[key].visible;
  pruneLayerPageState(layer, key);
}

export function setLayerLockedOnPage(layer: Layer, pageId: PageId, locked: boolean): void {
  const key = pageId;
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
  if (layer && !layerVisibleOnPage(layer, item.pageId)) return false;
  return item.visible !== false;
}

export function itemIsLocked(item: MarkupItem, layer?: Layer): boolean {
  if (layer && layerLockedOnPage(layer, item.pageId)) return true;
  return item.locked === true;
}

function availableLayerName(project: Project, kind: LayerKind): string {
  const base =
    kind === "measure" ? t("layer.defaultMeasurementsName") : t("layer.defaultMarkupsName");
  const names = new Set(project.layers.map((layer) => layer.name));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} ${index}`)) index++;
  return `${base} ${index}`;
}

/** Returns a layer that can receive new items of the requested kind. */
export function ensureActiveLayer(project: Project, kind: LayerKind, pageId?: PageId): Layer {
  const current = project.layers.find((l) => l.id === project.activeLayerId && l.kind === kind);
  const currentEditable = current
    ? pageId === undefined
      ? current.visible && !current.locked
      : layerVisibleOnPage(current, pageId) && !layerLockedOnPage(current, pageId)
    : false;
  if (current && currentEditable) return current;

  const editable = layersForKind(project, kind).find(
    (layer) =>
      (pageId === undefined || layerAppliesToPage(layer, pageId)) &&
      (pageId === undefined
        ? layer.visible && !layer.locked
        : layerVisibleOnPage(layer, pageId) && !layerLockedOnPage(layer, pageId)),
  );
  if (editable) {
    project.activeLayerId = editable.id;
    return editable;
  }

  const layer = createLayer(kind, availableLayerName(project, kind), undefined, pageId);
  project.layers = normalizeLayerOrder([...project.layers, layer]);
  project.activeLayerId = layer.id;
  return layer;
}

/** Colour of the layer that will receive a new measurement on this page. */
export function measurementLayerColor(project: Project, pageId: PageId): string {
  const layers = project.layers.filter((layer) => layer.kind === "measure");
  const editable = (layer: Layer) =>
    layerVisibleOnPage(layer, pageId) && !layerLockedOnPage(layer, pageId);
  const target =
    layers.find((layer) => layer.id === project.activeLayerId && editable(layer)) ??
    layers.find(editable);
  return target?.color ?? layerColorDefaults.measure;
}

export function addLayer(project: Project, kind: LayerKind, pageId?: PageId): Layer {
  const existing = layersForKind(project, kind).length;
  const layer = createLayer(
    kind,
    kind === "measure"
      ? t("layer.defaultMeasurements", { index: existing + 1 })
      : t("layer.defaultMarkup", { index: existing + 1 }),
    undefined,
    pageId,
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
      ? (JSON.parse(JSON.stringify(source.pageState)) as Record<PageId, LayerPageState>)
      : undefined,
  };
  const index = project.layers.findIndex((l) => l.id === layerId);
  project.layers.splice(index + 1, 0, copy);
  project.layers = normalizeLayerOrder(project.layers);
  project.activeLayerId = copy.id;
  return copy;
}

/**
 * Removes a layer and its whole subtree.
 *
 * A parent with children deletes its children and their items; a single-layer
 * delete would leave children pointing at a missing parent. The caller confirms
 * the cascade from `planLayerDeletion` before calling this. A flat project has
 * no descendants, so its behaviour is unchanged.
 */
export function removeLayer(
  project: Pick<Project, "layers" | "activeLayerId">,
  layerId: string,
): boolean {
  const layer = project.layers.find((l) => l.id === layerId);
  if (!layer) return false;
  const subtree = new Set([
    layerId,
    ...layerDescendantIds(buildLayerHierarchy(project.layers), layerId),
  ]);
  project.layers = project.layers.filter((l) => !subtree.has(l.id));
  if (!layersForKind(project, layer.kind).length) {
    project.layers = normalizeLayerOrder([
      ...project.layers,
      createLayer(layer.kind, undefined, undefined, layer.homePageId),
    ]);
  }
  if (subtree.has(project.activeLayerId)) {
    const fallback = layersForKind(project, layer.kind)[0] ?? project.layers[0];
    project.activeLayerId = fallback?.id ?? "";
  }
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

/**
 * Replaces the order of one layer kind from a top-to-bottom rendered order.
 * IDs that are not part of the kind are ignored, and layers the caller did not
 * list keep their original slot, so reordering a page-scoped or filtered list
 * never moves a layer it did not show. Returns false when nothing changed.
 */
export function reorderLayerGroup(
  project: Project,
  kind: LayerKind,
  topToBottomIds: readonly string[],
): boolean {
  const group = layersForKind(project, kind);
  if (!group.length) return false;
  const byId = new Map(group.map((layer) => [layer.id, layer]));
  const requested: string[] = [];
  const seen = new Set<string>();
  for (const id of topToBottomIds) {
    if (!byId.has(id) || seen.has(id)) continue;
    seen.add(id);
    requested.push(id);
  }
  if (!requested.length) return false;
  const rendered = [...group].reverse();
  let cursor = 0;
  for (let index = 0; index < rendered.length; index += 1) {
    if (!seen.has(rendered[index].id)) continue;
    const next = byId.get(requested[cursor]);
    cursor += 1;
    if (next) rendered[index] = next;
  }
  const paintOrder = rendered.reverse();
  if (paintOrder.every((layer, index) => layer.id === group[index]?.id)) return false;
  const others = project.layers.filter((layer) => layer.kind !== kind);
  const draw = project.layers.some((layer) => layer.kind === "draw");
  project.layers =
    kind === "draw"
      ? [...paintOrder, ...others]
      : draw
        ? [...others, ...paintOrder]
        : [...paintOrder, ...others];
  return true;
}

export function addItem(project: Project, layerId: string, item: MarkupItem): void {
  const layer = project.layers.find((l) => l.id === layerId);
  if (!layer) throw new Error(t("layers.targetMissing"));
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

  const hierarchy = buildLayerHierarchy(project.layers);
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
    if (
      itemIsLocked(match.item, match.layer) ||
      (layerEffectiveState(hierarchy, target.id, match.item.pageId)?.locked ?? false)
    ) {
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

export function cloneItem(item: MarkupItem, offset = 0, pageId?: PageId): MarkupItem {
  const now = new Date().toISOString();
  return {
    ...item,
    id: makeId("item"),
    pageId: pageId ?? item.pageId,
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

export function itemCountForPage(project: Project, pageId: PageId): number {
  return project.layers.reduce(
    (count, layer) => count + layer.items.filter((i) => i.pageId === pageId).length,
    0,
  );
}

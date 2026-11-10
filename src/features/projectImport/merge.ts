import { uniqueCategoryName } from "../../io/projectFile/categories";
import { makeId } from "../../model/calibration";
import { excludedSourcePages } from "../../model/documents";
import type {
  Category,
  CountTypeDef,
  DocumentRef,
  ImageAsset,
  Layer,
  LineType,
  MarkupItem,
  PageId,
  PageState,
  Project,
} from "../../model/types";
import { uniqueCountTypeName } from "../countTypes/model";

export interface MergedReferences<T> {
  added: T[];
  map: Map<string, string>;
  missing: number;
}

export interface MergedAssets {
  added: Record<string, ImageAsset>;
  map: Map<string, string>;
  missing: number;
}

export function collectReferences(
  source: Project,
  selected: ReadonlySet<PageId>,
): {
  categories: Set<string>;
  countTypes: Set<string>;
  lineTypes: Set<string>;
  assets: Set<string>;
} {
  const categories = new Set<string>();
  const countTypes = new Set<string>();
  const lineTypes = new Set<string>();
  const assets = new Set<string>();
  for (const layer of source.layers) {
    for (const item of layer.items) {
      if (!selected.has(item.pageId)) continue;
      if (item.categoryId) categories.add(item.categoryId);
      if (item.countType) countTypes.add(item.countType);
      if (item.lineTypeId) lineTypes.add(item.lineTypeId);
      if (item.image?.assetId) assets.add(item.image.assetId);
    }
  }
  return { categories, countTypes, lineTypes, assets };
}

function uniqueDocumentName(destination: Project, wanted: string): string {
  const names = new Set(destination.documents.map((document) => document.name.toLowerCase()));
  if (!names.has(wanted.toLowerCase())) return wanted;
  let index = 2;
  while (names.has(`${wanted} ${index}`.toLowerCase())) index += 1;
  return `${wanted} ${index}`;
}

function uniqueLineTypeName(existing: readonly LineType[], wanted: string): string {
  const names = new Set(existing.map((lineType) => lineType.name.toLowerCase()));
  if (!names.has(wanted.toLowerCase())) return wanted;
  let index = 2;
  while (names.has(`${wanted} ${index}`.toLowerCase())) index += 1;
  return `${wanted} ${index}`;
}

export function mergeCategories(
  destination: Project,
  source: Project,
  referenced: ReadonlySet<string>,
): MergedReferences<Category> {
  const added: Category[] = [];
  const map = new Map<string, string>();
  let missing = 0;
  for (const sourceId of referenced) {
    const sourceCategory = source.categories.find((category) => category.id === sourceId);
    if (!sourceCategory) {
      missing += 1;
      continue;
    }
    const sameId = destination.categories.find(
      (category) =>
        category.id === sourceId &&
        category.name.toLowerCase() === sourceCategory.name.toLowerCase(),
    );
    if (sameId) {
      map.set(sourceId, sameId.id);
      continue;
    }
    const sameName = destination.categories.find(
      (category) => category.name.toLowerCase() === sourceCategory.name.toLowerCase(),
    );
    if (sameName) {
      map.set(sourceId, sameName.id);
      continue;
    }
    const id =
      destination.categories.some((category) => category.id === sourceId) ||
      added.some((category) => category.id === sourceId)
        ? makeId("cat")
        : sourceId;
    const category: Category = {
      id,
      name: uniqueCategoryName([...destination.categories, ...added], sourceCategory.name),
    };
    if (sourceCategory.wastePercent !== undefined) {
      category.wastePercent = sourceCategory.wastePercent;
    }
    if (sourceCategory.roundingStep !== undefined) {
      category.roundingStep = sourceCategory.roundingStep;
    }
    added.push(category);
    map.set(sourceId, id);
  }
  return { added, map, missing };
}

export function mergeCountTypes(
  destination: Project,
  source: Project,
  referenced: ReadonlySet<string>,
): MergedReferences<CountTypeDef> {
  const added: CountTypeDef[] = [];
  const map = new Map<string, string>();
  let missing = 0;
  for (const sourceId of referenced) {
    const sourceType = source.countTypes.find((countType) => countType.id === sourceId);
    if (!sourceType) {
      missing += 1;
      continue;
    }
    const sameId = destination.countTypes.find(
      (countType) =>
        countType.id === sourceId &&
        countType.label.toLowerCase() === sourceType.label.toLowerCase(),
    );
    if (sameId) {
      map.set(sourceId, sameId.id);
      continue;
    }
    const sameLabel = destination.countTypes.find(
      (countType) => countType.label.toLowerCase() === sourceType.label.toLowerCase(),
    );
    if (sameLabel) {
      map.set(sourceId, sameLabel.id);
      continue;
    }
    const id =
      destination.countTypes.some((countType) => countType.id === sourceId) ||
      added.some((countType) => countType.id === sourceId) ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(sourceId)
        ? makeId("count")
        : sourceId;
    const countType: CountTypeDef = {
      id,
      label: uniqueCountTypeName([...destination.countTypes, ...added], sourceType.label),
      glyph: sourceType.glyph,
    };
    added.push(countType);
    map.set(sourceId, id);
  }
  return { added, map, missing };
}

export function mergeLineTypes(
  destination: Project,
  source: Project,
  referenced: ReadonlySet<string>,
): MergedReferences<LineType> {
  const added: LineType[] = [];
  const map = new Map<string, string>();
  let missing = 0;
  for (const sourceId of referenced) {
    const sourceType = source.lineTypes.find((lineType) => lineType.id === sourceId);
    if (!sourceType) {
      missing += 1;
      continue;
    }
    const sameId = destination.lineTypes.find(
      (lineType) =>
        lineType.id === sourceId && lineType.name.toLowerCase() === sourceType.name.toLowerCase(),
    );
    if (sameId) {
      map.set(sourceId, sameId.id);
      continue;
    }
    const sameName = destination.lineTypes.find(
      (lineType) => lineType.name.toLowerCase() === sourceType.name.toLowerCase(),
    );
    if (sameName) {
      map.set(sourceId, sameName.id);
      continue;
    }
    const id =
      destination.lineTypes.some((lineType) => lineType.id === sourceId) ||
      added.some((lineType) => lineType.id === sourceId)
        ? makeId("line")
        : sourceId;
    const lineType: LineType = {
      id,
      name: uniqueLineTypeName([...destination.lineTypes, ...added], sourceType.name),
      color: sourceType.color,
      widthPt: sourceType.widthPt,
      style: sourceType.style,
    };
    added.push(lineType);
    map.set(sourceId, id);
  }
  return { added, map, missing };
}

export function mergeAssets(
  destination: Project,
  source: Project,
  referenced: ReadonlySet<string>,
): MergedAssets {
  const added: Record<string, ImageAsset> = {};
  const addedList: ImageAsset[] = [];
  const map = new Map<string, string>();
  let missing = 0;
  for (const sourceId of referenced) {
    const sourceAsset = source.assets[sourceId];
    if (!sourceAsset) {
      missing += 1;
      continue;
    }
    const sameId = destination.assets[sourceId];
    if (sameId && sameId.data === sourceAsset.data) {
      map.set(sourceId, sourceId);
      continue;
    }
    const sameData =
      Object.values(destination.assets).find((asset) => asset.data === sourceAsset.data) ??
      addedList.find((asset) => asset.data === sourceAsset.data);
    if (sameData) {
      map.set(sourceId, sameData.id);
      continue;
    }
    const id = sameId || added[sourceId] ? makeId("img") : sourceId;
    const asset: ImageAsset = { ...sourceAsset, id };
    added[id] = asset;
    addedList.push(asset);
    map.set(sourceId, id);
  }
  return { added, map, missing };
}

export function prepareDocument(
  sourceDocument: DocumentRef,
  destination: Project,
  actualPageCount: number,
  selectedLocalPages: readonly number[],
  override: { path?: string | null; sha256?: string; sizeBytes?: number } | undefined,
): DocumentRef {
  const copy: DocumentRef = {
    ...sourceDocument,
    id: makeId("doc"),
    name: uniqueDocumentName(destination, sourceDocument.name),
    relativePath: null,
    copiedFrom: undefined,
    // The destination has not copied the source project's managed drawing yet.
    // Treat the imported reference as a normal path reference until the user
    // explicitly copies it into the destination project.
    storage: "reference",
    originalPath: undefined,
    originalSha256: undefined,
  };
  if (sourceDocument.kind === "template") {
    copy.path = null;
    copy.relativePath = null;
    copy.sha256 = "";
    copy.pageCount = 1;
    copy.sizeBytes = 0;
    copy.excludedPages = undefined;
    if (sourceDocument.template) {
      copy.template = {
        ...sourceDocument.template,
        fields: { ...sourceDocument.template.fields },
      };
    }
    return copy;
  }
  copy.pageCount = actualPageCount;
  copy.excludedPages = excludedSourcePages(actualPageCount, selectedLocalPages);
  if (override?.path !== undefined) copy.path = override.path;
  if (override?.sha256 !== undefined) copy.sha256 = override.sha256;
  if (override?.sizeBytes !== undefined) copy.sizeBytes = override.sizeBytes;
  if (copy.source) {
    copy.source = {
      ...copy.source,
      dpi: [copy.source.dpi[0], copy.source.dpi[1]] as [number, number],
    };
  }
  return copy;
}

export function clonePageState(
  state: PageState | undefined,
  documentRef: DocumentRef,
  localPage: number,
  dropOcr: boolean,
): PageState | undefined {
  if (!state) return undefined;
  const copy: PageState = {};
  if (state.calibration) {
    copy.calibration = structuredClone(state.calibration);
    copy.calibration.id = makeId("cal");
    if (state.scaleLocked) copy.scaleLocked = true;
  }
  if (state.name) copy.name = state.name;
  if (state.building) copy.building = state.building;
  if (state.floor) copy.floor = state.floor;
  if (
    state.ocr &&
    !dropOcr &&
    state.ocr.documentSha256 === documentRef.sha256 &&
    state.ocr.sourcePage === localPage
  ) {
    copy.ocr = structuredClone(state.ocr);
  }
  return Object.keys(copy).length ? copy : undefined;
}

/**
 * One destination layer per source layer identity. The same instance is reused
 * for every imported page; it is never re-created per page and never matched by
 * display name.
 */
export function createImportedLayer(sourceLayer: Layer, homePageId: PageId): Layer {
  return {
    id: makeId("layer"),
    name: sourceLayer.name,
    kind: sourceLayer.kind,
    visible: sourceLayer.visible,
    locked: sourceLayer.locked,
    opacity: sourceLayer.opacity,
    color: sourceLayer.color,
    items: [],
    homePageId,
  };
}

/** Copies one page-scoped visibility/lock override onto the shared layer. */
export function applyImportedLayerPageState(
  layer: Layer,
  sourceLayer: Layer,
  sourcePageId: PageId,
  newPageId: PageId,
): void {
  const override = sourceLayer.pageState?.[sourcePageId];
  if (!override) return;
  const pageState: { visible?: boolean; locked?: boolean } = {};
  if (override.visible !== undefined && override.visible !== layer.visible) {
    pageState.visible = override.visible;
  }
  if (override.locked !== undefined && override.locked !== layer.locked) {
    pageState.locked = override.locked;
  }
  if (Object.keys(pageState).length) {
    layer.pageState ??= {};
    layer.pageState[newPageId] = pageState;
  }
}

export function cloneImportedItem(
  item: MarkupItem,
  pageId: PageId,
  categoryMap: ReadonlyMap<string, string>,
  countTypeMap: ReadonlyMap<string, string>,
  lineTypeMap: ReadonlyMap<string, string>,
  assetMap: ReadonlyMap<string, string>,
  fallbackCategoryId: string,
): MarkupItem | null {
  const copy = structuredClone(item);
  copy.id = makeId("item");
  copy.pageId = pageId;
  if (copy.categoryId) {
    copy.categoryId = categoryMap.get(copy.categoryId) ?? fallbackCategoryId;
  }
  if (copy.countType) {
    copy.countType = countTypeMap.get(copy.countType) ?? "other";
  }
  if (copy.lineTypeId) {
    const mapped = lineTypeMap.get(copy.lineTypeId);
    if (mapped) copy.lineTypeId = mapped;
    else delete copy.lineTypeId;
  }
  if (copy.image) {
    const mapped = assetMap.get(copy.image.assetId);
    if (!mapped) return null;
    copy.image = { ...copy.image, assetId: mapped };
  }
  return copy;
}

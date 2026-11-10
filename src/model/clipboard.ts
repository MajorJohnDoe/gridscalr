import {
  addItem,
  cloneItem,
  ensureActiveLayer,
  itemIsLocked,
  layerKindForItem,
  layerLockedOnPage,
  layerVisibleOnPage,
} from "./layers";
import { resolveSelection } from "./selection";
import type { Layer, MarkupItem, PageId, Project, SelectionRef } from "./types";

export interface ClipboardItem {
  item: MarkupItem;
  sourceLayerId: string;
}

export interface ClipboardPayload {
  projectId: string;
  pageId: PageId;
  items: ClipboardItem[];
  capturedAt: string;
}

let clipboard: ClipboardPayload | null = null;

export function copyItems(project: Project, refs: SelectionRef[]): number {
  const resolved = resolveSelection(project, refs);
  if (!resolved.length) return 0;
  clipboard = {
    projectId: project.id,
    pageId: resolved[0].item.pageId,
    items: resolved.map(({ item, layer }) => ({
      sourceLayerId: layer.id,
      item: {
        ...item,
        points: item.points.map((point) => ({ ...point })),
        textOffset: item.textOffset ? { ...item.textOffset } : undefined,
        labelOffset: item.labelOffset ? { ...item.labelOffset } : undefined,
        labelAnchor: item.labelAnchor ? { ...item.labelAnchor } : undefined,
        scale: item.scale ? { ...item.scale } : item.scale,
      },
    })),
    capturedAt: new Date().toISOString(),
  };
  return resolved.length;
}

export function clipboardCount(): number {
  return clipboard?.items.length ?? 0;
}

export function hasClipboard(project?: Project): boolean {
  return Boolean(clipboard && (!project || clipboard.projectId === project.id));
}

export function clearClipboard(): void {
  clipboard = null;
}

function targetLayerFor(
  project: Project,
  sourceLayerId: string,
  item: MarkupItem,
  pageId: PageId,
): Layer {
  const kind = layerKindForItem(item.kind);
  const source = project.layers.find((layer) => layer.id === sourceLayerId);
  if (
    source &&
    source.kind === kind &&
    layerVisibleOnPage(source, pageId) &&
    !layerLockedOnPage(source, pageId)
  ) {
    return source;
  }

  const active = project.layers.find(
    (layer) =>
      layer.id === project.activeLayerId &&
      layer.kind === kind &&
      layerVisibleOnPage(layer, pageId) &&
      !layerLockedOnPage(layer, pageId),
  );
  if (active) return active;

  const editable = project.layers.find(
    (layer) =>
      layer.kind === kind && layerVisibleOnPage(layer, pageId) && !layerLockedOnPage(layer, pageId),
  );
  if (editable) {
    project.activeLayerId = editable.id;
    return editable;
  }
  return ensureActiveLayer(project, kind, pageId);
}

export function pasteItems(project: Project, pageId: PageId): SelectionRef[] {
  if (!clipboard || clipboard.projectId !== project.id) return [];
  const refs: SelectionRef[] = [];
  for (const entry of clipboard.items) {
    const layer = targetLayerFor(project, entry.sourceLayerId, entry.item, pageId);
    const offset = entry.item.pageId === pageId ? 12 : 0;
    const copy = cloneItem(entry.item, offset, pageId);
    addItem(project, layer.id, copy);
    refs.push({ layerId: layer.id, itemId: copy.id });
  }
  return refs;
}

export function duplicateItems(
  project: Project,
  refs: SelectionRef[],
  offset = 12,
): SelectionRef[] {
  const resolved = resolveSelection(project, refs);
  const created: SelectionRef[] = [];
  for (const { layer, item } of resolved) {
    if (itemIsLocked(item, layer)) continue;
    const target = targetLayerFor(project, layer.id, item, item.pageId);
    const copy = cloneItem(item, offset, item.pageId);
    addItem(project, target.id, copy);
    created.push({ layerId: target.id, itemId: copy.id });
  }
  return created;
}

export function getClipboardForTests(): ClipboardPayload | null {
  return clipboard;
}

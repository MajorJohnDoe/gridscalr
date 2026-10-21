import {
  addItem,
  cloneItem,
  ensureActiveLayer,
  itemIsLocked,
  layerKindForItem,
} from "./layers";
import { resolveSelection } from "./selection";
import type { Layer, MarkupItem, Project, SelectionRef } from "./types";

export interface ClipboardItem {
  item: MarkupItem;
  sourceLayerId: string;
}

export interface ClipboardPayload {
  projectId: string;
  page: number;
  items: ClipboardItem[];
  capturedAt: string;
}

let clipboard: ClipboardPayload | null = null;

export function copyItems(project: Project, refs: SelectionRef[]): number {
  const resolved = resolveSelection(project, refs);
  if (!resolved.length) return 0;
  clipboard = {
    projectId: project.id,
    page: resolved[0].item.page,
    items: resolved.map(({ item, layer }) => ({
      sourceLayerId: layer.id,
      item: {
        ...item,
        points: item.points.map((point) => ({ ...point })),
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

function targetLayerFor(project: Project, sourceLayerId: string, item: MarkupItem): Layer {
  const kind = layerKindForItem(item.kind);
  const source = project.layers.find((layer) => layer.id === sourceLayerId);
  if (source && source.kind === kind && !source.locked && source.visible) return source;

  const active = project.layers.find(
    (layer) =>
      layer.id === project.activeLayerId &&
      layer.kind === kind &&
      layer.visible &&
      !layer.locked,
  );
  if (active) return active;

  const editable = project.layers.find(
    (layer) => layer.kind === kind && layer.visible && !layer.locked,
  );
  if (editable) {
    project.activeLayerId = editable.id;
    return editable;
  }
  return ensureActiveLayer(project, kind);
}

export function pasteItems(project: Project, page: number): SelectionRef[] {
  if (!clipboard || clipboard.projectId !== project.id) return [];
  const refs: SelectionRef[] = [];
  for (const entry of clipboard.items) {
    const layer = targetLayerFor(project, entry.sourceLayerId, entry.item);
    const offset = entry.item.page === page ? 12 : 0;
    const copy = cloneItem(entry.item, offset, page);
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
    const target = targetLayerFor(project, layer.id, item);
    const copy = cloneItem(item, offset, item.page);
    addItem(project, target.id, copy);
    created.push({ layerId: target.id, itemId: copy.id });
  }
  return created;
}

export function getClipboardForTests(): ClipboardPayload | null {
  return clipboard;
}

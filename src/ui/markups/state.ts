import { defaultMarkupsViewSettings, type MarkupsViewSettings } from "../../model/markups";
import type { MarkupsColumnId, SelectionRef } from "../../model/types";

const PREFS_KEY = "gridscalr.ui.markups.v1";
const ACTIVE_VIEW_KEY = "gridscalr.ui.markups.active-view.v1";
const PINNED_VIEW_KEY = "gridscalr.ui.markups.pinned-views.v1";
export const DEFAULT_HEIGHT = 320;
const MIN_HEIGHT = 140;

export const COLUMN_WIDTHS: Record<MarkupsColumnId, number> = {
  name: 14,
  type: 6,
  page: 5,
  layer: 11,
  value: 6,
  countType: 8,
  category: 8,
  room: 6,
  status: 7,
  created: 10,
  modified: 10,
  visible: 5,
  locked: 4,
};

interface MarkupsPreferences {
  open: boolean;
  height: number;
}

function clampHeight(value: number): number {
  const max = Math.max(MIN_HEIGHT, window.innerHeight * 0.62);
  return Math.max(MIN_HEIGHT, Math.min(max, Math.round(value)));
}

function loadPreferences(): MarkupsPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { open: false, height: DEFAULT_HEIGHT };
    const parsed = JSON.parse(raw) as Partial<MarkupsPreferences>;
    return {
      open: parsed.open === true,
      height: clampHeight(Number(parsed.height) || DEFAULT_HEIGHT),
    };
  } catch {
    return { open: false, height: DEFAULT_HEIGHT };
  }
}

const initialPreferences = loadPreferences();

function savePreferences(): void {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ open: markupsState.open, height: markupsState.height }),
    );
  } catch {
    // The panel layout is a convenience only.
  }
}

function activeViewStorageKey(projectId: string): string {
  return `${ACTIVE_VIEW_KEY}.${projectId}`;
}

function pinnedViewStorageKey(projectId: string): string {
  return `${PINNED_VIEW_KEY}.${projectId}`;
}

function loadStringList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function saveStringList(key: string, values: readonly string[]): void {
  try {
    if (values.length) localStorage.setItem(key, JSON.stringify(values));
    else localStorage.removeItem(key);
  } catch {
    // Favourite views are a local convenience; saved views live in the project.
  }
}

function loadActiveViewId(projectId: string): string | null {
  try {
    return localStorage.getItem(activeViewStorageKey(projectId));
  } catch {
    return null;
  }
}

function saveActiveViewId(projectId: string | null, viewId: string | null): void {
  if (!projectId) return;
  try {
    if (viewId) localStorage.setItem(activeViewStorageKey(projectId), viewId);
    else localStorage.removeItem(activeViewStorageKey(projectId));
  } catch {
    // The active view is a session convenience; saved views live in the project.
  }
}

export const markupsState = {
  rangeAnchor: null as SelectionRef | null,
  open: initialPreferences.open,
  height: initialPreferences.height,
  resizerBound: false,
  currentProjectId: null as string | null,
  activeViewId: null as string | null,
  pinnedViewIds: [] as string[],
  settings: defaultMarkupsViewSettings() as MarkupsViewSettings,
  viewDirty: false,
  collapsedGroups: new Set<string>(),
  viewDirtyEl: null as HTMLElement | null,
  saveViewBtn: null as HTMLButtonElement | null,
  pinViewBtn: null as HTMLButtonElement | null,
};

export function isMarkupsOpen(): boolean {
  return markupsState.open;
}

export function setMarkupsOpen(open: boolean): void {
  markupsState.open = open;
  savePreferences();
}

export function toggleMarkupsPanel(): void {
  setMarkupsOpen(!markupsState.open);
}

export function loadPinnedViewIds(projectId: string): string[] {
  return loadStringList(pinnedViewStorageKey(projectId));
}

export function savePinnedViewIds(projectId: string | null, ids: readonly string[]): void {
  if (!projectId) return;
  saveStringList(pinnedViewStorageKey(projectId), ids);
}

export { loadActiveViewId, saveActiveViewId, clampHeight, savePreferences };

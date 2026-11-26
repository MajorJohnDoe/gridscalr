import { canonicalColor } from "../color";
import type { Project } from "../types";

/** Renames a layer, ignoring empty names. Returns false when nothing changed. */
export function renameLayer(project: Project, layerId: string, name: string): boolean {
  const layer = project.layers.find((entry) => entry.id === layerId);
  const next = name.trim();
  if (!layer || !next) return false;
  layer.name = next;
  return true;
}

/**
 * Sets the layer colour and applies it to the layer's items in one step, so the
 * canvas and the exported drawing share the same colour.
 */
export function setLayerColor(project: Project, layerId: string, color: string): boolean {
  const layer = project.layers.find((entry) => entry.id === layerId);
  const next = canonicalColor(color);
  if (!layer || !next) return false;
  layer.color = next;
  for (const item of layer.items) item.color = next;
  return true;
}

/** Sets the layer opacity, clamped to the 0–1 range used by the project file. */
export function setLayerOpacity(project: Project, layerId: string, opacity: number): boolean {
  const layer = project.layers.find((entry) => entry.id === layerId);
  if (!layer || !Number.isFinite(opacity)) return false;
  layer.opacity = Math.max(0, Math.min(1, opacity));
  return true;
}

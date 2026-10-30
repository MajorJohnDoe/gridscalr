import { makeId } from "../../model/calibration";
import { countQuantityOf, COUNT_GLYPH_LABELS, COUNT_GLYPHS } from "../../model/countSymbols";
import type { CountGlyph, CountType, CountTypeDef, MarkupItem, Project } from "../../model/types";

export const COUNT_TYPE_NAME_MAX_LENGTH = 60;
export const COUNT_TYPE_ID_MAX_LENGTH = 80;

export const DEFAULT_COUNT_TYPES: readonly CountTypeDef[] = [
  { id: "door", label: "Door", glyph: "door" },
  { id: "window", label: "Window", glyph: "window" },
  { id: "radiator", label: "Radiator", glyph: "radiator" },
  { id: "fixture", label: "Fixture", glyph: "fixture" },
  { id: "other", label: "Other", glyph: "other" },
];

export type RemoveCountTypeResult =
  { removed: true; reassigned: number } | { removed: false; reason: "missing" | "builtin" };

export function defaultCountTypes(): CountTypeDef[] {
  return DEFAULT_COUNT_TYPES.map((entry) => ({ ...entry }));
}

export function isBuiltInCountType(id: string): boolean {
  return DEFAULT_COUNT_TYPES.some((entry) => entry.id === id);
}

export function countGlyphLabel(glyph: CountGlyph): string {
  return COUNT_GLYPH_LABELS[glyph];
}

export function isCountGlyph(value: unknown): value is CountGlyph {
  return typeof value === "string" && (COUNT_GLYPHS as string[]).includes(value);
}

export function normalizeCountTypeName(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, COUNT_TYPE_NAME_MAX_LENGTH);
}

function uniqueCountTypeName(
  types: readonly CountTypeDef[],
  name: string,
  exceptId?: string,
): string {
  const used = new Set(
    types.filter((entry) => entry.id !== exceptId).map((entry) => entry.label.toLowerCase()),
  );
  if (!used.has(name.toLowerCase())) return name;
  let index = 2;
  while (used.has(`${name} ${index}`.toLowerCase())) index += 1;
  return `${name} ${index}`;
}

function normalizeCountTypeId(value: unknown): string {
  if (typeof value !== "string") return "";
  const id = value.trim().slice(0, COUNT_TYPE_ID_MAX_LENGTH);
  return /^[A-Za-z0-9_-]+$/.test(id) ? id : "";
}

/**
 * Repairs a project count-type list. Missing or invalid lists fall back to the
 * built-ins, ids are unique, labels are unique case-insensitively and `other`
 * always exists as the fallback for unknown items.
 */
export function normalizeCountTypes(value: unknown): CountTypeDef[] {
  const types: CountTypeDef[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== "object" || entry === null) continue;
      const raw = entry as Partial<CountTypeDef>;
      const id = normalizeCountTypeId(raw.id);
      const label = typeof raw.label === "string" ? normalizeCountTypeName(raw.label) : "";
      if (!id || !label || types.some((type) => type.id === id)) continue;
      types.push({
        id,
        label: uniqueCountTypeName(types, label),
        glyph: isCountGlyph(raw.glyph) ? raw.glyph : "other",
      });
    }
  }
  if (!types.length) return defaultCountTypes();
  if (!types.some((entry) => entry.id === "other")) {
    types.push({ id: "other", label: "Other", glyph: "other" });
  }
  return types;
}

export function countTypeFor(project: Project, id: CountType | undefined): CountTypeDef {
  const types = project.countTypes ?? DEFAULT_COUNT_TYPES;
  return (
    types.find((entry) => entry.id === id) ??
    types.find((entry) => entry.id === "other") ??
    DEFAULT_COUNT_TYPES[DEFAULT_COUNT_TYPES.length - 1]
  );
}

export function countTypeLabel(project: Project, id: CountType | undefined): string {
  return countTypeFor(project, id).label;
}

export function countTypeGlyph(project: Project, id: CountType | undefined): CountGlyph {
  return countTypeFor(project, id).glyph;
}

export function countTypeItemCount(project: Project, id: CountType): number {
  let count = 0;
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (item.kind === "count" && (item.countType ?? "other") === id) count += 1;
    }
  }
  return count;
}

export function countTypeNameError(
  types: readonly CountTypeDef[],
  value: string,
  exceptId?: string,
): string | null {
  const name = normalizeCountTypeName(value);
  if (!name) return "Enter a count-type name.";
  if (name.length > COUNT_TYPE_NAME_MAX_LENGTH) {
    return `Use at most ${COUNT_TYPE_NAME_MAX_LENGTH} characters.`;
  }
  if (
    types.some((entry) => entry.id !== exceptId && entry.label.toLowerCase() === name.toLowerCase())
  ) {
    return "A count type with that name already exists.";
  }
  return null;
}

export function addCountType(
  project: Project,
  name: string,
  glyph: CountGlyph = "other",
): CountTypeDef | null {
  if (countTypeNameError(project.countTypes, name)) return null;
  let id = makeId("count");
  while (project.countTypes.some((entry) => entry.id === id)) id = makeId("count");
  const type: CountTypeDef = {
    id,
    label: uniqueCountTypeName(project.countTypes, normalizeCountTypeName(name)),
    glyph: isCountGlyph(glyph) ? glyph : "other",
  };
  project.countTypes.push(type);
  return type;
}

export function renameCountType(project: Project, id: CountType, name: string): boolean {
  const type = project.countTypes.find((entry) => entry.id === id);
  if (!type || countTypeNameError(project.countTypes, name, id)) return false;
  type.label = normalizeCountTypeName(name);
  return true;
}

/** Removes a custom type and reassigns its counts to `other` in one mutation. */
export function removeCountType(project: Project, id: CountType): RemoveCountTypeResult {
  const index = project.countTypes.findIndex((entry) => entry.id === id);
  if (index < 0) return { removed: false, reason: "missing" };
  if (isBuiltInCountType(id) || id === "other") return { removed: false, reason: "builtin" };
  project.countTypes.splice(index, 1);
  let reassigned = 0;
  for (const layer of project.layers) {
    for (const item of layer.items) {
      if (item.kind !== "count" || item.countType !== id) continue;
      item.countType = "other";
      reassigned += 1;
    }
  }
  return { removed: true, reassigned };
}

export function countQuantityLabel(item: MarkupItem): string {
  return `${countQuantityOf(item)} pcs`;
}

export { countQuantityOf };

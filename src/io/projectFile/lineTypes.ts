import { defaultLineTypes } from "../../model/lineTypes";
import type { LineType } from "../../model/types";

export function normalizeLineTypes(rawValue: unknown): LineType[] {
  const defaults = defaultLineTypes();
  if (!Array.isArray(rawValue)) return defaults;
  const result: LineType[] = [];
  const seen = new Set<string>();
  for (const entry of rawValue) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Partial<LineType>;
    const id =
      typeof source.id === "string" && source.id.trim() ? source.id.trim().slice(0, 60) : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      name:
        typeof source.name === "string" && source.name.trim()
          ? source.name.trim().slice(0, 80)
          : id,
      color:
        typeof source.color === "string" && /^#[0-9a-f]{6}$/i.test(source.color)
          ? source.color
          : "#4cc9f0",
      widthPt:
        typeof source.widthPt === "number" && Number.isFinite(source.widthPt)
          ? Math.max(0.3, Math.min(20, source.widthPt))
          : 2,
      style: source.style === "dashed" ? "dashed" : "solid",
    });
  }
  return result.length ? result : defaults;
}

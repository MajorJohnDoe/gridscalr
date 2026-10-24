export const DEFAULT_STAMP_PRESETS = [
  "APPROVED",
  "NOT APPROVED",
  "FOR INFORMATION",
  "INSPECTED",
  "REVISED",
] as const;

const STAMP_PRESET_MAX = 32;
const STAMP_PRESET_LENGTH = 40;

export function normalizeStampPresets(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_STAMP_PRESETS];
  const seen = new Set<string>();
  const presets: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const text = entry.replace(/\s+/g, " ").trim().slice(0, STAMP_PRESET_LENGTH);
    if (!text) continue;
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    presets.push(text);
    if (presets.length >= STAMP_PRESET_MAX) break;
  }
  return presets;
}

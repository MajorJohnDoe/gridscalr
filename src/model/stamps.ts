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


const STATUS_COLORS: Record<string, string> = {
  approved: "#35c2a1",
  godkänd: "#35c2a1",
  "not approved": "#f26d6d",
  "ej godkänd": "#f26d6d",
  "for information": "#4cc9f0",
  "för kännedom": "#4cc9f0",
  inspected: "#a78bfa",
  besiktigad: "#a78bfa",
  revised: "#f2a93b",
  reviderad: "#f2a93b",
};

/** Status colour for a stamp label, keeping a custom item's existing colour. */
export function stampStatusColor(text: string | undefined, fallback: string): string {
  const key = (text ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  return STATUS_COLORS[key] ?? fallback;
}

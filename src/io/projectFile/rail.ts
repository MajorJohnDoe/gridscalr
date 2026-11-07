import type { RailRow } from "../../model/types";

export function normalizeRailRows(rawValue: unknown): RailRow[] | undefined {
  if (!Array.isArray(rawValue)) return undefined;
  const rows: RailRow[] = [];
  for (const entry of rawValue.slice(0, 16)) {
    if (!entry || typeof entry !== "object") continue;
    const source = entry as Partial<RailRow>;
    const label = typeof source.label === "string" ? source.label.trim().slice(0, 20) : "";
    if (!label) continue;
    rows.push({
      id:
        typeof source.id === "string" && source.id
          ? source.id.slice(0, 40)
          : `row_${rows.length + 1}`,
      label,
      legend:
        typeof source.legend === "string" && source.legend.trim()
          ? source.legend.trim().slice(0, 80)
          : undefined,
    });
  }
  return rows.length ? rows : undefined;
}

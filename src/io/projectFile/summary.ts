import { defaultSummarySettings, isSummaryCardId } from "../../model/summary";
import type { SummarySettings } from "../../model/types";

/**
 * Summary-card normalization. Unknown or repeated cards are reported; the four
 * known cards always exist so the panel never has to invent a default.
 */
export function normalizeSummarySettings(
  value: unknown,
  report?: (code: string) => void,
): SummarySettings {
  const settings = defaultSummarySettings();
  const byId = new Map(settings.cards.map((card) => [card.id, card]));
  const raw =
    typeof value === "object" && value !== null ? (value as { cards?: unknown }).cards : undefined;
  if (!Array.isArray(raw)) return settings;
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      report?.("droppedSummaryCard");
      continue;
    }
    const card = entry as { id?: unknown; visible?: unknown };
    if (!isSummaryCardId(card.id)) {
      report?.("droppedSummaryCard");
      continue;
    }
    if (seen.has(card.id)) {
      report?.("repairedSummaryCard");
      continue;
    }
    seen.add(card.id);
    const target = byId.get(card.id);
    if (target) target.visible = card.visible !== false;
  }
  return settings;
}

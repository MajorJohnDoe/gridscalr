import type {
  CategorySummaryRole,
  CountSummaryRole,
  SummaryCardId,
  SummarySettings,
} from "./types";

/**
 * Pure summary-settings catalogue. The four cards are the Slice 1 set; later
 * slices append ids without changing the stored shape, because cards are keyed
 * by id rather than array position.
 */

export const SUMMARY_CARD_IDS: readonly SummaryCardId[] = ["rooms", "area", "wallLength", "doors"];

export function isSummaryCardId(value: unknown): value is SummaryCardId {
  return typeof value === "string" && (SUMMARY_CARD_IDS as readonly string[]).includes(value);
}

export const CATEGORY_SUMMARY_ROLES: readonly CategorySummaryRole[] = [
  "wall",
  "floor",
  "ceiling",
  "roof",
  "other",
];

export const COUNT_SUMMARY_ROLES: readonly CountSummaryRole[] = [
  "door",
  "window",
  "fixture",
  "other",
];

export function isCategorySummaryRole(value: unknown): value is CategorySummaryRole {
  return typeof value === "string" && (CATEGORY_SUMMARY_ROLES as readonly string[]).includes(value);
}

export function isCountSummaryRole(value: unknown): value is CountSummaryRole {
  return typeof value === "string" && (COUNT_SUMMARY_ROLES as readonly string[]).includes(value);
}

/** All four cards visible. Never shared between projects. */
export function defaultSummarySettings(): SummarySettings {
  return {
    cards: SUMMARY_CARD_IDS.map((id) => ({ id, visible: true })),
  };
}

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

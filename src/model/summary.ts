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

/**
 * Stable identifier creation shared by every persistent entity. The module is
 * deliberately dependency-free so `pages.ts` and `calibration.ts` can both use
 * it without importing each other.
 */
export function makeId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

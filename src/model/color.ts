/**
 * Canonical project colours. The project file and in-memory items use
 * lowercase `#rrggbb` strings; older or imported values are repaired on load.
 * Alpha belongs in the item's opacity field, not in the colour string.
 */
export const DEFAULT_COLOR = "#f2a93b";

const HEX_SHORT = /^#([0-9a-f]{3})$/;
const HEX_SHORT_ALPHA = /^#([0-9a-f]{3})[0-9a-f]$/;
const HEX_FULL = /^#[0-9a-f]{6}$/;
const HEX_ALPHA = /^#([0-9a-f]{6})[0-9a-f]{2}$/;
const RGB_VALUE =
  /^rgba?\(\s*([0-9]{1,3})\s*[,\s]\s*([0-9]{1,3})\s*[,\s]\s*([0-9]{1,3})(?:\s*[,/]\s*[0-9.]+%?)?\s*\)$/;

/** Returns a canonical lowercase `#rrggbb` string, or null when invalid. */
export function canonicalColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const input = value.trim().toLowerCase();
  if (!input) return null;

  const short = HEX_SHORT.exec(input) ?? HEX_SHORT_ALPHA.exec(input);
  if (short) {
    return `#${short[1]
      .split("")
      .map((part) => part + part)
      .join("")}`;
  }
  if (HEX_FULL.test(input)) return input;

  const alpha = HEX_ALPHA.exec(input);
  if (alpha) return `#${alpha[1]}`;

  const rgb = RGB_VALUE.exec(input);
  if (rgb) {
    const parts = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    if (parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
      return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
    }
  }

  return null;
}

/** True when the value is already a canonical project colour. */
export function isCanonicalColor(value: unknown): value is string {
  return typeof value === "string" && HEX_FULL.test(value);
}

/**
 * Repairs a colour string without ever producing a black fallback. The
 * fallback is canonicalized too, then the neutral app default is used.
 */
export function normalizeColor(value: unknown, fallback: string = DEFAULT_COLOR): string {
  return canonicalColor(value) ?? canonicalColor(fallback) ?? DEFAULT_COLOR;
}

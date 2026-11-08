import { normalizeColor } from "../model/color";

/**
 * Sets a native colour input to a valid #rrggbb value. Browsers silently show
 * black for invalid values, so every colour input goes through this helper.
 */
export function setColorInput(input: HTMLInputElement, value: unknown, fallback: string): string {
  const color = normalizeColor(value, fallback);
  input.value = color;
  return color;
}

/** Reads a colour input as a canonical value, never as black-by-accident. */
export function colorInputValue(input: HTMLInputElement, fallback: string): string {
  return normalizeColor(input.value, fallback);
}

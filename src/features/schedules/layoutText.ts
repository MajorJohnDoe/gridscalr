/**
 * Text measurement helpers for the shared schedule table layout. The measure
 * function is injected by the caller: canvas `measureText` on screen, the
 * embedded PDF font on export, a canvas context or a conservative estimate in
 * the inspector.
 */

export type MeasureText = (text: string, size: number, bold: boolean) => number;

export function measureWidth(
  measure: MeasureText,
  text: string,
  size: number,
  bold: boolean,
): number {
  return text ? Math.max(0, measure(text, size, bold)) : 0;
}

/**
 * Ellipsize to the widest prefix that fits. The suffix is plain ASCII so it
 * renders in both the canvas font stack and a subset PDF font.
 */
export function ellipsizeText(
  text: string,
  maxWidth: number,
  size: number,
  bold: boolean,
  measure: MeasureText,
): string {
  if (!text || maxWidth <= 0) return "";
  if (measureWidth(measure, text, size, bold) <= maxWidth) return text;
  const suffix = "...";
  const suffixWidth = measureWidth(measure, suffix, size, bold);
  if (suffixWidth > maxWidth) return "";
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = text.slice(0, mid) + suffix;
    if (measureWidth(measure, candidate, size, bold) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low > 0 ? text.slice(0, low) + suffix : "";
}

/** Conservative fallback used where no canvas or font is available. */
export function estimateTextWidth(text: string, size: number, bold: boolean): number {
  return text.length * size * (bold ? 0.58 : 0.54);
}

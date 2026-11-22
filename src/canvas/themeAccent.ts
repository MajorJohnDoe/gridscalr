/**
 * Palette reader for canvas chrome overlays (selection, handles, marquee and
 * crop). The rendered drawing content keeps its own colours; only the editor
 * furniture follows the active theme accent.
 *
 * `getComputedStyle` is consulted once per palette, not per frame, so a large
 * selection that repaints while dragging stays cheap.
 */

const FALLBACK_ACCENT = "#35c2a1";
const FALLBACK_ON_ACCENT = "#101619";

let cached: { key: string; accent: string; onAccent: string } | null = null;

function themeKey(): string {
  if (typeof document === "undefined") return "";
  const root = document.documentElement;
  return `${root.getAttribute("data-theme") ?? ""}:${root.style.colorScheme}`;
}

function readToken(computed: CSSStyleDeclaration | null, token: string, fallback: string): string {
  const value = computed?.getPropertyValue(token).trim();
  return value || fallback;
}

/** Accent pair used by the interaction and crop renderers. */
export function canvasAccent(): { accent: string; onAccent: string } {
  const key = themeKey();
  if (cached && cached.key === key) return cached;
  const root = typeof document === "undefined" ? null : document.documentElement;
  const computed = root ? window.getComputedStyle(root) : null;
  cached = {
    key,
    accent: readToken(computed, "--jade", FALLBACK_ACCENT),
    onAccent: readToken(computed, "--on-accent", FALLBACK_ON_ACCENT),
  };
  return cached;
}

/** Clears the palette cache; a theme switch and the tests use it. */
export function resetCanvasAccent(): void {
  cached = null;
}

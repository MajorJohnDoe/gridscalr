/**
 * Pure rules behind `npm run check:themes`.
 *
 * The palettes are a contract: every theme must define each required token and
 * keep the documented text/background pairs above their WCAG AA ratio. The rules
 * live here so `tests/theme.test.ts` can prove both the palette contract and the
 * component-level token usage without importing the checking script itself.
 */

/** Every shipped palette, including the default that `:root` carries. */
export const THEMES = ["medium-grey", "light-green", "dark-grey", "jade", "navy"];

/** Tokens every palette must define. */
export const REQUIRED = [
  "--bg",
  "--bg-deep",
  "--panel",
  "--panel-raised",
  "--text",
  "--text-strong",
  "--muted",
  "--jade",
  "--jade-bright",
  "--danger",
  "--warning",
  "--border",
  "--markups-bg",
  "--markups-head",
  "--markups-toolbar",
  "--statusbar-bg",
  "--surface-tab",
  "--surface-sunken",
  "--surface-inset",
  "--surface-inset-foot",
  "--chrome-topbar",
  "--chrome-rail",
];

/** Solid-hex foreground/background pairs and the minimum contrast ratio. */
const PAIRS = [
  ["--text", "--bg", 4.5],
  ["--text-strong", "--bg", 4.5],
  ["--text", "--panel", 4.5],
  ["--muted", "--bg", 4.5],
  ["--jade-bright", "--bg", 3],
  ["--warning", "--bg", 3],
  ["--danger", "--bg", 3],
];

/** Parses `--token: value;` declarations from a stylesheet. */
export function parseTokens(css) {
  const tokens = new Map();
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

function rgbOf(value) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (!hex) return null;
  const full =
    hex[1].length === 3
      ? hex[1]
          .split("")
          .map((part) => part + part)
          .join("")
      : hex[1];
  const int = Number.parseInt(full, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
}

function luminance([r, g, b]) {
  const channel = (value) =>
    value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * Returns the problems found in one palette stylesheet: a missing required
 * token, a contrast pair that is not a solid hex pair, or a pair below its
 * minimum ratio. An empty list means the palette passes.
 */
export function checkThemeTokens(theme, css) {
  const tokens = parseTokens(css);
  const issues = [];
  const missing = REQUIRED.filter((token) => !tokens.has(token));
  if (missing.length) issues.push(`${theme}: missing ${missing.join(", ")}`);

  for (const [foreground, background, minimum] of PAIRS) {
    const fg = tokens.get(foreground);
    const bg = tokens.get(background);
    if (!fg || !bg) continue;
    const fgRgb = rgbOf(fg);
    const bgRgb = rgbOf(bg);
    if (!fgRgb || !bgRgb) {
      issues.push(`${theme}: ${foreground}/${background} is not a solid hex pair`);
      continue;
    }
    const ratio = contrast(fgRgb, bgRgb);
    if (ratio + 0.005 < minimum) {
      issues.push(
        `${theme}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1 (needs ${minimum}:1)`,
      );
    }
  }
  return issues;
}

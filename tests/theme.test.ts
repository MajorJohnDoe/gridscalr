// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canvasAccent, resetCanvasAccent } from "../src/canvas/themeAccent";
import { loadAppPreferences } from "../src/io/appPreferences";
import { THEME_OPTIONS, applyTheme, resolveTheme, setThemePreference } from "../src/theme/theme";
import { THEMES, checkThemeTokens, parseTokens } from "../scripts/theme-token-rules.mjs";

const root = resolve(__dirname, "..");

function readCss(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function declarationBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\n${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`Missing CSS rule for ${selector}`);
  return match[1];
}

function mockSystem(light: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: light,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
});

describe("themes", () => {
  it("applies a selected palette without a restart", () => {
    expect(applyTheme("light-green")).toBe("light-green");
    expect(document.documentElement.dataset.theme).toBe("light-green");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("maps System to medium grey in dark mode and light-green in light mode", () => {
    mockSystem(false);
    expect(resolveTheme("system")).toBe("medium-grey");
    mockSystem(true);
    expect(resolveTheme("system")).toBe("light-green");
  });

  it("applies the medium grey palette as a dark theme", () => {
    expect(applyTheme("medium-grey")).toBe("medium-grey");
    expect(document.documentElement.dataset.theme).toBe("medium-grey");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("persists the selected preference", () => {
    setThemePreference("navy");
    expect(loadAppPreferences().theme).toBe("navy");
    expect(document.documentElement.dataset.theme).toBe("navy");
  });

  it("offers every shipped palette in the theme picker", () => {
    const offered = THEME_OPTIONS.filter((option) => option.value !== "system")
      .map((option) => option.value)
      .sort();
    expect(offered).toEqual([...THEMES].sort());
  });

  it("scopes every palette to its own data-theme attribute", () => {
    for (const theme of THEMES) {
      const css = readCss(`src/styles/themes/${theme}.css`);
      expect(css, theme).toContain(`:root[data-theme="${theme}"]`);
    }
  });

  it("reads the canvas chrome accent from the active palette", () => {
    document.documentElement.dataset.theme = "graphite";
    const values = new Map([
      ["--jade", " #9db0c9"],
      ["--on-accent", " #1a1f26"],
    ]);
    const spy = vi.spyOn(window, "getComputedStyle").mockReturnValue({
      getPropertyValue: (token: string) => values.get(token) ?? "",
    } as unknown as CSSStyleDeclaration);
    resetCanvasAccent();
    const { accent, onAccent } = canvasAccent();
    expect({ accent, onAccent }).toEqual({ accent: "#9db0c9", onAccent: "#1a1f26" });
    spy.mockRestore();
    resetCanvasAccent();
  });
});

describe("accent alpha usage", () => {
  it("derives translucent accents from the palette token, not a jade literal", () => {
    // A second accent colour can only work when every translucent accent reads
    // `var(--jade)`; the shipped jade rgba literal would stay green.
    const dir = resolve(root, "src", "styles");
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".css"))) {
      const css = readCss(`src/styles/${file}`);
      expect(css, file).not.toMatch(/rgba\(\s*53,\s*194,\s*161/i);
    }
  });

  it("keeps the canvas fallback in one place", () => {
    for (const file of ["crop.ts", "interactionRenderer.ts"]) {
      const source = readCss(`src/canvas/${file}`);
      expect(source, file).not.toContain("#35c2a1");
      expect(source, file).toContain("canvasAccent()");
    }
  });
});

describe("layers inset surfaces", () => {
  it("defines the inset surface tokens in every palette", () => {
    for (const theme of THEMES) {
      const css = readCss(`src/styles/themes/${theme}.css`);
      expect(checkThemeTokens(theme, css)).toEqual([]);
    }
  });

  it("keeps the medium grey surfaces pixel-identical to the 0.26.0 literals", () => {
    const tokens = parseTokens(readCss("src/styles/themes/medium-grey.css"));
    expect(tokens.get("--surface-inset")).toBe("#2e3031ad");
    expect(tokens.get("--surface-inset-foot")).toBe("rgb(255 255 255 / 10%)");
  });

  it("drives the Layers section surfaces from tokens, not palette literals", () => {
    const css = readCss("src/styles/layerTree.css");
    expect(declarationBlock(css, ".layer-section-rows")).toContain(
      "background: var(--surface-inset);",
    );
    expect(declarationBlock(css, ".layer-section-foot")).toContain(
      "background: var(--surface-inset-foot);",
    );
    expect(css).not.toMatch(/#2e3031ad/i);
    expect(css).not.toMatch(/rgb\(255 255 255 \/ 10%\)/i);
  });

  it("reports a palette that forgets an inset surface token", () => {
    const css = readCss("src/styles/themes/light-green.css").replace(
      /\n\s*--surface-inset-foot:[^;]+;/,
      "",
    );
    expect(checkThemeTokens("light-green", css)).toContain(
      "light-green: missing --surface-inset-foot",
    );
  });

  it("checks the subtle text tokens against the surfaces they are drawn on", () => {
    // F-116: the old Light Green values passed the base pairs and failed on the
    // inset, tab and status-bar surfaces. The contract now pins those pairs.
    const css = readCss("src/styles/themes/light-green.css")
      .replace(/(--muted-2:\s*)#[0-9a-f]{6};/i, "$1#76859a;")
      .replace(/(--muted:\s*)#[0-9a-f]{6};/i, "$1#5a6a7c;");
    const issues = checkThemeTokens("light-green", css);
    expect(issues).toContain("light-green: --muted-2 on --bg-deep is 3.04:1 (needs 4.5:1)");
    expect(issues).toContain("light-green: --muted on --bg-deep is 4.49:1 (needs 4.5:1)");
  });

  it("defines a readable accent text colour in every palette", () => {
    for (const theme of THEMES) {
      const tokens = parseTokens(readCss(`src/styles/themes/${theme}.css`));
      expect(tokens.has("--on-accent"), `${theme}: --on-accent`).toBe(true);
    }
    // The light palette needs light text on the darker accent fill; the dark
    // palettes keep their shipped near-black on the bright accent.
    expect(parseTokens(readCss("src/styles/themes/light-green.css")).get("--on-accent")).toBe(
      "#ffffff",
    );
    expect(parseTokens(readCss("src/styles/themes/medium-grey.css")).get("--on-accent")).toBe(
      "#071512",
    );
  });
});

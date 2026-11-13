// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAppPreferences } from "../src/io/appPreferences";
import { applyTheme, resolveTheme, setThemePreference } from "../src/theme/theme";
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
});

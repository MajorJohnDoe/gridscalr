// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAppPreferences } from "../src/io/appPreferences";
import { applyTheme, resolveTheme, setThemePreference } from "../src/theme/theme";

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

// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyStoredLanguage,
  currentLocale,
  languagePreference,
  resolveLocale,
  setLanguagePreference,
  t,
  translate,
  type MessageKey,
} from "../src/i18n";
import { en } from "../src/i18n/messages/en";
import { sv } from "../src/i18n/messages/sv";
import { loadAppPreferences, resetAppPreferences } from "../src/io/appPreferences";

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
}

beforeEach(() => {
  resetAppPreferences();
  applyStoredLanguage();
});

describe("resolveLocale", () => {
  it("uses the stored preference before the system language", () => {
    expect(resolveLocale("sv", "en-US")).toBe("sv");
    expect(resolveLocale("en", "sv-SE")).toBe("en");
  });

  it("follows the system language for the system preference", () => {
    expect(resolveLocale("system", "sv-SE")).toBe("sv");
    expect(resolveLocale("system", "SV")).toBe("sv");
    expect(resolveLocale("system", "de-DE")).toBe("en");
    expect(resolveLocale("system", "en-GB")).toBe("en");
  });
});

describe("translate", () => {
  it("returns locale text and interpolates parameters", () => {
    expect(translate("en", "window.minimize")).toBe("Minimize");
    expect(translate("sv", "window.minimize")).toBe("Minimera");
    expect(
      translate("en", "preferences.workspace.summary", {
        left: 272,
        right: 304,
        leftNote: "",
        rightNote: "",
      }),
    ).toBe("Sidebar 272 px · Properties 304 px.");
  });

  it("does not throw on an unknown key", () => {
    expect(translate("sv", "missing.key" as MessageKey)).toBe("missing.key");
  });
});

describe("message catalog", () => {
  it("only translates keys that exist in English", () => {
    for (const key of Object.keys(sv)) {
      expect(Object.prototype.hasOwnProperty.call(en, key)).toBe(true);
    }
  });

  it("has non-empty English text for every key", () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value, key).not.toBe("");
    }
  });

  it("keeps interpolation placeholders in sync", () => {
    for (const [key, value] of Object.entries(sv)) {
      expect(placeholders(value), key).toEqual(placeholders(en[key as MessageKey]));
    }
  });
});

describe("language preference", () => {
  it("persists the choice and applies it immediately", () => {
    setLanguagePreference("sv");
    expect(languagePreference()).toBe("sv");
    expect(currentLocale()).toBe("sv");
    expect(loadAppPreferences().language).toBe("sv");
    expect(t("window.maximize")).toBe("Maximera");

    setLanguagePreference("en");
    expect(currentLocale()).toBe("en");
    expect(t("window.maximize")).toBe("Maximize");
  });

  it("falls back to the system language after a reset", () => {
    setLanguagePreference("en");
    resetAppPreferences();
    expect(applyStoredLanguage()).toBe(
      navigator.language.toLowerCase().startsWith("sv") ? "sv" : "en",
    );
  });
});

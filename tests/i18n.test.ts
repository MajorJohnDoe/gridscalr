// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyStoredLanguage,
  currentLocale,
  languageOptions,
  languagePreference,
  loadLocale,
  resolveLocale,
  setLanguagePreference,
  t,
  translate,
  type MessageKey,
} from "../src/i18n";
import en from "../src/i18n/locales/en.json";
import sv from "../src/i18n/locales/sv.json";
import { loadAppPreferences, resetAppPreferences } from "../src/io/appPreferences";

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\s*([A-Za-z_][\w]*)\s*(?:[,}])/g)].map((match) => match[1]).sort();
}

beforeEach(async () => {
  resetAppPreferences();
  await applyStoredLanguage();
});

describe("resolveLocale", () => {
  it("uses the stored preference before the system language", () => {
    expect(resolveLocale("sv", "en-US")).toBe("sv");
    expect(resolveLocale("en", "sv-SE")).toBe("en");
  });

  it("follows the system language chain for the system preference", () => {
    expect(resolveLocale("system", "sv-SE")).toBe("sv");
    expect(resolveLocale("system", "SV")).toBe("sv");
    expect(resolveLocale("system", ["sv-FI", "en-US"])).toBe("sv");
    expect(resolveLocale("system", ["de-DE", "sv-SE"])).toBe("sv");
    expect(resolveLocale("system", "de-DE")).toBe("en");
    expect(resolveLocale("system", ["de-DE"])).toBe("en");
    expect(resolveLocale("system", "en-GB")).toBe("en");
  });
});

describe("translate", () => {
  it("returns locale text and interpolates parameters", async () => {
    await loadLocale("sv");
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

describe("ICU plural messages", () => {
  it("uses the English one/other forms", () => {
    expect(translate("en", "app.itemsCopied", { count: 1 })).toBe("1 item copied.");
    expect(translate("en", "app.itemsCopied", { count: 2 })).toBe("2 items copied.");
    expect(translate("en", "app.itemsCopied", { count: 0 })).toBe("0 items copied.");
  });

  it("uses the Swedish one/other forms and number formatting", async () => {
    await loadLocale("sv");
    expect(translate("sv", "app.itemsCopied", { count: 1 })).toBe("1 objekt kopierat.");
    expect(translate("sv", "app.itemsCopied", { count: 2 })).toBe("2 objekt kopierade.");
    expect(
      translate("sv", "app.itemsCopied", { count: 1234 })
        .replace(/[\u00a0\u202f]/g, " ")
        .replace(",", "."),
    ).toBe("1 234 objekt kopierade.");
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
  it("persists the choice and applies it immediately", async () => {
    await setLanguagePreference("sv");
    expect(languagePreference()).toBe("sv");
    expect(currentLocale()).toBe("sv");
    expect(loadAppPreferences().language).toBe("sv");
    expect(t("window.maximize")).toBe("Maximera");
    expect(document.documentElement.lang).toBe("sv");

    await setLanguagePreference("en");
    expect(currentLocale()).toBe("en");
    expect(t("window.maximize")).toBe("Maximize");
    expect(document.documentElement.lang).toBe("en");
  });

  it("falls back to the system language after a reset", async () => {
    await setLanguagePreference("en");
    resetAppPreferences();
    const expected = resolveLocale(
      "system",
      navigator.languages?.length ? [...navigator.languages] : navigator.language,
    );
    expect(await applyStoredLanguage()).toBe(expected);
  });

  it("offers registry native names and hides the pseudo-locale", () => {
    const options = languageOptions();
    expect(options[0]?.value).toBe("system");
    expect(options.map((option) => option.label)).toEqual(
      expect.arrayContaining(["English", "Svenska"]),
    );
    expect(options.some((option) => String(option.value) === "en-XA")).toBe(false);
  });
});

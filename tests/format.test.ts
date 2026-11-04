import { describe, expect, it } from "vitest";
import {
  decimalSeparator,
  formatDate,
  formatNumber,
  numberLocaleFor,
  parseLocalizedNumber,
} from "../src/i18n/format";

function plain(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, " ");
}

describe("locale formatting", () => {
  it("formats numbers with the requested locale", () => {
    expect(formatNumber(1234.567, 1, "en")).toBe("1,234.6");
    expect(plain(formatNumber(1234.567, 2, "sv"))).toBe("1 234,57");
    expect(formatNumber(Number.NaN, 2, "sv")).toBe("–");
  });

  it("reports the number locale and decimal mark from the registry", () => {
    expect(numberLocaleFor("en")).toBe("en-US");
    expect(numberLocaleFor("sv")).toBe("sv-SE");
    expect(decimalSeparator("en")).toBe(".");
    expect(decimalSeparator("sv")).toBe(",");
  });

  it("formats dates with the requested locale", () => {
    const options = {
      year: "numeric" as const,
      month: "2-digit" as const,
      day: "2-digit" as const,
      timeZone: "UTC",
    };
    expect(formatDate("2026-11-04T12:00:00.000Z", { ...options, locale: "en" })).toBe("11/04/2026");
    expect(formatDate("2026-11-04T12:00:00.000Z", { ...options, locale: "sv" })).toBe("2026-11-04");
    expect(formatDate("not-a-date", { locale: "en" })).toBe("–");
  });

  it("parses grouped and localised decimal input", () => {
    expect(parseLocalizedNumber("1,234.56", "en")).toBe(1234.56);
    expect(parseLocalizedNumber("1 234,56", "sv")).toBe(1234.56);
    expect(parseLocalizedNumber("1\u00a0234,56", "sv")).toBe(1234.56);
    expect(parseLocalizedNumber("12,5", "sv")).toBe(12.5);
    expect(parseLocalizedNumber("-3.25", "en")).toBe(-3.25);
    expect(Number.isNaN(parseLocalizedNumber("", "en"))).toBe(true);
    expect(Number.isNaN(parseLocalizedNumber("not a number", "en"))).toBe(true);
  });
});

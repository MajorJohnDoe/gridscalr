// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { applyStoredLanguage, setLanguagePreference } from "../src/i18n";
import { resetAppPreferences } from "../src/io/appPreferences";
import { commandErrorFallback, describeCommandError } from "../src/io/platformError";

beforeEach(async () => {
  resetAppPreferences();
  await applyStoredLanguage();
});

describe("describeCommandError", () => {
  it("maps a command code and keeps the technical detail separate", () => {
    expect(describeCommandError({ code: "sourceOverwrite", detail: "" })).toBe(
      "GridScalr will not overwrite a source drawing. Choose a different file name.",
    );
    expect(describeCommandError({ code: "writeFailed", detail: "Plan.gridscalr: denied" })).toBe(
      "Could not write the file. The previous file was left unchanged.\n\nPlan.gridscalr: denied",
    );
  });

  it("uses the active Swedish catalog", async () => {
    await setLanguagePreference("sv");
    expect(describeCommandError({ code: "sourceOverwrite", detail: "" })).toBe(
      "GridScalr skriver inte över en källritning. Välj ett annat filnamn.",
    );
    expect(describeCommandError({ code: "readFailed", detail: "Plan.pdf: saknas" })).toBe(
      "Kunde inte läsa filen.\n\nPlan.pdf: saknas",
    );
    await setLanguagePreference("en");
  });

  it("returns null for unknown shapes and a technical fallback for unknown codes", () => {
    expect(describeCommandError("boom")).toBeNull();
    expect(describeCommandError({ code: "futureCode", detail: "x" })).toBeNull();
    expect(commandErrorFallback({ code: "futureCode", detail: "x" })).toBe("futureCode: x");
    expect(commandErrorFallback("boom")).toBe("boom");
  });
});

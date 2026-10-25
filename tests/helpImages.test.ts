import { describe, expect, it } from "vitest";
import { HELP_IMAGE_NAMES, resolveHelpImage } from "../src/help/images";

describe("help images", () => {
  it("bundles the documented screenshots", () => {
    expect(HELP_IMAGE_NAMES).toEqual(
      expect.arrayContaining([
        "export.png",
        "hero.png",
        "markups.png",
        "measure.png",
        "measurements.png",
        "quantities.png",
        "workflows-help.png",
      ]),
    );
  });

  it("resolves a screenshot by basename, including relative paths", () => {
    const url = resolveHelpImage("../../docs/screenshots/hero.png");
    expect(url).toBeTruthy();
    expect(resolveHelpImage("screenshots/hero.png")).toBe(url);
  });

  it("rejects images outside the bundled screenshot set", () => {
    expect(resolveHelpImage("../../README.md")).toBeNull();
    expect(resolveHelpImage("screenshots/missing.png")).toBeNull();
  });
});

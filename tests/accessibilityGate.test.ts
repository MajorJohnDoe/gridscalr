import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  A11Y_FAIL_IMPACTS,
  A11Y_SURFACES,
  A11Y_THEMES,
  TOUCH_TARGET_EMULATION,
  TOUCH_TARGET_MIN_PX,
  UI_SCALE_BASE_VIEWPORT,
  UI_SCALE_MIN_CANVAS_PX,
  UI_SCALE_REGIONS,
  a11ySurfaceChecks,
  classifyViolations,
  formatTouchTargetFailure,
  formatViolation,
  isFailingImpact,
  isTouchTargetLargeEnough,
  summarizeViolation,
  touchTargetFailures,
  uiScaleViewports,
} from "../scripts/accessibility-rules.mjs";

const root = resolve(__dirname, "..");

function violation(id: string, impact: string, targets = [".target"]) {
  return {
    id,
    impact,
    help: `${id} help`,
    helpUrl: `https://example.test/${id}`,
    nodes: targets.map((target) => ({
      target: [target],
      failureSummary: "Fix any of the following:\n  element is broken",
    })),
  };
}

function control(surface: string, width: number, height: number, label = "") {
  return { surface, tag: "button", label, className: "icon-btn", width, height };
}

describe("accessibility gate rules", () => {
  it("fails serious and critical violations only and reports the rest", () => {
    const { failing, reported } = classifyViolations([
      violation("critical-rule", "critical"),
      violation("serious-rule", "serious"),
      violation("moderate-rule", "moderate"),
      violation("minor-rule", "minor"),
    ]);
    expect(failing.map((entry) => entry.id)).toEqual(["critical-rule", "serious-rule"]);
    expect(reported.map((entry) => entry.id)).toEqual(["moderate-rule", "minor-rule"]);
  });

  it("has no allowlist: an unknown serious rule still fails", () => {
    const { failing } = classifyViolations([violation("brand-new-rule", "serious")]);
    expect(failing).toHaveLength(1);
    expect(failing[0].id).toBe("brand-new-rule");
  });

  it("reports an unknown impact as non-failing instead of hiding it", () => {
    expect(isFailingImpact("unknown")).toBe(false);
    const { reported, failing } = classifyViolations([violation("odd", "unknown")]);
    expect(failing).toEqual([]);
    expect(reported[0].impact).toBe("unknown");
  });

  it("summarizes nodes with a stable target and a single-line summary", () => {
    const summary = summarizeViolation(violation("rule", "serious", [".a", ".b"]));
    expect(summary.nodes).toEqual([
      { target: ".a", summary: "Fix any of the following: element is broken" },
      { target: ".b", summary: "Fix any of the following: element is broken" },
    ]);
    expect(formatViolation(summary)).toEqual([
      "rule [serious] rule help\n  .a\n  Fix any of the following: element is broken",
      "rule [serious] rule help\n  .b\n  Fix any of the following: element is broken",
    ]);
  });

  it("keeps the covered surfaces and the fail impacts explicit", () => {
    expect(A11Y_FAIL_IMPACTS).toEqual(["serious", "critical"]);
    expect(A11Y_SURFACES.map((surface) => surface.id)).toEqual([
      "shell",
      "project-settings",
      "preferences",
      "quantities",
      "drawing-export",
      "spaces",
      "help",
      "fields",
      "fields-inspector",
      "summary",
      "schedule-placement",
      "schedule-inspector",
      "schedule-builder",
      "schedule-roles",
    ]);
  });

  it("runs the shell and dialogs in every shipped palette", () => {
    expect(A11Y_THEMES.map((theme) => theme.id)).toEqual([
      "medium-grey",
      "light-green",
      "dark-grey",
      "jade",
      "navy",
    ]);
    expect(A11Y_THEMES.find((theme) => theme.id === "light-green")?.label).toBe("Light Green");
  });

  it("checks every theme and surface pair exactly once", () => {
    const checks = a11ySurfaceChecks();
    expect(checks).toHaveLength(A11Y_THEMES.length * A11Y_SURFACES.length);
    expect(new Set(checks.map((check) => check.key)).size).toBe(checks.length);
    expect(checks[0]).toEqual({
      key: "medium-grey:shell",
      theme: "medium-grey",
      themeLabel: "Medium Gray",
      surface: "shell",
      surfaceLabel: "Main shell",
    });
    expect(checks.at(-1)?.key).toBe("navy:schedule-roles");
  });

  it("lets a test narrow the theme list without changing the surfaces", () => {
    const checks = a11ySurfaceChecks([{ id: "light-green", label: "Light Green" }]);
    expect(checks.map((check) => check.key)).toEqual(
      A11Y_SURFACES.map((surface) => `light-green:${surface.id}`),
    );
  });
});

describe("touch-target rules", () => {
  it("accepts the 24 px minimum and rejects a smaller control", () => {
    expect(TOUCH_TARGET_MIN_PX).toBe(24);
    expect(isTouchTargetLargeEnough({ width: 24, height: 24 })).toBe(true);
    expect(isTouchTargetLargeEnough({ width: 23.9, height: 24 })).toBe(false);
    expect(isTouchTargetLargeEnough(undefined)).toBe(false);
  });

  it("lists the smallest offenders first and keeps the surface", () => {
    const failures = touchTargetFailures([
      control("shell", 22, 22, "Zoom in"),
      control("layers", 16, 22, "Expand"),
      control("shell", 40, 40, "Menu"),
      control("markups", 50, 15.4, "Sort by Name"),
    ]);
    expect(failures.map((failure) => failure.label)).toEqual(["Sort by Name", "Expand", "Zoom in"]);
    expect(failures[1].surface).toBe("layers");
    expect(formatTouchTargetFailure(failures[2])).toContain("is 22×22 px (minimum 24×24)");
  });

  it("documents the emulation method instead of a synthetic media override", () => {
    expect(TOUCH_TARGET_EMULATION).toContain("hasTouch: true");
  });
});

describe("UI-scale rules", () => {
  it("turns 100/150/200 % scaling into the CSS viewport of a 1920 × 1080 window", () => {
    expect(UI_SCALE_BASE_VIEWPORT).toEqual({ width: 1920, height: 1080 });
    expect(uiScaleViewports()).toEqual([
      { scale: 1, label: "100%", width: 1920, height: 1080 },
      { scale: 1.5, label: "150%", width: 1280, height: 720 },
      { scale: 2, label: "200%", width: 960, height: 540 },
    ]);
  });

  it("keeps the primary regions and the smallest canvas explicit", () => {
    expect(UI_SCALE_REGIONS.map((region) => region.selector)).toContain(".statusbar");
    expect(UI_SCALE_MIN_CANVAS_PX).toBe(240);
  });
});

describe("documentation agreement", () => {
  const testing = readFileSync(resolve(root, "docs", "testing.md"), "utf8");
  const limitations = readFileSync(resolve(root, "docs", "limitations.md"), "utf8");

  it("names every automated a11y surface in docs/testing.md", () => {
    for (const surface of A11Y_SURFACES) {
      expect(testing).toContain(surface.label);
    }
  });

  it("records the palette coverage of the accessibility gate", () => {
    for (const theme of A11Y_THEMES) {
      expect(testing).toContain(theme.label);
    }
    expect(testing).toContain(`${A11Y_THEMES.length} palettes`);
  });

  it("records the gate commands, the 24 px minimum and the UI scales", () => {
    for (const command of [
      "npm run test:a11y",
      "npm run test:touch-targets",
      "npm run test:ui-scale",
      "npm run check:performance",
    ]) {
      expect(testing).toContain(command);
    }
    expect(testing).toContain("24 × 24");
    expect(testing).toContain("960 × 540");
    expect(limitations).toContain("24 × 24 CSS px");
  });
});

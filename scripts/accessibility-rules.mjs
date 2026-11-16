/**
 * Pure rules for the accessibility, touch-target and UI-scale gates.
 *
 * The Playwright scripts own browser control; every threshold and every
 * pass/fail decision lives here so it can be tested without Chromium.
 */

/** Only these axe impacts fail the gate. Lower impacts are reported. */
export const A11Y_FAIL_IMPACTS = ["serious", "critical"];

/** The surfaces the automated check covers, in report order. */
export const A11Y_SURFACES = [
  { id: "shell", label: "Main shell" },
  { id: "project-settings", label: "Project settings dialog" },
  { id: "preferences", label: "Preferences dialog" },
  { id: "quantities", label: "Quantities dialog" },
  { id: "drawing-export", label: "Drawing export dialog" },
  { id: "spaces", label: "Spaces register dialog" },
  { id: "help", label: "Help dialog" },
  { id: "fields", label: "Custom fields dialog" },
  { id: "fields-inspector", label: "Custom fields inspector section" },
  { id: "summary", label: "Summary dock tab" },
  { id: "schedule-placement", label: "Place schedule dialog" },
  { id: "schedule-inspector", label: "Placed table inspector section" },
  { id: "schedule-builder", label: "Schedule builder dialog" },
  { id: "schedule-csv", label: "Schedule CSV import dialog" },
  { id: "schedule-roles", label: "Summary roles dialog" },
];

/**
 * Every shipped palette is analysed, not only the default. The shell and the
 * dialogs read the same semantic tokens in each palette, so a contrast
 * regression in one palette fails the gate instead of becoming a note (F-116).
 */
export const A11Y_THEMES = [
  { id: "medium-grey", label: "Medium Gray" },
  { id: "light-green", label: "Light Green" },
  { id: "dark-grey", label: "Dark Gray" },
  { id: "jade", label: "Jade" },
  { id: "navy", label: "Navy" },
];

/**
 * The theme × surface matrix. The gate records a result for every entry, so a
 * theme or surface that silently stops running fails the run.
 */
export function a11ySurfaceChecks(themes = A11Y_THEMES, surfaces = A11Y_SURFACES) {
  return themes.flatMap((theme) =>
    surfaces.map((surface) => ({
      key: `${theme.id}:${surface.id}`,
      theme: theme.id,
      themeLabel: theme.label,
      surface: surface.id,
      surfaceLabel: surface.label,
    })),
  );
}

/**
 * WCAG 2.2 AA, Success Criterion 2.5.8 Target Size (Minimum): 24 by 24 CSS
 * pixels. The app is desktop-dense by default; a `(pointer: coarse)` rule
 * raises every control to this size on touch hardware only.
 */
export const TOUCH_TARGET_MIN_PX = 24;

/**
 * The touch check runs in a Chromium context created with `hasTouch: true`,
 * which is the stable way Playwright exposes `(pointer: coarse)` and
 * `(any-pointer: coarse)`. It asserts the layout the media query produces, not
 * a synthetic media override.
 */
export const TOUCH_TARGET_EMULATION = "Playwright Chromium context with hasTouch: true";

/**
 * UI scale is emulated as the CSS viewport a 1920 × 1080 window leaves at each
 * OS scale, which is what the responsive rules actually react to.
 */
export const UI_SCALE_BASE_VIEWPORT = { width: 1920, height: 1080 };

/** 100 %, 150 % and 200 % OS scaling of the reference window. */
export const UI_SCALE_STEPS = [1, 1.5, 2];

/** The primary regions that must stay usable at every UI scale. */
export const UI_SCALE_REGIONS = [
  { selector: ".topbar", label: "Top bar with the menu" },
  { selector: ".context-bar", label: "Context bar" },
  { selector: ".dock-body", label: "Pages and Layers panel" },
  { selector: ".inspector", label: "Properties panel" },
  { selector: ".statusbar", label: "Status bar" },
];

/** Smallest canvas the shell may leave at 200 % scale. */
export const UI_SCALE_MIN_CANVAS_PX = 240;

export function isFailingImpact(impact, failImpacts = A11Y_FAIL_IMPACTS) {
  return failImpacts.includes(impact);
}

/**
 * Splits axe violations into the ones that fail the gate and the ones that are
 * only reported. There is no allowlist: a new serious or critical rule fails.
 */
export function classifyViolations(violations, failImpacts = A11Y_FAIL_IMPACTS) {
  const failing = [];
  const reported = [];
  for (const violation of violations) {
    const entry = summarizeViolation(violation);
    (isFailingImpact(violation.impact, failImpacts) ? failing : reported).push(entry);
  }
  return { failing, reported };
}

export function summarizeViolation(violation) {
  return {
    id: violation.id,
    impact: violation.impact ?? "unknown",
    help: violation.help ?? violation.id,
    helpUrl: violation.helpUrl ?? "",
    nodes: (violation.nodes ?? []).map((node) => ({
      target: Array.isArray(node.target) ? node.target.join(" ") : String(node.target ?? ""),
      summary: String(node.failureSummary ?? "")
        .replace(/\s+/g, " ")
        .trim(),
    })),
  };
}

/** A stable, readable report line per failing node. */
export function formatViolation(violation) {
  const head = `${violation.id} [${violation.impact}] ${violation.help}`;
  return violation.nodes.map((node) => `${head}\n  ${node.target}\n  ${node.summary}`);
}

/**
 * CSS viewports for the UI-scale check. Scaling up the OS leaves fewer CSS
 * pixels, which is exactly what `window.innerWidth` reports to the app.
 */
export function uiScaleViewports(base = UI_SCALE_BASE_VIEWPORT, steps = UI_SCALE_STEPS) {
  return steps.map((scale) => ({
    scale,
    label: `${Math.round(scale * 100)}%`,
    width: Math.round(base.width / scale),
    height: Math.round(base.height / scale),
  }));
}

/** The effective target of a control, once a wrapping label is accounted for. */
export function isTouchTargetLargeEnough(size, min = TOUCH_TARGET_MIN_PX) {
  return Number.isFinite(size?.width) && Number.isFinite(size?.height)
    ? size.width >= min && size.height >= min
    : false;
}

/**
 * Returns the controls that are too small for a coarse pointer, smallest first
 * so a report starts with the worst offender. `allowKnown` is deliberately not
 * a parameter: the gate has to keep every visible control above the minimum.
 */
export function touchTargetFailures(controls, min = TOUCH_TARGET_MIN_PX) {
  return controls
    .filter((control) => !isTouchTargetLargeEnough(control, min))
    .map((control) => ({
      surface: control.surface,
      tag: control.tag,
      label: control.label,
      className: control.className ?? "",
      width: round(control.width),
      height: round(control.height),
    }))
    .sort((left, right) => left.height - right.height || left.width - right.width);
}

export function formatTouchTargetFailure(failure, min = TOUCH_TARGET_MIN_PX) {
  const name = failure.label || failure.className || failure.tag;
  return `${failure.surface}: <${failure.tag}> ${name} is ${failure.width}×${failure.height} px (minimum ${min}×${min})`;
}

function round(value) {
  return Math.round(value * 10) / 10;
}

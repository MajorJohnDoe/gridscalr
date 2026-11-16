import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import {
  A11Y_FAIL_IMPACTS,
  A11Y_SURFACES,
  A11Y_THEMES,
  a11ySurfaceChecks,
  classifyViolations,
  formatViolation,
} from "./accessibility-rules.mjs";
import {
  closeReopenedSettings,
  launchBrowser,
  openCustomFieldsDialog,
  openDemoProject,
  openMarkupsItem,
  seedCustomField,
  settlePage,
  startVite,
} from "./ui-harness.mjs";

/**
 * Automated accessibility gate for the application shell and its dialogs.
 *
 * Every shipped palette runs the shell, the six dialogs and the custom-fields
 * inspector section, so a contrast regression in one palette fails the run
 * instead of hiding behind the default (F-116). Serious and critical axe
 * violations fail; moderate, minor and best-practice findings are printed with
 * their targets so they stay visible. There is no allowlist.
 *
 * The freehand canvas has no DOM model to inspect, so it is covered by the
 * manual checklist in `docs/testing.md`, not by this script.
 */
const port = Number(process.env.GRIDSCALR_A11Y_PORT ?? 1436);

const checks = a11ySurfaceChecks();
const results = new Map();
let browser;
let vite;

function checkFor(theme, surfaceId) {
  const check = checks.find((entry) => entry.key === `${theme.id}:${surfaceId}`);
  assert.ok(check, `${theme.label} ${surfaceId}: the theme/surface pair is not in the matrix`);
  return check;
}

async function analyze(page, check, selector) {
  await settlePage(page);
  const builder = new AxeBuilder({ page });
  if (selector) builder.include(selector);
  const report = await builder.analyze();
  results.set(check.key, {
    violations: report.violations.length,
    incomplete: report.incomplete.length,
    incompleteRules: [...new Set(report.incomplete.map((entry) => entry.id))],
    ...classifyViolations(report.violations),
  });
}

async function expectFocusInside(page, selector, check) {
  await settlePage(page);
  const inside = await page.evaluate(
    (dialogSelector) => Boolean(document.activeElement?.closest(dialogSelector)),
    selector,
  );
  assert.equal(
    inside,
    true,
    `${check.themeLabel} ${check.surfaceLabel}: focus should move into the dialog when it opens`,
  );
}

async function openPreferences(page) {
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  const preferences = page.getByRole("dialog", { name: "Preferences" });
  await preferences.waitFor();
  return preferences;
}

try {
  vite = await startVite({ port });
  browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openDemoProject(page, { base: vite.base });
  await seedCustomField(page);

  for (const theme of A11Y_THEMES) {
    // Preferences is also where the palette is chosen, so it is the first
    // surface and every theme switch goes through it.
    const preferences = await openPreferences(page);
    await preferences.getByLabel("Theme").selectOption(theme.id);
    await page.waitForFunction((id) => document.documentElement.dataset.theme === id, theme.id);
    const preferencesCheck = checkFor(theme, "preferences");
    await expectFocusInside(page, ".modal", preferencesCheck);
    await analyze(page, preferencesCheck, ".modal");
    await page.keyboard.press("Escape");
    await preferences.waitFor({ state: "detached" });

    await analyze(page, checkFor(theme, "shell"));

    // Project settings, opened with the documented shortcut.
    await page.keyboard.press("Control+,");
    const projectSettings = page.getByRole("dialog", { name: "Project settings" });
    await projectSettings.waitFor();
    const projectSettingsCheck = checkFor(theme, "project-settings");
    await expectFocusInside(page, ".modal", projectSettingsCheck);
    await analyze(page, projectSettingsCheck, ".modal");
    await page.keyboard.press("Escape");
    await projectSettings.waitFor({ state: "detached" });

    // Quantities.
    await page.keyboard.press("Control+Alt+q");
    const quantities = page.getByRole("dialog");
    await quantities.waitFor();
    await analyze(page, checkFor(theme, "quantities"), ".modal");
    await page.keyboard.press("Escape");
    await quantities.waitFor({ state: "detached" });

    // Drawing export.
    await page.getByRole("menuitem", { name: "File" }).click();
    await page.getByRole("menuitem", { name: /^Export/ }).click();
    await page.getByRole("menuitem", { name: "Drawing PDF…" }).click();
    const drawingExport = page.getByRole("dialog");
    await drawingExport.waitFor();
    const drawingExportCheck = checkFor(theme, "drawing-export");
    await expectFocusInside(page, ".modal", drawingExportCheck);
    await analyze(page, drawingExportCheck, ".modal");
    await page.keyboard.press("Escape");
    await drawingExport.waitFor({ state: "detached" });

    // Help.
    await page.keyboard.press("F1");
    const help = page.getByRole("dialog");
    await help.waitFor();
    await analyze(page, checkFor(theme, "help"), ".modal");
    await page.keyboard.press("Escape");
    await help.waitFor({ state: "detached" });

    // Custom fields editor, reached through Project settings → Fields.
    const fields = await openCustomFieldsDialog(page);
    const fieldsCheck = checkFor(theme, "fields");
    await expectFocusInside(page, ".modal", fieldsCheck);
    await analyze(page, fieldsCheck, ".modal");
    await page.keyboard.press("Escape");
    await fields.waitFor({ state: "detached" });
    await closeReopenedSettings(page);

    // The same field rendered in Properties for the selected measurement.
    // Escape closes a modal and clears the canvas selection, so the item is
    // selected here rather than before the loop.
    await openMarkupsItem(page, "item_floor_living");
    await analyze(page, checkFor(theme, "fields-inspector"), ".selection-section");
    assert.ok(
      (await page.locator(".selection-section").textContent())?.includes("Fire class"),
      "the selected measurement should show the seeded custom field",
    );
  }

  assert.deepEqual(pageErrors, [], "the accessibility run should not raise page errors");
  assert.equal(
    results.size,
    checks.length,
    `${checks.length} palette/surface checks were expected, ${results.size} ran`,
  );

  let failing = 0;
  let reported = 0;
  for (const check of checks) {
    const result = results.get(check.key);
    assert.ok(result, `${check.themeLabel} ${check.surfaceLabel}: the surface was not checked`);
    failing += result.failing.length;
    reported += result.reported.length;
    console.log(
      `${check.themeLabel} · ${check.surfaceLabel}: ${result.violations} violation(s), ` +
        `${result.failing.length} serious/critical, ${result.reported.length} reported, ` +
        `${result.incomplete} needing manual review` +
        (result.incompleteRules.length ? ` (${result.incompleteRules.join(", ")}).` : "."),
    );
    for (const violation of [...result.failing, ...result.reported]) {
      const level =
        violation.impact === "serious" || violation.impact === "critical" ? "FAIL" : "note";
      for (const line of formatViolation(violation)) console.log(`  ${level} ${line}`);
    }
  }

  const matrix = `${A11Y_THEMES.length} palettes × ${A11Y_SURFACES.length} surfaces`;
  if (failing > 0) {
    console.error(
      `Accessibility gate failed: ${failing} serious/critical violation(s) across ${matrix}.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Accessibility gate passed: ${matrix} (${checks.length} checks), no ` +
        `${A11Y_FAIL_IMPACTS.join("/")} violations (${reported} lower-impact finding(s) reported).`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (vite) await vite.stop();
}

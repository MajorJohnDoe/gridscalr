import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import {
  A11Y_FAIL_IMPACTS,
  A11Y_SURFACES,
  classifyViolations,
  formatViolation,
} from "./accessibility-rules.mjs";
import { launchBrowser, openDemoProject, settlePage, startVite } from "./ui-harness.mjs";

/**
 * Automated accessibility gate for the application shell and its dialogs.
 *
 * Serious and critical axe violations fail the run. Moderate, minor and
 * best-practice findings are printed with their targets so they are visible
 * without blocking a release; there is no allowlist.
 *
 * The freehand canvas has no DOM model to inspect, so it is covered by the
 * manual checklist in `docs/testing.md`, not by this script.
 */
const port = Number(process.env.GRIDSCALR_A11Y_PORT ?? 1436);

const surfaces = new Map();
let browser;
let vite;

async function analyze(page, id, selector) {
  await settlePage(page);
  const builder = new AxeBuilder({ page });
  if (selector) builder.include(selector);
  const results = await builder.analyze();
  surfaces.set(id, {
    violations: results.violations.length,
    incomplete: results.incomplete.length,
    incompleteRules: [...new Set(results.incomplete.map((entry) => entry.id))],
    ...classifyViolations(results.violations),
  });
}

async function expectFocusInside(page, selector, label) {
  await settlePage(page);
  const inside = await page.evaluate(
    (dialogSelector) => Boolean(document.activeElement?.closest(dialogSelector)),
    selector,
  );
  assert.equal(inside, true, `${label}: focus should move into the dialog when it opens`);
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

  await analyze(page, "shell");

  // Project settings, opened with the documented shortcut.
  await page.keyboard.press("Control+,");
  const projectSettings = page.getByRole("dialog", { name: "Project settings" });
  await projectSettings.waitFor();
  await expectFocusInside(page, ".modal", A11Y_SURFACES[1].label);
  await analyze(page, "project-settings", ".modal");
  await page.keyboard.press("Escape");
  await projectSettings.waitFor({ state: "detached" });

  // Preferences, opened through the menu bar.
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  const preferences = page.getByRole("dialog", { name: "Preferences" });
  await preferences.waitFor();
  await expectFocusInside(page, ".modal", A11Y_SURFACES[2].label);
  await analyze(page, "preferences", ".modal");
  await page.keyboard.press("Escape");
  await preferences.waitFor({ state: "detached" });

  // Quantities.
  await page.keyboard.press("Control+Alt+q");
  const quantities = page.getByRole("dialog");
  await quantities.waitFor();
  await analyze(page, "quantities", ".modal");
  await page.keyboard.press("Escape");
  await quantities.waitFor({ state: "detached" });

  // Drawing export.
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /^Export/ }).click();
  await page.getByRole("menuitem", { name: "Drawing PDF…" }).click();
  const drawingExport = page.getByRole("dialog");
  await drawingExport.waitFor();
  await expectFocusInside(page, ".modal", A11Y_SURFACES[4].label);
  await analyze(page, "drawing-export", ".modal");
  await page.keyboard.press("Escape");
  await drawingExport.waitFor({ state: "detached" });

  // Help.
  await page.keyboard.press("F1");
  const help = page.getByRole("dialog");
  await help.waitFor();
  await analyze(page, "help", ".modal");
  await page.keyboard.press("Escape");
  await help.waitFor({ state: "detached" });

  assert.deepEqual(pageErrors, [], "the accessibility run should not raise page errors");

  let failing = 0;
  let reported = 0;
  for (const surface of A11Y_SURFACES) {
    const result = surfaces.get(surface.id);
    assert.ok(result, `${surface.label}: the surface was not checked`);
    failing += result.failing.length;
    reported += result.reported.length;
    console.log(
      `${surface.label}: ${result.violations} violation(s), ${result.failing.length} serious/critical, ` +
        `${result.reported.length} reported, ${result.incomplete} needing manual review` +
        (result.incompleteRules.length ? ` (${result.incompleteRules.join(", ")}).` : "."),
    );
    for (const violation of [...result.failing, ...result.reported]) {
      const level =
        violation.impact === "serious" || violation.impact === "critical" ? "FAIL" : "note";
      for (const line of formatViolation(violation)) console.log(`  ${level} ${line}`);
    }
  }

  if (failing > 0) {
    console.error(
      `Accessibility gate failed: ${failing} serious/critical violation(s) across ${A11Y_SURFACES.length} surfaces.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Accessibility gate passed: ${A11Y_SURFACES.length} surfaces, no ${A11Y_FAIL_IMPACTS.join("/")} violations ` +
        `(${reported} lower-impact finding(s) reported).`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (vite) await vite.stop();
}

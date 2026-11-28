import assert from "node:assert/strict";
import {
  TOUCH_TARGET_EMULATION,
  TOUCH_TARGET_MIN_PX,
  formatTouchTargetFailure,
  touchTargetFailures,
} from "./accessibility-rules.mjs";
import {
  closeReopenedSettings,
  createTwoOpenPages,
  launchBrowser,
  openCustomFieldsDialog,
  openDemoProject,
  openMarkupsItem,
  openPlacedTableInspector,
  openScheduleBuilder,
  openScheduleCsvImport,
  openSchedulePlacementDialog,
  openSpacesRegister,
  openSummaryTab,
  openTakeoffSettings,
  seedCustomField,
  seedSchedules,
  seedSpaces,
  setLanguage,
  settlePage,
  startVite,
} from "./ui-harness.mjs";

/**
 * Touch-target gate for coarse pointers.
 *
 * The context is created with `hasTouch: true`, which makes Chromium report
 * `(pointer: coarse)`; the assertion therefore covers the real CSS media query
 * rather than a synthetic override. Every visible control on the shell, the
 * Layers and Markups panels and the main dialogs must measure at least
 * 24 × 24 CSS pixels — the WCAG 2.2 AA target-size minimum.
 */
const port = Number(process.env.GRIDSCALR_TOUCH_TARGET_PORT ?? 1439);

const READ_CONTROLS = (rootSelector) => {
  const root = rootSelector ? document.querySelector(rootSelector) : document;
  if (!root) return [];
  const hidden = (node) => {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return true;
    if (node.closest("[hidden]")) return true;
    return node.getClientRects().length === 0;
  };
  const controls = [];
  const seen = new Set();
  const candidates = root.querySelectorAll(
    "button, [role=button], a[href], select, input, textarea, summary, [tabindex='0']",
  );
  for (const node of candidates) {
    if (node.getAttribute("aria-hidden") === "true") continue;
    if (node instanceof HTMLInputElement) {
      if (node.type === "hidden") continue;
      // The colour input is an aria-hidden proxy; the swatch beside it is the target.
      if (node.classList.contains("layer-color-input")) continue;
    }
    let target = node;
    if (
      node instanceof HTMLInputElement &&
      (node.type === "checkbox" || node.type === "radio") &&
      node.closest("label")
    ) {
      target = node.closest("label");
    }
    if (seen.has(target)) continue;
    seen.add(target);
    if (hidden(node) || hidden(target)) continue;
    const rect = target.getBoundingClientRect();
    controls.push({
      tag: target.tagName.toLowerCase(),
      label:
        target.getAttribute("aria-label") ||
        target.getAttribute("title") ||
        (target.textContent ?? "").trim().slice(0, 40),
      className: typeof target.className === "string" ? target.className : "",
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
    });
  }
  return controls;
};

let browser;
let vite;

try {
  vite = await startVite({ port });
  browser = await launchBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openDemoProject(page, { base: vite.base });
  await seedCustomField(page);
  await seedSpaces(page);
  await seedSchedules(page);
  await createTwoOpenPages(page);

  const coarse = await page.evaluate(() => ({
    pointer: matchMedia("(pointer: coarse)").matches,
    any: matchMedia("(any-pointer: coarse)").matches,
  }));
  assert.equal(
    coarse.pointer,
    true,
    `the coarse-pointer emulation did not apply (${TOUCH_TARGET_EMULATION})`,
  );
  assert.equal(coarse.any, true, "any-pointer: coarse should match the emulated context");

  const surfaces = [];
  const collect = async (surface, rootSelector) => {
    await settlePage(page);
    const controls = await page.evaluate(READ_CONTROLS, rootSelector ?? null);
    assert.ok(controls.length > 0, `${surface}: no controls were found to measure`);
    surfaces.push({ surface, controls });
  };

  await collect("shell");

  await page.keyboard.press("a");
  await page.getByRole("button", { name: /New measurement options/ }).click();
  const measurementFlyout = page.getByRole("dialog", { name: "New measurement options" });
  await measurementFlyout.waitFor();
  await collect("measurement flyout", ".tool-flyout.is-measurement");
  await page.keyboard.press("Escape");
  await measurementFlyout.waitFor({ state: "detached" });
  await page.keyboard.press("v");

  await page.locator('.dock-tab[data-tab="layers"]').click();
  await page.getByRole("button", { name: "Expand all", exact: true }).click();
  await collect("layers");
  await page.getByRole("button", { name: "Collapse all", exact: true }).click();

  await page.keyboard.press("Control+l");
  await page.locator(".markups-panel").waitFor({ state: "visible" });
  await collect("markups");
  await page.keyboard.press("Control+l");
  await page.locator(".markups-panel").waitFor({ state: "hidden" });

  await page.keyboard.press("Control+,");
  const projectSettings = page.getByRole("dialog", { name: "Project settings" });
  await projectSettings.waitFor();
  await collect("project-settings", ".modal");
  await page.keyboard.press("Escape");
  await projectSettings.waitFor({ state: "detached" });

  const fieldsDialog = await openCustomFieldsDialog(page);
  await collect("fields", ".modal");
  await page.keyboard.press("Escape");
  await fieldsDialog.waitFor({ state: "detached" });
  await closeReopenedSettings(page);

  const spacesDialog = await openSpacesRegister(page);
  await collect("spaces", ".modal");
  await page.keyboard.press("Escape");
  await spacesDialog.waitFor({ state: "detached" });

  await openMarkupsItem(page, "item_floor_living");
  await collect("fields-inspector", ".selection-section");

  await openSummaryTab(page);
  await collect("summary", ".schedules-panel");
  const placement = await openSchedulePlacementDialog(page);
  await collect("schedule-placement", ".modal");
  await page.keyboard.press("Escape");
  await placement.waitFor({ state: "detached" });
  const builder = await openScheduleBuilder(page);
  await collect("schedule-builder", ".modal");
  await page.keyboard.press("Escape");
  await builder.waitFor({ state: "detached" });
  const csv = await openScheduleCsvImport(page);
  await collect("schedule-csv", ".modal");
  await page.keyboard.press("Escape");
  await csv.waitFor({ state: "detached" });
  await openPlacedTableInspector(page);
  await collect("schedule-inspector", ".selection-section");

  const HUB_TABS = ["takeoff-objects", "takeoff-fields", "takeoff-tables", "takeoff-cards"];
  for (const [index, surface] of HUB_TABS.entries()) {
    const hub = await openTakeoffSettings(page, index);
    await collect(surface, ".modal");
    await page.keyboard.press("Escape");
    await hub.waitFor({ state: "detached" });
  }
  await setLanguage(page, "sv");
  for (const [index, surface] of HUB_TABS.entries()) {
    const hub = await openTakeoffSettings(page, index);
    await collect(`${surface}-sv`, ".modal");
    await page.keyboard.press("Escape");
    await hub.waitFor({ state: "detached" });
  }
  await setLanguage(page, "en");

  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  const preferences = page.getByRole("dialog", { name: "Preferences" });
  await preferences.waitFor();
  await collect("preferences", ".modal");
  await page.keyboard.press("Escape");
  await preferences.waitFor({ state: "detached" });

  await page.keyboard.press("Control+Alt+q");
  const quantities = page.getByRole("dialog");
  await quantities.waitFor();
  await collect("quantities", ".modal");
  await page.keyboard.press("Escape");
  await quantities.waitFor({ state: "detached" });

  assert.deepEqual(pageErrors, [], "the touch-target run should not raise page errors");

  const failures = touchTargetFailures(
    surfaces.flatMap((entry) =>
      entry.controls.map((control) => ({ ...control, surface: entry.surface })),
    ),
    TOUCH_TARGET_MIN_PX,
  );
  const total = surfaces.reduce((sum, entry) => sum + entry.controls.length, 0);
  for (const entry of surfaces) {
    console.log(`${entry.surface}: ${entry.controls.length} visible control(s) measured.`);
  }
  for (const failure of failures) console.error(formatTouchTargetFailure(failure));
  if (failures.length > 0) {
    console.error(
      `Touch-target gate failed: ${failures.length} of ${total} controls are below ` +
        `${TOUCH_TARGET_MIN_PX}×${TOUCH_TARGET_MIN_PX} CSS px on a coarse pointer.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Touch-target gate passed: ${total} controls across ${surfaces.length} surfaces are at least ` +
        `${TOUCH_TARGET_MIN_PX}×${TOUCH_TARGET_MIN_PX} CSS px with ${TOUCH_TARGET_EMULATION}.`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (vite) await vite.stop();
}

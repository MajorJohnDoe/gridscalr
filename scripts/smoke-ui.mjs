import assert from "node:assert/strict";
import {
  launchBrowser,
  openDemoProject,
  repoRoot,
  startVite,
  waitForApp,
  waitForToastsGone,
} from "./ui-harness.mjs";

const port = Number(process.env.GRIDSCALR_UI_PORT ?? 1420);
const pageErrors = [];
let browser;
let vite;

try {
  vite = await startVite({ port });
  browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  const project = await openDemoProject(page, { base: vite.base });
  assert.equal(project.name, "Riverside House - Takeoff");
  assert.equal(await page.locator(".page-card").count(), 2, "expected two page cards");

  const autosave = await page.evaluate(async () => {
    const preview = localStorage.getItem("gridscalr.autosave.meta.v1");
    const legacy = localStorage.getItem("gridscalr.autosave.v1");
    const record = await new Promise((resolve) => {
      const request = indexedDB.open("gridscalr", 1);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("autosave", "readonly");
        const get = transaction.objectStore("autosave").get("current");
        get.onsuccess = () => {
          database.close();
          resolve(Boolean(get.result));
        };
        get.onerror = () => {
          database.close();
          resolve(false);
        };
      };
      request.onerror = () => resolve(false);
    });
    return { preview, legacy, record };
  });
  assert.ok(autosave.preview, "autosave metadata should be present");
  assert.equal(autosave.record, true, "the recovery snapshot should be stored in IndexedDB");
  assert.equal(
    autosave.legacy,
    null,
    "the legacy localStorage snapshot should be removed after migration",
  );
  assert.equal(
    await page.getByText("Editable", { exact: true }).count(),
    0,
    "the old Editable terminology should be gone",
  );
  await page.getByRole("button", { name: "Unlocked" }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Undo" }).isDisabled(),
    true,
    "undo should start disabled on a freshly loaded project",
  );
  assert.equal(
    await page.getByRole("button", { name: "Redo" }).isDisabled(),
    true,
    "redo should start disabled on a freshly loaded project",
  );

  const assertContextBarFits = async (label) => {
    const size = await page.locator(".context-bar").evaluate((bar) => ({
      scrollWidth: bar.scrollWidth,
      clientWidth: bar.clientWidth,
    }));
    assert.ok(
      size.scrollWidth <= size.clientWidth + 1,
      `${label}: context bar overflows (${size.scrollWidth}px content in ${size.clientWidth}px)`,
    );
  };

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(250);

  for (const [key, label] of [
    ["v", "Select"],
    ["h", "Pan"],
    ["k", "Calibrate"],
    ["l", "Length"],
    ["a", "Area"],
    ["c", "Count"],
    ["p", "Pen"],
    ["i", "Line"],
    ["u", "Arrow"],
    ["r", "Rectangle"],
    ["o", "Ellipse"],
    ["g", "Highlight"],
    ["t", "Text"],
    ["d", "Revision cloud"],
    ["n", "Callout"],
    ["s", "Stamp"],
    ["y", "Revision delta"],
  ]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(80);
    await assertContextBarFits(label);
  }

  await page.keyboard.press("a");
  await page.locator(".context-tool", { hasText: "Area" }).waitFor();
  await assertContextBarFits("Area");

  const areaMode = page.locator(".area-mode-toggle");
  await areaMode.getByRole("button", { name: "Deduct", exact: true }).click();
  assert.equal(
    await areaMode
      .getByRole("button", { name: "Deduct", exact: true })
      .getAttribute("aria-pressed"),
    "true",
    "the Deduct switch should mark the area mode",
  );
  assert.match(
    (await page.getByRole("button", { name: /New measurement options/ }).textContent()) ?? "",
    /Deduct/,
    "the New measurement summary should follow the Deduct switch",
  );
  await areaMode.getByRole("button", { name: "Add", exact: true }).click();
  assert.equal(
    await areaMode.getByRole("button", { name: "Add", exact: true }).getAttribute("aria-pressed"),
    "true",
    "the Add switch should restore additive areas",
  );

  await page.getByRole("button", { name: /New measurement options/ }).click();
  const measureOptions = page.getByRole("dialog", { name: "New measurement options" });
  await measureOptions.waitFor();
  assert.equal(
    await page.evaluate(() => Boolean(document.activeElement?.closest(".measure-options"))),
    true,
    "focus should move into the New measurement popover",
  );
  await measureOptions.getByLabel("Area shape").selectOption("rectangle");
  await measureOptions.getByLabel("Area mode").selectOption("subtract");
  await page.keyboard.press("Escape");
  await measureOptions.waitFor({ state: "detached" });
  assert.match(
    (await page.getByRole("button", { name: /New measurement options/ }).textContent()) ?? "",
    /Rectangle · Deduct/,
    "the New measurement button should summarise the active area mode",
  );
  await assertContextBarFits("Area options applied");

  await page.getByRole("button", { name: /Canvas options/ }).click();
  const canvasOptions = page.getByRole("dialog", { name: "Canvas options" });
  await canvasOptions.waitFor();
  assert.equal(
    await page.evaluate(() => Boolean(document.activeElement?.closest(".canvas-options"))),
    true,
    "focus should move into the Canvas popover",
  );
  const gridToggle = canvasOptions.getByRole("button", { name: "Grid" });
  assert.equal(await gridToggle.getAttribute("aria-pressed"), "false");
  await gridToggle.click();
  assert.equal(
    await canvasOptions.getByRole("button", { name: "Grid" }).getAttribute("aria-pressed"),
    "true",
  );
  await page.keyboard.press("Escape");
  await canvasOptions.waitFor({ state: "detached" });

  await page.keyboard.press("d");
  await page.locator(".context-tool", { hasText: "Revision cloud" }).waitFor();
  await assertContextBarFits("Revision cloud");
  await page.getByRole("button", { name: "Choose variants for Revision cloud" }).click();
  const variants = page.getByRole("menu", { name: "Revision cloud variants" });
  await variants.waitFor();
  await page.keyboard.press("Escape");
  await variants.waitFor({ state: "detached" });

  await page.keyboard.press("Control+Shift+M");
  const measurements = page.getByRole("dialog");
  await measurements.waitFor();
  const rows = await measurements.locator(".markup-row").count();
  assert.ok(rows >= 14, `expected at least 14 measurements on page 1, got ${rows}`);
  await page.locator('[data-item-id="item_floor_living"]').click();
  await measurements.waitFor({ state: "detached" });

  const undo = page.getByRole("button", { name: "Undo" });
  const redo = page.getByRole("button", { name: "Redo" });
  assert.equal(await undo.isEnabled(), true, "undo should be enabled after earlier edits");
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(100);
  assert.equal(await undo.isEnabled(), true, "undo should stay enabled after a nudge");
  await undo.click();
  await page.waitForTimeout(100);
  assert.equal(await redo.isEnabled(), true, "redo should enable after undo");
  await redo.click();

  await page.getByRole("button", { name: "Layers" }).click();
  const measureLayer = page.locator(".layer-row").filter({ hasText: "Measurements" }).first();
  await measureLayer.getByRole("button", { name: /Expand Measurements/ }).click();
  const layerItems = page.locator(".layer-items .layer-item-row");
  await layerItems.first().waitFor();
  assert.ok(
    (await layerItems.count()) >= 9,
    `expected the measurement layer to list its items, got ${await layerItems.count()}`,
  );
  await layerItems.filter({ hasText: "Living floor" }).first().click();
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.ui.selection[0]?.itemId),
    "item_floor_living",
    "clicking a layer item should select it",
  );
  await measureLayer.click({ button: "right" });
  const layerMenu = page.locator(".popover");
  await layerMenu.waitFor();
  await layerMenu.getByRole("button", { name: /Rename/ }).waitFor();
  await page.keyboard.press("Escape");
  await layerMenu.waitFor({ state: "detached" });

  await page.keyboard.press("Control+Alt+q");
  const quantities = page.getByRole("dialog");
  await quantities.waitFor();
  assert.ok(
    (await quantities.locator(".quantity-category").count()) >= 1,
    "expected at least one quantity category",
  );
  await page.keyboard.press("Escape");
  await quantities.waitFor({ state: "detached" });

  await page.keyboard.press("F1");
  const help = page.getByRole("dialog");
  await help.waitFor();
  assert.equal(await help.getByRole("tab").count(), 4, "expected four help topics");
  await help.getByRole("tab", { name: "Workflows" }).click();
  await help.getByText("Operations technician (drifttekniker)").first().waitFor();
  for (let index = 0; index < 20; index += 1) await page.keyboard.press("Tab");
  assert.equal(
    await page.evaluate(() => Boolean(document.activeElement?.closest(".modal"))),
    true,
    "Tab should stay inside the modal",
  );
  await page.keyboard.press("Escape");
  await help.waitFor({ state: "detached" });

  await page.keyboard.press("v");
  await page.locator(".context-tool", { hasText: "Select" }).waitFor();
  await waitForApp(page);

  const downloadPromise = page.waitForEvent("download");
  await page.keyboard.press("Control+s");
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /\.gridscalr$/, "expected a .gridscalr download");
  await waitForToastsGone(page);

  const exportDownload = async (label) => {
    await page.getByRole("menuitem", { name: "File" }).click();
    await page.getByRole("menuitem", { name: /^Export/ }).click();
    const pending = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: label }).click();
    return pending;
  };

  const markupsCsv = await exportDownload("Markups to CSV");
  assert.match(markupsCsv.suggestedFilename(), /-markups\.csv$/, "expected a markups CSV export");
  const projectJson = await exportDownload("Project to JSON");
  assert.match(projectJson.suggestedFilename(), /\.json$/, "expected a project JSON export");
  const quantityCsv = await exportDownload("Quantities to CSV");
  assert.match(
    quantityCsv.suggestedFilename(),
    /-quantities\.csv$/,
    "expected a quantity CSV export",
  );
  const quantityPdf = await exportDownload("Quantity report (PDF)");
  assert.match(
    quantityPdf.suggestedFilename(),
    /-quantities\.pdf$/,
    "expected a quantity PDF export",
  );

  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /^Export/ }).click();
  const drawingPending = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Drawing PDF…" }).click();
  const drawingDialog = page.getByRole("dialog");
  await drawingDialog.waitFor();
  await drawingDialog.getByRole("button", { name: "Export" }).click();
  const drawingPdf = await drawingPending;
  assert.match(drawingPdf.suggestedFilename(), /-markups\.pdf$/, "expected a drawing PDF export");
  await waitForToastsGone(page);

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("; ")}`);
  console.log(`UI smoke passed: ${repoRoot}`);
} finally {
  await browser?.close();
  await vite?.stop();
}

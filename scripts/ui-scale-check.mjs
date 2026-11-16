import assert from "node:assert/strict";
import {
  UI_SCALE_MIN_CANVAS_PX,
  UI_SCALE_REGIONS,
  uiScaleViewports,
} from "./accessibility-rules.mjs";
import {
  closeReopenedSettings,
  launchBrowser,
  openCustomFieldsDialog,
  openDemoProject,
  seedCustomField,
  settlePage,
  startVite,
} from "./ui-harness.mjs";

/**
 * UI-scale check.
 *
 * OS scaling is emulated as the CSS viewport the reference 1920 × 1080 window
 * leaves at 100 %, 150 % and 200 %: 1920 × 1080, 1280 × 720 and 960 × 540.
 * At each scale the shell must keep its primary regions free of horizontal
 * overflow, leave a usable canvas, keep every menu item inside the window and
 * open its dialogs inside the viewport. Device-pixel rendering at a fractional
 * device scale factor is not observable in the browser fallback and stays in
 * the manual checklist.
 */
const port = Number(process.env.GRIDSCALR_UI_SCALE_PORT ?? 1440);
const viewports = uiScaleViewports();

let browser;
let vite;

async function readShell(page, label) {
  await settlePage(page);
  const shell = await page.evaluate(
    ({ regions, minCanvas }) => {
      const measure = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          overflow: node.scrollWidth - node.clientWidth,
        };
      };
      return {
        docScroll: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        canvas: measure(".canvas-host"),
        regions: regions.map((region) => ({ ...region, size: measure(region.selector) })),
        minCanvas,
      };
    },
    { regions: UI_SCALE_REGIONS, minCanvas: UI_SCALE_MIN_CANVAS_PX },
  );
  assert.ok(
    shell.docScroll <= shell.innerWidth,
    `${label}: the shell overflows the window horizontally (${shell.docScroll} > ${shell.innerWidth})`,
  );
  for (const region of shell.regions) {
    assert.ok(region.size, `${label}: ${region.label} is missing`);
    assert.ok(
      region.size.overflow <= 1,
      `${label}: ${region.label} clips ${region.size.overflow}px horizontally`,
    );
  }
  assert.ok(
    shell.canvas?.width >= shell.minCanvas,
    `${label}: the canvas is only ${shell.canvas?.width}px wide (minimum ${shell.minCanvas})`,
  );
  return shell;
}

async function assertMenusFit(page, label) {
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.locator(".menu-panel").first().waitFor();
  // Open the Export submenu so both levels are measured.
  await page.locator(".menu-item.menu-submenu", { hasText: "Export" }).hover();
  await page.waitForTimeout(150);
  const panels = await page.evaluate(() =>
    [...document.querySelectorAll(".menu-panel")].map((panel) => {
      const rect = panel.getBoundingClientRect();
      const items = [...panel.querySelectorAll(".menu-item")].map((item) => {
        const itemRect = item.getBoundingClientRect();
        return { label: (item.textContent ?? "").trim().slice(0, 40), bottom: itemRect.bottom };
      });
      return {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        items,
      };
    }),
  );
  assert.ok(panels.length >= 2, `${label}: the File and Export menus should both be open`);
  for (const panel of panels) {
    assert.ok(
      panel.left >= 0 &&
        panel.top >= 0 &&
        panel.right <= page.viewportSize().width &&
        panel.bottom <= page.viewportSize().height,
      `${label}: a menu panel sits outside the window (${panel.left},${panel.top} → ${panel.right},${panel.bottom})`,
    );
    for (const item of panel.items) {
      assert.ok(
        item.bottom <= page.viewportSize().height,
        `${label}: the menu item "${item.label}" is below the window`,
      );
    }
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
}

async function assertDialogFits(page, label, open, name) {
  await open();
  const dialog = name ? page.getByRole("dialog", { name }) : page.getByRole("dialog");
  await dialog.waitFor();
  await settlePage(page);
  const box = await dialog.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom),
      scroll: node.scrollHeight - node.clientHeight,
    };
  });
  const viewport = page.viewportSize();
  assert.ok(
    box.left >= 0 && box.top >= 0 && box.right <= viewport.width && box.bottom <= viewport.height,
    `${label}: the dialog sits outside the window (${box.left},${box.top} → ${box.right},${box.bottom})`,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  return box;
}

try {
  vite = await startVite({ port });
  browser = await launchBrowser();
  const results = [];
  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      colorScheme: "dark",
    });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await openDemoProject(page, { base: vite.base });
    await seedCustomField(page);
    const shell = await readShell(page, viewport.label);
    await assertMenusFit(page, viewport.label);
    const settings = await assertDialogFits(
      page,
      `${viewport.label} Project settings`,
      () => page.keyboard.press("Control+,"),
      "Project settings",
    );
    const fields = await assertDialogFits(
      page,
      `${viewport.label} Custom fields`,
      () => openCustomFieldsDialog(page),
      "Custom fields",
    );
    await closeReopenedSettings(page);
    const help = await assertDialogFits(page, `${viewport.label} Help`, () =>
      page.keyboard.press("F1"),
    );
    assert.deepEqual(pageErrors, [], `${viewport.label}: the UI-scale check raised page errors`);
    results.push({
      scale: viewport.label,
      viewport: `${viewport.width}×${viewport.height}`,
      canvas: shell.canvas?.width,
      settings: `${settings.left},${settings.top}–${settings.right},${settings.bottom}`,
      fields: `${fields.left},${fields.top}–${fields.right},${fields.bottom}`,
      help: `${help.left},${help.top}–${help.right},${help.bottom}`,
    });
    await page.close();
  }
  for (const result of results) {
    console.log(
      `UI scale ${result.scale} (${result.viewport} CSS px): canvas ${result.canvas}px, ` +
        `Project settings ${result.settings}, Custom fields ${result.fields}, ` +
        `Help ${result.help}, no overflow.`,
    );
  }
  console.log(
    `UI-scale check passed: ${viewports.length} scales, menus and dialogs stay reachable.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (vite) await vite.stop();
}

/**
 * Theme preview capture.
 *
 * Renders the deterministic demo project in the browser fallback, opens the
 * Layers panel, a selection in Properties and the Markups table, then injects
 * the candidate palettes from docs/theme-preview and captures review images.
 *
 * This script does not ship a theme: it only stacks an override stylesheet on
 * top of the current dark theme so the design can be reviewed before the real
 * token work lands. The light palette also softens the page shadow that
 * CanvasView paints for the moment; the real implementation will read that
 * colour from a token instead.
 *
 * Usage:
 *   node scripts/theme-preview.mjs
 *   node scripts/theme-preview.mjs --themes=light
 */
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  launchBrowser,
  openDemoProject,
  openMarkupsItem,
  repoRoot as root,
  startVite,
  waitForToastsGone,
} from "./ui-harness.mjs";

const previewDir = resolve(root, "docs", "theme-preview");
const port = Number(process.env.GRIDSCALR_THEME_PORT ?? 1421);
const viewport = { width: 1920, height: 1080 };

const requested = process.argv
  .find((arg) => arg.startsWith("--themes="))
  ?.slice("--themes=".length);
const THEMES = (requested ? requested.split(",") : ["light", "navy"]).map((name) => name.trim());

/** Chrome CSS is shared by both palettes and keeps Slate as its fallback. */
const chrome = await readFile(resolve(previewDir, "chrome.css"), "utf8");

async function applyTheme(page, theme) {
  const palette = await readFile(resolve(previewDir, `${theme}.css`), "utf8");
  await page.evaluate(
    ({ paletteCss, chromeCss, name }) => {
      document.querySelectorAll("style[data-theme-preview]").forEach((node) => node.remove());
      const style = document.createElement("style");
      style.dataset.themePreview = name;
      style.textContent = `${paletteCss}\n${chromeCss}`;
      document.head.append(style);
      // CanvasView paints the page shadow itself; a lighter wash matches a
      // light stage until the real implementation reads it from a token.
      window.__themePreviewShadow = name === "light" ? "rgba(20, 34, 52, 0.22)" : null;
    },
    { paletteCss: palette, chromeCss: chrome, name: theme },
  );
  await page.waitForTimeout(250);
}

async function closeFloatingUi(page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const open = await page.evaluate(
      () =>
        document.querySelectorAll(".menu-panel, .tool-flyout, .measure-options, .popover").length,
    );
    if (open === 0) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(120);
  }
}

async function openFloatingUi(page) {
  // The options button only exists for measurement tools, so switch to Length.
  await page.keyboard.press("l");
  await page.waitForTimeout(250);
  // The measurement options popover toggles; only open it when it is closed.
  if ((await page.locator(".measure-options").count()) === 0) {
    await page.locator(".context-measure-options").dispatchEvent("click");
    await page.waitForTimeout(150);
  }
  // A contextmenu event opens the tool family flyout without a mouse-down,
  // which would close the other floating panels.
  if ((await page.locator(".tool-flyout").count()) === 0) {
    await page.locator('[data-tool-group="circle-arc"]').dispatchEvent("contextmenu");
    await page.waitForTimeout(150);
  }
  if ((await page.locator(".menu-panel").count()) === 0) {
    await page.locator('.menu-trigger[data-menu="settings"]').dispatchEvent("click");
    await page.waitForTimeout(200);
  }
}

async function prepareStage(page, base) {
  await openDemoProject(page, { base });
  // Put a measured floor area in Properties and leave it selected.
  await openMarkupsItem(page, "item_floor_living");
  await page.waitForTimeout(150);

  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.waitForTimeout(150);
  const measureLayer = page.locator(".layer-row").filter({ hasText: "Measurements" }).first();
  const expand = measureLayer.getByRole("button", { name: /Expand Measurements/ });
  if ((await expand.count()) > 0) await expand.click();
  await page.waitForTimeout(150);

  // Reopen the Markups table so Layers, Properties and Markups are visible together.
  await page.keyboard.press("Control+l");
  await page.locator(".markups-panel").waitFor({ state: "visible" });
  await page.waitForTimeout(250);
  await waitForToastsGone(page);
}

const vite = await startVite({ port });
const base = vite.base;
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  // Remap only the page shadow that CanvasView draws around the sheet.
  await page.addInitScript(() => {
    const proto = CanvasRenderingContext2D.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "shadowColor");
    if (!descriptor?.set) return;
    Object.defineProperty(proto, "shadowColor", {
      configurable: true,
      get() {
        return descriptor.get.call(this);
      },
      set(value) {
        const override = window.__themePreviewShadow;
        if (override && value === "rgba(0,0,0,0.55)") value = override;
        descriptor.set.call(this, value);
      },
    });
  });

  await prepareStage(page, base);
  await mkdir(previewDir, { recursive: true });

  for (const theme of THEMES) {
    await applyTheme(page, theme);
    await closeFloatingUi(page);
    await page.screenshot({ path: resolve(previewDir, `${theme}-workspace.png`) });

    await openFloatingUi(page);
    await page.screenshot({ path: resolve(previewDir, `${theme}-menus.png`) });
    console.log(`captured ${theme}`);
  }
} finally {
  await browser.close();
  await vite.stop();
}

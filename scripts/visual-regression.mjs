import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  launchBrowser,
  openDemoProject,
  openMarkupsItem,
  repoRoot,
  settlePage,
  startVite,
  waitForToastsGone,
} from "./ui-harness.mjs";

const port = Number(process.env.GRIDSCALR_VISUAL_PORT ?? 1420);
const tolerance = {
  maxDiffPixels: Number(process.env.GRIDSCALR_VISUAL_MAX_PIXELS ?? 300),
  maxChannelDelta: Number(process.env.GRIDSCALR_VISUAL_MAX_DELTA ?? 12),
};
const baselineDir = resolve(repoRoot, "docs", "screenshots");
const failureDir = resolve(repoRoot, "visual-regression-failures");

let browser;
let vite;
let failed = false;

async function compareScreenshot(page, file, actual) {
  const baseline = await readFile(resolve(baselineDir, file));
  const result = await page.evaluate(
    async ({ actualBase64, baselineBase64 }) => {
      const load = (src) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("Could not decode a PNG screenshot."));
          image.src = `data:image/png;base64,${src}`;
        });
      const [actualImage, baselineImage] = await Promise.all([
        load(actualBase64),
        load(baselineBase64),
      ]);
      if (
        actualImage.width !== baselineImage.width ||
        actualImage.height !== baselineImage.height
      ) {
        return {
          sizeMismatch: true,
          width: actualImage.width,
          height: actualImage.height,
          baselineWidth: baselineImage.width,
          baselineHeight: baselineImage.height,
        };
      }
      const canvas = document.createElement("canvas");
      canvas.width = actualImage.width;
      canvas.height = actualImage.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Could not create a comparison canvas.");
      context.drawImage(actualImage, 0, 0);
      const actualPixels = context.getImageData(0, 0, canvas.width, canvas.height);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(baselineImage, 0, 0);
      const baselinePixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const diff = context.createImageData(canvas.width, canvas.height);
      let diffPixels = 0;
      let maxChannelDelta = 0;
      for (let index = 0; index < actualPixels.data.length; index += 4) {
        let pixelDelta = 0;
        for (let channel = 0; channel < 3; channel += 1) {
          const delta = Math.abs(
            actualPixels.data[index + channel] - baselinePixels.data[index + channel],
          );
          pixelDelta = Math.max(pixelDelta, delta);
        }
        if (pixelDelta > 0) {
          diffPixels += 1;
          maxChannelDelta = Math.max(maxChannelDelta, pixelDelta);
          diff.data[index] = 255;
          diff.data[index + 1] = 0;
          diff.data[index + 2] = 0;
          diff.data[index + 3] = 255;
        } else {
          const shade = Math.round(baselinePixels.data[index] * 0.35 + 190);
          diff.data[index] = shade;
          diff.data[index + 1] = shade;
          diff.data[index + 2] = shade;
          diff.data[index + 3] = 255;
        }
      }
      context.putImageData(diff, 0, 0);
      return {
        width: canvas.width,
        height: canvas.height,
        diffPixels,
        maxChannelDelta,
        diffDataUrl: canvas.toDataURL("image/png"),
      };
    },
    { actualBase64: actual.toString("base64"), baselineBase64: baseline.toString("base64") },
  );

  if (result.sizeMismatch) {
    failed = true;
    console.error(
      `${file}: size ${result.width}×${result.height}, baseline ${result.baselineWidth}×${result.baselineHeight}`,
    );
    await saveFailure(file, actual);
    return;
  }
  if (
    result.diffPixels > tolerance.maxDiffPixels ||
    result.maxChannelDelta > tolerance.maxChannelDelta
  ) {
    failed = true;
    console.error(
      `${file}: ${result.diffPixels} pixels differ, max channel delta ${result.maxChannelDelta} ` +
        `(allowed ${tolerance.maxDiffPixels} / ${tolerance.maxChannelDelta})`,
    );
    await saveFailure(file, actual, result.diffDataUrl);
    return;
  }
  console.log(
    `${file}: ${result.diffPixels} differing pixels, max channel delta ${result.maxChannelDelta}`,
  );
}

async function saveFailure(file, actual, diffDataUrl) {
  await mkdir(failureDir, { recursive: true });
  await writeFile(resolve(failureDir, file.replace(/\.png$/, "-actual.png")), actual);
  if (diffDataUrl) {
    const base64 = diffDataUrl.replace(/^data:image\/png;base64,/, "");
    await writeFile(
      resolve(failureDir, file.replace(/\.png$/, "-diff.png")),
      Buffer.from(base64, "base64"),
    );
  }
}

try {
  await rm(failureDir, { recursive: true, force: true });
  vite = await startVite({ port });
  browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  page.on("pageerror", (error) => console.warn(`Page error: ${error.message}`));

  const capture = async (file) => {
    await page.mouse.move(2, 2);
    await settlePage(page);
    await page.waitForTimeout(60);
    const actual = await page.screenshot();
    await compareScreenshot(page, file, actual);
  };

  await openDemoProject(page, { base: vite.base });
  await waitForToastsGone(page);

  await openMarkupsItem(page, "item_floor_living");
  await capture("hero.png");

  await page.keyboard.press("Escape");
  await openMarkupsItem(page, "item_cloud_dock", "draw");
  await page.getByRole("button", { name: "Layers" }).click();
  await page.waitForTimeout(200);
  await capture("markups.png");

  await page.evaluate(() => window.__gridscalr.store.clearSelection());
  await page.keyboard.press("a");
  const measureLayer = page.locator(".layer-row").filter({ hasText: "Measurements" }).first();
  await measureLayer.getByRole("button", { name: /Expand Measurements/ }).click();
  await page.waitForTimeout(200);
  await measureLayer.getByRole("button", { name: /Collapse Measurements/ }).click();
  await page.keyboard.press("v");

  await page.keyboard.press("Control+Alt+q");
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Filter quantities by page").selectOption("all");
  await page.waitForTimeout(150);
  await capture("quantities.png");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });

  await page.keyboard.press("Control+,");
  await page.getByRole("dialog").waitFor();
  await page.getByRole("button", { name: /Manage count types/ }).click();
  const countTypesDialog = page.getByRole("dialog", { name: "Count types" });
  await countTypesDialog.getByLabel("New count type name").waitFor();
  await countTypesDialog.getByLabel("New count type name").fill("Socket");
  await countTypesDialog.getByLabel("Glyph for the new count type").selectOption("fixture");
  await countTypesDialog.getByRole("button", { name: "Add", exact: true }).click();
  await countTypesDialog.getByLabel("Count type name: Socket").waitFor();
  await page.waitForTimeout(300);
  await capture("count-types.png");

  assert.equal(failed, false, "Visual regression differences were found.");
  console.log(
    `Visual regression passed: 4 screens, tolerance ${tolerance.maxDiffPixels} px / ${tolerance.maxChannelDelta} channel.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (vite) await vite.stop();
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { docsSourceFingerprint } from "./docs-fingerprint.mjs";
import { resolve } from "node:path";
import {
  launchBrowser,
  openDemoProject,
  openMarkupsItem,
  repoRoot as root,
  startVite,
  waitForToastsGone,
} from "./ui-harness.mjs";

const screenshotDir = resolve(root, "docs", "screenshots");
const port = Number(process.env.GRIDSCALR_DOCS_PORT ?? 1420);
const viewport = { width: 1920, height: 1080 };
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

const shots = [
  {
    file: "hero.png",
    title: "Measurement takeoff",
    alt: "GridScalr showing a calibrated industrial floor plan with warehouse, office and workshop measurements and the Properties panel.",
    description:
      "A calibrated industrial takeoff with rectangle areas, counts, a deduction and drawing annotations.",
  },
  {
    file: "measure.png",
    title: "Measure and annotate",
    alt: "GridScalr with the Length tool active, the Layers panel open and the context bar showing the target layer, New measurement options and Canvas controls.",
    description: "Measurement and drawing tools share one canvas but stay on separate layer types.",
  },
  {
    file: "markups.png",
    title: "Markups and layers",
    alt: "GridScalr Layers panel with a revision cloud around a loading dock, a callout at the entrance and an inspected stamp.",
    description: "Revision clouds, callouts and status stamps live on drawing layers.",
  },
  {
    file: "layers.png",
    title: "Expanded layer items",
    alt: "GridScalr Layers panel with page-scoped layers, a measurement layer expanded to show items on the current page, and the Add/Deduct switch in the context bar.",
    description:
      "Expand a layer to inspect every item, select it on the plan and choose additive or deduction areas.",
  },
  {
    file: "quantities.png",
    title: "Quantities",
    alt: "The GridScalr Quantities dialog showing gross, deduction, net, waste and order quantities by category and room.",
    description: "Live quantities with deductions, waste and rounding for procurement.",
  },
  {
    file: "markups-list.png",
    title: "Markups list",
    alt: "The GridScalr Markups panel listing all three pages with name, type, page, layer, value, category and room columns.",
    description:
      "A docked, project-wide list for finding, filtering, renaming and navigating every measurement and drawing.",
  },
  {
    file: "export.png",
    title: "Drawing export",
    alt: "The GridScalr Drawing PDF export dialog with page range, crop area, layer selection, labels and legend options.",
    description:
      "Export visible markups as a flattened drawing PDF without modifying the source drawing.",
  },
  {
    file: "workflows-help.png",
    title: "Workflows in the help dialog",
    alt: "The GridScalr Help dialog open on the Workflows tab with guides for operations technicians and technical property managers.",
    description: "Task-oriented workflows sit beside the full user guide, shortcuts and About.",
  },
];

await mkdir(screenshotDir, { recursive: true });

let browser;
let vite;
try {
  vite = await startVite({ port });
  browser = await launchBrowser();
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });

  page.on("pageerror", (error) => {
    console.warn(`Page error: ${error.message}`);
  });

  const capture = async (file) => {
    await page.mouse.move(2, 2);
    await page.waitForTimeout(60);
    await page.screenshot({ path: resolve(screenshotDir, file) });
  };

  await openDemoProject(page, { base: vite.base });
  await waitForToastsGone(page);

  await openMarkupsItem(page, "item_floor_living");
  await capture("hero.png");

  await page.keyboard.press("Escape");
  await page.keyboard.press("l");
  await page.waitForTimeout(200);
  await capture("measure.png");

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
  await capture("layers.png");
  await measureLayer.getByRole("button", { name: /Collapse Measurements/ }).click();
  await page.keyboard.press("v");

  await page.keyboard.press("Control+Alt+q");
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Filter quantities by page").selectOption("all");
  await page.waitForTimeout(150);
  await capture("quantities.png");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });

  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /^Export/ }).click();
  await page.getByRole("menuitem", { name: "Drawing PDF…" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("checkbox", { name: /^Legend/ }).check();
  await page.waitForTimeout(300);
  await capture("export.png");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });

  await page.keyboard.press("Control+Shift+M");
  const markupsPanel = page.locator(".markups-panel");
  await markupsPanel.waitFor({ state: "visible" });
  await markupsPanel.getByLabel("Filter markups by page").selectOption("all");
  await markupsPanel.getByLabel("Filter markups by type").selectOption("all");
  await markupsPanel.locator('[data-item-id="item_floor_living"] .markups-item-label').click();
  await page.waitForTimeout(250);
  await capture("markups-list.png");
  await markupsPanel.getByRole("button", { name: "Close Markups list" }).click();
  await markupsPanel.waitFor({ state: "hidden" });

  await page.keyboard.press("F1");
  const helpDialog = page.getByRole("dialog");
  await helpDialog.waitFor();
  await helpDialog.getByRole("tab", { name: "Workflows" }).click();
  const helpSearch = helpDialog.getByLabel("Search help");
  await helpSearch.fill("quantities");
  await page.waitForTimeout(150);
  if ((await helpDialog.locator(".help-search-result").count()) === 0) {
    throw new Error("Help search did not find the Quantities section.");
  }
  await helpSearch.fill("");
  await page.waitForTimeout(150);
  await capture("workflows-help.png");

  const helpImage = helpDialog.locator(".help-figure img").first();
  if ((await helpImage.count()) > 0) {
    await helpImage.scrollIntoViewIfNeeded();
    await helpImage.click();
    await page.locator(".help-lightbox").waitFor();
    await page.locator(".help-lightbox-close").click();
    await page.locator(".help-lightbox").waitFor({ state: "detached" });
  }
  await page.keyboard.press("Escape");
  await helpDialog.waitFor({ state: "detached" });

  const manifest = {
    generatedAt: new Date().toISOString(),
    appVersion: packageJson.version,
    sourceFingerprint: await docsSourceFingerprint(root),
    viewport,
    project: "fixtures/demo-project.gridscalr",
    screenshots: shots,
  };
  await writeFile(
    resolve(screenshotDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`Captured ${shots.length} screenshots in ${screenshotDir}`);
} finally {
  await browser?.close();
  await vite?.stop();
}

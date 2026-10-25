import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const screenshotDir = resolve(root, "docs", "screenshots");
const demoProject = resolve(root, "fixtures", "demo-project.gridscalr");
const samplePdf = resolve(root, "fixtures", "sample-plan.pdf");
const port = Number(process.env.GRIDSCALR_DOCS_PORT ?? 1420);
const base = `http://127.0.0.1:${port}`;
const viewport = { width: 1920, height: 1080 };
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));

const shots = [
  {
    file: "hero.png",
    title: "Measurement takeoff",
    alt: "GridScalr showing a calibrated floor plan with measurement labels, a selected living-area rectangle and the Properties panel.",
    description: "A calibrated takeoff with rectangle areas, counts, a deduction and drawing annotations.",
  },
  {
    file: "measure.png",
    title: "Measure and annotate",
    alt: "GridScalr with the Length tool active, the Layers panel open and the context bar showing the target layer and units.",
    description: "Measurement and drawing tools share one canvas but stay on separate layer types.",
  },
  {
    file: "markups.png",
    title: "Markups and layers",
    alt: "GridScalr Layers panel with a selected revision cloud, callout and inspected stamp visible on the plan.",
    description: "Revision clouds, callouts and status stamps live on drawing layers.",
  },
  {
    file: "quantities.png",
    title: "Quantities",
    alt: "The GridScalr Quantities dialog showing gross, deduction, net, waste and order quantities by category and room.",
    description: "Live quantities with deductions, waste and rounding for procurement.",
  },
  {
    file: "measurements.png",
    title: "Measurements list",
    alt: "The GridScalr Measurements dialog listing all pages with search, page and type filters, and row actions.",
    description: "Find, select and navigate every measurement and drawing across all pages.",
  },
  {
    file: "export.png",
    title: "Drawing export",
    alt: "The GridScalr Drawing PDF export dialog with page range, crop area, layer selection, labels and legend options.",
    description: "Export visible markups as a flattened drawing PDF without modifying the source drawing.",
  },
  {
    file: "workflows-help.png",
    title: "Workflows in the help dialog",
    alt: "The GridScalr Help dialog open on the Workflows tab with guides for operations technicians and technical property managers.",
    description: "Task-oriented workflows sit beside the full user guide, shortcuts and About.",
  },
];

let serverOutput = "";
const viteCommand = resolve(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "vite.cmd" : "vite",
);
const server = spawn(viteCommand, ["--port", String(port), "--strictPort"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, BROWSER: "none" },
  shell: process.platform === "win32",
});

server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Vite exited before the docs capture started.\n${serverOutput}`);
    }
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {
      // Keep waiting for Vite to listen.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Vite did not start within 30 seconds.\n${serverOutput}`);
}

async function waitForApp(page) {
  await page.locator(".app-shell").waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".canvas-loading")?.classList.contains("is-visible"),
  );
  await page.waitForTimeout(350);
}

async function openMeasurementsItem(page, itemId, kind = "all") {
  await page.keyboard.press("Control+Shift+M");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await page.getByLabel("Filter by item type").selectOption(kind);
  await page.locator(`[data-item-id="${itemId}"]`).click();
  await dialog.waitFor({ state: "detached" });
  await waitForApp(page);
}

await mkdir(screenshotDir, { recursive: true });

let browser;
try {
  await waitForServer();
  try {
    browser = await chromium.launch();
  } catch (error) {
    throw new Error(
      `Could not launch Chromium. Run "npx playwright install chromium" once and try again.\n${error}`,
    );
  }
  const page = await browser.newPage({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });

  page.on("pageerror", (error) => {
    console.warn(`Page error: ${error.message}`);
  });

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator(".app-shell").waitFor();

  const project = JSON.parse(await readFile(demoProject, "utf8"));
  await page.evaluate((payload) => {
    localStorage.setItem("gridscalr.autosave.v1", JSON.stringify(payload));
  }, { project, projectPath: null, savedAt: new Date().toISOString() });

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Restore last session" }).waitFor();

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Restore last session" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(samplePdf);

  await page.getByText("Riverside House - Takeoff").first().waitFor();
  await waitForApp(page);
  await page.waitForFunction(() => !document.querySelector(".toast"), null, { timeout: 7000 });

  await openMeasurementsItem(page, "item_floor_living");
  await page.screenshot({ path: resolve(screenshotDir, "hero.png") });

  await page.keyboard.press("Escape");
  await page.keyboard.press("l");
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(screenshotDir, "measure.png") });

  await page.keyboard.press("Escape");
  await openMeasurementsItem(page, "item_cloud_bath", "draw");
  await page.getByRole("button", { name: "Layers" }).click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: resolve(screenshotDir, "markups.png") });

  await page.keyboard.press("Control+Alt+q");
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Filter quantities by page").selectOption("all");
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(screenshotDir, "quantities.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });

  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /^Export/ }).click();
  await page.getByRole("menuitem", { name: "Drawing PDF…" }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("checkbox", { name: /^Legend/ }).check();
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(screenshotDir, "export.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });

  await page.keyboard.press("Control+Shift+M");
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Filter measurements by page").selectOption("all");
  await page.waitForTimeout(150);
  await page.screenshot({ path: resolve(screenshotDir, "measurements.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });

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
  await page.screenshot({ path: resolve(screenshotDir, "workflows-help.png") });

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
  if (server.exitCode === null) server.kill();
}

/**
 * Captures the marketing screenshots used by the website.
 *
 * `npm run site:capture` writes `docs/screenshots/site/<locale>/` for the
 * Swedish and English pages. The shots use the bundled demo project, a
 * calibrated page and a zoom where the drawing fills the canvas, so the
 * screenshot shows the work rather than an empty canvas.
 *
 * The Swedish set also translates the demo labels in memory (page names,
 * categories, the operation-card air names) and switches the interface to
 * Swedish. Nothing is written to the project file.
 *
 * These shots are separate from `npm run docs:capture`, which documents the
 * interface for the in-app help and always runs in English.
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DEMO_MEASURE_SCHEDULE_ID,
  launchBrowser,
  openDemoProject,
  settlePage,
  setLanguage,
  startVite,
  waitForApp,
  waitForToastsGone,
} from "./ui-harness.mjs";

const root = resolve(import.meta.dirname, "..");
const outRoot = resolve(root, "docs", "screenshots", "site");
const locales = process.argv.includes("--en")
  ? ["en"]
  : process.argv.includes("--sv")
    ? ["sv"]
    : ["sv", "en"];
const viewport = { width: 1920, height: 1080 };
const WEBP_QUALITY = 82;

const RENAMES = new Map([
  ["Ground floor", "Bottenvåning"],
  ["Mezzanine", "Mellanbjälklag"],
  ["Site plan", "Situationsplan"],
  ["Measurements", "Mätningar"],
  ["Site markups", "Markeringar"],
  ["Quantity schedule", "Mängdschema"],
  ["Outdoor air", "Uteluft"],
  ["Exhaust air", "Frånluft"],
  ["Supply air", "Tilluft"],
  ["Extract air", "Avluft"],
  ["Main building", "Huvudbyggnad"],
  ["Office", "Kontor"],
  ["Warehouse", "Lager"],
]);

const CATEGORIES = new Map([
  ["Floor", "Golv"],
  ["Wall", "Vägg"],
  ["Facade", "Fasad"],
  ["Other", "Övrigt"],
  ["Ground", "Mark"],
]);

function localize(value) {
  if (Array.isArray(value)) return value.map(localize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) out[key] = localize(entry);
    return out;
  }
  if (typeof value === "string") return RENAMES.get(value) ?? value;
  return value;
}

function localizeProject(project) {
  const out = localize(project);
  out.name = out.name.replace("Takeoff", "Mängdning");
  out.categories = out.categories.map((entry) => ({
    ...entry,
    name: CATEGORIES.get(entry.name) ?? entry.name,
  }));
  for (const layer of out.layers) {
    for (const item of layer.items) {
      if (CATEGORIES.has(item.category)) item.category = CATEGORIES.get(item.category);
    }
  }
  return out;
}

async function openProject(page, base, locale) {
  if (locale === "sv") {
    const project = localizeProject(
      JSON.parse(await readFile(resolve(root, "fixtures", "demo-project.gridscalr"), "utf8")),
    );
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator(".app-shell").waitFor();
    await page.evaluate(
      (payload) => localStorage.setItem("gridscalr.autosave.v1", JSON.stringify(payload)),
      { project, projectPath: null, savedAt: new Date().toISOString() },
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Recovery center" }).click();
    const dialog = page.getByRole("dialog", { name: "Recovery center" });
    await dialog.waitFor();
    const chooserPromise = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: "Restore selected" }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(resolve(root, "fixtures", "industrial-plan.pdf"));
    await page.getByText(project.name).first().waitFor();
    await waitForApp(page);
    await waitForToastsGone(page);
  } else {
    await openDemoProject(page, { base });
  }
}

const wait = (page, ms = 600) => page.waitForTimeout(ms);

async function setPage(page, number) {
  await page.evaluate((value) => window.__gridscalr.store.setPage(value), number);
  await wait(page, 700);
}

async function focusItem(page, itemId, zoom) {
  const result = await page.evaluate(
    ({ itemId, zoom }) => {
      const g = window.__gridscalr;
      const host = document.querySelector("#canvas-interaction")?.getBoundingClientRect();
      if (!host) return "no host";
      let bounds;
      let layerId;
      for (const layer of g.store.project.layers) {
        const item = layer.items.find((entry) => entry.id === itemId);
        if (!item) continue;
        layerId = layer.id;
        for (const point of item.points ?? []) {
          bounds ??= { minX: point.x, maxX: point.x, minY: point.y, maxY: point.y };
          bounds.minX = Math.min(bounds.minX, point.x);
          bounds.maxX = Math.max(bounds.maxX, point.x);
          bounds.minY = Math.min(bounds.minY, point.y);
          bounds.maxY = Math.max(bounds.maxY, point.y);
        }
      }
      if (!bounds) return "no item";
      g.store.setSelection({ layerId, itemId });
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      g.store.setView(zoom, host.width / 2 - cx * zoom, host.height / 2 - cy * zoom);
      return "ok";
    },
    { itemId, zoom },
  );
  if (result !== "ok") throw new Error(`focusItem(${itemId}): ${result}`);
  await wait(page, 700);
}

async function fitWholePage(page, factor) {
  await page.evaluate((factor) => {
    const g = window.__gridscalr;
    const host = document.querySelector("#canvas-interaction")?.getBoundingClientRect();
    const size = g.canvas.pageSize();
    if (!host || !size) return;
    const fit = Math.min((host.width - 56) / size.width, (host.height - 56) / size.height);
    const zoom = fit * factor;
    g.store.setView(
      zoom,
      (host.width - size.width * zoom) / 2,
      (host.height - size.height * zoom) / 2,
    );
  }, factor);
  await wait(page, 700);
}

async function captureSet(page, locale, outDir) {
  const cdp = await page.context().newCDPSession(page);
  const labels =
    locale === "sv"
      ? { view: "Visa", spaces: "Utrymmen…", spacesDialog: "Utrymmen" }
      : { view: "View", spaces: "Spaces…", spacesDialog: "Spaces" };

  if (locale === "sv") {
    await setLanguage(page, "sv");
    await wait(page, 800);
  }
  await page.locator('.dock-tab[data-tab="pages"]').click();

  const shoot = async (name) => {
    await settlePage(page);
    await wait(page, 300);
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "webp",
      quality: WEBP_QUALITY,
    });
    const file = name.replace(/\.png$/, ".webp");
    await writeFile(resolve(outDir, file), Buffer.from(data, "base64"));
    console.log(`  ${locale}/${file}`);
  };

  // 1. Room register.
  await page.getByRole("menuitem", { name: labels.view }).click();
  await page.getByRole("menuitem", { name: labels.spaces }).click();
  const spaces = page.getByRole("dialog", { name: labels.spacesDialog });
  await spaces.waitFor();
  await wait(page, 700);
  await shoot("spaces.png");
  await page.keyboard.press("Escape");
  await spaces.waitFor({ state: "detached" });

  // 2. Hero: warehouse area, drawing filling the canvas.
  await setPage(page, 1);
  await focusItem(page, "item_floor_living", 1);
  await shoot("hero.png");

  // 3. Order dialog.
  await page.keyboard.press("Control+Alt+q");
  const order = page.getByRole("dialog").first();
  await order.waitFor();
  await wait(page, 500);
  await shoot("order.png");
  await page.keyboard.press("Escape");
  await order.waitFor({ state: "detached" });

  // 4. Quantity table on the mezzanine page.
  await page.keyboard.press("Control+Alt+s");
  const panel = page.locator(".schedules-panel");
  await panel.waitFor({ state: "visible" });
  await panel.locator(".schedules-schedule-select").selectOption(DEMO_MEASURE_SCHEDULE_ID);
  await wait(page, 500);
  await setPage(page, 2);
  await focusItem(page, "item_floor_mezz", 0.86);
  await page.evaluate(() => {
    const wrap = document.querySelector(".schedules-panel .schedules-table-wrap");
    if (wrap) wrap.scrollTop = wrap.scrollHeight * 0.35;
  });
  await wait(page, 400);
  await shoot("table.png");
  await page.keyboard.press("Control+Alt+s");
  await panel.waitFor({ state: "detached" });

  // 5. Operation card with the Layers panel.
  await setPage(page, 4);
  await page.locator('.dock-tab[data-tab="layers"]').click();
  await fitWholePage(page, 0.96);
  await shoot("operation-card.png");

  // 6. Expanded measurement layer.
  await setPage(page, 1);
  await focusItem(page, "item_floor_living", 1);
  await page.evaluate(() => window.__gridscalr.store.clearSelection());
  await page.locator('.dock-tab[data-tab="layers"]').click();
  const layerName = locale === "sv" ? "Mätningar" : "Measurements";
  const layerRow = page.locator(".layer-row").filter({ hasText: layerName }).first();
  const expand = layerRow.getByRole("button", { name: /Expand|Expandera/ });
  if (await expand.count()) await expand.click();
  await wait(page, 600);
  await shoot("layers.png");

  // 7. Calibration and export.
  await setPage(page, 1);
  await fitWholePage(page, 0.95);
  const points = await page.evaluate(() => {
    const g = window.__gridscalr;
    const calibration = g.store.project.pages[0]?.state?.calibration;
    const host = document.querySelector("#canvas-interaction")?.getBoundingClientRect();
    if (!calibration || !host) return null;
    const toScreen = (point) => {
      const local = g.canvas.pageToScreen(point);
      return { x: host.left + local.x, y: host.top + local.y };
    };
    return { a: toScreen(calibration.p1), b: toScreen(calibration.p2) };
  });
  if (!points) throw new Error("page 1 has no calibration reference");
  await page.evaluate(() => window.__gridscalr.store.setTool("calibrate"));
  await page.mouse.click(points.a.x, points.a.y);
  await page.mouse.click(points.b.x, points.b.y);
  const calibration = page.getByRole("dialog").first();
  await calibration.waitFor();
  const input = calibration.locator("input").first();
  if (await input.count()) await input.fill("10");
  await wait(page, 400);
  await shoot("calibration.png");
  await page.keyboard.press("Escape");
  await calibration.waitFor({ state: "detached" });

  await page.evaluate(() => window.__gridscalr.store.setTool("select"));
  await wait(page, 300);
  await page.keyboard.press("Control+e");
  const exportItem = page.getByRole("menuitem", {
    name: locale === "sv" ? /Ritning/ : /Drawing/,
  });
  await exportItem.first().click();
  const exportDialog = page.getByRole("dialog").first();
  await exportDialog.waitFor();
  await wait(page, 500);
  await shoot("export.png");
}

const vite = await startVite({ port: Number(process.env.GRIDSCALR_SITE_PORT ?? 1448) });
const browser = await launchBrowser();
try {
  for (const locale of locales) {
    const outDir = resolve(outRoot, locale);
    await mkdir(outDir, { recursive: true });
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1, colorScheme: "dark" });
    page.on("pageerror", (error) => console.warn(`[${locale}] page error:`, error.message));
    try {
      await openProject(page, vite.base, locale);
      await captureSet(page, locale, outDir);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  await vite.stop();
}
console.log(`Site screenshots written to ${outRoot}`);

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectionPhotoDataUrl } from "./docs-capture-photo.mjs";
import {
  makeReferenceProject,
  openCompareProject,
  openDemoProject,
  openMarkupsItem,
  settlePage,
  waitForToastsGone,
} from "./ui-harness.mjs";

/**
 * Runs the documentation screenshot flow against an open demo project.
 *
 * `base` is the browser-fallback URL of the running Vite server; `outputDir`
 * receives the PNG files. The real capture points it at
 * `docs/screenshots`; the CI dry run points it at a temporary folder and never
 * touches the committed screenshots or `manifest.json`, so a renamed UI
 * locator fails the run without rewriting documentation (F-101).
 *
 * The steps are the check: every locator, label and dialog below is what the
 * documentation pass depends on.
 */
export async function captureDocumentation(page, { outputDir, base }) {
  await mkdir(outputDir, { recursive: true });

  const capture = async (file) => {
    await page.mouse.move(2, 2);
    await settlePage(page);
    await page.waitForTimeout(60);
    await page.screenshot({ path: resolve(outputDir, file) });
  };

  const selectTheme = async (theme) => {
    await page.locator('.menu-trigger[data-menu="settings"]').click();
    await page.getByRole("menuitem", { name: "Preferences…" }).click();
    const dialog = page.getByRole("dialog", { name: "Preferences" });
    await dialog.waitFor();
    await dialog.getByLabel("Theme").selectOption(theme);
    await page.waitForTimeout(120);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    await settlePage(page);
  };

  await openDemoProject(page, { base });
  await waitForToastsGone(page);

  await openMarkupsItem(page, "item_floor_living");
  await capture("hero.png");

  for (const theme of ["medium-grey", "light-green", "dark-grey", "jade", "navy"]) {
    await selectTheme(theme);
    await capture(`theme-${theme}.png`);
  }
  // The Light Green Layers surfaces are the phase 10 change; show the expanded
  // measurement section in the palette that used to keep the dark inset.
  await selectTheme("light-green");
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  const lightMeasureLayer = page.locator(".layer-row").filter({ hasText: "Measurements" }).first();
  await lightMeasureLayer.getByRole("button", { name: /Expand .?Measurements/ }).click();
  await page.waitForTimeout(250);
  await capture("layers-light-green.png");
  await lightMeasureLayer.getByRole("button", { name: /Collapse .?Measurements/ }).click();
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await selectTheme("medium-grey");

  await page.locator('.page-card[data-page="4"]').click();
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.waitForTimeout(500);
  await capture("operation-card.png");
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.locator('.page-card[data-page="1"]').click();
  await page.waitForTimeout(300);

  await page.keyboard.press("Escape");
  await page.keyboard.press("l");
  await page.waitForTimeout(200);
  await capture("measure.png");

  await page.keyboard.press("Escape");
  await openMarkupsItem(page, "item_cloud_dock", "draw");
  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.waitForTimeout(200);
  await capture("markups.png");

  await page.evaluate(() => window.__gridscalr.store.clearSelection());
  await page.keyboard.press("a");
  const measureLayer = page.locator(".layer-row").filter({ hasText: "Measurements" }).first();
  await measureLayer.getByRole("button", { name: /Expand .?Measurements/ }).click();
  await page.waitForTimeout(200);
  await capture("layers.png");
  await measureLayer.getByRole("button", { name: /Collapse .?Measurements/ }).click();
  await page.keyboard.press("v");

  await page.keyboard.press("Control+Alt+q");
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("Filter quantities by page").selectOption("all");
  await page.waitForTimeout(150);
  await capture("quantities.png");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });

  await page.keyboard.press("Control+,");
  const projectSettings = page.getByRole("dialog", { name: "Project settings" });
  await projectSettings.waitFor();
  await projectSettings.getByRole("button", { name: "Quantities", exact: true }).click();
  await page.getByRole("button", { name: /Manage count types/ }).click();
  const countTypesDialog = page.getByRole("dialog", { name: "Count types" });
  await countTypesDialog.getByLabel("New count type name").waitFor();
  await countTypesDialog.getByLabel("New count type name").fill("Socket");
  await countTypesDialog.getByLabel("Glyph for the new count type").selectOption("fixture");
  await countTypesDialog.getByRole("button", { name: "Add", exact: true }).click();
  await countTypesDialog.getByLabel("Count type name: Socket").waitFor();
  await page.waitForTimeout(300);
  await capture("count-types.png");
  await countTypesDialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog").waitFor();
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

  await page.evaluate(() => window.__gridscalr.app.openPackageDialogForDocs());
  await page.getByRole("dialog", { name: "Package project" }).waitFor();
  await page.waitForTimeout(250);
  await capture("package.png");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });

  await page.keyboard.press("Control+l");
  const markupsPanel = page.locator(".markups-panel");
  await markupsPanel.waitFor({ state: "visible" });
  await markupsPanel.getByLabel("Markups view").selectOption({ label: "Room review" });
  await markupsPanel.locator('[data-item-id="item_floor_living"] .markups-item-label').click();
  await markupsPanel.locator(".markups-table-wrap").evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.waitForTimeout(250);
  await capture("markups-list.png");

  await markupsPanel.getByRole("button", { name: "Columns" }).click();
  const countColumns = page.getByRole("dialog");
  await countColumns.waitFor();
  await countColumns.getByLabel("Count type").check();
  await countColumns.getByRole("button", { name: "Apply" }).click();
  await countColumns.waitFor({ state: "detached" });
  await markupsPanel.getByLabel("Group markups").selectOption("count-type");
  await page.waitForTimeout(250);
  await capture("count-schedule.png");

  if (await page.locator(".modal-backdrop").count()) {
    await page.keyboard.press("Escape");
    await page.locator(".modal-backdrop").waitFor({ state: "detached" });
  }

  await markupsPanel.getByLabel("Markups view").selectOption({ label: "Symbols & status" });
  await page.waitForTimeout(250);
  const discardView = page.getByRole("button", { name: "Discard changes" });
  if (await discardView.count()) await discardView.click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const store = window.__gridscalr.store;
    for (const layer of store.project.layers) {
      if (layer.items.some((item) => item.id === "item_symbol_extinguisher")) {
        store.setSelection({ layerId: layer.id, itemId: "item_symbol_extinguisher" });
        return;
      }
    }
    document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined;
  });
  await page.locator("#canvas-interaction").click({ position: { x: 8, y: 8 } });
  await page.waitForTimeout(150);
  await page.keyboard.press("b");
  await page.locator('[data-symbol-id="fire.extinguisher"]').click();
  await page.keyboard.press("Control+0");
  await page.waitForTimeout(250);
  await capture("symbols.png");
  await page.keyboard.press("Control+l");
  await markupsPanel.waitFor({ state: "hidden" });
  await page.keyboard.press("v");
  await page.evaluate(() => window.__gridscalr.store.clearSelection());
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.keyboard.press("Control+0");
  await page.waitForTimeout(150);
  await page.keyboard.press("Control+Shift+2");
  await page.waitForTimeout(350);
  await capture("split-view.png");
  await page.keyboard.press("Control+Shift+2");

  const referencePath = await makeReferenceProject();
  await openCompareProject(page, referencePath);
  await waitForToastsGone(page);
  await page.getByRole("button", { name: "Hide properties" }).click();
  await page.locator('.compare-mode[data-mode="overlay"]').click();
  await page.locator(".compare-opacity-input").fill("45");
  await page.locator(".compare-row").first().click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+0");
  await page.waitForTimeout(300);
  await capture("compare.png");
  await page.getByRole("button", { name: "Close comparison" }).click();
  await page.locator(".compare-panel").waitFor({ state: "detached" });

  await page.keyboard.press("Control+Shift+f");
  await page.locator(".search-panel").waitFor();
  await page.getByLabel("Search drawing text").fill("Office");
  await page.waitForFunction(() => document.querySelectorAll(".search-result").length > 0, null, {
    timeout: 15000,
  });
  await page.locator(".search-result").first().click();
  await page.waitForTimeout(300);
  await capture("search.png");
  await page.getByRole("button", { name: "Close search" }).click();
  await page.locator(".search-panel").waitFor({ state: "detached" });

  await page.evaluate(() => {
    window.__gridscalr.store.setPage(1);
    window.__gridscalr.store.setTool("select");
  });
  await page.keyboard.press("Control+0");
  await page.waitForTimeout(350);
  const calibrationPoints = await page.evaluate(() => {
    const calibration = window.__gridscalr.store.project.pages[0].state.calibration;
    if (!calibration || calibration.source !== "reference") return null;
    const host = document.querySelector("#canvas-interaction").getBoundingClientRect();
    const first = window.__gridscalr.canvas.pageToScreen(calibration.p1);
    const second = window.__gridscalr.canvas.pageToScreen(calibration.p2);
    return [
      { x: first.x + host.left, y: first.y + host.top },
      { x: second.x + host.left, y: second.y + host.top },
    ];
  });
  if (!calibrationPoints) throw new Error("Demo page 1 has no reference calibration.");
  await page.evaluate(() => window.__gridscalr.store.setTool("calibrate"));
  await page.mouse.click(calibrationPoints[0].x, calibrationPoints[0].y);
  await page.mouse.click(calibrationPoints[1].x, calibrationPoints[1].y);
  await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").getByLabel("Known length").fill("10");
  await page.waitForTimeout(250);
  await capture("calibration.png");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.evaluate(() => window.__gridscalr.store.setTool("select"));

  const embeddedPhoto = await inspectionPhotoDataUrl(page);
  if (!embeddedPhoto) throw new Error("Could not render the demo inspection image.");
  const photoBuffer = Buffer.from(embeddedPhoto.split(",")[1], "base64");
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Import image…" }).click();
  await (
    await fileChooser
  ).setFiles({
    name: "loading-dock-inspection.png",
    mimeType: "image/png",
    buffer: photoBuffer,
  });
  await page.waitForTimeout(700);
  await waitForToastsGone(page);
  const showProperties = page.getByRole("button", { name: "Show properties" });
  if (await showProperties.count()) await showProperties.click();
  const imagePlacement = await page.evaluate(() => {
    const store = window.__gridscalr.store;
    const project = store.project;
    const layer = project.layers.find((candidate) =>
      candidate.items.some((item) => item.kind === "image"),
    );
    const item = layer?.items.find((candidate) => candidate.kind === "image");
    if (!layer || !item) return false;
    const width = item.points[1].x - item.points[0].x;
    const height = item.points[1].y - item.points[0].y;
    const center = { x: 860, y: 610 };
    store.mutate((next) => {
      const target = next.layers
        .find((candidate) => candidate.id === layer.id)
        ?.items.find((candidate) => candidate.id === item.id);
      if (!target) return;
      target.points = [
        { x: center.x - width / 2, y: center.y - height / 2 },
        { x: center.x + width / 2, y: center.y + height / 2 },
      ];
    }, "change");
    store.setSelection({ layerId: layer.id, itemId: item.id });
    return true;
  });
  if (!imagePlacement) throw new Error("Could not place the embedded inspection image.");
  await page.waitForTimeout(350);
  await capture("images.png");
  await page.keyboard.press("Control+z");
  await waitForToastsGone(page);

  await page.locator('.menu-trigger[data-menu="settings"]').click();
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  const preferencesDialog = page.getByRole("dialog", { name: "Preferences" });
  await preferencesDialog.waitFor();
  await preferencesDialog.getByRole("button", { name: "Data", exact: true }).click();
  await page.waitForTimeout(250);
  await capture("preferences-data.png");
  await preferencesDialog.getByRole("button", { name: "Open recovery center…" }).click();
  const recoveryCenter = page.getByRole("dialog", { name: "Recovery center" });
  await recoveryCenter.waitFor();
  await page.waitForTimeout(250);
  await capture("recovery-center.png");
  await page.keyboard.press("Escape");
  await recoveryCenter.waitFor({ state: "detached" });
  await preferencesDialog.waitFor();
  await page.keyboard.press("Escape");
  await preferencesDialog.waitFor({ state: "detached" });

  const statusChip = page.getByRole("button", {
    name: /Show save, backup and autosave status/,
  });
  await statusChip.click();
  const statusPopover = page.locator(".status-popover");
  await statusPopover.waitFor();
  await page.waitForTimeout(250);
  await capture("status-popover.png");
  await page.keyboard.press("Escape");
  await statusPopover.waitFor({ state: "detached" });

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
}

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { docsSourceFingerprint } from "./docs-fingerprint.mjs";
import { resolve } from "node:path";
import {
  launchBrowser,
  makeReferenceProject,
  openCompareProject,
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
    alt: "GridScalr with the Length tool active, the Layers panel open and the context bar showing the target layer and New measurement options, with Properties on the right.",
    description: "Measurement and drawing tools share one canvas but stay on separate layer types.",
  },
  {
    file: "calibration.png",
    title: "Calibration",
    alt: "The GridScalr Edit calibration dialog for page 1, showing a 10 m reference length, a unit selector, and the option to update existing measurements while the calibration line stays visible on the plan.",
    description:
      "Calibrate a page against a known dimension or enter a printed scale, then lock it against accidental changes.",
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
    file: "count-types.png",
    title: "Count types",
    alt: "The GridScalr Count types dialog with built-in door, window, radiator, fixture and other types, a custom Socket type with a fixture glyph, and the add form.",
    description:
      "Name the objects you count and choose the vector glyph used on the plan and in exports.",
  },
  {
    file: "count-schedule.png",
    title: "Count schedule",
    alt: "The GridScalr Markups table grouped by count type with the Count type column visible and count rows for doors, windows and fixtures.",
    description:
      "Group the Markups table by count type to review a door, window or fixture schedule without custom columns.",
  },
  {
    file: "markups-list.png",
    title: "Markups list",
    alt: "The GridScalr Markups panel with a saved Room review view, building, floor and room groups, and the Name, Type, Page, Layer, Value, Category and Room columns.",
    description:
      "A docked, project-wide list with saved views, configurable columns, grouping, filters, and row navigation.",
  },
  {
    file: "symbols.png",
    title: "Symbol library",
    alt: "The GridScalr symbol library opened from the tool rail, with searchable fire, evacuation, HVAC, electrical, building and waste symbols, a selected extinguisher on the plan and Markups grouped by symbol category and status.",
    description:
      "Place vector facility symbols with category colours, rotation and inspection status, then review them in the Markups list.",
  },
  {
    file: "images.png",
    title: "Embedded images",
    alt: "The GridScalr plan with an embedded inspection photo of a loading dock selected, showing image handles and the Properties panel with image mode, opacity and rotation controls.",
    description:
      "Embed PNG or JPEG photos in a project, place them above the PDF or below markups, and adjust size, rotation and opacity.",
  },
  {
    file: "export.png",
    title: "Drawing export",
    alt: "The GridScalr Drawing PDF export dialog with page range, crop area, layer selection, labels and legend options.",
    description:
      "Export visible markups as a flattened drawing PDF without modifying the source drawing.",
  },
  {
    file: "package.png",
    title: "Project package",
    alt: "The GridScalr Package project dialog with optional quantity exports, drawing PDF and original TIF scans switched off, and a note that packages require the desktop app in the browser fallback.",
    description:
      "Package the project and its drawings as a standard ZIP with a manifest and checksums; reports and original scans stay opt-in.",
  },
  {
    file: "split-view.png",
    title: "Reference view",
    alt: "GridScalr with a primary editable canvas and a read-only reference pane showing the same calibrated floor plan at the same pan and zoom, with a source selector for Same page, Revision and Drawing.",
    description:
      "A read-only reference pane follows the primary canvas while keeping edits, selection and undo in one place. Switch its source between the same page, a saved revision or a raw PDF drawing.",
  },
  {
    file: "compare.png",
    title: "Revision or drawing comparison",
    alt: "GridScalr comparing the current takeoff with a reference revision in overlay mode, with a differences panel showing changed, added and removed items.",
    description:
      "Load a reference revision without merging it, switch between side-by-side and overlay, and export a comparison PDF. A raw PDF drawing reference keeps the visuals and export without a markup diff.",
  },
  {
    file: "search.png",
    title: "Full-text search",
    alt: "GridScalr search panel with a text query, page results and a highlighted match on the drawing.",
    description: "Search the PDF text layer across every page and jump to a highlighted result.",
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
    const calibration = window.__gridscalr.store.project.pages[1].calibration;
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

  const embeddedPhoto = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 300;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const gradient = context.createLinearGradient(0, 0, 480, 300);
    gradient.addColorStop(0, "#273238");
    gradient.addColorStop(1, "#101719");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 480, 300);
    context.strokeStyle = "rgba(79, 224, 191, 0.18)";
    context.lineWidth = 1;
    for (let x = 0; x <= 480; x += 24) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 300);
      context.stroke();
    }
    for (let y = 0; y <= 300; y += 24) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(480, y);
      context.stroke();
    }
    context.fillStyle = "#33434a";
    context.fillRect(34, 54, 412, 198);
    context.fillStyle = "#223034";
    context.fillRect(54, 82, 176, 150);
    context.fillStyle = "#b9c9ce";
    context.fillRect(72, 102, 140, 110);
    context.strokeStyle = "#65767c";
    context.lineWidth = 4;
    context.strokeRect(72, 102, 140, 110);
    context.beginPath();
    context.moveTo(142, 102);
    context.lineTo(142, 212);
    context.stroke();
    context.fillStyle = "#4a5a60";
    context.fillRect(258, 128, 164, 104);
    context.fillStyle = "#d9e4e7";
    context.font = "600 18px system-ui, sans-serif";
    context.fillText("Loading dock", 54, 42);
    context.font = "500 13px system-ui, sans-serif";
    context.fillStyle = "#9fb0b5";
    context.fillText("Inspection photo · Northgate", 54, 276);
    context.fillStyle = "#f26d6d";
    context.fillRect(330, 42, 116, 26);
    context.fillStyle = "#1a1111";
    context.font = "700 13px system-ui, sans-serif";
    context.fillText("CHECK", 372, 60);
    return canvas.toDataURL("image/png");
  });
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  launchBrowser,
  makeReferenceProject,
  openCompareProject,
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
  assert.equal(project.name, "Northgate Logistics Hub - Takeoff");
  assert.equal(await page.locator(".page-card").count(), 3, "expected three page cards");

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

  // The page scale lives in the status bar now, and its chip opens the scale menu.
  assert.equal(
    await page.locator(".scale-card").count(),
    0,
    "Properties should no longer host the scale card",
  );
  const scaleChip = page.locator(".status-chip-action");
  await scaleChip.waitFor();
  assert.match(
    (await scaleChip.textContent()) ?? "",
    /1:\d/,
    "the scale chip should show a compact 1:N ratio",
  );
  await scaleChip.click();
  const scaleMenu = page.locator(".popover");
  await scaleMenu.waitFor();
  const scaleMenuText = (await scaleMenu.textContent()) ?? "";
  assert.match(scaleMenuText, /Manual scale/, "the scale menu should offer a manual scale");
  assert.match(scaleMenuText, /Lock scale|Unlock scale/, "the scale menu should offer the lock");
  await page.keyboard.press("Escape");
  await scaleMenu.waitFor({ state: "detached" });

  // Site coordinates read as a position, with a unit on each axis.
  await page.locator(".statusbar .status-label", { hasText: "Position" }).waitFor();

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

  await page.keyboard.press("d");
  await page.locator(".context-tool", { hasText: "Revision cloud" }).waitFor();
  await assertContextBarFits("Revision cloud");
  await page.getByRole("button", { name: "Choose variants for Revision cloud" }).click();
  const variants = page.getByRole("menu", { name: "Revision cloud variants" });
  await variants.waitFor();
  await page.keyboard.press("Escape");
  await variants.waitFor({ state: "detached" });

  await page.keyboard.press("Control+l");
  const markupsPanel = page.locator(".markups-panel");
  await markupsPanel.waitFor({ state: "visible" });
  await markupsPanel.getByLabel("Filter markups by page").selectOption("current");
  await markupsPanel.getByLabel("Filter markups by type").selectOption("measure");
  const rows = await markupsPanel.locator("tbody tr[data-item-id]").count();
  assert.ok(rows >= 10, `expected at least 10 measurements on page 1, got ${rows}`);
  assert.equal(
    await markupsPanel.locator("thead th").count(),
    12,
    "the Markups table should expose all twelve columns",
  );

  // A measurement drawn with an older page scale must warn, not fail silently.
  await page.evaluate(() => {
    window.__gridscalr.store.mutate((project) => {
      const item = project.layers
        .flatMap((layer) => layer.items)
        .find((entry) => entry.id === "item_floor_living");
      if (item?.scale) item.scale.pointsPerMeter *= 2;
    }, "change");
  });
  await page.waitForTimeout(150);
  assert.ok(
    (await markupsPanel.locator(".scale-warning").count()) >= 1,
    "a stale measurement scale should warn in the Markups table",
  );
  const zoomBeforeFocus = await page.evaluate(() => window.__gridscalr.store.ui.zoom);
  const radiatorRow = markupsPanel.locator('[data-item-id="item_count_radiator"]');
  await radiatorRow.locator(".markups-item-label").click();
  await page.waitForTimeout(250);
  const zoomAfterFocus = await page.evaluate(() => window.__gridscalr.store.ui.zoom);
  assert.ok(
    zoomAfterFocus > zoomBeforeFocus * 1.5,
    `clicking a small Markups row should zoom in (${zoomBeforeFocus} -> ${zoomAfterFocus})`,
  );
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.ui.selection[0]?.itemId),
    "item_count_radiator",
    "clicking a Markups row should select it without closing the panel",
  );

  await markupsPanel.locator('[data-item-id="item_floor_living"] .markups-item-label').click();
  await page.waitForTimeout(250);
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.ui.selection[0]?.itemId),
    "item_floor_living",
    "clicking a large Markups row should still select it",
  );
  await page.locator(".scale-warning-note").waitFor();

  // Created and Modified columns, range selection and bulk category edit.
  assert.equal(
    await markupsPanel.locator('th[data-column="created"]').count(),
    1,
    "the Markups table should expose a Created column",
  );
  assert.equal(
    await markupsPanel.locator('th[data-column="modified"]').count(),
    1,
    "the Markups table should expose a Modified column",
  );
  assert.match(
    (await markupsPanel.locator("td.markups-time").first().textContent()) ?? "",
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
    "the Created column should show YYYY-MM-DD HH:mm",
  );

  const tableRows = markupsPanel.locator("tbody tr.markups-row");
  await tableRows.nth(0).click();
  await page.waitForTimeout(120);
  await tableRows.nth(2).click({ modifiers: ["Shift"] });
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.ui.selection.length),
    3,
    "Shift-click should select the whole range between two rows",
  );
  await tableRows.nth(1).click({ modifiers: ["Control"] });
  await page.waitForTimeout(150);
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.ui.selection.length),
    2,
    "Ctrl-click should remove one row from the range",
  );

  const rangeIds = await page.evaluate(() =>
    window.__gridscalr.store.ui.selection.map((ref) => ref.itemId),
  );
  await tableRows.nth(0).click({ button: "right" });
  const rangeMenu = page.locator(".popover:not(.popover-submenu)");
  await rangeMenu.waitFor();
  await rangeMenu.getByText("Set category", { exact: true }).click();
  const categorySubmenu = page.locator(".popover-submenu:not([hidden])");
  await categorySubmenu.waitFor();
  await categorySubmenu.getByText("Wall", { exact: true }).click();
  await page.waitForTimeout(200);
  const categoriesApplied = await page.evaluate(
    (ids) =>
      ids.map(
        (id) =>
          window.__gridscalr.store.project.layers
            .flatMap((layer) => layer.items)
            .find((item) => item.id === id)?.categoryId ?? null,
      ),
    rangeIds,
  );
  assert.equal(
    categoriesApplied[0],
    categoriesApplied[1],
    "bulk category should apply to the range",
  );
  const wallCategory = await page.evaluate(
    () =>
      window.__gridscalr.store.project.categories.find((category) => category.name === "Wall")
        ?.id ?? null,
  );
  assert.deepEqual(categoriesApplied, [wallCategory, wallCategory]);

  await radiatorRow.hover();
  await radiatorRow.locator(".markups-rename").click();
  const markupRename = markupsPanel.locator(".markups-name-input");
  await markupRename.waitFor();
  await markupRename.fill("QA radiator");
  await markupRename.press("Enter");
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(
      () =>
        window.__gridscalr.store.project.layers
          .flatMap((layer) => layer.items)
          .find((item) => item.id === "item_count_radiator")?.label,
    ),
    "QA radiator",
    "inline Markups rename should update the item label",
  );

  await page.keyboard.press("Control+l");
  await markupsPanel.waitFor({ state: "hidden" });

  await page.keyboard.press("Control+l");
  await markupsPanel.waitFor({ state: "visible" });

  await markupsPanel.getByRole("button", { name: "Columns" }).click();
  const columnsDialog = page.getByRole("dialog");
  await columnsDialog.waitFor();
  await columnsDialog.getByLabel("Room").uncheck();
  await columnsDialog.getByRole("button", { name: "Apply" }).click();
  await columnsDialog.waitFor({ state: "detached" });
  assert.equal(
    await markupsPanel.locator("thead th").count(),
    11,
    "hiding a Markups column should remove its header",
  );

  await markupsPanel.getByRole("button", { name: "Columns" }).click();
  const columnsAgain = page.getByRole("dialog");
  await columnsAgain.getByLabel("Room").check();
  await columnsAgain.getByRole("button", { name: "Apply" }).click();
  await columnsAgain.waitFor({ state: "detached" });
  assert.equal(
    await markupsPanel.locator("thead th").count(),
    12,
    "restoring the Markups column should bring its header back",
  );

  await markupsPanel.getByRole("button", { name: "More view options" }).click();
  await page.getByRole("button", { name: "Save as new view…" }).click();
  const viewDialog = page.getByRole("dialog");
  await viewDialog.getByLabel("Text").fill("QA view");
  await viewDialog.getByRole("button", { name: "Apply" }).click();
  await viewDialog.waitFor({ state: "detached" });
  const savedView = await page.evaluate(() =>
    window.__gridscalr.store.project.markupsViews.find((view) => view.name === "QA view"),
  );
  assert.ok(savedView, "saving a Markups view should store it in the project");
  assert.equal(
    await markupsPanel.getByLabel("Markups view").inputValue(),
    savedView.id,
    "the saved view should become active",
  );

  await markupsPanel.getByLabel("Markups view").selectOption("");
  await markupsPanel.getByLabel("Filter markups by page").selectOption("all");
  await markupsPanel.getByLabel("Markups view").selectOption(savedView.id);
  assert.equal(
    await markupsPanel.getByLabel("Filter markups by page").inputValue(),
    "current",
    "applying a saved view should restore its page filter",
  );

  await page.locator('.dock-tab[data-tab="pages"]').click();
  await page.locator('.page-card[data-page="1"]').click({ button: "right" });
  await page.getByRole("button", { name: "Set location…" }).click();
  const locationDialog = page.getByRole("dialog");
  await locationDialog.getByLabel("Building").fill("Building A");
  await locationDialog.getByLabel("Floor").fill("Floor 2");
  await locationDialog.getByRole("button", { name: "Apply" }).click();
  await locationDialog.waitFor({ state: "detached" });
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.project.pages["1"]?.building),
    "Building A",
    "the page location should be stored in the project",
  );

  await markupsPanel.getByLabel("Group markups").selectOption({ label: "Building → Floor → Room" });
  await page.waitForTimeout(150);
  assert.ok(
    (await markupsPanel.locator(".markups-group-row").count()) > 0,
    "grouping should add collapsible group rows",
  );
  assert.equal(
    (await markupsPanel.locator(".markups-group-label").first().textContent())?.trim(),
    "Building A",
  );

  assert.equal(
    await page.locator('.dock-tab[data-tab="symbols"]').count(),
    0,
    "the Symbols tab should be gone; the Symbol tool opens the library",
  );
  await page.keyboard.press("b");
  const symbolSearch = page.getByLabel("Search symbols");
  await symbolSearch.waitFor();
  await symbolSearch.fill("brandsläckare");
  assert.ok(
    (await page.locator(".symbol-tile:visible").count()) >= 1,
    "symbol search should find the Swedish fire-extinguisher term",
  );
  await symbolSearch.fill("");
  await page.locator('[data-symbol-id="fire.extinguisher"]').click();
  await page.getByLabel("Status for the next symbol").selectOption("approved");

  const interaction = page.locator("#canvas-interaction");
  const canvasBox = await interaction.boundingBox();
  assert.ok(canvasBox, "the canvas should be visible");
  await interaction.click({
    position: { x: canvasBox.width * 0.72, y: canvasBox.height * 0.55 },
  });
  await page.waitForTimeout(150);
  const placedSymbol = await page.evaluate(() => {
    const selection = window.__gridscalr.store.ui.selection[0];
    const item = window.__gridscalr.store.project.layers
      .flatMap((layer) => layer.items)
      .find((entry) => entry.id === selection?.itemId);
    return item
      ? {
          id: item.id,
          kind: item.kind,
          symbolId: item.symbolId,
          status: item.status,
          rotation: item.rotation ?? 0,
        }
      : null;
  });
  assert.equal(placedSymbol?.kind, "symbol", "the symbol tool should place a symbol");
  assert.equal(placedSymbol?.symbolId, "fire.extinguisher");
  assert.equal(placedSymbol?.status, "approved", "the sticky symbol status should be applied");

  await page.getByLabel("Rotation in degrees").fill("90");
  await page.getByLabel("Rotation in degrees").press("Tab");
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(() => {
      const selection = window.__gridscalr.store.ui.selection[0];
      return window.__gridscalr.store.project.layers
        .flatMap((layer) => layer.items)
        .find((entry) => entry.id === selection?.itemId)?.rotation;
    }),
    90,
    "symbol rotation should be editable in Properties",
  );

  await markupsPanel.getByLabel("Filter markups by type").selectOption("symbol");
  const placedRow = markupsPanel.locator(`[data-item-id="${placedSymbol?.id}"]`);
  await placedRow.waitFor();
  const statusSelect = placedRow.locator(".markups-status-select");
  assert.equal(await statusSelect.inputValue(), "approved");
  await statusSelect.selectOption("missing");
  assert.equal(
    await page.evaluate(
      (id) =>
        window.__gridscalr.store.project.layers
          .flatMap((layer) => layer.items)
          .find((item) => item.id === id)?.status,
      placedSymbol?.id,
    ),
    "missing",
    "the Markups status cell should update symbol status",
  );

  // Bulk status through the row context menu applies to every selected symbol.
  const symbolRows = markupsPanel.locator("tbody tr.markups-row");
  await symbolRows.nth(0).click();
  await page.waitForTimeout(120);
  await symbolRows.nth(1).click({ modifiers: ["Control"] });
  await page.waitForTimeout(150);
  const statusIds = await page.evaluate(() =>
    window.__gridscalr.store.ui.selection.map((ref) => ref.itemId),
  );
  assert.equal(statusIds.length, 2, "two symbol rows should be selected");
  await symbolRows.nth(1).click({ button: "right" });
  const symbolMenu = page.locator(".popover:not(.popover-submenu)");
  await symbolMenu.waitFor();
  await symbolMenu.getByText("Set status", { exact: true }).click();
  const statusSubmenu = page.locator(".popover-submenu:not([hidden])");
  await statusSubmenu.waitFor();
  await statusSubmenu.getByText("Approved", { exact: true }).click();
  await page.waitForTimeout(200);
  const bulkStatuses = await page.evaluate(
    (ids) =>
      ids.map(
        (id) =>
          window.__gridscalr.store.project.layers
            .flatMap((layer) => layer.items)
            .find((item) => item.id === id)?.status ?? null,
      ),
    statusIds,
  );
  assert.deepEqual(bulkStatuses, ["approved", "approved"]);

  // Delete removes every selected row while the table has focus, as one undo step.
  const countItems = () =>
    page.evaluate(() =>
      window.__gridscalr.store.project.layers.reduce(
        (total, layer) => total + layer.items.length,
        0,
      ),
    );
  const beforeDelete = await countItems();
  await symbolRows.nth(1).focus();
  await page.keyboard.press("Delete");
  await page.waitForTimeout(200);
  assert.equal(await countItems(), beforeDelete - 2, "Delete should remove the selected rows");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  assert.equal(await countItems(), beforeDelete, "the bulk delete should be one undo step");

  await page.keyboard.press("Control+l");
  await markupsPanel.waitFor({ state: "hidden" });

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
  await layerItems.filter({ hasText: "Warehouse floor" }).first().click();
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.ui.selection[0]?.itemId),
    "item_floor_living",
    "clicking a layer item should select it",
  );
  const inspectorOrder = await page.evaluate(() =>
    [...document.querySelectorAll(".inspector-section")].map((section) =>
      section.classList.contains("selection-section") ? "selection" : "layer",
    ),
  );
  assert.deepEqual(
    inspectorOrder,
    ["selection", "layer"],
    "a selected markup should sit above the active-layer settings",
  );
  assert.equal(
    await page.locator(".inspector-section").filter({ hasText: "Measurement units" }).count(),
    0,
    "units should live in Project settings, not in Properties",
  );

  // The right panel header opens Project settings without the menu.
  await page.getByRole("button", { name: "Project settings", exact: true }).click();
  const headerSettings = page.getByRole("dialog");
  await headerSettings.waitFor();
  const lengthUnit = headerSettings.getByLabel("Project length unit");
  await lengthUnit.selectOption("m");
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.project.settings.lengthUnit),
    "m",
    "Project settings should change the project length unit",
  );
  await lengthUnit.selectOption("mm");
  await page.keyboard.press("Escape");
  await headerSettings.waitFor({ state: "detached" });

  await page.keyboard.press("Control+,");
  const settingsDialog = page.getByRole("dialog");
  await settingsDialog.waitFor();
  assert.ok(
    await settingsDialog.getByText("Smart length labels", { exact: true }).count(),
    "project settings should expose smart length labels",
  );
  await page.keyboard.press("Escape");
  await settingsDialog.waitFor({ state: "detached" });

  await page.evaluate(() => {
    window.__gridscalrContextPrevented = null;
    document.addEventListener(
      "contextmenu",
      (event) => {
        window.__gridscalrContextPrevented = event.defaultPrevented;
      },
      { once: true },
    );
  });
  await page.locator(".inspector-section").first().click({ button: "right" });
  assert.equal(
    await page.evaluate(() => window.__gridscalrContextPrevented),
    true,
    "Properties should suppress the WebView context menu",
  );

  const drawingLayer = page.locator(".layer-row").filter({ hasText: "Site markups" }).first();
  const drawingNameBox = await drawingLayer.locator(".layer-name").boundingBox();
  assert.ok(drawingNameBox, "the drawing layer name should be visible");
  await page.mouse.dblclick(
    drawingNameBox.x + drawingNameBox.width / 2,
    drawingNameBox.y + drawingNameBox.height / 2,
  );
  const layerRename = page.locator(".layer-name-input");
  await layerRename.waitFor();
  assert.equal(await layerRename.inputValue(), "Site markups");
  await page.keyboard.press("Escape");
  await layerRename.waitFor({ state: "detached" });

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
  await help.getByText("Operations technician", { exact: true }).first().waitFor();
  const helpBox = await help.boundingBox();
  assert.ok(
    helpBox && helpBox.width >= 1100,
    `the help dialog should use more of the window, got ${helpBox?.width ?? 0}px`,
  );
  const helpText = await help.innerText();
  assert.ok(
    !/drifttekniker|förvaltare/i.test(helpText),
    "the English workflows should not include Swedish role names",
  );
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
  const quantityXlsx = await exportDownload("Quantities to Excel…");
  assert.match(
    quantityXlsx.suggestedFilename(),
    /-quantities\.xlsx$/,
    "expected a quantity XLSX export",
  );
  const workbookBytes = await readFile(await quantityXlsx.path());
  assert.equal(workbookBytes.subarray(0, 2).toString(), "PK", "the XLSX export should be a ZIP");
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

  // Revision comparison: load a session reference, switch to overlay and export.
  const referencePath = await makeReferenceProject();
  await openCompareProject(page, referencePath);
  const comparePanel = page.locator(".compare-panel");
  assert.match(await comparePanel.innerText(), /CHANGED/i, "expected changed items");
  await comparePanel.getByRole("button", { name: "Overlay" }).click();
  assert.equal(
    await page.locator(".canvas-area.is-compare-overlay").count(),
    1,
    "overlay mode should stack the reference pane",
  );
  await comparePanel.locator(".compare-row").first().click();
  await waitForApp(page);
  const comparisonDownload = page.waitForEvent("download");
  await comparePanel.getByRole("button", { name: "Export PDF" }).click();
  const comparisonPdf = await comparisonDownload;
  assert.match(
    comparisonPdf.suggestedFilename(),
    /-comparison\.pdf$/,
    "expected a comparison PDF export",
  );
  await comparePanel.getByRole("button", { name: "Close comparison" }).click();
  await comparePanel.waitFor({ state: "detached" });
  await waitForToastsGone(page);

  // Page names and page duplication.
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.waitForTimeout(150);
  await page.locator('.page-card[data-page="2"]').click({ button: "right" });
  await page.getByRole("button", { name: "Rename page…" }).click();
  const pageRename = page.getByRole("dialog");
  await pageRename.waitFor();
  await pageRename.getByLabel("Text").fill("Mezzanine review");
  await pageRename.getByRole("button", { name: "Apply" }).click();
  await pageRename.waitFor({ state: "detached" });
  await page.waitForTimeout(200);
  assert.equal(
    await page.locator('.page-card[data-page="2"] .page-title').textContent(),
    "Mezzanine review",
    "renaming a page should update its card",
  );

  await page.locator('.page-card[data-page="1"]').click({ button: "right" });
  await page.getByRole("button", { name: "Duplicate page…" }).click();
  const duplicatePage = page.getByRole("dialog");
  await duplicatePage.waitFor();
  await duplicatePage.getByRole("button", { name: "Duplicate page" }).click();
  await duplicatePage.waitFor({ state: "detached" });
  await page.waitForTimeout(300);
  assert.equal(await page.locator(".page-card").count(), 4, "duplicating should add one page");
  assert.equal(
    await page.locator('.page-card[data-page="4"] .page-title').textContent(),
    "Ground floor copy",
    "the duplicate should copy the page name",
  );
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.project.documents.length),
    2,
    "the duplicate is a single-page document reference",
  );

  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByText(/No layers on Page 4 yet/).waitFor();
  await page.getByRole("button", { name: "All pages", exact: true }).click();
  await page.locator(".layer-row").first().waitFor();

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("; ")}`);
  console.log(`UI smoke passed: ${repoRoot}`);
} finally {
  await browser?.close();
  await vite?.stop();
}

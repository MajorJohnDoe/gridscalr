import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
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
    const legacy = localStorage.getItem("gridscalr.autosave.v1");
    const meta = localStorage.getItem("gridscalr.autosave.meta.v1");
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const count = await new Promise((resolve) => {
        const request = indexedDB.open("gridscalr", 2);
        request.onsuccess = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains("recovery")) {
            database.close();
            resolve(0);
            return;
          }
          const transaction = database.transaction("recovery", "readonly");
          const get = transaction.objectStore("recovery").getAll();
          get.onsuccess = () => {
            database.close();
            resolve(Array.isArray(get.result) ? get.result.length : 0);
          };
          get.onerror = () => {
            database.close();
            resolve(0);
          };
        };
        request.onerror = () => resolve(0);
      });
      if (count > 0) return { records: count, legacy, meta };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { records: 0, legacy, meta };
  });
  assert.ok(autosave.records > 0, "a scoped recovery record should be stored in IndexedDB");
  assert.equal(
    await page.locator(".status-project .status-chip").count(),
    1,
    "the status bar should show whether the project is saved",
  );
  assert.equal(
    autosave.legacy,
    null,
    "the legacy localStorage snapshot should be removed after migration",
  );
  assert.equal(
    autosave.meta,
    null,
    "the legacy recovery metadata should be removed after migration",
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

  // Package commands are visible but disabled in the browser fallback.
  await page.getByRole("menuitem", { name: "File" }).click();
  const packageItem = page.getByRole("menuitem", { name: /Share project package/ });
  const openPackageItem = page.getByRole("menuitem", { name: /Open package/ });
  assert.equal(await packageItem.isDisabled(), true, "package should be desktop-only");
  assert.equal(await openPackageItem.isDisabled(), true, "open package should be desktop-only");
  await page.getByRole("menuitem", { name: "Project packages require the desktop app" }).waitFor();
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__gridscalr.app.openPackageDialogForDocs());
  const packageDialog = page.getByRole("dialog", { name: "Package project" });
  await packageDialog.waitFor();
  assert.equal(
    await packageDialog.getByRole("button", { name: "Create package" }).isDisabled(),
    true,
    "Create package should be disabled in the browser fallback",
  );
  await packageDialog.getByText("Project packages require the desktop app.").waitFor();
  await page.keyboard.press("Escape");
  await packageDialog.waitFor({ state: "detached" });

  // Family rail buttons share a slot and remember the last used variant.
  const circleFamily = page.locator('.tool-family[data-tool-group="circle-arc"]');
  await circleFamily.waitFor();
  assert.equal(await circleFamily.getAttribute("data-display-tool"), "radius");
  await circleFamily.click({ button: "right" });
  const circleMenu = page.getByRole("menu", { name: "Circle & arc tools" });
  await circleMenu.waitFor();
  await circleMenu.getByRole("menuitemradio", { name: /Arc/ }).click();
  await circleMenu.waitFor({ state: "detached" });
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.ui.activeTool),
    "arc",
    "choosing Arc from the family flyout should activate it",
  );
  assert.equal(await circleFamily.getAttribute("data-display-tool"), "arc");
  assert.equal(await circleFamily.getAttribute("aria-pressed"), "true");
  await page.keyboard.press("w");
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.ui.activeTool),
    "diameter",
    "the Diameter shortcut should still work without its own rail button",
  );
  assert.equal(await circleFamily.getAttribute("data-display-tool"), "diameter");
  const diameterVariants = page.getByRole("button", { name: "Choose variants for Diameter" });
  await diameterVariants.waitFor();
  await diameterVariants.click();
  const contextFamilyMenu = page.getByRole("menu", { name: "Circle & arc tools" });
  await contextFamilyMenu.waitFor();
  await page.keyboard.press("Escape");
  await contextFamilyMenu.waitFor({ state: "detached" });
  const angleFamily = page.locator('.tool-family[data-tool-group="angle-slope"]');
  await angleFamily.click({ button: "right" });
  const angleMenu = page.getByRole("menu", { name: "Angle & slope tools" });
  await angleMenu.waitFor();
  assert.equal(await angleMenu.getByRole("menuitemradio", { name: /Slope/ }).count(), 1);
  await page.keyboard.press("Escape");
  await angleMenu.waitFor({ state: "detached" });
  const volumeIcon = await page.locator('[data-tool="volume"]').innerHTML();
  const symbolIcon = await page.locator('[data-tool="symbol"]').innerHTML();
  assert.notEqual(volumeIcon, symbolIcon, "symbol and volume should use different icons");
  await page.keyboard.press("v");
  await page.waitForTimeout(100);

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
    ["f", "Pipe / duct"],
    ["b", "Symbol"],
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

  await page.keyboard.press("g");
  await page.getByRole("button", { name: "Choose variants for Highlight" }).click();
  const highlightMenu = page.getByRole("menu", { name: "Highlight variants" });
  await highlightMenu.waitFor();
  assert.ok(
    (await highlightMenu.locator(".tool-fill-swatch").count()) >= 5,
    "Highlight variants should offer the colour palette",
  );
  await page.keyboard.press("Escape");
  await highlightMenu.waitFor({ state: "detached" });
  await page.keyboard.press("a");
  await page.locator(".context-tool", { hasText: "Area" }).waitFor();

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
    13,
    "the Markups table should expose all thirteen columns",
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
    12,
    "hiding a Markups column should remove its header",
  );

  await markupsPanel.getByRole("button", { name: "Columns" }).click();
  const columnsAgain = page.getByRole("dialog");
  await columnsAgain.getByLabel("Room").check();
  await columnsAgain.getByRole("button", { name: "Apply" }).click();
  await columnsAgain.waitFor({ state: "detached" });
  assert.equal(
    await markupsPanel.locator("thead th").count(),
    13,
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
  await locationDialog.evaluate((dialog) => {
    // Set values directly; browser autofill in CI can merge consecutive fills
    // into the first input when the fields share a datalist.
    const inputs = dialog.querySelectorAll("input");
    inputs[0].value = "Building A";
    inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    inputs[1].value = "Floor 2";
    inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
  });
  await locationDialog.getByRole("button", { name: "Apply" }).click();
  await locationDialog.waitFor({ state: "detached" });
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.project.pages[0]?.state.building),
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
  assert.equal(
    await page.locator('[data-symbol-id="fire.hose"]:visible').count(),
    0,
    "symbol search should hide non-matching signs",
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
  await headerSettings.getByRole("button", { name: "Measurements", exact: true }).click();
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
    (await settingsDialog.innerText()).includes("Project data:"),
    "project settings should show the project size",
  );
  await settingsDialog.getByRole("button", { name: "Measurements", exact: true }).click();
  assert.ok(
    await settingsDialog.getByText("Smart length labels", { exact: true }).count(),
    "project settings should expose smart length labels",
  );
  assert.equal(
    await settingsDialog.getByLabel("Measurement layer colour").count(),
    0,
    "layer colours should live in Preferences, not Project settings",
  );
  await page.keyboard.press("Escape");
  await settingsDialog.waitFor({ state: "detached" });

  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  const preferencesDialog = page.getByRole("dialog", { name: "Preferences" });
  await preferencesDialog.waitFor();
  assert.equal(
    await preferencesDialog.getByLabel("CSV format").inputValue(),
    "locale",
    "CSV should default to the locale-aware Excel format",
  );
  const themeSelect = preferencesDialog.getByLabel("Theme");
  await themeSelect.selectOption("light-green");
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    "light-green",
    "the light theme should apply without a restart",
  );
  await themeSelect.selectOption("system");
  assert.equal(
    await page.evaluate(() => document.documentElement.dataset.theme),
    "medium-grey",
    "System should follow the dark Chromium preference",
  );
  await themeSelect.selectOption("medium-grey");
  await preferencesDialog
    .getByRole("navigation", { name: "Preference categories" })
    .getByRole("button", { name: "Layers" })
    .click();
  assert.equal(
    await preferencesDialog.getByLabel("Measurement layer colour").inputValue(),
    "#f70808",
    "new measurement layers should default to signal red",
  );
  assert.equal(
    await preferencesDialog.getByLabel("Drawing layer colour").inputValue(),
    "#f2a93b",
    "new drawing layers should keep the orange default",
  );
  await preferencesDialog
    .getByRole("navigation", { name: "Preference categories" })
    .getByRole("button", { name: "Data" })
    .click();
  assert.ok(
    (await preferencesDialog.innerText()).includes("Recovery data"),
    "Preferences should show the recovery data summary",
  );
  assert.ok(
    await preferencesDialog.getByRole("button", { name: "Clear recovery data" }).count(),
    "Preferences should offer to clear recovery data",
  );
  await page.keyboard.press("Escape");
  await preferencesDialog.waitFor({ state: "detached" });

  // Pseudo-locale: longer labellings must not be clipped in catalogued chrome.
  await page.evaluate(() => window.__gridscalr.setLanguage("en-XA"));
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  const pseudoDialog = page.getByRole("dialog");
  await pseudoDialog.waitFor();
  assert.match(await pseudoDialog.innerText(), /⟦⟦/, "the pseudo-locale should be active");
  const clippedLabels = await page.evaluate(() => {
    const found = [];
    for (const element of document.querySelectorAll(".modal *")) {
      if (element.children.length > 0) continue;
      if (!(element.textContent ?? "").includes("⟦")) continue;
      const style = getComputedStyle(element);
      const clips =
        style.textOverflow === "ellipsis" ||
        style.overflowX === "hidden" ||
        style.overflow === "hidden";
      if (clips && element.scrollWidth > element.clientWidth + 1) {
        found.push(`${element.className || element.tagName}: ${element.textContent}`);
      }
    }
    return found;
  });
  assert.deepEqual(
    clippedLabels,
    [],
    `pseudo-locale labels should not be clipped: ${clippedLabels.join("; ")}`,
  );
  await page.keyboard.press("Escape");
  await pseudoDialog.waitFor({ state: "detached" });
  await page.evaluate(() => window.__gridscalr.setLanguage("en"));

  // Swedish quick start and help chrome.
  await page.evaluate(() => window.__gridscalr.setLanguage("sv"));
  await page.waitForFunction(() => document.documentElement.lang === "sv");
  assert.equal(
    await page.locator(".menubar").innerText(),
    ["Arkiv", "Redigera", "Visa", "Inställningar", "Hjälp"].join("\n"),
    "the menu bar should relabel without a restart",
  );
  assert.match(
    (await page.locator('[data-tool="length"]').getAttribute("title")) ?? "",
    /^Längd/,
    "the tool rail should relabel without a restart",
  );
  assert.deepEqual(
    await page.locator(".dock-tab").allInnerTexts(),
    ["Sidor", "Lager"],
    "the left panel tabs should relabel without a restart",
  );
  assert.match(
    await page.locator(".statusbar").innerText(),
    /Sida/,
    "the status bar should relabel without a restart",
  );

  await page.keyboard.press("F1");
  const swedishHelp = page.getByRole("dialog");
  await swedishHelp.waitFor();
  await swedishHelp.getByRole("tab", { name: "Snabbstart" }).click();
  await swedishHelp.getByText("Kalibrera sidan", { exact: false }).first().waitFor();
  await page.keyboard.press("Escape");
  await swedishHelp.waitFor({ state: "detached" });
  await page.evaluate(() => window.__gridscalr.setLanguage("en"));
  await page.waitForFunction(() => document.documentElement.lang === "en");
  assert.equal(
    await page.locator(".menubar").innerText(),
    ["File", "Edit", "View", "Settings", "Help"].join("\n"),
    "switching back should restore the English menu bar",
  );

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
  assert.equal(await help.getByRole("tab").count(), 5, "expected five help topics");
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

  // Closing with unsaved changes offers Save, Discard and Cancel, with Save focused.
  assert.equal(await page.evaluate(() => window.__gridscalr.store.dirty), true);
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Close project" }).click();
  const unsavedDialog = page.getByRole("dialog");
  await unsavedDialog.waitFor();
  assert.equal(await unsavedDialog.getByRole("button", { name: "Save" }).count(), 1);
  assert.equal(await unsavedDialog.getByRole("button", { name: "Discard changes" }).count(), 1);
  assert.equal(await unsavedDialog.getByRole("button", { name: "Cancel" }).count(), 1);
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent),
    "Save",
    "the safe Save action should receive focus",
  );
  await unsavedDialog.getByRole("button", { name: "Cancel" }).click();
  await unsavedDialog.waitFor({ state: "detached" });
  assert.equal(await page.evaluate(() => Boolean(window.__gridscalr.store.project)), true);

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
  await page.getByRole("menuitem", { name: "View" }).click();
  assert.equal(
    await page.getByRole("menuitemcheckbox", { name: /Reference view \(same page\)/ }).isDisabled(),
    true,
    "the reference-view menu item should be disabled while a comparison is open",
  );
  await page.keyboard.press("Escape");
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

  // A raw PDF drawing can be the reference: no diff list, but visuals and export.
  await page.getByRole("menuitem", { name: "File" }).click();
  const drawingReferenceChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Compare with drawing…" }).click();
  const drawingReferenceChooser = await drawingReferenceChooserPromise;
  await drawingReferenceChooser.setFiles(join(repoRoot, "fixtures", "industrial-plan.pdf"));
  await comparePanel.waitFor();
  await waitForApp(page);
  assert.match(
    await comparePanel.innerText(),
    /Drawing reference · 3 pages · no markup comparison/i,
    "a drawing reference should report its page count without a diff",
  );
  assert.equal(
    await comparePanel.locator(".compare-row").count(),
    0,
    "a drawing reference should not show diff rows",
  );
  assert.match(
    (await page.locator(".reference-name").textContent()) ?? "",
    /industrial-plan\.pdf · 3 pages/,
    "the reference bar should name the drawing and page count",
  );
  await comparePanel.getByRole("button", { name: "Hide comparison panel" }).click();
  await comparePanel.waitFor({ state: "hidden" });
  const compareRestore = page.getByRole("button", { name: "Show comparison panel" });
  await compareRestore.waitFor();
  await compareRestore.click();
  await comparePanel.waitFor({ state: "visible" });
  const drawingComparisonDownload = page.waitForEvent("download");
  await comparePanel.getByRole("button", { name: "Export PDF" }).click();
  const drawingComparisonPdf = await drawingComparisonDownload;
  assert.match(
    drawingComparisonPdf.suggestedFilename(),
    /-comparison\.pdf$/,
    "expected a drawing comparison PDF export",
  );
  await page.getByRole("button", { name: "Close reference pane" }).click();
  await page.locator(".canvas-reference").waitFor({ state: "hidden" });

  // The same-page reference view explains how to load a revision.
  await page.keyboard.press("Control+Shift+2");
  await page.locator(".canvas-reference").waitFor({ state: "visible" });
  await page.locator(".reference-hint").waitFor();
  assert.match(
    (await page.locator(".reference-hint").textContent()) ?? "",
    /Showing the same page/,
  );
  assert.equal(
    await page.locator('.reference-source[data-source="same"]').getAttribute("aria-pressed"),
    "true",
    "the same-page source should be active by default",
  );

  // The reference pane can show its own page without moving the primary pane.
  const primaryPage = await page.evaluate(() => window.__gridscalr.store.ui.page);
  const independentPage = primaryPage === 1 ? 2 : 1;
  const referenceInput = page.locator(".reference-page-input");
  await referenceInput.fill(String(independentPage));
  await referenceInput.press("Enter");
  await page.waitForTimeout(250);
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.ui.page),
    primaryPage,
    "reference page navigation must not change the primary page",
  );
  assert.equal(
    await referenceInput.inputValue(),
    String(independentPage),
    "the reference page control should show the independent page",
  );
  assert.equal(
    await page.locator(".reference-follow").getAttribute("aria-pressed"),
    "false",
    "choosing a reference page should leave follow-primary mode",
  );
  assert.equal(
    await page.evaluate(() => window.__gridscalr.app.reference.view.currentView.page),
    independentPage,
    "the reference canvas should render the independent page",
  );
  await page.locator(".reference-follow").click();
  await page.waitForTimeout(250);
  assert.equal(
    await referenceInput.inputValue(),
    String(primaryPage),
    "Follow primary should return the reference pane to the primary page",
  );
  assert.equal(
    await page.locator(".reference-follow").getAttribute("aria-pressed"),
    "true",
    "Follow primary should be active again",
  );
  await page.evaluate((target) => window.__gridscalr.store.setPage(target), independentPage);
  await page.waitForTimeout(250);
  assert.equal(
    await referenceInput.inputValue(),
    String(independentPage),
    "the reference pane should follow a primary page change",
  );
  await page.evaluate((target) => window.__gridscalr.store.setPage(target), primaryPage);
  await page.waitForTimeout(200);

  await page.getByRole("button", { name: "Close reference pane" }).click();
  await page.locator(".canvas-reference").waitFor({ state: "hidden" });
  await waitForToastsGone(page);

  // Full-text search over the PDF text layer.
  await page.keyboard.press("Control+Shift+f");
  const searchPanel = page.locator(".search-panel");
  await searchPanel.waitFor();
  await searchPanel.getByLabel("Search drawing text").fill("Warehouse");
  await page.waitForFunction(() => document.querySelectorAll(".search-result").length > 0, null, {
    timeout: 15000,
  });
  assert.ok((await searchPanel.locator(".search-result").count()) > 0);
  await searchPanel.locator(".search-result").first().click();
  await waitForApp(page);
  await searchPanel.getByRole("button", { name: "Close search" }).click();
  await searchPanel.waitFor({ state: "detached" });

  // Page names and page duplication.
  await page.getByRole("button", { name: "Pages", exact: true }).click();
  await page.waitForTimeout(150);
  await page.locator('.page-card[data-page="2"]').click({ button: "right" });
  await page.getByRole("button", { name: "Delete page…" }).click();
  const deletePageDialog = page.getByRole("dialog");
  await deletePageDialog.waitFor();
  await page.waitForTimeout(100);
  assert.equal(
    await page.evaluate(() => document.activeElement?.textContent),
    "Cancel",
    "destructive dialogs should focus Cancel",
  );
  await page.keyboard.press("Escape");
  await deletePageDialog.waitFor({ state: "detached" });
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
    1,
    "the duplicate reuses the same source document",
  );

  await page.getByRole("button", { name: "Layers", exact: true }).click();
  await page.getByText(/No layers on Page 4 yet/).waitFor();
  await page.getByRole("button", { name: "All pages", exact: true }).click();
  await page.locator(".layer-row").first().waitFor();

  // OCR: append an image-only page, run local OCR and search the result.
  const pngDataUrl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 700;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas context");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#000000";
    context.font = "bold 96px sans-serif";
    context.fillText("ROOM A101", 90, 170);
    context.font = "52px sans-serif";
    context.fillText("VENTILATION UNIT V-12", 90, 330);
    context.fillText("FIRE EXTINGUISHER", 90, 440);
    context.fillText("SHEET A-101", 90, 550);
    return canvas.toDataURL("image/png");
  });
  const ocrPdf = await PDFDocument.create();
  const ocrImage = await ocrPdf.embedPng(pngDataUrl);
  const ocrPage = ocrPdf.addPage([600, 350]);
  ocrPage.drawImage(ocrImage, { x: 0, y: 0, width: 600, height: 350 });
  const ocrPath = join(tmpdir(), `gridscalr-ocr-${Date.now()}.pdf`);
  await writeFile(ocrPath, await ocrPdf.save());
  await page.getByRole("menuitem", { name: "File" }).click();
  const ocrChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Open drawing…" }).click();
  const ocrChooser = await ocrChooserPromise;
  await ocrChooser.setFiles(ocrPath);
  await page.waitForFunction(() => window.__gridscalr.store.project?.documents.length === 2, null, {
    timeout: 15000,
  });
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+Shift+f");
  await searchPanel.waitFor();
  await searchPanel.getByLabel("Search drawing text").fill("ROOM");
  await searchPanel.getByRole("button", { name: "OCR scans" }).click();
  await page.waitForFunction(
    () => /OCR indexed/.test(document.querySelector(".search-status")?.textContent ?? ""),
    null,
    { timeout: 180000 },
  );
  assert.ok(
    (await searchPanel.locator(".search-result").count()) > 0,
    "OCR should make the scanned page searchable",
  );
  await searchPanel.getByRole("button", { name: "Close search" }).click();
  await searchPanel.waitFor({ state: "detached" });
  await waitForToastsGone(page);

  // Line-type editor: rename/add without touching existing item styles.
  await page.keyboard.press("f");
  const editLineTypes = page.getByRole("button", { name: "Edit line types…" });
  await editLineTypes.waitFor();
  await editLineTypes.click();
  const lineTypeDialog = page.getByRole("dialog", { name: "Line types" });
  await lineTypeDialog.waitFor();
  const lineTypeCount = await page.evaluate(
    () => window.__gridscalr.store.project.lineTypes.length,
  );
  await lineTypeDialog.getByRole("button", { name: "Add line type" }).click();
  await lineTypeDialog.getByRole("button", { name: "Apply" }).click();
  await lineTypeDialog.waitFor({ state: "detached" });
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.project.lineTypes.length),
    lineTypeCount + 1,
    "the line-type editor should add a project line type",
  );

  // The line and pipe tools expose compact dropdown menus for colour and format.
  await page.keyboard.press("i");
  await page.getByRole("button", { name: "Choose variants for Line" }).click();
  const lineOptions = page.getByRole("menu", { name: "Line options" });
  await lineOptions.waitFor();
  await lineOptions.getByRole("menuitemradio", { name: /Dashed/ }).click();
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.ui.lineStyle.dashed),
    true,
    "the line options menu should set the dashed format",
  );
  await lineOptions.getByRole("menuitemradio", { name: /Solid/ }).click();
  await page.keyboard.press("Escape");
  await lineOptions.waitFor({ state: "detached" });

  await page.keyboard.press("f");
  await page.getByRole("button", { name: "Choose variants for Pipe / duct" }).click();
  const pipeOptions = page.getByRole("menu", { name: "Pipe & duct options" });
  await pipeOptions.waitFor();
  await pipeOptions.getByLabel("Line type").waitFor();
  await pipeOptions.getByRole("button", { name: "Signal red" }).waitFor();
  await pipeOptions.getByRole("button", { name: "2 pt" }).waitFor();
  await page.keyboard.press("Escape");
  await pipeOptions.waitFor({ state: "detached" });

  // Rail rows can be reordered with the dialog controls.
  await page.keyboard.press("v");
  await interaction.click({ position: { x: 12, y: 12 } });
  await page.keyboard.press("b");
  await page.locator('[data-set="special"]').click();
  await page.locator('[data-symbol-id="special.rail"]').click();
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.ui.activeTool),
    "rail",
    "the Special library entry should activate the rail tool",
  );
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.25, canvasBox.y + canvasBox.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + canvasBox.width * 0.6,
    canvasBox.y + canvasBox.height * 0.62,
    {
      steps: 6,
    },
  );
  await page.mouse.up();
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(() =>
      window.__gridscalr.store.project.layers.some((layer) =>
        layer.items.some((item) => item.kind === "rail"),
      ),
    ),
    true,
    "the rail tool should create a rail item",
  );
  const selectionKind = await page.evaluate(() => {
    const selection = window.__gridscalr.store.ui.selection[0];
    if (!selection) return "none";
    const item = window.__gridscalr.store.project.layers
      .flatMap((layer) => layer.items)
      .find((entry) => entry.id === selection.itemId);
    return item?.kind ?? "missing";
  });
  assert.equal(selectionKind, "rail", "the new rail should stay selected");
  const closeMarkups = page.getByRole("button", { name: "Close Markups list" });
  if ((await closeMarkups.count()) > 0 && (await closeMarkups.first().isVisible())) {
    await closeMarkups.first().click();
  }
  await page.locator(".inspector button", { hasText: /Edit rail/ }).click();
  const railDialog = page.getByRole("dialog", { name: "I/O rail" });
  await railDialog.waitFor();
  await railDialog.getByRole("button", { name: "Move up" }).nth(1).click();
  await railDialog.getByRole("button", { name: "Apply" }).click();
  await railDialog.waitFor({ state: "detached" });
  const railRows = await page.evaluate(() => {
    const item = window.__gridscalr.store.project.layers
      .flatMap((layer) => layer.items)
      .find((entry) => entry.kind === "rail");
    return item?.rows?.map((row) => row.label) ?? [];
  });
  assert.equal(railRows[0], "DI", "moving the second rail row up should reorder it");

  // Rich text: a selected word keeps its own run style.
  await page.keyboard.press("Shift+T");
  await page.mouse.move(canvasBox.x + canvasBox.width * 0.2, canvasBox.y + canvasBox.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(
    canvasBox.x + canvasBox.width * 0.45,
    canvasBox.y + canvasBox.height * 0.3,
    {
      steps: 5,
    },
  );
  await page.mouse.up();
  const textEditor = page.locator(".canvas-text-editor-input");
  await textEditor.waitFor();
  await textEditor.fill("Alpha Beta");
  const selectFirstWord = () =>
    textEditor.evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const node = walker.nextNode();
      if (!node) return;
      const range = document.createRange();
      range.setStart(node, 0);
      range.setEnd(node, 5);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      element.dispatchEvent(new Event("keyup", { bubbles: true }));
    });
  const selectionStyle = (property) =>
    page.evaluate((name) => {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return null;
      const node = selection.getRangeAt(0).startContainer;
      const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      return element ? getComputedStyle(element)[name] : null;
    }, property);
  const selectionWeight = () => selectionStyle("fontWeight");
  await selectFirstWord();
  const boldButton = page.locator('.inline-style-strip button[title="Bold"]');
  await boldButton.click();
  assert.equal(
    await selectionWeight(),
    "700",
    "bold should be visible inside the editor before committing",
  );
  await boldButton.click();
  assert.equal(
    await selectionWeight(),
    "400",
    "clicking bold again should remove the run formatting",
  );
  await boldButton.click();
  const underlineButton = page.locator('.inline-style-strip button[title="Underline"]');
  await underlineButton.click();
  assert.ok(
    (await selectionStyle("textDecorationLine"))?.includes("underline"),
    "underline should be visible inside the editor before committing",
  );
  await underlineButton.click();
  assert.ok(
    !(await selectionStyle("textDecorationLine"))?.includes("underline"),
    "clicking underline again should remove it immediately",
  );
  await page.locator(".inline-style-strip .is-primary").click();
  await textEditor.waitFor({ state: "detached" });
  const richBox = await page.evaluate(() => {
    const item = window.__gridscalr.store.project.layers
      .flatMap((layer) => layer.items)
      .find((entry) => entry.kind === "textbox" && entry.text === "Alpha Beta");
    return item ? { runs: item.runs ?? null, background: item.textBackground ?? null } : null;
  });
  assert.equal(richBox?.runs?.[0]?.text, "Alpha");
  assert.equal(richBox?.runs?.[0]?.bold, true, "the selected word should become bold");
  assert.equal(richBox?.runs?.map((run) => run.text).join(""), "Alpha Beta");
  assert.equal(richBox?.background, null, "new text boxes should start transparent");

  // Schematic set filter, header placement and the optional free-text tag.
  await page.keyboard.press("b");
  const schematicTab = page.getByRole("tab", { name: "Schematic" });
  await schematicTab.waitFor();
  await schematicTab.click();
  await symbolSearch.fill("fläkt");
  assert.ok(
    (await page.locator('[data-symbol-id="schematic.fan"]:visible').count()) === 1,
    "schematic search should find the Swedish fan term",
  );
  assert.equal(
    await page.locator('[data-symbol-id="schematic.pump"]:visible').count(),
    0,
    "schematic search should hide non-matching symbols",
  );
  await symbolSearch.fill("");
  await page.locator('[data-symbol-id="schematic.fan"]').click();
  await interaction.click({
    position: { x: canvasBox.width * 0.45, y: canvasBox.height * 0.45 },
  });
  await page.waitForTimeout(150);
  await page.getByLabel("Tag", { exact: true }).fill("FF-01");
  await page.getByLabel("Tag", { exact: true }).press("Tab");
  await page.waitForTimeout(120);
  const schematicItem = await page.evaluate(() => {
    const selection = window.__gridscalr.store.ui.selection[0];
    return window.__gridscalr.store.project.layers
      .flatMap((layer) => layer.items)
      .find((entry) => entry.id === selection?.itemId);
  });
  assert.equal(schematicItem?.symbolId, "schematic.fan");
  assert.equal(schematicItem?.tag, "FF-01", "the free-text tag should persist on the symbol");
  assert.equal(schematicItem?.symbolSize, 40, "schematic symbols use their default size");

  // The add-page source dialog hides sheet fields for imports and can append a blank A2 page.
  await page.evaluate(() => {
    void window.__gridscalr.app.addPageFlow();
  });
  const sourceDialog = page.getByRole("dialog", { name: "Add page" });
  await sourceDialog.waitFor();
  assert.equal(
    await sourceDialog.locator(".source-fields").isHidden(),
    true,
    "PDF/TIF import should not show template, paper or name fields",
  );
  await sourceDialog.getByText("Operation card sheet", { exact: true }).click();
  assert.equal(await sourceDialog.locator(".source-fields").isVisible(), true);
  assert.equal(
    await sourceDialog.locator(".field", { hasText: "Template" }).isVisible(),
    true,
    "sheet templates should be selectable for operation card sheets",
  );
  await sourceDialog.getByText("Blank page", { exact: true }).click();
  assert.equal(
    await sourceDialog.locator(".field", { hasText: "Template" }).isHidden(),
    true,
    "blank pages should not offer a template",
  );
  await sourceDialog.locator("select").last().selectOption("A2");
  await sourceDialog.locator('input[type="text"]').fill("Blank A2");
  const documentCount = await page.evaluate(
    () => window.__gridscalr.store.project.documents.length,
  );
  await sourceDialog.locator(".modal-footer .btn-primary").click();
  await page.waitForFunction(
    (count) => window.__gridscalr.store.project.documents.length === count,
    documentCount + 1,
    { timeout: 15_000 },
  );
  const blankDocument = await page.evaluate(() =>
    window.__gridscalr.store.project.documents.at(-1),
  );
  assert.equal(blankDocument.template.id, "gridscalr.blank");
  assert.equal(blankDocument.template.paper, "A2");
  assert.deepEqual(blankDocument.template.fields, {}, "blank pages should have no sheet fields");
  await page.locator('.dock-tab[data-tab="pages"]').click();
  await page.locator(".page-card").last().waitFor();
  assert.equal(
    await page.locator(".page-card").last().locator(".page-badge", { hasText: "Blank" }).count(),
    1,
    "the new page should be marked as blank",
  );

  // Common laptop sizes and high OS scaling keep the primary actions in view.
  const originalViewport = page.viewportSize();
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1024, height: 640 },
    { width: 760, height: 560 },
  ]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(200);
    const fits = await page.evaluate(() => {
      const within = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.left >= -1 &&
          rect.right <= window.innerWidth + 1 &&
          rect.top >= -1 &&
          rect.bottom <= window.innerHeight + 1
        );
      };
      return {
        menu: within(".menubar"),
        rail: within(".tool-rail"),
        zoom: within(".status-controls"),
        save: within(".status-project"),
        overflow: document.documentElement.scrollWidth <= window.innerWidth + 1,
      };
    });
    assert.equal(fits.menu, true, `the menu should fit at ${size.width}×${size.height}`);
    assert.equal(fits.rail, true, `the tool rail should fit at ${size.width}×${size.height}`);
    assert.equal(fits.zoom, true, `status controls should fit at ${size.width}×${size.height}`);
    assert.equal(fits.save, true, `the save status should fit at ${size.width}×${size.height}`);
    assert.equal(
      fits.overflow,
      true,
      `the shell should not overflow at ${size.width}×${size.height}`,
    );
  }
  if (originalViewport) await page.setViewportSize(originalViewport);

  // Discarding at the end returns to the welcome screen.
  assert.equal(await page.evaluate(() => window.__gridscalr.store.dirty), true);
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Close project" }).click();
  const discardDialog = page.getByRole("dialog");
  await discardDialog.waitFor();
  await discardDialog.getByRole("button", { name: "Discard changes" }).click();
  await discardDialog.waitFor({ state: "detached" });
  await page.waitForFunction(() => !window.__gridscalr.store.project, null, { timeout: 15_000 });
  assert.equal(
    await page.locator(".welcome-card").isVisible(),
    true,
    "discarding should return to the welcome screen",
  );

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("; ")}`);
  console.log(`UI smoke passed: ${repoRoot}`);
} finally {
  await browser?.close();
  await vite?.stop();
}

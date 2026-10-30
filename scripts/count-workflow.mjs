import assert from "node:assert/strict";
import {
  launchBrowser,
  openDemoProject,
  startVite,
  waitForApp,
  waitForToastsGone,
} from "./ui-harness.mjs";

const port = Number(process.env.GRIDSCALR_COUNT_TEST_PORT ?? 1432);
let vite;
let browser;
let page;

try {
  vite = await startVite({ port });
  browser = await launchBrowser();
  page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openDemoProject(page, { base: vite.base });

  // Add a project count type through the real settings workflow.
  await page.keyboard.press("Control+,");
  const settings = page.getByRole("dialog");
  await settings.waitFor();
  await settings.getByRole("button", { name: /Manage count types/ }).click();
  const countTypes = page.getByRole("dialog", { name: "Count types" });
  await countTypes.getByLabel("New count type name").waitFor();
  await countTypes.getByLabel("New count type name").fill("Socket");
  await countTypes.getByLabel("Glyph for the new count type").selectOption("fixture");
  await countTypes.getByRole("button", { name: "Add", exact: true }).click();
  const socketName = countTypes.getByLabel("Count type name: Socket");
  await socketName.waitFor();
  await socketName.fill("Power socket");
  await socketName.press("Enter");
  await countTypes.getByLabel("Count type name: Power socket").waitFor();

  const customType = await page.evaluate(() =>
    window.__gridscalr.store.project.countTypes.find((entry) => entry.label === "Power socket"),
  );
  assert.ok(customType, "the custom count type should be stored in the project");
  assert.equal(customType.glyph, "fixture", "the selected glyph should be stored");
  await countTypes.getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });

  // Place two counts on a dedicated room so the quantity report is unambiguous.
  await page.keyboard.press("c");
  await page.locator(".context-tool", { hasText: "Count" }).waitFor();
  await page.getByRole("button", { name: /New measurement options/ }).click();
  const options = page.getByRole("dialog", { name: "New measurement options" });
  await options.waitFor();
  await options.getByLabel("Object type").selectOption(customType.id);
  await options.getByLabel("Room for new measurements").fill("Count test");
  await page.keyboard.press("Escape");
  await options.waitFor({ state: "detached" });

  const pageSize = await page.evaluate(() => window.__gridscalr.canvas.pageSize());
  assert.ok(pageSize, "the demo page should have a size");
  const canvasBox = await page.locator("#canvas-interaction").boundingBox();
  assert.ok(canvasBox, "the canvas interaction surface should exist");
  const clickPage = async (point) => {
    const screen = await page.evaluate(
      (value) => window.__gridscalr.canvas.pageToScreen(value),
      point,
    );
    await page.mouse.click(canvasBox.x + screen.x, canvasBox.y + screen.y);
    await page.waitForTimeout(120);
  };
  await clickPage({ x: pageSize.width * 0.18, y: pageSize.height * 0.78 });
  await clickPage({ x: pageSize.width * 0.28, y: pageSize.height * 0.78 });

  const counts = await page.evaluate((typeId) => {
    const store = window.__gridscalr.store;
    return store.project.layers
      .filter((layer) => layer.kind === "measure")
      .flatMap((layer) =>
        layer.items
          .filter((item) => item.kind === "count" && item.countType === typeId)
          .map((item) => ({
            layerId: layer.id,
            itemId: item.id,
            room: item.room,
            quantity: item.countQuantity ?? 1,
          })),
      );
  }, customType.id);
  assert.equal(counts.length, 2, "two counts should be created with the custom type");
  assert.deepEqual(new Set(counts.map((entry) => entry.room)), new Set(["Count test"]));

  // Edit the first count to represent three pieces.
  await page.evaluate(
    (selection) => {
      window.__gridscalr.store.setSelection(selection);
    },
    { layerId: counts[0].layerId, itemId: counts[0].itemId },
  );
  await page.waitForTimeout(150);
  const pieces = page.getByLabel("Pieces represented by this count");
  await pieces.waitFor();
  assert.equal(await pieces.inputValue(), "1", "a new count starts with one piece");
  await pieces.fill("3");
  await pieces.press("Tab");
  await page.waitForTimeout(150);
  const quantity = await page.evaluate(
    (itemId) =>
      window.__gridscalr.store.project.layers
        .flatMap((layer) => layer.items)
        .find((item) => item.id === itemId)?.countQuantity,
    counts[0].itemId,
  );
  assert.equal(quantity, 3, "the Properties field should store three pieces");

  // Markups must show the custom type as the name and the quantity as the value.
  await page.keyboard.press("Control+l");
  const markups = page.locator(".markups-panel");
  await markups.waitFor({ state: "visible" });
  await markups.getByLabel("Filter markups by type").selectOption("measure");
  const firstRow = markups.locator(`[data-item-id="${counts[0].itemId}"]`);
  const secondRow = markups.locator(`[data-item-id="${counts[1].itemId}"]`);
  assert.match((await firstRow.locator(".markups-item-label").textContent()) ?? "", /Power socket/);
  assert.match((await firstRow.locator(".markups-value").textContent()) ?? "", /3 pcs/);
  assert.match(
    (await secondRow.locator(".markups-item-label").textContent()) ?? "",
    /Power socket/,
  );
  assert.match((await secondRow.locator(".markups-value").textContent()) ?? "", /1 pcs/);
  await page.keyboard.press("Control+l");
  await markups.waitFor({ state: "hidden" });

  // The quantity report must sum the pieces for the dedicated room.
  await page.keyboard.press("Control+Alt+q");
  const quantities = page.getByRole("dialog");
  await quantities.waitFor();
  const room = quantities.locator(".quantity-room").filter({ hasText: "Count test" });
  await room.waitFor();
  const countRow = room.locator(".quantity-row").filter({ hasText: /Count/ });
  await countRow.waitFor();
  const net = countRow.locator(".quantity-stat.is-net .quantity-stat-value");
  assert.equal((await net.textContent())?.trim(), "4", "the room should report 3 + 1 pieces");
  await page.keyboard.press("Escape");
  await quantities.waitFor({ state: "detached" });

  assert.deepEqual(pageErrors, [], "the count workflow should not raise page errors");
  await waitForApp(page);
  await waitForToastsGone(page);
  console.log(
    "Count workflow passed: custom type, two placements, 3 + 1 pcs, Markups and quantities.",
  );
} finally {
  await page?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await vite?.stop();
}

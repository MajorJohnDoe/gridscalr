import assert from "node:assert/strict";
import { launchBrowser, openDemoProject, startVite, waitForApp } from "./ui-harness.mjs";

const port = Number(process.env.GRIDSCALR_CANVAS_TEST_PORT ?? 1431);
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
  await page.evaluate(() => {
    // Keep the synthetic gestures independent of ink that happens to be near
    // the test points. The setting is part of the project, not history.
    window.__gridscalr.store.project.settings.snapToGeometry = false;
  });
  const canvasBox = await page.locator("#canvas-interaction").boundingBox();
  assert.ok(canvasBox, "the canvas interaction surface should exist");

  const screenPoint = async (point) =>
    page.evaluate((value) => window.__gridscalr.canvas.pageToScreen(value), point);
  const mousePoint = async (point) => {
    const local = await screenPoint(point);
    return { x: canvasBox.x + local.x, y: canvasBox.y + local.y };
  };
  const clickPage = async (point) => {
    const target = await mousePoint(point);
    await page.mouse.click(target.x, target.y);
    await page.waitForTimeout(80);
  };
  const dragScreen = async (start, end, steps = 8) => {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    for (let index = 1; index <= steps; index += 1) {
      await page.mouse.move(
        start.x + ((end.x - start.x) * index) / steps,
        start.y + ((end.y - start.y) * index) / steps,
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(100);
  };
  const dragPage = async (start, end) => {
    await dragScreen(await mousePoint(start), await mousePoint(end));
  };
  const itemIds = async () =>
    page.evaluate(() =>
      window.__gridscalr.store.project.layers.flatMap((layer) =>
        layer.items.map((item) => item.id),
      ),
    );
  const itemById = async (id) =>
    page.evaluate((itemId) => {
      for (const layer of window.__gridscalr.store.project.layers) {
        const item = layer.items.find((entry) => entry.id === itemId);
        if (item)
          return {
            ...item,
            layerId: layer.id,
            layerVisible: layer.visible,
            layerLocked: layer.locked,
          };
      }
      return null;
    }, id);
  const selectItem = async (id) => {
    await page.evaluate((itemId) => {
      for (const layer of window.__gridscalr.store.project.layers) {
        if (layer.items.some((item) => item.id === itemId)) {
          window.__gridscalr.store.setSelection({ layerId: layer.id, itemId });
          return;
        }
      }
    }, id);
    await page.waitForTimeout(80);
  };
  const handlesFor = async (id) =>
    page.evaluate((itemId) => window.__gridscalr.canvas.selectionHandles(itemId), id);
  const closeDialog = async () => {
    const dialog = page.getByRole("dialog");
    if ((await dialog.count()) === 0) return;
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
  };

  // 1. Length: real pointer clicks, finish with Enter, then undo.
  const beforeLength = await itemIds();
  await page.keyboard.press("l");
  await clickPage({ x: 200, y: 300 });
  await clickPage({ x: 400, y: 300 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
  const afterLength = await itemIds();
  const lengthId = afterLength.find((id) => !beforeLength.includes(id));
  assert.ok(lengthId, "a new length item should be created");
  const length = await itemById(lengthId);
  assert.equal(length.kind, "length");
  assert.equal(length.points.length, 2);
  assert.ok(Math.abs(length.points[0].x - 200) < 2 && Math.abs(length.points[1].x - 400) < 2);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(120);
  assert.equal(await itemById(lengthId), null, "undo should remove the new length");

  // 2. Quick rectangle area and vertex editing.
  await page.evaluate(() => {
    window.__gridscalr.store.ui.measureAreaShape = "rectangle";
  });
  await page.keyboard.press("a");
  await dragPage({ x: 500, y: 200 }, { x: 620, y: 320 });
  const afterArea = await itemIds();
  const areaId = afterArea.find((id) => !beforeLength.includes(id) && !afterLength.includes(id));
  assert.ok(areaId, "a new area item should be created");
  const area = await itemById(areaId);
  assert.equal(area.kind, "area");
  assert.equal(area.areaShape, "rectangle");
  assert.equal(area.points.length, 2);
  await page.keyboard.press("v");
  await selectItem(areaId);
  const areaHandles = await handlesFor(areaId);
  const areaVertex = areaHandles?.filter((handle) => handle.role === "vertex")[1];
  assert.ok(areaVertex, "the selected area should expose vertex handles");
  await dragScreen(
    { x: canvasBox.x + areaVertex.point.x, y: canvasBox.y + areaVertex.point.y },
    {
      x: canvasBox.x + areaVertex.point.x + 30,
      y: canvasBox.y + areaVertex.point.y + 20,
    },
  );
  const editedArea = await itemById(areaId);
  assert.ok(
    editedArea.points[1].x > area.points[1].x + 5 && editedArea.points[1].y > area.points[1].y + 5,
    "dragging a vertex should edit the quick area",
  );

  // 2b. Switch the Area tool to Deduct in the context bar and draw a deduction.
  await page.keyboard.press("a");
  const areaMode = page.locator(".area-mode-toggle");
  await areaMode.getByRole("button", { name: "Deduct", exact: true }).click();
  assert.equal(
    await areaMode
      .getByRole("button", { name: "Deduct", exact: true })
      .getAttribute("aria-pressed"),
    "true",
    "the context bar should expose the deduct mode",
  );
  await dragPage({ x: 540, y: 240 }, { x: 580, y: 280 });
  const afterDeduct = await itemIds();
  const deductionId = afterDeduct.find(
    (id) => !afterArea.includes(id) && !afterLength.includes(id) && id !== areaId,
  );
  assert.ok(deductionId, "a deduction area should be created");
  const deduction = await itemById(deductionId);
  assert.equal(deduction.kind, "area");
  assert.equal(deduction.areaMode, "subtract");
  await areaMode.getByRole("button", { name: "Add", exact: true }).click();

  // 3. Draw a rectangle, resize its south-east box handle and rotate it.
  await page.keyboard.press("r");
  await dragPage({ x: 700, y: 180 }, { x: 760, y: 240 });
  const rectIds = await itemIds();
  const rectId = rectIds.find((id) => !afterArea.includes(id) && id !== areaId);
  assert.ok(rectId, "a new rectangle item should be created");
  const rectangle = await itemById(rectId);
  assert.equal(rectangle.kind, "rect");
  await page.keyboard.press("v");
  await selectItem(rectId);
  const rectHandles = await handlesFor(rectId);
  const seHandle = rectHandles?.find((handle) => handle.role === "se");
  assert.ok(seHandle, "the selected rectangle should expose a south-east handle");
  const rectBefore = { ...rectangle };
  await dragScreen(
    { x: canvasBox.x + seHandle.point.x, y: canvasBox.y + seHandle.point.y },
    {
      x: canvasBox.x + seHandle.point.x + 25,
      y: canvasBox.y + seHandle.point.y + 15,
    },
  );
  const resized = await itemById(rectId);
  assert.notDeepEqual(
    resized.points,
    rectBefore.points,
    "dragging a box handle should resize the rectangle",
  );
  const rotate = (await handlesFor(rectId))?.find((handle) => handle.role === "rotate");
  assert.ok(rotate, "the selected rectangle should expose a rotation handle");
  await dragScreen(
    { x: canvasBox.x + rotate.point.x, y: canvasBox.y + rotate.point.y },
    { x: canvasBox.x + rotate.point.x + 60, y: canvasBox.y + rotate.point.y + 30 },
  );
  const rotatedRect = await itemById(rectId);
  assert.notEqual(
    rotatedRect.rotation,
    rectBefore.rotation,
    "dragging the rotation handle should rotate the rectangle",
  );

  // 3b. Stamps and symbols resize from their corner handles.
  const savedView = await page.evaluate(() => ({
    zoom: window.__gridscalr.store.ui.zoom,
    panX: window.__gridscalr.store.ui.panX,
    panY: window.__gridscalr.store.ui.panY,
  }));
  const centerOn = async (point) => {
    await page.evaluate((target) => {
      const canvas = document.querySelector("#canvas-interaction");
      const zoom = 2;
      window.__gridscalr.store.setView(
        zoom,
        canvas.clientWidth / 2 - target.x * zoom,
        canvas.clientHeight / 2 - target.y * zoom,
      );
    }, point);
    await page.waitForTimeout(120);
  };

  await page.keyboard.press("v");
  await centerOn({ x: 725, y: 374 });
  await selectItem("item_stamp_inspected");
  const stampHandles = await handlesFor("item_stamp_inspected");
  const stampSe = stampHandles?.find((handle) => handle.role === "se");
  assert.ok(stampSe, "the selected stamp should expose a south-east handle");
  const stampBefore = await itemById("item_stamp_inspected");
  await dragScreen(
    { x: canvasBox.x + stampSe.point.x, y: canvasBox.y + stampSe.point.y },
    { x: canvasBox.x + stampSe.point.x + 40, y: canvasBox.y + stampSe.point.y + 30 },
  );
  const stampAfter = await itemById("item_stamp_inspected");
  assert.ok(
    stampAfter.fontSize > stampBefore.fontSize,
    "dragging the stamp corner should grow the plate",
  );

  await centerOn({ x: 824, y: 646 });
  await selectItem("item_symbol_exit");
  const symbolHandles = await handlesFor("item_symbol_exit");
  assert.deepEqual(
    symbolHandles.filter((handle) => handle.role !== "rotate").map((handle) => handle.role),
    ["nw", "ne", "se", "sw"],
    "a symbol should expose four corner handles",
  );
  const symbolSe = symbolHandles.find((handle) => handle.role === "se");
  assert.ok(symbolSe, "the selected symbol should expose a south-east handle");
  await dragScreen(
    { x: canvasBox.x + symbolSe.point.x, y: canvasBox.y + symbolSe.point.y },
    { x: canvasBox.x + symbolSe.point.x + 36, y: canvasBox.y + symbolSe.point.y + 36 },
  );
  const symbolAfter = await itemById("item_symbol_exit");
  assert.ok(
    (symbolAfter.symbolSize ?? 24) > 24,
    "dragging the symbol corner should grow the plate",
  );
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(150);
  const symbolUndone = await itemById("item_symbol_exit");
  assert.equal(symbolUndone.symbolSize ?? 24, 24, "the symbol resize should be one undo step");

  // Restore the view so the following gestures keep their original framing.
  await page.evaluate((view) => {
    window.__gridscalr.store.setView(view.zoom, view.panX, view.panY);
  }, savedView);
  await page.waitForTimeout(120);

  // 4. Rotate an existing text object from its rotation handle.
  await page.keyboard.press("v");
  await selectItem("item_text_hatch");
  const textHandles = await handlesFor("item_text_hatch");
  const rotateHandle = textHandles?.find((handle) => handle.role === "rotate");
  assert.ok(rotateHandle, "the selected text should expose a rotation handle");
  const textBefore = await itemById("item_text_hatch");
  await dragScreen(
    { x: canvasBox.x + rotateHandle.point.x, y: canvasBox.y + rotateHandle.point.y },
    { x: canvasBox.x + rotateHandle.point.x + 70, y: canvasBox.y + rotateHandle.point.y + 35 },
  );
  const textAfter = await itemById("item_text_hatch");
  assert.notEqual(
    textAfter.rotation,
    textBefore.rotation,
    "dragging the rotation handle should rotate the text",
  );

  // 5. Text editor: create, commit with Enter, then cancel a second edit.
  await page.keyboard.press("v");
  const beforeText = await itemIds();
  await page.keyboard.press("t");
  await clickPage({ x: 260, y: 500 });
  const editor = page.locator(".canvas-text-editor-input");
  await editor.waitFor();
  await editor.fill("Canvas regression note");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
  const afterText = await itemIds();
  const textId = afterText.find((id) => !beforeText.includes(id));
  assert.ok(textId, "the text editor should create an item");
  assert.equal((await itemById(textId)).text, "Canvas regression note");

  await page.keyboard.press("t");
  await clickPage({ x: 300, y: 500 });
  await page.locator(".canvas-text-editor-input").waitFor();
  await page.locator(".canvas-text-editor-input").fill("Should be cancelled");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(100);
  assert.equal(
    (await itemIds()).filter((id) => !afterText.includes(id)).length,
    0,
    "Escape should cancel text creation",
  );

  // 6. Measurement-label dragging and editing.
  await page.keyboard.press("v");
  await selectItem("item_floor_living");
  const draggableLabel = await page.evaluate(() =>
    window.__gridscalr.canvas.labelScreenPoint("item_floor_living"),
  );
  assert.ok(draggableLabel, "the measurement label should have a screen position");
  await dragScreen(
    { x: canvasBox.x + draggableLabel.x, y: canvasBox.y + draggableLabel.y },
    { x: canvasBox.x + draggableLabel.x + 70, y: canvasBox.y + draggableLabel.y + 45 },
  );
  const movedLabel = await itemById("item_floor_living");
  assert.ok(
    movedLabel.labelOffset &&
      Math.abs(movedLabel.labelOffset.x) > 10 &&
      Math.abs(movedLabel.labelOffset.y) > 10,
    "dragging a measurement label should store a manual offset",
  );
  const movedLabelPoint = await page.evaluate(() =>
    window.__gridscalr.canvas.labelScreenPoint("item_floor_living"),
  );
  assert.ok(movedLabelPoint, "the moved measurement label should have a screen position");
  await page.mouse.click(canvasBox.x + movedLabelPoint.x, canvasBox.y + movedLabelPoint.y, {
    button: "right",
  });
  const labelMenu = page.locator(".popover:not(.popover-submenu)").first();
  await labelMenu.waitFor();
  await labelMenu.getByRole("button", { name: /Choose connection point/ }).click();
  await clickPage({ x: 240, y: 48 });
  const connected = await itemById("item_floor_living");
  assert.ok(
    connected.labelAnchor &&
      Math.abs(connected.labelAnchor.x - 240) < 2 &&
      Math.abs(connected.labelAnchor.y - 48) < 2,
    "choosing a connection point should store it on the measurement",
  );
  const connectedLabelPoint = await page.evaluate(() =>
    window.__gridscalr.canvas.labelScreenPoint("item_floor_living"),
  );
  assert.ok(connectedLabelPoint, "the connected label should have a screen position");
  await page.mouse.click(canvasBox.x + connectedLabelPoint.x, canvasBox.y + connectedLabelPoint.y, {
    button: "right",
  });
  await labelMenu.waitFor();
  await labelMenu.getByRole("button", { name: /Reset label position/ }).click();
  const resetLabel = await itemById("item_floor_living");
  assert.equal(resetLabel.labelOffset, undefined);
  assert.equal(resetLabel.labelAnchor, undefined);

  const labelPoint = await page.evaluate(() =>
    window.__gridscalr.canvas.labelScreenPoint("item_floor_living"),
  );
  assert.ok(labelPoint, "the measurement label should have a screen position");
  await page.mouse.dblclick(canvasBox.x + labelPoint.x, canvasBox.y + labelPoint.y);
  const labelEditor = page.locator(".canvas-label-editor-input");
  await labelEditor.waitFor();
  await labelEditor.fill("QA living");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  assert.equal((await itemById("item_floor_living")).label, "QA living");

  // 6b. Measurement labels resize from their corner handle and reset to the
  // project size. The stored size is paper-space, so export uses it too.
  await page.keyboard.press("v");
  await selectItem("item_floor_living");
  const resizeLabelPoint = await page.evaluate(() =>
    window.__gridscalr.canvas.labelResizeScreenPoint("item_floor_living"),
  );
  assert.ok(resizeLabelPoint, "the measurement label should have a resize handle");
  const sizeBeforeDrag = (await itemById("item_floor_living")).labelSize ?? 6;
  await dragScreen(
    {
      x: canvasBox.x + resizeLabelPoint.x,
      y: canvasBox.y + resizeLabelPoint.y,
    },
    {
      x: canvasBox.x + resizeLabelPoint.x + 48,
      y: canvasBox.y + resizeLabelPoint.y + 36,
    },
  );
  const resizedLabel = await itemById("item_floor_living");
  assert.ok(
    resizedLabel.labelSize > sizeBeforeDrag,
    "dragging the label corner should increase its paper-space size",
  );
  await page.getByRole("button", { name: "Reset label size" }).click();
  assert.equal(
    (await itemById("item_floor_living")).labelSize,
    undefined,
    "Reset label size should remove the per-measurement override",
  );

  // 6c. Lock the label inside the area, then drag it out again.
  const fitLabelPoint = await page.evaluate(() =>
    window.__gridscalr.canvas.labelScreenPoint("item_floor_living"),
  );
  assert.ok(fitLabelPoint, "the measurement label should have a screen position");
  await page.mouse.click(canvasBox.x + fitLabelPoint.x, canvasBox.y + fitLabelPoint.y, {
    button: "right",
  });
  const fitMenu = page.locator(".popover:not(.popover-submenu)").first();
  await fitMenu.waitFor();
  await fitMenu.getByRole("button", { name: /Lock inside area/ }).click();
  const fitSubmenu = page.locator(".popover-submenu");
  await fitSubmenu.waitFor();
  await fitSubmenu.getByRole("button", { name: /^Top left$/ }).click();
  const fitted = await itemById("item_floor_living");
  assert.equal(fitted.labelFit, "top-left", "the label should be locked inside the area");

  const fittedPoint = await page.evaluate(() =>
    window.__gridscalr.canvas.labelScreenPoint("item_floor_living"),
  );
  await dragScreen(
    { x: canvasBox.x + fittedPoint.x, y: canvasBox.y + fittedPoint.y },
    { x: canvasBox.x + fittedPoint.x + 70, y: canvasBox.y + fittedPoint.y + 45 },
  );
  const released = await itemById("item_floor_living");
  assert.equal(released.labelFit, undefined, "dragging the label should release the lock");
  assert.ok(released.labelOffset, "the released label should keep a manual offset");
  assert.ok(
    released.labelSize >= 4 && released.labelSize <= 6,
    "the released label should keep the fitted paper-space size",
  );

  // 7. Callout text editor.
  await page.keyboard.press("v");
  await selectItem("item_callout_window");
  const calloutPoint = await page.evaluate(() =>
    window.__gridscalr.canvas.annotationScreenPoint("item_callout_window"),
  );
  assert.ok(calloutPoint, "the callout text box should have a screen position");
  await page.mouse.dblclick(canvasBox.x + calloutPoint.x, canvasBox.y + calloutPoint.y);
  const calloutEditor = page.locator(".canvas-text-editor-input");
  await calloutEditor.waitFor();
  await calloutEditor.fill("QA callout");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  assert.equal((await itemById("item_callout_window")).text, "QA callout");

  // 7b. Length line style: dashed measurement lines.
  await page.keyboard.press("v");
  await selectItem("item_wall_partition");
  await page.getByLabel("Measurement line style").selectOption("dashed");
  assert.equal(
    (await itemById("item_wall_partition")).lineStyle,
    "dashed",
    "the Properties line style should mark the length as dashed",
  );

  // 8. Hidden and locked items stay out of hit testing.
  await page.keyboard.press("v");
  await page.evaluate(() => {
    const layer = window.__gridscalr.store.project.layers.find((entry) => entry.kind === "measure");
    if (layer) layer.visible = false;
    window.__gridscalr.store.clearSelection();
    window.__gridscalr.store.emit("change");
  });
  await clickPage({ x: 600, y: 300 });
  assert.equal(
    await page.evaluate(() => window.__gridscalr.store.ui.selection.length),
    0,
    "a hidden layer must not be hit-tested",
  );
  await page.evaluate(() => {
    const layer = window.__gridscalr.store.project.layers.find((entry) => entry.kind === "measure");
    if (layer) layer.visible = true;
    window.__gridscalr.store.emit("change");
  });
  await selectItem("item_floor_living");
  const lockedBefore = await itemById("item_floor_living");
  await page.evaluate(() => {
    for (const layer of window.__gridscalr.store.project.layers) {
      const item = layer.items.find((entry) => entry.id === "item_floor_living");
      if (item) item.locked = true;
    }
    window.__gridscalr.store.emit("change");
  });
  await dragPage({ x: 600, y: 300 }, { x: 640, y: 340 });
  const lockedAfter = await itemById("item_floor_living");
  assert.deepEqual(
    lockedAfter.points,
    lockedBefore.points,
    "a locked item must not be moved by a canvas drag",
  );

  // 9. Crop mode: draw an area, confirm, and close the reopened export dialog.
  await page.evaluate(() => {
    for (const layer of window.__gridscalr.store.project.layers) {
      const item = layer.items.find((entry) => entry.id === "item_floor_living");
      if (item) item.locked = false;
    }
    window.__gridscalr.store.emit("change");
  });
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /^Export/ }).click();
  await page.getByRole("menuitem", { name: "Drawing PDF…" }).click();
  const exportDialog = page.getByRole("dialog");
  await exportDialog.waitFor();
  await exportDialog.getByRole("button", { name: "Draw area…" }).click();
  await exportDialog.waitFor({ state: "detached" });
  await dragPage({ x: 100, y: 100 }, { x: 500, y: 400 });
  await page.keyboard.press("Enter");
  await exportDialog.waitFor();
  await page.getByText(/Same relative area on every selected page/).waitFor();
  await closeDialog();

  await waitForApp(page);
  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("; ")}`);
  console.log(
    "Canvas regression passed: length, area, deduction, dashed lines, label dragging, label connection/reset, resize, rotate, stamp and symbol resize, text, label/callout editing, hidden/locked and crop.",
  );
} finally {
  await page?.close();
  await browser?.close();
  await vite?.stop();
}

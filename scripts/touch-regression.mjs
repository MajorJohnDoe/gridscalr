import assert from "node:assert/strict";
import { launchBrowser, openDemoProject, startVite, waitForApp } from "./ui-harness.mjs";

const port = Number(process.env.GRIDSCALR_TOUCH_TEST_PORT ?? 1437);
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
    hasTouch: true,
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await openDemoProject(page, { base: vite.base });

  const canvasBox = await page.locator("#canvas-interaction").boundingBox();
  assert.ok(canvasBox, "the canvas interaction surface should exist");
  const cdp = await page.context().newCDPSession(page);
  const center = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height / 2 };
  const touchPoints = (points) =>
    points.map((point, index) => ({
      x: point.x,
      y: point.y,
      id: index + 1,
      radiusX: 3,
      radiusY: 3,
      force: 1,
    }));
  const touch = (type, points) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: touchPoints(points) });

  const initial = await page.evaluate(() => ({
    zoom: window.__gridscalr.store.ui.zoom,
    panX: window.__gridscalr.store.ui.panX,
    panY: window.__gridscalr.store.ui.panY,
  }));
  const anchor = await page.evaluate((point) => window.__gridscalr.canvas.screenToPage(point), {
    x: canvasBox.width / 2,
    y: canvasBox.height / 2,
  });

  // Two-finger pinch zooms around the midpoint and leaves no draft behind.
  await touch("touchStart", [
    { x: center.x - 60, y: center.y },
    { x: center.x + 60, y: center.y },
  ]);
  await touch("touchMove", [
    { x: center.x - 130, y: center.y },
    { x: center.x + 130, y: center.y },
  ]);
  await page.waitForTimeout(120);
  const pinched = await page.evaluate(() => ({
    zoom: window.__gridscalr.store.ui.zoom,
    draft: window.__gridscalr.canvas.draftKind(),
  }));
  assert.ok(pinched.zoom > initial.zoom * 1.5, "pinching apart should zoom in");
  assert.equal(pinched.draft, null, "a pinch should not leave a draft");
  const anchorAfter = await page.evaluate(
    (point) => window.__gridscalr.canvas.pageToScreen(point),
    anchor,
  );
  assert.ok(
    Math.abs(anchorAfter.x - canvasBox.width / 2) < 1.5 &&
      Math.abs(anchorAfter.y - canvasBox.height / 2) < 1.5,
    "the page point under the pinch midpoint should stay under it",
  );
  await touch("touchEnd", []);

  // Two-finger drag pans without changing zoom.
  await page.evaluate((view) => {
    window.__gridscalr.store.setView(view.zoom, view.panX, view.panY);
  }, initial);
  await page.waitForTimeout(80);
  const beforePan = await page.evaluate(() => ({
    zoom: window.__gridscalr.store.ui.zoom,
    panX: window.__gridscalr.store.ui.panX,
    panY: window.__gridscalr.store.ui.panY,
  }));
  await touch("touchStart", [
    { x: center.x - 60, y: center.y },
    { x: center.x + 60, y: center.y },
  ]);
  await touch("touchMove", [
    { x: center.x + 10, y: center.y + 40 },
    { x: center.x + 130, y: center.y + 40 },
  ]);
  await page.waitForTimeout(120);
  const afterPan = await page.evaluate(() => ({
    zoom: window.__gridscalr.store.ui.zoom,
    panX: window.__gridscalr.store.ui.panX,
    panY: window.__gridscalr.store.ui.panY,
  }));
  assert.ok(Math.abs(afterPan.zoom - beforePan.zoom) < 1e-6, "panning should keep zoom");
  assert.ok(Math.abs(afterPan.panX - beforePan.panX - 70) < 2, "two-finger drag should pan X");
  assert.ok(Math.abs(afterPan.panY - beforePan.panY - 40) < 2, "two-finger drag should pan Y");
  await touch("touchEnd", []);

  // The same gesture navigates the primary view from the reference pane.
  await page.keyboard.press("Control+Shift+2");
  const reference = page.locator(".reference-canvas");
  await reference.waitFor({ state: "visible" });
  await page.waitForTimeout(250);
  const referenceBox = await reference.boundingBox();
  assert.ok(referenceBox, "the reference pane should have a canvas");
  const referenceCenter = {
    x: referenceBox.x + referenceBox.width / 2,
    y: referenceBox.y + referenceBox.height / 2,
  };
  const beforeReference = await page.evaluate(() => window.__gridscalr.store.ui.zoom);
  await touch("touchStart", [
    { x: referenceCenter.x - 50, y: referenceCenter.y },
    { x: referenceCenter.x + 50, y: referenceCenter.y },
  ]);
  await touch("touchMove", [
    { x: referenceCenter.x - 110, y: referenceCenter.y },
    { x: referenceCenter.x + 110, y: referenceCenter.y },
  ]);
  await page.waitForTimeout(120);
  const afterReference = await page.evaluate(() => window.__gridscalr.store.ui.zoom);
  assert.ok(
    afterReference > beforeReference * 1.5,
    "pinching the reference pane should zoom the primary view",
  );
  await touch("touchEnd", []);
  await page.keyboard.press("Control+Shift+2");
  await page.waitForTimeout(200);

  // A pen hit suppresses a following palm touch, then touch works again.
  const tap = {
    x: canvasBox.x + canvasBox.width * 0.18,
    y: canvasBox.y + canvasBox.height * 0.8,
  };
  await page.evaluate((view) => {
    window.__gridscalr.store.setView(view.zoom, view.panX, view.panY);
  }, initial);
  await page.keyboard.press("v");
  const penPoint = {
    x: canvasBox.x + canvasBox.width * 0.35,
    y: canvasBox.y + canvasBox.height * 0.72,
  };
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: penPoint.x,
    y: penPoint.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
    pointerType: "pen",
  });
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: penPoint.x,
    y: penPoint.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
    pointerType: "pen",
  });
  await page.keyboard.press("c");
  const countBeforePalm = await page.evaluate(() =>
    window.__gridscalr.store.project.layers.reduce(
      (total, layer) => total + layer.items.filter((item) => item.kind === "count").length,
      0,
    ),
  );
  await touch("touchStart", [tap]);
  await touch("touchEnd", []);
  await page.waitForTimeout(120);
  const countAfterPalm = await page.evaluate(() =>
    window.__gridscalr.store.project.layers.reduce(
      (total, layer) => total + layer.items.filter((item) => item.kind === "count").length,
      0,
    ),
  );
  assert.equal(countAfterPalm, countBeforePalm, "a palm touch after a pen should be ignored");
  await page.waitForTimeout(900);
  await touch("touchStart", [tap]);
  await touch("touchEnd", []);
  await page.waitForTimeout(120);
  const countAfterWait = await page.evaluate(() =>
    window.__gridscalr.store.project.layers.reduce(
      (total, layer) => total + layer.items.filter((item) => item.kind === "count").length,
      0,
    ),
  );
  assert.equal(countAfterWait, countBeforePalm + 1, "touch should work after the pen window");

  // Long-press on a selectable item opens the same context menu as right-click.
  await page.keyboard.press("v");
  await page.evaluate(() => window.__gridscalr.store.clearSelection());
  const itemScreen = await page.evaluate(() => {
    const project = window.__gridscalr.store.project;
    const item = project.layers
      .flatMap((layer) => layer.items)
      .find((entry) => entry.id === "item_count_radiator");
    return item ? window.__gridscalr.canvas.pageToScreen(item.points[0]) : null;
  });
  assert.ok(itemScreen, "the demo count should be available for the long-press test");
  const longPressPoint = {
    x: canvasBox.x + itemScreen.x,
    y: canvasBox.y + itemScreen.y,
  };
  await touch("touchStart", [longPressPoint]);
  await page.waitForTimeout(650);
  assert.ok(
    (await page.locator(".popover").count()) > 0,
    "long-press should open the item context menu",
  );
  await touch("touchEnd", []);
  await page.keyboard.press("Escape");

  assert.deepEqual(pageErrors, [], "touch navigation should not raise page errors");
  await waitForApp(page);
  console.log(
    "Touch passed: primary/reference pinch and pan, pen priority, palm rejection, long-press menu and one-finger count placement.",
  );
} finally {
  await page?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await vite?.stop();
}

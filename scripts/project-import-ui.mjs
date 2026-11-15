import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  launchBrowser,
  repoRoot,
  startVite,
  waitForApp,
  waitForToastsGone,
} from "./ui-harness.mjs";

const port = Number(process.env.GRIDSCALR_UI_PORT ?? 1420);
const NOW = "2026-01-01T00:00:00.000Z";
const pageErrors = [];
let browser;
let vite;
let directory;

function templateDocument(id, name, projectName) {
  return {
    id,
    kind: "template",
    name,
    path: null,
    relativePath: null,
    sha256: "",
    pageCount: 1,
    sizeBytes: 0,
    template: {
      id: "gridscalr.operation-card.frame",
      version: 1,
      paper: "A3",
      fields: {
        "project.name": projectName,
        "title.page": "1",
      },
    },
  };
}

function baseItem(id, page, kind, points, extra = {}) {
  return {
    id,
    page,
    kind,
    points,
    color: "#ffffff",
    strokeWidth: 2,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

function textItem(id, page, text) {
  return baseItem(id, page, "text", [{ x: 20, y: 20 }], { text });
}

function rectItem(id, page) {
  return baseItem(id, page, "rect", [
    { x: 40, y: 40 },
    { x: 140, y: 100 },
  ]);
}

function lengthItem(id, page, categoryId) {
  return baseItem(
    id,
    page,
    "length",
    [
      { x: 20, y: 120 },
      { x: 120, y: 120 },
    ],
    {
      color: "#4cc9f0",
      scale: { pointsPerMeter: 20, sourceUnit: "m" },
      categoryId,
    },
  );
}

function drawLayer(id, items) {
  return {
    id,
    name: "Markups",
    kind: "draw",
    visible: true,
    locked: false,
    opacity: 1,
    color: "#f4a261",
    homePage: 1,
    items,
  };
}

function measureLayer(id, items) {
  return {
    id,
    name: "Measurements",
    kind: "measure",
    visible: true,
    locked: false,
    opacity: 1,
    color: "#4cc9f0",
    homePage: 1,
    items,
  };
}

function destinationFixture() {
  return {
    schemaVersion: 23,
    id: "project_destination",
    name: "Destination",
    documents: [templateDocument("doc_dest", "Destination sheet", "Destination card")],
    categories: [{ id: "cat_other", name: "Other" }],
    countTypes: [{ id: "other", label: "Other", glyph: "other" }],
    countPresets: [],
    lineTypes: [],
    assets: {},
    pages: { 1: { name: "Destination page" } },
    markupsViews: [],
    layers: [
      drawLayer("layer_dest_draw", [textItem("dest_text", 1, "Destination note")]),
      measureLayer("layer_dest_measure", []),
    ],
    activeLayerId: "layer_dest_draw",
  };
}

/** A project whose PDF has moved: its file path no longer resolves. */
function missingSourceFixture() {
  return {
    schemaVersion: 23,
    id: "project_missing_source",
    name: "Missing source",
    documents: [
      {
        id: "doc_moved_plan",
        kind: "pdf",
        name: "Moved plan.pdf",
        path: "/nonexistent/moved-plan.pdf",
        relativePath: null,
        sha256: "",
        pageCount: 3,
        sizeBytes: 0,
      },
    ],
    categories: [],
    countTypes: [],
    countPresets: [],
    lineTypes: [],
    assets: {},
    pages: {
      1: { name: "Moved plan 1" },
      2: { name: "Moved plan 2" },
      3: { name: "Moved plan 3" },
    },
    markupsViews: [],
    layers: [
      drawLayer("layer_missing_draw", [textItem("missing_text", 1, "Moved note")]),
      measureLayer("layer_missing_measure", []),
    ],
    activeLayerId: "layer_missing_draw",
  };
}

function sourceFixture() {
  return {
    schemaVersion: 23,
    id: "project_source",
    name: "Source",
    documents: [templateDocument("doc_source", "Source sheet", "Source card")],
    // A different id with the same name must map onto the destination's Other.
    categories: [{ id: "cat_other_source", name: "Other" }],
    countTypes: [{ id: "other", label: "Other", glyph: "other" }],
    countPresets: [],
    lineTypes: [],
    assets: {},
    pages: { 1: { name: "Source sheet" } },
    markupsViews: [],
    layers: [
      drawLayer("layer_src_draw", [
        textItem("src_text", 1, "Imported note"),
        rectItem("src_rect", 1),
      ]),
      measureLayer("layer_src_measure", [lengthItem("src_length", 1, "cat_other_source")]),
    ],
    activeLayerId: "layer_src_draw",
  };
}

try {
  directory = await mkdtemp(join(tmpdir(), "gridscalr-import-"));
  const destinationPath = join(directory, "destination.gridscalr");
  const sourcePath = join(directory, "source.gridscalr");
  const missingPath = join(directory, "moved-source.gridscalr");
  const destination = destinationFixture();
  const source = sourceFixture();
  await writeFile(destinationPath, JSON.stringify(destination, null, 2));
  await writeFile(sourcePath, JSON.stringify(source, null, 2));
  await writeFile(missingPath, JSON.stringify(missingSourceFixture(), null, 2));
  const sourceBefore = await readFile(sourcePath, "utf8");
  const missingBefore = await readFile(missingPath, "utf8");

  vite = await startVite({ port });
  browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(vite.base, { waitUntil: "domcontentloaded" });
  await page.locator(".app-shell").waitFor();
  await page.evaluate(
    (payload) => {
      localStorage.setItem("gridscalr.autosave.v1", JSON.stringify(payload));
    },
    { project: destination, projectPath: null, savedAt: new Date().toISOString() },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Recovery center" }).waitFor();
  await page.getByRole("button", { name: "Recovery center" }).click();
  const recoveryDialog = page.getByRole("dialog", { name: "Recovery center" });
  await recoveryDialog.waitFor();
  await recoveryDialog.getByRole("button", { name: "Restore selected" }).click();
  await page.getByText("Destination page").first().waitFor();
  await waitForApp(page);
  await waitForToastsGone(page);
  assert.equal(await page.locator(".page-card").count(), 1);

  await page.getByRole("menuitem", { name: "File" }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: /Import pages from project/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(sourcePath);

  const dialog = page.getByRole("dialog", { name: "Import pages from project" });
  await dialog.waitFor();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: /Import 1 page/ }).click();
  await dialog.waitFor({ state: "detached" });
  const preflight = page.getByRole("dialog", { name: "Import preflight" });
  await preflight.waitFor();
  await preflight.getByRole("button", { name: "Import pages", exact: true }).click();
  await preflight.waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelectorAll(".page-card").length === 2);
  await waitForToastsGone(page);

  const imported = await page.evaluate(() => {
    const project = window.__gridscalr.store.project;
    const pageOneId = project.pages[0]?.id;
    const pageTwoId = project.pages[1]?.id;
    const pageTwo = project.layers
      .flatMap((layer) => layer.items)
      .filter((item) => item.pageId === pageTwoId);
    const length = pageTwo.find((item) => item.kind === "length");
    return {
      documents: project.documents.length,
      pages: project.pages.map((page) => page.id),
      pageTwoName: project.pages[1]?.state.name,
      pageTwoItems: pageTwo.length,
      pageTwoLayers: project.layers
        .filter((layer) => layer.homePageId === pageTwoId)
        .map((layer) => ({ name: layer.name, items: layer.items.length }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      category: length
        ? project.categories.find((entry) => entry.id === length.categoryId)?.name
        : null,
      currentPage: window.__gridscalr.store.ui.page,
      pageOneItems: project.layers.reduce(
        (sum, layer) => sum + layer.items.filter((item) => item.pageId === pageOneId).length,
        0,
      ),
    };
  });
  assert.equal(imported.documents, 2);
  assert.equal(imported.pages.length, 2);
  assert.equal(imported.pageTwoName, "Source sheet");
  assert.equal(imported.pageTwoItems, 3);
  assert.deepEqual(imported.pageTwoLayers, [
    { name: "Markups", items: 2 },
    { name: "Measurements", items: 1 },
  ]);
  assert.equal(imported.category, "Other");
  assert.equal(imported.currentPage, 2);
  assert.equal(imported.pageOneItems, 1);

  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => window.__gridscalr.store.project?.documents.length === 1);
  const undone = await page.evaluate(() => ({
    documents: window.__gridscalr.store.project.documents.length,
    hasPageTwo: window.__gridscalr.store.project.pages.length >= 2,
    currentPage: window.__gridscalr.store.ui.page,
  }));
  assert.equal(undone.documents, 1);
  assert.equal(undone.hasPageTwo, false);
  assert.equal(undone.currentPage, 1);
  assert.equal(await page.locator(".page-card").count(), 1);

  await page.keyboard.press("Control+Shift+z");
  await page.waitForFunction(() => window.__gridscalr.store.project?.documents.length === 2);
  const redone = await page.evaluate(() => {
    const project = window.__gridscalr.store.project;
    return {
      documents: project.documents.length,
      pageTwoName: project.pages[1]?.state.name,
      pageTwoItems: project.layers.reduce(
        (sum, layer) =>
          sum + layer.items.filter((item) => item.pageId === project.pages[1]?.id).length,
        0,
      ),
    };
  });
  assert.equal(redone.documents, 2);
  assert.equal(redone.pageTwoName, "Source sheet");
  assert.equal(redone.pageTwoItems, 3);
  assert.equal(await page.locator(".page-card").count(), 2);

  // A PDF dropped on the Pages panel goes through the page picker and the
  // existing import preflight, inserts at the drop line and is one undo step.
  const planPath = join(repoRoot, "fixtures", "industrial-plan.pdf");
  const planBytes = await readFile(planPath);
  const planBase64 = planBytes.toString("base64");
  await page.evaluate(
    ({ name, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const file = new File([bytes], name, { type: "application/pdf" });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      const list = document.querySelector(".page-list");
      if (!list) throw new Error("page list missing");
      const rect = list.getBoundingClientRect();
      list.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + 20,
          clientY: rect.bottom - 2,
          dataTransfer: transfer,
        }),
      );
    },
    { name: "industrial-plan.pdf", base64: planBase64 },
  );
  const pageDialog = page.getByRole("dialog", { name: "Add pages" });
  await pageDialog.waitFor();
  await pageDialog.getByRole("button", { name: "Add 3 pages" }).click();
  await pageDialog.waitFor({ state: "detached" });
  const dropPreflight = page.getByRole("dialog", { name: "Import preflight" });
  await dropPreflight.waitFor();
  await dropPreflight.getByRole("button", { name: "Import pages", exact: true }).click();
  await dropPreflight.waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelectorAll(".page-card").length === 5);
  await waitForToastsGone(page);
  const afterDrop = await page.evaluate(() => ({
    documents: window.__gridscalr.store.project.documents.length,
    pages: window.__gridscalr.store.project.pages.length,
    lastLocalPages: window.__gridscalr.store.project.pages
      .slice(-3)
      .map((record) => record.localPage),
  }));
  assert.equal(afterDrop.documents, 3);
  assert.equal(afterDrop.pages, 5);
  assert.deepEqual(afterDrop.lastLocalPages, [1, 2, 3]);
  assert.deepEqual(await readFile(planPath), planBytes);

  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => document.querySelectorAll(".page-card").length === 2);
  const afterDropUndo = await page.evaluate(() => ({
    documents: window.__gridscalr.store.project.documents.length,
    pages: window.__gridscalr.store.project.pages.length,
  }));
  assert.equal(afterDropUndo.documents, 2);
  assert.equal(afterDropUndo.pages, 2);

  await page.keyboard.press("Control+Shift+z");
  await page.waitForFunction(() => document.querySelectorAll(".page-card").length === 5);
  const afterDropRedo = await page.evaluate(() => ({
    documents: window.__gridscalr.store.project.documents.length,
    pages: window.__gridscalr.store.project.pages.length,
  }));
  assert.equal(afterDropRedo.documents, 3);
  assert.equal(afterDropRedo.pages, 5);

  // A source project whose PDF was moved recovers through the picker and the
  // preflight Relink…, without editing the source project first. The picker
  // keeps the pages selectable and marks them unavailable; the preflight owns
  // the relink because no page can be imported without it.
  async function openMissingSourcePicker() {
    await page.getByRole("menuitem", { name: "File" }).click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("menuitem", { name: /Import pages from project/ }).click();
    await (await chooser).setFiles(missingPath);
    const dialog = page.getByRole("dialog", { name: "Import pages from project" });
    await dialog.waitFor();
    return dialog;
  }

  async function checkMovedPdfPicker() {
    const dialog = await openMissingSourcePicker();
    const tile = dialog.locator('.project-import-tile[data-page="1"]');
    assert.equal(await tile.locator("input").isDisabled(), false);
    assert.match(await tile.innerText(), /File missing/);
    assert.match(await tile.innerText(), /Relink or skip these pages in the preflight/);
    await dialog.getByRole("button", { name: "Select all" }).click();
    assert.match(
      await dialog.locator(".project-import-missing-note").innerText(),
      /relink the file or skip those pages/,
    );
    await dialog.getByRole("button", { name: /Import 3 pages/ }).click();
    await dialog.waitFor({ state: "detached" });
    const preflight = page.getByRole("dialog", { name: "Import preflight" });
    await preflight.waitFor();
    return preflight;
  }

  // Cancel from the preflight after selecting the moved pages changes nothing.
  const cancelledPreflight = await checkMovedPdfPicker();
  await cancelledPreflight.getByRole("button", { name: "Cancel" }).click();
  await cancelledPreflight.waitFor({ state: "detached" });
  assert.equal(await page.locator(".page-card").count(), 5);
  assert.equal(await readFile(missingPath, "utf8"), missingBefore);

  const missingPreflight = await checkMovedPdfPicker();
  assert.match(
    await missingPreflight.locator(".preflight-summary").innerText(),
    /No selected page can be imported/,
  );
  assert.equal(
    await missingPreflight.getByRole("button", { name: "Import pages", exact: true }).isDisabled(),
    true,
  );
  // Every selected page belongs to the moved file, so skipping cannot help.
  assert.equal(await missingPreflight.locator('.preflight-action[data-action="skip"]').count(), 0);
  const relinkChooser = page.waitForEvent("filechooser");
  await missingPreflight.getByRole("button", { name: /Relink/ }).click();
  await (await relinkChooser).setFiles(join(repoRoot, "fixtures", "industrial-plan.pdf"));
  await missingPreflight.getByText("Verified").waitFor();
  assert.match(
    await missingPreflight.locator(".preflight-summary").innerText(),
    /3 pages ready to import/,
  );
  await missingPreflight.getByRole("button", { name: "Import pages", exact: true }).click();
  await missingPreflight.waitFor({ state: "detached" });
  await page.waitForFunction(() => document.querySelectorAll(".page-card").length === 8);
  await waitForToastsGone(page);

  const recovered = await page.evaluate(() => {
    const project = window.__gridscalr.store.project;
    return {
      documents: project.documents.length,
      pages: project.pages.length,
      names: project.pages.slice(-3).map((record) => record.state.name),
      firstImportedItems: project.layers.reduce(
        (sum, layer) =>
          sum + layer.items.filter((item) => item.pageId === project.pages[5]?.id).length,
        0,
      ),
    };
  });
  assert.equal(recovered.documents, 4);
  assert.equal(recovered.pages, 8);
  assert.deepEqual(recovered.names, ["Moved plan 1", "Moved plan 2", "Moved plan 3"]);
  assert.equal(recovered.firstImportedItems, 1);

  // The recovery import stays one undo step.
  await page.keyboard.press("Control+z");
  await page.waitForFunction(() => document.querySelectorAll(".page-card").length === 5);
  await page.keyboard.press("Control+Shift+z");
  await page.waitForFunction(() => document.querySelectorAll(".page-card").length === 8);

  assert.equal(await readFile(sourcePath, "utf8"), sourceBefore);
  assert.equal(await readFile(missingPath, "utf8"), missingBefore);
  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join("; ")}`);
  console.log(`Project import UI passed: ${repoRoot}`);
} finally {
  await browser?.close();
  await vite?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
}

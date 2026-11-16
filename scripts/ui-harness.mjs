import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function findAvailablePort(preferred) {
  for (let port = preferred; port < preferred + 100; port += 1) {
    const available = await new Promise((resolve) => {
      const probe = createServer();
      probe.once("error", () => resolve(false));
      probe.once("listening", () => probe.close(() => resolve(true)));
      probe.listen({ port, host: "127.0.0.1", exclusive: true });
    });
    if (available) return port;
  }
  throw new Error(`No free local port between ${preferred} and ${preferred + 99}.`);
}

export async function startVite({ port: preferredPort = 1420 } = {}) {
  const port = await findAvailablePort(preferredPort);
  let output = "";
  const viteCommand = resolve(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "vite.cmd" : "vite",
  );
  const server = spawn(
    viteCommand,
    ["--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, BROWSER: "none" },
      shell: process.platform === "win32",
    },
  );
  server.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const base = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) {
        throw new Error(`Vite exited before the UI test started.\n${output}`);
      }
      try {
        const response = await fetch(base);
        if (response.ok) break;
      } catch {
        // Keep waiting for Vite to listen.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
    if (Date.now() >= deadline) {
      throw new Error(`Vite did not start within 30 seconds.\n${output}`);
    }
  } catch (error) {
    if (server.exitCode === null) server.kill();
    throw error;
  }

  return {
    base,
    port,
    server,
    output: () => output,
    async stop() {
      if (server.exitCode !== null) return;
      server.kill();
      await new Promise((resolveWait) => setTimeout(resolveWait, 200));
    },
  };
}

export async function launchBrowser(options = {}) {
  try {
    return await chromium.launch(options);
  } catch (error) {
    throw new Error(
      `Could not launch Chromium. Run "npx playwright install chromium" once and try again.\n${error}`,
    );
  }
}

export async function waitForApp(page) {
  await page.locator(".app-shell").waitFor();
  await page.waitForFunction(
    () => !document.querySelector(".canvas-loading")?.classList.contains("is-visible"),
  );
  await page.waitForTimeout(350);
}

/** Lets fonts, animations and transitions reach their final state before a screenshot. */
export async function settlePage(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const animations = document.getAnimations?.() ?? [];
    await Promise.all(
      animations
        .filter((animation) => {
          const timing = animation.effect?.getComputedTiming?.();
          return timing?.endTime !== undefined && Number.isFinite(timing.endTime);
        })
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

export async function waitForToastsGone(page) {
  await page.waitForFunction(() => !document.querySelector(".toast"), null, { timeout: 7000 });
}

/**
 * Opens the deterministic demo project through the browser fallback. The
 * project starts as a recovery snapshot so no native file paths are required.
 */
export async function openDemoProject(page, { base } = {}) {
  if (!base) throw new Error("openDemoProject requires a base URL.");
  const projectPath = resolve(repoRoot, "fixtures", "demo-project.gridscalr");
  const pdfPath = resolve(repoRoot, "fixtures", "industrial-plan.pdf");
  const project = JSON.parse(await readFile(projectPath, "utf8"));

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator(".app-shell").waitFor();
  await page.evaluate(
    (payload) => {
      localStorage.setItem("gridscalr.autosave.v1", JSON.stringify(payload));
    },
    { project, projectPath: null, savedAt: new Date().toISOString() },
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Recovery center" }).waitFor();
  await page.getByRole("button", { name: "Recovery center" }).click();
  const recoveryDialog = page.getByRole("dialog", { name: "Recovery center" });
  await recoveryDialog.waitFor();
  const chooserPromise = page.waitForEvent("filechooser");
  await recoveryDialog.getByRole("button", { name: "Restore selected" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(pdfPath);

  await page.getByText(project.name).first().waitFor();
  await waitForApp(page);
  await waitForToastsGone(page);
  return project;
}

export async function openMarkupsItem(page, itemId, kind = "all") {
  const panel = page.locator(".markups-panel");
  if (!(await panel.isVisible())) {
    await page.locator(".tool-markups").click();
  }
  await panel.waitFor({ state: "visible" });
  // The table is virtualised; a row outside the rendered window cannot be
  // clicked. Reset the saved scroll so a helper always starts from the top.
  const wrap = panel.locator(".markups-table-wrap");
  if (await wrap.count()) await wrap.evaluate((node) => (node.scrollTop = 0));
  if (kind !== "all") {
    await panel.getByLabel("Filter markups by type").selectOption(kind);
  }

  await panel.locator(`[data-item-id="${itemId}"]`).click();
  await page.waitForTimeout(120);
  if (await panel.isVisible()) {
    await panel.getByRole("button", { name: "Close Markups list" }).click();
    await panel.waitFor({ state: "hidden" });
  }
  await waitForApp(page);
}

/**
 * Seeds one measurement-scope text field with a default value, so the field
 * editor, the inspector section and the accessibility gates have content to
 * inspect. It goes through the store, exactly like the editor does.
 */
export async function seedCustomField(page) {
  await page.evaluate(() => {
    const store = window.__gridscalr?.store;
    if (!store?.project) return;
    store.mutate((project) => {
      if (project.fieldDefinitions.some((field) => field.key === "fireClass")) return;
      project.fieldDefinitions.push(
        {
          id: "field_harness",
          key: "fireClass",
          label: "Fire class",
          type: "text",
          scope: "measurement",
          order: 0,
          defaultValue: "EI30",
        },
        {
          id: "field_harness_condition",
          key: "condition",
          label: "Condition",
          type: "enum",
          scope: "measurement",
          order: 1,
          options: [
            { id: "good", label: "Good" },
            { id: "repair", label: "Needs repair" },
          ],
          defaultValue: "good",
        },
      );
      project.fieldSets.push({
        id: "fset_harness",
        name: "Fire data",
        scope: "measurement",
        fieldIds: ["field_harness", "field_harness_condition"],
      });
    }, "change");
  });
  await settlePage(page);
}

/**
 * Opens the space register from the View menu and returns the dialog.
 */
export async function openSpacesRegister(page) {
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitem", { name: "Spaces…" }).click();
  const dialog = page.getByRole("dialog", { name: "Spaces" });
  await dialog.waitFor();
  return dialog;
}

/**
 * Seeds a small space register (building → floor → two rooms) and links the
 * demo's first area measurement to the first room, so the register, the area
 * badge and the accessibility gates have content to inspect.
 */
export async function seedSpaces(page) {
  await page.evaluate(() => {
    const store = window.__gridscalr?.store;
    if (!store?.project) return;
    store.mutate((project) => {
      if (project.spaces.length) return;
      const now = new Date().toISOString();
      const space = (id, kind, name, extra) => ({
        id,
        kind,
        name,
        areaMode: "measured",
        createdAt: now,
        updatedAt: now,
        ...extra,
      });
      const building = space("space_harness_building", "building", "Main building", {});
      const floor = space("space_harness_floor", "floor", "Ground floor", {
        parentId: building.id,
      });
      const kitchen = space("space_harness_kitchen", "room", "Kitchen", {
        parentId: floor.id,
        number: "101",
      });
      const storage = space("space_harness_storage", "room", "Storage", {
        parentId: floor.id,
        number: "102",
        areaMode: "manual",
        areaM2: 12.5,
      });
      project.spaces.push(building, floor, kitchen, storage);
      const item = project.layers
        .flatMap((layer) => layer.items)
        .find((entry) => entry.kind === "area");
      if (item) item.spaceId = kitchen.id;
    }, "change");
  });
  await settlePage(page);
}

/**
 * Seeds a measurement and a space schedule plus explicit summary roles, so the
 * summary cards, the live table, the builder and the role dialog all have
 * content to inspect in the browser gates.
 */
export async function seedSchedules(page) {
  await page.evaluate(() => {
    const store = window.__gridscalr?.store;
    if (!store?.project) return;
    store.mutate((project) => {
      const now = new Date().toISOString();
      const wall = project.categories.find((category) => category.name === "Wall");
      if (wall) wall.summaryRole = "wall";
      const door = project.countTypes?.find((type) => type.id === "door");
      if (door) door.summaryRole = "door";
      if (project.schedules.length) return;
      project.schedules.push(
        {
          id: "sched_harness_measure",
          name: "Wall schedule",
          source: "measurements",
          rowMode: "items",
          columns: [
            { id: "col_1", field: "label", visible: true, width: 22 },
            { id: "col_2", field: "category", visible: true, width: 14 },
            { id: "col_3", field: "value", visible: true, width: 14, format: "unit" },
            { id: "col_4", field: "unit", visible: true, width: 8 },
          ],
          filters: { itemKinds: ["length", "area"] },
          groupBy: "category",
          totals: [{ field: "value", op: "sum" }],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "sched_harness_spaces",
          name: "Room schedule",
          source: "spaces",
          rowMode: "items",
          columns: [
            { id: "col_1", field: "name", visible: true },
            { id: "col_2", field: "number", visible: true },
            { id: "col_3", field: "area", visible: true, format: "unit" },
          ],
          filters: {},
          totals: [{ field: "area", op: "sum" }],
          createdAt: now,
          updatedAt: now,
        },
      );
      const draw = project.layers.find((layer) => layer.kind === "draw");
      const page = project.pages[0];
      if (draw && page && !draw.items.some((item) => item.kind === "schedule")) {
        draw.items.push({
          id: "item_sched_harness",
          pageId: page.id,
          kind: "schedule",
          points: [
            { x: 520, y: 380 },
            { x: 880, y: 550 },
          ],
          color: draw.color,
          strokeWidth: 1,
          scheduleId: "sched_harness_measure",
          rowStart: 0,
          rowLimit: 8,
          showHeader: true,
          showTotals: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }, "change");
  });
  await settlePage(page);
}

/**
 * Opens the Place schedule dialog from the Summary tab with a stored schedule
 * selected, so the placement dialog is inspectable in the browser gates.
 */
export async function openSchedulePlacementDialog(page) {
  const summary = await openSummaryTab(page);
  await summary.locator(".schedules-schedule-select").selectOption("sched_harness_measure");
  await summary.getByRole("button", { name: "Place on drawing…" }).click();
  const dialog = page.getByRole("dialog", { name: "Place schedule on drawing" });
  await dialog.waitFor();
  return dialog;
}

/**
 * Opens the schedule CSV import dialog through the real file picker with one
 * changed label. The dry run has a changed row, a preview row and an enabled
 * apply action, so the accessibility, touch-target and UI-scale gates inspect
 * the full dialog rather than a blocked empty state.
 */
export async function openScheduleCsvImport(page) {
  const summary = await openSummaryTab(page);
  await summary.locator(".schedules-schedule-select").selectOption("sched_harness_measure");
  const itemId = await page.evaluate(() => {
    const project = window.__gridscalr?.store.project;
    if (!project) return "";
    for (const layer of project.layers) {
      const item = layer.items.find((entry) => entry.kind === "length" || entry.kind === "area");
      if (item) return item.id;
    }
    return "";
  });
  if (!itemId) throw new Error("the demo project has no measurement for the CSV import");
  const csv = `ID;Typ;Label [label]\r\n${itemId};item;Imported label\r\n`;
  const chooserPromise = page.waitForEvent("filechooser");
  await summary.getByRole("button", { name: "Import CSV…" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "schedule.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  const dialog = page.getByRole("dialog", { name: "Import schedule CSV" });
  await dialog.waitFor();
  return dialog;
}

/**
 * Selects the seeded placed table and shows Properties, so the placed-table
 * inspector section is inspectable after the Summary tab is closed.
 */
export async function openPlacedTableInspector(page) {
  await page.evaluate(() => {
    const store = window.__gridscalr?.store;
    const project = store?.project;
    if (!store || !project) return;
    const layer = project.layers.find((entry) =>
      entry.items.some((item) => item.id === "item_sched_harness"),
    );
    if (layer) store.setSelection({ layerId: layer.id, itemId: "item_sched_harness" });
  });
  const summary = page.locator(".schedules-panel");
  if (await summary.isVisible()) {
    await page.keyboard.press("Control+Alt+s");
    await summary.waitFor({ state: "detached" });
  }
  const section = page.locator(".selection-section");
  await section.waitFor({ state: "visible" });
  return section;
}

/**
 * Opens the Schedule builder from the Summary tab and returns the dialog.
 */
export async function openScheduleBuilder(page) {
  const summary = page.locator(".schedules-panel");
  if (!(await summary.isVisible())) {
    await page.keyboard.press("Control+Alt+s");
    await summary.waitFor({ state: "visible" });
  }
  await summary.getByRole("button", { name: "New schedule…" }).click();
  const dialog = page.getByRole("dialog", { name: "New schedule" });
  await dialog.waitFor();
  return dialog;
}

/**
 * Opens the Summary tab through the documented shortcut and returns the panel.
 */
export async function openSummaryTab(page) {
  const panel = page.locator(".schedules-panel");
  if (!(await panel.isVisible())) {
    await page.keyboard.press("Control+Alt+s");
    await panel.waitFor({ state: "visible" });
  }
  return panel;
}

/**
 * Closes Project settings after the field editor, which reopens it on the
 * Fields category. Tolerates no dialog, so it is safe after a direct close.
 */
export async function closeReopenedSettings(page) {
  const settings = page.getByRole("dialog", { name: "Project settings" });
  try {
    await settings.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    return false;
  }
  await page.keyboard.press("Escape");
  await settings.waitFor({ state: "detached" });
  return true;
}

/** Opens Project settings → Fields → Manage fields and returns the dialog. */
export async function openCustomFieldsDialog(page) {
  await page.keyboard.press("Control+,");
  const settings = page.getByRole("dialog", { name: "Project settings" });
  await settings.waitFor();
  await settings.getByRole("button", { name: "Fields", exact: true }).click();
  await settings.getByRole("button", { name: /Manage fields/ }).click();
  const dialog = page.getByRole("dialog", { name: "Custom fields" });
  await dialog.waitFor();
  return dialog;
}

/**
 * Builds a session reference project from the demo takeoff. The reference PDF
 * is embedded as a TIF-style document so the browser fallback can compare it
 * without native file paths.
 */
export async function makeReferenceProject() {
  const project = JSON.parse(
    await readFile(resolve(repoRoot, "fixtures", "demo-project.gridscalr"), "utf8"),
  );
  const pdf = await readFile(resolve(repoRoot, "fixtures", "industrial-plan.pdf"));
  const document = project.documents[0];
  project.name = `${project.name} — revision B`;
  project.documents = [
    {
      ...document,
      kind: "tiff",
      path: null,
      relativePath: null,
      embeddedPdf: pdf.toString("base64"),
      source: { format: "tiff", dpi: [300, 300], originalName: "industrial-plan.pdf" },
    },
  ];
  const measure = project.layers.find((layer) => layer.kind === "measure");
  const draw = project.layers.find((layer) => layer.kind === "draw");
  const changed = measure.items.find((item) => item.kind === "length") ?? measure.items[0];
  changed.label = `${changed.label ?? "Item"} — revised`;
  changed.color = "#ff3366";
  if (draw.items.length) draw.items.pop();
  const added = structuredClone(changed);
  added.id = "item_reference_added";
  added.points = added.points.map((point) => ({ x: point.x + 40, y: point.y + 20 }));
  added.label = "Reference-only measurement";
  measure.items.push(added);
  const directory = await mkdtemp(join(tmpdir(), "gridscalr-compare-"));
  const path = join(directory, "reference.gridscalr");
  await writeFile(path, JSON.stringify(project));
  return path;
}

/** Opens the revision comparison through File → Compare with revision…. */
export async function openCompareProject(page, path) {
  await page.getByRole("menuitem", { name: "File" }).click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "Compare with revision…" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(path);
  await page.locator(".compare-panel").waitFor();
  await waitForApp(page);
}
